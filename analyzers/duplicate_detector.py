"""過去に生成した投稿テーマとの重複を検知し、プロンプトに注入するテキストを生成"""
import csv
from datetime import datetime, timedelta
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import DRAFTS_CSV_PATH, DEDUP_LOOKBACK_DAYS


def get_recent_themes(days: int = None) -> list[dict]:
    """drafts.csv を読んで、直近N日の下書きを返す"""
    if days is None:
        days = DEDUP_LOOKBACK_DAYS
    csv_path = Path(DRAFTS_CSV_PATH)

    if not csv_path.exists():
        return []

    cutoff = datetime.now() - timedelta(days=days)
    results = []

    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                generated_at_str = row.get("generated_at", "").strip()
                if not generated_at_str:
                    continue

                try:
                    generated_at = datetime.fromisoformat(generated_at_str)
                except ValueError:
                    try:
                        generated_at = datetime.strptime(generated_at_str, "%Y-%m-%d %H:%M")
                    except ValueError:
                        continue

                if generated_at < cutoff:
                    continue

                content = row.get("content", "")
                reasoning = row.get("reasoning", "")

                results.append({
                    "date": generated_at.strftime("%Y-%m-%d"),
                    "content_preview": content[:30],
                    "reasoning": reasoning,
                })
    except (OSError, csv.Error):
        return []

    results.sort(key=lambda x: x["date"], reverse=True)
    return results


def format_used_themes_for_prompt(days: int = None) -> str:
    """直近N日の使用済みテーマをプロンプト注入用テキストに整形"""
    themes = get_recent_themes(days=days)

    if not themes:
        return ""

    lines = []
    for item in themes:
        date_str = item["date"]
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            month_day = f"{dt.month}/{dt.day}"
        except ValueError:
            month_day = date_str

        reasoning = item["reasoning"].strip()
        content_preview = item["content_preview"].strip()

        theme_label = reasoning if reasoning else content_preview
        if not theme_label:
            continue

        lines.append(f"- {month_day}: {theme_label}")

    return "\n".join(lines)
