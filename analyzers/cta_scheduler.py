"""CTA投稿の頻度管理

CTA_FREQUENCY 回に 1 回、CTA 投稿を生成に含める。
"""
import csv
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import (
    DRAFTS_CSV_PATH,
    CTA_FREQUENCY,
    CTA_URL,
    CTA_SERVICE_NAME,
    CTA_SERVICE_DESC,
)


def _count_past_generation_days() -> int:
    """drafts.csv に記録された生成日のユニーク数を返す"""
    if not CTA_URL:
        return 0

    csv_path = Path(DRAFTS_CSV_PATH)
    if not csv_path.exists():
        return 0

    dates: set[str] = set()
    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                generated_at = row.get("generated_at", "").strip()
                if generated_at:
                    date_part = generated_at.split(" ")[0]
                    if date_part:
                        dates.add(date_part)
    except Exception:
        return 0

    return len(dates)


def should_include_cta() -> bool:
    """今回の生成で CTA 投稿を含めるべきか判定"""
    if not CTA_URL:
        return False
    if CTA_FREQUENCY <= 0:
        return False

    past_days = _count_past_generation_days()
    return past_days % CTA_FREQUENCY == 0


def get_cta_prompt_section() -> str:
    """CTA 投稿用のプロンプトセクションを返す"""
    if not CTA_URL:
        return ""

    return f"""
## CTA投稿（1案）
以下の条件でCTA投稿を1案追加で生成してください:
- 価値提供の延長線上で自然にCTAを入れる（売り込み感を出さない）
- パターン例:
  A. 「この考え方について詳しくは○○で配信中」型
  B. 「実践してみたい人はプロフィールのリンクから」型
  C. 「同じ志を持つ仲間と繋がりたい方は→」型
- サービス情報: {CTA_SERVICE_NAME}（{CTA_SERVICE_DESC}）
- 誘導先: {CTA_URL}
- 押し売り感ゼロ、あくまで「興味があれば」のスタンス
- 禁止: URLをそのまま本文に埋め込まない（「プロフィールのリンク」等で誘導）
- JSON形式で "cta" キーに1案: {{"content": "投稿文", "reasoning": "理由"}}
"""
