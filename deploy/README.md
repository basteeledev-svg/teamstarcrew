# Deploy

Production target: `tss.strategic-games.com` on a small VPS, running the FastAPI
app behind Plesk-managed Nginx as a `systemd` service.

| Script | Purpose |
|--------|---------|
| `vps-setup.sh` | One-shot bootstrap: creates `/opt/teamstarcrew`, the systemd unit, the Nginx reverse-proxy config (with the `/api/ai/*` deny block baked in), and Python venv. |
| `push.sh` | Day-to-day deploy: rsync repo → VPS, `pip install -r requirements.txt`, `npm run build` for the frontend, `systemctl restart teamstarcrew.service`. |
| `enable-ai.sh` | Enables the LLM Game Master path: writes a systemd drop-in with `AI_API_KEY=…` and refreshes the Nginx deny block. Run **once** per server, or whenever the key rotates. |

---

## AI Game Master — two-layer auth

The AI endpoints (`/api/ai/*`) must NEVER be reachable from the public internet.
Two independent layers protect them:

### Layer 1 — Application: `X-AI-Key` header
- The `routers/ai.py` `_check_auth()` rejects any request without a matching `X-AI-Key`.
- Server-side key: `AI_API_KEY` env var, set by `enable-ai.sh` as a systemd drop-in (`/etc/systemd/system/teamstarcrew.service.d/ai.conf`).
- Client-side key: same value, read by `ai_gm/tools.py BackendClient` from the `AI_API_KEY` env var on the dev machine.
- In dev, `start-backend.sh` defaults the key to `devkey` so local testing works without any setup.

### Layer 2 — Reverse proxy: Nginx deny
- `vps-setup.sh` and `enable-ai.sh` both install an Nginx `location /api/ai/` block that returns `403`.
- This means even if `AI_API_KEY` ever leaks, public traffic still cannot reach the AI endpoints.

### How the GM client reaches the protected endpoints
The GM runs on the dev workstation, NOT on the VPS, because it talks to local Ollama.
`start-gm-remote.sh` opens an SSH local-forward:

```
localhost:8001  →  vps:127.0.0.1:8000
```

The forwarded socket comes in on the VPS as a loopback connection, which bypasses Nginx entirely (Nginx is only on `:80`/`:443`). The GM points `AI_GM_BACKEND_URL=http://localhost:8001` and includes `X-AI-Key`, so:

1. Public internet can hit `/api/ai/*` → blocked by Nginx (Layer 2).
2. Anyone with the SSH key can hit Uvicorn directly via the tunnel → still needs `X-AI-Key` (Layer 1).
3. A leaked `X-AI-Key` alone is useless — there's no public path through Nginx.

### Rotating the key
1. `ssh root@vps "vi /etc/systemd/system/teamstarcrew.service.d/ai.conf"` — change `AI_API_KEY=`.
2. `systemctl daemon-reload && systemctl restart teamstarcrew.service` on the VPS.
3. `export AI_API_KEY=<new>` on the dev machine before running `start-gm-remote.sh`.

---

## Common workflow

```sh
# Local dev
./start-backend.sh            # uvicorn :8000, AI_API_KEY=devkey
./start-frontend.sh           # vite :5173
./start-gm.sh                 # GM points at localhost:8000

# Deploy
./deploy/push.sh              # rsync + restart

# GM against production
export AI_API_KEY=<real-key>
./start-gm-remote.sh          # opens SSH tunnel and runs GM
```
