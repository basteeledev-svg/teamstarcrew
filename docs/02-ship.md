# Ship Design

## Overview

The ship is a cooperative vessel operated by **13 console stations** across **8 functional rooms**. Each station runs on a physical tablet (1280×800 px). Players can control 1–4 stations each; minimum ~4 players recommended.

## 13 Console Stations

| # | Station | Description |
|---|---------|-------------|
| 1 | Navigation | Set heading, control thrust, initiate warp jumps, enter/leave orbit |
| 2 | Short Range Scanning | Scan nearby planets and ships within the current system |
| 3 | Long Range Scanning | Scan distant star systems across the galaxy |
| 4 | Weapons (Tactical) | Lock targets, fire offense lasers and missiles, allocate weapon power per hull section |
| 5 | Shields | Install/manage defense lasers and shield batteries, allocate shield power per hull section |
| 6 | Repairs | Dispatch repair bots to damaged systems, hull sections, bots, and items |
| 7 | Transportation | Command transport bots to move items/people between rooms and planet |
| 8 | Manufacturing | Set production allocation for items and bots from raw materials |
| 9 | Power | Control 4 reactors, distribute power across 12 systems, manage battery |
| 10 | Engines | Set individual engine outputs (2 electric, 2 fuel) |
| 11 | Life Support | Monitor air, crew, life support power requirements |
| 12 | Communications | Send/receive messages to/from contacts in range |
| 13 | Mining | Assign mining bots to extract resources from orbited planets |

## 8 Rooms

| Room | Capacity | Accepted Items |
|------|----------|----------------|
| Power Room | 10,000 | fuel, radioactive, power_batteries |
| Engine Room | 10,000 | fuel |
| Weapons Room | 10,000 | lasers, missiles |
| Shields Room | 10,000 | shield_batteries, lasers |
| Living Quarters | 10,000 | air_scrubbers, people |
| Cargo Bay | 100,000 | everything |
| Manufacturing | 100,000 | everything |
| Charging Bay | 0 | bots only (no item transport) |

## 6 Hull Sides

Front, Back, Port, Starboard, Above, Below — each has installed components (defense lasers, offense lasers, shield batteries; max 5 of each type per side) and independent outer hull health.

## Resources & Items

**Raw materials** (consumable, 1000 per transport trip):
- metals, rare_earth, radioactive, hydrocarbons, fuel, people

**Equipment** (large, 1 per transport trip):
- lasers, missiles, shield_batteries, power_batteries, air_scrubbers, transport_bots, repair_bots

## 3 Bot Types

All bots are entity-tracked with individual `id`, `charge`, `health`, `location`, and `state`.

### Transport Bots
- Move items between rooms or to/from an orbited planet
- Consume charge per trip; lose health per trip; destroyed at 0 health
- Planet trips take **double** normal travel time (10 ticks vs 5)
- Charged in the Charging Bay from `charging_bay` power allocation

### Repair Bots
- Dispatched to fix systems, room hull, outer hull, bots, or items
- Travel to target, repair at REPAIR_BOT_REPAIR_RATE per tick, return when done
- Require active power (REPAIR_BOT_POWER_PER_BOT GW from charging_bay allocation)
- Destroyed at 0 health

### Mining Bots
- Assigned to a resource type while orbiting a planet
- Each mining bot extracts `richness / 100` units per tick
- Consume charge while mining; recalled to charging bay when depleted
- Destroyed at 0 health
- Max bots per resource: MINING_BOTS_MAX (20)

## Manufacturing

9 hardcoded recipes consume raw materials from the Manufacturing room:
- **Rate-based**: fuel (continuous production)
- **Progress-based**: transport_bot, mining_bot, repair_bot, lasers, missiles, shield_batteries, power_batteries, air_scrubbers (accumulate GW toward completion threshold)

Manufacturing GW is split by the player's allocation percentages. Blocked recipes (missing materials) redistribute their GW to other active recipes.

## Component Installation

Installing or uninstalling hull components (defense lasers, offense lasers, shield batteries) is **not instant**. Each job costs 1 GW per percent of progress. GW comes from the relevant station's power allocation (shields or weapons), split evenly among all active jobs for that station.

Example: 60 GW to weapons, 3 install jobs → each progresses at 20%/tick → done in 5 ticks.
# 02 — Ship

## Overview
The ship is the players' vessel and home base throughout a session. All onboard systems are operated via automated bots commanded from tablet stations. Players interact with the ship through physical tablet stations, each controlling a specific ship system.

The ship has **6 sides**: Front, Back, Port, Starboard, Above, Below.
Scanning and communication hardware is mounted externally and requires no dedicated internal room.

---

## Rooms

| Room | Purpose |
|---|---|
| Living Quarters | Crew habitat; stores air scrubbers |
| Weapons Room | Manages offensive systems; stores lasers and missiles |
| Shields Room | Manages defensive systems; stores shield batteries and lasers |
| Power Room | Ship power management; stores power batteries, fuel, and radioactive material |
| Engine Room | Propulsion systems; stores fuel |
| Charging Bay (`charging_bay`) | Where bots dock, recharge, and are dispatched; bots-only — no item transport |
| Manufacturing Facility | Fabricates items from raw materials; stores all non-bot resources (see capacity below) |
| General Cargo Bay | General purpose storage for all non-bot items |

> **Note:** "Manufacturing Facility" and "Factory" are used interchangeably throughout the design docs. They refer to the same room.

> **Implementation status:** The backend `ship.rooms` dict implements: `power_room`, `engine_room`, `weapons_room`, `shields_room`, `living_quarters`, `cargo_bay`, `manufacturing`, `charging_bay`. Bot travel between rooms is modelled as travel ticks, not as a separate room.

