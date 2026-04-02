"""Ship state and per-tick movement update."""
import math
import random
from dataclasses import dataclass, field
from typing import Optional

from .constants import (
    MAX_SPEED_AU_PER_TICK,
    TURN_RATE_DEG_PER_TICK,
    SHIP_START_DISTANCE_AU,
    BATTERY_CAPACITY_GW,
    REACTOR_MELTDOWN_DAMAGE,
    LIFE_SUPPORT_BASE_GW,
    LIFE_SUPPORT_PER_100_PEOPLE_GW,
    FUEL_ENGINE_MAX_THRUST_AU,
    ELEC_ENGINE_MAX_THRUST_AU,
    ENGINE_ROOM_FUEL_START,
    WARP_CAPACITOR_MAX_GW,
    WARP_CAPACITOR_LEAK_GW,
)
from .vector3 import v3, normalize, scale, add, rotate_toward

ORBIT_ANGULAR_SPEED = 0.05  # radians per tick (~17 sec for a full orbit)

# ── System component names (used as keys in system_health) ───────────────────
SYSTEM_HEALTH_KEYS = [
    "reactor_1_fuel",
    "reactor_2_fuel",
    "reactor_3_rad",
    "reactor_4_rad",
    "engine_1_electric",
    "engine_2_electric",
    "engine_3_fuel",
    "engine_4_fuel",
    "warp_drive",
    "short_range_scanner",
    "long_range_scanner",
    "comms_array",
    "shield_system",
    "weapons_system",
]


