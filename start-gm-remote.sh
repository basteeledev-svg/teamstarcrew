#!/bin/bash
# Run the LLM Game Master on your LOCAL machine, but talk to the
# game backend running on the REMOTE server via an SSH tunnel.
#
# How it works:
#   1. Open an SSH local-forward: localhost:8001 → server's 127.0.0.1:8000
#   2. Set AI_GM_BACKEND_URL=http://localhost:8001
#   3. Run the GM client locally — Ollama still runs on this Mac.
#
# The tunnel is private to your SSH session: nothing is exposed publicly.
# The /api/ai/* routes are also blocked at the server's nginx (see
# deploy/vps-setup.sh), so even if AI_API_KEY leaked the AI surface
# can't be hit from the open internet.
#
# Override defaults by exporting before running:
#   AI_GM_VPS              — ssh target (default: root@74.208.194.76)
#   AI_GM_LOCAL_PORT       — local tunnel port (default: 8001)
#   AI_GM_REMOTE_PORT      — backend port on server (default: 8000)
#   AI_API_KEY             — must match server's env (default: devkey)
#   AI_GM_MODEL            — Ollama model tag (default: qwen2.5:14b-instruct)
#   OLLAMA_URL             — Ollama root (default: http://localhost:11434)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VPS="${AI_GM_VPS:-root@74.208.194.76}"
LOCAL_PORT="${AI_GM_LOCAL_PORT:-8001}"
REMOTE_PORT="${AI_GM_REMOTE_PORT:-8000}"

VENV="$SCRIPT_DIR/ai_gm/.venv"
if [ ! -d "$VENV" ]; then
  echo "Creating GM virtual environment..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r ai_gm/requirements.txt
fi

# ── Open SSH tunnel in background ───────────────────────────────────────
# -N: don't run a remote command
# -T: no TTY
# -o ExitOnForwardFailure=yes: bail if the port is already in use
# -o ServerAliveInterval=30: keep NAT alive
echo "▶ Opening SSH tunnel: localhost:${LOCAL_PORT} → ${VPS}:${REMOTE_PORT}"
ssh -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  "$VPS" &
TUNNEL_PID=$!

# Make sure the tunnel dies when this script does
cleanup() {
  echo ""
  echo "▶ Closing SSH tunnel (pid $TUNNEL_PID)"
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for the tunnel to become reachable (max 10s)
for i in {1..20}; do
  if curl -fsS "http://localhost:${LOCAL_PORT}/health" >/dev/null 2>&1; then
    echo "✓ Tunnel up — backend reachable at http://localhost:${LOCAL_PORT}"
    break
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "✗ SSH tunnel died. Check that you can ssh ${VPS}." >&2
    exit 1
  fi
  sleep 0.5
  if [ "$i" = 20 ]; then
    echo "✗ Tunnel up but backend not responding to /health" >&2
    exit 1
  fi
done

export AI_API_KEY="${AI_API_KEY:-devkey}"
export AI_GM_MODEL="${AI_GM_MODEL:-qwen2.5:14b-instruct}"
export AI_GM_BACKEND_URL="http://localhost:${LOCAL_PORT}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

echo "▶ Starting GM client (Ollama=${OLLAMA_URL}, backend=${AI_GM_BACKEND_URL})"
"$VENV/bin/python" -m ai_gm.gm
