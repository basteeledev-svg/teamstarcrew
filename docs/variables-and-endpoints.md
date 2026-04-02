# Variables & Endpoints Reference

> Auto-updated as new systems are built. Last updated: Session 3.

---

## REST Endpoints

Base URL: `http://localhost:8000`

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | Server health check |
| POST | `/api/game/start` | `?seed=<int>` (optional query param) | Generate galaxy, spawn ship, start tick loop |
| POST | `/api/game/stop` | — | Pause the tick loop |
| GET | `/api/game/state` | — | Full game state snapshot (same shape as WS broadcast) |
| POST | `/api/ship/thrust` | `{"value": 0.0–1.0}` | Set engine thrust fraction |
| POST | `/api/ship/direction` | `{"x": f, "y": f, "z": f}` | Set target heading vector (auto-normalised) |
| POST | `/api/ship/stop` | — | Set thrust to 0 |
| POST | `/api/ship/warp` | `{"system_id": "<uuid>"}` | Warp to a star system |

---

## WebSocket

URL: `ws://localhost:8000/ws`

### Server → Client (every tick)

```json
{
  "type": "state",
  "status": "running",
  "tick": 123,
  "ship": { ... },
  "current_system": { ... },
  "galaxy_systems": [ ... ]
}
```

### Client → Server Commands

| `type` | Extra fields | Description |
|---|---|---|
| `set_thrust` | `"value": 0.0–1.0` | Set thrust |
| `set_target_direction` | `"x", "y", "z"` | Set heading |
| `stop` | — | Zero thrust |
| `warp` | `"system_id": "<uuid>"` | Jump to system; deducts warp capacitor charge; rejected if insufficient |
| `set_reactor_output` | `"reactor": key, "value": 0.0–1.0` | Set one reactor's output fraction |
| `set_engine_output` | `"engine": key, "value": 0.0–1.0` | Set one engine's output fraction |
| `set_power_allocation` | `"allocations": {all 12 keys}` | Update power distribution; server enforces sum=100 and GW locks |
| `toggle_power_lock` | `"station": key` | Toggle % lock on a station (life_support cannot be toggled) |
| `set_gw_lock` | `"station": key, "target_gw": float\|null` | Set or clear a GW target on a station |
| `orbit` | `"planet_id": "<uuid>"` | Enter orbit around a planet (must be within 0.5 AU) |
| `leave_orbit` | — | Exit orbit |
| `set_mining_bots` | `"planet_id": "<uuid>", "count": int` | Deploy mining bots to a planet |
| `ping` | — | Server replies `{"type":"pong"}` |

---

## Core Game Variables

### Galaxy (`Galaxy`)
| Variable | Type | Description |
|---|---|---|
| `systems` | `list[StarSystem]` | All star systems in this session |
| `seed` | `int` | RNG seed (allows replay) |

### StarSystem
| Variable | Type | Description |
|---|---|---|
| `id` | `uuid str` | Unique identifier |
| `name` | `str` | Procedural name e.g. "Sigma X-347" |
| `star_type` | `str` | M / K / G / F / A / B / Giant |
| `star_color` | `str` | Hex colour for rendering |
| `position_ly` | `{x,y,z}` | Galaxy-scale 3D coords in light-years |
| `planets` | `list[Planet]` | All planets in system |
| `max_orbital_distance_au` | `float` | Outermost planet distance (sets warp arrival zone) |
| `visited` | `bool` | True once ship has been in this system |

### Planet
| Variable | Type | Description |
|---|---|---|
| `id` | `uuid str` | |
| `name` | `str` | e.g. "Sigma X-347-3" |
| `type` | `str` | Planet type (see 01-galaxy-layout.md) |
| `orbital_distance_au` | `float` | Distance from star |
| `position` | `{x,y,z}` | In-system AU coords (fixed, not orbiting yet) |
| `metals` | `float 0–100` | Resource abundance |
| `rare_earth` | `float 0–100` | Resource abundance |
| `radioactive` | `float 0–100` | Resource abundance |
| `hydrocarbons` | `float 0–100` | Resource abundance |
| `base_hostility` | `float 0–100` | Natural danger level |
| `faction_hostility_bump` | `float` | Added when planet is inhabited |
| `total_hostility` | `float 0–100` | Derived: base + bump, capped at 100 |
| `inhabited` | `bool` | |
| `moons` | `list[Moon]` | |
| `health` | `float 0–100` | Not player-visible; for future bombardment etc. |

### Moon
Same resource/hostility fields as Planet. Type restricted to: Barren/Rocky, Ice World, Ocean World, Crystalline, Rogue/Dark.

