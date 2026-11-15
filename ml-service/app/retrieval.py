from .config import settings
from .db import pool, to_pgvector

RRF_K = 60  # standard Reciprocal Rank Fusion constant

# Natural-language questions rarely match with AND semantics, so OR the query terms.
_TSQUERY = "to_tsquery('english', replace(plainto_tsquery('english', %(q)s)::text, '&', '|'))"


def hybrid_search(
    query: str, query_vec: list[float], document_ids: list[str] | None = None
) -> list[dict]:
    """Dense (pgvector) + keyword (Postgres full-text) search, fused with RRF."""
    doc_filter = "AND c.document_id = ANY(%(doc_ids)s::uuid[])" if document_ids else ""
    params = {
        "q": query,
        "vec": to_pgvector(query_vec),
        "k": settings.candidate_k,
        "doc_ids": document_ids,
    }

    dense_sql = f"""
        SELECT c.id FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE d.status = 'ready' {doc_filter}
        ORDER BY c.embedding <=> %(vec)s::vector
        LIMIT %(k)s"""

    keyword_sql = f"""
        SELECT c.id FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE d.status = 'ready' AND c.tsv @@ {_TSQUERY} {doc_filter}
        ORDER BY ts_rank_cd(c.tsv, {_TSQUERY}) DESC
        LIMIT %(k)s"""

    with pool.connection() as conn:
        dense_ids = [r["id"] for r in conn.execute(dense_sql, params).fetchall()]
        keyword_ids = [r["id"] for r in conn.execute(keyword_sql, params).fetchall()]

        scores: dict[int, float] = {}
        for ranked in (dense_ids, keyword_ids):
            for rank, chunk_id in enumerate(ranked):
                scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
        if not scores:
            return []

        rows = conn.execute(
            """SELECT c.id, c.document_id, c.page, c.content, d.filename
               FROM chunks c JOIN documents d ON d.id = c.document_id
               WHERE c.id = ANY(%s)""",
            (list(scores),),
        ).fetchall()

    return sorted(rows, key=lambda r: scores[r["id"]], reverse=True)
