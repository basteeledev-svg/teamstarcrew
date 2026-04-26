# Station Capabilities & Multiplayer Crew Configurations

This document catalogues every station in TeamStarCrew and proposes flexible
station-bundling layouts for **4, 5, 6, 8, and 10 player** crews.

---

## Part 1 — Station Capability Catalogue

For each station: what the player **does** (active controls), what they
**monitor** (passive readouts), and a **role rating**:

- ⚪ **Passive** — can run unattended; only needs warnings glanced at
- 🟡 **Semi‑active** — requires periodic adjustment, not constant attention
- 🔴 **Active** — needs a dedicated human, especially in combat / travel

---

### ⊕ Navigation — 🔴 Active

**Actions**
- Set heading (compass click or numeric X/Z entry)
- Engage / stop main thrust
- Enter or leave orbit around a nearby planet
- Initiate warp jump: pick galaxy system, confirm fuel cost
- Adjust map zoom

**Monitors**
- Position, velocity (mAU/tick), current heading
- Nearby planets (distance, resources if scanned)
- Warp capacitor charge, warp cost in GW for current target
- Engine thrust output, engaged status

**Rationale for criticality:** the pilot must steer in real time, decide when
to orbit, and coordinate warp with engines. Cannot be automated meaningfully.

---

### ◎ Short Range Scan — ⚪ Passive

**Actions**
- Click planets / ships to "lock" them (reveals tier‑gated data)
- Visual sweep is animated; no power dial here (power is set in Power panel)

**Monitors**
- Local system planets (type, richness, habitability, moons — gated by scan GW)
- NPC ship positions, race, size, hull health (gated by scan GW)
- Orbit indicator

**Rationale for passivity:** once power is allocated it scans automatically.
The "actions" are really just inspection.

---

### ⊙ Long Range Scan — ⚪ Passive

**Actions**
- Click galaxy systems to inspect at whatever tier is currently revealed

**Monitors**
- All galaxy systems within LRS detection rings (tiers 1–6)
- Per‑system: star info → planets → inhabitants → ship activity (tier‑gated)
- AI story annotations / threat hints

**Rationale for passivity:** purely informational. Output feeds Navigation
(warp targeting) and Communications (knowing who is in range).

---

### ◆ Weapons (Tactical) — 🔴 Active

**Actions**
- Lock / unlock NPC target
- Fire missiles at locked target
- Install / uninstall offensive lasers per hull section (max 5/side)
- Allocate weapons GW between hull sections + targeting system
- Tune per‑laser power weighting

**Monitors**
- Locked target distance, hull %, threats
- Section laser counts, GW per section, laser health
- Targeting accuracy %

**Rationale for criticality:** target selection and missile firing are
real‑time tactical choices; cannot be safely automated.

---

### ❖ Shields — 🔴 Active

**Actions**
- Install / uninstall defense lasers + shield batteries per hull section
- Allocate shields GW per section
- Tune per‑component power split

**Monitors**
- Per‑section hull health %, shield coverage %
- Defense‑laser range (AU), shield battery counts
- Incoming threats grouped by section

**Rationale for criticality:** active reallocation in combat is the entire
job; mistakes here destroy the ship.

---

### ✦ Repairs — 🟡 Semi‑active

**Actions**
- Dispatch / recall repair bots to: systems, room hulls, outer hull, items, other bots
- Reassign priorities

**Monitors**
- All damageable targets with health %
- Bot fleet status (idle / traveling / repairing), health, charge

**Rationale:** strategy is human (what to fix first), but a sensible default
queue can keep most damage handled without constant input.

---

### ⇄ Transportation — 🟡 Semi‑active

**Actions**
- Source room → item → destination → amount → dispatch
- Trip count (1, 5, 10, ∞)
- Charge / cancel / recall bots

**Monitors**
- Transport bot fleet (state, health, charge)
- All room inventories + orbited planet stockpile
- Charging‑bay power

**Rationale:** routine supply runs are easily queued. Spikes (battle damage,
new manufacturing recipes) need a human to retask.

---

### ⬡ Manufacturing — 🟡 Semi‑active

**Actions**
- Allocate manufacturing GW across 9 recipes (fuel, 3 bot types, lasers,
  missiles, shield batteries, power batteries, air scrubbers)
- Lock individual recipes to fixed allocation

**Monitors**
- Per‑recipe progress %, blocked status (missing inputs)
- Manufacturing inventory
- Available manufacturing GW

**Rationale:** "set and forget" once a build plan is chosen, but plans need
adjusting between phases of the mission.

---

### ⚡ Power — 🔴 Active

**Actions**
- Set per‑reactor output (0–100 %)
- Shut down / start up reactors
- Allocate the 12 station shares (sum to 100 % minus battery)
- Lock stations as %, GW, or unlocked
- Set battery charge / discharge rate

