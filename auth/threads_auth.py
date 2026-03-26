"""Threads API認証・トークン管理

Meta OAuth 2.0のlong-lived token（60日有効）を管理する。
- トークンの有効性チェック
- トークンのリフレッシュ（延長）
- トークン情報の表示
"""
import os
import json
from datetime import datetime
from pathlib import Path

import requests

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import (
    THREADS_ACCESS_TOKEN,
    THREADS_APP_SECRET,
    THREADS_API_BASE,
    PROJECT_ROOT,
)

TOKEN_INFO_PATH = PROJECT_ROOT / "data" / "token_info.json"


def get_token() -> str:
    """現在のアクセストークンを取得"""
    return THREADS_ACCESS_TOKEN


def check_token_validity() -> dict:
    """トークンの有効性を確認

    Returns:
        dict: {"valid": bool, "user_id": str, "expires_in": int, "error": str}
    """
    token = get_token()
    if not token:
        return {"valid": False, "error": "THREADS_ACCESS_TOKEN未設定"}

    try:
        response = requests.get(
            f"{THREADS_API_BASE}/me",
            params={
                "fields": "id,username,threads_profile_picture_url",
                "access_token": token,
            },
            timeout=10,
        )

        if response.status_code == 200:
            data = response.json()
            return {
                "valid": True,
                "user_id": data.get("id", ""),
                "username": data.get("username", ""),
            }
        else:
            error_data = response.json().get("error", {})
            return {
                "valid": False,
                "error": error_data.get("message", f"HTTP {response.status_code}"),
            }
    except Exception as e:
        return {"valid": False, "error": str(e)}


def refresh_token() -> dict:
    """long-lived tokenをリフレッシュ（60日延長）

    Returns:
        dict: {"success": bool, "new_token": str, "expires_in": int, "error": str}
    """
    token = get_token()
    if not token:
        return {"success": False, "error": "THREADS_ACCESS_TOKEN未設定"}

    try:
        response = requests.get(
            f"{THREADS_API_BASE}/refresh_access_token",
            params={
                "grant_type": "th_refresh_token",
                "access_token": token,
            },
            timeout=10,
        )

        if response.status_code == 200:
            data = response.json()
            new_token = data.get("access_token", "")
            expires_in = data.get("expires_in", 0)

            # トークン情報をローカルに保存（参考用）
            _save_token_info(new_token, expires_in)

            return {
                "success": True,
                "new_token": new_token,
                "expires_in": expires_in,
                "expires_in_days": expires_in // 86400,
            }
        else:
            error_data = response.json().get("error", {})
            return {
                "success": False,
                "error": error_data.get("message", f"HTTP {response.status_code}"),
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _save_token_info(token: str, expires_in: int):
    """トークン情報をローカルファイルに保存（参考用）"""
    TOKEN_INFO_PATH.parent.mkdir(parents=True, exist_ok=True)
    info = {
        "refreshed_at": datetime.now().isoformat(),
        "expires_in_seconds": expires_in,
        "expires_in_days": expires_in // 86400,
        "token_prefix": token[:20] + "..." if len(token) > 20 else token,
    }
    with open(TOKEN_INFO_PATH, "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)


def print_token_status():
    """トークンの状態を表示"""
    result = check_token_validity()
    if result["valid"]:
        print(f"  トークン: 有効 (user: @{result.get('username', 'unknown')})")

        # ローカルのトークン情報があれば表示
        if TOKEN_INFO_PATH.exists():
            with open(TOKEN_INFO_PATH, "r", encoding="utf-8") as f:
                info = json.load(f)
            print(f"  最終リフレッシュ: {info.get('refreshed_at', '不明')}")
            print(f"  残り有効期間: 約{info.get('expires_in_days', '?')}日")
    else:
        print(f"  トークン: 無効 ({result.get('error', '不明なエラー')})")
