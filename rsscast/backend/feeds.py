"""RSS feed fetching and article extraction."""
import asyncio
from datetime import datetime
from typing import Any

import feedparser
import httpx


MAX_ARTICLES_PER_FEED = 5
REQUEST_TIMEOUT = 15.0


async def fetch_feed_articles(url: str) -> list[dict[str, Any]]:
    """Fetch RSS feed and return top articles."""
    loop = asyncio.get_event_loop()

    def _parse() -> Any:
        return feedparser.parse(url, request_headers={"User-Agent": "rsscast/1.0"})

    parsed = await loop.run_in_executor(None, _parse)

    articles = []
    for entry in parsed.entries[:MAX_ARTICLES_PER_FEED]:
        articles.append({
            "title": getattr(entry, "title", "(no title)"),
            "summary": getattr(entry, "summary", "") or getattr(entry, "description", ""),
            "link": getattr(entry, "link", ""),
            "published": getattr(entry, "published", ""),
        })
    return articles


async def fetch_multiple_feeds(feed_urls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fetch multiple feeds concurrently, return flat article list with feed name."""
    tasks = [fetch_feed_articles(f["url"]) for f in feed_urls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    articles = []
    for feed, result in zip(feed_urls, results):
        if isinstance(result, Exception):
            continue
        for article in result:
            articles.append({**article, "feedName": feed["name"]})
    return articles