### Ship
| Variable | Type | Description |
|---|---|---|
| `current_system_id` | `uuid str` | Which system the ship is in |
| `position` | `{x,y,z}` | AU from system star (star = 0,0,0) |
| `direction` | `{x,y,z}` | Current normalised heading vector |
| `target_direction` | `{x,y,z}` | Where navigator is steering; ship turns toward this |
| `thrust` | `float 0–1` | Engine output fraction |
| `hull_health` | `float 0–100` | 0 = game over |
| `system_health` | `dict` | Per-system health (see below) |
| `reactor_outputs` | `dict` | Per-reactor output fraction: `reactor_1_fuel`, `reactor_2_fuel`, `reactor_3_rad`, `reactor_4_rad` |
| `engine_outputs` | `dict` | Per-engine output fraction: `engine_1_electric`, `engine_2_electric`, `engine_3_fuel`, `engine_4_fuel` |
| `warp_capacitor_gw` | `float` | Stored warp charge in GW (max 100,000) |
| `engine_thrust_au` | `float` | Total thrust produced this tick (AU/tick); sum of all engine contributions health-scaled |
| `power_allocation` | `dict` | 12-key distribution dict (see Power section) |
| `power_allocation_locked` | `dict` | Per-station %-lock flags |
| `power_allocation_gw_targets` | `dict` | Per-station GW targets (null = not GW-locked) |
| `battery_pct` | `float` | Current battery charge fraction (via `power_allocation["battery"]`) |
| `battery_count` | `int` | Number of battery units aboard |
| `effective_power_gw` | `float` | Reactor-only GW this tick (health × output × 1000 GW, summed) |
| `net_power_gw` | `float` | Usable GW = `effective_power_gw + battery_contribution`; clamped ≥ 0 |
| `rooms` | `dict` | Per-room inventory; keys: `power_room`, `engine_room`, etc. |

### system_health keys
`reactor_1_fuel`, `reactor_2_fuel`, `reactor_3_rad`, `reactor_4_rad`,
`engine_1_electric`, `engine_2_electric`, `engine_3_fuel`, `engine_4_fuel`,
`warp_drive`, `short_range_scanner`, `long_range_scanner`, `comms_array`,
`shield_system`, `weapons_system`

Health at 0 % → system non-functional but repairable (not destroyed).
Effect: output × (health / 100) linearly.

### power_allocation keys
`engines`, `warp_drive`, `shields`, `weapons`, `short_range_scanner`, `long_range_scanner`,
`comms`, `life_support`, `general_systems`, `manufacturing`, `repairs`, `battery`

`battery` is outside the 100 % sum (can be negative for charging). All others must sum to 100.
Life support is always GW-locked at its minimum floor. General systems defaults to GW-lock at 20 GW.

### rooms keys and contents
| Room key | Default contents |
|---|---|
| `power_room` | `fuel: 10000`, `radioactive_material: 10000` |
| `engine_room` | `fuel: 50000` |

---

## Constants (backend/game/constants.py)

| Constant | Value | Notes |
|---|---|---|
| `MAX_SPEED_AU_PER_TICK` | 0.025 | AU/tick at thrust=1 with no engines (legacy cap) |
| `TURN_RATE_DEG_PER_TICK` | 45.0 | Max heading change per tick |
| `TICK_RATE_SECONDS` | 1.0 | One tick per second |
| `MAX_REACTOR_OUTPUT_GW` | 1000.0 | Per reactor at 100 % health & output |
| `BATTERY_CAPACITY_GW` | 100.0 | GW per battery unit |
| `BATTERY_START_COUNT` | 5 | Starting battery units |
| `LIFE_SUPPORT_BASE_GW` | 5.0 | Floor GW before crew scaling |
| `LIFE_SUPPORT_PER_100_PEOPLE_GW` | 10.0 | Additional GW per 100 crew |
| `FUEL_ENGINE_MAX_THRUST_AU` | 0.025 | AU/tick per fuel engine at 100 % output & health |
| `ELEC_ENGINE_MAX_THRUST_AU` | 0.0125 | AU/tick per electric engine at 100 % output & health |
| `ENGINE_ROOM_FUEL_START` | 50,000 | Engine Room starting fuel units |
| `WARP_CAPACITOR_MAX_GW` | 100,000 | Maximum storable warp charge |
| `WARP_CAPACITOR_LEAK_GW` | 0.5 | GW lost per tick passively |
| `WARP_COST_BASE` | 100.0 | GW cost formula base |
| `WARP_COST_EXPONENT` | 1.3 | cost = BASE × dist_ly^EXP |
| `GALAXY_RADIUS_LY` | 500.0 | Spiral galaxy radius |
| `GALAXY_SYSTEM_COUNT_MIN/MAX` | 50–70 | Systems per session |

---

## Key Formulas

```
# Reactor output
effective_power_gw = Σ (1000 GW × output_fraction × health_fraction)   [max 4000 GW]

# Net usable power (battery discharges/charges)
battery_contribution = (battery_pct / 100) × (battery_count × 100 GW)
net_power_gw = max(0, effective_power_gw + battery_contribution)

# Engine fuel/power consumption (per engine per tick)
engine_consumption(output_frac) = floor(x × (1 + 3x/100))   where x = output_frac × 100
# e.g. 50% output → floor(50 × (1 + 1.5)) = floor(125) = 125 units/tick
# e.g. 100% output → floor(100 × 4) = 400 units/tick

# Engine thrust (summed, health-scaled)
engine_thrust_au = Σ fuel_engines(out × health × 0.025) + Σ elec_engines(out × health × 0.0125)
# Max with all 4 at 100%: 2×0.025 + 2×0.0125 = 0.075 AU/tick

# Warp cost
warp_cost_gw = 100 × distance_ly^1.3
# Examples: 50 LY = 16,168 GW | 100 LY = 39,811 GW | 203 LY ≈ 100,000 GW (full cap)
# Full warp cap (100,000 GW) → max range ≈ 203 LY
# Galaxy nearest-neighbor avg = 47 LY; max isolated = 132 LY — always reachable from full cap
```
