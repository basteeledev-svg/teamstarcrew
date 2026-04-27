"""Game Master client.

A small standalone Python service that drives the LLM-based Game Master.
Runs separately from the FastAPI server so a slow LLM can never stall
the tick loop. Talks to:

  * the backend over HTTP (`/api/ai/*`, authenticated via X-AI-Key)
  * Ollama on localhost:11434

Architecture:
    ┌─────────────────┐  HTTP   ┌─────────────────┐  HTTP   ┌─────────┐
    │  ai_gm.gm loop  │────────▶│  Backend FastAPI │         │  Ollama │
    │  (this client)  │◀────────│   /api/ai/*      │         │  qwen2.5│
    └────────┬────────┘         └─────────────────┘         └────▲────┘
             │ HTTP                                              │
             └──────────────────────────────────────────────────┘
"""
