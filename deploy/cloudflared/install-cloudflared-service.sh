#!/usr/bin/env bash
set -euo pipefail

# Installs cloudflared as a systemd service using one of the provided config templates.
#
# Usage:
#   sudo ./deploy/cloudflared/install-cloudflared-service.sh subdomain <TUNNEL_ID>
#   sudo ./deploy/cloudflared/install-cloudflared-service.sh path <TUNNEL_ID> <EXISTING_ORIGIN>
#
# Notes:
# - Expects cloudflared credentials at /etc/cloudflared/<TUNNEL_ID>.json
# - For path mode, EXISTING_ORIGIN example: www.steeledev.org or steeledev.pages.dev

MODE="${1:-}"
TUNNEL_ID="${2:-}"
EXISTING_ORIGIN="${3:-}"

if [[ -z "$MODE" || -z "$TUNNEL_ID" ]]; then
  echo "Usage: $0 <subdomain|path> <TUNNEL_ID> [EXISTING_ORIGIN]"
  exit 1
fi

if [[ "$MODE" != "subdomain" && "$MODE" != "path" ]]; then
  echo "MODE must be subdomain or path"
  exit 1
fi

if [[ "$MODE" == "path" && -z "$EXISTING_ORIGIN" ]]; then
  echo "Path mode requires EXISTING_ORIGIN"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install it first:"
  echo "  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null"
  echo "  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared stable main' | sudo tee /etc/apt/sources.list.d/cloudflared.list"
  echo "  sudo apt-get update && sudo apt-get install -y cloudflared"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p /etc/cloudflared

if [[ "$MODE" == "subdomain" ]]; then
  cp "$SCRIPT_DIR/config.sim-subdomain.example.yml" /etc/cloudflared/config.yml
else
  cp "$SCRIPT_DIR/config.sim-path.example.yml" /etc/cloudflared/config.yml
  sed -i "s|YOUR_EXISTING_STEELEDEV_ORIGIN|$EXISTING_ORIGIN|g" /etc/cloudflared/config.yml
fi

sed -i "s|YOUR_TUNNEL_ID|$TUNNEL_ID|g" /etc/cloudflared/config.yml

if [[ ! -f "/etc/cloudflared/${TUNNEL_ID}.json" ]]; then
  echo "Missing credentials file: /etc/cloudflared/${TUNNEL_ID}.json"
  echo "Create tunnel auth first (cloudflared tunnel login / cloudflared tunnel create)."
  exit 1
fi

cloudflared service install || true
systemctl daemon-reload
systemctl enable cloudflared
systemctl restart cloudflared
systemctl --no-pager --full status cloudflared

echo ""
echo "Cloudflared configured in ${MODE} mode."
echo "Config: /etc/cloudflared/config.yml"
