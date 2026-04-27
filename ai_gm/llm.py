"""Thin async wrapper around Ollama's /api/chat endpoint.

We use the native Ollama HTTP API (not the OpenAI-compatible shim) so we
can take advantage of `format: "json"` for structured output. Qwen 2.5
14B Q4_K_M is reliable at JSON-mode generation for prompts under ~4K tokens.
"""

import json
import os
from typing import Any, Optional

import httpx

OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("AI_GM_MODEL", "qwen2.5:14b-instruct")
DEFAULT_TIMEOUT_S = float(os.getenv("AI_GM_LLM_TIMEOUT", "120"))


class LLMClient:
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        url: str = OLLAMA_URL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.model     = model
        self.url       = url.rstrip("/")
        self._client   = httpx.AsyncClient(timeout=timeout_s)

    async def close(self) -> None:
        await self._client.aclose()

    async def chat_json(
        self,
        system: str,
        user: str,
        temperature: float = 0.7,
        max_tokens: int = 1500,
    ) -> dict[str, Any]:
        """Send a chat with JSON-mode forced on. Returns the parsed dict.

        Raises RuntimeError if the model returns invalid JSON.
        """
        payload = {
            "model":   self.model,
            "stream":  False,
            "format":  "json",
            "options": {
                "temperature":  temperature,
                "num_predict":  max_tokens,
            },
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
        }
        r = await self._client.post(f"{self.url}/api/chat", json=payload)
        r.raise_for_status()
        data    = r.json()
        content = data.get("message", {}).get("content", "")
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"LLM returned non-JSON content: {content[:400]!r}"
            ) from e

    async def health(self) -> bool:
        try:
            r = await self._client.get(f"{self.url}/api/tags", timeout=5.0)
            return r.status_code == 200
        except Exception:
            return False
