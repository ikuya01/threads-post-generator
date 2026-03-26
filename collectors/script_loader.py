"""YouTube台本の読み込み

インプット方式:
1. data/scripts/ フォルダ内のテキストファイル（最新のものを自動選択）
2. コマンドライン引数でファイルパスを指定
3. 標準入力からペースト
"""
import os
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import SCRIPTS_DIR


def load_from_file(file_path: str) -> dict:
    """指定ファイルから台本を読み込み

    Returns:
        dict: {"title": str, "content": str, "source_path": str}
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"ファイルが見つかりません: {file_path}")

    content = path.read_text(encoding="utf-8")
    title = path.stem  # ファイル名（拡張子なし）をタイトルに

    return {
        "title": title,
        "content": content,
        "source_path": str(path),
    }


def load_latest_from_scripts_dir() -> dict | None:
    """data/scripts/ フォルダから最新のテキストファイルを読み込み

    Returns:
        dict | None: {"title": str, "content": str, "source_path": str}
    """
    scripts_dir = Path(SCRIPTS_DIR)
    if not scripts_dir.exists():
        scripts_dir.mkdir(parents=True, exist_ok=True)
        return None

    # .txt, .md ファイルを更新日時順で取得
    files = []
    for ext in ("*.txt", "*.md"):
        files.extend(scripts_dir.glob(ext))

    if not files:
        return None

    # 最新ファイルを選択
    latest = max(files, key=lambda f: f.stat().st_mtime)

    return load_from_file(str(latest))


def load_from_stdin() -> dict:
    """標準入力からテキストを読み込み

    Returns:
        dict: {"title": str, "content": str, "source_path": "stdin"}
    """
    print("YouTube台本を貼り付けてください（入力完了後、空行を入力してCtrl+D or Ctrl+Z）:")
    lines = []
    try:
        while True:
            line = input()
            lines.append(line)
    except EOFError:
        pass

    content = "\n".join(lines)
    if not content.strip():
        raise ValueError("入力が空です")

    # タイトルは最初の行から推測
    first_line = content.strip().split("\n")[0][:50]
    title = first_line if first_line else f"script_{datetime.now().strftime('%Y%m%d_%H%M')}"

    return {
        "title": title,
        "content": content,
        "source_path": "stdin",
    }


def load_script(file_path: str = None) -> dict | None:
    """台本を読み込み（統合インターフェース）

    優先順位:
    1. file_path が指定されていればそのファイル
    2. data/scripts/ フォルダの最新ファイル

    Returns:
        dict | None: {"title": str, "content": str, "source_path": str}
    """
    if file_path:
        return load_from_file(file_path)

    return load_latest_from_scripts_dir()
