"""Threads APIからインサイトデータを取得

フロー:
1. GET /me/threads で投稿一覧取得
2. 各投稿の GET /{media-id}/insights で個別メトリクス取得
3. キャッシュ保存（24時間有効）
"""
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import THREADS_ACCESS_TOKEN, THREADS_API_BASE

CACHE_PATH = Path(__file__).parent.parent / "data" / "threads_insights_cache.json"
CACHE_TTL_HOURS = 24


def _load_cache() -> list[dict] | None:
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
            return data.get("posts", [])
    except Exception:
        pass
    return None


def _save_cache(posts: list[dict]) -> None:
    """インサイトデータをキャッシュファイルに保存"""
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "cached_at": datetime.utcnow().isoformat(),
        "post_count": len(posts),
        "posts": posts,
    }
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def fetch_own_posts(max_results: int = 50) -> list[dict]:
    """自分のThreads投稿一覧を取得

    Args:
        max_results: 取得する最大件数（ページネーション対応）

    Returns:
        list[dict]: [{id, text, timestamp, permalink}, ...]
    """
    if not THREADS_ACCESS_TOKEN:
        return []

    posts = []
    url = f"{THREADS_API_BASE}/me/threads"
    params = {
        "fields": "id,text,timestamp,permalink,media_type",
        "limit": min(max_results, 100),
        "access_token": THREADS_ACCESS_TOKEN,
    }

    try:
        while len(posts) < max_results:
            response = requests.get(url, params=params, timeout=30)
            if response.status_code != 200:
                error = response.json().get("error", {})
                print(f"  Threads API エラー: {error.get('message', response.status_code)}")
                break

            data = response.json()
            batch = data.get("data", [])
            if not batch:
                break

            # テキスト投稿のみ対象（画像・動画は除外）
            for post in batch:
                if post.get("text"):
                    posts.append({
                        "id": post["id"],
                        "text": post.get("text", ""),
                        "timestamp": post.get("timestamp", ""),
                        "permalink": post.get("permalink", ""),
                    })

            # ページネーション
            paging = data.get("paging", {})
            next_cursor = paging.get("cursors", {}).get("after")
            if not next_cursor or len(batch) < params["limit"]:
                break

            params["after"] = next_cursor
            # URLパラメータをリセット（afterだけ更新）
            time.sleep(0.5)  # レート制限対策

    except requests.RequestException as e:
        print(f"  Threads API 接続エラー: {e}")

    return posts[:max_results]


def fetch_post_insights(post_id: str) -> dict:
    """個別投稿のインサイトを取得

    Args:
        post_id: Threads投稿ID

    Returns:
        dict: {likes: int, replies: int, reposts: int, quotes: int, views: int}
    """
    if not THREADS_ACCESS_TOKEN:
        return {}

    try:
        response = requests.get(
            f"{THREADS_API_BASE}/{post_id}/insights",
            params={
                "metric": "views,likes,replies,reposts,quotes",
                "access_token": THREADS_ACCESS_TOKEN,
            },
            timeout=15,
        )

        if response.status_code != 200:
            return {}

        metrics = {}
        for item in response.json().get("data", []):
            name = item.get("name", "")
            values = item.get("values", [])
            if values:
                metrics[name] = values[0].get("value", 0)

        return metrics

    except requests.RequestException:
        return {}


def fetch_posts_with_insights(max_results: int = 50) -> list[dict]:
    """投稿一覧 + 各投稿のインサイトを一括取得（キャッシュ対応）

    Returns:
        list[dict]: [{id, text, timestamp, permalink, likes, replies, reposts, quotes, views}, ...]
    """
    # キャッシュチェック
    cached = _load_cache()
    if cached is not None:
        print(f"  インサイト: キャッシュから{len(cached)}件読み込み")
        return cached

    if not THREADS_ACCESS_TOKEN:
        print("  インサイト: THREADS_ACCESS_TOKEN未設定")
        return []

    # 投稿一覧取得
    posts = fetch_own_posts(max_results=max_results)
    if not posts:
        print("  インサイト: 投稿が見つかりません")
        return []

    print(f"  インサイト: {len(posts)}件の投稿を取得、メトリクス取得中...")

    # 各投稿のインサイトを取得
    enriched = []
    for i, post in enumerate(posts):
        metrics = fetch_post_insights(post["id"])
        enriched.append({
            **post,
            "likes": metrics.get("likes", 0),
            "replies": metrics.get("replies", 0),
            "reposts": metrics.get("reposts", 0),
            "quotes": metrics.get("quotes", 0),
            "views": metrics.get("views", 0),
        })

        # レート制限対策（10件ごとに少し待機）
        if (i + 1) % 10 == 0:
            time.sleep(1)

    # キャッシュ保存
    _save_cache(enriched)
    print(f"  インサイト: {len(enriched)}件のメトリクス取得完了")

    return enriched
