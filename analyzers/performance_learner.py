"""自分の投稿パフォーマンスから学習し、次の投稿生成に活かすフィードバックループ

処理フロー:
1. Threads APIから直近投稿 + インサイトを取得
2. エンゲージメントスコアで分類
3. Geminiに分析させてパターンを抽出
4. プロンプト注入用テキストを生成
5. キャッシュ保存（24時間有効）
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import GEMINI_API_KEY, GEMINI_MODEL

CACHE_PATH = Path(__file__).parent.parent / "data" / "performance_analysis.json"
CACHE_TTL_HOURS = 24


def _load_cache() -> dict | None:
    """キャッシュを読み込み、有効期限内ならそのまま返す"""
    if not CACHE_PATH.exists():
        return None
    try:
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_at_str = data.get("cached_at", "")
        if not cached_at_str:
            return None
        cached_at = datetime.fromisoformat(cached_at_str)
        if cached_at.tzinfo is not None:
            cached_at = cached_at.replace(tzinfo=None)
        elapsed = datetime.utcnow() - cached_at
        if elapsed < timedelta(hours=CACHE_TTL_HOURS):
            return data
    except Exception:
        pass
    return None


def _save_cache(analysis_text: str) -> None:
    """分析結果をキャッシュファイルに保存"""
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "cached_at": datetime.utcnow().isoformat(),
        "analysis_text": analysis_text,
    }
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _build_simple_analysis(good_posts: list[dict], bad_posts: list[dict]) -> str:
    """Gemini不要の簡易分析テキストを生成"""
    lines = ["## あなたのThreads投稿パフォーマンス分析（簡易版）"]

    if good_posts:
        lines.append("\n### エンゲージメントが高かった投稿（上位）")
        for p in good_posts[:5]:
            score = p.get("engagement_score", 0)
            text = p.get("text", "")[:100]
            likes = p.get("likes", 0)
            reposts = p.get("reposts", 0)
            lines.append(f"- [Score:{score:.0f} ♥{likes} ↻{reposts}] {text}")
    else:
        lines.append("\n### エンゲージメントが高かった投稿\n- データなし")

    if bad_posts:
        lines.append("\n### エンゲージメントが低かった投稿（下位）")
        for p in bad_posts[:3]:
            score = p.get("engagement_score", 0)
            text = p.get("text", "")[:100]
            lines.append(f"- [Score:{score:.0f}] {text}")

    lines.append("\n### ヒント")
    lines.append("上位の投稿に共通するパターン（テーマ・構造・トーン）を参考にしてください。")

    return "\n".join(lines)


def _build_gemini_analysis(good_posts: list[dict], bad_posts: list[dict]) -> str:
    """Gemini APIで投稿パフォーマンスを分析"""
    from google import genai

    if not GEMINI_API_KEY:
        return ""

    # 分析用プロンプト構築
    good_texts = []
    for p in good_posts[:5]:
        likes = p.get("likes", 0)
        reposts = p.get("reposts", 0)
        replies = p.get("replies", 0)
        good_texts.append(f"[♥{likes} ↻{reposts} 💬{replies}] {p.get('text', '')}")

    bad_texts = []
    for p in bad_posts[:5]:
        likes = p.get("likes", 0)
        reposts = p.get("reposts", 0)
        replies = p.get("replies", 0)
        bad_texts.append(f"[♥{likes} ↻{reposts} 💬{replies}] {p.get('text', '')}")

    prompt = f"""以下は同一ユーザーのThreads投稿データです。エンゲージメントが高い投稿と低い投稿を比較分析してください。

## エンゲージメントが高い投稿（上位）
{chr(10).join(good_texts)}

## エンゲージメントが低い投稿（下位）
{chr(10).join(bad_texts)}

## 分析してほしいこと
1. 高エンゲージメント投稿に共通するパターン（テーマ・構造・トーン・書き出し）
2. 低エンゲージメント投稿に共通する問題点
3. 次の投稿生成で意識すべきポイント（3つ以内）

簡潔にまとめてください（300文字以内）。"""

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )

        analysis = response.text.strip()
        if analysis:
            return f"## あなたのThreads投稿パフォーマンス分析\n\n{analysis}"
    except Exception as e:
        print(f"  パフォーマンス分析（Gemini）エラー: {e}")

    return ""


def analyze_own_performance() -> str:
    """自分のThreads投稿パフォーマンスを分析し、プロンプト注入用テキストを返す

    Returns:
        str: プロンプト注入用テキスト。データ不足なら空文字。
    """
    # キャッシュが有効なら再利用
    cached = _load_cache()
    if cached is not None:
        return cached.get("analysis_text", "")

    # インサイトデータ取得
    try:
        from collectors.threads_insights import fetch_posts_with_insights
        posts = fetch_posts_with_insights(max_results=50)
    except Exception as e:
        print(f"  パフォーマンス学習: インサイト取得失敗 ({e})")
        return ""

    if not posts:
        return ""

    # スコアリング・分類
    try:
        from analyzers.insight_scorer import classify_posts
        classified = classify_posts(posts)
    except Exception as e:
        print(f"  パフォーマンス学習: 分類失敗 ({e})")
        return ""

    good_posts = [p for p in classified if p.get("quality_label") == "good"]
    bad_posts = [p for p in classified if p.get("quality_label") == "bad"]

    # 投稿数が少ない or good/badが十分でない → 簡易分析
    use_gemini = len(posts) >= 10 and len(good_posts) >= 3 and len(bad_posts) >= 3

    analysis_text = ""
    if use_gemini:
        try:
            analysis_text = _build_gemini_analysis(good_posts, bad_posts)
        except Exception:
            pass

    # Gemini分析が空 or 使わない場合は簡易版
    if not analysis_text:
        analysis_text = _build_simple_analysis(good_posts, bad_posts)

    if not analysis_text:
        return ""

    # キャッシュ保存
    try:
        _save_cache(analysis_text)
    except Exception:
        pass

    return analysis_text
