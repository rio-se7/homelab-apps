import re
import httpx
from youtube_transcript_api import YouTubeTranscriptApi


def _video_id_from_url(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


async def _latest_video_ids(channel_id: str, limit: int) -> list[str]:
    feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(feed_url)
        resp.raise_for_status()
    ids = re.findall(r"<yt:videoId>([A-Za-z0-9_-]{11})</yt:videoId>", resp.text)
    return ids[:limit]


async def fetch_youtube(config: dict, source_name: str) -> list:
    limit = int(config.get("limit", 3))
    articles = []

    if "video_url" in config:
        vid = _video_id_from_url(config["video_url"])
        video_ids = [vid] if vid else []
    elif "channel_id" in config:
        video_ids = await _latest_video_ids(config["channel_id"], limit)
    else:
        return []

    for vid in video_ids:
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(vid, languages=["ja", "en"])
            text = " ".join(t["text"] for t in transcript_list)[:3000]
            url = f"https://www.youtube.com/watch?v={vid}"
            articles.append({"title": f"YouTube video {vid}", "url": url, "text": text, "source_name": source_name})
        except Exception as e:
            print(f"youtube transcript error {vid}: {e}")

    return articles
