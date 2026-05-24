import httpx

HEADERS = {"User-Agent": "briefcast/1.0 (self-hosted homelab app)"}


async def fetch_reddit(config: dict, source_name: str) -> list:
    subreddit = config.get("subreddit", "programming")
    sort = config.get("sort", "hot")
    limit = int(config.get("limit", 5))

    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={limit}"
    async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    articles = []
    for post in data.get("data", {}).get("children", []):
        p = post.get("data", {})
        title = p.get("title", "")
        post_url = p.get("url") or f"https://reddit.com{p.get('permalink', '')}"
        selftext = (p.get("selftext") or "")[:800]
        text = selftext or f"{title} — r/{subreddit}, score: {p.get('score', 0)}"
        articles.append({"title": title, "url": post_url, "text": text, "source_name": source_name})
    return articles
