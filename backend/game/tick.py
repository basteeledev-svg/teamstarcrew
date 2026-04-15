"""Main game loop — runs as a background asyncio task."""
import asyncio
import math
import random

from .constants import (
    TICK_RATE_SECONDS,
    METEOR_SPAWN_CHANCE, METEOR_SPAWN_RADIUS_AU, METEOR_SIZES,
    METEOR_HEALTH_MAP, METEOR_SPEED_MAP, METEOR_DAMAGE_MAP, METEOR_HIT_RADIUS_AU,
    MISSILE_SPEED_AU, MISSILE_HIT_RADIUS_AU, MISSILE_BASE_DAMAGE,
    SECTION_SIDES,
)
from .state import game_state, manager


# ── Combat geometry helpers ────────────────────────────────────────────────────

def _compute_sides(ship_direction: dict, dx: float, dz: float) -> list:
    """Determine which hull sides a threat comes from based on relative position.
    dx/dz is (threat_pos - ship_pos).  Returns list of 1–2 horizontal side names.
    """
    fwd_x, fwd_z   = ship_direction["x"], ship_direction["z"]
    # Right-hand side = 90° CW from forward in XZ plane
    right_x, right_z = fwd_z, -fwd_x
    dist = max(math.sqrt(dx * dx + dz * dz), 1e-9)
    fwd_frac   = (dx * fwd_x + dz * fwd_z) / dist
    right_frac = (dx * right_x + dz * right_z) / dist

    sides = []
    if abs(fwd_frac) >= 0.5:
        sides.append("front" if fwd_frac > 0 else "back")
    if abs(right_frac) >= 0.5:
        sides.append("starboard" if right_frac > 0 else "port")
    return sides if sides else ("front" if fwd_frac >= 0 else ["back"])


def _spawn_meteor(gs) -> None:
    ship = gs.ship
    size = random.choice(METEOR_SIZES)
    angle = random.uniform(0, math.pi * 2)
    sx = ship.position["x"] + METEOR_SPAWN_RADIUS_AU * math.cos(angle)
    sz = ship.position["z"] + METEOR_SPAWN_RADIUS_AU * math.sin(angle)
    dx = ship.position["x"] - sx
    dz = ship.position["z"] - sz
    d = max(math.sqrt(dx * dx + dz * dz), 1e-9)
    spd = METEOR_SPEED_MAP[size]
    # Small random offset so meteors don't always go directly at the ship
    vx = (dx / d) * spd + random.uniform(-spd * 0.3, spd * 0.3)
    vz = (dz / d) * spd + random.uniform(-spd * 0.3, spd * 0.3)
    gs.dynamic_objects.append({
        "id":        f"obj_{gs._next_obj_id}",
        "type":      "meteor",
        "size":      size,
        "position":  {"x": round(sx, 4), "y": 0.0, "z": round(sz, 4)},
        "velocity":  {"x": round(vx, 6), "y": 0.0, "z": round(vz, 6)},
        "health":    METEOR_HEALTH_MAP[size],
        "max_health": METEOR_HEALTH_MAP[size],
        "from_sides": None,   # assigned when object enters detection range
        "vert_side":  None,   # "above" or "below" — randomly assigned
    })
    gs._next_obj_id += 1


