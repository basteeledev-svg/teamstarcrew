# -*- coding: utf-8 -*-
"""Ship state and per-tick movement update."""
import math
import random
from dataclasses import dataclass, field
from typing import ClassVar, Optional
from .constants import (
    REACTOR_FUEL_PER_TICK_AT_FULL, REACTOR_RAD_PER_TICK_AT_FULL,
    REACTOR_ROOM_FUEL_START, REACTOR_ROOM_RAD_START, SYNTH_FUEL_PER_TW, ENGINE_MELTDOWN_DAMAGE,
    WARP_BATTERY_BONUS_TW, WARP_BATTERIES_START,
    MAX_SPEED_AU_PER_TICK,
    TURN_RATE_DEG_PER_TICK,
    SHIP_START_DISTANCE_AU,
    BATTERY_CAPACITY_TW as BATTERY_CAPACITY_GW,   # alias keeps internal method names stable
    BATTERY_START_COUNT,
    REACTOR_MELTDOWN_DAMAGE,
    REACTOR_START_OUTPUT,
    LIFE_SUPPORT_BASE_GW,
    LIFE_SUPPORT_PER_100_PEOPLE_GW,
    FUEL_GENERATOR_MAX_TW,
    NUCLEAR_REACTOR_MAX_TW,
    FUEL_ENGINE_MAX_THRUST_AU,
    ELEC_ENGINE_MAX_THRUST_AU,
    BASE_FUEL_COEFF,
    ENGINE_ROOM_FUEL_START,
    WARP_CAPACITOR_MAX_TW as WARP_CAPACITOR_MAX_GW,   # alias keeps internal usage stable
    WARP_CAPACITOR_LEAK_TW as WARP_CAPACITOR_LEAK_GW,
    TRANSPORT_BOT_START_COUNT,
    TRANSPORT_BOT_CHARGE_MAX,
    TRANSPORT_BOT_CHARGE_COST,
    CHARGING_BAY_CHARGE_RATE_PER_TW as CHARGING_BAY_CHARGE_RATE_PER_GW,
    TRANSPORT_BOT_HEALTH_MAX,
    TRANSPORT_BOT_HEALTH_COST,
    TRANSPORT_BOT_CARGO_LARGE,
    TRANSPORT_BOT_CARGO_CONSUMABLE,
    TRANSPORT_TRAVEL_TICKS,
    TRANSPORT_BOT_BUILD_METALS,
    TRANSPORT_BOT_BUILD_RARE,
    REPAIR_BOT_CHARGE_MAX,
    REPAIR_BOT_HEALTH_MAX,
    REPAIR_BOT_REPAIR_RATE,
    REPAIR_BOT_START_COUNT,
    REPAIR_BOT_TRAVEL_TICKS,
    REPAIR_BOT_CHARGE_COST,
    REPAIR_BOT_POWER_PER_BOT,
    MINING_BOT_START_COUNT,
    MINING_BOT_CHARGE_MAX,
    MINING_BOT_HEALTH_MAX,
    MINING_BOT_CHARGE_COST,
    SECTION_SIDES,
    SECTION_COMPONENT_CAP,
    TARGETING_RANGE_PER_TW as TARGETING_RANGE_PER_GW,
    DEFENSE_LASER_RANGE_PER_TW as DEFENSE_LASER_RANGE_PER_GW,
    DEFENSE_LASER_DPS_PER_TW as DEFENSE_LASER_DPS_PER_GW,
    OFFENSE_LASER_DPS_PER_TW as OFFENSE_LASER_DPS_PER_GW,
    SHIELD_REDUCTION_PER_TW as SHIELD_REDUCTION_PER_GW,
    MAX_SHIELD_REDUCTION,
    ROOM_CAPACITY_STANDARD,
    ROOM_CAPACITY_LARGE,
    ORBIT_DISTANCE_AU,
    ORBIT_ANGULAR_SPEED,
    PC_TO_LY,
    COMMS_RANGE_PC_PER_TW,
    COMPONENT_INSTALL_TICKS,
    COMPONENT_UNINSTALL_TICKS,
    CREW_BASE,
    WEAPON_ENERGY_POOL_MAX,
)
from .vector3 import v3, normalize, scale, add, rotate_toward
# Items classified as "large" (equipment) -- 1 per trip.
# Everything else is a consumable -- up to 1000 per trip.
LARGE_ITEMS = {
    "lasers", "missiles", "shield_generators", "power_batteries",
    "warp_batteries", "air_scrubbers", "transport_bots", "repair_bots",
}
# A transport bot's cabin holds this many people per trip.
PEOPLE_PER_TRIP = 6
# Where people may be carried to/from (ship rooms); planets and other ships also allowed.
PEOPLE_ROOMS = {"living_quarters"}


TANK_ITEMS = ("oxygen_reserves", "bio_matter_rations")


class _LifeSupportTanks:
    """Lets transport bots load from / unload into the life-support tanks
    (ship.oxygen_reserves / ship.bio_matter_rations) as if it were a room."""

    def __init__(self, ship):
        self._ship = ship

    def get(self, key, default=0):
        return getattr(self._ship, key) if key in TANK_ITEMS else default

    def __getitem__(self, key):
        return self.get(key)

    def __setitem__(self, key, value):
        if key in TANK_ITEMS:
            setattr(self._ship, key, round(max(0.0, float(value)), 2))

    def items(self):
        return [(k, getattr(self._ship, k)) for k in TANK_ITEMS]


def is_external(endpoint: str) -> bool:
    """'planet' or 'ship:<npc id>' — places outside our hull."""
    return endpoint == "planet" or str(endpoint).startswith("ship:")
