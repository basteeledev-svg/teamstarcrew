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
| Bot Recharge Bay | Where bots dock, recharge, and are tracked; bots are not stored as cargo |
| Manufacturing Facility | Fabricates items from raw materials; stores all non-bot resources (see capacity below) |
| General Cargo Bay | General purpose storage for all non-bot items |
| Travel Tunnels | Connecting corridors — how bots and (conceptually) crew move between rooms |

> **Note:** "Manufacturing Facility" and "Factory" are used interchangeably throughout the design docs. They refer to the same room.

---

## Stations (13 Total)

All stations are located on the Command Deck. Players select 1–4 stations each. With 13 stations, a minimum of ~4 players is needed to cover all stations (13 ÷ 4 = 3.25). Stations may be left unmanned; unmanned systems still function but cannot be actively directed.

| # | Station | Controls |
|---|---|---|
| 1 | Navigation | In-system piloting and galactic jump targeting |
| 2 | Short Range Scanning | Local system scan — nearby objects, hazards, contacts |
| 3 | Long Range Scanning | Galaxy-level scan — systems in warp range, detail scales with power |
| 4 | Weapons | Offensive systems — lasers and missiles |
| 5 | Shields | Defensive systems — shield strength, distribution |
| 6 | Repairs | Directs repair bots to damaged ship sections |
| 7 | Transportation | Directs transport bots for cargo movement between rooms |
| 8 | Manufacturing | Queues fabrication jobs in the manufacturing facility |
| 9 | Power | Ship power distribution across all systems |
| 10 | Engines | Engine output, thrust, and warp drive |
| 11 | Life Support | Air quality, temperature, and hab systems |
| 12 | Communications | Comms with other ships and planets |
| 13 | Mining | Directs mining bots to extract resources from planets/asteroids |

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
| Bot Recharge Bay | Bots only (tracked separately — see Bots section below) |

---

## Bots

Bots are autonomous units that carry out physical tasks on the ship. They are **not stored as resources** — each bot has its own tracked location and state. Bots are housed in and recharge at the **Bot Recharge Bay** but can be anywhere on the ship at any time as long as they have power.

| Bot Type | Role |
|---|---|
| Repair Bots | Navigate to damaged sections and perform structural/system repairs |
| Mining Bots | Deployed externally to extract resources from planets and asteroids |
| Transport Bots | Move items between rooms within the ship |

### Transport Logic
When a transport bot moves items between rooms:
1. Verify source room has sufficient quantity
2. Verify destination room has sufficient capacity and permission for that item type
3. Deduct from source, add to destination upon delivery

Ship-wide totals for any resource = sum across all rooms.

---

## Notes for Future Sections
- Individual station panel designs: deferred to station-specific docs
- Engine specs (electric x2, fuel x2, warp x1): deferred to engine/power doc
- Warp power cost formula: deferred to travel/engine doc
- Bot count, health, and power mechanics: deferred to bot mechanics doc
