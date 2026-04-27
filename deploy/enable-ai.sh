#!/usr/bin/env bash
# deploy/enable-ai.sh — Enable AI integration on the VPS.
#
# Adds AI_API_KEY to the systemd unit and restarts the backend, so the
# /api/ai/* routes start responding (instead of returning 503).
#
# The key you choose here MUST match what the local GM client sends:
# the GM client reads it from the AI_API_KEY env var (default "devkey").
#
# Usage:
#   ./deploy/enable-ai.sh                    # uses default key "devkey"
#   AI_API_KEY=mysecret ./deploy/enable-ai.sh
#
# Also installs the public-/api/ai-block in nginx if it isn't already
# in place (idempotent — safe to re-run).
set -euo pipefail

VPS="${AI_GM_VPS:-root@74.208.194.76}"
KEY="${AI_API_KEY:-devkey}"

echo "▶ Setting AI_API_KEY on $VPS via systemd drop-in"
ssh "$VPS" "bash -s" <<EOF
set -euo pipefail
mkdir -p /etc/systemd/system/teamstarcrew.service.d
cat > /etc/systemd/system/teamstarcrew.service.d/ai.conf <<UNIT
[Service]
Environment=AI_API_KEY=${KEY}
UNIT
chmod 600 /etc/systemd/system/teamstarcrew.service.d/ai.conf
systemctl daemon-reload
systemctl restart teamstarcrew
echo "  ✓ teamstarcrew restarted with AI_API_KEY set"
EOF

echo "▶ Ensuring /api/ai/* is blocked from public internet (only reachable via SSH tunnel)"
ssh "$VPS" "bash -s" <<'EOF'
set -euo pipefail
DOMAIN=tss.strategic-games.com
VHOST_CONF="/var/www/vhosts/system/${DOMAIN}/conf/vhost_nginx.conf"
if [ ! -f "$VHOST_CONF" ]; then
    echo "  ! $VHOST_CONF not found — run deploy/vps-setup.sh first"
    exit 1
fi
if grep -q "location /api/ai/" "$VHOST_CONF"; then
    echo "  ✓ /api/ai/ block already present"
else
    # Insert the deny block just before the existing /api/ block
    python3 - "$VHOST_CONF" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()
needle = "location /api/ {"
block = (
    "location /api/ai/ {\n"
    "    deny all;\n"
    "    return 403;\n"
    "}\n\n"
)
if needle in src and "location /api/ai/" not in src:
    src = src.replace(needle, block + needle, 1)
    p.write_text(src)
    print("  ✓ /api/ai/ block inserted")
else:
    print("  (no insert needed)")
PY
    nginx -t && systemctl reload nginx
fi
EOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  AI integration enabled on server."
echo "  Key: ${KEY}"
echo ""
echo "  Run on your Mac:"
echo "    ollama serve &"
echo "    ollama pull qwen2.5:14b-instruct"
echo "    AI_API_KEY=${KEY} ./start-gm-remote.sh"
echo "═══════════════════════════════════════════════════════"
