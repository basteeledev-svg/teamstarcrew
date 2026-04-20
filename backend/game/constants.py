# Game constants — all tunable values in one place

# ── Galaxy ────────────────────────────────────────────────────────────────────
GALAXY_SYSTEM_COUNT_MIN = 50
GALAXY_SYSTEM_COUNT_MAX = 70
GALAXY_RADIUS_LY = 500.0       # light-year radius of the galaxy
GALAXY_HEIGHT_LY  = 10.0       # thin-disk height (±)

# ── Ship movement ─────────────────────────────────────────────────────────────
# At full thrust the ship covers ~7.5 AU in 300 ticks (5 min between neighbours)
MAX_SPEED_AU_PER_TICK   = 0.025   # AU per tick at thrust = 1.0
TURN_RATE_DEG_PER_TICK  = 45.0   # max heading change per tick (degrees)

# ── Tick ──────────────────────────────────────────────────────────────────────
TICK_RATE_SECONDS = 1.0           # one game tick per second

# ── Power ─────────────────────────────────────────────────────────────────────
MAX_REACTOR_OUTPUT_GW   = 1000.0  # per reactor, at 100 % output & 100 % health
REACTOR_COUNT           = 4

# ── Battery ───────────────────────────────────────────────────────────────────
BATTERY_CAPACITY_GW           = 100.0   # GW stored per battery unit
BATTERY_START_COUNT           = 5       # units aboard at game start

# ── Reactor heat ──────────────────────────────────────────────────────────────
# Output bands → heat delta per tick (output is 0–1 fraction):
#   ≤ 20 %  →  −2 / tick     (cooling fast)
#   ≤ 40 %  →  −1 / tick     (cooling slow)
#   ≤ 60 %  →   0 / tick     (neutral)
#   ≤ 80 %  →  +1 / tick     (heating slow)
#    > 80 %  →  +2 / tick     (heating fast)
#
# Damage thresholds (highest matching applies; health is 0–100, i.e. 0–1000 HP):
#   heat > 50 %  → 10 % chance of 0.1 damage
#   heat > 75 %  → 50 % chance of 0.1 damage
#   heat > 90 %  → 0.1 damage / tick guaranteed
#   heat > 95 %  → 0.2 damage / tick guaranteed
#   heat = 100 % → meltdown: shutdown + large damage burst
REACTOR_MELTDOWN_DAMAGE = 30.0   # damage on 0–100 scale (= 300 / 1000 HP)

# ── Life support ──────────────────────────────────────────────────────────────
LIFE_SUPPORT_BASE_GW           = 5.0    # GW needed at 0–99 people aboard
LIFE_SUPPORT_PER_100_PEOPLE_GW = 10.0  # extra GW per 100 people

# ── Engines ───────────────────────────────────────────────────────────────────
# Quadratic consumption: floor(x * (1 + 3x/100)) where x = output_pct (0-100)
# → 1 unit/% at low output, 4 units/% at 100% output
FUEL_ENGINE_MAX_THRUST_AU = 0.025    # AU/tick at 100% output (= MAX_SPEED_AU_PER_TICK)
ELEC_ENGINE_MAX_THRUST_AU = 0.0125   # AU/tick at 100% output (half of fuel engine)
ENGINE_ROOM_FUEL_START    = 50_000.0 # units of fuel in Engine Room at game start

# ── Warp capacitor ────────────────────────────────────────────────────────────
WARP_CAPACITOR_MAX_GW  = 100_000.0  # maximum storable warp energy (GW)
WARP_CAPACITOR_LEAK_GW = 0.5        # GW lost per tick passively

# ── Warp ──────────────────────────────────────────────────────────────────────
# cost (GW) = WARP_COST_BASE * distance_ly ^ WARP_COST_EXPONENT
# (power stub — not enforced until power station is built)
WARP_COST_BASE     = 100.0
WARP_COST_EXPONENT = 1.3

# ── Planets / orbits ──────────────────────────────────────────────────────────
PLANET_ORBIT_MIN_AU = 0.3
PLANET_ORBIT_MAX_AU = 45.0
# Angular speed for a planet at 1 AU; scales as r^-0.5 (inner planets faster).
# 0.001 rad/tick → full orbit in ~6283 ticks (~1.75 h) at 1 AU.
PLANET_ORBIT_BASE_SPEED_RAD = 0.001

# ── Ship starting state ───────────────────────────────────────────────────────
SHIP_START_DISTANCE_AU  = 3.0    # distance from star at session start
REACTOR_START_OUTPUT    = 0.05   # initial reactor output fraction (0–1)

# ── Room capacity ─────────────────────────────────────────────────────────────
ROOM_CAPACITY_STANDARD  = 10_000.0   # max total units in a standard room
ROOM_CAPACITY_LARGE     = 100_000.0  # max total units in cargo_bay and manufacturing

# ── Orbit ─────────────────────────────────────────────────────────────────────
ORBIT_DISTANCE_AU       = 0.5        # must be within this distance to enter orbit
ORBIT_ANGULAR_SPEED     = 0.05       # radians per tick (~17 sec for a full orbit)

