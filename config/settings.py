"""設定値の集中管理"""
import os
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# .env読み込み
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def _get_windows_user_env(name: str) -> str:
    """Windowsユーザー環境変数から値を取得（Git Bashなどで未継承の場合のフォールバック）"""
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             f"[System.Environment]::GetEnvironmentVariable('{name}', 'User')"],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def _env(name: str, default: str = "") -> str:
    """環境変数を取得。未設定ならWindowsユーザー環境変数にフォールバック"""
    value = os.getenv(name, "")
    if not value:
        value = _get_windows_user_env(name)
    return value or default


# === Threads API (Meta) ===
THREADS_APP_ID = os.getenv("THREADS_APP_ID", "")
THREADS_APP_SECRET = os.getenv("THREADS_APP_SECRET", "")
THREADS_ACCESS_TOKEN = os.getenv("THREADS_ACCESS_TOKEN", "")
THREADS_USER_ID = os.getenv("THREADS_USER_ID", "")
THREADS_API_BASE = "https://graph.threads.net/v1.0"

# === Google Gemini ===
GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# === Google Apps Script (Spreadsheet output) ===
GAS_WEBAPP_URL = os.getenv("GAS_WEBAPP_URL", "")

# === Paths ===
DATA_DIR = PROJECT_ROOT / "data"
SCRIPTS_DIR = DATA_DIR / "scripts"
DRAFTS_CSV_PATH = DATA_DIR / "drafts.csv"
STYLE_DIR = PROJECT_ROOT / "config"
PROMPTS_DIR = PROJECT_ROOT / "prompts"

# === Post Generation ===
MAX_POST_LENGTH = int(os.getenv("MAX_POST_LENGTH", "500"))
DRAFT_COUNT = int(os.getenv("DRAFT_COUNT", "3"))
DEDUP_LOOKBACK_DAYS = 14

# === Performance Learning ===
GOOD_POST_PERCENTILE = int(os.getenv("GOOD_POST_PERCENTILE", "80"))
BAD_POST_PERCENTILE = int(os.getenv("BAD_POST_PERCENTILE", "20"))
INSIGHT_ANALYSIS_DAYS = int(os.getenv("INSIGHT_ANALYSIS_DAYS", "30"))

# === CTA Settings ===
CTA_FREQUENCY = int(os.getenv("CTA_FREQUENCY", "5"))
CTA_URL = os.getenv("CTA_URL", "")
CTA_SERVICE_NAME = os.getenv("CTA_SERVICE_NAME", "")
CTA_SERVICE_DESC = os.getenv("CTA_SERVICE_DESC", "")

# === Notification ===
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
