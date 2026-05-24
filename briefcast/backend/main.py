import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import storage
from sources import fetch_all
from summarizer import summarize
from tts import generate_audio

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SourceCreate(BaseModel):
    name: str
    type: str
    config: dict


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/sources")
def list_sources():
    return storage.load_sources()


@app.post("/api/sources", status_code=201)
def add_source(body: SourceCreate):
    source = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "type": body.type,
        "config": body.config,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    storage.add_source(source)
    return source


@app.delete("/api/sources/{source_id}", status_code=204)
def delete_source(source_id: str):
    if not storage.delete_source(source_id):
        raise HTTPException(status_code=404, detail="source not found")


@app.get("/api/episodes")
def list_episodes():
    return storage.load_episodes()


@app.post("/api/episodes/generate", status_code=201)
async def generate_episode():
    sources = storage.load_sources()
    if not sources:
        raise HTTPException(status_code=400, detail="no sources configured")

    articles = await fetch_all(sources)
    if not articles:
        raise HTTPException(status_code=400, detail="no articles fetched from sources")

    script = await summarize(articles)

    episode_id = str(uuid.uuid4())
    audio_file = storage.audio_path(episode_id)
    await generate_audio(script, audio_file)

    episode = {
        "id": episode_id,
        "title": f"Briefcast {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC",
        "script": script,
        "articleCount": len(articles),
        "sourceCount": len(sources),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "audioSize": Path(audio_file).stat().st_size,
    }
    storage.save_episode(episode)
    return episode


@app.get("/api/episodes/{episode_id}/audio")
def get_audio(episode_id: str):
    episode = storage.get_episode(episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="episode not found")
    audio_file = storage.audio_path(episode_id)
    if not Path(audio_file).exists():
        raise HTTPException(status_code=404, detail="audio file not found")
    return FileResponse(audio_file, media_type="audio/mpeg")
