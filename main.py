"""Threads投稿自動生成パイプライン - エントリーポイント

YouTube台本をインプットに、Threads投稿案を生成・保存する。
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import argparse
from datetime import datetime

from collectors.script_loader import load_script, load_from_stdin
from analyzers.duplicate_detector import format_used_themes_for_prompt
from generators.post_generator import generate_posts, format_drafts_for_review
from outputs.csv_writer import save_drafts
from outputs.sheets_writer import save_drafts_to_sheet


def run_pipeline(
    script_path: str = None,
    use_stdin: bool = False,
    skip_insights: bool = False,
):
    """メインパイプラインを実行"""
    print(f"=== Threads投稿生成パイプライン開始 ({datetime.now().strftime('%Y-%m-%d %H:%M %A')}) ===\n")

    # ── 1. 台本読み込み ──
    print("Phase 1: 台本読み込み")

    script_data = None
    if use_stdin:
        try:
            script_data = load_from_stdin()
            print(f"  標準入力から読み込み: {script_data['title'][:50]}")
        except Exception as e:
            print(f"  標準入力読み込み失敗: {e}")
            return []
    else:
        try:
            script_data = load_script(file_path=script_path)
            if script_data:
                print(f"  台本: {script_data['title'][:50]} ({script_data['source_path']})")
            else:
                print("  台本が見つかりません。data/scripts/ にテキストファイルを配置してください。")
                return []
        except Exception as e:
            print(f"  台本読み込み失敗: {e}")
            return []

    # ── 2. 分析 ──
    print("\nPhase 2: 分析")

    used_themes = format_used_themes_for_prompt()
    if used_themes:
        print(f"  過去テーマ: {used_themes.count(chr(10)) + 1}件")
    else:
        print("  過去テーマ: なし（初回実行）")

    # パフォーマンス学習
    performance_insights = ""
    if not skip_insights:
        try:
            from analyzers.performance_learner import analyze_own_performance
            performance_insights = analyze_own_performance()
            if performance_insights:
                print("  パフォーマンス学習: 分析完了")
            else:
                print("  パフォーマンス学習: データ不足（スキップ）")
        except Exception as e:
            print(f"  パフォーマンス学習: {e}")

    # ── 3. 投稿生成 ──
    print("\nPhase 3: 投稿生成")

    all_drafts = {}
    all_flat = []

    try:
        print("  生成中...")
        all_drafts = generate_posts(
            script_content=script_data["content"],
            script_title=script_data["title"],
            used_themes=used_themes,
            performance_insights=performance_insights,
        )

        # source_detail を付与 & フラットリスト作成
        for key, drafts in all_drafts.items():
            detail = script_data["title"][:50] if key == "script" else "CTA"
            for d in drafts:
                d["source_detail"] = detail
            all_flat.extend(drafts)

        print(f"  合計: {len(all_flat)}案生成")
    except Exception as e:
        print(f"  生成失敗: {e}")
        import traceback
        traceback.print_exc()

    # ── 4. 保存 ──
    print("\nPhase 4: 保存")

    if all_flat:
        # スプシ保存
        try:
            result = save_drafts_to_sheet(all_flat)
            if result.get("status") == "ok":
                print(f"  スプシ保存: {result.get('count', 0)}件追記")
            elif result.get("status") == "skipped":
                print(f"  スプシ保存: スキップ（GAS_WEBAPP_URL未設定）")
            else:
                print(f"  スプシ保存: エラー ({result.get('message', '')})")
        except Exception as e:
            print(f"  スプシ保存: 失敗 ({e})")

        csv_path = save_drafts(all_flat)
        print(f"  CSVバックアップ: {csv_path}")

    # ── 出力 ──
    print("\n" + "=" * 50)
    if all_drafts:
        print(format_drafts_for_review(all_drafts))
    else:
        print("下書きが生成されませんでした。")

    print(f"\n=== パイプライン完了 ({datetime.now().strftime('%H:%M')}) ===")

    return all_flat


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Threads投稿自動生成パイプライン")
    parser.add_argument("--script", type=str, help="YouTube台本ファイルのパス")
    parser.add_argument("--stdin", action="store_true", help="標準入力から台本を読み込み")
    parser.add_argument("--skip-insights", action="store_true", help="パフォーマンス学習をスキップ")
    args = parser.parse_args()

    run_pipeline(
        script_path=args.script,
        use_stdin=args.stdin,
        skip_insights=args.skip_insights,
    )
