"""Threads API 2ステップ投稿

Step 1: メディアコンテナ作成
Step 2: 公開（30秒待機後）
"""
import time
import json
from pathlib import Path

import requests

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import THREADS_ACCESS_TOKEN, THREADS_USER_ID, THREADS_API_BASE


CONTAINER_LOG_PATH = Path(__file__).parent.parent / "data" / "pending_containers.json"


def _save_pending_container(container_id: str, text: str):
    """未公開コンテナをログに保存（孤立コンテナ対策）"""
    CONTAINER_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    pending = _load_pending_containers()
    pending.append({
        "container_id": container_id,
        "text_preview": text[:50],
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    with open(CONTAINER_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)


def _load_pending_containers() -> list:
    """未公開コンテナのリストを読み込み"""
    if not CONTAINER_LOG_PATH.exists():
        return []
    with open(CONTAINER_LOG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _remove_pending_container(container_id: str):
    """公開済みコンテナをログから削除"""
    pending = _load_pending_containers()
    pending = [c for c in pending if c["container_id"] != container_id]
    with open(CONTAINER_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)


def create_container(text: str, media_type: str = "TEXT") -> dict:
    """Step 1: メディアコンテナを作成

    Args:
        text: 投稿テキスト
        media_type: TEXT / IMAGE / VIDEO

    Returns:
        dict: {"success": bool, "container_id": str, "error": str}
    """
    if not THREADS_ACCESS_TOKEN or not THREADS_USER_ID:
        return {"success": False, "error": "THREADS_ACCESS_TOKEN または THREADS_USER_ID 未設定"}

    try:
        response = requests.post(
            f"{THREADS_API_BASE}/{THREADS_USER_ID}/threads",
            params={
                "media_type": media_type,
                "text": text,
                "access_token": THREADS_ACCESS_TOKEN,
            },
            timeout=30,
        )

        if response.status_code == 200:
            data = response.json()
            container_id = data.get("id", "")
            _save_pending_container(container_id, text)
            return {"success": True, "container_id": container_id}
        else:
            error_data = response.json().get("error", {})
            return {
                "success": False,
                "error": error_data.get("message", f"HTTP {response.status_code}"),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def publish_container(container_id: str) -> dict:
    """Step 2: コンテナを公開

    Args:
        container_id: Step 1で取得したコンテナID

    Returns:
        dict: {"success": bool, "post_id": str, "error": str}
    """
    if not THREADS_ACCESS_TOKEN or not THREADS_USER_ID:
        return {"success": False, "error": "THREADS_ACCESS_TOKEN または THREADS_USER_ID 未設定"}

    try:
        response = requests.post(
            f"{THREADS_API_BASE}/{THREADS_USER_ID}/threads_publish",
            params={
                "creation_id": container_id,
                "access_token": THREADS_ACCESS_TOKEN,
            },
            timeout=30,
        )

        if response.status_code == 200:
            data = response.json()
            post_id = data.get("id", "")
            _remove_pending_container(container_id)
            return {"success": True, "post_id": post_id}
        else:
            error_data = response.json().get("error", {})
            return {
                "success": False,
                "error": error_data.get("message", f"HTTP {response.status_code}"),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def post_to_threads(text: str, wait_seconds: int = 30) -> dict:
    """テキストをThreadsに投稿（2ステップ一括）

    Args:
        text: 投稿テキスト
        wait_seconds: コンテナ作成後の待機秒数（デフォルト30秒）

    Returns:
        dict: {"success": bool, "post_id": str, "error": str}
    """
    # Step 1: コンテナ作成
    container_result = create_container(text)
    if not container_result["success"]:
        return container_result

    container_id = container_result["container_id"]
    print(f"  コンテナ作成完了 (ID: {container_id})")
    print(f"  {wait_seconds}秒待機中...")

    # 待機
    time.sleep(wait_seconds)

    # Step 2: 公開
    publish_result = publish_container(container_id)
    if publish_result["success"]:
        print(f"  投稿完了! (Post ID: {publish_result['post_id']})")
    else:
        print(f"  公開失敗: {publish_result.get('error', '')}")
        print(f"  ※ コンテナID {container_id} は pending_containers.json に保存済み")

    return publish_result
