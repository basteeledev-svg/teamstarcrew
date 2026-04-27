#!/bin/bash
# Run the LLM Game Master client. Requires:
#   1. The backend running (start-backend.sh) with AI_API_KEY set.
#   2. Ollama running locally (`ollama serve`) with a model pulled, e.g.:
#         ollama pull qwen2.5:14b-instruct
#
# Override defaults by exporting before running:
#   AI_API_KEY          — must match the backend (default: devkey)
#   AI_GM_MODEL         — Ollama model tag    (default: qwen2.5:14b-instruct)
#   AI_GM_BACKEND_URL   — backend root        (default: http://localhost:8000)
#   OLLAMA_URL          — Ollama root         (default: http://localhost:11434)
#   AI_GM_PLAN_INTERVAL_S — replan cadence    (default: 600)
#   AI_GM_POLL_INTERVAL_S — comms-poll cadence (default: 5)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV="$SCRIPT_DIR/ai_gm/.venv"
if [ ! -d "$VENV" ]; then
  echo "Creating GM virtual environment..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r ai_gm/requirements.txt
fi

export AI_API_KEY="${AI_API_KEY:-devkey}"
export AI_GM_MODEL="${AI_GM_MODEL:-qwen2.5:14b-instruct}"
export AI_GM_BACKEND_URL="${AI_GM_BACKEND_URL:-http://localhost:8000}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

exec "$VENV/bin/python" -m ai_gm.gm
