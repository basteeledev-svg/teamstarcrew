# Power System

## 4 Reactors

| Reactor | Fuel Type | Max Output |
|---------|-----------|------------|
| reactor_1_fuel | fuel | 1,000 GW |
| reactor_2_fuel | fuel | 1,000 GW |
| reactor_3_rad | radioactive | 1,000 GW |
| reactor_4_rad | radioactive | 1,000 GW |

**Maximum total output: 4,000 GW** (all reactors at 100% health and 100% output).

Actual output per reactor = `MAX_REACTOR_OUTPUT_GW × output_fraction × health_fraction`.

Fuel consumed per tick: `output_fraction × 100` units from the Power Room.

## Reactor Heat

Heat accumulates based on output band (per tick):

| Output | Heat Delta |
|--------|-----------|
| ≤ 20% | −2 (cooling fast) |
| ≤ 40% | −1 (cooling slow) |
| ≤ 60% | 0 (neutral) |
| ≤ 80% | +1 (heating slow) |
| > 80% | +2 (heating fast) |

**Damage thresholds** (highest match wins):
- heat > 50%: 10% chance of 0.1 damage/tick
- heat > 75%: 50% chance of 0.1 damage/tick
- heat > 90%: 0.1 damage/tick guaranteed
- heat > 95%: 0.2 damage/tick guaranteed
- heat = 100%: **Meltdown** — 30 damage burst, reactor forced off until fully cooled

## Battery

- Acts as a virtual 5th power source (positive pct = discharge, negative = charge)
- `battery_count × BATTERY_CAPACITY_GW` = total capacity (5 × 100 = 500 GW default)
- Battery allocation is **outside** the 100% sum of other stations

## 12-Key Power Distribution

Power is distributed as percentages that sum to 100 (battery excluded):

| Key | Purpose |
|-----|---------|
| engines | Electric engine power and warp charging headroom |
| warp_drive | Warp capacitor charge rate (draws from engines budget) |
| shields | Feeds shield batteries and defense lasers; also powers component install jobs |
| weapons | Feeds offense lasers, targeting system; also powers component install jobs |
| short_range_scanner | Short range scan resolution |
| long_range_scanner | Long range scan resolution |
| comms | Communications range (`comms_gw × 0.1` = range in LY) |
| life_support | Crew life support (minimum GW floor based on crew count) |
| general_systems | General ship functions; below 20 GW, non-power consoles show warning |
| manufacturing | Powers manufacturing recipes |
| charging_bay | Charges all idle bots (transport, repair, mining) in the bay |
| battery | Charge/discharge rate (outside sum; −100 to +100) |

### Lock Modes (per station)

- **Unlocked**: percentage adjusts freely
- **% Locked**: percentage fixed; doesn't change when others adjust
- **GW Locked**: absolute GW target maintained; percentage auto-adjusts as reactor output changes

Life support is permanently GW-locked at its minimum.

## Warp Capacitor

- Max capacity: 100,000 GW
- Passive leak: 0.5 GW/tick
- Charge rate: whatever GW `warp_drive` allocation provides (capped by `engines` budget)
- Jump cost: `100 × distance_ly^1.3` GW

## Engine Power Budget

Warp drive draws from the engines allocation pool. Electric engines share the remaining budget:
1. Compute `engines_alloc_gw` and `warp_alloc_gw`
2. If `warp > engines`, clamp warp down; excess → general_systems
3. Electric engines get `engines_budget − warp_gw`; if over, engines are scaled down
4. Fuel engines consume fuel from Engine Room independently

## Per-Tick Lifecycle

1. Advance planet orbits
2. Update engines (compute thrust, consume fuel/power, charge warp)
3. Move ship (orbit or translate)
4. Update reactor heat and apply damage
5. Consume reactor fuel from Power Room
6. Recalculate GW locks
7. Update battery charge/discharge
8. Advance transport bots (charging + job progress)
9. Advance repair bots
10. Advance mining bots (charge consumption)
11. Run manufacturing production
12. Advance component install/uninstall jobs
13. Update combat (meteors, missiles, laser fire, damage)
