"""下書きをCSVファイルに蓄積"""
import csv
from datetime import datetime
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import DRAFTS_CSV_PATH


HEADERS = ["generated_at", "draft_no", "content", "char_count", "source", "source_detail", "reasoning", "status"]


def save_drafts(drafts: list[dict], source_info: dict = None) -> Path:
    """下書きをCSVに追記"""
    source_info = source_info or {}
    DRAFTS_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_exists = DRAFTS_CSV_PATH.exists()

    with open(DRAFTS_CSV_PATH, "a", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow(HEADERS)

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        for i, draft in enumerate(drafts, 1):
            content = draft.get("content", "")
            writer.writerow([
                now,
                i,
                content,
                len(content),
                draft.get("source", source_info.get("source", "")),
                draft.get("source_detail", source_info.get("source_detail", "")),
                draft.get("reasoning", ""),
                "未投稿",
            ])

    return DRAFTS_CSV_PATH
