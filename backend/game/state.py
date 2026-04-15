"""Singleton game state and WebSocket connection manager."""
import json
import math
import random
from typing import Optional

from fastapi import WebSocket

from .galaxy import Galaxy
from .ship import Ship
from .constants import (
    NPC_RACES, NPC_SHIP_SIZES,
    NPC_SHIPS_PER_SYSTEM_MIN, NPC_SHIPS_PER_SYSTEM_MAX,
    SCAN_PLANET_TIER1, SCAN_PLANET_TIER2, SCAN_PLANET_TIER3, SCAN_PLANET_TIER4,
    SCAN_SHIP_TIER1, SCAN_SHIP_TIER2, SCAN_SHIP_TIER3, SCAN_SHIP_TIER4,
    LRS_TIER1, LRS_TIER2, LRS_TIER3, LRS_TIER4, LRS_TIER5, LRS_TIER6,
)

# ── Comms helpers — planet type → display metadata ───────────────────────────

_PLANET_VIDEO_COLORS: dict = {
    "Terrestrial":    "#44bb77",
    "Desert/Arid":    "#cc8822",
    "Ocean World":    "#2288cc",
    "Jungle/Lush":    "#55bb33",
    "Super-Earth":    "#77aa44",
}
_DEFAULT_VIDEO_COLOR = "#4488ff"

_CONTACT_NAME_PREFIXES: dict = {
    "Terrestrial":    "Colony on",
    "Desert/Arid":    "Outpost on",
    "Ocean World":    "Station at",
    "Jungle/Lush":    "Settlement on",
    "Super-Earth":    "Settlement on",
}
_DEFAULT_NAME_PREFIX = "Settlement on"


