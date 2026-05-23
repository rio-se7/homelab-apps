"""rsscast backend — FastAPI application."""
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import storage
import feeds as feed_fetcher
import summarizer
import tts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="rsscast", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Feeds ---

class FeedCreate(BaseModel):
    name: str
    url: str


@app.get("/api/feeds")
def list_feeds() -> list[dict[str, Any]]:
    return storage.load_feeds()


@app.post("/api/feeds", status_code=201)
def create_feed(body: FeedCreate) -> dict[str, Any]:
    return storage.add_feed(body.name, body.url)


@app.delete("/api/feeds/{feed_id}", status_code=204)
def remove_feed(feed_id: str) -> None:
    if not storage.delete_feed(feed_id):
        raise HTTPException(status_code=404, detail="Feed not found")


# --- Episodes ---

@app.get("/api/episodes")
def list_episodes() -> list[dict[str, Any]]:
    return storage.load_episodes()


@app.post("/api/episodes/generate", status_code=201)
async def generate_episode() -> dict[str, Any]:
    """Fetch feeds → summarize → TTS → save episode."""
    all_feeds = storage.load_feeds()
    if not all_feeds:
        raise HTTPException(status_code=400, detail="No feeds configured. Add at least one feed first.")

    logger.info("Fetching %d feeds…", len(all_feeds))
    articles = await feed_fetcher.fetch_multiple_feeds(all_feeds)
    if not articles:
        raise HTTPException(status_code=502, detail="Could not fetch any articles from configured feeds.")

    logger.info("Summarizing %d articles…", len(articles))
    script = await summarizer.summarize(articles)

    episode_id = str(uuid.uuid4())
    audio_file = storage.audio_path(episode_id)

    logger.info("Generating audio → %s", audio_file)
    await tts.generate_audio(script, audio_file)

    episode: dict[str, Any] = {
        "id": episode_id,
        "title": f"Episode {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
        "script": script,
        "articleCount": len(articles),
        "feedCount": len(all_feeds),
        "createdAt": datetime.utcnow().isoformat(),
        "audioSize": audio_file.stat().st_size if audio_file.exists() else 0,
    }
    storage.save_episode(episode)
    logger.info("Episode %s created", episode_id)
    return episode


@app.get("/api/episodes/{episode_id}/audio")
def get_audio(episode_id: str) -> FileResponse:
    episode = storage.get_episode(episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    path = storage.audio_path(episode_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(path), media_type="audio/mpeg", filename=f"{episode_id}.mp3")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
