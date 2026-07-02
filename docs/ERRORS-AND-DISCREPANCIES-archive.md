# Errors, Discrepancies & Issues

> All items resolved. ✅ = fixed/implemented. BY DESIGN = intentional behavior.

---

## ✅ FIXED — Previous Issues

### E1: Stale documentation ✅
All old docs deleted and rewritten: `01-galaxy.md`, `02-ship.md`, `03-power.md`, `04-api-reference.md`. Design lore saved to repo memory.

### E2: `GENERAL_SYSTEMS_FLOOR_GW` unused ✅
Removed from constants.py.

### E3: `charging_bay` missing from PowerPanel ✅
Added to PowerPanel slider grid. All 12 power allocation keys now have UI controls.

### E4: REST warp endpoint doesn't deduct capacitor ✅
REST `/api/ship/warp` now deducts `warp_capacitor_gw` and returns 400 if insufficient.

### E5: `repairs` power allocation had no backend effect ✅
Removed `repairs` entirely. Renamed to `charging_bay` which powers all bot recharging.

### E6: Transport bot charging formula cleaned up ✅
Frontend and backend formulas aligned. Uses `CHARGING_BAY_CHARGE_RATE_PER_GW` constant.

### E7: Mining rate uses null richness ✅
Planet `health` field removed. Mining formula uses richness only. Frontend `ResourceCard` receives richness from full planet data.

### E8: Stale dev-log.md ✅
Deleted along with all outdated docs.

### E9: Hardcoded constants in frontend ✅
Constants now served via WebSocket state broadcast. Frontend panels use server values with fallbacks.

### E10: Scan tier thresholds ✅
Frontend reads thresholds from server-sent scan data.

### E11: Color maps duplicated ✅
Consolidated into `shared.js`: `RACE_COLORS`, `PLANET_TYPE_COLORS`, `healthColor()`, `heatColor()`. All panels import from shared module.

### E12: Health color thresholds inconsistent ✅
Unified via `healthColor()` in `shared.js` (≥70 good, ≥40 warn, else bad).

### E15: Bot destruction at 0 health ✅
All three bot types (transport, repair, mining) now cleaned up at end of their update methods: `[b for b in self.X if b["health"] > 0]`.

### E19: No error feedback from WebSocket ✅
`useGameSocket.js` now processes `type: "error"` and `type: "ack"` messages. `lastError` and `lastAck` state exposed and threaded through to panel components.

### E20: No input sanitization on comms ✅
Verified `maxLength` attribute present on CommunicationsPanel inputs.

### E22: Deprecated stub panels ✅
Deleted `EngineeringPanel.jsx`, `MedicalPanel.jsx`, `SciencePanel.jsx`.

### E24: `repairs` power key confusing ✅
Renamed to `charging_bay` everywhere.

### E25: Orbit distance hardcoded ✅
Added `ORBIT_DISTANCE_AU = 0.5` to constants.py. Used in ws.py orbit command.

### E28: Dynamic objects never cleaned for distance ✅
Added cleanup: removes objects > `METEOR_SPAWN_RADIUS_AU * 3` from ship.

---

## ✅ FIXED — Bugs Found in Latest Audit

### BUG-1: Offense lasers fired inside dynamic objects loop ✅
The offense laser block was inside `for obj in gs.dynamic_objects:`, causing it to fire N times per tick (once per meteor). Moved outside the loop — now fires exactly once per tick.

### BUG-2: `_compute_sides` returned string fallback ✅
Fallback returned `"front"` (string) instead of `["front"]` (list). `list("front")` → `['f','r','o','n','t']`. Fixed to return `["front"]` / `["back"]`.

### BUG-3: Battery `update_battery` delta sign inverted ✅
When discharging (pct > 0), delta was positive, ADDING energy instead of removing it. Fixed: `self.battery_energy_gw - delta`. Snap conditions also corrected (at_full checks pct < 0, at_empty checks pct > 0).

### BUG-4: "radioactive" vs "radioactive_material" naming mismatch ✅
Galaxy used `"radioactive"` in stockpiles; ship rooms used `"radioactive_material"`. Transport between planet and ship couldn't work — permission check rejected `"radioactive"`, and planet stockpile had no `"radioactive_material"`. Standardized to `"radioactive"` everywhere (ship rooms, recipes, ROOM_PERMISSIONS, reactor fuel consumption, frontend, docs).

### INCON-1: `BATTERY_START_COUNT` unused ✅
`battery_count` field now uses `BATTERY_START_COUNT` constant instead of hardcoded `5`.

### INCON-2: Mining bots used wrong constants ✅
Added `MINING_BOT_CHARGE_MAX`, `MINING_BOT_HEALTH_MAX`, `MINING_BOT_CHARGE_COST` to constants.py. `_make_mining_bot()` and `update_mining_bots()` now use mining-specific constants.

### INCON-3: `DYNAMIC_SPAWN_RADIUS_AU` defined but never used ✅
Removed from constants.py.

