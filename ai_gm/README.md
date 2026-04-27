# LLM Game Master client

A standalone Python service that drives the in-game story using a local
LLM (Ollama → qwen2.5:14b-instruct by default). Talks to the FastAPI
backend over `/api/ai/*` — no game-engine imports, fully decoupled.

## Requirements

1. The backend running with `AI_API_KEY` set:
   ```bash
   ./start-backend.sh    # AI_API_KEY defaults to "devkey"
   ```
2. [Ollama](https://ollama.com) installed and serving:
   ```bash
   ollama serve &
   ollama pull qwen2.5:14b-instruct
   ```

## Running

### Local backend (everything on this Mac)

```bash
./start-gm.sh
```

This creates a venv at `ai_gm/.venv` on first run, installs `httpx`,
and launches `python -m ai_gm.gm`.

### Remote backend on the VPS, LLM on your Mac (recommended)

The Mac runs Ollama; the game itself runs on the VPS. The GM client
runs **on the Mac** but reaches the server's backend through a private
SSH tunnel — `/api/ai/*` is firewalled off from the public internet.

One-time server setup (idempotent — safe to re-run):

```bash
# Choose a strong key — must be the same one the Mac uses below.
AI_API_KEY=$(openssl rand -hex 24) ./deploy/enable-ai.sh
```

This:
1. Adds `AI_API_KEY` to the systemd drop-in for `teamstarcrew.service`.
2. Restarts the backend.
3. Ensures nginx returns 403 for `/api/ai/*` from the public internet.

Then on your Mac, every time you want to play:

```bash
ollama serve &
ollama pull qwen2.5:14b-instruct          # one-time

AI_API_KEY=<same-key-as-server> ./start-gm-remote.sh
```

`start-gm-remote.sh` opens an SSH local-forward
(`localhost:8001 → server:127.0.0.1:8000`), waits for `/health` to
respond, then runs the GM client pointed at the tunnel. Pressing
Ctrl-C closes the tunnel cleanly.

The GM will:
- Wait for the backend to report a running game.
- On first run (no `gm_memory.json`): pick one of 4 arc archetypes
  (dark-star mystery, diplomatic, transport-through-war zone, escort)
  and seed initial NPCs / annotations / opening message.
- Every ~5 sec: poll for new player messages and queue in-character
  replies with a 30–50 sec light-speed delay.
- Every ~10 min: replan story beats and inject events / move NPCs.

## Configuration (env vars)

| Variable               | Default                          | Purpose                              |
| ---------------------- | -------------------------------- | ------------------------------------ |
| `AI_API_KEY`           | `devkey`                         | Must match backend's `AI_API_KEY`    |
| `AI_GM_MODEL`          | `qwen2.5:14b-instruct`           | Ollama model tag                     |
| `AI_GM_BACKEND_URL`    | `http://localhost:8000`          | Backend root (auto-set by remote launcher) |
| `OLLAMA_URL`           | `http://localhost:11434`         | Ollama root                          |
| `AI_GM_PLAN_INTERVAL_S`| `600`                            | Replan cadence (sec)                 |
| `AI_GM_POLL_INTERVAL_S`| `5`                              | Comms-poll cadence (sec)             |
| `AI_GM_LLM_TIMEOUT`    | `120`                            | Ollama HTTP timeout (sec)            |
| `AI_GM_MEMORY_PATH`    | `gm_memory.json`                 | Persistent memory file (repo root)   |
| `AI_GM_VPS`            | `root@74.208.194.76`             | SSH target for remote launcher       |
| `AI_GM_LOCAL_PORT`     | `8001`                           | Local end of the SSH tunnel          |
| `AI_GM_REMOTE_PORT`    | `8000`                           | Backend port on the server           |

## Architecture

```
   ai_gm/
   ├── gm.py             — main async loop
   ├── llm.py            — Ollama HTTP wrapper (forced JSON output)
   ├── memory.py         — gm_memory.json persistence
   ├── prompts.py        — system prompt + 4 arc archetypes
   ├── state_summarizer.py — compress full state → ~1KB text
   └── tools.py          — schemas + dispatcher to /api/ai/* endpoints
```

The LLM is **only** called for high-level decisions (plan a beat, write a
comms reply, choose an arc). Per-tick NPC steering happens in pure
Python (`backend/game/npc_ai.py`), so a slow model can never stall the
1 Hz tick loop.

## Behaviors the GM can set on NPCs

`idle`, `patrol`, `follow`, `attack`, `flee`, `move_to`, `intercept`.

See `backend/game/npc_ai.py` for the params each accepts.

## Resetting

Delete `gm_memory.json` and restart the GM client to start a fresh arc
on the next game.
