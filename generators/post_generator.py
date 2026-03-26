"""Gemini APIを使ってThreads投稿を生成

YouTube台本をインプットに、カスタマイズ可能な文体で投稿案を生成。
"""
import json
import random
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader

from google import genai

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from config.settings import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MAX_POST_LENGTH,
    DRAFT_COUNT,
    STYLE_DIR,
    PROMPTS_DIR,
)
from analyzers.cta_scheduler import should_include_cta, get_cta_prompt_section


def _load_style() -> dict:
    """文体設定を読み込み（style_user.yaml 優先、なければ style_default.yaml）"""
    user_style = STYLE_DIR / "style_user.yaml"
    default_style = STYLE_DIR / "style_default.yaml"

    style_path = user_style if user_style.exists() else default_style
    with open(style_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _build_system_prompt(style: dict) -> str:
    """文体設定からシステムプロンプトを構築"""
    parts = [
        f"あなたはThreads投稿を生成するアシスタントです。",
        f"トーン: {style.get('tone', 'カジュアル')}",
        f"文字数: {style.get('max_length', MAX_POST_LENGTH)}文字以内",
    ]

    # 構造
    structure = style.get("structure", {})
    if structure:
        parts.append("\n## 投稿の構造")
        if structure.get("opening") and structure["opening"] != "自由":
            parts.append(f"書き出し: {structure['opening']}")
        if structure.get("body"):
            parts.append(f"本文: {structure['body']}")
        if structure.get("closing") and structure["closing"] != "自由":
            parts.append(f"締め: {structure['closing']}")

    # 禁止事項
    prohibited = style.get("prohibited", [])
    if prohibited:
        parts.append("\n## 禁止事項")
        for item in prohibited:
            parts.append(f"- {item}")

    # ハッシュタグ
    hashtag = style.get("hashtag", {})
    if hashtag.get("enabled"):
        parts.append("\n## ハッシュタグ")
        parts.append("Threadsは1投稿1個まで。適切なハッシュタグを1つ付ける。")
        candidates = hashtag.get("candidates", [])
        if candidates:
            parts.append(f"候補: {', '.join(candidates)}")
    else:
        parts.append("\nハッシュタグは付けない。")

    # お手本
    examples = style.get("examples", [])
    if examples:
        parts.append("\n## お手本（このトーンと構造を参考にする）")
        for ex in examples:
            parts.append(f"「{ex}」")

    return "\n".join(parts)


def _get_client():
    return genai.Client(api_key=GEMINI_API_KEY)


def _parse_json_response(text: str) -> list | dict:
    """Geminiの応答からJSON配列/オブジェクトを抽出"""
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]
    return json.loads(text.strip())


def _generate(prompt: str, system_prompt: str) -> list | dict:
    """共通の生成ロジック"""
    if not GEMINI_API_KEY:
        return [{"content": "（GEMINI_API_KEY未設定）", "reasoning": "APIキーを設定してください"}]

    client = _get_client()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai.types.GenerateContentConfig(system_instruction=system_prompt),
    )

    try:
        return _parse_json_response(response.text)
    except (json.JSONDecodeError, IndexError):
        return [{"content": response.text[:MAX_POST_LENGTH], "reasoning": "JSON解析失敗"}]


def generate_posts(
    script_content: str,
    script_title: str = "",
    used_themes: str = "",
    performance_insights: str = "",
) -> dict[str, list[dict]]:
    """YouTube台本からThreads投稿案を生成

    Returns:
        dict: {"script": [投稿案リスト], "cta": [CTA投稿]}
    """
    style = _load_style()
    system_prompt = _build_system_prompt(style)
    format_catalog = style.get("format_catalog", [])
    draft_count = DRAFT_COUNT

    parts = [
        f"以下のYouTube台本の内容から、Threads投稿を{draft_count}案生成してください。",
        "台本の内容をそのまま要約するのではなく、台本から得られる気づき・学び・視点を",
        "独立した投稿として書いてください。各案は異なるテーマ・切り口にすること。",
    ]

    parts.append(f"\n## YouTube台本")
    if script_title:
        parts.append(f"タイトル: {script_title}")
    parts.append(script_content)

    if used_themes:
        parts.append(f"\n## 最近使ったテーマ（被らないこと）\n{used_themes}")

    if performance_insights:
        parts.append(f"\n{performance_insights}")

    # フォーマット型のランダム割当
    if format_catalog:
        selected = random.sample(format_catalog, min(draft_count, len(format_catalog)))
        format_lines = []
        for i, fmt in enumerate(selected, 1):
            format_lines.append(f"- 案{i}は「{fmt['label']}」: {fmt['instruction']}")
        parts.append(f"\n## フォーマット指定（各案で異なる型を使うこと）\n" + "\n".join(format_lines))

    # CTA
    include_cta = should_include_cta()
    cta_prompt = get_cta_prompt_section() if include_cta else ""
    if cta_prompt:
        parts.append(cta_prompt)

    # JSON出力形式
    keys = '"script": [...]'
    if cta_prompt:
        keys += ', "cta": [...]'
    parts.append(
        f'\nJSON形式で出力（JSON以外のテキストは含めないで）:\n'
        f'{{{keys}}}\n'
        f'各配列は [{{"content": "投稿文", "reasoning": "この切り口を選んだ理由"}}] の形式'
    )

    raw = _generate("\n".join(parts), system_prompt)

    result = {}

    if isinstance(raw, dict):
        script_drafts = raw.get("script", [])
        for d in script_drafts:
            d["source"] = "YouTube台本"
        result["script"] = script_drafts

        if cta_prompt:
            cta_raw = raw.get("cta", [])
            if isinstance(cta_raw, dict):
                cta_raw = [cta_raw]
            if cta_raw:
                cta_raw[0]["source"] = "CTA"
                result["cta"] = [cta_raw[0]]
    elif isinstance(raw, list):
        for d in raw:
            d["source"] = "YouTube台本"
        result["script"] = raw

    return result


def format_drafts_for_review(all_drafts: dict[str, list[dict]]) -> str:
    """カテゴリ別の下書きを確認用テキストに整形"""
    lines = ["# Threads投稿 下書き案\n"]

    categories = [
        ("script", "YouTube台本ベース"),
        ("cta", "CTA"),
    ]

    for key, label in categories:
        drafts = all_drafts.get(key, [])
        if not drafts:
            continue
        lines.append(f"### {label}")
        for i, draft in enumerate(drafts, 1):
            content = draft.get("content", "")
            reasoning = draft.get("reasoning", "")
            char_count = len(content)
            lines.append(f"**{label} 案{i}** ({char_count}文字)")
            lines.append(f"```\n{content}\n```")
            lines.append(f"理由: {reasoning}\n")

    return "\n".join(lines)
