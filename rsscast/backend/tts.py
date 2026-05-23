"""Text-to-Speech generation. Swappable via TTS_PROVIDER env var."""
import os
from pathlib import Path

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge_tts")  # "edge_tts" | "openai"
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "ja-JP-NanamiNeural")
OPENAI_TTS_VOICE = os.getenv("OPENAI_TTS_VOICE", "shimmer")


async def generate_audio(text: str, output_path: Path) -> None:
    """Generate MP3 audio from text and save to output_path."""
    if TTS_PROVIDER == "openai":
        await _tts_openai(text, output_path)
    else:
        await _tts_edge(text, output_path)


async def _tts_edge(text: str, output_path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, EDGE_TTS_VOICE)
    await communicate.save(str(output_path))


async def _tts_openai(text: str, output_path: Path) -> None:
    from openai import AsyncOpenAI

    client = AsyncOpenAI()
    response = await client.audio.speech.create(
        model="tts-1",
        voice=OPENAI_TTS_VOICE,  # type: ignore[arg-type]
        input=text,
        response_format="mp3",
    )
    output_path.write_bytes(response.content)
