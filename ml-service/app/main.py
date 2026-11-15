import logging
from contextlib import asynccontextmanager
from typing import Literal
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .db import pool
from .ingest import ingest_document
from .parsing import SUPPORTED_EXTENSIONS
from .rag import answer_stream

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="DocQA ML Service", lifespan=lifespan)


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_ids: list[UUID] | None = None
    history: list[HistoryTurn] = Field(default_factory=list, max_length=20)


@app.get("/health")
def health():
    with pool.connection() as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


@app.post("/ingest", status_code=202)
async def ingest(
    background: BackgroundTasks,
    document_id: UUID = Form(...),
    file: UploadFile = File(...),
):
    filename = file.filename or "document"
    if not any(filename.lower().endswith(ext) for ext in SUPPORTED_EXTENSIONS):
        raise HTTPException(400, f"Supported types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    background.add_task(ingest_document, str(document_id), filename, data)
    return {"document_id": str(document_id), "status": "processing"}


@app.post("/query")
def query(req: QueryRequest):
    return StreamingResponse(
        answer_stream(
            req.question,
            [str(d) for d in req.document_ids or []],
            [h.model_dump() for h in req.history],
        ),
        media_type="application/x-ndjson",
    )
