import io
import re
from pathlib import Path

import docx
from pypdf import PdfReader

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


def parse(data: bytes, filename: str) -> list[tuple[int | None, str]]:
    """Extract text from a file. Returns (page_number, text) pairs; page is None if unknown."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        reader = PdfReader(io.BytesIO(data))
        return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]

    if ext == ".docx":
        document = docx.Document(io.BytesIO(data))
        paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
        for table in document.tables:
            for row in table.rows:
                paragraphs.append(" | ".join(cell.text.strip() for cell in row.cells))
        return [(None, "\n\n".join(paragraphs))]

    if ext in {".txt", ".md"}:
        return [(None, data.decode("utf-8", errors="replace"))]

    raise ValueError(f"Unsupported file type: {ext or 'unknown'}")


def clean(text: str) -> str:
    text = text.replace("\x00", "")  # Postgres rejects NUL bytes
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
