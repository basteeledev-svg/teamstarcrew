# Game constants — all tunable values in one place

# ── Galaxy ────────────────────────────────────────────────────────────────────
GALAXY_SYSTEM_COUNT_MIN = 50
GALAXY_SYSTEM_COUNT_MAX = 70
GALAXY_RADIUS_LY = 500.0       # light-year radius of the galaxy
GALAXY_HEIGHT_LY  = 10.0       # thin-disk height (±)

# ── Ship movement ─────────────────────────────────────────────────────────────
# At full thrust the ship covers ~7.5 AU in 300 ticks (5 min between neighbours)
MAX_SPEED_AU_PER_TICK   = 0.0     # initial thrust before engines are powered (engines set the real value)
TURN_RATE_DEG_PER_TICK  = 45.0   # max heading change per tick (degrees)

# ── Tick ──────────────────────────────────────────────────────────────────────
TICK_RATE_SECONDS = 1.0           # one game tick per second

# ── Parsec / light-year conversion ──────────────────────────────────────────
PC_TO_LY = 3.2616   # 1 parsec = 3.2616 light-years

# ── Crew ──────────────────────────────────────────────────────────────────────
CREW_BASE = 10   # permanent crew; passengers in living_quarters add extra O2/ration drain

# ── Power (TW) ────────────────────────────────────────────────────────────────
FUEL_GENERATOR_MAX_TW  = 100.0   # per fuel generator at 100% output & 100% health
NUCLEAR_REACTOR_MAX_TW = 400.0   # per nuclear reactor at 100% output & 100% health
REACTOR_COUNT          = 4

# ── Battery ───────────────────────────────────────────────────────────────────
BATTERY_CAPACITY_TW           = 100.0   # TW stored per battery unit
BATTERY_START_COUNT           = 5       # units aboard at game start

# ── Reactor heat ──────────────────────────────────────────────────────────────
# Output bands → heat delta per tick (output is 0–1 fraction):
#   ≤ 20 %  →  −2 / tick     (cooling fast)
#   ≤ 40 %  →  −1 / tick     (cooling slow)
#   ≤ 60 %  →   0 / tick     (neutral)
#   ≤ 80 %  →  +1 / tick     (heating slow)
#    > 80 %  →  +2 / tick     (heating fast)
#
# Fuel generator heat damage — spec step-wise probabilistic model:
#   heat 0–49  → 0 damage
#   heat 50–60 → 1 roll/tick, X% chance of 1 damage (X = heat value)
#   heat 61–70 → 2 rolls/tick
#   heat 71–80 → 3 rolls/tick
#   heat 81–100 → 4 rolls/tick
# Nuclear reactor heat delta per tick (9 precise bands from spec):
#   0%      → -4     1–10%   → -2     11–40%  → -1     41–60%  → 0
#   61–70%  → +1    71–80%  → +2     81–95%  → +3     96%+    → +4
REACTOR_MELTDOWN_DAMAGE = 30.0   # damage on 0–100 scale on full meltdown

# ── Life support ──────────────────────────────────────────────────────────────
LIFE_SUPPORT_BASE_GW           = 5.0    # GW needed at 0–99 people aboard
LIFE_SUPPORT_PER_100_PEOPLE_GW = 10.0  # extra GW per 100 people

# ── Engines ───────────────────────────────────────────────────────────────────
# Internal physics uses AU/tick; MN constants are for display conversion.
# Fuel:     500 MN max per engine ↔ 0.025 AU/tick
# Electric: 100 MN max per engine ↔ 0.0125 AU/tick
# Fuel consumption (spec): Fuel/tick = BASE_FUEL_COEFF × (throttle_pct ^ 2.5)
FUEL_ENGINE_MAX_THRUST_AU = 0.5      # AU/tick at 100% throttle (both engines full ≈ 1 AU/s: a system crossing takes ~1 min)
FUEL_ENGINE_MAX_MN        = 500.0    # display unit max per fuel engine
ELEC_ENGINE_MAX_THRUST_AU = 0.25     # AU/tick at 100% power
ELEC_ENGINE_MAX_MN        = 100.0    # display unit max per electric engine
BASE_FUEL_COEFF           = 0.0002   # throttle^2.5: 60% ≈ 5.6 fuel/s per engine, 100% = 20/s (fast but thirsty)
ENGINE_ROOM_FUEL_START    = 2_500.0  # units of fuel in Engine Room at game start

