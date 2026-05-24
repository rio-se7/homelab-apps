import asyncio

from .url import fetch_url
from .youtube import fetch_youtube
from .hackernews import fetch_hackernews
from .reddit import fetch_reddit
from .github import fetch_github_trending


async def fetch_all(sources: list) -> list:
    tasks = []
    for source in sources:
        t = source["type"]
        cfg = source.get("config", {})
        name = source["name"]
        if t == "url":
            tasks.append(fetch_url(cfg, name))
        elif t == "youtube":
            tasks.append(fetch_youtube(cfg, name))
        elif t == "hackernews":
            tasks.append(fetch_hackernews(cfg, name))
        elif t == "reddit":
            tasks.append(fetch_reddit(cfg, name))
        elif t == "github_trending":
            tasks.append(fetch_github_trending(cfg, name))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    articles = []
    for r in results:
        if isinstance(r, Exception):
            print(f"source fetch error: {r}")
            continue
        articles.extend(r)
    return articles