def update_combat(gs) -> None:
    """Spawn meteors, move dynamic objects, fire lasers, apply hits."""
    if not gs.is_started():
        return
    ship = gs.ship
    ship_pos = ship.position
    ship_dir = ship.direction

    # ── Maybe spawn a meteor ──────────────────────────────────────────────────
    if random.random() < METEOR_SPAWN_CHANCE:
        _spawn_meteor(gs)

    to_remove = []

    for obj in gs.dynamic_objects:
        # ── Move object ───────────────────────────────────────────────────────
        obj["position"]["x"] = round(obj["position"]["x"] + obj["velocity"]["x"], 5)
        obj["position"]["z"] = round(obj["position"]["z"] + obj["velocity"]["z"], 5)

        dx = obj["position"]["x"] - ship_pos["x"]
        dz = obj["position"]["z"] - ship_pos["z"]
        dist = math.sqrt(dx * dx + dz * dz)

        # ── Assign sides on first entry into detection range ──────────────────
        if obj["from_sides"] is None and dist <= METEOR_SPAWN_RADIUS_AU * 1.1:
            obj["from_sides"] = _compute_sides(ship_dir, dx, dz)
            obj["vert_side"]  = random.choice(["above", "below"])

        # ── Defense laser auto-fire ───────────────────────────────────────────
        if obj["from_sides"] is not None:
            all_sides = list(obj["from_sides"]) + (
                [obj["vert_side"]] if obj.get("vert_side") else []
            )
            dps = ship.fire_defense_lasers(obj, all_sides, dist)
            if dps > 0:
                obj["health"] = round(max(0.0, obj["health"] - dps), 3)

        # ── Destroyed? ────────────────────────────────────────────────────────
        if obj["health"] <= 0:
            to_remove.append(obj["id"])
            continue

        # ── Player missile: steer + check hit on NPC ─────────────────────────
        if obj["type"] == "player_missile":
            target_id = obj.get("target_npc_id")
            target_npc = next((n for n in gs.npc_ships if n["id"] == target_id), None)
            if target_npc is None:
                to_remove.append(obj["id"])
                continue
            # Re-steer toward target each tick
            tdx = target_npc["position"]["x"] - obj["position"]["x"]
            tdz = target_npc["position"]["z"] - obj["position"]["z"]
            td = max(math.sqrt(tdx * tdx + tdz * tdz), 1e-9)
            obj["velocity"]["x"] = round((tdx / td) * MISSILE_SPEED_AU, 6)
            obj["velocity"]["z"] = round((tdz / td) * MISSILE_SPEED_AU, 6)
            if td <= MISSILE_HIT_RADIUS_AU:
                # Missile hits NPC — damage proportional to remaining health
                dmg = MISSILE_BASE_DAMAGE * (obj["health"] / 100.0)
                target_npc["hull_health"] = round(max(0.0, target_npc["hull_health"] - dmg), 1)
                if target_npc["hull_health"] <= 0:
                    gs.npc_ships = [n for n in gs.npc_ships if n["id"] != target_id]
                to_remove.append(obj["id"])
            continue

        # ── Offense lasers fire at locked NPC target ──────────────────────────
        locked_id = ship.weapons_locked_target_id
        if locked_id:
            npc = next((n for n in gs.npc_ships if n["id"] == locked_id), None)
            if npc and npc["system_id"] == ship.current_system_id:
                ndx = npc["position"]["x"] - ship_pos["x"]
                ndz = npc["position"]["z"] - ship_pos["z"]
                nd = math.sqrt(ndx * ndx + ndz * ndz)
                if nd <= ship.targeting_range_au():
                    npc_sides = _compute_sides(ship_dir, ndx, ndz) + [random.choice(["above", "below"])]
                    dps = ship.fire_offense_lasers_at(npc_sides, nd)
                    if dps > 0:
                        npc["hull_health"] = round(max(0.0, npc["hull_health"] - dps), 1)
                        if npc["hull_health"] <= 0:
                            gs.npc_ships = [n for n in gs.npc_ships if n["id"] != locked_id]
                            ship.weapons_locked_target_id = None

        # ── Meteor hits ship ──────────────────────────────────────────────────
        if dist <= METEOR_HIT_RADIUS_AU:
            all_sides = list(obj.get("from_sides") or ["front"]) + (
                [obj["vert_side"]] if obj.get("vert_side") else []
            )
            nd = max(math.sqrt(dx * dx + dz * dz), 1e-9)
            fwd_x, fwd_z = ship_dir["x"], ship_dir["z"]
            right_x, right_z = fwd_z, -fwd_x
            fwd_frac   = (dx * fwd_x + dz * fwd_z) / nd
            right_frac = (dx * right_x + dz * right_z) / nd
            base_dmg = METEOR_DAMAGE_MAP.get(obj.get("size", "small"), 10.0)
            ship.apply_hit_damage(base_dmg, all_sides, fwd_frac, right_frac)
            to_remove.append(obj["id"])

    gs.dynamic_objects = [o for o in gs.dynamic_objects if o["id"] not in to_remove]


async def tick_loop() -> None:
    """Runs forever at TICK_RATE_SECONDS intervals.
    Each tick: advance ship, broadcast state to all WebSocket clients."""
    while True:
        await asyncio.sleep(TICK_RATE_SECONDS)
        if game_state.running and game_state.is_started():
            game_state.tick += 1

            # Advance planet orbits in current system first
            current = game_state.galaxy.get_system(game_state.ship.current_system_id)
            if current:
                for planet in current.planets:
                    planet.orbit_tick()

            # Pass the orbited planet's fresh position so the ship tracks it
            ship = game_state.ship
            planet_center = None
            if ship.orbiting_planet_id and current:
                op = current.get_planet(ship.orbiting_planet_id)
                if op:
                    planet_center = op.position

            ship.update_engines()            # compute thrust, consume fuel/power, update warp capacitor
            ship.update_tick(planet_center=planet_center)
            ship.update_reactor_heat()
            ship.consume_reactor_fuel()  # deduct fuel/rad from Power Room, shut off starved reactors
            ship.update_gw_locks()   # recalculate GW-locked station percentages
            ship.update_battery()
            ship.update_transport()   # advance transport bot jobs
            ship.update_repair_bots() # advance repair bot jobs
            ship.update_manufacturing()  # run manufacturing production

            update_combat(game_state)    # meteors, missiles, laser fire, damage

            # Mark system visited on arrival
            if current and not current.visited:
                current.visited = True

            # Mining: if orbiting with any bots deployed, accumulate resources
            if ship.orbiting_planet_id and any(v > 0 for v in ship.mining_bots.values()) and current:
                planet = current.get_planet(ship.orbiting_planet_id)
                if planet:
                    planet.mine_tick(ship.mining_bots)

            await manager.broadcast(game_state.to_dict())
