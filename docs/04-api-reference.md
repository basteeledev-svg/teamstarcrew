# API Reference

> Authoritative source: routers in `backend/routers/`. This doc is generated from those files — keep in sync when adding endpoints.

## Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — returns `{"status": "ok"}` |

---

## Game Lifecycle (`/api`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/game/start` | Start a new session — generates galaxy + ship, seeds NPCs and intro messages |
| POST | `/api/game/stop` | Stop current session |
| GET  | `/api/game/state` | Public game state JSON (sanitised — no AI-only fields) |

## Ship REST helpers (`/api/ship/*`)
These are convenience wrappers; the WebSocket protocol is the primary interface.
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/ship/thrust` | `{value: 0..1}` | Set ship thrust |
| POST | `/api/ship/direction` | `{x, y, z}` | Set heading (auto-normalised) |
| POST | `/api/ship/stop` | — | Emergency stop |
| POST | `/api/ship/warp` | `{system_id}` | Warp to target system (requires capacitor charge) |

## Feedback (`/api/feedback`)
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/feedback` | `{rating, comment?, page?}` | Submit playtest feedback (appended to `feedback.jsonl`) |
| GET  | `/api/feedback` | — | List feedback entries (admin) |

---

## AI Game Master (`/api/ai/*`)

All AI endpoints require the `X-AI-Key` header. Configure on the server with the `AI_API_KEY` environment variable; on production the public reverse proxy denies `/api/ai/*` so only the SSH-tunnelled localhost can reach them (see `deploy/enable-ai.sh`).

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/ai/state` | Full game state including AI-only fields (NPC behaviour, internal targets, etc.) |
| POST   | `/api/ai/npc/spawn` | Spawn an NPC ship — body: `{name, race, size, system_id, x, z, hull_health?, role?, faction?}` |
| POST   | `/api/ai/npc/{npc_id}/move` | Set position or velocity — body: `{x?, z?, vx?, vz?}` |
| POST   | `/api/ai/npc/{npc_id}/behavior` | Set behaviour tree state — body: `{behavior, target_id?, waypoint?, patrol_points?, speed?, weapon_range_au?, flee_distance_au?}`. `behavior` ∈ `idle / patrol / follow / attack / flee / move_to / intercept`. |
| DELETE | `/api/ai/npc/{npc_id}` | Despawn NPC |
| POST   | `/api/ai/event` | Inject a game event — body: `{event_type, title, description, system_id?, position?}` |
| POST   | `/api/ai/message` | Inject a comms message — body: `{from_name, subject, body, from_id?, has_video?, video_color?, deliver_in_seconds?}`. `deliver_in_seconds > 0` queues delivery via `pending_messages` (drained by `tick.py`). |
| POST   | `/api/ai/galaxy/system/{system_id}/annotate` | Attach AI annotations — body: `{story_note?, faction_control?, threat_level?, points_of_interest?}` |

---

## WebSocket Protocol

Connect: `ws://{host}/ws`

All commands are JSON `{type, ...}`. Server replies with `{type: "ack", ...}` on success, `{type: "error", detail}` on failure. State broadcasts arrive as `{type: "state", ...}` at ~1 Hz.

### Navigation
| Command | Fields | Description |
|---------|--------|-------------|
| `set_thrust` | `value` (0–1) | Set thrust fraction |
| `set_target_direction` | `x, y, z` | Set heading (auto-normalised) |
| `stop` | — | Emergency stop |
| `warp` | `system_id` | Warp to system |
| `orbit` | `planet_id` | Enter orbit (must be ≤ `ORBIT_DISTANCE_AU`) |
| `leave_orbit` | — | Exit orbit |

### Power & Reactors
| Command | Fields |
|---------|--------|
| `set_reactor_output` | `reactor`, `value` (0–1) |
| `set_engine_output` | `engine`, `value` (0–1) |
| `set_power_allocation` | `allocations` (all keys) |
| `toggle_power_lock` | `station` |
| `set_gw_lock` | `station`, `gw_target` (or null) |