# ── Warp capacitor ────────────────────────────────────────────────────────────
WARP_CAPACITOR_MAX_TW  = 4_000.0    # maximum storable warp energy (TW) — about two medium jumps, so charge is a budget
WARP_CAPACITOR_LEAK_TW = 0.5        # TW lost per tick passively

# ── Warp cost ─────────────────────────────────────────────────────────────────
# Spec formula: Warp Cost (TW) = 15 × (D_parsecs ^ 1.5) + 20
# Distance in code is stored in LY; convert: D_pc = D_ly / PC_TO_LY
WARP_COST_BASE      = 15.0
WARP_COST_EXPONENT  = 1.5
WARP_COST_ADDITIVE  = 20.0

# ── Planets / orbits ──────────────────────────────────────────────────────────
PLANET_ORBIT_MIN_AU = 0.3
PLANET_ORBIT_MAX_AU = 45.0
# Angular speed for a planet at 1 AU; scales as r^-0.5 (inner planets faster).
# 0.001 rad/tick → full orbit in ~6283 ticks (~1.75 h) at 1 AU.
PLANET_ORBIT_BASE_SPEED_RAD = 0.001

# ── Ship starting state ───────────────────────────────────────────────────────
SHIP_START_DISTANCE_AU  = 3.0    # distance from star at session start
REACTOR_START_OUTPUT    = 0.30   # 30% start: ~300 TW, stable heat, 10+ min autonomy

# ── Room capacity ─────────────────────────────────────────────────────────────
ROOM_CAPACITY_STANDARD  = 10_000.0   # max total units in a standard room
ROOM_CAPACITY_LARGE     = 100_000.0  # max total units in cargo_bay and manufacturing

# ── Orbit ─────────────────────────────────────────────────────────────────────
ORBIT_DISTANCE_AU       = 0.5        # must be within this distance to enter orbit (0.5 AU per code; spec says 0.25 AU)
ORBIT_ANGULAR_SPEED     = 0.05       # radians per tick (~17 sec for a full orbit)

# ── Mining ────────────────────────────────────────────────────────────────────
# Each mining bot produces this many units per tick per 100 richness points
# Formula: gained = count * richness / 100  (richness is 0-100 %)
# e.g. richness=50, count=3 → 3 * 50 / 100 = 1.5 units/tick
MINING_BOTS_MAX         = 20     # max bots assignable per resource
MINING_BOT_START_COUNT  = 4      # mining bots aboard at game start
MINING_BOT_CHARGE_MAX   = 100.0  # max charge per mining bot
MINING_BOT_HEALTH_MAX   = 100.0  # max health per mining bot
MINING_BOT_CHARGE_COST  = 0.15   # charge consumed per tick while mining (spec)

# ── Transport bots ────────────────────────────────────────────────────────────
TRANSPORT_BOT_START_COUNT      = 2       # bots aboard at game start
TRANSPORT_BOT_CHARGE_MAX       = 100.0   # max charge per bot
TRANSPORT_BOT_CHARGE_COST      = 0.10    # charge consumed per tick on mission (spec)
TRANSPORT_BOT_CHARGE_RATE      = 5.0     # charge regained per tick while idle
TRANSPORT_BOT_HEALTH_MAX       = 100.0   # max health per bot
TRANSPORT_BOT_HEALTH_COST      = 1.0     # health lost per trip
TRANSPORT_BOT_CARGO_LARGE      = 1       # max large items per trip (equipment)
TRANSPORT_BOT_CARGO_CONSUMABLE = 1000.0  # max consumable units per trip (raw materials)
TRANSPORT_TRAVEL_TICKS         = 5       # ticks per phase (pickup travel + delivery)
TRANSPORT_BOT_BUILD_METALS     = 500.0   # metals required to build a new bot
TRANSPORT_BOT_BUILD_RARE       = 200.0   # rare_earth required to build a new bot

