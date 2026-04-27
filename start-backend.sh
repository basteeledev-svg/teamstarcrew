#!/bin/bash
# Run from anywhere — starts backend on port 8000
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

# Default AI key for local dev so the GM client can authenticate.
# Override by exporting AI_API_KEY before running this script.
export AI_API_KEY="${AI_API_KEY:-devkey}"

exec .venv/bin/uvicorn main:app --reload --port 8000
