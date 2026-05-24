import os

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge_tts")
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "ja-JP-NanamiNeural")
OPENAI_TTS_VOICE = os.getenv("OPENAI_TTS_VOICE", "shimmer")
OPENAI_TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", "tts-1")


async def generate_audio(text: str, output_path: str):
    if TTS_PROVIDER == "edge_tts":
        import edge_tts
        communicate = edge_tts.Communicate(text, EDGE_TTS_VOICE)
        await communicate.save(output_path)
        return

    # openai TTS
    import openai
    client = openai.AsyncOpenAI()
    resp = await client.audio.speech.create(
        model=OPENAI_TTS_MODEL,
        voice=OPENAI_TTS_VOICE,
        input=text,
    )
    import aiofiles
    async with aiofiles.open(output_path, "wb") as f:
        await f.write(resp.content)