# ── Repair bots ───────────────────────────────────────────────────────────────
REPAIR_BOT_CHARGE_MAX    = 100.0   # max charge per repair bot
REPAIR_BOT_HEALTH_MAX    = 100.0   # max health per repair bot
REPAIR_BOT_REPAIR_RATE   = 0.5     # HP restored per tick per repairing bot
REPAIR_BOT_START_COUNT   = 1       # bots aboard at game start
REPAIR_BOT_TRAVEL_TICKS  = 5      # ticks to reach / return from target
REPAIR_BOT_CHARGE_COST   = 0.10   # charge consumed per tick when repairing (spec: 0.10/tick)
REPAIR_BOT_POWER_PER_BOT = 1.0    # TW required per active (traveling/repairing) bot

# ── Charging bay ──────────────────────────────────────────────────────────────
# Spec formula: New Charge = current + (Allocated_Bot_Power_TW × 0.5) per docked bot of type
CHARGING_BAY_CHARGE_RATE_PER_TW = 0.5   # charge units gained per TW per bot per tick

# ── Communications ────────────────────────────────────────────────────────────
# Spec formula: Max Range (parsecs) = 0.5 × comms_power_tw
# In LY: range_ly = comms_power_tw × 0.5 × PC_TO_LY
COMMS_RANGE_PC_PER_TW = 0.5

# ── Factions / NPC ships ──────────────────────────────────────────────────────
NPC_RACES       = ["Human", "Ssysrian", "Unitarian", "Fulborg", "Klackin"]
NPC_SHIP_SIZES  = ["small", "medium", "large", "capital"]
NPC_SHIPS_PER_SYSTEM_MIN = 2
NPC_SHIPS_PER_SYSTEM_MAX = 5

# ── Short-range scan ──────────────────────────────────────────────────────────
# Spec 5-tier LoD model: tier = highest where D_pc ≤ Coeff × √(scanner_power_tw)
# D in parsecs; internally convert: D_pc = distance_au / AU_PER_PC (for SRS)
# SRS tiers by AU-range signal:
SCAN_PLANET_TIER1 = 0.5    # reveals: name, type, moon count
SCAN_PLANET_TIER2 = 2.0    # reveals: inhabited status
SCAN_PLANET_TIER3 = 5.0    # reveals: approximate resources & hostility
SCAN_PLANET_TIER4 = 10.0   # reveals: precise resource values & hostility
# NPC ship tiers:
SCAN_SHIP_TIER1  = 1.0     # contact detected
SCAN_SHIP_TIER2  = 3.0     # reveals: ship size
SCAN_SHIP_TIER3  = 7.0     # reveals: race / faction
SCAN_SHIP_TIER4  = 15.0    # reveals: hull health %

# ── Long-range scan ───────────────────────────────────────────────────────────
# Spec: LoD = highest tier where D_pc ≤ Coeff × √(scanner_power_tw)
# LRS coefficients (in parsecs): same formula, distance in LY converted via PC_TO_LY
SCAN_LRS_T1_COEFF = 4.25   # tier 1: star presence
SCAN_LRS_T2_COEFF = 2.83   # tier 2: planet count + types
SCAN_LRS_T3_COEFF = 1.41   # tier 3: approx resource indicators + ship count
SCAN_LRS_T4_COEFF = 0.99   # tier 4: exact planetary resource metrics
SCAN_LRS_T5_COEFF = 0.71   # tier 5: exact ship numbers + faction/race
# Legacy LRS tier signal thresholds (kept for gradual migration)
LRS_TIER1 =  0.1
LRS_TIER2 =  0.5
LRS_TIER3 =  2.0
LRS_TIER4 =  5.0
LRS_TIER5 = 10.0
LRS_TIER6 = 25.0

