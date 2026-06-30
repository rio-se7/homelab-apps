"""briefcast script generator — Brief and DeepCast as SEPARATE LLM calls.

Splitting matches the v3.1 decoupled delivery (separate RSS items, played at
different times), keeps each call within token limits, and lets the two episode
types use different speakers (Applio roster) downstream.

Speakers are role tags (anchor / cohost), resolved to Applio voices later.
Personal data (name, interests) comes from env — this repo is PUBLIC.

Env (same convention as summarizer.py):
    OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY / OPENAI_TEMPERATURE
    BRIEFCAST_LISTENER_NAME / BRIEFCAST_INTERESTS / BRIEFCAST_PREV_HOOK

Run:
    python script_generator.py brief      # daily brief only
    python script_generator.py deepcast   # deepcast only
    python script_generator.py            # both
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

# Listener profile (env; PUBLIC repo must not hardcode personal data).
LISTENER_NAME = os.getenv("BRIEFCAST_LISTENER_NAME", "リスナー")
INTERESTS = os.getenv("BRIEFCAST_INTERESTS", "テクノロジー, スポーツ, 音楽")
PREV_HOOK = os.getenv("BRIEFCAST_PREV_HOOK", "")

_COMMON = """# 話者
- anchor: 情報を出す主体。事実と数値を担当。落ち着いた進行役。
- cohost: 相槌・確認・素朴な質問・整理役。「うん」「なるほど」のような自然な反応。

# 厳守
- 出力は JSON のみ（前後に説明文やマークダウンを付けない）。
- 各発話は読み上げ用のプレーンテキスト。記号強調・マークダウン・箇条書き・見出しを使わない。
- リスナー名（{listener_name}）はそのまま使う（ローマ字化・言い換えをしない）。
- source / so_what は値がある発話にのみ含める。空文字を全 segment に付けない。
- anchor と cohost が一方的にならないよう自然な交互の掛け合いにする。
"""

BRIEF_SYSTEM = (
    """あなたは2人組のニュースブリーフ台本作家です。素材から「デイリーブリーフ」1本の台本を作ります。DeepCast は別配信なので、ここには深掘り本体は入れません。

# 構成（この順で各発話を分割）
1. opening : リスナー名の呼びかけ + 時間帯 + 前回からの繋がり（{prev_hook} を自然に。空なら省略）
2. agenda  : 今日のブリーフで触れる話題の予告（短く）
3. briefing: ニュースをテーマで束ねる。各トピックに so_what（含意）と具体的な数値・固有名詞。source も付ける
4. interest: 興味プロファイル（{interests}）直結セグメント
5. outro   : ブリーフの締め + 「今日の深掘りは『{theme}』を別に配信している」と案内 + 選定理由（{theme_reason}）を一言

# 厳守（追加）
- briefing / interest は素材の本文にない数値・固有名詞・統計を創作しない（ニュースなので厳禁）。

"""
    + _COMMON
    + """
# 出力スキーマ
{"episode_type":"daily_brief","episode_date":"YYYY-MM-DD","segments":[{"section":"opening|agenda|briefing|interest|outro","speaker":"anchor|cohost","text":"...","source":"出典(briefingのみ任意)","so_what":"含意(briefingのみ任意)"}]}
"""
)

DEEPCAST_SYSTEM = (
    """あなたは2人組の深掘りポッドキャスト台本作家です。1つのテーマを2話者の対話で深掘りする「DeepCast」1本の台本を作ります。デイリーブリーフとは別のタイミングで聞かれる前提です。

# 構成（この順で各発話を分割）
1. intro  : テーマ『{theme}』の導入（別配信なので軽く文脈を提示）+ なぜこのテーマか（{theme_reason}）
2. body   : フック → 背景/歴史 → 分析 → 影響 の流れを2話者の対話で。anchor と cohost が交互に
3. closing: 締め

# 厳守（追加）
- DeepCast は深掘りなので一般的な知識で内容を補ってよいが、確証のない固有の数値・統計の断定や事実の捏造はしない。曖昧な細部は一般論にとどめる。

"""
    + _COMMON
    + """
# 出力スキーマ
{"episode_type":"deepcast","episode_date":"YYYY-MM-DD","deepcast_theme":"{theme}","segments":[{"section":"intro|body|closing","speaker":"anchor|cohost","text":"..."}]}
"""
)


def _fill(template: str, **kw: str) -> str:
    for k, v in kw.items():
        template = template.replace("{" + k + "}", v)
    return template


def _chat(system: str, user: str, max_tokens: int) -> str:
    import openai

    client = openai.OpenAI(base_url=OPENAI_BASE_URL, api_key=OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=max_tokens,
        temperature=OPENAI_TEMPERATURE,
    )
    choice = resp.choices[0]
    if choice.finish_reason == "length":
        print("!! output truncated (finish_reason=length) — raise max_tokens", file=sys.stderr)
    return choice.message.content or ""


def _parse(raw: str) -> dict:
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


def _finalize(script: dict) -> dict:
    script["episode_date"] = datetime.date.today().isoformat()
    for seg in script.get("segments", []):
        for k in ("source", "so_what"):
            if seg.get(k) == "":
                seg.pop(k, None)
    return script


def _articles_text(articles: list) -> str:
    lines = [
        f"リスナー名: {LISTENER_NAME}",
        f"前回からの繋がり: {PREV_HOOK or '（なし）'}",
        f"興味プロファイル: {INTERESTS}",
        "",
        "## ニュース素材",
    ]
    for a in articles:
        lines += [f"【{a['source_name']}】{a['title']}", a["text"][:1000], ""]
    return "\n".join(lines)


def generate_brief(articles: list, *, theme: str = "", theme_reason: str = "") -> dict:
    """Daily brief (opening -> agenda -> briefing -> interest -> outro)."""
    system = _fill(
        BRIEF_SYSTEM,
        listener_name=LISTENER_NAME,
        prev_hook=PREV_HOOK or "（なし）",
        interests=INTERESTS,
        theme=theme or "（本日は深掘りなし）",
        theme_reason=theme_reason or "",
    )
    return _finalize(_parse(_chat(system, _articles_text(articles), 3000)))


def generate_deepcast(theme: str, theme_reason: str, *, material: str = "") -> dict:
    """Deep-dive on one theme (intro -> body dialogue -> closing). Separate item."""
    system = _fill(
        DEEPCAST_SYSTEM, listener_name=LISTENER_NAME, theme=theme, theme_reason=theme_reason
    )
    user = f"テーマ: {theme}\n選定理由: {theme_reason}\n参考素材:\n{material or '（モデルの一般知識で補う）'}"
    return _finalize(_parse(_chat(system, user, 4000)))


if __name__ == "__main__":
    # Neutral dummy material (public repo — no personal taste).
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
    THEME = "（サンプル）コンテナ技術の歴史"
    REASON = "リスナーの興味プロファイルにあるインフラ技術の流れを押さえるのに適しているため"

    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    if which in ("brief", "both"):
        print("# === daily_brief ===", file=sys.stderr)
        print(json.dumps(generate_brief(ARTICLES, theme=THEME, theme_reason=REASON), ensure_ascii=False, indent=2))
    if which in ("deepcast", "both"):
        print("# === deepcast ===", file=sys.stderr)
        print(json.dumps(generate_deepcast(THEME, REASON), ensure_ascii=False, indent=2))
