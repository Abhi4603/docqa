-- DocQA schema. Runs automatically on first start of the Docker Postgres container.
-- For Neon / Supabase: paste this file into their SQL editor once.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename      TEXT        NOT NULL,
    mime_type     TEXT,
    size_bytes    BIGINT,
    content_hash  TEXT        UNIQUE,
    status        TEXT        NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'ready', 'failed')),
    error         TEXT,
    num_chunks    INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- vector(768) matches nomic-embed-text. If you change EMBED_MODEL, change this dimension
-- (bge-m3 = 1024, all-minilm = 384) and re-ingest your documents.
CREATE TABLE IF NOT EXISTS chunks (
    id           BIGSERIAL PRIMARY KEY,
    document_id  UUID   NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index  INT    NOT NULL,
    page         INT,
    content      TEXT   NOT NULL,
    embedding    vector(768) NOT NULL,
    tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx       ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_document_idx  ON chunks (document_id);

-- Q&A log: useful later for building an evaluation set and analysing failures.
CREATE TABLE IF NOT EXISTS chat_messages (
    id          BIGSERIAL PRIMARY KEY,
    question    TEXT        NOT NULL,
    answer      TEXT,
    sources     JSONB,
    latency_ms  INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
