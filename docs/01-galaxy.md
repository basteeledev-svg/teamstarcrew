# Galaxy & Star Systems

## Galaxy Generation

Each session generates a procedural galaxy with **50–70 star systems** arranged in a 2-arm logarithmic spiral of radius **500 light-years** and disk height **±10 LY**.

## Star Systems

Each system contains:
- **1 star** at the origin (types: Red Dwarf, Yellow Main-Sequence, Blue Giant, White Dwarf, Binary)
- **2–8 planets** in circular orbits (`0.3–45 AU`), moving each tick at angular speed ∝ `r^−0.5`
- **0–3 moons** per planet (subset of planet types: Barren/Rocky, Ice, Volcanic, Carbon)
- **NPC ships** (AI-spawned, 2–5 per system initially; AI Game Master controls all NPC behaviour)

## Planet Types (15)

Terrestrial, Gas Giant, Ice Giant, Ocean/Water World, Desert/Arid, Volcanic/Lava, Barren/Rocky, Carbon, Ammonia, Super-Earth, Dwarf/Planetoid, Tidally Locked, Ring, Ice, Exotic/Anomalous.

Each planet has:
- **Resources**: `metals`, `rare_earth`, `radioactive`, `hydrocarbons` (richness 0–100)
- **Hostility**: 0–100
- **Inhabited**: boolean (never for moons)
- **Stockpile**: dict of mined/deposited resources
- **Position**: updated each tick via orbital mechanics

## Scanning

Planets and ships are progressively revealed through short/long-range scanning. Higher scanner GW reveals more detail at greater distances.

**Short-range scan tiers** (signal = `scan_gw / distance_au`):
- Tier 1 (0.5): name, type, moon count
- Tier 2 (2.0): inhabited status
- Tier 3 (5.0): approximate resources & hostility
- Tier 4 (10.0): precise resource values & hostility

**Long-range scan tiers** (signal = `lrs_gw / distance_ly`):
- Tier 1–6: progressive system-level detail (star name → planet count → types → ship count)

## Travel

- **In-system**: 4 engines provide thrust (up to 0.075 AU/tick combined)
- **Inter-system warp**: costs `100 × dist_ly^1.3` GW from the warp capacitor
- **Orbit**: enter within 0.5 AU of a planet; ship locks into circular orbit at 0.05 rad/tick