---

## Stations (13 Total)

All stations are accessible via tablet devices. Players select 1–4 stations each. With 13 stations, a minimum of ~4 players is needed to cover all stations (13 ÷ 4 = 3.25). Stations may be left unmanned; unmanned systems still function but cannot be actively directed.

| # | Station | Controls | Frontend Panel |
|---|---|---|---|
| 1 | Navigation | In-system piloting, orbit, galactic jump targeting, NPC contacts | ✅ Implemented |
| 2 | Short Range Scanning | Local system scan — planets, NPC ships, tier-based reveal | ✅ Implemented |
| 3 | Long Range Scanning | Galaxy-wide scan — systems, tier-based reveal by LRS GW | ✅ Implemented |
| 4 | Weapons | Offensive systems — lasers and missiles | ❌ Placeholder |
| 5 | Shields | Defensive systems — shield strength, distribution | ❌ Placeholder |
| 6 | Repairs | Directs repair bots to damaged ship sections | ❌ Placeholder |
| 7 | Transportation | Directs transport bots for cargo movement between rooms | ✅ Implemented |
| 8 | Manufacturing | Queues fabrication jobs in the manufacturing facility | ✅ Implemented |
| 9 | Power | Ship power distribution across all systems | ✅ Implemented |
| 10 | Engines | Engine output, thrust, and warp drive | ✅ Implemented |
| 11 | Life Support | Air quality, temperature, and hab systems | ❌ Placeholder |
| 12 | Communications | Email-style comms with NPC ships/planets, range-gated by power | ✅ Implemented |
| 13 | Mining | Directs mining bots to extract resources from planets | ❌ Placeholder |

---

## Resources & Items

### Small Resources
Bulk raw and refined materials. Measured in units.

| Resource | Description |
|---|---|
| Metals | Raw structural material; mined from planets/asteroids |
| Rare Earth Elements (REE) | Precision fabrication material; mined |
| Radioactive Material (RM) | Fuel for power systems; mined |
| Hydrocarbons (HC) | Chemical feedstock and fuel source; mined |
| Fuel | Refined propellant for engines and power room |

**Capacity:** 10,000 units per standard room / 100,000 units in Cargo Bay / 100,000 units in Manufacturing Facility

### Large Items
Discrete components and consumables.

| Item | Description |
|---|---|
| Lasers | Offensive and defensive energy weapons |
| Missiles | Guided offensive weapons |
| Shield Batteries | Charge reserves for shield systems |
| Power Batteries | General ship power reserves |
| Air Scrubbers | Life support consumables; filter and recycle atmosphere |

**Capacity:** 1,000 units per standard room / 5,000 units in Cargo Bay / 5,000 units in Manufacturing Facility

> **Implementation note:** Room capacity limits are defined here as design targets but are **not yet enforced** in the backend code.

---

## Room Storage Permissions

Each room maintains its own inventory. Items cannot be used from another room — they must be physically delivered by a transport bot.

| Room | Allowed Items |
|---|---|
| General Cargo Bay | All non-bot items (small resources + large items) |
| Manufacturing Facility | All non-bot items (small resources + large items) |
| Weapons Room | Lasers, Missiles |
| Shields Room | Shield Batteries, Lasers |
| Living Quarters | Air Scrubbers |
| Power Room | Power Batteries, Fuel, Radioactive Material |
| Engine Room | Fuel |
| Charging Bay | Bots only (tracked separately — no item transport allowed) |

---

## Bots

Bots are autonomous units that carry out physical tasks on the ship. They are **not stored as resources** — each bot has its own tracked `id`, `charge`, `health`, `location`, and `state`. Bots start in and recharge at the **Charging Bay** (`charging_bay` room). Charging rate depends on the GW allocated to the Charging Bay divided by the number of bots currently docked.

| Bot Type | Role | Implementation Status |
|---|---|---|
| Transport Bots | Move items between rooms within the ship; support repeat trips (1/5/10/∞) | ✅ Implemented — full entity list, location tracking, trip repeats, returning-to-bay state |
| Repair Bots | Navigate to damaged sections and perform structural/system repairs | ⚙️ Backend entities exist; front-end panel is a placeholder |
| Mining Bots | Deployed externally to extract resources from planets/asteroids | ⚙️ Backend entities exist (`mining_bots_list`) + legacy per-resource count dict; front-end panel is a placeholder |

### Transport Bot Behaviour
1. Player dispatches bot from Transportation panel: selects source room → item → destination → amount → trips (1/5/10/∞)
2. Bot travels `TRANSPORT_TRAVEL_TICKS` (5) ticks to source (state `pickup`)
3. Bot travels 5 ticks to destination (state `deliver`); items deposited on arrival
4. Bot stays at destination room unless told to go somewhere else or recalled to charge
5. If trips > 1 or ∞, bot immediately repeats the same route while charge and health allow
6. `charge_transport` command sends bot travelling back to the Charging Bay (state `returning`)
7. Bots only charge when `state == idle` and `location == charging_bay`

### Charging Bay Power
```
charge_per_bot_per_tick = (charging_bay_gw / bots_in_bay) × CHARGING_BAY_CHARGE_RATE_PER_GW
CHARGING_BAY_CHARGE_RATE_PER_GW = 2.0
```
The same bay charges all three bot types simultaneously.

---

## Notes for Future Sections
- Individual station panel designs: deferred to station-specific docs
- Engine specs (electric x2, fuel x2, warp x1): deferred to engine/power doc
- Warp power cost formula: deferred to travel/engine doc
