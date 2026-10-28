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
    MINING_YIELD_PER_BOT,
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
    "Rocky":        {"weight": 20, "metals": (0.60,1.00), "silicates": (0.40,0.80), "rare_earth": (0.10,0.30), "hydrocarbons": (0.00,0.10), "radioactive": (0.05,0.20), "base_hostility": (20,50), "can_inhabit": False, "moons": (0,2)},
    "Desert":       {"weight": 15, "metals": (0.20,0.50), "silicates": (0.70,1.00), "rare_earth": (0.10,0.40), "hydrocarbons": (0.05,0.20), "radioactive": (0.00,0.10), "base_hostility": (30,60), "can_inhabit": True,  "moons": (0,2)},
    "Volcanic":     {"weight": 12, "metals": (0.50,0.90), "silicates": (0.10,0.40), "rare_earth": (0.20,0.60), "hydrocarbons": (0.00,0.05), "radioactive": (0.40,0.80), "base_hostility": (60,90), "can_inhabit": False, "moons": (0,2)},
    "Gas Giant":    {"weight": 10, "metals": (0.00,0.05), "silicates": (0.00,0.05), "rare_earth": (0.00,0.05), "hydrocarbons": (0.80,1.00), "radioactive": (0.00,0.05), "base_hostility": (80,100),"can_inhabit": False, "moons": (2,20)},
    "Frozen":       {"weight": 10, "metals": (0.10,0.30), "silicates": (0.50,0.80), "rare_earth": (0.05,0.20), "hydrocarbons": (0.20,0.50), "radioactive": (0.00,0.05), "base_hostility": (20,50), "can_inhabit": False, "moons": (0,3)},
    "Earth-Like":   {"weight":  8, "metals": (0.30,0.60), "silicates": (0.30,0.60), "rare_earth": (0.05,0.20), "hydrocarbons": (0.20,0.50), "radioactive": (0.01,0.10), "base_hostility": (10,40), "can_inhabit": True,  "moons": (0,2)},
    "Gaia":         {"weight":  5, "metals": (0.40,0.70), "silicates": (0.40,0.70), "rare_earth": (0.20,0.40), "hydrocarbons": (0.30,0.60), "radioactive": (0.00,0.05), "base_hostility": (5,25),  "can_inhabit": True,  "moons": (0,2)},
    "Radioactive":  {"weight":  5, "metals": (0.20,0.50), "silicates": (0.10,0.40), "rare_earth": (0.30,0.60), "hydrocarbons": (0.00,0.10), "radioactive": (0.70,1.00), "base_hostility": (70,95), "can_inhabit": False, "moons": (0,1)},
    "Toxic":        {"weight":  5, "metals": (0.10,0.40), "silicates": (0.20,0.50), "rare_earth": (0.30,0.60), "hydrocarbons": (0.50,0.80), "radioactive": (0.10,0.30), "base_hostility": (60,90), "can_inhabit": False, "moons": (0,1)},
}

_PLANET_TYPE_NAMES = list(PLANET_TYPE_CONFIG.keys())
_PLANET_TYPE_WEIGHTS = [PLANET_TYPE_CONFIG[t]["weight"] for t in _PLANET_TYPE_NAMES]

