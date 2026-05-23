"""JSON-file-based persistence for feeds and episodes."""
import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any

DATA_DIR = Path(__file__).parent / "data"
FEEDS_FILE = DATA_DIR / "feeds.json"
EPISODES_DIR = DATA_DIR / "episodes"
AUDIO_DIR = DATA_DIR / "audio"


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    EPISODES_DIR.mkdir(exist_ok=True)
    AUDIO_DIR.mkdir(exist_ok=True)


def load_feeds() -> list[dict[str, Any]]:
    _ensure_dirs()
    if not FEEDS_FILE.exists():
        return []
    return json.loads(FEEDS_FILE.read_text())


def save_feeds(feeds: list[dict[str, Any]]) -> None:
    _ensure_dirs()
    FEEDS_FILE.write_text(json.dumps(feeds, ensure_ascii=False, indent=2))


def get_feed(feed_id: str) -> dict[str, Any] | None:
    return next((f for f in load_feeds() if f["id"] == feed_id), None)


def add_feed(name: str, url: str) -> dict[str, Any]:
    feeds = load_feeds()
    feed = {"id": str(uuid.uuid4()), "name": name, "url": url, "createdAt": datetime.utcnow().isoformat()}
    feeds.append(feed)
    save_feeds(feeds)
    return feed


def delete_feed(feed_id: str) -> bool:
    feeds = load_feeds()
    new_feeds = [f for f in feeds if f["id"] != feed_id]
    if len(new_feeds) == len(feeds):
        return False
    save_feeds(new_feeds)
    return True


def load_episodes() -> list[dict[str, Any]]:
    _ensure_dirs()
    episodes = []
    for p in sorted(EPISODES_DIR.glob("*.json"), reverse=True):
        episodes.append(json.loads(p.read_text()))
    return episodes


def save_episode(episode: dict[str, Any]) -> None:
    _ensure_dirs()
    path = EPISODES_DIR / f"{episode['id']}.json"
    path.write_text(json.dumps(episode, ensure_ascii=False, indent=2))


def get_episode(episode_id: str) -> dict[str, Any] | None:
    path = EPISODES_DIR / f"{episode_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def audio_path(episode_id: str) -> Path:
    _ensure_dirs()
    return AUDIO_DIR / f"{episode_id}.mp3"
