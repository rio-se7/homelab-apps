"""Phase 0 PoC: continuous 2-speaker script generation.

Validates whether a cloud LLM (Gemini primary / Cloudflare Workers AI fallback,
OpenAI-compatible) can produce the Huxe-style continuous structure
(Opening -> Briefing -> Transition -> DeepCast -> Closing) as a structured,
2-speaker (Anchor + Co-host) JSON script from dummy data.

This is generation-only (no TTS). Delivery decoupling (separate Brief / DeepCast
items) happens later; here we generate the whole arc to check structure quality.

Listener profile comes from env (this repo is PUBLIC — do not hardcode personal
data). Optional; sensible neutral defaults are used otherwise:

    export BRIEFCAST_LISTENER_NAME=...   # e.g. your name
    export BRIEFCAST_INTERESTS=...       # comma-separated topics
    export BRIEFCAST_PREV_HOOK=...        # e.g. "前回は ... の話で盛り上がった"

Run (uses the same env convention as backend/summarizer.py):

    # Gemini (primary)
    export OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
    export OPENAI_MODEL=gemini-2.5-flash
    export OPENAI_API_KEY=<gemini key>
    python poc/continuous_script.py

    # Cloudflare Workers AI (fallback)
    export OPENAI_BASE_URL=https://api.cloudflare.com/client/v4/accounts/<acct>/ai/v1
    export OPENAI_MODEL=@cf/zai-org/glm-4.7-flash
    export OPENAI_API_KEY=<workers ai token>
    python poc/continuous_script.py
"""

import datetime
import json
import os
import sys

OPENAI_BASE_URL = os.getenv(
    "OPENAI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gemini-2.5-flash")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "none")
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.4"))

# --- Speaker roles (resolved to Applio voices later; here they are just tags) ---
# anchor : 情報提供主体。事実・数値を担当
# cohost : 相槌・確認・素朴な質問・整理役

SYSTEM_PROMPT = """あなたは2人組のポッドキャスト台本作家です。与えられた素材から、毎朝のデイリーブリーフ1本ぶんの台本を作ります。

# 話者
- anchor: 情報を出す主体。事実と数値を担当。落ち着いた進行役。
- cohost: 相槌・確認・素朴な質問・整理役。「うん」「なるほど」「え、待って」のような自然な反応を入れる。

# 構成（この順で、各発話を分割して出力）
1. opening      : リスナーの名前への呼びかけ + 時間帯への言及 + 前回からの繋がり（{prev_hook} を自然に織り込む。空なら省略）
2. agenda       : 今日触れる話題の予告（短く）
3. briefing     : ニュースをテーマで束ねる。各トピックに必ず "so_what"（含意・解釈）を添え、具体的な数値・固有名詞を入れる
4. interest     : 興味プロファイル直結セグメント（{interests} に直結する話題。スポーツ等）
5. transition   : briefing の区切り → 引き止め → DeepCast 予告 → 選定理由の言語化（なぜこのテーマか）。"deepcast_reason" に選定理由を入れる
6. deepcast     : 1テーマを2話者の対話で深掘り（フック→背景→分析→影響→クロージング）。anchor と cohost が交互に
7. closing      : 締め

# 厳守
- 出力は **JSON のみ**（前後に説明文やマークダウンを付けない）。
- 各発話は読み上げ用の **プレーンテキスト**。アスタリスクや記号強調・マークダウン・箇条書き・見出しを使わない。
- **briefing / interest は素材の本文にない数値・固有名詞・統計を創作しない**（ニュースなのでハルシネーション厳禁）。情報が乏しければ簡潔に。
- **deepcast は深掘りなので一般的な知識で内容を補ってよい**が、確証のない固有の数値・統計の断定や事実の捏造はしない。曖昧な細部は一般論にとどめる。
- リスナー名（{listener_name}）はそのまま使う（ローマ字化・言い換えをしない）。
- source / so_what は briefing で値がある発話にのみ含める。空文字 ("") を全ての segment に付けない（冗長で出力が長くなる）。
- anchor と cohost が一方的にならないよう、自然な交互の掛け合いにする。

# 出力スキーマ
{
  "episode_date": "YYYY-MM-DD",
  "deepcast_theme": "（DeepCast のテーマ名）",
  "deepcast_reason": "（選定理由の自然言語）",
  "segments": [
    {"section": "opening|agenda|briefing|interest|transition|deepcast|closing",
     "speaker": "anchor|cohost",
     "text": "（読み上げる地の文）",
     "source": "（briefing のみ任意: 出典名）",
     "so_what": "（briefing のみ任意: 含意）"}
  ]
}
"""

