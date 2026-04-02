# 01 — Galaxy Layout

## Overview
A galaxy is procedurally generated fresh at the start of each game session. It is laid out in 3D space with large distances between star systems. No two sessions share the same galaxy.

---

## Generation

- **50–70 star systems** are created at session start, each assigned a position in 3D galactic coordinate space
- Each system receives a **skeleton** at generation time: star type, planet count, faction presence, and broad hazard flags
- Fine details (specific planet attributes, inhabitants, resource values) are filled in when the player ship arrives at a system
- **Dynamic objects** (asteroids, alien ships, derelicts, etc.) are spawned and despawned based on proximity to the player ship — they do not persist globally

---

## Star Systems

Each system contains:
- A star (type TBD)
- A random number of **planets** (count weighted by what is statistically likely in our galaxy)
- Each planet may have a random number of **moons**

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

| Type | Metals | Rare Earth | Radioactive | Hydrocarbons | Base Hostility | Habitable By |
|---|---|---|---|---|---|---|
| Terrestrial | 20–60 | 10–40 | 5–20 | 10–50 | 10–40 | Most species |
| Desert/Arid | 30–70 | 20–60 | 10–30 | 5–30 | 30–60 | Heat-adapted, reptilian |
| Jungle/Lush | 10–40 | 10–30 | 0–10 | 40–80 | 30–60 | Most biological species |
| Ocean World | 5–30 | 10–40 | 0–15 | 30–70 | 20–50 | Aquatic species only |
| Volcanic/Magma | 60–100 | 30–70 | 20–50 | 0–5 | 75–100 | Almost none |
| Irradiated | 20–60 | 40–80 | 60–100 | 0–5 | 75–95 | Radiation-hardened species only |
| Ice World | 10–40 | 10–30 | 5–15 | 20–50 | 20–50 | Cold-adapted species |
| Gas Giant | 0–10 | 0–5 | 5–20 | 70–100 | 80–100 | Cloud/gas-adapted only |
| Ice Giant | 0–10 | 5–20 | 5–15 | 30–70 | 65–90 | Almost none |
| Barren/Rocky | 20–60 | 10–30 | 5–20 | 0–10 | 20–50 | None |
| Toxic/Corrosive | 10–40 | 30–60 | 10–30 | 10–40 | 60–90 | Chemical-tolerant species only |
| Crystalline | 10–30 | 60–100 | 20–50 | 0–10 | 30–60 | Rarely |
| Super-Earth | 40–80 | 20–50 | 10–30 | 10–40 | 20–50 | High-gravity adapted |
| Tidally Locked | 20–50 | 15–40 | 5–25 | 5–30 | 40–70 | Terminator-zone species |
| Rogue/Dark | 5–30 | 10–25 | 5–15 | 0–20 | 60–80 | None (or subterranean) |

---

## Moon Rules

- Moons draw from a restricted type subset: **Barren/Rocky, Ice World, Ocean World, Crystalline, Rogue/Dark**
- Moons can be inhabited (rarely), subject to the same species compatibility rules as planets
- Same resource abundance and hostility model applies

---

## Travel Between Systems

See [02-travel.md](02-travel.md) for full travel design. Summary:
- Inter-system travel requires the **warp engine**, which draws exponentially more power the farther the destination
- The galaxy map is viewed from a dedicated **Galactic Navigation Station** — detail level scales with power allocated to that station

---

## Empty Space

- If a ship flies beyond all planets in a system and keeps going, it enters **empty space**
- Empty space is procedurally populated with meteors, asteroids, and hazards as the ship moves
- Rare GM-driven events may occur in empty space (derelicts, anomalies) — see AI Game Master module
