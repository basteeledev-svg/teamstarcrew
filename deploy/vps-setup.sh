#!/usr/bin/env bash
# deploy/vps-setup.sh — Run ONCE on a fresh VPS to set up the game server.
# Usage: ssh root@74.208.194.76 < deploy/vps-setup.sh
set -euo pipefail

APP_DIR=/opt/teamstarcrew
DOMAIN=tss.strategic-games.com
BACKEND_PORT=8000

echo "▶ Installing system packages..."
apt-get update -qq
apt-get install -y -qq python3-pip python3-venv git curl >/dev/null

echo "▶ Creating app directory..."
mkdir -p "$APP_DIR"

echo "▶ Setting up Python venv..."
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip -q

echo "▶ Creating systemd service for game backend..."
cat > /etc/systemd/system/teamstarcrew.service <<UNIT
[Unit]
Description=TeamStarCrew Game Server
After=network.target

[Service]
Type=exec
User=root
WorkingDirectory=${APP_DIR}/backend
ExecStart=${APP_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 1
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
Environment=ALLOWED_ORIGINS=https://${DOMAIN},http://${DOMAIN}
# AI_API_KEY can be set here when the AI GPU is configured:
# Environment=AI_API_KEY=your-secret-key-here

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
echo "   ✓ teamstarcrew.service created"

# ── Plesk domain setup ────────────────────────────────────────────────────────
echo "▶ Adding domain in Plesk..."
# Create the domain (will fail gracefully if already exists)
plesk bin domain --create "$DOMAIN" -hosting true -ip_address 74.208.194.76 \
  -www-root "$APP_DIR/frontend/dist" 2>/dev/null || echo "   (domain may already exist)"

# Tell Plesk to use Let's Encrypt SSL
echo "▶ Requesting Let's Encrypt certificate..."
plesk bin extension --install letsencrypt 2>/dev/null || true
plesk bin extension --exec letsencrypt cli.php -d "$DOMAIN" -m admin@strategic-games.com 2>/dev/null || echo "   (SSL will need to be configured after DNS points here)"

# Add nginx proxy config for Plesk-managed vhost
echo "▶ Configuring nginx reverse proxy via Plesk..."
VHOST_CONF_DIR="/var/www/vhosts/system/${DOMAIN}/conf"
mkdir -p "$VHOST_CONF_DIR"

# This file is included by Plesk's generated nginx vhost config
cat > "$VHOST_CONF_DIR/vhost_nginx.conf" <<'NGINX'
# TeamStarCrew — proxy all traffic to uvicorn backend
# The backend serves the frontend static files via FastAPI StaticFiles mount

location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}

location /ws {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}

location /health {
    proxy_pass http://127.0.0.1:8000;
}

location / {
    root /opt/teamstarcrew/frontend/dist;
    try_files $uri $uri/ /index.html;
}
NGINX

# Reconfigure nginx to pick up the new vhost config
plesk bin domain --update "$DOMAIN" --custom-nginx true 2>/dev/null || true
nginx -t && systemctl reload nginx
echo "   ✓ nginx configured"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  VPS setup complete."
echo "  Now run:  deploy/push.sh"
echo "  Domain: https://${DOMAIN}"
echo "═══════════════════════════════════════════════════════"
