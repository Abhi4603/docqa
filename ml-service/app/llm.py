import json
from collections.abc import Iterator

import httpx

from .config import settings

_TIMEOUT = httpx.Timeout(300.0, connect=10.0)  # local models can be slow on CPU


def stream_chat(messages: list[dict]) -> Iterator[str]:
    """Yield answer tokens from the configured LLM provider."""
    if settings.llm_provider == "ollama":
        yield from _stream_ollama(messages)
    else:
        yield from _stream_openai_compatible(messages)


def _stream_ollama(messages: list[dict]) -> Iterator[str]:
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": settings.llm_temperature},
    }
    with httpx.stream("POST", f"{settings.ollama_url}/api/chat", json=body, timeout=_TIMEOUT) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            data = json.loads(line)
            if "error" in data:
                raise RuntimeError(data["error"])
            if token := data.get("message", {}).get("content"):
                yield token
            if data.get("done"):
                break


def _stream_openai_compatible(messages: list[dict]) -> Iterator[str]:
    """Works with Groq, OpenRouter, Gemini's OpenAI endpoint, Together, etc."""
    body = {
        "model": settings.llm_model,
        "messages": messages,
        "stream": True,
        "temperature": settings.llm_temperature,
    }
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    with httpx.stream("POST", url, json=body, headers=headers, timeout=_TIMEOUT) as r:
        if r.status_code >= 400:
            r.read()
            raise RuntimeError(f"LLM API error {r.status_code}: {r.text[:300]}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            choices = json.loads(payload).get("choices") or [{}]
            if token := choices[0].get("delta", {}).get("content"):
                yield token