### Transport
| Command | Fields |
|---------|--------|
| `transport_items` | `source`, `dest`, `item`, `amount`, `bot_id?`, `trips?` |
| `cancel_transport` | `bot_id` |
| `charge_transport` | `bot_id` |
| `build_transport_bot` | — |
| `repair_transport_bot` | `bot_id`, `amount` |

`source` / `dest` can be any room key or `"planet"` (when orbiting). Planet trips take `TRANSPORT_TRAVEL_TICKS × 2`.

### Repair Bots
| Command | Fields |
|---------|--------|
| `dispatch_repair_bot` | `bot_id`, `target` |
| `recall_repair_bot` | `bot_id` |

`target` ∈ `{type: "system"|"room_hull"|"outer_hull"|"bot"|"item", ...}`.

### Mining
| Command | Fields |
|---------|--------|
| `set_mining_bots` | `resource`, `value` |

### Manufacturing
| Command | Fields |
|---------|--------|
| `set_manufacturing_alloc` | `item`, `pct` |

### Hull Components
| Command | Fields |
|---------|--------|
| `install_component` | `section`, `role`, `station` |
| `uninstall_component` | `section`, `role`, `component_id` |

### Shields & Weapons
| Command | Fields |
|---------|--------|
| `set_shields_section_alloc` | `alloc` (6 sides) |
| `set_shields_component_alloc` | `section`, `alloc` |
| `set_weapons_alloc` | `targeting_pct?`, `section_alloc?` |
| `set_weapons_component_alloc` | `section`, `alloc` |
| `set_weapons_target` | `target_id` (or null) |
| `fire_missile` | `target_id` |

### Communications
| Command | Fields |
|---------|--------|
| `send_message` | `to_id`, `subject`, `body` (max 200 / 2000) |
| `mark_read` | `message_id` |

### Utility
| Command | Fields |
|---------|--------|
| `ping` | — (returns `pong`) |

---

## Key Constants

Broadcast under `state.constants`. Full list in `backend/game/constants.py`.

| Constant | Value | Description |
|----------|-------|-------------|
| MAX_REACTOR_OUTPUT_GW | 1,000 | GW per reactor at 100% |
| REACTOR_COUNT | 4 | Number of reactors |
| BATTERY_CAPACITY_GW | 100 | GW per battery unit |
| FUEL_ENGINE_MAX_THRUST_AU | 0.025 | Fuel engine thrust at 100% |
| ELEC_ENGINE_MAX_THRUST_AU | 0.0125 | Electric engine thrust at 100% |
| WARP_CAPACITOR_MAX_GW | 100,000 | Max warp charge |
| WARP_CAPACITOR_LEAK_GW | 0.5 | Passive warp leak per tick |
| WARP_COST_BASE | 100 | Warp cost formula base |
| WARP_COST_EXPONENT | 1.3 | Warp cost formula exponent |
| MINING_BOTS_MAX | 20 | Max bots per resource |
| CHARGING_BAY_CHARGE_RATE_PER_GW | 2.0 | Charge per GW per bot per tick |
| ROOM_CAPACITY_STANDARD | 10,000 | Standard room capacity |
| ROOM_CAPACITY_LARGE | 100,000 | Cargo bay / manufacturing capacity |
| ORBIT_DISTANCE_AU | 0.5 | Max distance to enter orbit |
| TRANSPORT_TRAVEL_TICKS | 5 | Ticks per transport phase (×2 for planet) |
| REPAIR_BOT_REPAIR_RATE | 0.5 | HP repaired per tick per bot |
| SECTION_COMPONENT_CAP | 5 | Max components per type per hull section |
| NPC_SHIPS_PER_SYSTEM_MIN/MAX | 2 / 5 | NPC seed range (starting system only; AI GM spawns elsewhere) |