# ── Mining ────────────────────────────────────────────────────────────────────
# Each mining bot produces this many units per tick per 100 richness points
# Formula: gained = count * richness / 100  (richness is 0-100 %)
# e.g. richness=50, count=3 → 3 * 50 / 100 = 1.5 units/tick
MINING_BOTS_MAX         = 20     # max bots assignable per resource
MINING_BOT_START_COUNT  = 3      # mining bots aboard at game start
MINING_BOT_CHARGE_MAX   = 100.0  # max charge per mining bot
MINING_BOT_HEALTH_MAX   = 100.0  # max health per mining bot
MINING_BOT_CHARGE_COST  = 1.0    # charge consumed per tick while mining

# ── Transport bots ────────────────────────────────────────────────────────────
TRANSPORT_BOT_START_COUNT      = 1       # bots aboard at game start
TRANSPORT_BOT_CHARGE_MAX       = 100.0   # max charge per bot
TRANSPORT_BOT_CHARGE_COST      = 10.0    # charge consumed per trip
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
REPAIR_BOT_CHARGE_COST   = 1.0    # charge consumed per tick when traveling or repairing
REPAIR_BOT_POWER_PER_BOT = 1.0    # GW required per active (traveling/repairing) bot

# ── Charging bay ──────────────────────────────────────────────────────────────
# Bots only charge when idle in the charging bay.
# charge_rate = (charging_bay_gw / bots_in_bay) * CHARGING_BAY_CHARGE_RATE_PER_GW
CHARGING_BAY_CHARGE_RATE_PER_GW = 2.0   # charge units gained per GW per bot per tick

# ── Communications ────────────────────────────────────────────────────────────
# comms_range_ly = comms_gw * COMMS_RANGE_LY_PER_GW
# Same-system contacts always reachable if comms_gw >= 1.
# e.g. 5% of 3200 GW = 160 GW → 16 LY range
COMMS_RANGE_LY_PER_GW = 0.1   # light-years of range per GW allocated to comms

# ── Factions / NPC ships ──────────────────────────────────────────────────────
NPC_RACES       = ["Human", "Ssysrian", "Unitarian", "Fulborg", "Klackin"]
NPC_SHIP_SIZES  = ["small", "medium", "large", "capital"]
NPC_SHIPS_PER_SYSTEM_MIN = 2
NPC_SHIPS_PER_SYSTEM_MAX = 5

# ── Short-range scan ──────────────────────────────────────────────────────────
# signal = scan_gw / distance_au  (minimum distance clamped to 0.05 AU)
# Planet tiers:
SCAN_PLANET_TIER1 = 0.5    # reveals: name, type, moon count
SCAN_PLANET_TIER2 = 2.0    # reveals: inhabited status
SCAN_PLANET_TIER3 = 5.0    # reveals: approximate resources & hostility
SCAN_PLANET_TIER4 = 10.0   # reveals: precise resource values & hostility
# NPC ship tiers:
SCAN_SHIP_TIER1  = 1.0     # contact detected on radar
SCAN_SHIP_TIER2  = 3.0     # reveals: ship size
SCAN_SHIP_TIER3  = 7.0     # reveals: race / faction
SCAN_SHIP_TIER4  = 15.0    # reveals: hull health %

# ── Long-range scan ───────────────────────────────────────────────────────────
# signal = lrs_gw / distance_ly  (distance clamped to 0.1 LY minimum)
# The player's own current system always shows at max tier (no scan needed).
LRS_TIER1 =  0.1    # reveals: star name
LRS_TIER2 =  0.5    # reveals: approximate planet count (bucket)
LRS_TIER3 =  2.0    # reveals: exact planet count
LRS_TIER4 =  5.0    # reveals: exact planet + total moon counts
LRS_TIER5 = 10.0    # reveals: individual planet types (and moon types)
LRS_TIER6 = 25.0    # reveals: approximate ship count in system

# ── Hull sections ─────────────────────────────────────────────────────────────
SECTION_SIDES          = ["front", "back", "port", "starboard", "above", "below"]
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
MISSILE_SPEED_AU          = 0.5    # AU per tick
MISSILE_HEALTH            = 100.0
MISSILE_BASE_DAMAGE       = 100.0  # base damage to NPC hull on hit
MISSILE_HIT_RADIUS_AU     = 0.05   # proximity for impact

# ── Defense lasers (Shields station) ─────────────────────────────────────────
# range = health_fraction * gw * DEFENSE_LASER_RANGE_PER_GW
DEFENSE_LASER_RANGE_PER_GW = 0.10  # AU of range per GW fed to one defense laser
DEFENSE_LASER_DPS_PER_GW   = 2.0   # HP/tick per GW

# ── Offense lasers (Weapons station) ─────────────────────────────────────────
OFFENSE_LASER_DPS_PER_GW   = 4.0   # HP/tick per GW fed to one offense laser

# ── Targeting system ──────────────────────────────────────────────────────────
TARGETING_RANGE_PER_GW     = 0.8   # AU of targeting range per GW to targeting system

# ── Shield batteries ──────────────────────────────────────────────────────────
SHIELD_REDUCTION_PER_GW    = 5.0   # % damage reduction per GW to one shield battery
MAX_SHIELD_REDUCTION       = 0.85  # absolute cap on damage reduction per side
