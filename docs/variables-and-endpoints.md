# Variables & Endpoints Reference

> Auto-updated as new systems are built. Last updated: Session 4 (charging bay, bot entities, repeat transport trips).

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
| `set_gw_lock` | `"station": key, "gw_target": float\|null` | Set or clear a GW target on a station |
| `orbit` | `"planet_id": "<uuid>"` | Enter orbit around a planet (must be within 0.5 AU) |
| `leave_orbit` | — | Exit orbit |
| `set_mining_bots` | `"resource": key, "value": int` | Set mining bot count for one resource (must be in orbit); resource is one of `metals`, `rare_earth`, `radioactive`, `hydrocarbons`; value clamped 0–20 |
| `transport_items` | `"source": room, "dest": room, "item": key, "amount": float, "trips": int\|null, ["bot_id": int]` | Dispatch a transport bot; `trips` = 1/5/10 or `null` for infinite; bot auto-picked if bot_id omitted |
| `cancel_transport` | `"bot_id": int` | Cancel a transport bot's current job; returns reserved items to source room |
| `charge_transport` | `"bot_id": int` | Recall a transport to the Charging Bay (sets state `returning`; bot travels 5 ticks) |
| `build_transport_bot` | — | Build a new transport bot from manufacturing room (costs 500 metals + 200 rare_earth) |
| `repair_transport_bot` | `"bot_id": int, "amount": float` | Restore health to a transport bot |
| `set_manufacturing_alloc` | `"item": key, "pct": float` | Set manufacturing power allocation for one recipe slot (0–100); frontend normalises all slots to sum 100% |
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
| `orbit_angle_rad` | `float` | Current orbital angle (radians); advances each tick |
| `orbit_speed_rad` | `float` | Orbital angular speed (radians/tick); scales as `distance^-0.5` |
| `position` | `{x,y,z}` | In-system AU coords (updated each tick as planet orbits) |
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
| `stockpile` | `dict` | `{metals, rare_earth, radioactive, hydrocarbons}` — resources extracted by mining bots |

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
| `battery_count` | `int` | Number of battery units aboard |
| `battery_energy_gw` | `float` | Current stored battery energy in GW |
| `battery_capacity_gw` | `float` | Total battery capacity (`battery_count × 100 GW`) |
| `people_on_board` | `int` | Crew count (affects life support minimum) |
| `life_support_min_gw` | `float` | Minimum GW required for life support given crew size |
| `effective_power_gw` | `float` | Reactor-only GW this tick (health × output × 1000 GW, summed) |
| `net_power_gw` | `float` | Usable GW = `effective_power_gw + battery_contribution`; clamped ≥ 0 |
| `orbiting_planet_id` | `uuid str\|null` | Planet currently being orbited, or null |
| `orbit_radius_au` | `float` | Ship's orbital radius when in orbit |
| `orbit_center` | `{x,z}` | Center point of the orbit circle |
| `mining_bots` | `dict` | `{metals, rare_earth, radioactive, hydrocarbons}` — bot count per resource (used by mining system) |
| `transport_bots` | `list` | Each entry: `{id, charge, health, location, state, job}`. States: `idle`, `pickup`, `deliver`, `returning` |
| `repair_bots` | `list` | Each entry: `{id, charge, health, location, state, job}`. States: `idle`, `repairing` |
| `mining_bots_list` | `list` | Each entry: `{id, charge, health, location, state}`. States: `idle`, `mining` |
| `manufacturing_alloc` | `dict` | Per-recipe power allocation (%, 0–100 per slot, all slots sum to 100) |
| `manufacturing_progress` | `dict` | Accumulated GW toward completion of each progress-based recipe |
| `rooms` | `dict` | Per-room inventory; keys: `power_room`, `engine_room`, `weapons_room`, `shields_room`, `living_quarters`, `cargo_bay`, `manufacturing`, `charging_bay` |