# --- Listener profile (from env). This repo is PUBLIC, so personal data
# (name, interest profile) must come from env, never be hardcoded here. ---
LISTENER_NAME = os.getenv("BRIEFCAST_LISTENER_NAME", "リスナー")
PREV_HOOK = os.getenv("BRIEFCAST_PREV_HOOK", "")
INTERESTS = os.getenv("BRIEFCAST_INTERESTS", "テクノロジー, スポーツ, 音楽")

ARTICLES = [
    {
        "source_name": "Hacker News",
        "title": "Rust 1.90 リリース",
        "text": "Rust 1.90 が安定版として公開された。目玉は incremental compilation の最適化で、"
        "大規模クレートの再ビルド時間が平均で短縮された。借用チェッカ周りの診断メッセージも改善。破壊的変更はなし。",
    },
    {
        "source_name": "GitHub Trending",
        "title": "OSS の LLM ルーターが急上昇",
        "text": "単一の OpenAI 互換エンドポイントに投げると、コストや精度に応じて複数の LLM バックエンドへ"
        "振り分けるツール。フォールバックとキャッシュに対応。自己ホスト可能。",
    },
    {
        "source_name": "スポーツニュース",
        "title": "（サンプル）地元チームが連勝",
        "text": "あるプロチームが本拠地での試合に勝利し、連勝を伸ばした。先発投手が7回を無失点に抑えた。",
    },
]

# Neutral sample DeepCast theme (no personal taste in this public repo).
DEEPCAST_CANDIDATE = {
    "theme": "（サンプル）コンテナ技術の歴史",
    "text": "Linux のコンテナ技術が chroot から cgroups / namespaces を経て Docker、"
    "そして Kubernetes に至るまでの流れ。仮想化との違いと、なぜ普及したか。",
}


def _material_text() -> str:
    lines = [f"配信日: {datetime.date.today().isoformat()}", f"リスナー名: {LISTENER_NAME}", f"前回からの繋がり: {PREV_HOOK}", f"興味プロファイル: {INTERESTS}", "", "## ニュース素材"]
    for a in ARTICLES:
        lines.append(f"【{a['source_name']}】{a['title']}")
        lines.append(a["text"])
        lines.append("")
    lines.append("## DeepCast 候補テーマ")
    lines.append(f"テーマ: {DEEPCAST_CANDIDATE['theme']}")
    lines.append(DEEPCAST_CANDIDATE["text"])
    return "\n".join(lines)


def main() -> int:
    try:
        import openai
    except ImportError:
        print("pip install openai", file=sys.stderr)
        return 1

    system = (
        SYSTEM_PROMPT.replace("{prev_hook}", PREV_HOOK)
        .replace("{interests}", INTERESTS)
        .replace("{listener_name}", LISTENER_NAME)
    )
    client = openai.OpenAI(base_url=OPENAI_BASE_URL, api_key=OPENAI_API_KEY)

    print(f"# backend: {OPENAI_MODEL} @ {OPENAI_BASE_URL}", file=sys.stderr)
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": _material_text()},
        ],
        max_tokens=8000,
        temperature=OPENAI_TEMPERATURE,
    )
    choice = resp.choices[0]
    raw = choice.message.content or ""
    if choice.finish_reason == "length":
        print(
            "!! output truncated (finish_reason=length). Increase max_tokens, or "
            "split Brief/DeepCast into separate LLM calls (matches decoupled delivery).",
            file=sys.stderr,
        )

    # The model should return JSON only; tolerate code fences just in case.
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        script = json.loads(cleaned)
    except json.JSONDecodeError:
        print("!! JSON parse failed — raw output below:", file=sys.stderr)
        print(raw)
        return 2

    # episode_date is injected, not guessed by the model.
    script["episode_date"] = datetime.date.today().isoformat()

    # Drop empty optional fields some models emit on every segment.
    for seg in script.get("segments", []):
        for k in ("source", "so_what"):
            if seg.get(k) == "":
                seg.pop(k, None)

    print(json.dumps(script, ensure_ascii=False, indent=2))

    # quick structural report to stderr
    sections = [s.get("section") for s in script.get("segments", [])]
    print(f"\n# segments: {len(sections)} / sections: {sorted(set(sections))}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
