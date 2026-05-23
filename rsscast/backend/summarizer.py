"""LLM-based article summarization. Swappable via SUMMARIZER env var."""
import os
from typing import Any

SUMMARIZER = os.getenv("SUMMARIZER", "claude")  # "claude" | "openai_compat"
OPENAI_COMPAT_BASE = os.getenv("OPENAI_COMPAT_BASE", "http://localhost:8080/v1")
OPENAI_COMPAT_MODEL = os.getenv("OPENAI_COMPAT_MODEL", "qwen3")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

SYSTEM_PROMPT = """You are a helpful podcast host. Given a list of news articles, create an engaging audio script summary in the same language as the articles. Keep it concise (1-3 minutes when read aloud). Speak naturally as if broadcasting to listeners. Do not use markdown, headers, or bullet points — only plain flowing text."""


def _articles_to_text(articles: list[dict[str, Any]]) -> str:
    lines = []
    for a in articles:
        lines.append(f"[{a.get('feedName', '')}] {a['title']}")
        summary = a.get("summary", "")[:400]
        if summary:
            lines.append(summary)
        lines.append("")
    return "\n".join(lines)


async def summarize(articles: list[dict[str, Any]]) -> str:
    """Generate a podcast script from articles."""
    if not articles:
        return "No articles available at this time."

    text = _articles_to_text(articles)
    user_message = f"Please summarize these news articles into a podcast script:\n\n{text}"

    if SUMMARIZER == "claude":
        return await _summarize_claude(user_message)
    return await _summarize_openai_compat(user_message)


async def _summarize_claude(user_message: str) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic()
    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {"type": "text", "text": user_message},
                ],
            }
        ],
    )
    return response.content[0].text  # type: ignore[union-attr]


async def _summarize_openai_compat(user_message: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(base_url=OPENAI_COMPAT_BASE, api_key="none")
    response = await client.chat.completions.create(
        model=OPENAI_COMPAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=1024,
    )
    return response.choices[0].message.content or ""
