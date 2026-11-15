import logging

from .chunking import chunk_text
from .config import settings
from .db import pool, to_pgvector
from .embeddings import embed
from .parsing import clean, parse

log = logging.getLogger(__name__)


def ingest_document(document_id: str, filename: str, data: bytes) -> None:
    """Parse -> clean -> chunk -> embed -> store. Runs as a background task.
    Idempotent: re-running replaces the document's chunks."""
    try:
        records: list[tuple[int | None, str]] = []
        for page, text in parse(data, filename):
            for chunk in chunk_text(clean(text), settings.chunk_size, settings.chunk_overlap):
                records.append((page, chunk))

        if not records:
            raise ValueError("No extractable text found (scanned PDFs need OCR, not supported yet)")

        # Prefix each chunk with its source so the embedding carries document context.
        embed_inputs = [
            f"{filename}{f' (page {page})' if page else ''}\n{content}" for page, content in records
        ]
        vectors = embed(embed_inputs, kind="document")

        with pool.connection() as conn:  # commits on success, rolls back on error
            conn.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))
            with conn.cursor() as cur:
                cur.executemany(
                    """INSERT INTO chunks (document_id, chunk_index, page, content, embedding)
                       VALUES (%s, %s, %s, %s, %s::vector)""",
                    [
                        (document_id, i, page, content, to_pgvector(vec))
                        for i, ((page, content), vec) in enumerate(zip(records, vectors))
                    ],
                )
            conn.execute(
                """UPDATE documents SET status = 'ready', num_chunks = %s, error = NULL,
                   updated_at = now() WHERE id = %s""",
                (len(records), document_id),
            )
        log.info("Ingested %s: %d chunks", filename, len(records))

    except Exception as exc:
        log.exception("Ingestion failed for %s", filename)
        with pool.connection() as conn:
            conn.execute(
                "UPDATE documents SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
                (str(exc)[:1000], document_id),
            )