# ── Manufacturing recipes ──────────────────────────────────────────────────────────
# kind="rate":     produces output_per_gw units per GW delivered per tick
# kind="progress": accumulates GW toward total_gw; completion delivers 1 item
MANUFACTURING_RECIPES: dict = {
    "fuel": {
        "kind": "rate", "label": "Fuel",
        "materials_per_gw": {"hydrocarbons": 1.0},
        "output_per_gw": 1.0,
    },
    "transport_bot": {
        "kind": "progress", "label": "Transport Bot",
        "total_gw": 1000.0,
        "materials": {"metals": 500.0, "rare_earth": 200.0},
    },
    "mining_bot": {
        "kind": "progress", "label": "Mining Bot",
        "total_gw": 1000.0,
        "materials": {"metals": 500.0, "rare_earth": 200.0, "radioactive": 50.0},
    },
    "repair_bot": {
        "kind": "progress", "label": "Repair Bot",
        "total_gw": 800.0,
        "materials": {"metals": 400.0, "rare_earth": 150.0, "radioactive": 30.0},
    },
    "lasers": {
        "kind": "progress", "label": "Laser",
        "total_gw": 500.0,
        "materials": {"metals": 200.0, "rare_earth": 100.0},
    },
    "missiles": {
        "kind": "progress", "label": "Missile",
        "total_gw": 400.0,
        "materials": {"metals": 150.0, "radioactive": 50.0},
    },
    "shield_generators": {
        "kind": "progress", "label": "Shield Battery",
        "total_gw": 300.0,
        "materials": {"metals": 100.0, "rare_earth": 50.0},
    },
    "power_batteries": {
        "kind": "progress", "label": "Power Battery",
        "total_gw": 350.0,
        "materials": {"metals": 200.0, "rare_earth": 50.0},
    },
    "air_scrubbers": {
        "kind": "progress", "label": "Air Scrubber",
        "total_gw": 200.0,
        "materials": {"metals": 50.0, "rare_earth": 10.0},
    },
}
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
    thrust: float           # 0.0 - 1.0
    hull_health: float      # 0 - 100; 0 = game over
    system_health: dict     # {key: float 0-100} for each SYSTEM_HEALTH_KEYS entry
    reactor_outputs: dict   # {key: float 0-1} -- operator-set output fraction per reactor
    # Orbit state (defaults to not orbiting)
    orbiting_planet_id: Optional[str] = None
    orbit_angle_rad: float = 0.0
    orbit_radius_au: float = 0.0
    orbit_center: dict = field(default_factory=lambda: {"x": 0.0, "z": 0.0})
    # Battery bank
    battery_count: int = BATTERY_START_COUNT  # each unit holds BATTERY_CAPACITY_GW
    battery_energy_gw: float = 0.0  # currently stored energy
    # Crew (affects life support minimum)
    people_on_board: int = 0
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
    # Engine outputs -- 4 propulsion engines (warp drive managed via power_allocation)
    # Engines heat up when pushed (same bands as reactors); overheating damages them
    engine_heat: dict = field(default_factory=lambda: {
        "engine_1_electric": 0.0, "engine_2_electric": 0.0,
        "engine_3_fuel": 0.0, "engine_4_fuel": 0.0,
    })
    engine_shutdown: dict = field(default_factory=lambda: {
        "engine_1_electric": False, "engine_2_electric": False,
        "engine_3_fuel": False, "engine_4_fuel": False,
    })
    engine_outputs: dict = field(default_factory=lambda: {
        "engine_1_electric": 0.0,
        "engine_2_electric": 0.0,
        "engine_3_fuel":     0.0,
        "engine_4_fuel":     0.0,
    })
    # Warp capacitor -- charges from warp_drive power allocation; leaks passively
    warp_capacitor_gw: float = 0.0
    # Timed warp: None | 'spool' | 'transit' (see game/world.py begin_warp/update_warp)
    warp_phase: Optional[str] = None
    warp_dest_id: Optional[str] = None
    warp_dest_name: Optional[str] = None
    warp_ticks_left: int = 0
    warp_transit_total: int = 0
    warp_cost_paid: float = 0.0
    # Autopilot course: {'kind': 'planet'|'npc'|'point', 'id': str, 'name': str, 'pos'?: dict}
    course: Optional[dict] = None
    # Set by the autopilot each tick so the ship stops short of its target
    max_step_au: Optional[float] = None
    # Other ships a transport bot can reach right now: {"ship:<npc id>": cargo dict}.
    # Refreshed every tick by game/world.py (only ships close enough are listed).
    external_inventories: dict = field(default_factory=dict)
    # Deliveries/pickups to places outside the ship, consumed by game/world.py.
    transport_events: list = field(default_factory=list)
    # Single-player simplification toggle: passive repairs consume materials every tick.
    auto_repair_enabled: bool = False
    # Computed each tick by update_engines(); drives update_tick() movement
    engine_thrust_au: float = MAX_SPEED_AU_PER_TICK
    # Power allocation -- percentages that always sum to 100
    # battery uses its own dedicated slider (battery_slider below)
    power_allocation: dict = field(default_factory=lambda: {
        "engines":         20.0,
        "warp_drive":      10.0,
        "shields":         10.0,
        "weapons":         10.0,
        "scanner":         10.0,   # feeds both SRS and LRS panels
        "comms":            5.0,
        "life_support":     5.0,
        "general_systems": 15.0,
        "synthesis":        5.0,   # Molecular Synthesis panel
        "charging_bay":     5.0,
        "warp_reserve":     5.0,   # extra TW that charges warp capacitor
    })
    # Which allocation sliders are locked (user cannot drag them)
    power_allocation_locked: dict = field(default_factory=lambda: {
        "engines":         False,
        "warp_drive":      False,
        "shields":         False,
        "weapons":         False,
        "scanner":         False,
        "comms":           False,
        "life_support":    False,
        "general_systems": False,
        "synthesis":       False,
        "charging_bay":    False,
        "warp_reserve":    False,
    })
    # TW lock targets -- float = locked to that many TW, None = not TW-locked
    power_allocation_gw_targets: dict = field(default_factory=lambda: {
        "engines":         None,
        "warp_drive":      None,
        "shields":         None,
        "weapons":         None,
        "scanner":         None,
        "comms":           None,
        "life_support":    None,
        "general_systems": None,
        "synthesis":       None,
        "charging_bay":    None,
        "warp_reserve":    None,
    })
    # -100 = charge at full capacity rate, +100 = discharge at full capacity rate
    battery_slider: float = 0.0
    # Ship room inventories -- items must be present in a room to be used there
    # Power Room: fuel (for R1/R2), radioactive (for R3/R4), power_batteries (alias of battery_count)
    rooms: dict = field(default_factory=lambda: {
        "reactor_room": {
            "fuel":              REACTOR_ROOM_FUEL_START,
            "enriched_nuclear":  0.0,          # produced by synthesis; consumed by nuclear reactors
            "radioactive":       REACTOR_ROOM_RAD_START,  # raw; burned by the nuclear reactors
            "warp_batteries":    0,
        },
        "engine_bay": {
            "fuel": 0.0,
        },
        "tactical_bridge": {
            "lasers": 0, "missiles": 0,
        },
        "tactical_bridge": {
            "shield_generators": 0, "lasers": 0,
        },
        "living_quarters": {
            "air_scrubbers": 0, "people": 0,
        },
        "cargo_bay": {
            "metals": 0.0, "silicates": 0.0, "rare_earth": 0.0,
            "radioactive": 0.0, "hydrocarbons": 0.0, "space_scrap": 0.0,
            "fuel": 0.0, "enriched_nuclear": 0.0,
            "electronics": 0, "repair_patches": 0,
            "bio_matter_rations": 0.0, "oxygen_reserves": 0.0,
            "lasers": 0, "missiles": 0, "shield_generators": 0,
            "warp_batteries": 0, "power_batteries": 0, "air_scrubbers": 0,
        },
        "sub_deck_refinery": {
            "metals": 0.0, "silicates": 0.0, "rare_earth": 0.0,
            "radioactive": 0.0, "hydrocarbons": 0.0, "space_scrap": 0.0,
            "fuel": 0.0, "enriched_nuclear": 0.0,
            "electronics": 0, "repair_patches": 0,
            "lasers": 0, "missiles": 0, "shield_generators": 0,
            "warp_batteries": 0, "power_batteries": 0, "air_scrubbers": 0,
        },
        "charging_bay": {},   # bot charging room -- no item inventory
    })
    # Transport bots
    transport_bots: list = field(default_factory=list)
    _next_bot_id: int = field(default=1, repr=False)
    # Repair bots -- each has id, charge, health, state ("idle"|"repairing"), job (None or {target, ticks_remaining})
    repair_bots: list = field(default_factory=list)
    _next_repair_bot_id: int = field(default=1, repr=False)
    # Mining bot entities -- each has id, charge, health, location, state ("idle"|"mining")
    mining_bots_list: list = field(default_factory=list)
    _next_mining_bot_id: int = field(default=1, repr=False)
    # Hull sections: {defense_lasers, offense_lasers, shield_generators (renamed from shield_batteries)}
    hull_sections: dict = field(default_factory=lambda: {
        side: {"defense_lasers": [], "offense_lasers": [], "shield_generators": []}
        for side in ["fore", "aft", "port", "starboard", "above", "below"]
    })
    _next_component_id: int = field(default=1, repr=False)
    def __post_init__(self):
        """Safeguard: ensure _next_component_id exceeds all existing component IDs."""
        max_id = 0
        for side_data in self.hull_sections.values():
            for comp_list in side_data.values():
                for comp in comp_list:
                    if comp.get("id", 0) > max_id:
                        max_id = comp["id"]
        if max_id >= self._next_component_id:
            self._next_component_id = max_id + 1
    # ── Shields station power allocation ───────────────────────────────────────
    # Percentage of shields GW going to each hull section (should sum to 100)
    shields_section_alloc: dict = field(default_factory=lambda: {
        "fore": 16.67, "aft": 16.67, "port": 16.67,
        "starboard": 16.67, "above": 16.66, "below": 16.66,
    })
    # Per-component allocation within each section (str(id) -> weight; empty = even split)
    shields_component_alloc: dict = field(default_factory=lambda: {
        side: {} for side in ["fore", "aft", "port", "starboard", "above", "below"]
    })
    # ── Weapons station power allocation ──────────────────────────────────────
    # % of weapons GW to the targeting system (rest goes to installed offense lasers)
    weapons_targeting_pct: float = 30.0
    # % of weapons laser GW (weapons_gw * (1 - targeting%)) going to each section
    weapons_section_alloc: dict = field(default_factory=lambda: {
        "fore": 16.67, "aft": 16.67, "port": 16.67,
        "starboard": 16.67, "above": 16.66, "below": 16.66,
    })
    # Per-component allocation within each section for offense lasers (str(id) -> weight)
    weapons_component_alloc: dict = field(default_factory=lambda: {
        side: {} for side in ["fore", "aft", "port", "starboard", "above", "below"]
    })
    # Currently locked weapons target id (NPC id or dynamic object id, or None)
    weapons_locked_target_id: Optional[str] = None
    # Component install/uninstall queue -- progress-based, powered by station GW
    # Each entry: {id, section, role, col_key, room_key, item_key, station, progress, action: "install"|"uninstall", comp_id (uninstall only), comp (install only)}
    component_jobs: list = field(default_factory=list)
    _next_job_id: int = field(default=1, repr=False)
    # Room hull health (one value per room, 0-100 %)
    room_hull_health: dict = field(default_factory=lambda: {
        "reactor_room": 100.0, "engine_bay": 100.0, "tactical_bridge": 100.0,
        "living_quarters": 100.0, "cargo_bay": 100.0,
        "sub_deck_refinery": 100.0, "charging_bay": 100.0,
    })
    # Outer hull sections (6 sides of the ship, 0-100 %)
    outer_hull_health: dict = field(default_factory=lambda: {
        "fore": 100.0, "aft": 100.0, "port": 100.0,
        "starboard": 100.0, "above": 100.0, "below": 100.0,
    })
    # Repairable item health per item type (aggregate condition, 0-100 %)
    item_health: dict = field(default_factory=lambda: {
        "air_scrubbers": 100.0, "lasers": 100.0, "shield_generators": 100.0,
    })
    # Synthesis alloc/progress (5-recipe Molecular Synthesis Panel)
    synthesis_alloc: dict = field(default_factory=lambda: {
        "fuel": 20.0, "enriched_nuclear": 20.0,
        "electronics": 20.0, "repair_patches": 20.0, "space_scrap": 20.0,
        "oxygen": 0.0, "rations": 0.0,
    })
    synthesis_progress: dict = field(default_factory=lambda: {
        "fuel": 0.0, "enriched_nuclear": 0.0,
        "electronics": 0.0, "repair_patches": 0.0, "space_scrap": 0.0,
        "oxygen": 0.0, "rations": 0.0,
    })
    # Fabrication bots — entity list (id, charge, health, assignment)
    fabrication_bots: list = field(default_factory=list)
    _next_fab_bot_id: int = field(default=1, repr=False)

    # Weapon energy pool
    weapon_energy_pool: float = 0.0

    # Life support consumables
    oxygen_reserves: float = 500.0
    bio_matter_rations: float = 500.0

    # Fabrication bot assignment: recipe_key -> number of bots assigned
    fabrication_assignment: dict = field(default_factory=lambda: {
        "bot": 0, "component": 0, "air_scrubber": 0, "battery": 0, "missile": 0,
    })

    # Industry point accumulator per recipe (spec §11)
    # Which variant a multi-output recipe makes, e.g. {"battery": "power_batteries"}
    fabrication_choice: dict = field(default_factory=dict)
    industry_progress: dict = field(default_factory=lambda: {
        "bot": 0.0, "component": 0.0, "air_scrubber": 0.0, "battery": 0.0, "missile": 0.0,
    })

    # Legacy power-alloc manufacturing kept for backward compat (used by old save states)
    manufacturing_alloc: dict = field(default_factory=lambda: {
        "fuel": 0.0, "transport_bot": 0.0, "mining_bot": 0.0, "repair_bot": 0.0,
        "lasers": 0.0, "missiles": 0.0, "shield_generators": 0.0,
        "power_batteries": 0.0, "air_scrubbers": 0.0,
    })
    manufacturing_progress: dict = field(default_factory=lambda: {
        "transport_bot": 0.0, "mining_bot": 0.0, "repair_bot": 0.0,
        "lasers": 0.0, "missiles": 0.0, "shield_generators": 0.0,
        "power_batteries": 0.0, "air_scrubbers": 0.0,
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
        # Recall all mining bots to idle
        for bot in self.mining_bots_list:
            if bot["state"] == "mining":
                bot["state"] = "idle"
                bot["assignment"] = None
                bot["location"] = "charging_bay"
    def mining_bot_counts(self) -> dict:
        """Derive resource -> count mapping from mining bot entity assignments."""
        counts = {"metals": 0, "silicates": 0, "rare_earth": 0, "radioactive": 0, "hydrocarbons": 0}
        for bot in self.mining_bots_list:
            if bot["state"] == "mining" and bot.get("assignment") in counts:
                counts[bot["assignment"]] += 1
        return counts
    # ── Room storage permissions ──────────────────────────────────────────────
    # Maps room key -> set of allowed item keys.  None means "all items allowed".
    ROOM_PERMISSIONS: ClassVar[dict] = {
        "reactor_room":       {"fuel", "enriched_nuclear", "radioactive", "power_batteries", "warp_batteries"},
        "engine_bay":      {"fuel"},
        "tactical_bridge":     {"shield_generators", "lasers", "missiles"},
        "living_quarters":  {"air_scrubbers", "people"},
        "cargo_bay":        None,   # accepts everything
        "sub_deck_refinery":    None,   # accepts everything
        "charging_bay":     set(),  # bots only
    }
    # Room capacity limits (total units across all items)
    ROOM_CAPACITY: ClassVar[dict] = {
        "reactor_room":       ROOM_CAPACITY_STANDARD,
        "engine_bay":      ROOM_CAPACITY_STANDARD,
        "tactical_bridge":     ROOM_CAPACITY_STANDARD,
        "living_quarters":  ROOM_CAPACITY_STANDARD,
        "cargo_bay":        ROOM_CAPACITY_LARGE,
        "sub_deck_refinery":    ROOM_CAPACITY_LARGE,
        "charging_bay":     0,  # no items
    }
    def room_used(self, room_key: str) -> float:
        """Total units currently stored in a room."""
        inv = self.rooms.get(room_key, {})
        return sum(inv.values())
    def room_free(self, room_key: str) -> float:
        """Remaining capacity in a room."""
        cap = self.ROOM_CAPACITY.get(room_key, ROOM_CAPACITY_STANDARD)
        return max(0.0, cap - self.room_used(room_key))
    def count_people(self) -> int:
        """Total people across all rooms."""
        return int(sum(inv.get("people", 0) for inv in self.rooms.values()))
    def _make_bot(self) -> dict:
        """Create a new transport bot dict with full charge and health."""
        bot = {
            "id": self._next_bot_id,
            "charge": TRANSPORT_BOT_CHARGE_MAX,
            "health": TRANSPORT_BOT_HEALTH_MAX,
            "location": "charging_bay",
            "state": "idle",
            "job": None,
        }
        self._next_bot_id += 1
        return bot
    def _make_repair_bot(self) -> dict:
        """Create a new repair bot dict with full charge and health."""
        bot = {
            "id": self._next_repair_bot_id,
            "charge": REPAIR_BOT_CHARGE_MAX,
            "health": REPAIR_BOT_HEALTH_MAX,
            "location": "charging_bay",
            "state": "idle",  # idle | repairing
            "job": None,      # None or {"target": system_key}
        }
        self._next_repair_bot_id += 1
        return bot
    def _make_mining_bot(self) -> dict:
        """Create a new mining bot entity with full charge and health."""
        bot = {
            "id": self._next_mining_bot_id,
            "charge": MINING_BOT_CHARGE_MAX,
            "health": MINING_BOT_HEALTH_MAX,
            "location": "charging_bay",
            "state": "idle",  # idle | mining
            "assignment": None,  # None or resource key (metals, rare_earth, etc.)
        }
        self._next_mining_bot_id += 1
        return bot
    def _make_fabrication_bot(self) -> dict:
        """Create a fabrication bot entity at full charge and health."""
        bot = {
            "id": self._next_fab_bot_id,
            "charge": 100.0,
            "health": 100.0,
            "location": "charging_bay",
            "state": "idle",      # idle | working
            "assignment": None,   # recipe_key or None
        }
        self._next_fab_bot_id += 1
        return bot
    def build_transport_bot(self) -> tuple[bool, str]:
        """Build a new bot from manufacturing room materials."""
        mfg = self.rooms["sub_deck_refinery"]
        if mfg.get("metals", 0) < TRANSPORT_BOT_BUILD_METALS:
            return False, f"Need {TRANSPORT_BOT_BUILD_METALS} metals (have {mfg.get('metals', 0)})"
        if mfg.get("rare_earth", 0) < TRANSPORT_BOT_BUILD_RARE:
            return False, f"Need {TRANSPORT_BOT_BUILD_RARE} rare_earth (have {mfg.get('rare_earth', 0)})"
        mfg["metals"]     = round(mfg["metals"] - TRANSPORT_BOT_BUILD_METALS, 2)
        mfg["rare_earth"] = round(mfg["rare_earth"] - TRANSPORT_BOT_BUILD_RARE, 2)
        bot = self._make_bot()
        self.transport_bots.append(bot)
        return True, f"Built transport bot #{bot['id']}"
    def dispatch_repair_bot(self, bot_id: int, target: dict) -> tuple[bool, str]:
        """Dispatch a repair bot to a repairable target component."""
        _VALID_TYPES = ("system", "room_hull", "outer_hull", "bot", "item")
        for bot in self.repair_bots:
            if bot["id"] != bot_id:
                continue
            if bot["state"] != "idle":
                return False, f"Repair bot #{bot_id} is not idle (state: {bot['state']})"
            if bot["health"] <= 0:
                return False, f"Repair bot #{bot_id} is broken (0 health)"
            if bot["charge"] < REPAIR_BOT_CHARGE_COST:
                return False, f"Repair bot #{bot_id} has insufficient charge"
            ttype = target.get("type")
            if ttype not in _VALID_TYPES:
                return False, f"Invalid target type: {ttype}"
            if ttype == "system" and target.get("key") not in self.system_health:
                return False, f"Unknown system key: {target.get('key')}"
            if ttype == "room_hull" and target.get("room") not in self.room_hull_health:
                return False, f"Unknown room: {target.get('room')}"
            if ttype == "outer_hull" and target.get("side") not in self.outer_hull_health:
                return False, f"Unknown hull side: {target.get('side')}"
            if ttype == "item" and target.get("item") not in self.item_health:
                return False, f"Unknown item: {target.get('item')}"
            bot["state"] = "traveling"
            bot["location"] = "in_transit"
            bot["job"] = {"target": target, "ticks_left": REPAIR_BOT_TRAVEL_TICKS}
            return True, f"Repair bot #{bot_id} dispatched"
        return False, f"Repair bot #{bot_id} not found"
    def recall_repair_bot(self, bot_id: int) -> tuple[bool, str]:
        """Recall a repair bot to the charging bay."""
        for bot in self.repair_bots:
            if bot["id"] != bot_id:
                continue
            if bot["state"] == "idle":
                return True, f"Repair bot #{bot_id} already idle at charging bay"
            if bot["state"] == "returning":
                return True, f"Repair bot #{bot_id} already returning"
            bot["state"] = "returning"
            bot["job"] = {"ticks_left": REPAIR_BOT_TRAVEL_TICKS}
            return True, f"Repair bot #{bot_id} recalling to charging bay"
        return False, f"Repair bot #{bot_id} not found"
    def update_mining_bots(self) -> None:
        """Advance mining bots by one tick. Mining bots consume charge while assigned."""
        for bot in self.mining_bots_list:
            if bot["state"] != "mining":
                continue
            # Consume charge while mining
            bot["charge"] = max(0.0, round(bot["charge"] - MINING_BOT_CHARGE_COST, 2))
            if bot["charge"] <= 0 or bot["health"] <= 0:
                bot["state"] = "idle"
                bot["assignment"] = None
                bot["location"] = "charging_bay"
        # Remove destroyed bots (health <= 0)
        self.mining_bots_list = [b for b in self.mining_bots_list if b["health"] > 0]
    def update_repair_bots(self) -> None:
        """Advance repair bots by one tick. Active bots consume charge (powered by charging bay)."""
        # Each active (traveling/repairing) bot requires REPAIR_BOT_POWER_PER_BOT GW
        # Power comes from charging_bay allocation
        charging_gw = self.net_power_gw() * self.power_allocation.get("charging_bay", 0.0) / 100.0
        active = [b for b in self.repair_bots if b["state"] in ("traveling", "repairing")]
        powered_ids = {b["id"] for b in active[:int(charging_gw / max(REPAIR_BOT_POWER_PER_BOT, 0.01))]}
        for bot in self.repair_bots:
            state = bot["state"]
            if state == "returning":
                job = bot.get("job") or {}
                job["ticks_left"] = job.get("ticks_left", 0) - 1
                bot["job"] = job
                if job["ticks_left"] <= 0:
                    bot["location"] = "charging_bay"
                    bot["state"] = "idle"
                    bot["job"] = None
                continue
            if state in ("traveling", "repairing"):
                if bot["id"] not in powered_ids:
                    continue  # paused -- insufficient power
                # Consume charge
                bot["charge"] = max(0.0, round(bot["charge"] - REPAIR_BOT_CHARGE_COST, 2))
                if bot["charge"] <= 0:
                    bot["state"] = "returning"
                    bot["job"] = {"ticks_left": REPAIR_BOT_TRAVEL_TICKS}
                    continue
            if state == "traveling":
                job = bot.get("job") or {}
                job["ticks_left"] = job.get("ticks_left", 0) - 1
                bot["job"] = job
                if job["ticks_left"] <= 0:
                    bot["state"] = "repairing"
                    bot["location"] = "on_duty"
            elif state == "repairing":
                job = bot.get("job") or {}
                target = job.get("target", {})
                ttype = target.get("type")
                full = False
                hp_gained = 0.0
                if getattr(self, "patch_debt", 0.0) >= 0.95 and not any(
                        self.rooms.get(r, {}).get("repair_patches", 0) >= 1 for r in ("cargo_bay", "sub_deck_refinery")):
                    continue   # out of repair patches: the bot waits on station
                if ttype == "system":
                    key = target.get("key")
                    if key in self.system_health:
                        before = self.system_health[key]
                        self.system_health[key] = min(100.0,
                            round(before + REPAIR_BOT_REPAIR_RATE, 4))
                        hp_gained = self.system_health[key] - before
                        full = self.system_health[key] >= 100.0
                elif ttype == "room_hull":
                    room = target.get("room")
                    if room in self.room_hull_health:
                        before = self.room_hull_health[room]
                        self.room_hull_health[room] = min(100.0,
                            round(before + REPAIR_BOT_REPAIR_RATE, 4))
                        hp_gained = self.room_hull_health[room] - before
                        full = self.room_hull_health[room] >= 100.0
                elif ttype == "outer_hull":
                    side = target.get("side")
                    if side in self.outer_hull_health:
                        before = self.outer_hull_health[side]
                        self.outer_hull_health[side] = min(100.0,
                            round(before + REPAIR_BOT_REPAIR_RATE, 4))
                        hp_gained = self.outer_hull_health[side] - before
                        full = self.outer_hull_health[side] >= 100.0
                elif ttype == "bot":
                    bot_type = target.get("bot_type")
                    target_id = target.get("id")
                    if bot_type == "transport":
                        bot_list = self.transport_bots
                    elif bot_type == "repair":
                        bot_list = self.repair_bots
                    else:
                        bot_list = self.mining_bots_list
                    for tb in bot_list:
                        if tb["id"] == target_id:
                            before = tb["health"]
                            tb["health"] = min(100.0,
                                round(before + REPAIR_BOT_REPAIR_RATE, 4))
                            hp_gained = tb["health"] - before
                            full = tb["health"] >= 100.0
                            break
                elif ttype == "item":
                    item = target.get("item")
                    if item in self.item_health:
                        before = self.item_health[item]
                        self.item_health[item] = min(100.0,
                            round(before + REPAIR_BOT_REPAIR_RATE, 4))
                        hp_gained = self.item_health[item] - before
                        full = self.item_health[item] >= 100.0
                # N-3: one repair patch per 10 HP restored (tracked fractionally)
                if hp_gained > 0:
                    self.patch_debt = getattr(self, "patch_debt", 0.0) + hp_gained / 10.0
                    while self.patch_debt >= 1.0:
                        src = next((r for r in ("cargo_bay", "sub_deck_refinery")
                                    if self.rooms.get(r, {}).get("repair_patches", 0) >= 1), None)
                        if src is None:
                            break
                        self.rooms[src]["repair_patches"] -= 1
                        self.patch_debt -= 1.0
                if full:
                    bot["state"] = "returning"
                    bot["job"] = {"ticks_left": REPAIR_BOT_TRAVEL_TICKS}
        # Remove destroyed repair bots (health <= 0)
        self.repair_bots = [b for b in self.repair_bots if b["health"] > 0]
    def update_item_health(self) -> None:
        """Destroy inventory items whose aggregate health has reached 0%."""
        for item_key, health in list(self.item_health.items()):
            if health > 0:
                continue
            # Remove all units of this item from every room
            for room_inv in self.rooms.values():
                if item_key in room_inv:
                    room_inv[item_key] = 0
            # Also destroy installed hull components of this type
            col_map = {
                "lasers": ["defense_lasers", "offense_lasers"],
                "shield_generators": ["shield_generators"],
            }
            for col_key in col_map.get(item_key, []):
                for side_data in self.hull_sections.values():
                    side_data[col_key] = []
    def _repair_material_available(self) -> float:
        """Total generic repair material currently available."""
        total = 0.0
        for room in ("cargo_bay", "manufacturing"):
            total += self.rooms.get(room, {}).get("metals", 0.0)
        return round(total, 2)
    def _consume_repair_material(self, amount: float) -> bool:
        """Consume repair material from cargo first, then manufacturing."""
        remaining = max(0.0, amount)
        for room in ("cargo_bay", "manufacturing"):
            if remaining <= 0:
                break
            inv = self.rooms.get(room, {})
            avail = inv.get("metals", 0.0)
            take = min(avail, remaining)
            if take > 0:
                inv["metals"] = round(avail - take, 2)
                remaining -= take
        return remaining <= 0.0001
    def update_auto_repairs(self) -> None:
        """Passive single-player repair loop.
        Repairs the most damaged subsystem each tick using generic materials.
        This preserves strategy pressure while removing manual repair-bot micromanagement.
        """
        if not self.auto_repair_enabled:
            return
        material = self._repair_material_available()
        if material <= 0:
            return
        # 2 material units restores 1 health point; cap automatic repairs per tick.
        repair_budget_hp = min(0.5, material / 2.0)
        if repair_budget_hp <= 0:
            return
        candidates = []
        if self.hull_health < 100.0:
            candidates.append(("hull", "hull_health", self.hull_health))
        for key, value in self.system_health.items():
            if value < 100.0:
                candidates.append(("system", key, value))
        for key, value in self.outer_hull_health.items():
            if value < 100.0:
                candidates.append(("outer", key, value))
        for key, value in self.room_hull_health.items():
            if value < 100.0:
                candidates.append(("room", key, value))
        for key, value in self.item_health.items():
            if value < 100.0:
                candidates.append(("item", key, value))
        if not candidates:
            return
        kind, key, current = min(candidates, key=lambda x: x[2])
        delta = min(repair_budget_hp, 100.0 - current)
        if delta <= 0:
            return
        material_cost = delta * 2.0
        if not self._consume_repair_material(material_cost):
            return
        if kind == "hull":
            self.hull_health = round(min(100.0, self.hull_health + delta), 4)
        elif kind == "system":
            self.system_health[key] = round(min(100.0, self.system_health[key] + delta), 4)
        elif kind == "outer":
            self.outer_hull_health[key] = round(min(100.0, self.outer_hull_health[key] + delta), 4)
        elif kind == "room":
            self.room_hull_health[key] = round(min(100.0, self.room_hull_health[key] + delta), 4)
        elif kind == "item":
            self.item_health[key] = round(min(100.0, self.item_health[key] + delta), 4)
    def repair_transport_bot(self, bot_id: int, amount: float) -> tuple[bool, str]:
        """Restore health to a bot. Called from Repairs panel."""
        for bot in self.transport_bots:
            if bot["id"] == bot_id:
                if bot["health"] >= TRANSPORT_BOT_HEALTH_MAX:
                    return False, "Bot already at full health"
                bot["health"] = min(TRANSPORT_BOT_HEALTH_MAX, round(bot["health"] + amount, 2))
                return True, f"Bot #{bot_id} health -> {bot['health']}"
        return False, f"No bot #{bot_id}"
    def _endpoint_inv(self, name: str, planet_stockpile: Optional[dict] = None):
        """Inventory dict for a room, the orbited planet or a reachable ship (None if unavailable)."""
        if name == "life_support":
            return _LifeSupportTanks(self)
        if name == "planet":
            return planet_stockpile
        if str(name).startswith("ship:"):
            return self.external_inventories.get(name)
        return self.rooms.get(name)

    def _validate_transport(self, source: str, dest: str, item: str, amount: float,
                            planet_stockpile: Optional[dict] = None) -> tuple:
        """Validate a transport request. Returns (ok, message, clamped_amount)."""
        if amount <= 0:
            return False, "Amount must be positive", 0
        if source == dest:
            return False, "Source and destination are the same", 0
        if is_external(source) and is_external(dest):
            return False, "One end of a trip must be this ship", 0
        src_inv = self._endpoint_inv(source, planet_stockpile)
        if src_inv is None:
            if source == "planet":
                return False, "Not orbiting a planet", 0
            if str(source).startswith("ship:"):
                return False, "That ship is out of transport range", 0
            return False, f"Unknown source room: {source}", 0
        dst_inv = self._endpoint_inv(dest, planet_stockpile)
        if dst_inv is None:
            if dest == "planet":
                return False, "Not orbiting a planet", 0
            if str(dest).startswith("ship:"):
                return False, "That ship is out of transport range", 0
            return False, f"Unknown destination room: {dest}", 0
        # Check source has item
        available = src_inv.get(item, 0)
        if available <= 0:
            return False, f"Source has no {item}", 0
        actual = min(amount, available)
        if item == "people":
            for end in (source, dest):
                if not is_external(end) and end not in PEOPLE_ROOMS:
                    return False, "People can only ride to or from the living quarters", 0
            actual = min(int(actual), PEOPLE_PER_TRIP)
        elif item in LARGE_ITEMS:
            actual = min(actual, TRANSPORT_BOT_CARGO_LARGE)
        else:
            actual = min(actual, TRANSPORT_BOT_CARGO_CONSUMABLE)
        # Check destination permission (places outside the ship accept everything)
        if dest == "life_support":
            if item not in TANK_ITEMS:
                return False, "Only oxygen and rations go into the life-support tanks", 0
        elif not is_external(dest):
            perms = self.ROOM_PERMISSIONS.get(dest)
            if perms is not None and item not in perms:
                return False, f"{dest} does not accept {item}", 0
            # Check destination capacity
            free = self.room_free(dest)
            if free <= 0:
                return False, f"{dest} is full", 0
            actual = min(actual, free)
        return True, "OK", actual

    def queue_transport(self, source: str, dest: str, item: str, amount: float,
                        bot_id: Optional[int] = None,
                        planet_stockpile: Optional[dict] = None,
                        trips_remaining: Optional[int] = 1) -> tuple:
        """Assign a transport job to an idle bot. Items are reserved immediately.
        trips_remaining: 1 = one trip, None = infinite repeats.
        If bot_id is None, picks the first available idle bot.
        Returns (ok, message, bot_dict_or_None).
        """
        ok, msg, actual = self._validate_transport(source, dest, item, amount, planet_stockpile)
        if not ok:
            return False, msg, None
        # Find an idle bot
        bot = None
        if bot_id is not None:
            for b in self.transport_bots:
                if b["id"] == bot_id and b["state"] == "idle":
                    bot = b
                    break
            if bot is None:
                return False, f"Bot #{bot_id} is not available", None
        else:
            for b in self.transport_bots:
                if b["state"] == "idle":
                    bot = b
                    break
            if bot is None:
                return False, "No idle bots available", None
        # Check bot condition
        if bot["health"] <= 0:
            return False, f"Bot #{bot['id']} is broken (0 health)", None
        if bot["charge"] < TRANSPORT_BOT_CHARGE_COST:
            return False, f"Bot #{bot['id']} charge too low ({bot['charge']}/{TRANSPORT_BOT_CHARGE_COST} needed)", None
        # Reserve items: deduct from source now
        src_inv = self._endpoint_inv(source, planet_stockpile)
        src_inv[item] = round(src_inv.get(item, 0) - actual, 2)
        if is_external(source):
            self.transport_events.append({"kind": "pickup", "where": source, "item": item, "amount": actual})
        # Consume charge and health
        bot["charge"] = round(bot["charge"] - TRANSPORT_BOT_CHARGE_COST, 2)
        bot["health"] = round(bot["health"] - TRANSPORT_BOT_HEALTH_COST, 2)
        # Assign job -- double travel time for planet trips
        travel_ticks = TRANSPORT_TRAVEL_TICKS * 2 if (is_external(source) or is_external(dest)) else TRANSPORT_TRAVEL_TICKS
        bot["state"] = "pickup"
        bot["job"] = {
            "source": source,
            "dest": dest,
            "item": item,
            "amount": actual,
            "ticks_left": travel_ticks,
            "travel_ticks": travel_ticks,
            "trips_remaining": trips_remaining,
        }
        return True, f"Bot #{bot['id']}: {actual} {item} ({source} -> {dest})", bot
    def cancel_transport(self, bot_id: int) -> tuple[bool, str]:
        """Cancel a bot's current job or recall-to-charge. Returns reserved items."""
        for bot in self.transport_bots:
            if bot["id"] == bot_id:
                if bot["state"] == "returning":
                    # Stop mid-return, idle where the bot currently is
                    bot["state"] = "idle"
                    bot["job"] = None
                    return True, f"Transport #{bot_id} stopped"
                if bot["job"] is not None:
                    job = bot["job"]
                    if "item" in job:
                        if not is_external(job["source"]):
                            return_to = job["source"]
                        else:
                            return_to = "living_quarters" if job["item"] == "people" else "cargo_bay"
                        inv = self.rooms.get(return_to, self.rooms["cargo_bay"])
                        inv[job["item"]] = round(inv.get(job["item"], 0) + job["amount"], 2)
                    bot["state"] = "idle"
                    bot["job"] = None
                    return True, f"Cancelled transport #{bot_id}'s job"
        return False, f"Transport #{bot_id} has no active job"
    def charge_transport(self, bot_id: int) -> tuple[bool, str]:
        """Recall a transport to the charging bay. Cancels active job (returns items)."""
        for bot in self.transport_bots:
            if bot["id"] == bot_id:
                if bot["location"] == "charging_bay" and bot["state"] == "idle":
                    return True, f"Transport #{bot_id} is already in the charging bay"
                if bot["state"] == "returning":
                    return True, f"Transport #{bot_id} is already returning to charging bay"
                # Return any reserved items before recalling
                if bot["job"] is not None and "item" in bot["job"]:
                    job = bot["job"]
                    return_to = job["source"] if job["source"] != "planet" else "cargo_bay"
                    inv = self.rooms.get(return_to, self.rooms["cargo_bay"])
                    inv[job["item"]] = round(inv.get(job["item"], 0) + job["amount"], 2)
                bot["state"] = "returning"
                bot["job"] = {"dest": "charging_bay", "ticks_left": TRANSPORT_TRAVEL_TICKS}
                return True, f"Transport #{bot_id} returning to charging bay"
        return False, f"Transport #{bot_id} not found"
    def _max_mfg_gw(self, recipe: dict, gw: float, mfg: dict) -> float:
        """Return the GW this manufacturing slot can actually consume given materials."""
        if gw <= 0:
            return 0.0
        if recipe["kind"] == "rate":
            usable = gw
            for mat, rate in recipe["materials_per_gw"].items():
                if rate > 0:
                    usable = min(usable, mfg.get(mat, 0.0) / rate)
            return max(0.0, usable)
        else:  # progress -- all-or-nothing per tick
            frac = gw / recipe["total_gw"]
            for mat, total_mat in recipe["materials"].items():
                if mfg.get(mat, 0.0) < total_mat * frac - 0.001:
                    return 0.0
            return gw
    def _complete_manufactured_item(self, key: str) -> None:
        """Deliver a completed manufactured item to the appropriate room."""
        mfg = self.rooms["sub_deck_refinery"]
        if key == "transport_bot":
            self.transport_bots.append(self._make_bot())
        elif key == "repair_bot":
            self.repair_bots.append(self._make_repair_bot())
        elif key == "mining_bot":
            self.mining_bots_list.append(self._make_mining_bot())
        else:
            # Find the correct destination room based on ROOM_PERMISSIONS
            dest_room_key = "manufacturing"  # default fallback
            for room_key, allowed in self.ROOM_PERMISSIONS.items():
                if allowed is None:
                    continue  # skip wildcard rooms (cargo_bay, manufacturing)
                if key in allowed:
                    dest_room_key = room_key
                    break
            dest = self.rooms.get(dest_room_key, mfg)
            if self.room_free(dest_room_key) < 1:
                return  # room full -- item lost (player should transport items out)
            dest[key] = dest.get(key, 0) + 1
    def update_synthesis(self) -> None:
        """Run one tick of Molecular Synthesis (raw -> consumables). Spec section 10."""
        synthesis_tw = self.net_power_gw() * (self.power_allocation.get("synthesis", 0.0) / 100.0)
        if synthesis_tw <= 0.001:
            return
        inv = self.rooms["sub_deck_refinery"]
        total_pct = sum(self.synthesis_alloc.values())
        scale = 1.0 if total_pct >= 99.9 else 100.0 / max(total_pct, 0.001)
        SYNTHESIS_RECIPES = {
            "fuel":             {"cost": {"hydrocarbons": 1.0},                                  "out_key": "fuel",             "out_amt": 1.0, "threshold": 1.0 / SYNTH_FUEL_PER_TW},
            "enriched_nuclear": {"cost": {"radioactive":  1.0},                                  "out_key": "enriched_nuclear", "out_amt": 1.0, "threshold": 1.0},
            "electronics":      {"cost": {"silicates": 5.0, "rare_earth": 5.0, "metals": 3.0},  "out_key": "electronics",      "out_amt": 1,   "threshold": 10.0},
            "repair_patches":   {"cost": {"metals": 10.0, "rare_earth": 2.0},                   "out_key": "repair_patches",   "out_amt": 1,   "threshold": 10.0},
            "space_scrap":      {"cost": {"metals": 2.0, "rare_earth": 2.0},                    "out_key": "space_scrap",      "out_amt": 10.0,"threshold": 3.0},
            # Life support: electrolyse ice for air, culture hydrocarbons into food
            "oxygen":           {"cost": {"silicates": 2.0},                                    "out_key": "oxygen_reserves",  "out_amt": 1.0, "threshold": 0.5},
            "rations":          {"cost": {"hydrocarbons": 2.0},                                 "out_key": "bio_matter_rations","out_amt": 1.0, "threshold": 0.5},
        }
        for recipe_key, recipe in SYNTHESIS_RECIPES.items():
            pct = self.synthesis_alloc.get(recipe_key, 0.0) * scale
            recipe_tw = synthesis_tw * pct / 100.0
            if recipe_tw <= 0.001:
                continue
            frac = recipe_tw / recipe["threshold"]
            if not all(inv.get(mat, 0.0) >= amt * frac - 0.001 for mat, amt in recipe["cost"].items()):
                continue
            self.synthesis_progress[recipe_key] = round(
                self.synthesis_progress.get(recipe_key, 0.0) + recipe_tw, 4)
            if self.synthesis_progress[recipe_key] >= recipe["threshold"]:
                batches = int(self.synthesis_progress[recipe_key] / recipe["threshold"])
                self.synthesis_progress[recipe_key] = round(
                    self.synthesis_progress[recipe_key] - batches * recipe["threshold"], 4)
                for mat, amt in recipe["cost"].items():
                    inv[mat] = round(max(0.0, inv.get(mat, 0.0) - amt * batches), 2)
                inv[recipe["out_key"]] = round(inv.get(recipe["out_key"], 0) + recipe["out_amt"] * batches, 2)

    # Spec §11 fabrication recipes: recipe_key -> {materials, industry_total, output}
    FABRICATION_RECIPES = {
        "bot":        {"mats": {"metals": 100.0, "rare_earth": 50.0, "electronics": 10}, "ip": 1000, "out_choices": ["transport_bot","repair_bot","mining_bot","fabrication_bot"]},
        "component":  {"mats": {"metals": 150.0, "rare_earth": 30.0, "electronics": 25}, "ip": 1500, "out_choices": ["lasers","shield_generators"]},
        "air_scrubber":{"mats": {"metals": 80.0, "silicates": 40.0, "electronics": 15}, "ip": 800,  "out_choices": ["air_scrubbers"]},
        "battery":    {"mats": {"metals": 200.0,"silicates": 120.0,"rare_earth": 60.0}, "ip": 2000, "out_choices": ["warp_batteries", "power_batteries"]},
        "missile":    {"mats": {"metals": 40.0, "hydrocarbons": 10.0,"electronics": 5}, "ip": 400,  "out_choices": ["missiles"]},
    }

    def update_manufacturing(self) -> None:
        """Run one tick of Fabrication Manufacturing (hardware components). Spec section 11.
        Industry Points (IP) per tick = sum(100 * bot_health/100) for bots assigned to recipe.
        Halts if synthesis power <= 5% of net_power_tw (spec: power grid unstable).
        """
        mfg  = self.rooms["sub_deck_refinery"]
        # Halt if synthesis TW <= 5% of net power (spec: Power Grid Unstable)
        net  = self.net_power_gw()
        synthesis_pct = self.power_allocation.get("synthesis", 0.0)
        if synthesis_pct <= 5.0 or net <= 0.001:
            return

        # Sort fabrication bots by health descending (healthiest bots assigned first)
        available_bots = sorted(
            [b for b in self.fabrication_bots if b.get("charge", 0) > 0 and b.get("health", 0) > 0],
            key=lambda b: -b.get("health", 0)
        )
        bot_offset = 0

        for recipe_key, recipe in self.FABRICATION_RECIPES.items():
            assigned_count = min(
                self.fabrication_assignment.get(recipe_key, 0),
                max(0, len(available_bots) - bot_offset)
            )
            assigned_bots = available_bots[bot_offset:bot_offset + assigned_count]
            bot_offset += assigned_count

            if not assigned_bots:
                continue

            # Industry Points this tick
            ip = sum(100.0 * (b.get("health", 100.0) / 100.0) for b in assigned_bots)

            # The full bill of materials must be on hand to work on an item
            mats_ok = all(
                mfg.get(mat, 0.0) >= qty - 0.001
                for mat, qty in recipe["mats"].items()
            )
            if not mats_ok:
                continue

            # Drain charge from working bots
            for b in assigned_bots:
                b["charge"] = round(max(0.0, b.get("charge", 100.0) - 0.10), 2)
                b["state"] = "working"
                b["assignment"] = recipe_key
                if b["charge"] <= 0:
                    b["state"] = "idle"
                    b["assignment"] = None

            # Accumulate progress
            self.industry_progress[recipe_key] = round(
                self.industry_progress.get(recipe_key, 0.0) + ip, 2)

            if self.industry_progress[recipe_key] >= recipe["ip"]:
                self.industry_progress[recipe_key] = 0.0
                # Consume the full bill of materials
                for mat, qty in recipe["mats"].items():
                    mfg[mat] = round(max(0.0, mfg.get(mat, 0.0) - qty), 2)
                # Deliver output (the crew's chosen variant, else the first)
                out_key = self.fabrication_choice.get(recipe_key) or recipe["out_choices"][0]
                if out_key not in recipe["out_choices"]:
                    out_key = recipe["out_choices"][0]
                if out_key == "fabrication_bot":
                    self.fabrication_bots.append(self._make_fabrication_bot())
                elif out_key == "transport_bot":
                    self.transport_bots.append(self._make_bot())
                elif out_key == "repair_bot":
                    self.repair_bots.append(self._make_repair_bot())
                elif out_key == "mining_bot":
                    self.mining_bots_list.append(self._make_mining_bot())
                else:
                    dest_room = "sub_deck_refinery"
                    for rk, allowed in self.ROOM_PERMISSIONS.items():
                        if allowed and out_key in allowed:
                            dest_room = rk; break
                    self.rooms[dest_room][out_key] = self.rooms[dest_room].get(out_key, 0) + 1

        # Reset state for idle fabrication bots
        for b in self.fabrication_bots:
            if b.get("state") == "working" and b not in available_bots[0:bot_offset]:
                b["state"] = "idle"
                b["assignment"] = None
    def update_transport(self, planet_stockpile: Optional[dict] = None) -> None:
        """Advance all transport bots by 1 tick. Charging only applies in the charging bay."""
        # ── Charging bay power ──────────────────────────────────────────────
        charging_gw = self.net_power_gw() * self.power_allocation.get("charging_bay", 0.0) / 100.0
        all_bots = self.transport_bots + self.repair_bots + self.mining_bots_list
        bots_in_bay = sum(
            1 for b in all_bots
            if b.get("location") == "charging_bay" and b["state"] == "idle"
        )
        charge_per_bot = (
            round(charging_gw / bots_in_bay * CHARGING_BAY_CHARGE_RATE_PER_GW, 3)
            if bots_in_bay > 0 else 0.0
        )
        # Charge all idle bots in charging bay (transport + repair + mining)
        for bot in all_bots:
            if bot.get("location") == "charging_bay" and bot["state"] == "idle":
                # Determine max charge based on bot type
                if bot in self.transport_bots:
                    cap = TRANSPORT_BOT_CHARGE_MAX
                elif bot in self.repair_bots:
                    cap = REPAIR_BOT_CHARGE_MAX
                else:
                    cap = MINING_BOT_CHARGE_MAX
                if bot["charge"] < cap:
                    bot["charge"] = min(cap, round(bot["charge"] + charge_per_bot, 2))
        # ── Advance transport bot jobs ───────────────────────────────────────
        for bot in self.transport_bots:
            if bot["state"] == "idle":
                continue
            if bot["state"] == "returning":
                # Traveling back to charging bay with no cargo
                job = bot["job"]
                job["ticks_left"] -= 1
                if job["ticks_left"] <= 0:
                    bot["location"] = "charging_bay"
                    bot["state"] = "idle"
                    bot["job"] = None
                continue
            job = bot["job"]
            if job is None:
                bot["state"] = "idle"
                continue
            job["ticks_left"] -= 1
            if job["ticks_left"] <= 0:
                if bot["state"] == "pickup":
                    # Arrived at source -> now deliver to destination
                    bot["state"] = "deliver"
                    job["ticks_left"] = job.get("travel_ticks", TRANSPORT_TRAVEL_TICKS)
                else:
                    # Delivery complete -> deposit items, update location
                    if is_external(job["dest"]):
                        dst = self._endpoint_inv(job["dest"], planet_stockpile)
                        if dst is not None:
                            dst[job["item"]] = round(dst.get(job["item"], 0) + job["amount"], 2)
                            self.transport_events.append({"kind": "delivery", "where": job["dest"],
                                                          "item": job["item"], "amount": job["amount"]})
                        else:
                            # Target gone or out of range: bring the load home
                            home = "living_quarters" if job["item"] == "people" else "cargo_bay"
                            inv = self.rooms[home]
                            inv[job["item"]] = round(inv.get(job["item"], 0) + job["amount"], 2)
                            self.transport_events.append({"kind": "aborted", "where": job["dest"],
                                                          "item": job["item"], "amount": job["amount"]})
                        bot["location"] = "planet" if job["dest"] == "planet" else "charging_bay"
                    else:
                        dst_inv = self._endpoint_inv(job["dest"]) or self.rooms["cargo_bay"]
                        dst_inv[job["item"]] = round(dst_inv.get(job["item"], 0) + job["amount"], 2)
                        bot["location"] = job["dest"]
                    # ── Repeat trips ────────────────────────────────────────
                    trips = job.get("trips_remaining")  # 1 = last, None = infinite
                    source = job["source"]
                    should_repeat = (trips is None or trips > 1) and not is_external(source) and not is_external(job["dest"])
                    if should_repeat:
                        next_trips = None if trips is None else trips - 1
                        ok, _, actual = self._validate_transport(
                            source, job["dest"], job["item"], job["amount"])
                        can_go = (ok and actual > 0
                                  and bot["charge"] >= TRANSPORT_BOT_CHARGE_COST
                                  and bot["health"] > 0)
                        if can_go:
                            src_inv = self._endpoint_inv(source)
                            src_inv[job["item"]] = round(
                                src_inv.get(job["item"], 0) - actual, 2)
                            bot["charge"] = round(bot["charge"] - TRANSPORT_BOT_CHARGE_COST, 2)
                            bot["health"] = round(bot["health"] - TRANSPORT_BOT_HEALTH_COST, 2)
                            travel_ticks = job.get("travel_ticks", TRANSPORT_TRAVEL_TICKS)
                            bot["state"] = "pickup"
                            bot["job"] = {
                                "source": source,
                                "dest": job["dest"],
                                "item": job["item"],
                                "amount": actual,
                                "ticks_left": travel_ticks,
                                "travel_ticks": travel_ticks,
                                "trips_remaining": next_trips,
                            }
                            continue
                    # No repeat (or unable to repeat)
                    bot["state"] = "idle"
                    bot["job"] = None
        # Remove destroyed transport bots (health <= 0)
        self.transport_bots = [b for b in self.transport_bots if b["health"] > 0]
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
            dist = self.thrust * self.engine_thrust_au
            if self.max_step_au is not None:
                dist = min(dist, max(0.0, self.max_step_au))
            step = scale(self.direction, dist)
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
    def engine_consumption(output_frac: float) -> float:
        """Spec formula: Fuel/tick = BASE_FUEL_COEFF * (throttle_pct ** 2.5)."""
        pct = output_frac * 100.0
        return round(BASE_FUEL_COEFF * (pct ** 2.5), 2)
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
        # Clamp warp_drive allocation to engines budget -- warp draws from engines pool.
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
        engine_room = self.rooms.get("engine_bay", {})
        for key in ("engine_3_fuel", "engine_4_fuel"):
            out = e.get(key, 0.0)
            if out <= 0:
                continue
            draw    = self.engine_consumption(out)
            current = engine_room.get("fuel", 0.0)
            if draw > current:
                engine_room["fuel"] = 0.0
                self.engine_outputs[key] = 0.0  # starved -- force off
            else:
                engine_room["fuel"] = round(current - draw, 2)
        # ── Warp capacitor: charge at capped rate, leak passively ─────────────
        net_charge = actual_warp_gw - WARP_CAPACITOR_LEAK_GW
        self.warp_capacitor_gw = round(
            max(0.0, min(self.warp_capacity(), self.warp_capacitor_gw + net_charge)), 2
        )
    # ── Power helpers ─────────────────────────────────────────────────────────
    def warp_capacity(self) -> float:
        """Charge cap: the drive's own capacitor plus every warp battery in the reactor room."""
        n = int(self.rooms.get("reactor_room", {}).get("warp_batteries", 0) or 0)
        return WARP_CAPACITOR_MAX_GW + WARP_BATTERY_BONUS_TW * n

    def comms_gw(self) -> float:
        """GW currently allocated to the comms array (degraded by system health)."""
        health_frac = self.system_health.get("comms_array", 100.0) / 100.0
        return round(self.net_power_gw() * self.power_allocation.get("comms", 0.0) / 100.0 * health_frac, 2)
    def comms_range_ly(self) -> float:
        """Max comms range in LY. Spec: Range_pc = 0.5 * power_tw; convert to LY."""
        return round(self.comms_gw() * COMMS_RANGE_PC_PER_TW * PC_TO_LY, 2)
    def short_range_scan_gw(self) -> float:
        """TW allocated to short-range scanner (degraded by health)."""
        health_frac = self.system_health.get("short_range_scanner", 100.0) / 100.0
        return round(self.net_power_gw() * self.power_allocation.get("scanner", 0.0) / 100.0 * health_frac, 2)
    def long_range_scan_gw(self) -> float:
        """TW allocated to long-range scanner (degraded by health). Uses same 'scanner' bucket as SRS."""
        health_frac = self.system_health.get("long_range_scanner", 100.0) / 100.0
        return round(self.net_power_gw() * self.power_allocation.get("scanner", 0.0) / 100.0 * health_frac, 2)
    def life_support_min_gw(self) -> float:
        """Minimum GW the life support system requires given current crew."""
        people = self.count_people()
        return LIFE_SUPPORT_BASE_GW + (people // 100) * LIFE_SUPPORT_PER_100_PEOPLE_GW
    def update_life_support(self, tick: int) -> None:
        """N-4: Every 100 ticks drain O2 and rations (1 per person). Power/scrubber quality
        drives the atmosphere; when O2 hits 0 passengers die until crew base=10 is all that remains.
        """
        # ── Every 100 ticks: drain consumables ───────────────────────────────
        if tick % 100 == 0:
            total_people = CREW_BASE + self.rooms.get("living_quarters", {}).get("people", 0)
            drain = float(total_people)
            self.oxygen_reserves     = max(0.0, round(self.oxygen_reserves - drain, 2))
            self.bio_matter_rations  = max(0.0, round(self.bio_matter_rations - drain, 2))
        # ── Atmosphere quality ────────────────────────────────────────────────
        min_gw = self.life_support_min_gw()
        if min_gw <= 0:
            return
        ls_pct   = self.power_allocation.get("life_support", 0.0)
        gw_target = self.power_allocation_gw_targets.get("life_support")
        net = self.net_power_gw()
        actual_gw = min(net, gw_target) if gw_target is not None else net * ls_pct / 100.0
        power_ratio = min(1.0, actual_gw / min_gw) if min_gw > 0 else 1.0
        lq = self.rooms.get("living_quarters", {})
        scrubber_count  = lq.get("air_scrubbers", 0)
        scrubber_health = self.item_health.get("air_scrubbers", 100.0) / 100.0
        people = self.count_people()
        needed = max(1, math.ceil(people / 30))
        scrubber_bonus = min(1.0, (scrubber_count * scrubber_health) / needed) if needed > 0 else 1.0
        # Also degrade quality if O2 is depleted
        o2_factor = 1.0 if self.oxygen_reserves > 0 else 0.0
        atmo_quality = power_ratio * 0.6 + scrubber_bonus * 0.2 + o2_factor * 0.2
        if atmo_quality >= 1.0 or people <= 0:
            return
        deficit = 1.0 - atmo_quality
        deaths  = people * deficit * 0.01
        if deaths < 1.0:
            if random.random() >= deaths:
                return
            deaths = 1
        else:
            deaths = int(deaths)
        # Kill passengers first, then crew (crew minimum = CREW_BASE in game-over logic)
        remaining = deaths
        for room_key in ("living_quarters", "cargo_bay", "sub_deck_refinery",
                         "reactor_room", "engine_bay", "tactical_bridge",
                         "tactical_bridge", "charging_bay"):
            inv = self.rooms.get(room_key, {})
            p   = inv.get("people", 0)
            if p > 0 and remaining > 0:
                killed = min(p, remaining)
                inv["people"] = p - killed
                remaining    -= killed
            if remaining <= 0:
                break
    def battery_capacity_gw(self) -> float:
        return self.battery_count * BATTERY_CAPACITY_GW
    def effective_reactor_output_gw(self) -> float:
        """Total reactor TW this tick, per-type maximums from spec."""
        total = 0.0
        for key in ("reactor_1_fuel", "reactor_2_fuel"):
            output_frac = self.reactor_outputs.get(key, 1.0)
            health_frac = self.system_health.get(key, 100.0) / 100.0
            total += FUEL_GENERATOR_MAX_TW * output_frac * health_frac
        for key in ("reactor_3_rad", "reactor_4_rad"):
            output_frac = self.reactor_outputs.get(key, 1.0)
            health_frac = self.system_health.get(key, 100.0) / 100.0
            total += NUCLEAR_REACTOR_MAX_TW * output_frac * health_frac
        return round(total, 2)
    def net_power_gw(self) -> float:
        """Net TW available for distribution this tick.
        Battery slider drives discharge (+) or charge (-). Clamped to >= 0.
        """
        reactor_tw  = self.effective_reactor_output_gw()
        # Positive slider = discharge (adds TW); negative = charging (consumes TW)
        battery_tw  = (self.battery_slider / 100.0) * self.battery_capacity_gw()
        return round(max(0.0, reactor_tw + battery_tw), 2)
    def set_generation_target_gw(self, target_gw: float) -> float:
        """Set reactor outputs to match a desired generation target (TW, same interface)."""
        _FUEL_KEYS    = ("reactor_1_fuel", "reactor_2_fuel")
        _NUCLEAR_KEYS = ("reactor_3_rad",  "reactor_4_rad")
        capacities = {}
        for key in _FUEL_KEYS:
            if self.reactor_shutdown.get(key, False):
                capacities[key] = 0.0; continue
            capacities[key] = FUEL_GENERATOR_MAX_TW * max(0.0, self.system_health.get(key, 100.0) / 100.0)
        for key in _NUCLEAR_KEYS:
            if self.reactor_shutdown.get(key, False):
                capacities[key] = 0.0; continue
            capacities[key] = NUCLEAR_REACTOR_MAX_TW * max(0.0, self.system_health.get(key, 100.0) / 100.0)
        total_capacity = sum(capacities.values())
        all_keys = list(_FUEL_KEYS) + list(_NUCLEAR_KEYS)
        if total_capacity <= 0:
            for key in all_keys:
                self.reactor_outputs[key] = 0.0
            return 0.0
        clamped_target = max(0.0, min(float(target_gw), total_capacity))
        ratio = clamped_target / total_capacity
        for key in all_keys:
            if capacities[key] <= 0:
                self.reactor_outputs[key] = 0.0
            else:
                self.reactor_outputs[key] = round(max(0.0, min(1.0, ratio)), 4)
        return round(clamped_target, 2)
    def update_reactor_heat(self) -> None:
        """Called once per tick. Advances heat according to output band, applies
        heat damage, and handles meltdown shutdown / auto-recovery.
        Heat bands (output is 0-1 fraction):
          <= 0.20 -> -2 / tick   |  <= 0.40 -> -1  |  <= 0.60 -> 0
          <= 0.80 -> +1 / tick   |  > 0.80 -> +2
        Damage (highest threshold wins; health 0-100 = 0-1000 HP):
          heat > 50 % -> 10 % chance of 0.1 dmg
          heat > 75 % -> 50 % chance of 0.1 dmg
          heat > 90 % -> 0.1 dmg / tick guaranteed
          heat > 95 % -> 0.2 dmg / tick guaranteed
          heat = 100 % -> 30 dmg + meltdown shutdown
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
    def update_engine_heat(self) -> None:
        """Engines heat like reactors: <=40% cools, 40-60% holds, 60-80% +1/tick,
        >80% +2/tick. Hot engines take damage; at 100 heat they burn out
        (ENGINE_MELTDOWN_DAMAGE) and stay off until fully cooled."""
        for key, out in self.engine_outputs.items():
            if self.engine_shutdown.get(key):
                self.engine_outputs[key] = 0.0
                out = 0.0
            heat = self.engine_heat.get(key, 0.0)
            if   out <= 0.20: heat -= 2.0
            elif out <= 0.40: heat -= 1.0
            elif out <= 0.60: pass
            elif out <= 0.80: heat += 1.0
            else:             heat += 2.0
            heat = max(0.0, min(100.0, heat))
            self.engine_heat[key] = heat
            if self.engine_shutdown.get(key) and heat <= 0.0:
                self.engine_shutdown[key] = False
            health = self.system_health.get(key, 100.0)
            if heat >= 100.0:
                health -= ENGINE_MELTDOWN_DAMAGE
                self.engine_shutdown[key] = True
                self.engine_outputs[key] = 0.0
            elif heat > 90.0:
                health -= 0.3
            elif heat > 75.0:
                if random.random() < 0.5:
                    health -= 0.2
            elif heat > 50.0:
                if random.random() < 0.1:
                    health -= 0.1
            self.system_health[key] = round(max(0.0, health), 4)

    def consume_reactor_fuel(self) -> None:
        """Deduct fuel/radioactive material from the Power Room each tick.
        Fuel reactors consume output_frac*100 units of fuel.
        Rad reactors consume output_frac*100 units of radioactive.
        If a reactor runs out of fuel, its output is forced to 0.
        """
        power_room = self.rooms["reactor_room"]
        fuel_reactors = ("reactor_1_fuel", "reactor_2_fuel")
        rad_reactors  = ("reactor_3_rad",  "reactor_4_rad")
        # Fuel-burning reactors
        fuel_used = sum(
            self.reactor_outputs.get(k, 0.0) * REACTOR_FUEL_PER_TICK_AT_FULL for k in fuel_reactors
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
            self.reactor_outputs.get(k, 0.0) * REACTOR_RAD_PER_TICK_AT_FULL for k in rad_reactors
        )
        if rad_used > 0:
            new_rad = power_room["radioactive"] - rad_used
            if new_rad <= 0:
                power_room["radioactive"] = 0.0
                for k in rad_reactors:
                    self.reactor_outputs[k] = 0.0
            else:
                power_room["radioactive"] = round(new_rad, 2)
    def update_gw_locks(self) -> None:
        """Recalculate percentages for GW-locked stations each tick so the
        absolute GW delivered stays constant as reactor output/battery changes.
        Battery is outside the 100% sum -- only non-battery keys are redistributed.
        If total required GW exceeds net available, all GW locks are released.
        """
        _SUM_KEYS = [k for k in self.power_allocation.keys()]
        gw_locked = {k: v for k, v in self.power_allocation_gw_targets.items()
                     if v is not None}
        if not gw_locked:
            return
        total_gw = self.net_power_gw()
        # No power or insufficient power -- release all GW locks
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
        # Apply new pcts to GW-locked stations.
        # 6-decimal precision keeps GW-delivered drift below ~0.005 GW
        # for any reasonable total power budget (rounding to 4 decimals
        # caused 20 GW locks to drift to ~19.9 GW at large totals).
        for k, pct in new_pcts.items():
            self.power_allocation[k] = round(pct, 6)
        # Redistribute delta among free (unlocked by either method) non-battery stations
        free = [k for k in _SUM_KEYS
                if k not in gw_locked
                and not self.power_allocation_locked.get(k, False)]
        if free and abs(delta) > 1e-6:
            free_sum = sum(max(0, self.power_allocation[k]) for k in free)
            if free_sum > 1e-6:
                for k in free:
                    frac = max(0, self.power_allocation[k]) / free_sum
                    self.power_allocation[k] = round(
                        max(0, self.power_allocation[k] + delta * frac), 6)
            else:
                share = delta / len(free)
                for k in free:
                    self.power_allocation[k] = round(
                        max(0, self.power_allocation[k] + share), 6)
        # Absorb floating-point rounding into the first free station
        total = sum(self.power_allocation[k] for k in _SUM_KEYS)
        err   = 100.0 - total
        if abs(err) > 1e-4 and free:
            k = free[0]
            self.power_allocation[k] = round(
                max(0, self.power_allocation[k] + err), 6)
    def update_battery(self) -> None:
        """Charge or discharge battery each tick using battery_slider (-100..+100)."""
        cap   = self.battery_capacity_gw()
        delta = (self.battery_slider / 100.0) * cap
        # Positive slider = discharge (energy leaves battery); negative = charge (energy enters)
        self.battery_energy_gw = max(0.0, min(cap, self.battery_energy_gw - delta))
        # Snap slider to 0 when limit hit so the UI reflects the stopped state
        if self.battery_energy_gw >= cap and delta < 0:
            self.battery_slider = 0.0
        if self.battery_energy_gw <= 0.0 and delta > 0:
            self.battery_slider = 0.0
    def shields_gw(self) -> float:
        """GW currently allocated to the shields station (degraded by system health)."""
        health_frac = self.system_health.get("shield_system", 100.0) / 100.0
        return round(self.net_power_gw() * self.power_allocation.get("shields", 0.0) / 100.0 * health_frac, 2)
    def weapons_gw(self) -> float:
        """GW currently allocated to the weapons station (degraded by system health)."""
        health_frac = self.system_health.get("weapons_system", 100.0) / 100.0
        return round(self.net_power_gw() * self.power_allocation.get("weapons", 0.0) / 100.0 * health_frac, 2)
    def targeting_range_au(self) -> float:
        """Detection range of the targeting system based on weapons power."""
        t_gw = self.weapons_gw() * max(0.0, min(100.0, self.weapons_targeting_pct)) / 100.0
        return round(t_gw * TARGETING_RANGE_PER_GW, 3)
    def _component_gw(self, station: str, section: str, role: str, comp_id: int) -> float:
        """GW delivered to a single installed component."""
        if station == "shields":
            s_gw = self.shields_gw() * self.shields_section_alloc.get(section, 0.0) / 100.0
            alloc = self.shields_component_alloc.get(section, {})
            pool = (
                self.hull_sections.get(section, {}).get("defense_lasers", []) +
                self.hull_sections.get(section, {}).get("shield_generators", [])
            )
        else:
            laser_gw = self.weapons_gw() * max(0.0, 100.0 - self.weapons_targeting_pct) / 100.0
            s_gw = laser_gw * self.weapons_section_alloc.get(section, 0.0) / 100.0
            alloc = self.weapons_component_alloc.get(section, {})
            pool = self.hull_sections.get(section, {}).get("offense_lasers", [])
        if not pool:
            return 0.0
        id_str = str(comp_id)
        if alloc:
            total_w = sum(alloc.values()) or 1.0
            w = alloc.get(id_str, 0.0) / total_w
        else:
            w = 1.0 / len(pool)
        return round(s_gw * w, 4)
    def get_section_shield_reduction(self, section: str) -> float:
        """Damage reduction fraction (0..1) provided by shield batteries on a section."""
        batteries = self.hull_sections.get(section, {}).get("shield_generators", [])
        if not batteries:
            return 0.0
        total_reduction = 0.0
        for b in batteries:
            gw = self._component_gw("shields", section, "shield_battery", b["id"])
            health_frac = b["health"] / 100.0
            total_reduction += gw * health_frac * SHIELD_REDUCTION_PER_GW / 100.0
        return round(min(MAX_SHIELD_REDUCTION, total_reduction), 4)
    def get_section_defense_info(self, section: str) -> dict:
        """Aggregate range (AU) and DPS for defense lasers on a section."""
        lasers = self.hull_sections.get(section, {}).get("defense_lasers", [])
        total_range = 0.0
        total_dps = 0.0
        for laser in lasers:
            gw = self._component_gw("shields", section, "defense_laser", laser["id"])
            h = laser["health"] / 100.0
            total_range = max(total_range, gw * h * DEFENSE_LASER_RANGE_PER_GW)
            total_dps += gw * h * DEFENSE_LASER_DPS_PER_GW
        return {"range_au": round(total_range, 3), "dps": round(total_dps, 3)}
    def toggle_laser_mode(self, section: str, laser_id: int, list_key: str) -> tuple[bool, str]:
        """Toggle a laser between defense (auto-fire) and attack (fill weapon pool) mode."""
        sec = self.hull_sections.get(section, {})
        for laser in sec.get(list_key, []):
            if laser["id"] == laser_id:
                cur = laser.get("mode", "defense" if list_key == "defense_lasers" else "attack")
                laser["mode"] = "attack" if cur == "defense" else "defense"
                return True, f"Laser #{laser_id} -> {laser['mode']} mode"
        return False, f"Laser #{laser_id} not found"

    def update_weapon_pool(self) -> None:
        """Tick: attack-mode lasers contribute TW to the weapon_energy_pool."""
        from .constants import WEAPON_ENERGY_POOL_MAX
        gained = 0.0
        for section in self.hull_sections:
            for list_key in ("defense_lasers", "offense_lasers"):
                for laser in self.hull_sections[section].get(list_key, []):
                    if laser.get("mode", "attack" if list_key == "offense_lasers" else "defense") != "attack":
                        continue
                    gw = self._component_gw(
                        "shields" if list_key == "defense_lasers" else "weapons",
                        section,
                        "defense_laser" if list_key == "defense_lasers" else "offense_laser",
                        laser["id"]
                    )
                    gained += gw * (laser.get("health", 100.0) / 100.0)
        self.weapon_energy_pool = round(min(WEAPON_ENERGY_POOL_MAX, self.weapon_energy_pool + gained), 2)

    def fire_weapon_pool(self, fraction: float = 1.0) -> float:
        """Drain weapon pool and return TW fired (for damage calculations)."""
        fired = round(self.weapon_energy_pool * max(0.0, min(1.0, fraction)), 2)
        self.weapon_energy_pool = round(self.weapon_energy_pool - fired, 2)
        return fired
    def fire_defense_lasers(self, obj: dict, obj_sides: list, distance_au: float) -> float:
        """Fire all defense lasers on sides matching obj_sides at an approaching object.
        Returns total HP dealt this tick."""
        total_dps = 0.0
        for side in obj_sides:
            lasers = self.hull_sections.get(side, {}).get("defense_lasers", [])
            for laser in lasers:
                if laser["health"] <= 0:
                    continue
                gw = self._component_gw("shields", side, "defense_laser", laser["id"])
                h_frac = laser["health"] / 100.0
                laser_range = gw * h_frac * DEFENSE_LASER_RANGE_PER_GW
                if distance_au <= laser_range:
                    total_dps += gw * h_frac * DEFENSE_LASER_DPS_PER_GW
        return round(total_dps, 3)
    def fire_offense_lasers_at(self, obj_sides: list, distance_au: float) -> float:
        """Fire offense lasers on sides matching obj_sides at a target.
        Returns total DPS this tick."""
        total_dps = 0.0
        for side in obj_sides:
            lasers = self.hull_sections.get(side, {}).get("offense_lasers", [])
            for laser in lasers:
                if laser["health"] <= 0:
                    continue
                gw = self._component_gw("weapons", side, "offense_laser", laser["id"])
                total_dps += gw * (laser["health"] / 100.0) * OFFENSE_LASER_DPS_PER_GW
        return round(total_dps, 3)
    def apply_hit_damage(self, base_damage: float, obj_sides: list, fwd_frac: float, right_frac: float) -> None:
        """Apply hit damage to hull sections with shield reduction. Also damages 10% to components."""
        # Build weighted fractions per side
        weights: dict = {}
        if abs(fwd_frac) >= 0.5:
            weights["fore" if fwd_frac > 0 else "aft"] = abs(fwd_frac)
        if abs(right_frac) >= 0.5:
            weights["starboard" if right_frac > 0 else "port"] = abs(right_frac)
        # Above/below
        for side in obj_sides:
            if side in ("above", "below"):
                weights[side] = 0.3
        if not weights:
            weights = {obj_sides[0]: 1.0} if obj_sides else {"front": 1.0}
        total_w = sum(weights.values()) or 1.0
        for side, w in weights.items():
            side_damage = base_damage * (w / total_w)
            # Reduce by shield batteries on this side
            reduction = self.get_section_shield_reduction(side)
            actual = side_damage * (1.0 - reduction)
            # Apply 10% to installed components on this side
            comp_dmg = actual * 0.10
            for role in ("defense_lasers", "offense_lasers", "shield_generators"):
                for comp in self.hull_sections.get(side, {}).get(role, []):
                    comp["health"] = round(max(0.0, comp["health"] - comp_dmg), 2)
            # Apply remaining 90% to outer hull section
            self.outer_hull_health[side] = round(
                max(0.0, self.outer_hull_health[side] - actual * 0.90), 2)
            # Carry remainder into overall hull_health (reduced from 10% of 90% total hit)
            self.hull_health = round(max(0.0, self.hull_health - actual * 0.10), 2)
    def install_component(self, section: str, role: str, station: str) -> tuple[bool, str]:
        """Queue a component install from room inventory into a hull section.
        Takes 100 ticks at 1 GW/% -- duration scales with available station GW.
        role: 'defense_laser' | 'offense_laser' | 'shield_battery'
        station: 'shields' | 'weapons'
        """
        if section not in SECTION_SIDES:
            return False, f"Unknown section: {section}"
        _ROLE_MAP = {
            "defense_laser":  ("tactical_bridge", "lasers",          "defense_lasers"),
            "offense_laser":  ("tactical_bridge", "lasers",          "offense_lasers"),
            "shield_battery": ("tactical_bridge", "shield_generators", "shield_generators"),
        }
        if role not in _ROLE_MAP:
            return False, f"Unknown role: {role}"
        room_key, item_key, col_key = _ROLE_MAP[role]
        if station == "weapons" and role != "offense_laser":
            return False, "Weapons station can only install offense lasers"
        if station == "shields" and role == "offense_laser":
            return False, "Shields station cannot install offense lasers"
        room = self.rooms.get(room_key, {})
        if room.get(item_key, 0) < 1:
            return False, f"No {item_key} in {room_key}"
        sec = self.hull_sections[section]
        # Count installed + installing
        installed = len(sec.get(col_key, []))
        installing = sum(1 for j in self.component_jobs
                         if j["action"] == "install" and j["section"] == section and j["col_key"] == col_key)
        if installed + installing >= SECTION_COMPONENT_CAP:
            return False, f"{section} already has {SECTION_COMPONENT_CAP} {role}s (including in-progress)"
        # Reserve item from room
        room[item_key] = max(0, room.get(item_key, 0) - 1)
        default_mode = "defense" if role == "defense_laser" else "attack"
        comp = {"id": self._next_component_id, "health": 100.0, "mode": default_mode}
        self._next_component_id += 1
        job = {
            "id": self._next_job_id,
            "action": "install",
            "section": section,
            "role": role,
            "col_key": col_key,
            "room_key": room_key,
            "item_key": item_key,
            "station": station,
            "ticks_left": COMPONENT_INSTALL_TICKS,
            "comp": comp,
        }
        self._next_job_id += 1
        self.component_jobs.append(job)
        return True, f"Installing {role} #{comp['id']} in {section} (0%)"
    def uninstall_component(self, section: str, role: str, component_id: int) -> tuple[bool, str]:
        """Queue removal of an installed component. Returns it to room when complete."""
        if section not in SECTION_SIDES:
            return False, f"Unknown section: {section}"
        _ROLE_MAP = {
            "defense_laser":  ("defense_lasers",  "tactical_bridge", "lasers",  "shields"),
            "offense_laser":  ("offense_lasers",  "tactical_bridge", "lasers",  "weapons"),
            "shield_battery": ("shield_generators", "tactical_bridge", "shield_generators", "shields"),
        }
        if role not in _ROLE_MAP:
            return False, f"Unknown role: {role}"
        col_key, room_key, item_key, station = _ROLE_MAP[role]
        sec = self.hull_sections.get(section, {})
        comps = sec.get(col_key, [])
        comp = next((c for c in comps if c["id"] == component_id), None)
        if not comp:
            return False, f"Component {component_id} not found in {section}.{col_key}"
        # Check not already being uninstalled
        if any(j["action"] == "uninstall" and j.get("comp_id") == component_id for j in self.component_jobs):
            return False, f"Component {component_id} already being uninstalled"
        # Remove from hull immediately (not functional during uninstall)
        comps.remove(comp)
        # Clean up alloc entry
        alloc = (self.shields_component_alloc if role in ("defense_laser", "shield_battery")
                 else self.weapons_component_alloc)
        alloc.get(section, {}).pop(str(component_id), None)
        job = {
            "id": self._next_job_id,
            "action": "uninstall",
            "section": section,
            "role": role,
            "col_key": col_key,
            "room_key": room_key,
            "item_key": item_key,
            "station": station,
            "ticks_left": COMPONENT_UNINSTALL_TICKS,
            "comp_id": component_id,
        }
        self._next_job_id += 1
        self.component_jobs.append(job)
        return True, f"Uninstalling {role} #{component_id} from {section} (0%)"
    def update_component_jobs(self) -> None:
        """Advance component install/uninstall jobs. Spec: install=80 ticks, uninstall=50 ticks."""
        if not self.component_jobs:
            return
        done_ids = []
        for job in self.component_jobs:
            job["ticks_left"] = job.get("ticks_left", 1) - 1
            if job["ticks_left"] > 0:
                continue
            done_ids.append(job["id"])
            if job["action"] == "install":
                self.hull_sections[job["section"]][job["col_key"]].append(job["comp"])
            elif job["action"] == "uninstall":
                self.rooms[job["room_key"]][job["item_key"]] = (
                    self.rooms[job["room_key"]].get(job["item_key"], 0) + 1
                )
        self.component_jobs = [j for j in self.component_jobs if j["id"] not in done_ids]
    def to_dict(self) -> dict:
        # Compute aggregate item_health for backward-compat (repair panel ITEMS tab)
        all_lasers = []
        all_batteries = []
        for sd in self.hull_sections.values():
            all_lasers.extend(sd.get("defense_lasers", []))
            all_lasers.extend(sd.get("offense_lasers", []))
            all_batteries.extend(sd.get("shield_generators", []))
        computed_laser_health = (
            sum(l["health"] for l in all_lasers) / len(all_lasers) if all_lasers else 100.0
        )
        computed_battery_health = (
            sum(b["health"] for b in all_batteries) / len(all_batteries) if all_batteries else 100.0
        )
        # Per-section defense info (range, dps) for the shields panel
        section_defense = {
            side: self.get_section_defense_info(side) for side in SECTION_SIDES
        }
        section_shield_reduction = {
            side: self.get_section_shield_reduction(side) for side in SECTION_SIDES
        }
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
            "warp_capacitor_max_tw": self.warp_capacity(),
            "fabrication_choice": self.fabrication_choice,
            "engine_heat": self.engine_heat,
            "engine_shutdown": self.engine_shutdown,
            "reactor_shutdown": self.reactor_shutdown,
            "effective_power_tw": self.effective_reactor_output_gw(),
            "net_power_tw": self.net_power_gw(),
            "battery_count": self.battery_count,
            "battery_energy_tw": round(self.battery_energy_gw, 2),
            "battery_capacity_tw": self.battery_capacity_gw(),
            "battery_slider": self.battery_slider,
            "people_on_board": self.count_people(),
            "life_support_min_tw": self.life_support_min_gw(),
            "oxygen_reserves": round(self.oxygen_reserves, 2),
            "bio_matter_rations": round(self.bio_matter_rations, 2),
            "power_allocation": self.power_allocation,
            "power_allocation_locked": self.power_allocation_locked,
            "power_allocation_tw_targets": self.power_allocation_gw_targets,
            "engine_outputs": self.engine_outputs,
            "warp_capacitor_tw": self.warp_capacitor_gw,
            "engine_thrust_au": self.engine_thrust_au,
            "auto_repair_enabled": self.auto_repair_enabled,
            "repair_material_available": self._repair_material_available(),
            "rooms": self.rooms,
            "room_capacity": {k: self.ROOM_CAPACITY.get(k, ROOM_CAPACITY_STANDARD) for k in self.rooms},
            "room_used": {k: round(self.room_used(k), 2) for k in self.rooms},
            "orbiting_planet_id": self.orbiting_planet_id,
            "orbit_radius_au": self.orbit_radius_au,
            "orbit_center": self.orbit_center,
            "mining_bots": self.mining_bot_counts(),
            "transport_bots": self.transport_bots,
            "repair_bots": self.repair_bots,
            "mining_bots_list": self.mining_bots_list,
            "room_hull_health": self.room_hull_health,
            "outer_hull_health": self.outer_hull_health,
            "item_health": {
                "air_scrubbers":     self.item_health.get("air_scrubbers", 100.0),
                "lasers":            round(computed_laser_health, 2),
                "shield_generators": round(computed_battery_health, 2),
            },
            "manufacturing_alloc": self.manufacturing_alloc,
            "manufacturing_progress": self.manufacturing_progress,
            "fabrication_bots": self.fabrication_bots,
            "fabrication_assignment": self.fabrication_assignment,
            "industry_progress": self.industry_progress,
            "synthesis_alloc": self.synthesis_alloc,
            "synthesis_progress": self.synthesis_progress,
            # ── Combat / shields / weapons ────────────────────────────────────────
            "hull_sections": self.hull_sections,
            "shields_tw": self.shields_gw(),
            "shields_section_alloc": self.shields_section_alloc,
            "shields_component_alloc": self.shields_component_alloc,
            "section_defense": section_defense,
            "section_shield_reduction": section_shield_reduction,
            "weapons_tw": self.weapons_gw(),
            "weapons_targeting_pct": self.weapons_targeting_pct,
            "weapons_section_alloc": self.weapons_section_alloc,
            "weapons_component_alloc": self.weapons_component_alloc,
            "weapons_locked_target_id": self.weapons_locked_target_id,
            "targeting_range_au": self.targeting_range_au(),
            "weapon_energy_pool": round(self.weapon_energy_pool, 2),
            "component_jobs": self.component_jobs,
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
            "reactor_1_fuel": REACTOR_START_OUTPUT,
            "reactor_2_fuel": REACTOR_START_OUTPUT,
            "reactor_3_rad":  REACTOR_START_OUTPUT,
            "reactor_4_rad":  REACTOR_START_OUTPUT,
        },
    )
    # Life support GW-locked to minimum (5 GW base); general_systems GW-locked to 20 GW
    ship.power_allocation_gw_targets["life_support"]    = ship.life_support_min_gw() * 2
    ship.power_allocation_gw_targets["general_systems"] = 20.0
    # Seed Engine Room with fuel
    ship.rooms["engine_bay"]["fuel"] = ENGINE_ROOM_FUEL_START
    # Seed battery with starting charge
    ship.battery_energy_gw = 50.0    # generous starting battery charge
    ship.warp_capacitor_gw = 1200.0  # enough for one short jump at the start
    ship.rooms["reactor_room"]["warp_batteries"] = WARP_BATTERIES_START

    # ── Seed starting resources so all stations are immediately playable ──────

    # Cargo bay -- raw materials for manufacturing + spares

    ship.rooms["cargo_bay"].update({
        "metals":               5_000.0,
        "silicates":            2_000.0,
        "rare_earth":           2_000.0,
        "radioactive":          1_000.0,
        "hydrocarbons":           500.0,
        "fuel":                 5_000.0,
        "electronics":             20,
        "repair_patches":          10,
        "lasers":                   4,
        "missiles":                 4,
        "shield_generators":        4,
        "power_batteries":          2,
        "air_scrubbers":            3,
    })

    # Manufacturing room -- enough materials pre-staged to build several items

    ship.rooms["sub_deck_refinery"].update({
        "metals":               3_000.0,
        "silicates":            1_000.0,
        "rare_earth":           1_000.0,
        "radioactive":            500.0,
        "hydrocarbons":           200.0,
        "fuel":                 1_000.0,
    })
    # Weapons room -- a few pre-installed lasers and missiles
    ship.rooms["tactical_bridge"].update({
        "lasers":   3,
        "missiles": 3,
    })
    # Shields room -- a few pre-installed shield batteries and lasers
    ship.rooms["tactical_bridge"].update({
        "shield_generators": 3,
        "lasers":           2,
    })
    # Living quarters -- air scrubbers installed for life support from the start
    ship.rooms["living_quarters"].update({
        "air_scrubbers": 2,
    })
    # Spawn starting transport bots
    for _ in range(TRANSPORT_BOT_START_COUNT):
        ship.transport_bots.append(ship._make_bot())
    # Spawn starting repair bots
    for _ in range(REPAIR_BOT_START_COUNT):
        ship.repair_bots.append(ship._make_repair_bot())
    # Spawn starting mining bots
    for _ in range(MINING_BOT_START_COUNT):
        ship.mining_bots_list.append(ship._make_mining_bot())
    # Spawn starting fabrication bots (2 at game start)
    for _ in range(2):
        ship.fabrication_bots.append(ship._make_fabrication_bot())
    return ship
