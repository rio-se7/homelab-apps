import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SOURCES_FILE = DATA_DIR / "sources.json"
EPISODES_DIR = DATA_DIR / "episodes"
AUDIO_DIR = DATA_DIR / "audio"


def _init():
    DATA_DIR.mkdir(exist_ok=True)
    EPISODES_DIR.mkdir(exist_ok=True)
    AUDIO_DIR.mkdir(exist_ok=True)
    if not SOURCES_FILE.exists():
        SOURCES_FILE.write_text("[]")


def load_sources() -> list:
    _init()
    return json.loads(SOURCES_FILE.read_text())


def add_source(source: dict):
    sources = load_sources()
    sources.append(source)
    SOURCES_FILE.write_text(json.dumps(sources, ensure_ascii=False, indent=2))


def delete_source(source_id: str) -> bool:
    sources = load_sources()
    new = [s for s in sources if s["id"] != source_id]
    if len(new) == len(sources):
        return False
    SOURCES_FILE.write_text(json.dumps(new, ensure_ascii=False, indent=2))
    return True


def load_episodes() -> list:
    _init()
    episodes = []
    for f in sorted(EPISODES_DIR.glob("*.json"), reverse=True):
        episodes.append(json.loads(f.read_text()))
    return episodes


def save_episode(episode: dict):
    _init()
    (EPISODES_DIR / f"{episode['id']}.json").write_text(
        json.dumps(episode, ensure_ascii=False, indent=2)
    )


def get_episode(episode_id: str) -> dict | None:
    _init()
    path = EPISODES_DIR / f"{episode_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def audio_path(episode_id: str) -> str:
    _init()
    return str(AUDIO_DIR / f"{episode_id}.mp3")
