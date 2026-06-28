import os

SUMMARIZER = os.getenv("SUMMARIZER", "claude")
CLAUDE_MODEL = "claude-haiku-4-5-20251001"
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:8080/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "local-model")
# Bearer key for the OpenAI-compatible backend. "none" works for an unauthenticated
# local llama-server; Gemini / Cloudflare Workers AI require a real token.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "none")
# Lower temperature keeps the news script factual and reduces embellishment.
OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.4"))

SYSTEM_PROMPT = (
    "あなたはポッドキャストのナレーターです。"
    "与えられた本文だけを根拠に、1〜3分で読み上げられる自然な日本語の台本にまとめてください。"
    "重要な制約: "
    "(1) 出力は読み上げ用のプレーンテキストのみ。"
    "アスタリスク(*)などの記号による強調、マークダウン、箇条書き、見出しは一切使わない。"
    "(2) 本文に無い数値・固有名詞・プラットフォーム名・統計を創作しない。"
    "情報が乏しい場合は無理に膨らませず簡潔にまとめる。"
)


def _articles_to_text(articles: list) -> str:
    lines = []
    for a in articles:
        lines.append(f"【{a['source_name']}】{a['title']}")
        lines.append(a["text"][:1000])
        lines.append("")
    return "\n".join(lines)


async def summarize(articles: list) -> str:
    content = _articles_to_text(articles)

    if SUMMARIZER == "claude":
        import anthropic
        client = anthropic.AsyncAnthropic()
        msg = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": content}],
        )
        return msg.content[0].text

    # openai_compat (Gemini / Cloudflare Workers AI / llama-server etc.)
    import openai
    client = openai.AsyncOpenAI(base_url=OPENAI_BASE_URL, api_key=OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=1024,
        temperature=OPENAI_TEMPERATURE,
    )
    return resp.choices[0].message.content