# ── Component install / uninstall timers (spec: fixed tick countdown) ─────────
COMPONENT_INSTALL_TICKS   = 80   # ticks until installed component comes online
COMPONENT_UNINSTALL_TICKS = 50   # ticks until uninstalling component is removed

# ── Weapon energy pool ────────────────────────────────────────────────────────
WEAPON_ENERGY_POOL_MAX = 5000.0  # max TW the pool can hold

# ── Hull sections ─────────────────────────────────────────────────────────────
SECTION_SIDES          = ["fore", "aft", "port", "starboard", "above", "below"]
SECTION_COMPONENT_CAP  = 5   # max of each component type per hull section

# ── Meteors ───────────────────────────────────────────────────────────────────
METEOR_SPAWN_CHANCE    = 0.04   # probability per tick a meteor spawns (~every 25 ticks)
METEOR_SPAWN_RADIUS_AU = 4.0    # distance from ship where meteors appear
METEOR_SIZES           = ["small", "medium", "large"]
METEOR_HEALTH_MAP      = {"small": 25.0, "medium": 60.0, "large": 120.0}
METEOR_SPEED_MAP       = {"small": 0.008, "medium": 0.005, "large": 0.003}
METEOR_DAMAGE_MAP      = {"small": 8.0,  "medium": 20.0,  "large": 45.0}
METEOR_HIT_RADIUS_AU   = 0.02   # must be within this distance to hit ship

# ── Player missiles ───────────────────────────────────────────────────────────
MISSILE_SPEED_AU          = 0.9    # AU per tick (faster than raiders)
MISSILE_HEALTH            = 100.0
MISSILE_BASE_DAMAGE       = 100.0  # base damage to NPC hull on hit
MISSILE_HIT_RADIUS_AU     = 0.05   # proximity for impact

# ── Defense lasers (Shields station) ─────────────────────────────────────────
DEFENSE_LASER_RANGE_PER_TW = 0.10  # AU of range per TW fed to one defense laser
DEFENSE_LASER_DPS_PER_TW   = 2.0   # HP/tick per TW

# ── Offense lasers (Weapons station) ─────────────────────────────────────────
OFFENSE_LASER_DPS_PER_TW   = 4.0   # HP/tick per TW fed to one offense laser

# ── Targeting system ──────────────────────────────────────────────────────────
TARGETING_RANGE_PER_TW     = 0.8   # AU of targeting range per TW to targeting system

# ── Shield generators ─────────────────────────────────────────────────────────
SHIELD_REDUCTION_PER_TW    = 5.0   # % damage reduction per TW to one shield generator
MAX_SHIELD_REDUCTION       = 0.85  # absolute cap on damage reduction per side


# ── Economy & wear (balanced with backend/tools/balance_sim.py) ──────────────
# Reactors burn their stock in proportion to output: units per tick at 100%.
REACTOR_FUEL_PER_TICK_AT_FULL = 3.0     # fuel generators burn "fuel"
REACTOR_RAD_PER_TICK_AT_FULL  = 3.0     # nuclear reactors burn "radioactive" (4x the power per unit)
REACTOR_ROOM_FUEL_START       = 3_000.0
REACTOR_ROOM_RAD_START        = 4_000.0
MINING_YIELD_PER_BOT          = 25.0    # units per tick per bot at richness 1.0
SYNTH_FUEL_PER_TW             = 5.0     # synthesis: hydrocarbons -> fuel, units per TW
# Fuel engines heat up like reactors (bands on throttle); see Ship.update_engine_heat
ENGINE_MELTDOWN_DAMAGE        = 25.0
# Warp drive wear per jump: base + per parsec (health is 0-100)
WARP_WEAR_BASE                = 1.0
WARP_WEAR_PER_PC              = 0.12
WARP_MIN_HEALTH               = 20.0    # at or below this the drive won't spool
WARP_BATTERY_BONUS_TW         = 3_500.0 # each warp battery in the reactor room raises the charge cap
WARP_BATTERIES_START          = 1
