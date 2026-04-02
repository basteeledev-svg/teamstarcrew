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
GENERAL_SYSTEMS_FLOOR_GW = 5.0   # below this → full blackout

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

# ── Dynamic object spawn radius ───────────────────────────────────────────────
DYNAMIC_SPAWN_RADIUS_AU = 5.0

# ── Ship starting state ───────────────────────────────────────────────────────
SHIP_START_DISTANCE_AU = 3.0  # distance from star at session start

# ── Mining ────────────────────────────────────────────────────────────────────
# Each mining bot produces this many units per tick per 100 richness points
# Formula: gained = count * richness * health / 100  (both are 0-100 %)
# e.g. richness=50, health=80, count=3 → 3 * 50 * 80 / 100 = 120 units/tick
MINING_BOTS_MAX = 20     # max bots assignable per resource
