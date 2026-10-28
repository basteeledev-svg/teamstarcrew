# Cloudflare Tunnel Setup for TeamStarCrew

This project now supports deployment on either:
- sim.steeledev.org (recommended)
- steeledev.org/sim (subpath mode)

## Why subdomain is recommended
Subdomain mode is simpler and less risky because TeamStarCrew can own root paths (/api, /ws, static assets) without colliding with other apps on steeledev.org.

## Prerequisites
1. Cloudflare tunnel already created.
2. Tunnel credentials file copied to your server:
- /etc/cloudflared/<TUNNEL_ID>.json
3. Backend running on localhost:8000.

## Quick install
From this repo on the server:

Subdomain mode:
```bash
sudo ./deploy/cloudflared/install-cloudflared-service.sh subdomain <TUNNEL_ID>
cloudflared tunnel route dns <TUNNEL_NAME> sim.steeledev.org
```

Path mode:
```bash
sudo ./deploy/cloudflared/install-cloudflared-service.sh path <TUNNEL_ID> <EXISTING_ORIGIN_HOST>
cloudflared tunnel route dns <TUNNEL_NAME> steeledev.org
```

Where EXISTING_ORIGIN_HOST is where non-/sim traffic should go, for example:
- www.steeledev.org
- steeledev.pages.dev

## Frontend base path
For path mode, build frontend with:
```bash
cd frontend
VITE_BASE_PATH=/sim npm run build
```

For subdomain mode, use default root base path:
```bash
cd frontend
npm run build
```

## What changed in this project
- Frontend API and websocket paths now honor VITE_BASE_PATH.
- Backend exposes mirrored routes under /sim:
  - /sim/api/*
  - /sim/ws
- Static frontend can be served from both / and /sim.

## Validation checks
After deployment:
1. https://sim.steeledev.org/health or https://steeledev.org/sim/health should return {"status":"ok"}.
2. Websocket should connect successfully from the game UI.
3. Start game from UI and confirm live tick updates.
