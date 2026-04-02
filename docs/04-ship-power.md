# 03 — Ship Power System

## Overview
The ship generates power every game tick from 4 onboard reactors. Power is consumed each tick by all active systems. Net power = reactor output + battery contribution. If total available power drops below the General Systems floor, all screens and non-critical systems go dark.

---

## Reactors

| Reactor | Fuel Type | Max Output |
|---|---|---|
| Reactor 1 | Fuel (from Power Room) | 1,000 GW |
| Reactor 2 | Fuel (from Power Room) | 1,000 GW |
| Reactor 3 | Radioactive Material (from Power Room) | 1,000 GW |
| Reactor 4 | Radioactive Material (from Power Room) | 1,000 GW |

- **Combined max output:** 4,000 GW/tick
- Each reactor has its own output level (set by Power console), heat state, and health
- Reactors start at 5% output; operator must ramp them up
- Fuel/Radioactive Material consumed from Power Room each tick at `output × 100` units/tick
- If Power Room runs out of fuel/radioactive material, the corresponding reactor is shut off (output forced to 0)
- Damaged or overheated reactors reduce their GW output linearly with health

### Reactor Heat
- Heat increases as output % rises; 5 bands with different damage rates and thresholds
- At 100% heat: meltdown — reactor takes 30 damage, output forced to 0, auto-recovers when cooled
- Players must manage output vs. heat to avoid damage

---

## Battery

Batteries act as a **virtual fifth reactor** — they sit **outside** the 100% power distribution sum.

- `battery_count` — number of battery units aboard; each unit holds 100 GW
- `power_allocation["battery"]` — bipolar control: **positive % = discharging** (adds GW to net), **negative % = charging** (consumes GW from net)
- Battery charge/discharge handled by `update_battery()` each tick

```
net_power_gw = max(0, effective_reactor_gw + (battery_pct / 100) × (battery_count × 100))
```

- Battery at 0% = idle (neither charging nor discharging)
- Battery snaps to idle when fully charged or fully empty
- Key use case: reactor overheats or runs out of fuel → draw from battery to keep systems live

---

## Power Distribution

The **Power Station** operator controls power distribution via percentage sliders — one per powered system. All slider-controlled stations (including `warp_drive`) must always sum to **100%**. `battery` is separate and outside the sum.

### Power Allocation Keys (12 total)
| Key | In Sum | Default Lock |
|---|---|---|
| `engines` | yes | free |
| `warp_drive` | yes | free |
| `shields` | yes | free |
| `weapons` | yes | free |
| `short_range_scanner` | yes | free |
| `long_range_scanner` | yes | free |
| `comms` | yes | free |
| `life_support` | yes | GW-locked at 5 GW minimum |
| `general_systems` | yes | GW-locked at 20 GW default |
| `manufacturing` | yes | free |
| `repairs` | yes | free |
| `battery` | **no** | free (bipolar −100..100) |

### Lock Modes (per station)
- **Unlocked (🔓)** — slider is free; redistributed by sum-normalisation
- **% Locked (🔒%)** — percentage is fixed; not redistributed when others change
- **GW Locked (🔒GW)** — holds a fixed GW target; `update_gw_locks()` recalculates the % every tick against current `net_power_gw`; freed/consumed % is redistributed to all free stations

---

## Engines & Warp in the Power System

`warp_drive` is a `power_allocation` sumKey controlled from the **Engines panel**.

### Engine Power Budget Rule
Each tick `update_engines()` enforces:
```
elec_engine_draw + warp_charge_draw  ≤  engines_alloc_gw
```
- If electric draw exceeds its share, engine outputs are scaled down proportionally
- Warp receives whatever headroom remains after electric draw
- `warp_drive` allocation is additionally clamped so it can never exceed `engines` allocation; any excess is redistributed to `general_systems`

### Electric Engine Consumption
```
engine_consumption(output_frac) = floor(x × (1 + 3x/100))   where x = output_frac × 100
```
Gives ~1 GW/% at low throttle, ~4 GW/% at 100%.

### Fuel Engine Consumption
Each fuel engine deducts `engine_consumption(output_frac)` units of fuel from the Engine Room every tick. If Engine Room fuel is empty, that engine's output is forced to 0.

---

## Warp Capacitor

The warp capacitor stores charge for inter-system jumps. It charges from the `warp_drive` power allocation every tick.

```
net_charge_per_tick = warp_alloc_gw − 0.5 GW (passive leak)
warp_capacitor_gw   = clamp(current + net_charge, 0, 100,000)
```

### Jump Cost
```
warp_cost_gw = 100 × distance_ly^1.3
```

| Distance | Cost | % of full cap |
|---|---|---|
| 50 LY | 16,168 GW | 16% |
| 100 LY | 39,811 GW | 40% |
| 150 LY | 67,440 GW | 67% |
| 200 LY | 98,025 GW | 98% |
| **≈ 203 LY** | **100,000 GW** | **= full cap** |

Full cap covers any single hop in the galaxy (max nearest-neighbor = 132 LY).

---

## General Systems

All ship infrastructure that does not have its own power slider draws from `general_systems`.

| general_systems GW | Behavior |
|---|---|
| ≥ 20 GW | All non-critical systems operational; all consoles usable |
| < 20 GW | Blocking overlay on all non-power consoles; power console remains usable |

Default GW-lock: 20 GW. Operator can raise or lower this.

---

## Tick Lifecycle (Each Game Tick)

1. **`update_engines()`** — clamp `engine_outputs` to [0,1]; enforce budget; compute `engine_thrust_au`; burn Engine Room fuel; update warp capacitor
2. **`update_tick()`** — advance orbit angles, move ship per thrust × `engine_thrust_au`
3. **`update_reactor_heat()`** — advance heat per band, apply damage, trigger/recover meltdowns
4. **`consume_reactor_fuel()`** — deduct fuel/radioactive material from Power Room; shut off starved reactors
5. **`update_gw_locks()`** — recalculate pcts for GW-locked stations against current `net_power_gw`; redistribute delta to free stations
6. **`update_battery()`** — apply charge/discharge delta; snap to idle on full/empty
7. **Broadcast** — updated state sent to all WebSocket clients
