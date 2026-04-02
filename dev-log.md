# Development Log

---

## Session 1 — Design & Skeleton

### Completed

**Design Docs Written**
- `docs/01-galaxy-layout.md` — Planet types, resource ranges, moon rules, travel overview
- `docs/02-ship.md` — 13 stations, 10 rooms, resource storage rules, bot overview
- `docs/03-ship-attributes.md` — Core ship state variables (position, direction, thrust, health)
- `docs/04-ship-power.md` — 4-reactor power system, GW scale, tick lifecycle
- `docs/variables-and-endpoints.md` — All variables and API endpoints reference

**Backend Skeleton Built** (`backend/`)
- `game/constants.py` — All tunable game constants
- `game/vector3.py` — Lightweight 3D vector math (normalize, rotate_toward, etc.)
- `game/galaxy.py` — Procedural galaxy generation: 50–70 systems in a 2-arm spiral layout; star type distribution based on real stellar statistics; planets with full type/resource/hostility attributes; moons from restricted type subset
- `game/ship.py` — Ship dataclass with per-tick movement (TURN_RATE limited direction, thrust-based position); warp_to method; effective power calculation
- `game/state.py` — Singleton `GameState` and `ConnectionManager` for WebSocket broadcasting
- `game/tick.py` — Async tick loop (1 tick/sec): moves ship, marks visited systems, broadcasts state
- `routers/game.py` — REST endpoints: start, stop, state, thrust, direction, stop, warp
- `routers/ws.py` — WebSocket endpoint with command dispatch
- `main.py` — FastAPI app with CORS, lifespan tick loop startup

**Frontend Skeleton Built** (`frontend/`)
- Vite + React PWA setup
- `useGameSocket.js` — WebSocket hook with auto-reconnect
- `GalaxyMap.jsx` — Canvas 2D projection of all systems; click to select warp target; star-type coloring; visited/unvisited opacity
- `SystemView.jsx` — Canvas in-system view: star, planet orbits, ship triangle; dynamic scale
- `ShipControls.jsx` — Thrust slider, compass click-to-steer, full-stop/full-thrust buttons
- `ShipStatus.jsx` — Live readout of position (AU), heading, thrust %, hull health, power GW, tick
- `App.jsx` — Full layout: galaxy map left, system view + controls right; Start Game button; warp UI

### Architecture Decisions
- **Stack**: Python/FastAPI backend + React PWA frontend
- **Comms**: WebSocket for real-time state (1 tick/sec broadcast); REST for lifecycle and curl testing
- **Power unit**: GW (Gigawatts); max 4,000 GW from 4 reactors
- **Speed**: 0.025 AU/tick at full thrust (~5 min between neighbouring planets)
- **Momentum**: Simplified — crew can stop at will; turn rate capped at 45°/tick with nlerp

### Known Stubs / TODOs
- [ ] Warp power cost not yet enforced (drive must be functional, but energy not deducted)
- [ ] Planets have fixed positions (no orbital simulation yet)
- [ ] Dynamic object spawning (asteroids, alien ships) not yet implemented
- [ ] Bot mechanics not yet implemented
- [ ] All 13 station panels are TBD — skeleton only shows ship movement
- [ ] Alien races / factions / AI Game Master — future phase
- [ ] AWS deployment setup — future phase

---

## Session 2 — Multi-Station UI & Power System

### Completed

**App Routing & Multi-Console Layout**
- `App.jsx` routing: select screen → game / admin / observer roles
- `GamePage.jsx` — Fixed 1280×800 tablet layout (Samsung Galaxy Tab S9); left panel cycles through station consoles; swipe/arrow navigation between consoles

**Power Management Console** (`frontend/src/panels/PowerPanel.jsx`)
- Full power management UI built and iterated
- Reactor cards × 4 (R1 FUEL, R2 FUEL, R3 RAD, R4 RAD) with output sliders, heat bars, health readout, meltdown banner
- Battery bank gauge (BatteryBar) and bipolar charge/discharge slider (BatteryChargeSlider, −100..100)
- Power Room inventory strip (FUEL bar, RAD bar) reading live from `ship.rooms.power_room`
- 10-key allocation slider grid (SLIDER_KEYS — engines through repairs; warp_drive and battery handled separately)
- Dual lock system per station: `🔓` → `🔒%` (percent locked) → `🔒GW` (GW target locked) → `🔓`
- Life support permanently GW-locked at minimum floor; slider still draggable to raise target
- General systems GW-locked at 20 GW by default (user-adjustable)
- Insufficient power overlay: if general_systems GW < 20, blocks all non-power consoles with a red warning; power console remains usable

