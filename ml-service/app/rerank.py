import logging

from .config import settings

log = logging.getLogger(__name__)
_encoder = None


def rerank(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    """Re-order candidates with a cross-encoder (if enabled), then keep the top_k."""
    if not settings.rerank_enabled or len(chunks) <= 1:
        return chunks[:top_k]

    global _encoder
    if _encoder is None:
        try:
            from fastembed.rerank.cross_encoder import TextCrossEncoder
        except ImportError:
            log.warning("RERANK_ENABLED=true but fastembed is not installed; skipping rerank")
            return chunks[:top_k]
        _encoder = TextCrossEncoder(model_name=settings.rerank_model)

    scores = list(_encoder.rerank(query, [c["content"] for c in chunks]))
    ranked = sorted(zip(scores, chunks), key=lambda pair: pair[0], reverse=True)
    return [chunk for _, chunk in ranked[:top_k]]
