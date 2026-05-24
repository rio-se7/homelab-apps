import httpx
from bs4 import BeautifulSoup


async def fetch_github_trending(config: dict, source_name: str) -> list:
    language = config.get("language", "")
    since = config.get("since", "daily")

    path = f"/trending/{language}" if language else "/trending"
    url = f"https://github.com{path}?since={since}"

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        resp = await client.get(url, headers={"Accept-Language": "en-US,en;q=0.9"})
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    articles = []

    for repo_div in soup.select("article.Box-row")[:10]:
        name_tag = repo_div.select_one("h2 a")
        if not name_tag:
            continue
        repo_name = name_tag.get_text(strip=True).replace("\n", "").replace(" ", "")
        desc_tag = repo_div.select_one("p")
        desc = desc_tag.get_text(strip=True) if desc_tag else ""
        stars_tag = repo_div.select_one("a[href$='/stargazers']")
        stars = stars_tag.get_text(strip=True) if stars_tag else ""
        repo_url = f"https://github.com{name_tag['href']}"
        text = f"{repo_name}: {desc} (stars: {stars})"
        articles.append({"title": repo_name, "url": repo_url, "text": text, "source_name": source_name})

    return articles
