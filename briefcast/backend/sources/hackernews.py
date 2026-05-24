import asyncio
import httpx

HN_API = "https://hacker-news.firebaseio.com/v0"


async def _fetch_item(client: httpx.AsyncClient, item_id: int) -> dict | None:
    try:
        resp = await client.get(f"{HN_API}/item/{item_id}.json", timeout=10)
        return resp.json()
    except Exception:
        return None


async def fetch_hackernews(config: dict, source_name: str) -> list:
    feed = config.get("feed", "top")
    limit = int(config.get("limit", 5))

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{HN_API}/{feed}stories.json", timeout=10)
        ids = resp.json()[:limit]
        items = await asyncio.gather(*[_fetch_item(client, i) for i in ids])

    articles = []
    for item in items:
        if not item or item.get("type") != "story":
            continue
        title = item.get("title", "")
        url = item.get("url") or f"https://news.ycombinator.com/item?id={item['id']}"
        text = item.get("text") or f"{title} — HN score: {item.get('score', 0)}, comments: {item.get('descendants', 0)}"
        articles.append({"title": title, "url": url, "text": text[:1000], "source_name": source_name})
    return articles
