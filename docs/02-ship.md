# 02 — Ship

## Overview
The ship is the players' vessel and home base throughout a session. All onboard systems are operated via automated bots commanded from the **Command Deck**. Players interact with the ship through physical tablet stations, each controlling a specific ship system.

The ship has **6 sides**: Front, Back, Port, Starboard, Above, Below.
Scanning and communication hardware is mounted externally and requires no dedicated internal room.

---

## Rooms

| Room | Purpose |
|---|---|
| Command Deck | Houses all 13 player stations; the nerve center of the ship |
| Living Quarters | Crew habitat; stores air scrubbers |
| Weapons Room | Manages offensive systems; stores lasers and missiles |
| Shields Room | Manages defensive systems; stores shield batteries and lasers |
| Power Room | Ship power management; stores power batteries, fuel, and radioactive material |
| Engine Room | Propulsion systems; stores fuel |
| Charging Bay (`charging_bay`) | Where bots dock, recharge, and are dispatched; bots-only — no item transport |
| Manufacturing Facility | Fabricates items from raw materials; stores all non-bot resources (see capacity below) |
| General Cargo Bay | General purpose storage for all non-bot items |
| Travel Tunnels | Connecting corridors — how bots move between rooms (modelled as travel ticks, not a tracked room) |

> **Note:** "Manufacturing Facility" and "Factory" are used interchangeably throughout the design docs. They refer to the same room.

> **Implementation status:** The backend `ship.rooms` dict implements: `power_room`, `engine_room`, `weapons_room`, `shields_room`, `living_quarters`, `cargo_bay`, `manufacturing`, `charging_bay`. Travel Tunnels are not a tracked room.

---

## Stations (13 Total)

All stations are located on the Command Deck. Players select 1–4 stations each. With 13 stations, a minimum of ~4 players is needed to cover all stations (13 ÷ 4 = 3.25). Stations may be left unmanned; unmanned systems still function but cannot be actively directed.

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
