import trafilatura


async def fetch_url(config: dict, source_name: str) -> list:
    url = config.get("url", "")
    if not url:
        return []
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return []
    text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
    if not text:
        return []
    title = trafilatura.extract(downloaded, output_format="json")
    import json
    try:
        meta = json.loads(title or "{}")
        article_title = meta.get("title") or url
    except Exception:
        article_title = url
    return [{"title": article_title, "url": url, "text": text[:3000], "source_name": source_name}]
