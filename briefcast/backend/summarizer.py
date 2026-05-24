import os

SUMMARIZER = os.getenv("SUMMARIZER", "claude")
CLAUDE_MODEL = "claude-haiku-4-5-20251001"
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:8080/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "local-model")

SYSTEM_PROMPT = (
    "あなたはポッドキャストのナレーターです。"
    "与えられた記事・コンテンツを1〜3分で読み上げられる自然な日本語のスクリプトにまとめてください。"
    "マークダウン記法は使わず、読み上げ可能なプレーンテキストのみで出力してください。"
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

    # openai_compat (llama-server etc.)
    import openai
    client = openai.AsyncOpenAI(base_url=OPENAI_BASE_URL, api_key="none")
    resp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=1024,
    )
    return resp.choices[0].message.content
