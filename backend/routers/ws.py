"""WebSocket endpoint — real-time bidirectional comms with tablet stations."""
import json
import math
from typing import Optional
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

    elif cmd_type == "transport_items":
        source = cmd.get("source")
        dest   = cmd.get("dest")
        item   = cmd.get("item")
        amount = cmd.get("amount", 0)
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "amount must be a number"}))
            return
        # Resolve planet stockpile if source is "planet"
        planet_stockpile = None
        if source == "planet":
            if not game_state.ship.orbiting_planet_id:
                await ws.send_text(json.dumps({"type": "error", "detail": "Not orbiting a planet"}))
                return
            current_system = game_state.galaxy.get_system(game_state.ship.current_system_id)
            planet = current_system.get_planet(game_state.ship.orbiting_planet_id) if current_system else None
            if not planet:
                await ws.send_text(json.dumps({"type": "error", "detail": "Orbited planet not found"}))
                return
            planet_stockpile = planet.stockpile
        bot_id = cmd.get("bot_id")  # optional — auto-picks idle bot if omitted
        if bot_id is not None:
            try:
                bot_id = int(bot_id)
            except (TypeError, ValueError):
                bot_id = None
        trips_raw = cmd.get("trips", 1)   # 1 = one trip, null = infinite
        trips_remaining: Optional[int] = None if trips_raw is None else int(trips_raw)
        ok, msg, bot = game_state.ship.queue_transport(source, dest, item, amount, bot_id, planet_stockpile, trips_remaining)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "transport_items", "detail": msg, "bot": bot}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "cancel_transport":
        bot_id = cmd.get("bot_id")
        if bot_id is None:
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id required"}))
            return
        try:
            bot_id = int(bot_id)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id must be an integer"}))
            return
        ok, msg = game_state.ship.cancel_transport(bot_id)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "cancel_transport", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "charge_transport":
        bot_id = cmd.get("bot_id")
        if bot_id is None:
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id required"}))
            return
        try:
            bot_id = int(bot_id)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id must be an integer"}))
            return
        ok, msg = game_state.ship.charge_transport(bot_id)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "charge_transport", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "build_transport_bot":
        ok, msg = game_state.ship.build_transport_bot()
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "build_transport_bot", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "repair_transport_bot":
        bot_id = cmd.get("bot_id")
        amount = cmd.get("amount", 10)
        if bot_id is None:
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id required"}))
            return
        try:
            bot_id = int(bot_id)
            amount = float(amount)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "invalid bot_id or amount"}))
            return
        ok, msg = game_state.ship.repair_transport_bot(bot_id, amount)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "repair_transport_bot", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "set_manufacturing_alloc":
        item = cmd.get("item")
        pct  = cmd.get("pct", 0)
        try:
            pct = float(pct)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "pct must be a number"}))
            return
        if item not in game_state.ship.manufacturing_alloc:
            await ws.send_text(json.dumps({"type": "error", "detail": f"Unknown manufacturing item: {item}"}))
            return
        game_state.ship.manufacturing_alloc[item] = round(max(0.0, min(100.0, pct)), 1)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_manufacturing_alloc",
                                       "item": item, "pct": game_state.ship.manufacturing_alloc[item]}))

    elif cmd_type == "send_message":
        to_id   = cmd.get("to_id", "").strip()
        subject = cmd.get("subject", "").strip()[:200]
        body    = cmd.get("body", "").strip()[:2000]
        if not to_id:
            await ws.send_text(json.dumps({"type": "error", "detail": "to_id required"}))
            return
        if not subject:
            await ws.send_text(json.dumps({"type": "error", "detail": "subject required"}))
            return
        if not body:
            await ws.send_text(json.dumps({"type": "error", "detail": "body required"}))
            return
        contacts = game_state._get_comms_contacts()
        contact  = next((c for c in contacts if c["id"] == to_id), None)
        if not contact:
            await ws.send_text(json.dumps({"type": "error", "detail": "Recipient not found"}))
            return
        if not contact["in_range"]:
            rng = round(game_state.ship.comms_range_ly(), 1)
            await ws.send_text(json.dumps({
                "type": "error",
                "detail": f"Out of range — {contact['distance_ly']} LY away, current range {rng} LY",
            }))
            return
        msg = game_state._make_message(
            from_id="player",
            from_name="TSC Prometheus",
            to_id=to_id,
            to_name=contact["name"],
            subject=subject,
            body=body,
            direction="sent",
            has_video=False,
            video_color=contact["video_color"],
        )
        await ws.send_text(json.dumps({"type": "ack", "cmd": "send_message", "message": msg}))

    elif cmd_type == "mark_read":
        msg_id = cmd.get("message_id", "")
        for msg in game_state.messages:
            if msg["id"] == msg_id:
                msg["read"] = True
                await ws.send_text(json.dumps({"type": "ack", "cmd": "mark_read"}))
                return
        await ws.send_text(json.dumps({"type": "error", "detail": "Message not found"}))

    elif cmd_type == "dispatch_repair_bot":
        bot_id = cmd.get("bot_id")
        target = cmd.get("target")
        if bot_id is None or not isinstance(target, dict):
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id and target required"}))
            return
        try:
            bot_id = int(bot_id)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id must be an integer"}))
            return
        ok, msg = game_state.ship.dispatch_repair_bot(bot_id, target)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "dispatch_repair_bot", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "recall_repair_bot":
        bot_id = cmd.get("bot_id")
        if bot_id is None:
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id required"}))
            return
        try:
            bot_id = int(bot_id)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "bot_id must be an integer"}))
            return
        ok, msg = game_state.ship.recall_repair_bot(bot_id)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "recall_repair_bot", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "install_component":
        section = cmd.get("section", "")
        role    = cmd.get("role", "")
        station = cmd.get("station", "")
        ok, msg = game_state.ship.install_component(section, role, station)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "install_component", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "uninstall_component":
        section      = cmd.get("section", "")
        role         = cmd.get("role", "")
        component_id = cmd.get("component_id")
        if component_id is None:
            await ws.send_text(json.dumps({"type": "error", "detail": "component_id required"}))
            return
        try:
            component_id = int(component_id)
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "component_id must be an integer"}))
            return
        ok, msg = game_state.ship.uninstall_component(section, role, component_id)
        if ok:
            await ws.send_text(json.dumps({"type": "ack", "cmd": "uninstall_component", "detail": msg}))
        else:
            await ws.send_text(json.dumps({"type": "error", "detail": msg}))

    elif cmd_type == "set_shields_section_alloc":
        # alloc: {front, back, port, starboard, above, below} — values normalized server-side
        alloc = cmd.get("alloc", {})
        _SIDES = {"front", "back", "port", "starboard", "above", "below"}
        if not isinstance(alloc, dict) or not _SIDES.issubset(alloc.keys()):
            await ws.send_text(json.dumps({"type": "error", "detail": "alloc must include all 6 sides"}))
            return
        try:
            vals = {k: max(0.0, float(alloc[k])) for k in _SIDES}
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid alloc values"}))
            return
        total = sum(vals.values())
        if total > 0:
            vals = {k: round(v / total * 100.0, 4) for k, v in vals.items()}
        game_state.ship.shields_section_alloc.update(vals)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_shields_section_alloc"}))

    elif cmd_type == "set_shields_component_alloc":
        section      = cmd.get("section", "")
        alloc        = cmd.get("alloc", {})  # {str(comp_id): weight}
        if section not in {"front", "back", "port", "starboard", "above", "below"}:
            await ws.send_text(json.dumps({"type": "error", "detail": "Unknown section"}))
            return
        if not isinstance(alloc, dict):
            await ws.send_text(json.dumps({"type": "error", "detail": "alloc must be an object"}))
            return
        try:
            cleaned = {str(k): max(0.0, float(v)) for k, v in alloc.items()}
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid alloc values"}))
            return
        game_state.ship.shields_component_alloc[section] = cleaned
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_shields_component_alloc", "section": section}))

    elif cmd_type == "set_weapons_alloc":
        # targeting_pct: 0-100; section_alloc: {front,...} — normalized
        targeting_pct = cmd.get("targeting_pct")
        section_alloc = cmd.get("section_alloc", {})
        ship = game_state.ship
        if targeting_pct is not None:
            try:
                ship.weapons_targeting_pct = max(0.0, min(100.0, float(targeting_pct)))
            except (TypeError, ValueError):
                await ws.send_text(json.dumps({"type": "error", "detail": "Invalid targeting_pct"}))
                return
        if section_alloc:
            _SIDES = {"front", "back", "port", "starboard", "above", "below"}
            if not isinstance(section_alloc, dict) or not _SIDES.issubset(section_alloc.keys()):
                await ws.send_text(json.dumps({"type": "error", "detail": "section_alloc must include all 6 sides"}))
                return
            try:
                vals = {k: max(0.0, float(section_alloc[k])) for k in _SIDES}
            except (TypeError, ValueError):
                await ws.send_text(json.dumps({"type": "error", "detail": "Invalid section_alloc values"}))
                return
            total = sum(vals.values())
            if total > 0:
                vals = {k: round(v / total * 100.0, 4) for k, v in vals.items()}
            ship.weapons_section_alloc.update(vals)
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_weapons_alloc"}))

    elif cmd_type == "set_weapons_component_alloc":
        section      = cmd.get("section", "")
        alloc        = cmd.get("alloc", {})  # {str(comp_id): weight}
        if section not in {"front", "back", "port", "starboard", "above", "below"}:
            await ws.send_text(json.dumps({"type": "error", "detail": "Unknown section"}))
            return
        if not isinstance(alloc, dict):
            await ws.send_text(json.dumps({"type": "error", "detail": "alloc must be an object"}))
            return
        try:
            cleaned = {str(k): max(0.0, float(v)) for k, v in alloc.items()}
        except (TypeError, ValueError):
            await ws.send_text(json.dumps({"type": "error", "detail": "Invalid alloc values"}))
            return
        game_state.ship.weapons_component_alloc[section] = cleaned
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_weapons_component_alloc", "section": section}))

    elif cmd_type == "set_weapons_target":
        target_id = cmd.get("target_id")  # None = clear lock
        if target_id is not None and not isinstance(target_id, str):
            target_id = str(target_id)
        # Validate target exists if setting
        if target_id is not None:
            npc = next((n for n in game_state.npc_ships if n["id"] == target_id), None)
            if not npc:
                await ws.send_text(json.dumps({"type": "error", "detail": "Target not found"}))
                return
        game_state.ship.weapons_locked_target_id = target_id
        await ws.send_text(json.dumps({"type": "ack", "cmd": "set_weapons_target", "target_id": target_id}))

    elif cmd_type == "fire_missile":
        target_id = cmd.get("target_id", "")
        if not isinstance(target_id, str) or not target_id:
            await ws.send_text(json.dumps({"type": "error", "detail": "target_id required"}))
            return
        npc = next((n for n in game_state.npc_ships if n["id"] == target_id), None)
        if not npc:
            await ws.send_text(json.dumps({"type": "error", "detail": "Target NPC not found"}))
            return
        if npc["system_id"] != game_state.ship.current_system_id:
            await ws.send_text(json.dumps({"type": "error", "detail": "Target not in current system"}))
            return
        weapons_room = game_state.ship.rooms.get("weapons_room", {})
        if weapons_room.get("missiles", 0) < 1:
            await ws.send_text(json.dumps({"type": "error", "detail": "No missiles in weapons room"}))
            return
        # Deduct missile, launch entity
        weapons_room["missiles"] = max(0, weapons_room["missiles"] - 1)
        sp = game_state.ship.position
        tp = npc["position"]
        dx = tp["x"] - sp["x"]
        dz = tp.get("z", 0.0) - sp["z"]
        d = max(math.sqrt(dx * dx + dz * dz), 1e-9)
        from game.constants import MISSILE_SPEED_AU, MISSILE_HEALTH
        game_state.dynamic_objects.append({
            "id":           f"obj_{game_state._next_obj_id}",
            "type":         "player_missile",
            "position":     {"x": round(sp["x"], 4), "y": 0.0, "z": round(sp["z"], 4)},
            "velocity":     {"x": round((dx/d)*MISSILE_SPEED_AU, 6), "y": 0.0, "z": round((dz/d)*MISSILE_SPEED_AU, 6)},
            "health":       MISSILE_HEALTH,
            "max_health":   MISSILE_HEALTH,
            "target_npc_id": target_id,
            "from_sides":   None,
            "vert_side":    None,
        })
        game_state._next_obj_id += 1
        await ws.send_text(json.dumps({"type": "ack", "cmd": "fire_missile",
                                       "detail": f"Missile launched at {npc.get('name', target_id)}"}))

    else:
        await ws.send_text(json.dumps({"type": "error", "detail": f"Unknown command: {cmd_type}"}))
