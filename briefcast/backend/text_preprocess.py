"""Text preprocessing for TTS: number reading + proper-noun / acronym readings.

Goal: feed cleaner text to the TTS so numbers and acronyms are pronounced
correctly. Three passes:

1. Dictionary overrides (built-in neutral exceptions + optional user dict).
2. Acronym auto-reading: ALL-CAPS runs (>=2) -> katakana letter names
   (TSMC -> ティーエスエムシー). Pure algorithm, so no personal data is needed.
3. Number normalization: percent / year / integers with 万 億 兆 -> kana.

Public-repo note: built-in data is NEUTRAL only. Personal / domain readings go
in an external JSON loaded from BRIEFCAST_DICT_PATH (keep that file out of git).
"""

import json
import os
import re

# --- Latin letter -> katakana letter-name (for acronym reading) ---
_LETTER_KANA = {
    "A": "エー", "B": "ビー", "C": "シー", "D": "ディー", "E": "イー",
    "F": "エフ", "G": "ジー", "H": "エイチ", "I": "アイ", "J": "ジェイ",
    "K": "ケー", "L": "エル", "M": "エム", "N": "エヌ", "O": "オー",
    "P": "ピー", "Q": "キュー", "R": "アール", "S": "エス", "T": "ティー",
    "U": "ユー", "V": "ブイ", "W": "ダブリュー", "X": "エックス", "Y": "ワイ", "Z": "ゼット",
}

# Neutral built-in exceptions: ALL-CAPS tokens that are read as words, not
# letter-by-letter. Extend per-user via BRIEFCAST_DICT_PATH instead of here.
_BUILTIN_DICT = {
    "JSON": "ジェイソン",
    "YAML": "ヤムル",
    "NASA": "ナサ",
    "JAXA": "ジャクサ",
    "GIF": "ジフ",
}

# --- Number reading (hiragana) ---
_DIGIT = {1: "いち", 2: "に", 3: "さん", 4: "よん", 5: "ご", 6: "ろく", 7: "なな", 8: "はち", 9: "きゅう"}
_HYAKU = {1: "ひゃく", 2: "にひゃく", 3: "さんびゃく", 4: "よんひゃく", 5: "ごひゃく",
          6: "ろっぴゃく", 7: "ななひゃく", 8: "はっぴゃく", 9: "きゅうひゃく"}
_SEN = {1: "せん", 2: "にせん", 3: "さんぜん", 4: "よんせん", 5: "ごせん",
        6: "ろくせん", 7: "ななせん", 8: "はっせん", 9: "きゅうせん"}
# euphonic readings of "1<unit>"
_UNITS = [(10 ** 12, "ちょう", "いっちょう"), (10 ** 8, "おく", "いちおく"), (10 ** 4, "まん", "いちまん")]


def _read_under_10000(n: int) -> str:
    out = ""
    sen, n = divmod(n, 1000)
    if sen:
        out += _SEN[sen]
    hyaku, n = divmod(n, 100)
    if hyaku:
        out += _HYAKU[hyaku]
    ju, ichi = divmod(n, 10)
    if ju:
        out += "じゅう" if ju == 1 else _DIGIT[ju] + "じゅう"
    if ichi:
        out += _DIGIT[ichi]
    return out


def read_int(n: int) -> str:
    if n == 0:
        return "ぜろ"
    if n < 0:
        return "マイナス" + read_int(-n)
    out = ""
    for val, name, one in _UNITS:
        q, n = divmod(n, val)
        if q:
            out += (one if q == 1 else _read_under_10000(q) + name)
    if n:
        out += _read_under_10000(n)
    return out


def _parse_mixed(s: str) -> int:
    """'4兆9500億' / '2026' / '1兆' -> int."""
    total = 0
    for unit, mult in (("兆", 10 ** 12), ("億", 10 ** 8), ("万", 10 ** 4)):
        if unit in s:
            head, s = s.split(unit, 1)
            total += (int(head) if head else 1) * mult
    if s:
        total += int(s)
    return total


def _read_decimal(s: str) -> str:
    """'3.5' -> 'さんてんご'."""
    intp, _, frac = s.partition(".")
    out = read_int(int(intp))
    if frac:
        out += "てん" + "".join(_DIGIT.get(int(d), "ぜろ") for d in frac)
    return out


_RE_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*[%％]")
_RE_YEAR = re.compile(r"(\d+)\s*年")
_RE_NUMBER = re.compile(r"\d+(?:[兆億万]\d*)*(?:\.\d+)?")


def normalize_numbers(text: str) -> str:
    text = _RE_PERCENT.sub(lambda m: _read_decimal(m.group(1)) + "パーセント", text)
    text = _RE_YEAR.sub(lambda m: read_int(int(m.group(1))) + "ねん", text)

    def _num(m: re.Match) -> str:
        tok = m.group(0)
        if "." in tok:
            return _read_decimal(tok)
        return read_int(_parse_mixed(tok))

    return _RE_NUMBER.sub(_num, text)


def _load_user_dict() -> dict:
    path = os.getenv("BRIEFCAST_DICT_PATH")
    if not path or not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {k: v for k, v in data.items() if not k.startswith("_")}


def _acronym_reading(token: str) -> str:
    return "".join(_LETTER_KANA.get(c, c) for c in token)


_RE_ACRONYM = re.compile(r"[A-Z]{2,}")


def preprocess(text: str, dictionary: dict | None = None) -> str:
    merged = {**_BUILTIN_DICT, **_load_user_dict(), **(dictionary or {})}
    # 1. dictionary overrides (longest term first to avoid partial hits)
    for term in sorted(merged, key=len, reverse=True):
        text = text.replace(term, merged[term])
    # 2. remaining ALL-CAPS acronyms -> letter readings
    text = _RE_ACRONYM.sub(lambda m: _acronym_reading(m.group(0)), text)
    # 3. numbers
    text = normalize_numbers(text)
    return text


if __name__ == "__main__":
    samples = [
        "Rust 1.90 がリリース、再ビルド時間が49%短縮。",
        "TSMC が2026年に4兆9500億ドルを投資。",
        "JPBA と NPB のニュース。AI と GPU の話題も。",
        "JSON を YAML に変換する。NASA の発表もあった。",
        "気温は3.5度、湿度は80%でした。",
    ]
    for s in samples:
        print("IN :", s)
        print("OUT:", preprocess(s))
        print()
