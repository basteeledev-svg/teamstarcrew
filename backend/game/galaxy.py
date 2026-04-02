"""Galaxy, StarSystem, Planet, and Moon generation.

Design rules implemented here:
- 50–70 star systems placed in 3-D galactic coordinates (light-years)
- System skeleton generated up front; planet fine-detail generated on first visit
- Moons draw from a restricted type subset
- Resource abundances and hostility are type-specific ranges
"""
import math
import random
import uuid
from dataclasses import dataclass, field
from typing import Optional

from .constants import (
    GALAXY_RADIUS_LY,
    GALAXY_HEIGHT_LY,
    GALAXY_SYSTEM_COUNT_MIN,
    GALAXY_SYSTEM_COUNT_MAX,
    PLANET_ORBIT_MIN_AU,
    PLANET_ORBIT_MAX_AU,
)

# ── Star type distribution (realistic stellar statistics) ─────────────────────
STAR_TYPES = ["M", "K", "G", "F", "A", "B", "Giant"]
STAR_WEIGHTS = [70, 13, 8, 4, 2, 1, 2]

STAR_PLANET_COUNT: dict[str, tuple[int, int]] = {
    "M": (1, 4),
    "K": (2, 6),
    "G": (2, 8),
    "F": (2, 6),
    "A": (1, 4),
    "B": (0, 3),
    "Giant": (0, 2),
}

STAR_COLORS: dict[str, str] = {
    "M": "#ff4422",
    "K": "#ffaa44",
    "G": "#ffee88",
    "F": "#ffffcc",
    "A": "#aaddff",
    "B": "#6699ff",
    "Giant": "#ff88aa",
}

# ── Planet type configuration ─────────────────────────────────────────────────
# Each entry: weight, resource (min,max), base_hostility (min,max),
#             can_be_inhabited, moon_count (min,max)
PLANET_TYPE_CONFIG: dict[str, dict] = {
    "Barren/Rocky":    {"weight": 30, "metals": (20,60), "rare_earth": (10,30), "radioactive": (5,20),  "hydrocarbons": (0,10),  "base_hostility": (20,50), "can_inhabit": False, "moons": (0,2)},
    "Terrestrial":     {"weight": 15, "metals": (20,60), "rare_earth": (10,40), "radioactive": (5,20),  "hydrocarbons": (10,50), "base_hostility": (10,40), "can_inhabit": True,  "moons": (0,2)},
    "Desert/Arid":     {"weight": 12, "metals": (30,70), "rare_earth": (20,60), "radioactive": (10,30), "hydrocarbons": (5,30),  "base_hostility": (30,60), "can_inhabit": True,  "moons": (0,2)},
    "Ice World":       {"weight": 10, "metals": (10,40), "rare_earth": (10,30), "radioactive": (5,15),  "hydrocarbons": (20,50), "base_hostility": (20,50), "can_inhabit": False, "moons": (0,3)},
    "Gas Giant":       {"weight": 10, "metals": (0,10),  "rare_earth": (0,5),   "radioactive": (5,20),  "hydrocarbons": (70,100),"base_hostility": (80,100),"can_inhabit": False, "moons": (2,20)},
    "Ice Giant":       {"weight":  8, "metals": (0,10),  "rare_earth": (5,20),  "radioactive": (5,15),  "hydrocarbons": (30,70), "base_hostility": (65,90), "can_inhabit": False, "moons": (2,15)},
    "Ocean World":     {"weight":  5, "metals": (5,30),  "rare_earth": (10,40), "radioactive": (0,15),  "hydrocarbons": (30,70), "base_hostility": (20,50), "can_inhabit": True,  "moons": (0,2)},
    "Jungle/Lush":     {"weight":  4, "metals": (10,40), "rare_earth": (10,30), "radioactive": (0,10),  "hydrocarbons": (40,80), "base_hostility": (30,60), "can_inhabit": True,  "moons": (0,2)},
    "Tidally Locked":  {"weight":  3, "metals": (20,50), "rare_earth": (15,40), "radioactive": (5,25),  "hydrocarbons": (5,30),  "base_hostility": (40,70), "can_inhabit": False, "moons": (0,1)},
    "Toxic/Corrosive": {"weight":  3, "metals": (10,40), "rare_earth": (30,60), "radioactive": (10,30), "hydrocarbons": (10,40), "base_hostility": (60,90), "can_inhabit": False, "moons": (0,1)},
    "Volcanic/Magma":  {"weight":  2, "metals": (60,100),"rare_earth": (30,70), "radioactive": (20,50), "hydrocarbons": (0,5),   "base_hostility": (75,100),"can_inhabit": False, "moons": (0,2)},
    "Irradiated":      {"weight":  2, "metals": (20,60), "rare_earth": (40,80), "radioactive": (60,100),"hydrocarbons": (0,5),   "base_hostility": (75,95), "can_inhabit": False, "moons": (0,1)},
    "Super-Earth":     {"weight":  1, "metals": (40,80), "rare_earth": (20,50), "radioactive": (10,30), "hydrocarbons": (10,40), "base_hostility": (20,50), "can_inhabit": True,  "moons": (0,3)},
    "Crystalline":     {"weight":  1, "metals": (10,30), "rare_earth": (60,100),"radioactive": (20,50), "hydrocarbons": (0,10),  "base_hostility": (30,60), "can_inhabit": False, "moons": (0,2)},
    "Rogue/Dark":      {"weight":  1, "metals": (5,30),  "rare_earth": (10,25), "radioactive": (5,15),  "hydrocarbons": (0,20),  "base_hostility": (60,80), "can_inhabit": False, "moons": (0,0)},
}