# Moons draw from rocky/frozen types
MOON_TYPES   = ["Rocky", "Frozen", "Radioactive"]
MOON_WEIGHTS = [60, 30, 10]

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
    silicates: float
    rare_earth: float
    radioactive: float
    hydrocarbons: float
    base_hostility: float
    inhabited: bool
    position: dict = field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})
    stockpile: dict = field(default_factory=lambda: {
        "metals": 0.0, "silicates": 0.0, "rare_earth": 0.0,
        "radioactive": 0.0, "hydrocarbons": 0.0
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
    silicates: float
    rare_earth: float
    radioactive: float
    hydrocarbons: float
    base_hostility: float
    faction_hostility_bump: float
    inhabited: bool
    moons: list
    orbit_angle_rad: float = 0.0   # current angle in the orbital plane
    orbit_speed_rad: float = 0.0   # radians advanced per tick
    stockpile: dict = field(default_factory=lambda: {
        "metals": 0.0, "silicates": 0.0, "rare_earth": 0.0,
        "radioactive": 0.0, "hydrocarbons": 0.0
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
        """Accumulate resources. Spec: Tick Yield = 10 × richness × (bot_health/100).
        Richness is now 0.00–1.00; bot health defaults to 100% if not tracked per-bot."""
        for resource in ("metals", "silicates", "rare_earth", "radioactive", "hydrocarbons"):
            count = bots.get(resource, 0)
            if count <= 0:
                continue
            richness = getattr(self, resource)  # 0.0 – 1.00
            gained   = round(MINING_YIELD_PER_BOT * count * richness, 2)
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
# Module-level local RNG, seeded per generate_galaxy() call
_rng: random.Random = random.Random()


def _rng_range(lo: float, hi: float) -> float:
    return round(_rng.uniform(lo, hi), 2)


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
    angle = _rng.uniform(0, math.pi * 2)
    incl  = math.radians(_rng.uniform(-5, 5))
    pos = {
        "x": round(distance_au * math.cos(angle), 4),
        "y": round(distance_au * math.sin(incl), 4),
        "z": round(distance_au * math.sin(angle) * math.cos(incl), 4),
    }
    return pos, angle


def _generate_moon(parent_name: str, moon_index: int, parent_distance_au: float) -> Moon:
    moon_type = _rng.choices(MOON_TYPES, weights=MOON_WEIGHTS, k=1)[0]
    cfg = PLANET_TYPE_CONFIG[moon_type]
    moon_dist = _rng.uniform(0.002, 0.05)  # AU from parent planet
    moon_pos, _ = _orbit_position(moon_dist)  # moons are static (position only)
    return Moon(
        id=str(uuid.uuid4()),
        name=f"{parent_name}-Moon-{chr(65 + moon_index)}",
        type=moon_type,
        metals=_rng_range(*cfg["metals"]),
        silicates=_rng_range(*cfg["silicates"]),
        rare_earth=_rng_range(*cfg["rare_earth"]),
        radioactive=_rng_range(*cfg["radioactive"]),
        hydrocarbons=_rng_range(*cfg["hydrocarbons"]),
        base_hostility=_rng_range(*cfg["base_hostility"]),
        inhabited=False,
        position=moon_pos,
    )


def _generate_planet(system_name: str, index: int, n_planets: int) -> Planet:
    from .constants import PLANET_ORBIT_BASE_SPEED_RAD
    p_type = _rng.choices(_PLANET_TYPE_NAMES, weights=_PLANET_TYPE_WEIGHTS, k=1)[0]
    cfg = PLANET_TYPE_CONFIG[p_type]
    orbital_dist = _orbital_distance(index, n_planets)
    position, orbit_angle = _orbit_position(orbital_dist)
    # Kepler-ish: angular speed ∝ r^-0.5 (inner planets orbit faster)
    orbit_speed = round(PLANET_ORBIT_BASE_SPEED_RAD / math.sqrt(orbital_dist), 6)
    name = f"{system_name}-{index + 1}"

    base_hostility = _rng_range(*cfg["base_hostility"])
    # 15 % chance of inhabited on eligible types; faction hostility added later by AI GM
    inhabited = cfg["can_inhabit"] and _rng.random() < 0.15

    n_moons = _rng.randint(*cfg["moons"])
    moons = [_generate_moon(name, i, orbital_dist) for i in range(n_moons)]

    return Planet(
        id=str(uuid.uuid4()),
        name=name,
        type=p_type,
        orbital_distance_au=orbital_dist,
        position=position,
        metals=_rng_range(*cfg["metals"]),
        silicates=_rng_range(*cfg["silicates"]),
        rare_earth=_rng_range(*cfg["rare_earth"]),
        radioactive=_rng_range(*cfg["radioactive"]),
        hydrocarbons=_rng_range(*cfg["hydrocarbons"]),
        base_hostility=base_hostility,
        faction_hostility_bump=_rng.uniform(15, 40) if inhabited else 0.0,
        inhabited=inhabited,
        moons=moons,
        orbit_angle_rad=orbit_angle,
        orbit_speed_rad=orbit_speed,
    )


def _spiral_position() -> dict:
    """Place a star system in a 2-arm spiral galaxy."""
    if _rng.random() < 0.8:                      # 80 % in spiral arms
        arm   = _rng.randint(0, 1)
        r     = _rng.triangular(50, GALAXY_RADIUS_LY, GALAXY_RADIUS_LY * 0.4)
        angle = (r / GALAXY_RADIUS_LY) * math.pi * 4  # 2 full rotations
        angle += arm * math.pi                         # second arm offset
        angle += _rng.gauss(0, 0.25)                # arm spread
        x = r * math.cos(angle) + _rng.gauss(0, 20)
        z = r * math.sin(angle) + _rng.gauss(0, 20)
    else:                                              # 20 % scattered
        angle = _rng.uniform(0, math.pi * 2)
        r     = _rng.uniform(0, GALAXY_RADIUS_LY)
        x     = r * math.cos(angle)
        z     = r * math.sin(angle)

    y = _rng.gauss(0, GALAXY_HEIGHT_LY * 0.5)
    return {"x": round(x, 2), "y": round(y, 2), "z": round(z, 2)}


def _generate_system(used_names: set) -> StarSystem:
    star_type = _rng.choices(STAR_TYPES, weights=STAR_WEIGHTS, k=1)[0]
    prefix = _rng.choice(_NAME_PREFIXES)
    letter = chr(_rng.randint(65, 90))
    number = _rng.randint(1, 999)
    name   = f"{prefix} {letter}-{number:03d}"
    while name in used_names:
        number = _rng.randint(1, 999)
        name   = f"{prefix} {letter}-{number:03d}"
    used_names.add(name)

    lo, hi = STAR_PLANET_COUNT.get(star_type, (2, 5))
    n_planets = _rng.randint(lo, hi)
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
    global _rng
    if seed is None:
        seed = random.randint(0, 2**32 - 1)
    _rng = random.Random(seed)
    n = _rng.randint(GALAXY_SYSTEM_COUNT_MIN, GALAXY_SYSTEM_COUNT_MAX)
    used_names: set[str] = set()
    systems = [_generate_system(used_names) for _ in range(n)]
    return Galaxy(systems=systems, seed=seed)
