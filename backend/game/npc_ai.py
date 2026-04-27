"""NPC behavior system — pure-code steering + combat for AI-driven ships.

The LLM "Game Master" sets each NPC's high-level behavior (attack, flee,
follow, patrol, etc.) via the /api/ai/npc/{id}/behavior endpoint. This
module's `update_npcs()` is called from the tick loop and handles the
per-tick steering, weapons, and target tracking — all in code, no LLM in
the per-tick loop.

Each NPC dict may carry these fields (all optional):

    behavior: str   — one of the NpcBehavior values, default "idle"
    target_id: str  — id of another NPC (or "player") to follow/attack/flee
    waypoint: dict  — {"x": float, "z": float} for move_to / patrol
    patrol_points: list[dict] — for patrol
    patrol_index: int
    speed: float    — AU/tick override (default ~0.02)
    weapon_range_au: float — default 3.0
    flee_distance_au: float — default 12.0
    last_behavior_tick: int — set by GM client to throttle reassessment
"""

import math
import random
from typing import Optional

# ── Tunables ─────────────────────────────────────────────────────────────────
NPC_DEFAULT_SPEED_AU       = 0.018   # per tick
NPC_DEFAULT_WEAPON_RANGE   = 3.0     # AU
NPC_DEFAULT_FLEE_DISTANCE  = 12.0    # AU
NPC_WAYPOINT_TOLERANCE     = 0.3     # AU — close enough to "arrived"
NPC_BEHAVIOR_TICK_INTERVAL = 5       # only run NPC steering every N ticks
NPC_LASER_DPS_AT_RANGE     = 0.5     # NPC offensive damage per tick at point-blank
NPC_LASER_DAMAGE_TO_PLAYER = 0.6     # multiplier when shooting the player ship


VALID_BEHAVIORS = {
    "idle",         # do nothing
    "patrol",       # cycle through patrol_points
    "follow",       # stay near target_id at ~weapon_range/2
    "attack",       # close to weapon_range and fire on target_id
    "flee",         # accelerate away from target_id until flee_distance
    "move_to",      # drive to waypoint, then idle
    "intercept",    # like attack but no firing (escort/scare-off)
}


def _vec(dx: float, dz: float) -> tuple[float, float, float]:
    """Return (length, unit_x, unit_z) from a vector."""
    d = math.sqrt(dx * dx + dz * dz)
    if d < 1e-9:
        return 0.0, 0.0, 0.0
    return d, dx / d, dz / d


def _resolve_target(gs, target_id: Optional[str]):
    """Return a target dict-like with .position and .id, or None."""
    if not target_id:
        return None
    if target_id == "player":
        return {
            "id": "player",
            "position": gs.ship.position,
            "system_id": gs.ship.current_system_id,
            "hull_health": gs.ship.hull_health,
        }
    return next((n for n in gs.npc_ships if n["id"] == target_id), None)


def _set_velocity(npc: dict, ux: float, uz: float, speed: float) -> None:
    npc["velocity"]["x"] = round(ux * speed, 6)
    npc["velocity"]["z"] = round(uz * speed, 6)


def _stop(npc: dict) -> None:
    npc["velocity"]["x"] = 0.0
    npc["velocity"]["z"] = 0.0


def _apply_damage_to_player(gs, dmg: float, attacker_pos: dict) -> None:
    """Apply incoming-laser damage to the player ship. We attribute hits to
    a random side based on the attacker's relative bearing — no need to
    duplicate the full hull-side math here.
    """
    ship = gs.ship
    dx = attacker_pos["x"] - ship.position["x"]
    dz = attacker_pos["z"] - ship.position["z"]
    nd = max(math.sqrt(dx * dx + dz * dz), 1e-9)
    fwd_x, fwd_z = ship.direction["x"], ship.direction["z"]
    right_x, right_z = fwd_z, -fwd_x
    fwd_frac   = (dx * fwd_x + dz * fwd_z) / nd
    right_frac = (dx * right_x + dz * right_z) / nd

    sides = []
    if abs(fwd_frac) >= 0.5:
        sides.append("front" if fwd_frac > 0 else "back")
    if abs(right_frac) >= 0.5:
        sides.append("starboard" if right_frac > 0 else "port")
    if not sides:
        sides = ["front" if fwd_frac >= 0 else "back"]
    sides.append(random.choice(["above", "below"]))

    ship.apply_hit_damage(dmg, sides, fwd_frac, right_frac)


# ── Per-behavior handlers ────────────────────────────────────────────────────

def _handle_idle(gs, npc: dict) -> None:
    _stop(npc)


def _handle_move_to(gs, npc: dict) -> None:
    wp = npc.get("waypoint")
    if not wp:
        _stop(npc)
        return
    dx = wp["x"] - npc["position"]["x"]
    dz = wp["z"] - npc["position"]["z"]
    d, ux, uz = _vec(dx, dz)
    if d <= NPC_WAYPOINT_TOLERANCE:
        _stop(npc)
        npc["behavior"] = "idle"
        npc.pop("waypoint", None)
        return
    speed = npc.get("speed") or NPC_DEFAULT_SPEED_AU
    _set_velocity(npc, ux, uz, min(speed, d))


def _handle_patrol(gs, npc: dict) -> None:
    points = npc.get("patrol_points") or []
    if not points:
        _stop(npc)
        return
    idx = npc.get("patrol_index", 0) % len(points)
    target = points[idx]
    dx = target["x"] - npc["position"]["x"]
    dz = target["z"] - npc["position"]["z"]
    d, ux, uz = _vec(dx, dz)
    if d <= NPC_WAYPOINT_TOLERANCE:
        npc["patrol_index"] = (idx + 1) % len(points)
        return
    speed = npc.get("speed") or NPC_DEFAULT_SPEED_AU
    _set_velocity(npc, ux, uz, min(speed, d))