**Monitors**
- Reactor: output %, heat %, health %, shutdown state
- Net power GW
- Battery: charge %, +/‑ GW per tick
- Per‑station: %, GW delivered, lock state

**Rationale for criticality:** every other system depends on this. Heat
management requires a human watching reactor curves.

---

### ⚙ Engines — 🟡 Semi‑active

**Actions**
- Set per‑engine output fraction (electric vs. fuel engines)
- Adjust warp drive % allocation (shares engines budget)

**Monitors**
- Per‑engine output %, draw / fuel use, budget overruns
- Warp drive charge GW (cap 100 000), leak rate, net charge rate
- Total thrust (mAU/tick)

**Rationale:** continuous tuning helps in combat / chase scenes; basic cruise
config can be automated.

---

### ✚ Life Support — ⚪ Passive

**Actions**
- Set GW target slider (panel auto‑locks GW at the minimum needed)

**Monitors**
- Atmosphere quality %, CO₂ %
- Passenger count vs. air‑scrubber capacity
- Power adequacy %, scrubber health per room

**Rationale:** GW‑locked, self‑adjusting. Only generates **warnings** —
"too few scrubbers", "low O₂", "scrubber X damaged" — that any other station
can react to.

---

### ◉ Communications — ⚪ Passive

**Actions**
- Read inbox / mark read
- Compose message to in‑range contact (recipient picker, subject, body)

**Monitors**
- Message inbox (unread / sender / subject)
- Contact roster: name, system, distance, in‑range flag
- Comms power & range (GW × 0.1 = LY)

**Rationale:** narrative‑driven; bursts of activity then long quiet stretches.
Doesn't need a dedicated seat.

---

### ◈ Mining — ⚪ Passive

**Actions**
- Deploy / recall mining bots per resource (metals, rare earth, radioactive,
  hydrocarbons), capped at MINING_BOTS_MAX
- Set bot count per resource

**Monitors**
- Planet richness, mining rate units/tick, planet health
- Bot fleet: total / deployed / idle, average health and charge
- Planet stockpile (waiting for transport)

**Rationale:** only active when in orbit; once dispatched the bots
self‑manage. Easy to fold into another station.

---

## Part 2 — Cross‑Panel Data Flow (who needs whose output)

| Output | Producer | Consumers |
|---|---|---|
| Local planet/ship contacts | Short Range | Navigation, Weapons, Shields |
| Galaxy systems & threats | Long Range | Navigation, Communications |
| Warp capacitor charge | Engines | Navigation |
| Power budget per station | Power | Everyone |
| NPC ship state | Short Range | Weapons, Shields |
| Component install jobs | Weapons / Shields | Power (consumes GW) |
| Transport jobs | Transportation | Repairs (bot health), Mining (pickup planet stockpile) |
| Manufacturing output | Manufacturing | Transportation, Weapons, Shields, Repairs |
| Damage events | Combat / Power | Repairs |
| Orbit target | Navigation | Mining, Transportation |

**Implication:** Navigation + Short Range + Long Range form a natural cluster
("the bridge"). Weapons + Shields are tightly coupled ("the gunner"). Power +
Engines are coupled ("engineering"). Mining is just a tab on whoever has the
orbit map. Comms is so light it can hang off the captain or any passive role.

---

## Part 3 — Always‑on Automation (regardless of crew size)

These rules run server‑side or as panel defaults so no crew slot is wasted on
them:

1. **Life Support auto‑provision** — keeps minimum GW, raises ship‑wide
   warnings on low O₂ / damaged scrubbers / too few scrubbers per passenger.
2. **Mining bot auto‑charge** — bots return to charging bay at low charge
   without intervention.
3. **Repair bot default queue** — when idle, repair bots auto‑pick the
   highest‑damage in‑ship target unless the Repairs officer overrides.
4. **Transportation auto‑topoff** — when manufacturing fills, idle transport
   bots auto‑deliver outputs to the relevant rooms (lasers → weapons,
   batteries → power) unless overridden.
5. **Reactor heat auto‑shutdown** — already enforced at >95 % heat.

These five free up roughly **1.5 stations’ worth of attention**.

---

## Part 4 — Crew Configurations

Each configuration assigns every station to a **named role**. A role is one
tablet with one or more console tabs. Stations marked ★ are the role's primary;
others are tabs they swap to as needed.

### 👤 4 Players — "Skeleton Crew"

| # | Role | Console Tabs |
|---|---|---|
| 1 | **Captain / Pilot** | ★ Navigation, Short Range, Long Range, Communications |
| 2 | **Gunner** | ★ Weapons, Shields |
| 3 | **Chief Engineer** | ★ Power, Engines, Life Support* |
| 4 | **Bosun** | ★ Repairs, Manufacturing, Transportation, Mining |