_PLANET_TYPE_NAMES = list(PLANET_TYPE_CONFIG.keys())
_PLANET_TYPE_WEIGHTS = [PLANET_TYPE_CONFIG[t]["weight"] for t in _PLANET_TYPE_NAMES]

# Moons only draw from this subset
MOON_TYPES  = ["Barren/Rocky", "Ice World", "Ocean World", "Crystalline", "Rogue/Dark"]
MOON_WEIGHTS = [50, 25, 10, 10, 5]

_NAME_PREFIXES = [
    "Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta",
    "Iota","Kappa","Lambda","Mu","Nu","Xi","Pi","Rho","Sigma",
    "Tau","Upsilon","Phi","Chi","Psi","Omega","Proxima","Kepler",
    "Gliese","Wolf","Ross","Barnard","HD","Vega","Rigel","Deneb",
]


# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class Moon:
    id: str
    name: str
    type: str
    metals: float
    rare_earth: float
    radioactive: float
    hydrocarbons: float
    base_hostility: float
    inhabited: bool
    health: float = 100.0
    position: dict = field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    stockpile: dict = field(default_factory=lambda: {
        "metals": 0.0, "rare_earth": 0.0, "radioactive": 0.0, "hydrocarbons": 0.0
    })

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class Planet:
    id: str
    name: str
    type: str
    orbital_distance_au: float
    position: dict          # (x,y,z) relative to system star
    metals: float
    rare_earth: float
    radioactive: float
    hydrocarbons: float
    base_hostility: float
    faction_hostility_bump: float
    inhabited: bool
    moons: list
    orbit_angle_rad: float = 0.0   # current angle in the orbital plane
    orbit_speed_rad: float = 0.0   # radians advanced per tick
    health: float = 100.0
    stockpile: dict = field(default_factory=lambda: {
        "metals": 0.0, "rare_earth": 0.0, "radioactive": 0.0, "hydrocarbons": 0.0
    })

    @property
    def total_hostility(self) -> float:
        return min(100.0, self.base_hostility + self.faction_hostility_bump)

    def orbit_tick(self) -> None:
        """Advance the planet one tick along its orbital path."""
        self.orbit_angle_rad += self.orbit_speed_rad
        if self.orbit_angle_rad > math.pi * 2:
            self.orbit_angle_rad -= math.pi * 2
        r = self.orbital_distance_au
        # y (inclination component) stays constant; only x/z change
        self.position = {
            "x": round(r * math.cos(self.orbit_angle_rad), 4),
            "y": self.position["y"],
            "z": round(r * math.sin(self.orbit_angle_rad), 4),
        }

    def mine_tick(self, bots: dict) -> None:
        """Accumulate resources per assigned bot count.

        Formula: gained = count * richness * health / 100
        (richness and health are both 0-100 percentages)
        """
        for resource in ("metals", "rare_earth", "radioactive", "hydrocarbons"):
            count = bots.get(resource, 0)
            if count <= 0:
                continue
            richness = getattr(self, resource)  # 0-100
            gained   = count * richness * self.health / 100.0
            self.stockpile[resource] = round(self.stockpile[resource] + gained, 2)

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["moons"] = [m.to_dict() for m in self.moons]
        d["total_hostility"] = self.total_hostility
        return d


