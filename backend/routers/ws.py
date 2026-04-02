"""WebSocket endpoint — real-time bidirectional comms with tablet stations."""
import json
import math
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from game.state import game_state, manager
from game.vector3 import normalize
from game.constants import WARP_COST_BASE, WARP_COST_EXPONENT

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send current state immediately on connect
        await ws.send_text(json.dumps(game_state.to_dict()))
        while True:
            raw = await ws.receive_text()
            await _handle_command(ws, json.loads(raw))
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        manager.disconnect(ws)


async def _handle_command(ws: WebSocket, cmd: dict) -> None:
    """Dispatch inbound command from a tablet station."""
    if not game_state.running or not game_state.is_started():
        await ws.send_text(json.dumps({"type": "error", "detail": "Game not running"}))
        return

    cmd_type = cmd.get("type")

    if cmd_type == "set_thrust":
        value = max(0.0, min(1.0, float(cmd.get("value", 0.0))))
        game_state.ship.thrust = value
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_thrust", "value": value}))

    elif cmd_type == "set_target_direction":
        raw = {"x": float(cmd.get("x", 0)), "y": float(cmd.get("y", 0)), "z": float(cmd.get("z", 1))}
        game_state.ship.target_direction = normalize(raw)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_target_direction",
                                       "target_direction": game_state.ship.target_direction}))

    elif cmd_type == "stop":
        game_state.ship.thrust = 0.0
        await ws.send_text(json.dumps({"type": "ack", "cmd": "stop"}))

    elif cmd_type == "warp":
        system_id = cmd.get("system_id")
        target = game_state.galaxy.get_system(system_id) if system_id else None
        if not target:
            await ws.send_text(json.dumps({"type": "error", "detail": "System not found"}))
            return
        if target.id == game_state.ship.current_system_id:
            await ws.send_text(json.dumps({"type": "error", "detail": "Already in that system"}))
            return
        if game_state.ship.system_health.get("warp_drive", 100.0) <= 0:
            await ws.send_text(json.dumps({"type": "error", "detail": "Warp drive non-functional"}))
            return
        dist_ly = game_state.galaxy.distance_ly(game_state.ship.current_system_id, target.id)
        cost_gw = WARP_COST_BASE * (dist_ly ** WARP_COST_EXPONENT)
        if game_state.ship.warp_capacitor_gw < cost_gw:
            await ws.send_text(json.dumps({
                "type": "error",
                "detail": f"Insufficient warp charge ({game_state.ship.warp_capacitor_gw:,.0f} GW, need {cost_gw:,.0f} GW for {dist_ly:.1f} LY)"
            }))
            return
        game_state.ship.warp_capacitor_gw -= cost_gw
        game_state.ship.warp_to(target.id, target.max_orbital_distance_au)
        target.visited = True
        await ws.send_text(json.dumps({"type": "ack", "cmd": "warp", "destination": target.name, "cost_gw": round(cost_gw), "dist_ly": round(dist_ly, 1)}))

    elif cmd_type == "orbit":
        planet_id = cmd.get("planet_id")
        current_system = game_state.galaxy.get_system(game_state.ship.current_system_id)
        planet = current_system.get_planet(planet_id) if current_system else None
        if not planet:
            await ws.send_text(json.dumps({"type": "error", "detail": "Planet not found"}))
            return
        ship = game_state.ship
        dx = ship.position["x"] - planet.position["x"]
        dz = ship.position["z"] - planet.position.get("z", 0.0)
        if math.sqrt(dx ** 2 + dz ** 2) > 0.5:
            await ws.send_text(json.dumps({"type": "error", "detail": "Too far to orbit (must be within 0.5 AU)"}))
            return
        ship.orbit_planet(planet_id, planet.position)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "orbit", "planet": planet.name}))

    elif cmd_type == "leave_orbit":
        game_state.ship.leave_orbit()
        await ws.send_text(json.dumps({"type": "ack", "cmd": "leave_orbit"}))

    elif cmd_type == "set_mining_bots":
        from game.constants import MINING_BOTS_MAX
        if not game_state.ship.orbiting_planet_id:
            await ws.send_text(json.dumps({"type": "error", "detail": "Not in orbit"}))
            return
        resource = cmd.get("resource")
        if resource not in ("metals", "rare_earth", "radioactive", "hydrocarbons"):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid resource"}))
            return
        value = max(0, min(MINING_BOTS_MAX, int(cmd.get("value", 0))))
        game_state.ship.mining_bots[resource] = value
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_mining_bots", "resource": resource, "value": value}))

    elif cmd_type == "set_reactor_output":
        from game.ship import SYSTEM_HEALTH_KEYS
        reactor = cmd.get("reactor")
        if reactor not in ("reactor_1_fuel", "reactor_2_fuel", "reactor_3_rad", "reactor_4_rad"):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid reactor key"}))
            return
        if game_state.ship.reactor_shutdown.get(reactor, False):
            await ws.send_text(json.dumps({"type": "error", "detail": "Reactor is in meltdown shutdown — wait for it to cool completely"}))
            return
        value = max(0.0, min(1.0, float(cmd.get("value", 1.0))))
        game_state.ship.reactor_outputs[reactor] = value
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_reactor_output", "reactor": reactor, "value": value}))

    elif cmd_type == "set_engine_output":
        _VALID_ENGINES = {"engine_1_electric", "engine_2_electric", "engine_3_fuel", "engine_4_fuel"}
        engine_key = cmd.get("engine")
        if engine_key not in _VALID_ENGINES:
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid engine key"}))
            return
        value = max(0.0, min(1.0, float(cmd.get("value", 0.0))))
        game_state.ship.engine_outputs[engine_key] = value
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_engine_output",
                                       "engine": engine_key, "value": value}))

    elif cmd_type == "set_power_allocation":
        SUM_KEYS = {
            "engines", "warp_drive", "shields", "weapons",
            "short_range_scanner", "long_range_scanner", "comms",
            "life_support", "general_systems", "manufacturing", "repairs",
        }
        ALL_KEYS = SUM_KEYS | {"battery"}
        allocations = cmd.get("allocations", {})
        if not isinstance(allocations, dict) or not ALL_KEYS.issubset(allocations.keys()):
            await ws.send_text(json.dumps({"type": "error", "detail": "allocations must include all 12 keys"}))
            return
        # Validate ranges: battery -100..100, all others 0..100
        try:
            for k, v in allocations.items():
                v = float(v)
                if k == "battery":
                    allocations[k] = max(-100.0, min(100.0, v))
                else:
                    allocations[k] = max(0.0, min(100.0, v))
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid allocation values"}))
            return
        # Preserve GW-locked and %-locked stations — client cannot override them
        for k in ALL_KEYS:
            if (game_state.ship.power_allocation_gw_targets.get(k) is not None or
                    game_state.ship.power_allocation_locked.get(k, False)):
                allocations[k] = game_state.ship.power_allocation[k]

        # Enforce sum of SUM_KEYS == 100 (battery is outside the sum)
        locked_keys = {
            k for k in SUM_KEYS
            if game_state.ship.power_allocation_gw_targets.get(k) is not None
            or game_state.ship.power_allocation_locked.get(k, False)
        }
        free_keys  = [k for k in SUM_KEYS if k not in locked_keys]
        locked_sum = sum(allocations[k] for k in locked_keys)
        free_sum   = sum(allocations[k] for k in free_keys)
        target     = 100.0 - locked_sum
        if free_keys and abs(free_sum - target) > 0.1:
            scale = target / free_sum if abs(free_sum) > 0.001 else None
            for k in free_keys:
                if scale is not None:
                    allocations[k] = max(0.0, round(allocations[k] * scale, 4))
                else:
                    allocations[k] = max(0.0, round(target / len(free_keys), 4))

        game_state.ship.power_allocation.update(allocations)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_power_allocation"}))

    elif cmd_type == "toggle_power_lock":
        station = cmd.get("station")
        if station == "life_support":
            await ws.send_text(json.dumps({"type": "error", "detail": "Life support lock cannot be toggled"}))
            return
        if station not in game_state.ship.power_allocation_locked:
            await ws.send_text(json.dumps({"type": "error", "detail": "Unknown station"}))
            return
        # Toggling % lock clears any GW lock on the same station (mutually exclusive)
        game_state.ship.power_allocation_gw_targets[station] = None
        game_state.ship.power_allocation_locked[station] = not game_state.ship.power_allocation_locked[station]
        await ws.send_text(json.dumps({"type": "ack", "cmd": "toggle_power_lock", "station": station,
                                       "locked": game_state.ship.power_allocation_locked[station]}))

    elif cmd_type == "set_gw_lock":
        station = cmd.get("station")
        if station not in game_state.ship.power_allocation_gw_targets:
            await ws.send_text(json.dumps({"type": "error", "detail": "Unknown station"}))
            return
        gw_raw = cmd.get("gw_target")
        if gw_raw is None:
            if station == "life_support":
                # Life support cannot be fully unlocked — re-clamp to minimum
                gw_raw = game_state.ship.life_support_min_gw()
            else:
                game_state.ship.power_allocation_gw_targets[station] = None
                await ws.send_text(json.dumps({"type": "ack", "cmd": "set_gw_lock", "station": station, "gw_target": None}))
                return
        try:
            gw_target = float(gw_raw)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "gw_target must be a number or null"}))
            return
        if gw_target < 0:
            await ws.send_text(json.dumps({"type": "error", "detail": "gw_target must be >= 0"}))
            return
        # Life support has a floor — never allow setting below the minimum
        if station == "life_support":
            gw_target = max(game_state.ship.life_support_min_gw(), gw_target)
        # Setting GW lock clears the % lock for that station (mutually exclusive)
        game_state.ship.power_allocation_locked[station] = False
        game_state.ship.power_allocation_gw_targets[station] = round(gw_target, 2)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_gw_lock", "station": station,
                                       "gw_target": game_state.ship.power_allocation_gw_targets[station]}))

    elif cmd_type == "ping":
        await ws.send_text(json.dumps({"type": "pong"}))

    else:
        await ws.send_text(json.dumps({"type": "error", "detail": f"Unknown command: {cmd_type}"}))