**Power Model (Backend)**
- `ship.py`: 4 reactors, per-reactor heat / health / shutdown state
- Reactor heat bands: 5 output zones, damage thresholds, meltdown at 100% heat (30 dmg + forced shutdown, auto-recovers when cooled)
- Fuel consumption per tick: R1/R2 burn `fuel`, R3/R4 burn `radioactive_material` at `output × 100` units/tick; forces output=0 if stock empty
- **Battery as virtual reactor**: `net_power_gw = max(0, reactor_gw + (battery_pct/100) × capacity)` — battery is outside the 100% distribution sum; positive pct discharges (adds GW), negative charges (consumes GW)
- `update_gw_locks()` runs each tick: recalculates pcts for GW-locked stations against current `net_power_gw`, redistributes freed/consumed % to unlocked free stations
- `update_battery()` runs each tick: applies charge/discharge delta, snaps `battery` pct to 0 on full or empty
- `power_allocation` — 12 keys; SLIDER_KEYS × 10 + `warp_drive` + `battery`; SLIDER_KEYS + warp_drive always sum to 100%
- `to_dict()` exposes both `effective_power_gw` (reactor only) and `net_power_gw` (reactor + battery contribution)
- `create_ship()`: all 4 reactors start at 5% output; life_support GW-locked at 5 GW, general_systems GW-locked at 20 GW

**WebSocket Commands Added**
- `set_reactor_output` — set a single reactor's output fraction
- `set_power_allocation` — update all 12 allocation keys; backend enforces sum=100 on free stations, preserves locked stations
- `toggle_power_lock` — toggle % lock on a station (clears GW lock; life_support blocked)
- `set_gw_lock` — set or clear a GW target on a station (life_support clamps to minimum floor)

### Bug Fixes (this session)
- `def update_battery(self):` was missing from `ship.py` after a refactor — body was orphaned inside `update_gw_locks`; tick loop was crashing every tick with `AttributeError`
- `allocSum` excluded `warp_drive`, so the Σ% header always showed ~90% in red; fixed to include `warp_drive` in total
- `combinedLocks` in `handleAllocChange` was spreading `curGwTargets` as `v !== null`, overwriting real %-locks with `false` and letting redistribution bleed into locked stations; fixed to only set GW-locked keys to `true`
- `handleGwAllocChange` was calling `setAlloc` for GW-locked stations, creating false `gwDrift` that pushed all free sliders up on every GW drag; removed the erroneous `setAlloc` call
- `GamePage` was computing genSysGW from `effective_power_gw` (reactor only) while `PowerPanel` used `net_power_gw`; warning triggered falsely when battery was discharging; unified to `net_power_gw`
- Battery charge slider range was collapsing to `0..0` when full/empty (hiding the thumb); changed to always span −100..100 and clamp the value instead
- Dead code `isSliderLocked` removed

### Architecture Decisions
- Battery sits outside the 100% power distribution sum — it acts like a 5th reactor
- GW locks are server-authoritative; frontend always reads GW-locked station pcts from server to avoid local drift
- `warp_drive` key exists in `power_allocation` but is not shown in the PowerPanel grid (managed by Engines console, TBD)

### Known Stubs / TODOs
- [ ] Engines panel — warp drive charging and thrust power draw
- [ ] Transport bots — moving fuel/radioactive material between rooms
- [ ] Mined resources making it onto the ship (mining integration)
- [ ] Per-station power-starvation behavior (what happens when a system gets < X GW)
- [ ] Warp power cost enforcement
- [ ] Dynamic object spawning (asteroids, alien ships)
- [ ] Bot mechanics (repair, mining)
- [ ] Alien races / factions / AI Game Master
- [ ] AWS deployment

---

## Session 3 — Engines Panel, Warp Enforcement & UI Polish

### Completed

**Engines Panel** (`frontend/src/panels/EnginesPanel.jsx`)
- Full engines UI: 4 engine cards (ELEC ENG 1, ELEC ENG 2, FUEL ENG 1, FUEL ENG 2)
- Each card shows HP bar, thrust contribution (mAU/tk), output slider, fuel/power consumption
- Electric engine cards show "MAX X% (power cap)" when constrained by engine power budget
- Warp capacitor section: large charge bar, net charge rate, allocation slider with cap readout
- Power budget bar (segmented: blue=elec, purple=warp, red=overflow, grey=free)
- Engine Room fuel strip showing remaining fuel and draw rate
- All engines start at 0% output

