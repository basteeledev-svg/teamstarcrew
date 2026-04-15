# 03 — Ship Attributes

## Overview
This document defines the core state variables of the player ship — the values that describe where it is, how it's moving, and the health of every component. These variables are read and written by the various ship systems each tick.

---

## Location & Navigation Variables

### Current Solar System
- A reference to the system object the ship currently occupies
- When the warp drive fires, this variable is updated to the destination system
- While in empty space (between systems), this is null / "deep space"

### Position
- Stored as **3D coordinates (x, y, z)** in AU (Astronomical Units) or a consistent sci-fi equivalent
- Each solar system has its **star at (0, 0, 0)**
- The coordinate space expands in all directions as far as needed — no hard boundary
- If the ship warps to a new system, position is reset to a random point at the system's outer edge (beyond the outermost planet)

### Direction
- A **3D heading vector** representing the direction the ship is currently facing/moving toward
- Updated by the Navigation station via manual steering input
- Also accepts heading suggestions pushed from the Short Range Scanner (e.g., "bearing to Planet 3" or "clear of asteroid on heading")
- Turn rate is capped — the ship cannot instantly snap to a new heading; it has a realistic turn speed with subtle drift and drag
- Advanced sub-engine firing allows good maneuverability without being arcade-instant

### Thrust
- A scalar value representing current engine output as a proportion of max thrust (0.0–1.0 or 0–100%)
- Comes from the Engines system (see engine station doc, TBD)
- Combined with Direction to form the **Movement Vector** each tick

### Movement
- Derived each tick: `step = direction × thrust × engine_thrust_au`
- The ship's position is updated by this step each tick inside `update_tick()`
- There is no stored `movement_vector` field — it is computed inline
- **Simplified momentum model:** the crew is assumed to have fine enough control to stop the ship when desired; no carry-over thrust or uncontrolled drift between ticks beyond the natural turn/drag feel

---

## Health Variables

### Health Rules Summary

| Component Type | At 0% Health | Behavior |
|---|---|---|
| Hull | Game over | Mission ends immediately |
| Ship systems (engines, reactors, scanners, comms) | Not destroyed | Fully non-functional but repairable |
| Inventory items (lasers, missiles, air scrubbers, batteries, etc.) | Destroyed | Removed from inventory permanently |
| Bots | Destroyed | Removed and no longer tracked |

### Hull Health
- Single value: **0–100%**
- Represents overall structural integrity of the ship
- Damage sources: weapons fire, collisions, environmental hazards
- At **0%**: game over — the ship is destroyed and the session ends
- Repaired by Repair Bots directed from the Repairs station

### System Health (Engines, Reactors, Scanners, Comms)
- Each major ship system has its own **health value (0–100%)**
- Output and effectiveness scale **linearly with health**
  - Example: a reactor at 25% output setting with 50% health produces `1,000 GW × 0.25 × 0.50 = 125 GW`
- At **0% health**: fully non-functional but **not destroyed** — can still be repaired by Repair Bots
- Systems with individual health values:
  - Reactor 1 (Fuel)
  - Reactor 2 (Fuel)
  - Reactor 3 (Radioactive Material)
  - Reactor 4 (Radioactive Material)
  - Engine 1 (Electric)
  - Engine 2 (Electric)
  - Engine 3 (Fuel)
  - Engine 4 (Fuel)
  - Warp Drive
  - Short Range Scanning Array
  - Long Range Scanning Array
  - Communications Array
  - Shield System
  - Weapons System

### Inventory Item Health (Lasers, Missiles, Batteries, Air Scrubbers, etc.)
- Each unit of a consumable/deployable item carries a **health value (0–100%)**
- Items at **0% health are destroyed** and permanently removed from storage
- Items above 0% can be repaired by Repair Bots (directed from Repairs station)
- Damaged items may have degraded effectiveness — defined per item type in station docs (TBD)

> **Not yet implemented.** Items in the current codebase do not have individual health tracking.

### Bot Health
- Each bot instance has its own **health value (0–100%)**
- At **0% health**: bot is destroyed and removed from tracking
- Above 0%: bot can be repaired at the Bot Recharge Bay or by another Repair Bot
- Damaged bots may operate at reduced efficiency — defined in bot mechanics doc (TBD)

> **Not yet implemented.** Mining bots are tracked as counts per resource (not individual instances). Repair and transport bots are not yet implemented.

---

## Variable Summary Table

| Variable | Type | Description |
|---|---|---|
| `current_system_id` | `uuid str` | The solar system the ship is in |
| `position` | Vector3 (x, y, z) | 3D coordinates within the current system; star is at (0,0,0) |
| `direction` | Vector3 (unit vector) | Current heading |
| `target_direction` | Vector3 (unit vector) | Where the navigator is steering toward |
| `thrust` | Float (0.0–1.0) | Current engine output fraction |
| `engine_thrust_au` | Float | Total thrust in AU/tick, computed each tick from all 4 engines (health-scaled) |
| `hull_health` | Float (0–100) | Ship structural integrity; 0 = game over |
| `system_health[key]` | Float (0–100) | Per-system health (14 keys); linearly scales output |
| `reactor_outputs[key]` | Float (0–1.0) | Per-reactor output fraction (4 keys) |
| `reactor_heat[key]` | Float (0–100) | Per-reactor heat level (4 keys) |
| `reactor_shutdown[key]` | Bool | Meltdown shutdown flag per reactor |
| `engine_outputs[key]` | Float (0–1.0) | Per-engine output fraction (4 keys) |
| `warp_capacitor_gw` | Float | Stored warp charge in GW (max 100,000) |
| `power_allocation[key]` | Float | 12-key power distribution dict (see [04-ship-power.md](04-ship-power.md)) |
| `power_allocation_locked[key]` | Bool | Per-station %-lock flags |
| `power_allocation_gw_targets[key]` | Float\|null | Per-station GW targets |
| `battery_count` | Int | Number of battery units aboard |
| `battery_energy_gw` | Float | Current battery stored energy |
| `rooms[key]` | Dict | Per-room inventory (power_room, engine_room, etc.) |
| `orbiting_planet_id` | `uuid str`\|null | Planet currently being orbited, or null |
| `mining_bots[resource]` | Int | Mining bots assigned per resource (metals, rare_earth, radioactive, hydrocarbons) |
| `people_on_board` | Int | Crew count (affects life support minimum) |