### INCON-4: NPC ships missing `velocity` key ✅
Added `"velocity": {"x": 0.0, "y": 0.0, "z": 0.0}` to NPC ship dicts in `seed_npc_ships()`.

### INCON-5: Mining bot start count hardcoded ✅
Added `MINING_BOT_START_COUNT = 3` to constants.py. `create_ship()` uses it.

### INCON-6: Reactor starting output hardcoded ✅
Added `REACTOR_START_OUTPUT = 0.05` to constants.py. `create_ship()` uses it.

### INCON-7: Charging clamps all bot types to TRANSPORT_BOT_CHARGE_MAX ✅
Charging bay now determines correct cap per bot type: transport → `TRANSPORT_BOT_CHARGE_MAX`, repair → `REPAIR_BOT_CHARGE_MAX`, mining → `MINING_BOT_CHARGE_MAX`.

### FE-1: RepairsPanel reads `power_allocation.repairs` ✅
Changed to `power_allocation.charging_bay` to match renamed backend key.

### FE-2: NavigationPanel `WARP_COST_BASE` ReferenceError in WarpTab ✅
`WarpTab` component was defined outside `NavigationPanel` scope but referenced `WARP_COST_BASE`/`WARP_COST_EXPONENT` only defined inside it. Fixed to use module-level `_WARP_COST_BASE`/`_WARP_COST_EXPONENT`.

### FE-3: MiningPanel `MINING_BOTS_MAX` ReferenceError in ResourceCard ✅
`ResourceCard` component was defined outside `MiningPanel` scope but referenced `MINING_BOTS_MAX` local. Fixed: added `maxBots` prop to `ResourceCard`.

### FE-4: TransportationPanel `galaxy.systems` path doesn't exist ✅
Planet stockpile lookup used `gameState?.galaxy?.systems` which doesn't exist. Fixed to `gameState?.current_system?.planets`.

---

## ✅ FIXED — Remaining Issues (Resolved)

### E13: Manufacturing output bypasses room permissions ✅
`_complete_manufactured_item()` now routes items to their target room using `ROOM_PERMISSIONS`. Manufacturing seeds use the same routing. Implemented.

### E14: Item health tracking partially implemented ✅
`update_item_health()` implemented in ship.py. Called each tick via `tick.py`. Items degrade based on usage and are destroyed at 0% health. Repair bots target aggregate keys.

### E16: "Command Deck" and "Travel Tunnels" exist in design but not in code ✅
Removed from `docs/02-ship.md` room table. Command Deck is implied by station layout; Travel Tunnels are modeled by bot travel delays.

### E21: All styles are inline ✅
All 13 panels converted to CSS modules. Static layout/typography styles extracted to `.module.css` files. Dynamic/conditional styles remain as inline `style={{}}`. CSS classes use camelCase naming.

### E23: CSS keyframes injected via `<style>` tags in JSX ✅
Consolidated all keyframes into `keyframes.css`. ShortRangePanel and CommunicationsPanel import this shared CSS file instead of injecting `<style>` tags.

### E26: `_next_component_id` doesn't persist ✅
Added `__post_init__` safeguard in ship.py: scans existing component IDs and sets `_next_component_id` to `max(existing) + 1`. Prevents collisions if state is ever serialized/restored.

### E27: Planet stockpile accumulates forever — BY DESIGN
No cap on `planet.stockpile`. Ship capacity limits and stockpile loss on departure are sufficient constraints.

### E29: NPCs only in starting system — BY DESIGN
`seed_npc_ships()` only populates the first system. AI Game Master will spawn NPCs in other systems.

## ✅ FIXED — New Issues (Resolved)

### NE1: `people_on_board` always 0 ✅
LifeSupportPanel label changed from "CREW" to "PASSENGERS". Accurately reflects they are transported people rather than permanent crew.

### NE2: SystemView has duplicate mining bot UI ✅
Removed mining bot UI from `SystemView.jsx`. Mining functionality is exclusively in `MiningPanel.jsx`.

### NE3: CQ-1: `generate_galaxy` seeds global random ✅
`galaxy.py` now uses a local `random.Random(seed)` instance (`_rng`). All `random.X()` calls replaced with `_rng.X()`. Global random state unaffected.

### NE4: CQ-3: WebSocket handler silently swallows exceptions ✅
Added `logging` to `ws.py`. Exception handling now logs errors with `logger.exception()`. JSON parse errors and command processing errors logged separately.

### NE5: CQ-5: main.py lifespan doesn't properly await cancelled tick_loop ✅
Lifespan now properly awaits the cancelled tick task with `try/except asyncio.CancelledError`. Clean shutdown guaranteed.

### NE6: `ORBIT_ANGULAR_SPEED` defined in ship.py instead of constants.py ✅
Moved `ORBIT_ANGULAR_SPEED = 0.05` to `constants.py`. `ship.py` imports from constants.