**Engine Power Budget Enforcement (Backend)**
- `update_engines()` method on `Ship`, called every tick before `update_tick()`
- **Electric draw**: `engine_consumption(output_frac)` — floor-quadratic: `⌊x·(1 + 3x/100)⌋` where x = output_frac×100; gives 1 unit/% at low, 4 units/% at 100%
- **Electric + warp must not exceed `engines_alloc_gw`**: electric scaled proportionally first, warp gets remaining headroom
- **Fuel engines**: each tick deducts `engine_consumption(output)` units of fuel from Engine Room; forces output=0 if Engine Room has insufficient fuel
- **Engine Room seeded** at 50,000 fuel at game start
- **Per-tick defensive clamps** added: all `engine_outputs` values clamped to `[0,1]`; `warp_drive` allocation clamped so it cannot exceed `engines` allocation (excess redistributed to `general_systems`, keeping sum=100)
- `engine_thrust_au` field computed from health-scaled output of all 4 engines each tick

**Warp Capacitor**
- Charges each tick at `warp_alloc_gw − WARP_CAPACITOR_LEAK_GW` net (i.e. the leak is always active)
- Discharges are manual — triggered by a warp jump
- Max capacity: 100,000 GW; leak rate: 0.5 GW/tick

**Warp Cost Enforcement (Backend)**
- `ws.py` warp command now: computes `cost_gw = 100 × dist_ly^1.3`, rejects if `warp_capacitor_gw < cost_gw` with a descriptive error, deducts from capacitor on success
- Ack now returns `cost_gw` and `dist_ly`
- Galaxy analysis: galaxy radius = 500 LY; avg nearest-neighbor = 47 LY; max nearest-neighbor = 132 LY; full cap (100,000 GW) → max range 203 LY — always sufficient for any single hop

**WebSocket Commands Added**
- `set_engine_output` — set a single engine's output fraction (0.0–1.0); key validated against `{"engine_1_electric","engine_2_electric","engine_3_fuel","engine_4_fuel"}`

**Observer UI Updates** (`frontend/src/components/ShipControls.jsx`)
- Thrust slider and FULL THRUST/FULL STOP slider removed
- Replaced with: ENGINE SPEED readout (live `ship.engine_thrust_au` in mAU/tk), ENGINE OFFLINE / ENGINES ENGAGED status, ENGAGE ENGINES (`set_thrust: 1.0`) and FULL STOP buttons
- Observer steers via compass; engine room crew controls actual speed

**Navigation Arrow Buttons** (`frontend/src/pages/GamePage.jsx`)
- Changed from full-height edge strips to compact 36×72 px orange half-circle buttons (`rgba(255,140,0,0.75)`) centred vertically
- Panel content area inset by 36 px left/right (matching arrow width) to prevent console buttons from being hidden behind the arrows
- Applies only when `count > 1`

### Bug Fixes
- `lowElecPower` stale variable reference in EnginesPanel header span — renamed to `overBudget` in all locations
- `GamePage` was using `effective_power_gw` (reactor-only) for the General Systems power check; unified to `net_power_gw` so battery discharge correctly suppresses the warning

### Architecture Decisions
- Observer engages/disengages engines; engine room crew sets actual output levels via EnginesPanel — thrust is always 0.0 or 1.0 from observer perspective
- Warp capacitor is the only cross-tick energy store for warp; it leaks passively and must be actively maintained between jumps
- All-tick budget enforcement in `update_engines()` means rapid UI slider input cannot permanently over-commit engine power — any excess is corrected within one tick

### Known Stubs / TODOs
- [ ] Transport bots — moving fuel/radioactive material between rooms
- [ ] Mined resources making it onto the ship (mining integration)
- [ ] Per-station power-starvation behavior (what happens when a system gets < X GW)
- [ ] Dynamic object spawning (asteroids, alien ships)
- [ ] Bot mechanics (repair, mining)
- [ ] Alien races / factions / AI Game Master
- [ ] AWS deployment
- [ ] Other station panels (navigation, shields, weapons, life support, comms, etc.)

---

## Next Steps (planned)
1. Transport bots — UI and bot dispatching between rooms
2. Per-system under-power behavior
3. Mining integration — mined resources transferred to ship rooms
4. Additional station panels (navigation, shields, weapons)
