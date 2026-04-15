# 01 — Galaxy Layout

## Overview
A galaxy is procedurally generated fresh at the start of each game session. It is laid out in 3D space with large distances between star systems. No two sessions share the same galaxy.

---

## Generation

- **50–70 star systems** are created at session start, each assigned a position in 3D galactic coordinate space using a **2-arm spiral** layout (80% arm / 20% scattered)
- All system details — star type, planet count, planet attributes, resource abundances, hostility, inhabitants — are generated **upfront** at session start
- ~~Dynamic objects (asteroids, alien ships, derelicts, etc.) are spawned and despawned based on proximity to the player ship~~ — **not yet implemented**; `DYNAMIC_SPAWN_RADIUS_AU` constant exists but is unused

---

## Star Systems

Each system contains:
- A **star** with type drawn from weighted distribution:

| Star Type | Weight | Color | Planet Count |
|---|---|---|---|
| M (Red Dwarf) | 70% | `#ff4422` | 1–4 |
| K (Orange) | 13% | `#ffaa44` | 2–6 |
| G (Yellow, Sun-like) | 8% | `#ffee88` | 2–8 |
| F (Yellow-White) | 4% | `#ffffcc` | 2–6 |
| A (White) | 2% | `#aaddff` | 1–4 |
| B (Blue) | 1% | `#6699ff` | 0–3 |
| Giant | 2% | `#ff88aa` | 0–2 |

- A random number of **planets** (count determined by star type, see table above)
- Each planet may have **moons** (count determined by planet type)
- Planets **orbit** their star each tick; orbital speed scales inversely with distance (`speed ∝ distance^−0.5`)

---

## Planet Attributes

| Attribute | Description |
|---|---|
| Type | See planet type table below |
| Inhabited | Bool — constrained by species compatibility with planet type |
| Metals | Abundance 0–100 |
| Rare Earth Elements | Abundance 0–100 |
| Radioactive Material | Abundance 0–100 |
| Hydrocarbons | Abundance 0–100 |
| Base Hostility | 0–100 — natural environmental danger |
| Faction Hostility Bump | Added on top of base hostility based on aggression level of the inhabiting faction |

---

## Planet Types & Resource Ranges

| Type | Weight | Metals | Rare Earth | Radioactive | Hydrocarbons | Base Hostility | Can Inhabit | Moons |
|---|---|---|---|---|---|---|---|---|
| Barren/Rocky | 30 | 20–60 | 10–30 | 5–20 | 0–10 | 20–50 | No | 0–2 |
| Terrestrial | 15 | 20–60 | 10–40 | 5–20 | 10–50 | 10–40 | Yes | 0–2 |
| Desert/Arid | 12 | 30–70 | 20–60 | 10–30 | 5–30 | 30–60 | Yes | 0–2 |
| Ice World | 10 | 10–40 | 10–30 | 5–15 | 20–50 | 20–50 | No | 0–3 |
| Gas Giant | 10 | 0–10 | 0–5 | 5–20 | 70–100 | 80–100 | No | 2–20 |
| Ice Giant | 8 | 0–10 | 5–20 | 5–15 | 30–70 | 65–90 | No | 2–15 |
| Ocean World | 5 | 5–30 | 10–40 | 0–15 | 30–70 | 20–50 | Yes | 0–2 |
| Jungle/Lush | 4 | 10–40 | 10–30 | 0–10 | 40–80 | 30–60 | Yes | 0–2 |
| Tidally Locked | 3 | 20–50 | 15–40 | 5–25 | 5–30 | 40–70 | No | 0–1 |
| Toxic/Corrosive | 3 | 10–40 | 30–60 | 10–30 | 10–40 | 60–90 | No | 0–1 |
| Volcanic/Magma | 2 | 60–100 | 30–70 | 20–50 | 0–5 | 75–100 | No | 0–2 |
| Irradiated | 2 | 20–60 | 40–80 | 60–100 | 0–5 | 75–95 | No | 0–1 |
| Super-Earth | 1 | 40–80 | 20–50 | 10–30 | 10–40 | 20–50 | Yes | 0–3 |
| Crystalline | 1 | 10–30 | 60–100 | 20–50 | 0–10 | 30–60 | No | 0–2 |
| Rogue/Dark | 1 | 5–30 | 10–25 | 5–15 | 0–20 | 60–80 | No | 0–0 |

> **Inhabitation**: Planets with `Can Inhabit = Yes` have a 15% chance of being inhabited at generation. Inhabited planets receive a faction hostility bump (10–40 added to base).

---

## Moon Rules

- Moons draw from a restricted type subset (weighted): **Barren/Rocky (50%), Ice World (25%), Ocean World (10%), Crystalline (10%), Rogue/Dark (5%)**
- Moons are **never inhabited** in the current implementation
- Same resource abundance and hostility model applies (ranges determined by moon type from the table above)

---

## Travel Between Systems

See [04-ship-power.md](04-ship-power.md) for full warp and power design. Summary:
- Inter-system travel requires the **warp drive**, which charges a capacitor (max 100,000 GW) from the `warp_drive` power allocation
- Jump cost: `100 × distance_ly^1.3` — full capacitor covers ~203 LY (max nearest-neighbor in the galaxy is ~132 LY)
- The galaxy map is viewed from the **Navigation** station

---

## Empty Space

- If a ship flies beyond all planets in a system and keeps going, it enters **empty space**
- ~~Empty space is procedurally populated with meteors, asteroids, and hazards as the ship moves~~ — **not yet implemented**
- ~~Rare GM-driven events may occur in empty space (derelicts, anomalies)~~ — **not yet implemented** (AI Game Master module is future work)