@dataclass
class StarSystem:
    id: str
    name: str
    star_type: str
    star_color: str
    position_ly: dict           # galaxy-scale (x,y,z) in light-years
    planets: list               # list[Planet]
    max_orbital_distance_au: float
    visited: bool = False

    def get_planet(self, planet_id: str) -> Optional[Planet]:
        return next((p for p in self.planets if p.id == planet_id), None)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "star_type": self.star_type,
            "star_color": self.star_color,
            "position_ly": self.position_ly,
            "max_orbital_distance_au": self.max_orbital_distance_au,
            "visited": self.visited,
            "planets": [p.to_dict() for p in self.planets],
        }

    def to_summary_dict(self) -> dict:
        """Lightweight version for the galaxy map — no planet detail."""
        return {
            "id": self.id,
            "name": self.name,
            "star_type": self.star_type,
            "star_color": self.star_color,
            "position_ly": self.position_ly,
            "planet_count": len(self.planets),
            "visited": self.visited,
        }


@dataclass
class Galaxy:
    systems: list               # list[StarSystem]
    seed: int

    def get_system(self, system_id: str) -> Optional[StarSystem]:
        return next((s for s in self.systems if s.id == system_id), None)

    def distance_ly(self, id_a: str, id_b: str) -> float:
        a = self.get_system(id_a)
        b = self.get_system(id_b)
        if not a or not b:
            return 0.0
        pa, pb = a.position_ly, b.position_ly
        return math.sqrt(
            (pa["x"] - pb["x"]) ** 2 +
            (pa["y"] - pb["y"]) ** 2 +
            (pa["z"] - pb["z"]) ** 2
        )

    def systems_in_range(self, from_id: str, max_ly: float) -> list:
        return [
            s for s in self.systems
            if s.id != from_id and self.distance_ly(from_id, s.id) <= max_ly
        ]


# ── Generation helpers ────────────────────────────────────────────────────────
def _rng_range(lo: float, hi: float) -> float:
    return round(random.uniform(lo, hi), 2)


def _orbital_distance(index: int, n_planets: int) -> float:
    """Logarithmically distribute planets from ORBIT_MIN to ORBIT_MAX AU."""
    if n_planets == 1:
        return 1.0
    ratio = (PLANET_ORBIT_MAX_AU / PLANET_ORBIT_MIN_AU) ** (1.0 / (n_planets - 1))
    return round(PLANET_ORBIT_MIN_AU * (ratio ** index), 3)


def _orbit_position(distance_au: float):
    """Random position on a roughly circular orbit (slight inclination).
    Returns (position_dict, angle_rad).
    """
    angle = random.uniform(0, math.pi * 2)
    incl  = math.radians(random.uniform(-5, 5))
    pos = {
        "x": round(distance_au * math.cos(angle), 4),
        "y": round(distance_au * math.sin(incl), 4),
        "z": round(distance_au * math.sin(angle) * math.cos(incl), 4),
    }
    return pos, angle


def _generate_moon(parent_name: str, moon_index: int, parent_distance_au: float) -> Moon:
    moon_type = random.choices(MOON_TYPES, weights=MOON_WEIGHTS, k=1)[0]
    cfg = PLANET_TYPE_CONFIG[moon_type]
    moon_dist = random.uniform(0.002, 0.05)  # AU from parent planet
    moon_pos, _ = _orbit_position(moon_dist)  # moons are static (position only)
    return Moon(
        id=str(uuid.uuid4()),
        name=f"{parent_name}-Moon-{chr(65 + moon_index)}",
        type=moon_type,
        metals=_rng_range(*cfg["metals"]),
        rare_earth=_rng_range(*cfg["rare_earth"]),
        radioactive=_rng_range(*cfg["radioactive"]),
        hydrocarbons=_rng_range(*cfg["hydrocarbons"]),
        base_hostility=_rng_range(*cfg["base_hostility"]),
        inhabited=False,
        position=moon_pos,
    )