@dataclass
class Ship:
    current_system_id: str
    position: dict          # AU, star at (0,0,0)
    direction: dict         # normalised unit vector
    target_direction: dict  # where the navigator is steering toward
    thrust: float           # 0.0 – 1.0
    hull_health: float      # 0 – 100; 0 = game over
    system_health: dict     # {key: float 0-100} for each SYSTEM_HEALTH_KEYS entry
    reactor_outputs: dict   # {key: float 0-1} — operator-set output fraction per reactor
    # Orbit state (defaults to not orbiting)
    orbiting_planet_id: Optional[str] = None
    orbit_angle_rad: float = 0.0
    orbit_radius_au: float = 0.0
    orbit_center: dict = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    # Mining bots assigned per resource for the orbited planet
    mining_bots: dict = field(default_factory=lambda: {
        "metals": 0, "rare_earth": 0, "radioactive": 0, "hydrocarbons": 0
    })
    # Battery bank
    battery_count: int = 5          # each unit holds BATTERY_CAPACITY_GW
    battery_energy_gw: float = 0.0  # currently stored energy
    # Crew (affects life support minimum)
    people_on_board: int = 8
    # Reactor heat (0-100 % per reactor)
    reactor_heat: dict = field(default_factory=lambda: {
        "reactor_1_fuel": 0.0, "reactor_2_fuel": 0.0,
        "reactor_3_rad":  0.0, "reactor_4_rad":  0.0,
    })
    # Shutdown flag: True = reactor melted down, locked off until fully cooled
    reactor_shutdown: dict = field(default_factory=lambda: {
        "reactor_1_fuel": False, "reactor_2_fuel": False,
        "reactor_3_rad":  False, "reactor_4_rad":  False,
    })
    # Engine outputs — 4 propulsion engines (warp drive managed via power_allocation)
    engine_outputs: dict = field(default_factory=lambda: {
        "engine_1_electric": 0.0,
        "engine_2_electric": 0.0,
        "engine_3_fuel":     0.0,
        "engine_4_fuel":     0.0,
    })
    # Warp capacitor — charges from warp_drive power allocation; leaks passively
    warp_capacitor_gw: float = 0.0
    # Computed each tick by update_engines(); drives update_tick() movement
    engine_thrust_au: float = MAX_SPEED_AU_PER_TICK
    # Power allocation — percentages that always sum to 100
    # battery can go negative (discharge) down to -100 %
    power_allocation: dict = field(default_factory=lambda: {
        "engines":             20.0,
        "warp_drive":          10.0,
        "shields":             10.0,
        "weapons":             10.0,
        "short_range_scanner":  5.0,
        "long_range_scanner":   5.0,
        "comms":                5.0,
        "life_support":         2.0,
        "general_systems":      8.0,
        "manufacturing":        5.0,
        "repairs":              5.0,
        "battery":             15.0,
    })
    # Which allocation sliders are locked (user cannot drag them)
    power_allocation_locked: dict = field(default_factory=lambda: {
        "engines":             False,
        "warp_drive":          False,
        "shields":             False,
        "weapons":             False,
        "short_range_scanner": False,
        "long_range_scanner":  False,
        "comms":               False,
        "life_support":        False,  # GW-locked instead (see power_allocation_gw_targets)
        "general_systems":     False,
        "manufacturing":       False,
        "repairs":             False,
        "battery":             False,
    })
    # GW lock targets — float = locked to that many GW, None = not GW-locked
    # GW locks are mutually exclusive with % locks; life_support cannot be GW-locked
    power_allocation_gw_targets: dict = field(default_factory=lambda: {
        "engines":             None,
        "warp_drive":          None,
        "shields":             None,
        "weapons":             None,
        "short_range_scanner": None,
        "long_range_scanner":  None,
        "comms":               None,
        "life_support":        None,
        "general_systems":     None,
        "manufacturing":       None,
        "repairs":             None,
        "battery":             None,
    })
    # Ship room inventories — items must be present in a room to be used there
    # Power Room: fuel (for R1/R2), radioactive_material (for R3/R4), power_batteries (alias of battery_count)
    rooms: dict = field(default_factory=lambda: {
        "power_room": {
            "fuel":                 10000.0,
            "radioactive_material": 10000.0,
        },
        "engine_room": {
            "fuel": 0.0,
        },
        "weapons_room": {
            "lasers": 0, "missiles": 0,
        },
        "shields_room": {
            "shield_batteries": 0, "lasers": 0,
        },
        "living_quarters": {
            "air_scrubbers": 0,
        },
        "cargo_bay": {
            "metals": 0.0, "rare_earth": 0.0, "radioactive_material": 0.0,
            "hydrocarbons": 0.0, "fuel": 0.0,
            "lasers": 0, "missiles": 0, "shield_batteries": 0,
            "power_batteries": 0, "air_scrubbers": 0,
        },
        "manufacturing": {
            "metals": 0.0, "rare_earth": 0.0, "radioactive_material": 0.0,
            "hydrocarbons": 0.0, "fuel": 0.0,
            "lasers": 0, "missiles": 0, "shield_batteries": 0,
            "power_batteries": 0, "air_scrubbers": 0,
        },
    })

    def orbit_planet(self, planet_id: str, planet_pos: dict) -> None:
        """Lock the ship into a simulated circular orbit around a planet."""
        self.thrust = 0.0
        self.orbiting_planet_id = planet_id
        dx = self.position["x"] - planet_pos["x"]
        dz = self.position["z"] - planet_pos.get("z", 0.0)
        self.orbit_radius_au = max(0.05, math.sqrt(dx ** 2 + dz ** 2))
        self.orbit_angle_rad = math.atan2(dz, dx)
        self.orbit_center = {"x": planet_pos["x"], "z": planet_pos.get("z", 0.0)}

    def leave_orbit(self) -> None:
        """Exit orbit; thrust remains 0 so the crew must apply it manually."""
        self.orbiting_planet_id = None
        self.mining_bots = {"metals": 0, "rare_earth": 0, "radioactive": 0, "hydrocarbons": 0}

    def update_tick(self, planet_center=None) -> None:
        """Called once per game tick: rotate toward target, then translate.

        planet_center: current {x, z} position of the orbited planet (if any).
        Passing this keeps the ship glued to a planet that is itself moving.
        """
        if self.orbiting_planet_id:
            # Track the planet's new position before advancing the ship's angle
            if planet_center is not None:
                self.orbit_center = {
                    "x": planet_center["x"],
                    "z": planet_center.get("z", 0.0),
                }
            # Advance angle and reposition on the orbit circle
            self.orbit_angle_rad += ORBIT_ANGULAR_SPEED
            cx, cz = self.orbit_center["x"], self.orbit_center["z"]
            self.position = {
                "x": round(cx + math.cos(self.orbit_angle_rad) * self.orbit_radius_au, 4),
                "y": 0.0,
                "z": round(cz + math.sin(self.orbit_angle_rad) * self.orbit_radius_au, 4),
            }
            # Face tangent direction (direction of travel)
            self.direction = normalize({
                "x": -math.sin(self.orbit_angle_rad),
                "y": 0.0,
                "z":  math.cos(self.orbit_angle_rad),
            })
            return

        # 1. Turn toward target direction (capped by TURN_RATE)
        self.direction = rotate_toward(
            self.direction, self.target_direction, TURN_RATE_DEG_PER_TICK
        )
        # 2. Move
        if self.thrust > 0:
            step = scale(self.direction, self.thrust * self.engine_thrust_au)
            self.position = add(self.position, step)

    def warp_to(self, system_id: str, max_orbital_au: float) -> None:
        """Teleport to the edge of a destination system (beyond outermost planet)."""
        self.leave_orbit()  # cancel any active orbit
        self.current_system_id = system_id
        arrival_dist = max_orbital_au * random.uniform(1.1, 1.5)
        angle_h = random.uniform(0, math.pi * 2)
        angle_v = random.uniform(-math.pi / 6, math.pi / 6)
        self.position = {
            "x": round(arrival_dist * math.cos(angle_h) * math.cos(angle_v), 4),
            "y": round(arrival_dist * math.sin(angle_v), 4),
            "z": round(arrival_dist * math.sin(angle_h) * math.cos(angle_v), 4),
        }
        self.thrust = 0.0

    # ── Engine helpers ────────────────────────────────────────────────────────

    @staticmethod
    def engine_consumption(output_frac: float) -> int:
        """Quadratic fuel/power draw per tick.
        floor(x * (1 + 3x/100)) where x = output_frac * 100 (0–100 %).
        Scales from 1 unit/% at low output to 4 units/% at full throttle.
        """
        x = output_frac * 100.0
        return math.floor(x * (1.0 + 3.0 * x / 100.0))

    def update_engines(self) -> None:
        """Called once per tick. Enforces engines power budget, computes thrust,
        consumes fuel/power, and updates the warp capacitor.

        Budget rule: electric engine draw + warp drive charge <= engines_alloc_gw.
        If over budget, electric engines are scaled down proportionally first;
        warp then receives whatever headroom remains.
        """
        # ── Defensive clamp: engine_outputs must always be in [0, 1] ─────────
        for k in self.engine_outputs:
            self.engine_outputs[k] = max(0.0, min(1.0, self.engine_outputs[k]))

        e = self.engine_outputs
        _ELEC_KEYS = ("engine_1_electric", "engine_2_electric")

        # ── Power budget enforcement ───────────────────────────────────────────
        total_gw         = self.net_power_gw()
        engines_alloc_gw = (self.power_allocation.get("engines",    0.0) / 100.0) * total_gw
        warp_alloc_gw    = (self.power_allocation.get("warp_drive", 0.0) / 100.0) * total_gw

        # Clamp warp_drive allocation to engines budget — warp draws from engines pool.
        # Redistribute any excess back to general_systems to maintain the 100 % sum.
        if total_gw > 0 and warp_alloc_gw > engines_alloc_gw:
            excess_pct = round((warp_alloc_gw - engines_alloc_gw) / total_gw * 100.0, 4)
            self.power_allocation["warp_drive"] = round(
                self.power_allocation.get("warp_drive", 0.0) - excess_pct, 4
            )
            self.power_allocation["general_systems"] = round(
                self.power_allocation.get("general_systems", 0.0) + excess_pct, 4
            )
            warp_alloc_gw = engines_alloc_gw

        elec_draw_gw = sum(self.engine_consumption(e.get(k, 0.0)) for k in _ELEC_KEYS)

        # Scale electric engines down if they + warp exceed the engines budget
        elec_budget = max(0.0, engines_alloc_gw - warp_alloc_gw)
        if elec_draw_gw > elec_budget:
            scale = elec_budget / elec_draw_gw if elec_draw_gw > 0 else 0.0
            for k in _ELEC_KEYS:
                self.engine_outputs[k] = round(self.engine_outputs[k] * scale, 4)
            elec_draw_gw = elec_budget

        # Warp gets whatever headroom remains after electric
        remaining_for_warp = max(0.0, engines_alloc_gw - elec_draw_gw)
        actual_warp_gw     = min(warp_alloc_gw, remaining_for_warp)

        # ── Per-engine thrust (health-scaled, using capped outputs) ───────────
        fuel_thrust = 0.0
        for key in ("engine_3_fuel", "engine_4_fuel"):
            out  = e.get(key, 0.0)
            hlth = self.system_health.get(key, 100.0) / 100.0
            fuel_thrust += out * hlth * FUEL_ENGINE_MAX_THRUST_AU

        elec_thrust = 0.0
        for key in _ELEC_KEYS:
            out  = e.get(key, 0.0)
            hlth = self.system_health.get(key, 100.0) / 100.0
            elec_thrust += out * hlth * ELEC_ENGINE_MAX_THRUST_AU

        self.engine_thrust_au = round(fuel_thrust + elec_thrust, 6)

        # ── Fuel engines: consume from Engine Room ────────────────────────────
        engine_room = self.rooms.get("engine_room", {})
        for key in ("engine_3_fuel", "engine_4_fuel"):
            out = e.get(key, 0.0)
            if out <= 0:
                continue
            draw    = self.engine_consumption(out)
            current = engine_room.get("fuel", 0.0)
            if draw > current:
                engine_room["fuel"] = 0.0
                self.engine_outputs[key] = 0.0  # starved — force off
            else:
                engine_room["fuel"] = round(current - draw, 2)

        # ── Warp capacitor: charge at capped rate, leak passively ─────────────
        net_charge = actual_warp_gw - WARP_CAPACITOR_LEAK_GW
        self.warp_capacitor_gw = round(
            max(0.0, min(WARP_CAPACITOR_MAX_GW, self.warp_capacitor_gw + net_charge)), 2
        )

    # ── Power helpers ─────────────────────────────────────────────────────────

    def life_support_min_gw(self) -> float:
        """Minimum GW the life support system requires given current crew."""
        return LIFE_SUPPORT_BASE_GW + (self.people_on_board // 100) * LIFE_SUPPORT_PER_100_PEOPLE_GW

    def battery_capacity_gw(self) -> float:
        return self.battery_count * BATTERY_CAPACITY_GW

    def effective_reactor_output_gw(self) -> float:
        """Total reactor GW this tick, accounting for output setting and health."""
        from .constants import MAX_REACTOR_OUTPUT_GW
        total = 0.0
        for key in ["reactor_1_fuel", "reactor_2_fuel", "reactor_3_rad", "reactor_4_rad"]:
            output_frac  = self.reactor_outputs.get(key, 1.0)
            health_frac  = self.system_health.get(key, 100.0) / 100.0
            total += MAX_REACTOR_OUTPUT_GW * output_frac * health_frac
        return round(total, 2)

    def net_power_gw(self) -> float:
        """Net power available for distribution this tick.
        Battery acts like a virtual reactor: positive pct = discharging (adds GW),
        negative pct = charging (consumes GW). Clamped to >= 0.
        """
        reactor_gw   = self.effective_reactor_output_gw()
        battery_pct  = self.power_allocation.get("battery", 0.0)
        battery_gw   = (battery_pct / 100.0) * self.battery_capacity_gw()
        return round(max(0.0, reactor_gw + battery_gw), 2)

    def update_reactor_heat(self) -> None:
        """Called once per tick. Advances heat according to output band, applies
        heat damage, and handles meltdown shutdown / auto-recovery.

        Heat bands (output is 0–1 fraction):
          ≤ 0.20 → −2 / tick   |  ≤ 0.40 → −1  |  ≤ 0.60 → 0
          ≤ 0.80 → +1 / tick   |  > 0.80 → +2

        Damage (highest threshold wins; health 0-100 = 0-1000 HP):
          heat > 50 % → 10 % chance of 0.1 dmg
          heat > 75 % → 50 % chance of 0.1 dmg
          heat > 90 % → 0.1 dmg / tick guaranteed
          heat > 95 % → 0.2 dmg / tick guaranteed
          heat = 100 % → 30 dmg + meltdown shutdown
        """
        _REACTOR_KEYS = (
            "reactor_1_fuel", "reactor_2_fuel",
            "reactor_3_rad",  "reactor_4_rad",
        )
        for key in _REACTOR_KEYS:
            # ── Enforce shutdown: lock output to 0 until fully cooled ─────────────
            if self.reactor_shutdown.get(key, False):
                self.reactor_outputs[key] = 0.0

            output = self.reactor_outputs.get(key, 0.0)
            heat   = self.reactor_heat.get(key, 0.0)

            # ── Heat delta based on output band ─────────────────────────────
            if   output <= 0.20: heat -= 2.0
            elif output <= 0.40: heat -= 1.0
            elif output <= 0.60: pass            # neutral 40-60 %
            elif output <= 0.80: heat += 1.0
            else:                heat += 2.0

            heat = max(0.0, min(100.0, heat))
            self.reactor_heat[key] = heat

            # ── Clear shutdown once fully cooled ───────────────────────────
            if self.reactor_shutdown.get(key, False) and heat <= 0.0:
                self.reactor_shutdown[key] = False

            # ── Damage thresholds (highest wins) ─────────────────────────
            health = self.system_health.get(key, 100.0)

            if heat >= 100.0:
                # Meltdown: large damage burst + forced shutdown
                health -= REACTOR_MELTDOWN_DAMAGE
                self.reactor_shutdown[key] = True
                self.reactor_outputs[key]  = 0.0
            elif heat > 95.0:
                health -= 0.2           # 2 HP / tick on 1000-HP scale
            elif heat > 90.0:
                health -= 0.1           # 1 HP / tick
            elif heat > 75.0:
                if random.random() < 0.50:
                    health -= 0.1       # 50 % chance of 1 HP
            elif heat > 50.0:
                if random.random() < 0.10:
                    health -= 0.1       # 10 % chance of 1 HP

            self.system_health[key] = round(max(0.0, health), 4)

    def consume_reactor_fuel(self) -> None:
        """Deduct fuel/radioactive material from the Power Room each tick.

        Fuel reactors (R1, R2) consume `output_frac × 100` units of `fuel`.
        Rad reactors  (R3, R4) consume `output_frac × 100` units of `radioactive_material`.
        If a reactor's fuel stock hits 0, its output is forced to 0.
        """
        power_room = self.rooms["power_room"]
        fuel_reactors = ("reactor_1_fuel", "reactor_2_fuel")
        rad_reactors  = ("reactor_3_rad",  "reactor_4_rad")

        # Fuel-burning reactors
        fuel_used = sum(
            self.reactor_outputs.get(k, 0.0) * 100.0 for k in fuel_reactors
        )
        if fuel_used > 0:
            new_fuel = power_room["fuel"] - fuel_used
            if new_fuel <= 0:
                power_room["fuel"] = 0.0
                for k in fuel_reactors:
                    self.reactor_outputs[k] = 0.0
            else:
                power_room["fuel"] = round(new_fuel, 2)

        # Radioactive-material reactors
        rad_used = sum(
            self.reactor_outputs.get(k, 0.0) * 100.0 for k in rad_reactors
        )
        if rad_used > 0:
            new_rad = power_room["radioactive_material"] - rad_used
            if new_rad <= 0:
                power_room["radioactive_material"] = 0.0
                for k in rad_reactors:
                    self.reactor_outputs[k] = 0.0
            else:
                power_room["radioactive_material"] = round(new_rad, 2)

    def update_gw_locks(self) -> None:
        """Recalculate percentages for GW-locked stations each tick so the
        absolute GW delivered stays constant as reactor output/battery changes.

        Battery is outside the 100% sum — only non-battery keys are redistributed.
        If total required GW exceeds net available, all GW locks are released.
        """
        _SUM_KEYS = [k for k in self.power_allocation.keys() if k != "battery"]
        gw_locked = {k: v for k, v in self.power_allocation_gw_targets.items()
                     if v is not None}
        if not gw_locked:
            return

        total_gw = self.net_power_gw()

        # No power or insufficient power — release all GW locks
        if total_gw <= 0 or sum(gw_locked.values()) > total_gw:
            for k in gw_locked:
                self.power_allocation_gw_targets[k] = None
            return

        # Compute new pct for each GW-locked station
        new_pcts = {k: (v / total_gw) * 100.0 for k, v in gw_locked.items()}

        # How much % the GW-locked group used before vs now
        old_gw_sum = sum(self.power_allocation[k] for k in gw_locked)
        new_gw_sum = sum(new_pcts.values())
        delta = old_gw_sum - new_gw_sum  # positive = freed, negative = needs more

        # Apply new pcts to GW-locked stations
        for k, pct in new_pcts.items():
            self.power_allocation[k] = round(pct, 4)

        # Redistribute delta among free (unlocked by either method) non-battery stations
        free = [k for k in _SUM_KEYS
                if k not in gw_locked
                and not self.power_allocation_locked.get(k, False)]
        if free and abs(delta) > 0.001:
            free_sum = sum(max(0, self.power_allocation[k]) for k in free)
            if free_sum > 0.001:
                for k in free:
                    frac = max(0, self.power_allocation[k]) / free_sum
                    self.power_allocation[k] = round(
                        max(0, self.power_allocation[k] + delta * frac), 4)
            else:
                share = delta / len(free)
                for k in free:
                    self.power_allocation[k] = round(
                        max(0, self.power_allocation[k] + share), 4)

        # Absorb floating-point rounding into the first free station
        total = sum(self.power_allocation[k] for k in _SUM_KEYS)
        err   = 100.0 - total
        if abs(err) > 0.01 and free:
            k = free[0]
            self.power_allocation[k] = round(
                max(0, self.power_allocation[k] + err), 4)

    def update_battery(self) -> None:
        """Charge or discharge battery each tick.
        battery_pct is % of battery capacity per tick (positive = discharge, negative = charge).
        Battery acts as a power source outside the 100% allocation sum.
        Snaps battery allocation to 0 when full (was charging) or empty (was discharging)."""
        battery_pct = self.power_allocation.get("battery", 0.0)
        cap         = self.battery_capacity_gw()
        delta       = (battery_pct / 100.0) * cap
        self.battery_energy_gw = max(0.0, min(cap, self.battery_energy_gw + delta))

        # Snap to 0 when at limit — no redistribution needed (battery is outside the sum)
        at_full  = self.battery_energy_gw >= cap   and battery_pct > 0
        at_empty = self.battery_energy_gw <= 0.0   and battery_pct < 0
        if at_full or at_empty:
            self.power_allocation["battery"] = 0.0

    def to_dict(self) -> dict:
        return {
            "current_system_id": self.current_system_id,
            "position": self.position,
            "direction": self.direction,
            "target_direction": self.target_direction,
            "thrust": self.thrust,
            "hull_health": self.hull_health,
            "system_health": self.system_health,
            "reactor_outputs": self.reactor_outputs,
            "reactor_heat": self.reactor_heat,
            "reactor_shutdown": self.reactor_shutdown,
            "effective_power_gw": self.effective_reactor_output_gw(),
            "net_power_gw": self.net_power_gw(),
            "battery_count": self.battery_count,
            "battery_energy_gw": round(self.battery_energy_gw, 2),
            "battery_capacity_gw": self.battery_capacity_gw(),
            "people_on_board": self.people_on_board,
            "life_support_min_gw": self.life_support_min_gw(),
            "power_allocation": self.power_allocation,
            "power_allocation_locked": self.power_allocation_locked,
            "power_allocation_gw_targets": self.power_allocation_gw_targets,
            "engine_outputs": self.engine_outputs,
            "warp_capacitor_gw": self.warp_capacitor_gw,
            "engine_thrust_au": self.engine_thrust_au,
            "rooms": self.rooms,
            "orbiting_planet_id": self.orbiting_planet_id,
            "orbit_radius_au": self.orbit_radius_au,
            "orbit_center": self.orbit_center,
            "mining_bots": self.mining_bots,
        }


def create_ship(starting_system_id: str) -> Ship:
    """Spawn the ship near the inner zone of the starting system."""
    angle = random.uniform(0, math.pi * 2)
    pos = {
        "x": round(SHIP_START_DISTANCE_AU * math.cos(angle), 4),
        "y": 0.0,
        "z": round(SHIP_START_DISTANCE_AU * math.sin(angle), 4),
    }
    direction = normalize({"x": -pos["x"], "y": 0.0, "z": -pos["z"]})  # face star

    ship = Ship(
        current_system_id=starting_system_id,
        position=pos,
        direction=direction,
        target_direction=direction.copy(),
        thrust=0.0,
        hull_health=100.0,
        system_health={k: 100.0 for k in SYSTEM_HEALTH_KEYS},
        reactor_outputs={
            "reactor_1_fuel": 0.05,
            "reactor_2_fuel": 0.05,
            "reactor_3_rad":  0.05,
            "reactor_4_rad":  0.05,
        },
    )
    # Life support GW-locked to minimum (5 GW base); general_systems GW-locked to 20 GW
    ship.power_allocation_gw_targets["life_support"]    = ship.life_support_min_gw()
    ship.power_allocation_gw_targets["general_systems"] = 20.0
    # Seed Engine Room with fuel
    ship.rooms["engine_room"]["fuel"] = ENGINE_ROOM_FUEL_START
    return ship