class ConnectionManager:
    """Tracks all open WebSocket connections and broadcasts state."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections = [c for c in self._connections if c is not ws]

    async def broadcast(self, payload: dict) -> None:
        data = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


class GameState:
    def __init__(self) -> None:
        self.galaxy: Optional[Galaxy] = None
        self.ship: Optional[Ship]     = None
        self.tick: int                = 0
        self.running: bool            = False
        self.messages: list           = []
        self._next_msg_id: int        = 1
        self.npc_ships: list          = []
        self._next_npc_ship_id: int   = 1
        # Dynamic objects: meteors and player-fired missiles
        self.dynamic_objects: list    = []
        self._next_obj_id: int        = 1

    def is_started(self) -> bool:
        return self.galaxy is not None and self.ship is not None

    # ── Message helpers ───────────────────────────────────────────────────────

    def _make_message(
        self,
        from_id: str,
        from_name: str,
        to_id: str,
        to_name: str,
        subject: str,
        body: str,
        direction: str = "inbox",
        has_video: bool = False,
        video_color: str = "#4488ff",
    ) -> dict:
        """Create and store a message. Returns the message dict."""
        msg = {
            "id": f"msg_{self._next_msg_id}",
            "from_id": from_id,
            "from_name": from_name,
            "to_id": to_id,
            "to_name": to_name,
            "subject": subject,
            "body": body,
            "tick": self.tick,
            "read": False,
            "direction": direction,    # "inbox" | "sent"
            "has_video": has_video,
            "video_color": video_color,
        }
        self._next_msg_id += 1
        self.messages.append(msg)
        return msg

    def _get_comms_contacts(self) -> list:
        """Compute the list of contactable NPCs from galaxy inhabited planets.
        Returns all contacts with an in_range flag based on current comms power.
        """
        if not self.is_started():
            return []

        comms_gw  = self.ship.comms_gw()
        range_ly  = self.ship.comms_range_ly()
        contacts: list = []

        for system in self.galaxy.systems:
            same = system.id == self.ship.current_system_id
            dist = 0.0 if same else self.galaxy.distance_ly(
                self.ship.current_system_id, system.id)
            # Same-system: reachable with any comms power (>= 1 GW); other systems use range
            in_range = (same and comms_gw >= 1.0) or (not same and dist <= range_ly)

            for planet in system.planets:
                if not planet.inhabited:
                    continue
                color = _PLANET_VIDEO_COLORS.get(planet.type, _DEFAULT_VIDEO_COLOR)
                prefix = _CONTACT_NAME_PREFIXES.get(planet.type, _DEFAULT_NAME_PREFIX)
                contacts.append({
                    "id":           f"planet_{planet.id}",
                    "name":         f"{prefix} {planet.name}",
                    "planet_name":  planet.name,
                    "planet_type":  planet.type,
                    "system_name":  system.name,
                    "system_id":    system.id,
                    "distance_ly":  round(dist, 2),
                    "same_system":  same,
                    "in_range":     in_range,
                    "video_color":  color,
                })

        # Sort: same-system first, then by distance
        contacts.sort(key=lambda c: (0 if c["same_system"] else 1, c["distance_ly"]))
        return contacts

    def _get_long_range_scan_data(self) -> dict:
        """Compute long-range scan tier data for every star system in the galaxy.
        signal = lrs_gw / distance_ly  (minimum distance = 0.1 LY).
        The current system always shows at tier 6 (you can observe it directly).

        Tier summary:
          T1: star name
          T2: approx planet count bucket
          T3: exact planet count
          T4: exact planet + total moon counts
          T5: individual planet types (and moon types)
          T6: approx ship count in system
        """
        lrs_gw      = self.ship.long_range_scan_gw()
        current_id  = self.ship.current_system_id

        def _tier(sig: float) -> int:
            if sig >= LRS_TIER6: return 6
            if sig >= LRS_TIER5: return 5
            if sig >= LRS_TIER4: return 4
            if sig >= LRS_TIER3: return 3
            if sig >= LRS_TIER2: return 2
            if sig >= LRS_TIER1: return 1
            return 0

        def _planet_count_bucket(n: int) -> str:
            if n <= 2:  return "sparse (1-2)"
            if n <= 5:  return "few (3-5)"
            if n <= 9:  return "several (6-9)"
            return "many (10+)"

        def _ship_count_bucket(n: int) -> str:
            if n == 0:   return "clear"
            if n <= 2:   return "minimal activity"
            if n <= 5:   return "patrol group"
            if n <= 10:  return "active fleet"
            return "major fleet presence"

        systems_out: list = []
        for system in self.galaxy.systems:
            same = system.id == current_id
            if same:
                dist_ly = 0.0
                sig     = 999.0  # effectively infinite
            else:
                dist_ly = round(self.galaxy.distance_ly(current_id, system.id), 2)
                sig     = round(lrs_gw / max(0.1, dist_ly), 3) if lrs_gw > 0 else 0.0

            tier = _tier(sig) if not same else 6

            entry: dict = {
                "id":          system.id,
                "position_ly": system.position_ly,
                "star_color":  system.star_color,
                "star_type":   system.star_type,
                "distance_ly": dist_ly,
                "signal":      min(sig, 999.0),
                "tier":        tier,
                "current":     same,
                "visited":     system.visited,
            }

            if tier >= 1:
                entry["name"] = system.name

            if tier >= 2:
                actual_count = len(system.planets)
                entry["planet_count_approx"] = _planet_count_bucket(actual_count)

            if tier >= 3:
                entry["planet_count"] = len(system.planets)

            if tier >= 4:
                total_moons = sum(len(p.moons) for p in system.planets)
                entry["moon_count"] = total_moons

            if tier >= 5:
                entry["planet_types"] = [
                    {
                        "name":  p.name,
                        "type":  p.type,
                        "moons": [{"name": m.name, "type": m.type} for m in p.moons],
                    }
                    for p in system.planets
                ]

            if tier >= 6:
                ships_here = sum(
                    1 for npc in self.npc_ships
                    if npc["system_id"] == system.id
                )
                entry["ship_count_approx"] = _ship_count_bucket(ships_here)

            systems_out.append(entry)

        return {
            "lrs_gw": lrs_gw,
            "systems": systems_out,
            "thresholds": [LRS_TIER1, LRS_TIER2, LRS_TIER3,
                           LRS_TIER4, LRS_TIER5, LRS_TIER6],
        }

    def seed_npc_ships(self, system_id: str) -> None:
        """Spawn a handful of NPC ships in the starting system at game start."""
        self.npc_ships = []
        self._next_npc_ship_id = 1
        current = self.galaxy.get_system(system_id) if self.galaxy else None
        max_au  = current.max_orbital_distance_au if current else 15.0
        count   = random.randint(NPC_SHIPS_PER_SYSTEM_MIN, NPC_SHIPS_PER_SYSTEM_MAX)
        for _ in range(count):
            race  = random.choice(NPC_RACES)
            size  = random.choice(NPC_SHIP_SIZES)
            angle = random.uniform(0, math.pi * 2)
            dist  = random.uniform(max_au * 0.05, max_au * 0.85)
            idx   = self._next_npc_ship_id
            self.npc_ships.append({
                "id":          f"npc_{idx}",
                "name":        f"{race} Vessel {idx}",
                "race":        race,
                "size":        size,
                "hull_health": round(random.uniform(55.0, 100.0), 1),
                "position":    {
                    "x": round(dist * math.cos(angle), 4),
                    "y": 0.0,
                    "z": round(dist * math.sin(angle), 4),
                },
                "system_id":   system_id,
            })
            self._next_npc_ship_id += 1

    def _get_scan_data(self) -> dict:
        """Compute scan tier data for all objects in the current system.
        signal = scan_gw / distance_au  (min distance = 0.05 AU).
        Planets use SCAN_PLANET_TIER thresholds; NPC ships use SCAN_SHIP_TIER thresholds.
        Planets are always visible on radar (we know they exist); NPC ships only
        appear when signal >= SCAN_SHIP_TIER1 (1.0).
        """
        ship   = self.ship
        current = self.galaxy.get_system(ship.current_system_id)
        scan_gw = ship.short_range_scan_gw()

        def _signal(pos: dict) -> float:
            dx   = ship.position["x"] - pos["x"]
            dz   = ship.position["z"] - pos.get("z", 0.0)
            dist = max(0.05, math.sqrt(dx * dx + dz * dz))
            return round(scan_gw / dist, 3) if scan_gw > 0 else 0.0

        def _planet_tier(sig: float) -> int:
            if sig >= SCAN_PLANET_TIER4: return 4
            if sig >= SCAN_PLANET_TIER3: return 3
            if sig >= SCAN_PLANET_TIER2: return 2
            if sig >= SCAN_PLANET_TIER1: return 1
            return 0

        def _ship_tier(sig: float) -> int:
            if sig >= SCAN_SHIP_TIER4: return 4
            if sig >= SCAN_SHIP_TIER3: return 3
            if sig >= SCAN_SHIP_TIER2: return 2
            if sig >= SCAN_SHIP_TIER1: return 1
            return 0

        def _bucket(v: float) -> str:
            if v < 20: return "trace"
            if v < 40: return "low"
            if v < 60: return "moderate"
            if v < 80: return "high"
            return "rich"

        # ── Planets ───────────────────────────────────────────────────────────
        scanned_planets: list = []
        if current:
            for planet in current.planets:
                pos = planet.position
                # If orbiting this planet, use orbit_radius as distance
                if ship.orbiting_planet_id == planet.id:
                    dist_au = max(0.05, ship.orbit_radius_au)
                    sig     = round(scan_gw / dist_au, 3) if scan_gw > 0 else 0.0
                else:
                    dx  = ship.position["x"] - pos["x"]
                    dz  = ship.position["z"] - pos.get("z", 0.0)
                    dist_au = max(0.05, math.sqrt(dx * dx + dz * dz))
                    sig = round(scan_gw / dist_au, 3) if scan_gw > 0 else 0.0

                tier = _planet_tier(sig)
                entry: dict = {
                    "id":          planet.id,
                    "kind":        "planet",
                    "distance_au": round(dist_au, 3),
                    "signal":      sig,
                    "tier":        tier,
                    "position":    pos,
                    "orbiting":    ship.orbiting_planet_id == planet.id,
                }
                if tier >= 1:
                    entry["name"]   = planet.name
                    entry["type"]   = planet.type
                    entry["moons"]  = len(planet.moons)
                if tier >= 2:
                    entry["inhabited"] = planet.inhabited
                if tier >= 3:
                    entry["resources_approx"] = {
                        "metals":       _bucket(planet.metals),
                        "rare_earth":   _bucket(planet.rare_earth),
                        "radioactive":  _bucket(planet.radioactive),
                        "hydrocarbons": _bucket(planet.hydrocarbons),
                    }
                    entry["hostility_approx"] = _bucket(planet.total_hostility)
                if tier >= 4:
                    entry["resources"] = {
                        "metals":       round(planet.metals, 1),
                        "rare_earth":   round(planet.rare_earth, 1),
                        "radioactive":  round(planet.radioactive, 1),
                        "hydrocarbons": round(planet.hydrocarbons, 1),
                    }
                    entry["hostility"] = round(planet.total_hostility, 1)
                scanned_planets.append(entry)

        # ── NPC ships ─────────────────────────────────────────────────────────
        scanned_ships: list = []
        for npc in self.npc_ships:
            if npc["system_id"] != ship.current_system_id:
                continue
            sig  = _signal(npc["position"])
            tier = _ship_tier(sig)
            if tier < 1:
                continue   # below detection threshold — not visible on radar
            dx      = ship.position["x"] - npc["position"]["x"]
            dz      = ship.position["z"] - npc["position"].get("z", 0.0)
            dist_au = max(0.05, math.sqrt(dx * dx + dz * dz))
            entry = {
                "id":          npc["id"],
                "kind":        "npc_ship",
                "distance_au": round(dist_au, 3),
                "signal":      sig,
                "tier":        tier,
                "position":    npc["position"],
            }
            if tier >= 2:
                entry["size"] = npc["size"]
            if tier >= 3:
                entry["race"] = npc["race"]
                entry["name"] = npc["name"]
            if tier >= 4:
                entry["hull_health"] = round(npc["hull_health"], 1)
            scanned_ships.append(entry)

        sys_info = None
        if current:
            sys_info = {
                "id":                    current.id,
                "name":                  current.name,
                "star_type":             current.star_type,
                "star_color":            current.star_color,
                "max_orbital_distance_au": current.max_orbital_distance_au,
            }

        return {
            "scan_gw":   scan_gw,
            "planets":   scanned_planets,
            "npc_ships": scanned_ships,
            "system":    sys_info,
            "thresholds": {
                "planet": [SCAN_PLANET_TIER1, SCAN_PLANET_TIER2,
                           SCAN_PLANET_TIER3, SCAN_PLANET_TIER4],
                "ship":   [SCAN_SHIP_TIER1, SCAN_SHIP_TIER2,
                           SCAN_SHIP_TIER3, SCAN_SHIP_TIER4],
            },
        }

    def seed_initial_messages(self) -> None:
        """Called once after a new game starts. Seeds 2-3 inbox messages from
        inhabited planet NPCs so the player has mail from the start.
        """
        self.messages = []
        self._next_msg_id = 1

        # Collect all inhabited planets regardless of range, sorted nearest first
        seeding_contacts: list = []
        for system in self.galaxy.systems:
            same = system.id == self.ship.current_system_id
            dist = 0.0 if same else self.galaxy.distance_ly(
                self.ship.current_system_id, system.id)
            for planet in system.planets:
                if not planet.inhabited:
                    continue
                color = _PLANET_VIDEO_COLORS.get(planet.type, _DEFAULT_VIDEO_COLOR)
                prefix = _CONTACT_NAME_PREFIXES.get(planet.type, _DEFAULT_NAME_PREFIX)
                seeding_contacts.append({
                    "id":    f"planet_{planet.id}",
                    "name":  f"{prefix} {planet.name}",
                    "color": color,
                    "dist":  dist,
                    "same":  same,
                })
        seeding_contacts.sort(key=lambda c: (0 if c["same"] else 1, c["dist"]))

        _SEED_MSGS = [
            (
                "Hailing Frequencies Open",
                "This is an automated greeting broadcast from our settlement.\n\n"
                "Safe travels, navigator. Our colony is open to trade and resource exchange "
                "for vessels operating in our vicinity. If your vessel has transport capacity, "
                "we are interested in coordinating supply routes.\n\n"
                "Respond on this frequency when available.\n\n— Settlement Operations",
            ),
            (
                "Trade Route Inquiry",
                "We have surplus hydrocarbons and rare earth minerals available for transfer.\n\n"
                "Our stockpile has exceeded local demand and we are seeking vessels with "
                "cargo transport capability. We can offer competitive resource exchange.\n\n"
                "Are you currently equipped for transport operations? Please transmit your "
                "fleet capacity and preferred exchange terms.\n\n— Trade Coordinator",
            ),
            (
                "Alert: Operations Notice",
                "PRIORITY: STANDARD\n\n"
                "Mining operations in this sector have been disrupted due to equipment "
                "shortages. We are actively seeking transport vessels to assist with "
                "material resupply.\n\n"
                "Required: metals, rare earth components (to manufacturing bay).\n"
                "Compensation: hydrocarbons, processed fuel.\n\n"
                "Please advise your estimated transit capability.\n\n— Operations Director",
            ),
        ]

        for i, contact in enumerate(seeding_contacts[:3]):
            if i < len(_SEED_MSGS):
                subj, body = _SEED_MSGS[i]
                self._make_message(
                    from_id=contact["id"],
                    from_name=contact["name"],
                    to_id="player",
                    to_name="TSC Prometheus",
                    subject=subj,
                    body=body,
                    direction="inbox",
                    has_video=True,
                    video_color=contact["color"],
                )

    def _get_targeting_contacts(self) -> list:
        """NPC ships in the same system within weapons targeting range."""
        if not self.is_started():
            return []
        ship = self.ship
        t_range = ship.targeting_range_au()
        contacts = []
        for npc in self.npc_ships:
            if npc["system_id"] != ship.current_system_id:
                continue
            dx = ship.position["x"] - npc["position"]["x"]
            dz = ship.position["z"] - npc["position"].get("z", 0.0)
            dist_au = round(math.sqrt(dx * dx + dz * dz), 3)
            if dist_au <= t_range:
                contacts.append({
                    "id":          npc["id"],
                    "name":        npc.get("name", npc["id"]),
                    "race":        npc.get("race", "Unknown"),
                    "size":        npc.get("size", "unknown"),
                    "hull_health": round(npc.get("hull_health", 100.0), 1),
                    "distance_au": dist_au,
                    "position":    npc["position"],
                })
        contacts.sort(key=lambda c: c["distance_au"])
        return contacts

    def to_dict(self) -> dict:
        if not self.is_started():
            return {"type": "state", "status": "not_started", "tick": self.tick}

        current_system = self.galaxy.get_system(self.ship.current_system_id)
        contacts  = self._get_comms_contacts()
        scan      = self._get_scan_data()
        lrs       = self._get_long_range_scan_data()
        targeting = self._get_targeting_contacts()
        return {
            "type": "state",
            "status": "running",
            "tick": self.tick,
            "ship": self.ship.to_dict(),
            "current_system": current_system.to_dict() if current_system else None,
            "galaxy_systems": [s.to_summary_dict() for s in self.galaxy.systems],
            "comms": {
                "comms_gw":  round(self.ship.comms_gw(), 2),
                "range_ly":  round(self.ship.comms_range_ly(), 2),
                "messages":  self.messages,
                "contacts":  contacts,
            },
            "short_range_scan": scan,
            "long_range_scan":  lrs,
            "dynamic_objects":  self.dynamic_objects,
            "targeting_contacts": targeting,
        }


# Module-level singletons — imported everywhere
game_state = GameState()
manager    = ConnectionManager()
