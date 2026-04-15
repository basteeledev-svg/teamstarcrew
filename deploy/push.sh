#!/usr/bin/env bash
# deploy/push.sh — Build frontend locally and deploy to VPS.
# Usage: ./deploy/push.sh
set -euo pipefail

VPS="root@74.208.194.76"
APP_DIR="/opt/teamstarcrew"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Building frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
npm run build

echo "▶ Syncing code to VPS..."
rsync -az --delete \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  --exclude '.git' \
  --exclude 'tests' \
  --exclude 'playwright.config.js' \
  --exclude '.env' \
  "$SCRIPT_DIR/backend/" "$VPS:$APP_DIR/backend/"

rsync -az --delete \
  "$SCRIPT_DIR/frontend/dist/" "$VPS:$APP_DIR/frontend/dist/"

echo "▶ Installing Python dependencies on VPS..."
ssh "$VPS" "$APP_DIR/venv/bin/pip install -q -r $APP_DIR/backend/requirements.txt"

echo "▶ Restarting game server..."
ssh "$VPS" "systemctl restart teamstarcrew && systemctl status teamstarcrew --no-pager -l"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deploy complete.  Server is live."
echo "═══════════════════════════════════════════════════════"