def _handle_follow(gs, npc: dict) -> None:
    tgt = _resolve_target(gs, npc.get("target_id"))
    if tgt is None:
        npc["behavior"] = "idle"
        _stop(npc)
        return
    weapon_range = npc.get("weapon_range_au", NPC_DEFAULT_WEAPON_RANGE)
    follow_dist  = max(weapon_range * 0.5, 1.0)
    dx = tgt["position"]["x"] - npc["position"]["x"]
    dz = tgt["position"]["z"] - npc["position"]["z"]
    d, ux, uz = _vec(dx, dz)
    speed = npc.get("speed") or NPC_DEFAULT_SPEED_AU
    if d <= follow_dist:
        # Close enough — match the target's velocity if known
        if "velocity" in tgt:
            npc["velocity"]["x"] = round(tgt["velocity"]["x"], 6)
            npc["velocity"]["z"] = round(tgt["velocity"]["z"], 6)
        else:
            _stop(npc)
        return
    _set_velocity(npc, ux, uz, min(speed, d - follow_dist))


def _handle_attack(gs, npc: dict, fire: bool = True) -> None:
    tgt = _resolve_target(gs, npc.get("target_id"))
    if tgt is None:
        npc["behavior"] = "idle"
        _stop(npc)
        return
    weapon_range = npc.get("weapon_range_au", NPC_DEFAULT_WEAPON_RANGE)
    dx = tgt["position"]["x"] - npc["position"]["x"]
    dz = tgt["position"]["z"] - npc["position"]["z"]
    d, ux, uz = _vec(dx, dz)
    speed = npc.get("speed") or NPC_DEFAULT_SPEED_AU

    # Stay at ~80% of weapon range (don't crash into target)
    desired = weapon_range * 0.8
    if d > desired:
        _set_velocity(npc, ux, uz, min(speed, d - desired))
    else:
        # Strafe slightly tangentially so we're not a sitting duck
        _set_velocity(npc, -uz, ux, speed * 0.4)

    # Fire if in range and target is the player
    if fire and d <= weapon_range and npc.get("target_id") == "player":
        # NPC laser DPS scales with size
        size_mult = {"small": 0.6, "medium": 1.0, "large": 1.6, "capital": 2.5}.get(
            npc.get("size", "medium"), 1.0
        )
        # Fall-off with distance
        falloff = max(0.3, 1.0 - (d / weapon_range))
        dmg = NPC_LASER_DPS_AT_RANGE * size_mult * falloff * NPC_LASER_DAMAGE_TO_PLAYER
        if dmg > 0.01:
            _apply_damage_to_player(gs, dmg, npc["position"])


def _handle_flee(gs, npc: dict) -> None:
    tgt = _resolve_target(gs, npc.get("target_id"))
    if tgt is None:
        npc["behavior"] = "idle"
        _stop(npc)
        return
    flee_dist = npc.get("flee_distance_au", NPC_DEFAULT_FLEE_DISTANCE)
    dx = npc["position"]["x"] - tgt["position"]["x"]
    dz = npc["position"]["z"] - tgt["position"]["z"]
    d, ux, uz = _vec(dx, dz)
    if d >= flee_dist:
        # Safe — slow down and idle
        _stop(npc)
        npc["behavior"] = "idle"
        return
    speed = npc.get("speed") or NPC_DEFAULT_SPEED_AU
    # Flee at full speed, maintaining a slight zigzag for flavour
    jitter_x = random.uniform(-0.1, 0.1)
    jitter_z = random.uniform(-0.1, 0.1)
    _set_velocity(npc, ux + jitter_x, uz + jitter_z, speed * 1.2)


_HANDLERS = {
    "idle":      _handle_idle,
    "patrol":    _handle_patrol,
    "follow":    _handle_follow,
    "attack":    lambda gs, n: _handle_attack(gs, n, fire=True),
    "intercept": lambda gs, n: _handle_attack(gs, n, fire=False),
    "flee":      _handle_flee,
    "move_to":   _handle_move_to,
}


# ── Tick entry point ─────────────────────────────────────────────────────────

def update_npcs(gs) -> None:
    """Advance NPC positions according to their behaviors. Called every tick.

    Behavior reassessment is throttled to every NPC_BEHAVIOR_TICK_INTERVAL
    ticks (~5 sec) — between reassessments NPCs continue with whatever
    velocity their behavior last produced.
    """
    if not gs.is_started():
        return

    # Always integrate velocity → position (so motion is smooth between
    # behavior re-evaluations).
    for npc in gs.npc_ships:
        v = npc.get("velocity") or {"x": 0.0, "y": 0.0, "z": 0.0}
        npc["velocity"] = v
        npc["position"]["x"] = round(npc["position"]["x"] + v["x"], 5)
        npc["position"]["z"] = round(npc["position"]["z"] + v["z"], 5)

    # Re-evaluate behaviors only every N ticks to save CPU and avoid
    # twitchy motion. NPCs keep their last velocity in between.
    if gs.tick % NPC_BEHAVIOR_TICK_INTERVAL != 0:
        return

    for npc in gs.npc_ships:
        # Only steer NPCs in the player's current system. Out-of-system
        # ships are still tracked in state (and visible via long-range
        # scan) but don't update their behavior between visits.
        if npc.get("system_id") != gs.ship.current_system_id:
            continue
        behavior = npc.get("behavior", "idle")
        handler = _HANDLERS.get(behavior, _handle_idle)
        try:
            handler(gs, npc)
        except Exception as e:
            # Never let a malformed behavior crash the tick loop.
            npc["behavior"] = "idle"
            _stop(npc)
