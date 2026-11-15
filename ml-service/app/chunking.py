import re
from collections.abc import Iterator


def _units(text: str, size: int) -> Iterator[str]:
    """Split text into paragraphs; paragraphs longer than `size` are split into sentences,
    and sentences longer than `size` are hard-split."""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if len(para) <= size:
            yield para
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", para):
            while len(sentence) > size:
                yield sentence[:size]
                sentence = sentence[size:]
            if sentence:
                yield sentence


def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Greedily pack paragraphs/sentences into ~`size`-char chunks, carrying `overlap`
    chars of the previous chunk forward so context isn't lost at boundaries."""
    chunks: list[str] = []
    current = ""
    for unit in _units(text, size):
        if current and len(current) + len(unit) + 2 > size:
            chunks.append(current)
            tail = current[-overlap:] if overlap else ""
            if " " in tail:
                tail = tail[tail.index(" ") + 1 :]  # don't start mid-word
            current = f"{tail}\n\n{unit}" if tail else unit
        else:
            current = f"{current}\n\n{unit}" if current else unit
    if current.strip():
        chunks.append(current)
    return chunks
