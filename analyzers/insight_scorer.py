"""エンゲージメントスコア計算と投稿の分類

各投稿にスコアを付与し、上位（good）/ 中間（neutral）/ 下位（bad）に分類する。
"""
import numpy as np
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import GOOD_POST_PERCENTILE, BAD_POST_PERCENTILE


# デフォルトのパーセンタイル設定（settings.pyにない場合のフォールバック）
try:
    _good = GOOD_POST_PERCENTILE
    _bad = BAD_POST_PERCENTILE
except (ImportError, AttributeError):
    _good = 80
    _bad = 20


def calculate_engagement_score(post: dict) -> float:
    """エンゲージメントスコアを計算

    重み付け:
    - likes: ×1
    - replies: ×2（会話を生むのは価値が高い）
    - reposts: ×3（拡散力が最も高い）
    - quotes: ×2（引用も拡散の一種）
    - views: ×0.01（母数として参考）

    Returns:
        float: エンゲージメントスコア
    """
    likes = post.get("likes", 0)
    replies = post.get("replies", 0)
    reposts = post.get("reposts", 0)
    quotes = post.get("quotes", 0)
    views = post.get("views", 0)

    score = (
        likes * 1
        + replies * 2
        + reposts * 3
        + quotes * 2
        + views * 0.01
    )

    return score


def classify_posts(posts: list[dict]) -> list[dict]:
    """投稿をスコアで分類（good / neutral / bad）

    Args:
        posts: [{text, likes, replies, reposts, quotes, views, ...}, ...]

    Returns:
        list[dict]: 各投稿に engagement_score, quality_label が追加された辞書
    """
    if not posts:
        return []

    # スコア計算
    for post in posts:
        post["engagement_score"] = calculate_engagement_score(post)

    scores = [p["engagement_score"] for p in posts]

    if len(scores) < 3:
        # 3件未満なら全て neutral
        for post in posts:
            post["quality_label"] = "neutral"
        return posts

    # パーセンタイル計算
    good_threshold = float(np.percentile(scores, _good))
    bad_threshold = float(np.percentile(scores, _bad))

    for post in posts:
        score = post["engagement_score"]
        if score >= good_threshold:
            post["quality_label"] = "good"
        elif score <= bad_threshold:
            post["quality_label"] = "bad"
        else:
            post["quality_label"] = "neutral"

    # スコア降順でソート
    posts.sort(key=lambda x: x["engagement_score"], reverse=True)

    return posts


def format_analysis_report(posts: list[dict]) -> str:
    """分類結果をレポートテキストに整形"""
    good = [p for p in posts if p.get("quality_label") == "good"]
    bad = [p for p in posts if p.get("quality_label") == "bad"]
    neutral = [p for p in posts if p.get("quality_label") == "neutral"]

    lines = [
        f"## エンゲージメント分析（{len(posts)}件）",
        f"- 上位（good）: {len(good)}件",
        f"- 中間（neutral）: {len(neutral)}件",
        f"- 下位（bad）: {len(bad)}件",
    ]

    if good:
        lines.append("\n### トップ投稿")
        for p in good[:5]:
            score = p.get("engagement_score", 0)
            text = p.get("text", "")[:80]
            likes = p.get("likes", 0)
            reposts = p.get("reposts", 0)
            lines.append(f"- [Score:{score:.0f} ♥{likes} ↻{reposts}] {text}")

    return "\n".join(lines)
