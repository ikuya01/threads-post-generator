"""Google Apps Script Webアプリ経由でスプレッドシートに下書きを保存"""
import json
from datetime import datetime
from pathlib import Path

import requests

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import GAS_WEBAPP_URL


def save_drafts_to_sheet(drafts: list[dict], source_info: dict = None) -> dict:
    """下書きをスプレッドシートに追記"""
    if not GAS_WEBAPP_URL:
        print("  [WARN] GAS_WEBAPP_URL未設定 - スプシ保存スキップ")
        return {"status": "skipped", "message": "GAS_WEBAPP_URL not set"}

    source_info = source_info or {}
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    payload = {
        "timestamp": now,
        "drafts": [
            {
                "draft_no": i + 1,
                "content": d.get("content", ""),
                "char_count": len(d.get("content", "")),
                "source": d.get("source", source_info.get("source", "")),
                "source_detail": d.get("source_detail", source_info.get("source_detail", "")),
                "reasoning": d.get("reasoning", ""),
            }
            for i, d in enumerate(drafts)
        ],
    }

    try:
        response = requests.post(
            GAS_WEBAPP_URL,
            json=payload,
            timeout=30,
            headers={"Content-Type": "application/json"},
        )
    except requests.exceptions.SSLError:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        response = requests.post(
            GAS_WEBAPP_URL,
            json=payload,
            timeout=30,
            headers={"Content-Type": "application/json"},
            verify=False,
        )

    return response.json()
