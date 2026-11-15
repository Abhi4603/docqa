# DocQA: Document Question Answering (RAG)

Upload documents, ask questions, get answers grounded in your documents with clickable citations.
100% free stack: local LLM + local embeddings + Postgres.

## Architecture (hybrid)

```
React (Vite, :5173) ──► Express API (:4000) ──► Python ML service (FastAPI, :8000)
                              │                         │
                              └──────► Postgres + pgvector ◄──┘        Ollama (:11434)
                                       (documents, chunks,            (embeddings + LLM)
                                        vectors, full-text, chat log)
```

| Part | Responsibility |
|---|---|
| `client/` React | Upload UI, document list, chat with streaming answers and source cards |
| `server/` Express | The app API: uploads, dedupe, file storage, document CRUD, chat proxy + logging |
| `ml-service/` FastAPI | AI only: parse → chunk → embed → store; hybrid retrieval → rerank → LLM |
| Postgres + pgvector | Single database: metadata, vectors (HNSW), keyword index (GIN/tsvector) |

**Ingest:** React → `POST /api/documents` → Express saves the file, creates a `documents` row (`processing`),
forwards it to `POST /ingest` → Python parses, chunks, embeds, writes `chunks`, marks it `ready`.

**Query:** React → `POST /api/chat` → Express → `POST /query` → Python: embed question → vector search +
keyword search → Reciprocal Rank Fusion → (optional rerank) → LLM with numbered sources → streams
NDJSON events (`sources`, `token`…, `done`) back through Express to the browser.

## Prerequisites

1. **Node 20+** and **Python 3.12**
2. **Ollama**: https://ollama.com/download, then:
   ```bash
   ollama pull nomic-embed-text
   ollama pull qwen2.5:7b
   ```
   (Low RAM? Use `qwen2.5:3b` and set `LLM_MODEL=qwen2.5:3b`.)
3. **Postgres with pgvector**, pick one:
   - **Docker Desktop**: `docker compose up -d` (schema is created automatically)
   - **Neon** (neon.tech) or **Supabase** (both free): create a project, run `db/init.sql` in their
     SQL editor, and put the connection string (with `?sslmode=require`) in `DATABASE_URL`

## Run (3 terminals)

```bash
cp .env.example .env
```

**ML service**
```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

**API**
```bash
cd server
npm install
npm run dev
```

**Client**
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. Health check: http://localhost:4000/api/health.
FastAPI's interactive docs: http://localhost:8000/docs.

## Configuration

All settings live in `.env` (see `.env.example`):

- **Use a free cloud LLM instead of local:** set `LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_API_KEY`,
  `LLM_MODEL` (Groq, OpenRouter, Gemini's OpenAI-compatible endpoint all work). Embeddings still use Ollama.
- **Reranking:** `pip install fastembed`, then `RERANK_ENABLED=true` (+ raise `CANDIDATE_K`).
- **Different embedding model:** change `EMBED_MODEL` *and* `vector(768)` in `db/init.sql`, then re-ingest.

## Roadmap

- [x] Phase 1: upload, chunking, pgvector + full-text hybrid search, streaming cited answers
- [x] Query rewriting for follow-up questions (use chat history to rewrite the search query)
- [ ] Parent/child chunks, OCR for scanned PDFs, table-aware parsing (docling)
- [ ] Evaluation set + metrics (Recall@k, faithfulness) from the `chat_messages` log
- [ ] Auth + per-user document access (filter by `owner_id` inside the SQL query)
- [ ] Job queue (Redis/BullMQ or Celery) instead of in-process background tasks