def _generate_planet(system_name: str, index: int, n_planets: int) -> Planet:
    from .constants import PLANET_ORBIT_BASE_SPEED_RAD
    p_type = random.choices(_PLANET_TYPE_NAMES, weights=_PLANET_TYPE_WEIGHTS, k=1)[0]
    cfg = PLANET_TYPE_CONFIG[p_type]
    orbital_dist = _orbital_distance(index, n_planets)
    position, orbit_angle = _orbit_position(orbital_dist)
    # Kepler-ish: angular speed ∝ r^-0.5 (inner planets orbit faster)
    orbit_speed = round(PLANET_ORBIT_BASE_SPEED_RAD / math.sqrt(orbital_dist), 6)
    name = f"{system_name}-{index + 1}"

    base_hostility = _rng_range(*cfg["base_hostility"])
    # 15 % chance of inhabited on eligible types; faction hostility added later by AI GM
    inhabited = cfg["can_inhabit"] and random.random() < 0.15

    n_moons = random.randint(*cfg["moons"])
    moons = [_generate_moon(name, i, orbital_dist) for i in range(n_moons)]

    return Planet(
        id=str(uuid.uuid4()),
        name=name,
        type=p_type,
        orbital_distance_au=orbital_dist,
        position=position,
        metals=_rng_range(*cfg["metals"]),
        rare_earth=_rng_range(*cfg["rare_earth"]),
        radioactive=_rng_range(*cfg["radioactive"]),
        hydrocarbons=_rng_range(*cfg["hydrocarbons"]),
        base_hostility=base_hostility,
        faction_hostility_bump=random.uniform(15, 40) if inhabited else 0.0,
        inhabited=inhabited,
        moons=moons,
        orbit_angle_rad=orbit_angle,
        orbit_speed_rad=orbit_speed,
    )


def _spiral_position() -> dict:
    """Place a star system in a 2-arm spiral galaxy."""
    if random.random() < 0.8:                      # 80 % in spiral arms
        arm   = random.randint(0, 1)
        r     = random.triangular(50, GALAXY_RADIUS_LY, GALAXY_RADIUS_LY * 0.4)
        angle = (r / GALAXY_RADIUS_LY) * math.pi * 4  # 2 full rotations
        angle += arm * math.pi                         # second arm offset
        angle += random.gauss(0, 0.25)                # arm spread
        x = r * math.cos(angle) + random.gauss(0, 20)
        z = r * math.sin(angle) + random.gauss(0, 20)
    else:                                              # 20 % scattered
        angle = random.uniform(0, math.pi * 2)
        r     = random.uniform(0, GALAXY_RADIUS_LY)
        x     = r * math.cos(angle)
        z     = r * math.sin(angle)

    y = random.gauss(0, GALAXY_HEIGHT_LY * 0.5)
    return {"x": round(x, 2), "y": round(y, 2), "z": round(z, 2)}


def _generate_system(used_names: set) -> StarSystem:
    star_type = random.choices(STAR_TYPES, weights=STAR_WEIGHTS, k=1)[0]
    prefix = random.choice(_NAME_PREFIXES)
    letter = chr(random.randint(65, 90))
    number = random.randint(1, 999)
    name   = f"{prefix} {letter}-{number:03d}"
    while name in used_names:
        number = random.randint(1, 999)
        name   = f"{prefix} {letter}-{number:03d}"
    used_names.add(name)

    lo, hi = STAR_PLANET_COUNT.get(star_type, (2, 5))
    n_planets = random.randint(lo, hi)
    planets = [_generate_planet(name, i, n_planets) for i in range(n_planets)]
    max_orbit = max((p.orbital_distance_au for p in planets), default=1.0)

    return StarSystem(
        id=str(uuid.uuid4()),
        name=name,
        star_type=star_type,
        star_color=STAR_COLORS.get(star_type, "#ffffff"),
        position_ly=_spiral_position(),
        planets=planets,
        max_orbital_distance_au=max_orbit,
    )


def generate_galaxy(seed: Optional[int] = None) -> Galaxy:
    if seed is None:
        seed = random.randint(0, 2**32 - 1)
    random.seed(seed)
    n = random.randint(GALAXY_SYSTEM_COUNT_MIN, GALAXY_SYSTEM_COUNT_MAX)
    used_names: set[str] = set()
    systems = [_generate_system(used_names) for _ in range(n)]
    return Galaxy(systems=systems, seed=seed)
