# API Reference

## REST Endpoints

### Game Lifecycle
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/state` | Current game state as JSON |
| POST | `/api/start` | Start a new game session (generates galaxy + ship) |
| POST | `/api/stop` | Stop current game |
| POST | `/api/join` | Player join (returns station assignment) |

### Ship Actions (REST)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ship/warp` | Warp to target system (deducts capacitor charge) |

### AI Game Master
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/spawn_npc` | Spawn NPC ship in a system |
| POST | `/api/ai/despawn_npc` | Remove NPC ship |
| POST | `/api/ai/send_message` | Inject message into comms |
| POST | `/api/ai/annotate_system` | Add AI annotation to a star system |
| POST | `/api/ai/inject_event` | Trigger a game event |

All AI endpoints require `X-AI-Key` header authentication.

---

## WebSocket Protocol

Connect: `ws://{host}/ws`

All commands are JSON objects with a `type` field. Server responds with `{type: "ack", ...}` on success or `{type: "error", detail: "..."}` on failure. Game state broadcasts arrive as `{type: "state", ...}`.

### Navigation & Movement
| Command | Fields | Description |
|---------|--------|-------------|
| `set_thrust` | `value` (0–1) | Set ship thrust fraction |
| `set_target_direction` | `x, y, z` | Set heading (auto-normalized) |
| `stop` | — | Emergency stop (thrust → 0) |
| `warp` | `system_id` | Warp to star system |
| `orbit` | `planet_id` | Enter orbit (must be within 0.5 AU) |
| `leave_orbit` | — | Exit orbit |

### Power & Reactors
| Command | Fields | Description |
|---------|--------|-------------|
| `set_reactor_output` | `reactor`, `value` (0–1) | Set reactor output fraction |
| `set_engine_output` | `engine`, `value` (0–1) | Set individual engine output |
| `set_power_allocation` | `allocations` (all 12 keys) | Update power distribution |
| `toggle_power_lock` | `station` | Toggle % lock on a station |
| `set_gw_lock` | `station`, `gw_target` (or null) | Set/clear GW lock |

### Transport
| Command | Fields | Description |
|---------|--------|-------------|
| `transport_items` | `source`, `dest`, `item`, `amount`, `bot_id?`, `trips?` | Queue transport job |
| `cancel_transport` | `bot_id` | Cancel active transport job |
| `charge_transport` | `bot_id` | Recall bot to charging bay |
| `build_transport_bot` | — | Build from manufacturing materials |
| `repair_transport_bot` | `bot_id`, `amount` | Repair a transport bot |

Source/dest can be any room key or `"planet"` (when orbiting). Planet trips use double travel time.

### Repair Bots
| Command | Fields | Description |
|---------|--------|-------------|
| `dispatch_repair_bot` | `bot_id`, `target` | Send bot to repair target |
| `recall_repair_bot` | `bot_id` | Recall bot to charging bay |

Target format: `{type: "system"|"room_hull"|"outer_hull"|"bot"|"item", key/room/side/...}`

### Mining
| Command | Fields | Description |
|---------|--------|-------------|
| `set_mining_bots` | `resource`, `value` | Set mining bot count for a resource (assigns/unassigns entities) |

### Manufacturing
| Command | Fields | Description |
|---------|--------|-------------|
| `set_manufacturing_alloc` | `item`, `pct` | Set % of manufacturing GW for an item |

### Hull Components
| Command | Fields | Description |
|---------|--------|-------------|
| `install_component` | `section`, `role`, `station` | Queue component install (progress-based) |
| `uninstall_component` | `section`, `role`, `component_id` | Queue component uninstall |

### Shields & Weapons
| Command | Fields | Description |
|---------|--------|-------------|
| `set_shields_section_alloc` | `alloc` ({6 sides}) | Set shield GW distribution per hull side |
| `set_shields_component_alloc` | `section`, `alloc` | Set per-component weights within a section |
| `set_weapons_alloc` | `targeting_pct?`, `section_alloc?` | Set weapons targeting % and section distribution |
| `set_weapons_component_alloc` | `section`, `alloc` | Set per-component weights for offense lasers |
| `set_weapons_target` | `target_id` (or null) | Lock/unlock weapons target |
| `fire_missile` | `target_id` | Fire missile at NPC target |

### Communications
| Command | Fields | Description |
|---------|--------|-------------|
| `send_message` | `to_id`, `subject`, `body` | Send message (max 200 subject, 2000 body) |
| `mark_read` | `message_id` | Mark message as read |

### Utility
| Command | Fields | Description |
|---------|--------|-------------|
| `ping` | — | Connection check (returns `pong`) |

---

## Key Constants

All constants are served in the game state broadcast under `state.constants`:

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
| ROOM_CAPACITY_STANDARD | 10,000 | Standard room item capacity |
| ROOM_CAPACITY_LARGE | 100,000 | Cargo bay / manufacturing capacity |
| ORBIT_DISTANCE_AU | 0.5 | Max distance to enter orbit |
| TRANSPORT_TRAVEL_TICKS | 5 | Ticks per transport phase (doubled for planet) |
| REPAIR_BOT_REPAIR_RATE | 0.5 | HP repaired per tick per bot |
| SECTION_COMPONENT_CAP | 5 | Max components per type per hull section |