### system_health keys
`reactor_1_fuel`, `reactor_2_fuel`, `reactor_3_rad`, `reactor_4_rad`,
`engine_1_electric`, `engine_2_electric`, `engine_3_fuel`, `engine_4_fuel`,
`warp_drive`, `short_range_scanner`, `long_range_scanner`, `comms_array`,
`shield_system`, `weapons_system`

Health at 0 % → system non-functional but repairable (not destroyed).
Effect: output × (health / 100) linearly.

### power_allocation keys
`engines`, `warp_drive`, `shields`, `weapons`, `short_range_scanner`, `long_range_scanner`,
`comms`, `life_support`, `general_systems`, `manufacturing`, `charging_bay`, `battery`

`battery` is outside the 100 % sum (can be negative for charging). All others must sum to 100.
Life support is always GW-locked at its minimum floor. General systems defaults to GW-lock at 20 GW.

### rooms keys and contents
| Room key | Default contents |
|---|---|
| `power_room` | `fuel: 10000`, `radioactive_material: 10000` |
| `engine_room` | `fuel: 50000` |
| `weapons_room` | `lasers: 0`, `missiles: 0` |
| `shields_room` | `shield_batteries: 0`, `lasers: 0` |
| `living_quarters` | `air_scrubbers: 0` |
| `cargo_bay` | All small resources + all large items (all start at 0) |
| `manufacturing` | All small resources + all large items except `mining_bots` (all start at 0) |
| `charging_bay` | Empty dict — bots tracked separately via `transport_bots`, `repair_bots`, `mining_bots_list` |

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
| `GENERAL_SYSTEMS_FLOOR_GW` | 5.0 | Defined but unused; actual overlay threshold is 20 GW (hardcoded in frontend) |
| `REACTOR_MELTDOWN_DAMAGE` | 30.0 | Damage on 0–100 scale at 100% heat |
| `MINING_BOTS_MAX` | 20 | Max bots assignable per resource |
| `PLANET_ORBIT_MIN_AU` | 0.3 | Closest planet orbit |
| `PLANET_ORBIT_MAX_AU` | 45.0 | Farthest planet orbit |
| `PLANET_ORBIT_BASE_SPEED_RAD` | 0.001 | Angular speed at 1 AU; scales as `r^-0.5` |
| `SHIP_START_DISTANCE_AU` | 3.0 | Starting distance from star |
| `TRANSPORT_BOT_START_COUNT` | 1 | Transport bots spawned at game start |
| `TRANSPORT_BOT_CHARGE_MAX` | 100.0 | Max charge per transport bot |
| `TRANSPORT_BOT_CHARGE_COST` | 10.0 | Charge consumed per trip |
| `TRANSPORT_BOT_HEALTH_MAX` | 100.0 | Max health per transport bot |
| `TRANSPORT_BOT_HEALTH_COST` | 1.0 | Health lost per trip |
| `TRANSPORT_BOT_CARGO_LARGE` | 1 | Max large items per trip |
| `TRANSPORT_BOT_CARGO_CONSUMABLE` | 1000.0 | Max consumable units per trip |
| `TRANSPORT_TRAVEL_TICKS` | 5 | Ticks per travel phase (pickup or delivery) |
| `TRANSPORT_BOT_BUILD_METALS` | 500.0 | Metals to build a new transport bot |
| `TRANSPORT_BOT_BUILD_RARE` | 200.0 | Rare earth to build a new transport bot |
| `REPAIR_BOT_CHARGE_MAX` | 100.0 | Max charge per repair bot |
| `REPAIR_BOT_HEALTH_MAX` | 100.0 | Max health per repair bot |
| `REPAIR_BOT_REPAIR_RATE` | 0.5 | System HP restored per tick per assigned repair bot |
| `CHARGING_BAY_CHARGE_RATE_PER_GW` | 2.0 | Charge units gained per GW per bot per tick in the bay |

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