\* Life Support visible for warnings only.

**Coverage notes:** Comms is a captain tab because messages are sparse. Mining
sits with the Bosun who already owns bot fleets. Engineer carries Engines
because both feed warp.

---

### 👤 5 Players — "Standard"

| # | Role | Console Tabs |
|---|---|---|
| 1 | **Captain / Comms** | ★ Communications, Long Range, Short Range |
| 2 | **Pilot** | ★ Navigation, Engines |
| 3 | **Tactical** | ★ Weapons, Shields |
| 4 | **Engineer** | ★ Power, Life Support* |
| 5 | **Bosun** | ★ Repairs, Manufacturing, Transportation, Mining |

**What changed from 4P:** Captain stops piloting; takes over scans + comms
(the "eyes & voice"). Pilot pairs Engines with Navigation since warp / thrust
share the budget.

---

### 👤 6 Players — "Recommended"

| # | Role | Console Tabs |
|---|---|---|
| 1 | **Captain** | ★ Communications, Long Range |
| 2 | **Pilot** | ★ Navigation, Short Range |
| 3 | **Weapons Officer** | ★ Weapons |
| 4 | **Shields Officer** | ★ Shields |
| 5 | **Engineer** | ★ Power, Engines, Life Support* |
| 6 | **Bosun** | ★ Repairs, Manufacturing, Transportation, Mining |

**What changed from 5P:** Weapons and Shields split into two seats — combat
becomes more dynamic. Pilot keeps Short Range (the tactical scan they actually
use for orbiting and dodging).

---

### 👤 8 Players — "Full Bridge"

| # | Role | Console Tabs |
|---|---|---|
| 1 | **Captain** | ★ Communications, Long Range |
| 2 | **Pilot** | ★ Navigation |
| 3 | **Sensors** | ★ Short Range, Long Range (shared read-only with captain) |
| 4 | **Weapons Officer** | ★ Weapons |
| 5 | **Shields Officer** | ★ Shields |
| 6 | **Power Engineer** | ★ Power, Life Support* |
| 7 | **Propulsion Engineer** | ★ Engines |
| 8 | **Bosun** | ★ Repairs, Manufacturing, Transportation, Mining |

**What changed from 6P:** Sensors gets its own seat (great in deep‑exploration
sessions). Engines splits from Power so reactor tuning and warp tuning can
happen simultaneously without one player tab‑hopping.

---

### 👤 10 Players — "Deluxe"

| # | Role | Console Tabs |
|---|---|---|
| 1 | **Captain** | ★ Communications |
| 2 | **Pilot** | ★ Navigation |
| 3 | **Sensors** | ★ Short Range, Long Range |
| 4 | **Weapons Officer** | ★ Weapons |
| 5 | **Shields Officer** | ★ Shields |
| 6 | **Power Engineer** | ★ Power, Life Support* |
| 7 | **Propulsion Engineer** | ★ Engines |
| 8 | **Damage Control** | ★ Repairs |
| 9 | **Quartermaster** | ★ Manufacturing, Transportation |
| 10 | **Mining Foreman** | ★ Mining, Transportation (shared) |

**What changed from 8P:** the Bosun explodes into three specialised roles —
Damage Control, Quartermaster (production / logistics), and Mining Foreman
(only meaningful at orbiting planets but otherwise becomes a "deck hand" who
backs up Quartermaster on transport runs).

---

## Part 5 — Headcount Summary

| Players | Bridge | Combat | Engineering | Logistics | Idle Stations |
|---|---|---|---|---|---|
| 4  | 1 (combo) | 1 (combo) | 1 | 1 | Life Support* |
| 5  | 2 | 1 (combo) | 1 | 1 | Life Support* |
| 6  | 2 | 2 | 1 | 1 | Life Support* |
| 8  | 3 | 2 | 2 | 1 | Life Support* |
| 10 | 3 | 2 | 2 | 3 | Life Support* |

\* Life Support is automated in all configs; warnings broadcast to whoever
has the most attention to spare.

---

## Part 6 — Open Design Questions

1. **Should "Sensors" and "Captain" share an actual collaborative tablet
   (read‑only mirror) or just have overlapping CONSOLES?** Today consoles are
   per‑tablet; nothing prevents two tablets from picking the same console.
2. **Auto‑repair queue scope:** should it touch outer hull sections during
   combat, or only post‑combat?
3. **Auto‑transport for manufacturing output:** which deliveries should be
   automatic vs. opt‑in? Suggested defaults: lasers→weapons,
   shield‑batteries→shields, fuel→engines; everything else manual.
4. **Mining vs. Transportation handoff:** should mined ore on a planet be
   auto‑pulled the moment a transport bot is idle and the ship is in orbit?
