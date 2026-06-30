"""briefcast feed — Podcast RSS 2.0 (+ iTunes tags) generation.

Each episode is its own <item> so Daily Brief and DeepCast ship as separate,
independently playable items (v3.1 decoupled delivery). Multiple DeepCasts per
day are just multiple items. Brief and its DeepCast are cross-linked (same date,
related_guid) while staying separate.

Dependency-free (stdlib xml.etree). Channel metadata comes from env — this repo
is PUBLIC, so do not hardcode personal data (podcast name / author / email).

Env:
    FEED_TITLE / FEED_LINK / FEED_DESCRIPTION / FEED_LANGUAGE
    FEED_AUTHOR / FEED_EMAIL / FEED_IMAGE_URL / FEED_CATEGORY
"""

import os
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import format_datetime

ITUNES = "http://www.itunes.com/dtds/podcast-1.0.dtd"


@dataclass
class Episode:
    guid: str
    episode_type: str  # "daily_brief" | "deepcast"
    title: str
    description: str
    audio_url: str
    audio_bytes: int
    duration_seconds: int
    pubdate: datetime
    related_guid: str | None = None  # link brief <-> deepcast


@dataclass
class Channel:
    title: str = field(default_factory=lambda: os.getenv("FEED_TITLE", "Briefcast"))
    link: str = field(default_factory=lambda: os.getenv("FEED_LINK", "https://briefcast.example.invalid"))
    description: str = field(default_factory=lambda: os.getenv("FEED_DESCRIPTION", "毎朝の自動生成ニュースブリーフ"))
    language: str = field(default_factory=lambda: os.getenv("FEED_LANGUAGE", "ja"))
    author: str = field(default_factory=lambda: os.getenv("FEED_AUTHOR", "Briefcast"))
    email: str = field(default_factory=lambda: os.getenv("FEED_EMAIL", "podcast@example.invalid"))
    image_url: str = field(default_factory=lambda: os.getenv("FEED_IMAGE_URL", ""))
    category: str = field(default_factory=lambda: os.getenv("FEED_CATEGORY", "News"))
    explicit: str = "false"


def _rfc822(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt)


def _hms(seconds: int) -> str:
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _mime(url: str) -> str:
    ext = url.rsplit(".", 1)[-1].lower()
    return {
        "mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg",
        "opus": "audio/opus", "wav": "audio/wav", "flac": "audio/flac",
    }.get(ext, "audio/mpeg")


def _it(parent: ET.Element, tag: str, text: str | None = None, **attrs: str) -> ET.Element:
    el = ET.SubElement(parent, f"{{{ITUNES}}}{tag}", {k: v for k, v in attrs.items()})
    if text is not None:
        el.text = text
    return el


def build_feed(episodes: list[Episode], channel: Channel | None = None) -> str:
    ch_meta = channel or Channel()
    ET.register_namespace("itunes", ITUNES)
    rss = ET.Element("rss", {"version": "2.0"})
    channel_el = ET.SubElement(rss, "channel")

    ET.SubElement(channel_el, "title").text = ch_meta.title
    ET.SubElement(channel_el, "link").text = ch_meta.link
    ET.SubElement(channel_el, "description").text = ch_meta.description
    ET.SubElement(channel_el, "language").text = ch_meta.language
    ET.SubElement(channel_el, "lastBuildDate").text = _rfc822(datetime.now(timezone.utc))
    _it(channel_el, "author", ch_meta.author)
    _it(channel_el, "explicit", ch_meta.explicit)
    ET.SubElement(channel_el, f"{{{ITUNES}}}category", {"text": ch_meta.category})
    owner = _it(channel_el, "owner")
    _it(owner, "name", ch_meta.author)
    _it(owner, "email", ch_meta.email)
    if ch_meta.image_url:
        _it(channel_el, "image", href=ch_meta.image_url)

    # newest first
    for ep in sorted(episodes, key=lambda e: e.pubdate, reverse=True):
        item = ET.SubElement(channel_el, "item")
        ET.SubElement(item, "title").text = ep.title
        desc = ep.description
        if ep.related_guid:
            desc += f"\n\n関連エピソード: {ep.related_guid}"
        ET.SubElement(item, "description").text = desc
        ET.SubElement(
            item, "enclosure",
            {"url": ep.audio_url, "length": str(ep.audio_bytes), "type": _mime(ep.audio_url)},
        )
        guid = ET.SubElement(item, "guid", {"isPermaLink": "false"})
        guid.text = ep.guid
        ET.SubElement(item, "pubDate").text = _rfc822(ep.pubdate)
        _it(item, "duration", _hms(ep.duration_seconds))
        _it(item, "episodeType", "full")

    ET.indent(rss, space="  ")
    return ET.tostring(rss, encoding="utf-8", xml_declaration=True).decode("utf-8")


if __name__ == "__main__":
    base = os.getenv("FEED_BASE_URL", "https://briefcast.example.invalid/audio")
    today = datetime.now(timezone.utc)
    brief = Episode(
        guid="2026-06-29-brief",
        episode_type="daily_brief",
        title="デイリーブリーフ 2026-06-29",
        description="今日のニュース: Rust 1.90、OSS の LLM ルーター、スポーツ。",
        audio_url=f"{base}/2026-06-29-brief.mp3",
        audio_bytes=4_800_000,
        duration_seconds=8 * 60,
        pubdate=today,
        related_guid="2026-06-29-deepcast-1",
    )
    deepcast = Episode(
        guid="2026-06-29-deepcast-1",
        episode_type="deepcast",
        title="DeepCast: コンテナ技術の歴史 (2026-06-29)",
        description="chroot から Kubernetes までの流れを2話者で深掘り。",
        audio_url=f"{base}/2026-06-29-deepcast-1.mp3",
        audio_bytes=7_200_000,
        duration_seconds=11 * 60,
        pubdate=today,
        related_guid="2026-06-29-brief",
    )
    print(build_feed([brief, deepcast]))
