from typing import Literal

import httpx

from .config import settings

BATCH_SIZE = 32


def _prefix(kind: Literal["document", "query"]) -> str:
    # nomic-embed-text is trained with task prefixes; other models don't need them.
    if "nomic" not in settings.embed_model:
        return ""
    return "search_query: " if kind == "query" else "search_document: "


def embed(texts: list[str], kind: Literal["document", "query"] = "document") -> list[list[float]]:
    prefix = _prefix(kind)
    vectors: list[list[float]] = []
    with httpx.Client(timeout=120) as client:
        for i in range(0, len(texts), BATCH_SIZE):
            batch = [prefix + t for t in texts[i : i + BATCH_SIZE]]
            resp = client.post(
                f"{settings.ollama_url}/api/embed",
                json={"model": settings.embed_model, "input": batch},
            )
            resp.raise_for_status()
            vectors.extend(resp.json()["embeddings"])
    return vectors


def embed_query(text: str) -> list[float]:
    return embed([text], kind="query")[0]
