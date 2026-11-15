from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Looks for .env in ml-service/ first, then the project root.
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql://docqa:docqa@localhost:5432/docqa"

    ollama_url: str = "http://localhost:11434"
    embed_model: str = "nomic-embed-text"

    llm_provider: Literal["ollama", "openai"] = "ollama"
    llm_model: str = "qwen2.5:7b"
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_temperature: float = 0.1

    rerank_enabled: bool = False
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"

    chunk_size: int = 1500  # characters (~375 tokens)
    chunk_overlap: int = 200
    candidate_k: int = 30  # candidates per retriever before fusion
    top_k: int = 6  # chunks sent to the LLM


settings = Settings()
