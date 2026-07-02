# Open Questions

> Live list of unresolved design / engineering questions for the **AI Game Master era** and the run-up to playtests.
> Resolved historical Q&A (Q1–Q31, QN1–QN6) is archived in `QUESTIONS-archive.md`.

---

## AI Game Master

### Q-AI-1: Polling vs. WebSocket for the GM client
The GM client (`ai_gm/gm.py`) currently HTTP-polls `GET /api/ai/state` every ~5 s. Should it instead subscribe to `/ws` for push events? Polling is simpler and stateless; WS would reduce latency on combat/comms reactions.

Answer: Please update everything to websockets

### Q-AI-2: Behaviour persistence across warp
NPC `behavior` blocks live on the NPC dict. When the player warps to a new system the NPCs in the old system stay there. Should `attack`/`flee` targeting `"player"` automatically reset to `idle` on system change, or is it acceptable to leave them locked-on (they'll just sit forever)?

Answer: Go ahead an leave the state how it is, if the players return to that system we want the people who were angry to still be angry

### Q-AI-3: GM "panic shutdown"
If the LLM produces a bad arc (spam messages, runaway NPC spawns), is there a one-shot kill switch? Right now only `Ctrl-C` on the GM client stops it; the spawned NPCs and queued `pending_messages` remain on the server.

Answer: What would you suggest as far as monitering the AI so it can't mess up the game?

### Q-AI-4: GM memory longevity
`gm_memory.json` survives between sessions. Is that desirable, or should the AI GM start fresh every time the backend `/api/game/start` runs? Should `gm_memory.json` be cleared when a new session starts?

Answer: I would like it to be a new game generated every time, including which alien factions like/dislike eachother, how they speak what they value. This should all be generated at game start. Sometime fulborg will be very warlike, sometime they will be diplomatic. Sometimes races can be fearfull or backstabbing or obsessed with honor.

### Q-AI-5: Multiple concurrent arcs
`prompts.py` has 4 archetypes (`dark_star`, `diplomatic`, `transport`, `escort`). Currently one arc runs at a time. Should the GM weave 2–3 arcs in parallel for richer sandbox feel?

There should be many sidequests which could bring up different arcs if the players choose to follow those, for example they may come across a derilict ship that has passengers the players could transport to the nearest settled planet if they choose. Or NPCs could ask for help in a violent dispute and the players have to decide which side to take, if any.

---

## Alien Communication Videos

### Q-VID-1: File format & storage
Videos for comms messages — what container/codec (MP4/H.264 vs WebM)? Where do they live: `frontend/public/videos/aliens/` (shipped with the build) or served from the backend (so the GM can drop new ones live)?

We need to discuss this. I would love custom generated videos where the NPCs actually look like they are saying what is generated but I'm not sure how to do that or if it is reasonable.

### Q-VID-2: Trigger contract
The `/api/ai/message` endpoint accepts `has_video: bool` and `video_color: str`. How does the frontend know **which** video to play — is the colour a lookup key, or do we need a `video_id` / `video_url` field?

I don't know set it up however is easiest and change whatever you need to in the code. It was generated and may be incorrect.

### Q-VID-3: UI placement
Should videos play inline in the Communications panel, or pop a fullscreen modal that demands the crew's attention? Auto-play on receipt, or only when the message is opened?

Messages should pop up on the communications and when they are opened they should be able to be shared with the whole crew if the comms officer decides it is necessary.

---

## Frontend / UX

### Q-UX-1: Tutorial / first-time crew onboarding
Brand-new crew sit down at 13 stations they've never seen. Do we need a 30-second cold-open per station (interactive tooltip walkthrough), a printed quick-card, or just trust the GM to narrate? 

Answer: I would like a 10 min or so sandbox with full resources before the game starts where the players can get used to the ship before bringing the GM in.

### Q-UX-2: Game-over restart flow
`hullHealth ≤ 0` shows the game-over overlay. Restart re-runs `/api/game/start` — does that regenerate the galaxy, or should we keep the same galaxy and just respawn the ship?

For now just do a game over screen then they can restart after

### Q-UX-3: `design-review.html` (root, 46 KB standalone)
Is this an active tool we should keep / move into `frontend/`, or a leftover artifact safe to delete? It is not referenced by any code path.

You can delete this

### Q-UX-4: `StyleLabPage.jsx` (1167 LOC)
Lab/theme experiment page reachable from the landing screen. Keep visible to playtesters or hide behind an admin gate?

This can be removed as well

---

## Architecture

### Q-ARCH-1: Multi-ship door
Q23 left it open. With AI GM now driving NPCs, do we still want to design for player-controlled allied ships, or has that quietly become "the GM controls every other ship"?

We still want the door open to have multiple teams in the same galaxy

### Q-ARCH-2: AI auth in dev vs. prod
`start-backend.sh` defaults `AI_API_KEY=devkey`. Production uses a real key plus an Nginx deny on `/api/ai/*` (see `deploy/enable-ai.sh`) so only the SSH tunnel works. Worth documenting this two-layer model in a deploy README so future-us doesn't accidentally expose it?

Yes

### Q-ARCH-3: Tick-rate dependence on LLM latency
Game runs at 1 Hz. If the LLM takes 8 s to plan, the GM is 8 ticks behind reality. Acceptable, or do we want the GM to pre-fetch its next move while the previous one is still resolving?

It should be acceptable we need to do a lot of testing for how fast different models and options for machines are.
