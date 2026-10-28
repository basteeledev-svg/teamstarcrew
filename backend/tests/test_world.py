"""Gameplay tests: travel, and how the world reacts to what the crew physically does.

Run from backend/:  python -m pytest -q
The tick loop isn't started; tests call advance_tick() directly.
"""
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from game import world  # noqa: E402
from game.state import game_state as gs  # noqa: E402
from game.tick import advance_tick  # noqa: E402

client = TestClient(main.app)   # no `with`: lifespan (the real tick loop) stays off


def start(seed=11, players=6):
    random.seed(seed)
    r = client.post(f"/api/game/start?seed={seed}&player_count={players}")
    assert r.status_code == 200, r.text
    return r.json()


def ticks(n):
    for _ in range(n):
        advance_tick(gs)


def full_engines():
    gs.ship.engine_outputs.update({"engine_3_fuel": 1.0, "engine_4_fuel": 1.0})
    gs.ship.power_allocation["engines"] = 40.0
    gs.ship.power_allocation["general_systems"] = max(0.0, gs.ship.power_allocation["general_systems"] - 20.0)


def dist(pos):
    return math.hypot(pos["x"] - gs.ship.position["x"], pos.get("z", 0) - gs.ship.position["z"])


def derelict():
    return next(n for n in gs.npc_ships if n.get("role") == "derelict")


def fly_to_npc(npc, max_ticks=200):
    gs.ship.course = {"kind": "npc", "id": npc["id"], "name": npc["name"]}
    gs.ship.thrust = 1.0
    for _ in range(max_ticks):
        advance_tick(gs)
        if gs.ship.course is None:
            return
    raise AssertionError("never arrived")


def send(source, dest, item, amount):
    world.refresh_externals(gs)
    ok, msg, _ = gs.ship.queue_transport(source, dest, item, amount)
    assert ok, msg


def wait_bots(max_ticks=60):
    for _ in range(max_ticks):
        advance_tick(gs)
        if all(b["state"] == "idle" for b in gs.ship.transport_bots):
            return
    raise AssertionError("bots never finished")


def inbox_from(npc_id):
    return [m for m in gs.messages if m["from_id"] == npc_id and m["direction"] == "inbox"]


def ws_cmd(payload):
    with client.websocket_connect("/ws") as ws:
        ws.send_json(payload)
        while True:
            m = ws.receive_json()
            if m.get("type") in ("ack", "error"):
                return m


# ── Setup ────────────────────────────────────────────────────────────────────

def test_new_game_rolls_factions_and_a_derelict_with_people_aboard():
    start()
    assert world.OUTLAW_FACTION in gs.world["factions"] and len(gs.world["factions"]) == 6
    d = derelict()
    assert 17.0 <= dist(d["position"]) <= 27.0
    assert d["cargo"]["people"] > 0 and d["disabled"]
    view = client.get("/api/game/state").json()["world"]
    assert "situations" not in view and "objectives" not in view   # nothing tells the crew what to do
    assert len(gs.ship.transport_bots) == 2


# ── Travel ───────────────────────────────────────────────────────────────────

def test_engines_off_means_no_movement():
    start()
    gs.ship.thrust = 1.0
    p0 = dict(gs.ship.position)
    ticks(5)
    assert gs.ship.position == p0


def test_autopilot_reaches_planet_without_overshoot():
    start()
    full_engines()
    planet = max(gs.galaxy.get_system(gs.ship.current_system_id).planets,
                 key=lambda p: math.hypot(p.position["x"], p.position["z"]))
    gs.ship.course = {"kind": "planet", "id": planet.id, "name": planet.name}
    gs.ship.thrust = 1.0
    start_d = dist(planet.position)
    for n in range(1, 400):
        advance_tick(gs)
        if gs.ship.course is None:
            break
    assert gs.ship.course is None
    assert n < start_d / 0.5 + 30
    assert dist(planet.position) <= 0.5 and gs.ship.thrust == 0.0


def nearest_other_system():
    here = gs.ship.current_system_id
    return min((s for s in gs.galaxy.systems if s.id != here), key=lambda s: gs.galaxy.distance_ly(here, s.id))


def test_warp_takes_time_and_first_arrival_has_raiders():
    start()
    dest = nearest_other_system()
    cost, pc = world.warp_cost_tw(gs, dest.id)
    gs.ship.warp_capacitor_gw = cost + 10
    ok, _ = world.begin_warp(gs, dest.id)
    assert ok and gs.ship.warp_phase == "spool"
    ticks(world.WARP_SPOOL_TICKS)
    assert gs.ship.warp_phase == "transit"
    ticks(world.warp_transit_ticks(pc) - 1)
    assert gs.ship.current_system_id != dest.id
    ticks(1)
    assert gs.ship.current_system_id == dest.id and gs.ship.warp_phase is None
    assert any(n.get("role") == "raider" and n["system_id"] == dest.id for n in gs.npc_ships)


def test_cannot_warp_with_a_bot_outside_and_cancel_refunds_half():
    start()
    full_engines()
    d = derelict()
    fly_to_npc(d)
    send("ship:" + d["id"], "living_quarters", "people", 6)
    dest = nearest_other_system()
    gs.ship.warp_capacitor_gw = 4000
    ok, msg = world.begin_warp(gs, dest.id)
    assert not ok and "outside" in msg
    wait_bots()
    cost, _ = world.warp_cost_tw(gs, dest.id)
    gs.ship.warp_capacitor_gw = cost
    assert world.begin_warp(gs, dest.id)[0]
    ok, _ = world.cancel_warp(gs)
    assert ok and abs(gs.ship.warp_capacitor_gw - cost * 0.5) < 1


def test_capacitor_is_capped():
    start()
    gs.ship.power_allocation["warp_drive"] = gs.ship.power_allocation["engines"]
    ticks(400)
    assert gs.ship.warp_capacitor_gw <= gs.ship.warp_capacity() == 4000 + 3500


# ── The derelict: talk, then physically help ────────────────────────────────

def test_derelict_calls_mayday_when_crew_is_in_system():
    start()
    d = derelict()
    ticks(10)
    msgs = inbox_from(d["id"])
    assert msgs and "MAYDAY" in msgs[0]["subject"] and str(d["cargo"]["people"]) in msgs[0]["body"]


def test_bots_cannot_reach_a_ship_that_is_far_away():
    start()
    d = derelict()
    world.refresh_externals(gs)
    ok, msg, _ = gs.ship.queue_transport("ship:" + d["id"], "living_quarters", "people", 6)
    assert not ok and "range" in msg


def test_evacuating_survivors_by_bot_and_landing_them_at_a_settlement():
    start()
    full_engines()
    d = derelict()
    n = d["cargo"]["people"]
    fly_to_npc(d)
    while d["cargo"]["people"] > 0:
        for b in gs.ship.transport_bots:
            if b["state"] == "idle" and d["cargo"]["people"] > 0:
                send("ship:" + d["id"], "living_quarters", "people", 6)
        wait_bots()
    assert world.passengers(gs) == n
    assert d.get("evacuated")
    ticks(3)
    assert any("everyone" in m["subject"].lower() for m in inbox_from(d["id"]))
    # People can't go to the cargo bay
    world.refresh_externals(gs)
    ok, msg, _ = gs.ship.queue_transport("living_quarters", "cargo_bay", "people", 1)
    assert not ok
    # Land them at a settlement
    sett = next(iter(gs.world["settlements"].values()))
    gs.ship.current_system_id = sett["system_id"]
    planet = gs.galaxy.get_system(sett["system_id"]).get_planet(sett["planet_id"])
    gs.ship.orbit_planet(planet.id, planet.position)
    s0 = gs.world["factions"][sett["faction"]]["standing"]
    while world.passengers(gs):
        ok, msg, _ = gs.ship.queue_transport("living_quarters", "planet", "people", 6, planet_stockpile=planet.stockpile)
        assert ok, msg
        for _ in range(30):
            advance_tick(gs)
            if all(b["state"] == "idle" or b.get("location") == "planet" for b in gs.ship.transport_bots):
                break
    ticks(5)
    assert gs.world["factions"][sett["faction"]]["standing"] > s0
    assert planet.stockpile.get("oxygen_reserves", 0) > 0     # thank-you gift left at the depot
    assert planet.stockpile.get("people", 0) == 0


def test_oxygen_delivery_buys_the_derelict_time():
    start()
    full_engines()
    d = derelict()
    fly_to_npc(d)
    air0 = d["air_ticks"]
    o2_0 = gs.ship.oxygen_reserves
    send("life_support", "ship:" + d["id"], "oxygen_reserves", 50)
    wait_bots()
    assert gs.ship.oxygen_reserves == o2_0 - 50
    assert d["air_ticks"] > air0 + 100


def test_repair_patches_get_the_derelict_moving():
    start()
    full_engines()
    d = derelict()
    fly_to_npc(d)
    gs.ship.rooms["cargo_bay"]["repair_patches"] = 10
    send("cargo_bay", "ship:" + d["id"], "repair_patches", 6)
    wait_bots()
    assert not d["disabled"] and d["role"] == "trader"
    assert d["cargo"]["people"] > 0      # they fly themselves home


def test_survivors_die_if_nobody_helps():
    start()
    d = derelict()
    n = d["cargo"]["people"]
    ticks(d["air_ticks"] + 2)
    assert d["cargo"]["people"] == 0 and d["lost"] == n
    assert any("stopped" in l["text"] for l in gs.world["log"])


def test_looting_a_crewed_derelict_angers_its_faction():
    start()
    full_engines()
    d = derelict()
    fly_to_npc(d)
    s0 = gs.world["factions"][d["faction"]]["standing"]
    send("ship:" + d["id"], "cargo_bay", "metals", 100)
    ticks(2)
    assert gs.world["factions"][d["faction"]]["standing"] < s0


# ── Raiders ──────────────────────────────────────────────────────────────────

def raider_next_to_ship(size="small", gap=1.0):
    sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
    p = gs.ship.position
    return world.spawn_npc(gs, sysobj, role="raider", faction=world.OUTLAW_FACTION, size=size,
                           position={"x": p["x"] + gap, "y": 0, "z": p["z"]},
                           speed=world.RAIDER_SPEED_AU, cargo={"metals": 0})


def test_raiders_demand_by_comms_and_leave_only_when_the_toll_arrives():
    start()
    r = raider_next_to_ship()
    ticks(1)
    assert r["demand"]["amount"] == 60 and inbox_from(r["id"])
    gs.ship.rooms["cargo_bay"]["metals"] = 500
    send("cargo_bay", "ship:" + r["id"], "metals", 30)
    wait_bots()
    assert not r["demand"]["paid"]
    send("cargo_bay", "ship:" + r["id"], "metals", 30)
    wait_bots()
    assert r["demand"]["paid"] and r["behavior"] == "flee"


def test_ignoring_raiders_means_they_attack_and_outrunning_ends_it():
    start()
    r = raider_next_to_ship(gap=6.0)
    ticks(world.RAIDER_PATIENCE_TICKS + 2)
    assert r["behavior"] == "attack"
    armour0 = sum(gs.ship.outer_hull_health.values())
    ticks(20)
    assert sum(gs.ship.outer_hull_health.values()) < armour0 - 5
    # Run without redlining: fuel engines at 80% plus the electrics
    full_engines()
    gs.ship.engine_outputs.update({"engine_3_fuel": 0.8, "engine_4_fuel": 0.8,
                                   "engine_1_electric": 0.6, "engine_2_electric": 0.6})
    dx, dz = gs.ship.position["x"] - r["position"]["x"], gs.ship.position["z"] - r["position"]["z"]
    m = math.hypot(dx, dz)
    gs.ship.target_direction = {"x": dx / m, "y": 0, "z": dz / m}
    gs.ship.thrust = 1.0
    for _ in range(200):
        advance_tick(gs)
        if r["behavior"] == "idle":
            break
    assert r["behavior"] == "idle"
    assert not any(gs.ship.engine_shutdown.values())


def test_a_threat_over_comms_is_a_bluff_check():
    start()
    r = raider_next_to_ship()
    ticks(1)
    gs.ship.power_allocation["weapons"] = 45.0
    gs.ship.power_allocation["shields"] = 45.0
    random.seed(1)
    world.auto_reply(gs, r["id"], r["name"], "Warning", "Stand down or we open fire.", "#f00")
    assert r["behavior"] in ("flee", "attack") and r["bluffed"]


def test_destroyed_raider_leaves_a_salvageable_wreck():
    start()
    r = raider_next_to_ship()
    ticks(1)
    gs.npc_ships = [n for n in gs.npc_ships if n["id"] != r["id"]]
    ticks(1)
    wreck = next(n for n in gs.npc_ships if n.get("role") == "wreck")
    assert wreck["cargo"]["metals"] > 0


# ── Trade ────────────────────────────────────────────────────────────────────

def test_trader_offer_payment_by_bot_then_collect_goods():
    start()
    t = next(n for n in gs.npc_ships if n.get("role") == "trader")
    t["position"] = {"x": gs.ship.position["x"] + 1.0, "y": 0, "z": gs.ship.position["z"]}
    random.seed(4)
    world.auto_reply(gs, t["id"], t["name"], "Trade?", "What do you have to trade?", "#fff")
    want = next(w for w in t["wants"] if not w["done"])
    assert t["hold_until"] > gs.tick
    room = "cargo_bay"
    gs.ship.rooms[room][want["item"]] = want["amount"]
    send(room, "ship:" + t["id"], want["item"], want["amount"])
    wait_bots()
    assert want["done"]
    give_item, give_amt = next(iter(want["give"].items()))
    assert t["cargo"][give_item] >= give_amt
    s0 = gs.world["factions"][t["faction"]]["standing"]
    dest = "life_support" if give_item in ("oxygen_reserves", "bio_matter_rations") else "cargo_bay"
    send("ship:" + t["id"], dest, give_item, give_amt)
    wait_bots()
    assert gs.world["factions"][t["faction"]]["standing"] == s0     # paid for: not theft


def test_taking_a_traders_cargo_unpaid_is_theft():
    start()
    t = next(n for n in gs.npc_ships if n.get("role") == "trader")
    t["position"] = {"x": gs.ship.position["x"] + 1.0, "y": 0, "z": gs.ship.position["z"]}
    s0 = gs.world["factions"][t["faction"]]["standing"]
    send("ship:" + t["id"], "cargo_bay", "metals", 50)
    ticks(1)
    assert gs.world["factions"][t["faction"]]["standing"] < s0 and t["behavior"] == "flee"


def test_settlement_pays_into_its_depot():
    start()
    sett = next(iter(gs.world["settlements"].values()))
    gs.ship.current_system_id = sett["system_id"]
    planet = gs.galaxy.get_system(sett["system_id"]).get_planet(sett["planet_id"])
    gs.ship.orbit_planet(planet.id, planet.position)
    want = sett["wants"][0]
    gs.ship.rooms["cargo_bay"][want["item"]] = want["amount"]
    ok, msg, _ = gs.ship.queue_transport("cargo_bay", "planet", want["item"], want["amount"],
                                         planet_stockpile=planet.stockpile)
    assert ok, msg
    ticks(25)
    assert want["done"]
    k, v = next(iter(want["give"].items()))
    assert planet.stockpile.get(k, 0) >= v


# ── Hails, notes, GM ─────────────────────────────────────────────────────────

def test_hailing_a_ship_gets_an_automatic_reply():
    start()
    gs.ship.power_allocation["scanner"] = 30.0
    trader = next(n for n in gs.npc_ships if n.get("role") in ("trader", "patrol"))
    trader["position"] = {"x": gs.ship.position["x"] + 1.0, "y": 0, "z": gs.ship.position["z"]}
    m = ws_cmd({"type": "send_message", "to_id": trader["id"], "subject": "Hello", "body": "Any news of raiders?"})
    assert m["type"] == "ack", m
    ticks(world.REPLY_DELAY[1] + 1)
    assert inbox_from(trader["id"])[-1]["subject"].startswith("RE:")


def test_no_canned_reply_while_gm_is_connected():
    start()
    gs.world["gm_last_seen"] = time.time()
    trader = next(n for n in gs.npc_ships if n.get("role") in ("trader", "patrol"))
    world.auto_reply(gs, trader["id"], trader["name"], "hi", "hello", "#fff")
    assert not gs.pending_messages


def test_crew_notes_board():
    start()
    assert ws_cmd({"type": "add_note", "text": "Promised the Halcyon we'd bring air", "author": "CAPTAIN"})["type"] == "ack"
    note = gs.world["notes"][-1]
    assert ws_cmd({"type": "toggle_note", "note_id": note["id"]})["type"] == "ack" and note["done"]
    assert ws_cmd({"type": "delete_note", "note_id": note["id"]})["type"] == "ack" and not gs.world["notes"]


def test_ws_transport_to_a_nearby_ship_and_course_commands():
    start()
    planet = gs.galaxy.get_system(gs.ship.current_system_id).planets[0]
    assert ws_cmd({"type": "set_course", "kind": "planet", "id": planet.id})["type"] == "ack"
    assert ws_cmd({"type": "set_target_direction", "x": 1, "y": 0, "z": 0})["type"] == "ack"
    assert gs.ship.course is None
    d = derelict()
    d["position"] = {"x": gs.ship.position["x"] + 0.5, "y": 0, "z": gs.ship.position["z"]}
    m = ws_cmd({"type": "transport_items", "source": "ship:" + d["id"], "dest": "living_quarters",
                "item": "people", "amount": 6})
    assert m["type"] == "ack", m


def test_gm_can_shape_npcs_but_not_give_options(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "k")
    start()
    h = {"X-AI-Key": "k"}
    t = next(n for n in gs.npc_ships if n.get("role") == "trader")
    r = client.post(f"/api/ai/npc/{t['id']}/cargo", json={"cargo": {"people": 9, "metals": 99999},
                                                           "disabled": True, "air_seconds": 200}, headers=h)
    assert r.status_code == 200, r.text
    assert t["cargo"]["metals"] == 5000 and t["role"] == "derelict" and t["air_ticks"] == 200
    r = client.post(f"/api/ai/npc/{t['id']}/wants",
                    json={"wants": [{"item": "electronics", "amount": 2, "give": {"fuel": 900}}]}, headers=h)
    assert r.status_code == 200 and t["wants"][0]["give"]["fuel"] == 900
    assert client.post("/api/ai/situation", json={}, headers=h).status_code in (404, 405)
    assert client.get("/api/ai/state", headers=h).status_code == 200 and world.gm_active(gs)


# ── Wear, repairs and the economy ───────────────────────────────────────────

def test_redlined_engine_burns_out_and_must_cool():
    start()
    gs.ship.engine_outputs["engine_3_fuel"] = 1.0
    ticks(49)
    assert not gs.ship.engine_shutdown["engine_3_fuel"]
    ticks(2)
    assert gs.ship.engine_shutdown["engine_3_fuel"] and gs.ship.system_health["engine_3_fuel"] <= 75
    assert ws_cmd({"type": "set_engine_output", "engine": "engine_3_fuel", "value": 0.5})["type"] == "error"


def test_sixty_percent_throttle_runs_cool_forever():
    start()
    gs.ship.engine_outputs.update({"engine_3_fuel": 0.6, "engine_4_fuel": 0.6})
    ticks(300)
    assert gs.ship.engine_heat["engine_3_fuel"] == 0 and gs.ship.system_health["engine_3_fuel"] == 100


def test_warp_wears_the_drive_and_a_worn_drive_spools_slowly():
    start()
    dest = nearest_other_system()
    cost, pc = world.warp_cost_tw(gs, dest.id)
    gs.ship.warp_capacitor_gw = cost
    world.begin_warp(gs, dest.id)
    ticks(world.WARP_SPOOL_TICKS)
    assert abs(gs.ship.system_health["warp_drive"] - (100 - world.warp_wear(pc))) < 0.02
    assert world.warp_spool_ticks(50) == 2 * world.WARP_SPOOL_TICKS
    gs.ship.warp_phase = None
    gs.ship.system_health["warp_drive"] = 15
    ok, msg = world.begin_warp(gs, nearest_other_system().id)
    assert not ok and "repair" in msg


def test_repairs_use_one_patch_per_ten_hp_and_stop_without_patches():
    start()
    sh = gs.ship
    sh.system_health["warp_drive"] = 50.0
    sh.rooms["cargo_bay"]["repair_patches"] = 2
    sh.rooms["sub_deck_refinery"]["repair_patches"] = 0
    sh.synthesis_alloc["repair_patches"] = 0.0          # no new patches being made meanwhile
    bot = sh.repair_bots[0]
    sh.dispatch_repair_bot(bot["id"], {"type": "system", "key": "warp_drive"})
    ticks(120)
    assert sh.rooms["cargo_bay"]["repair_patches"] == 0
    assert 70 <= sh.system_health["warp_drive"] <= 80   # ~20 HP for 2 patches, then it waits


def test_warp_batteries_raise_the_charge_cap_and_cost_full_materials():
    start()
    sh = gs.ship
    assert sh.warp_capacity() == 7500
    ref = sh.rooms["sub_deck_refinery"]
    ref.update({"metals": 200, "silicates": 120, "rare_earth": 60})
    sh.synthesis_alloc.update({k: 0.0 for k in sh.synthesis_alloc})   # synthesis would eat the metals
    sh.synthesis_alloc["fuel"] = 100.0
    sh.fabrication_choice["battery"] = "warp_batteries"
    sh.fabrication_assignment.update({k: 0 for k in sh.fabrication_assignment})
    sh.fabrication_assignment["battery"] = len(sh.fabrication_bots)
    sh.power_allocation["synthesis"] = 10.0
    ticks(30)
    assert sh.rooms["reactor_room"]["warp_batteries"] == 2 and sh.warp_capacity() == 11000
    assert ref["metals"] == 0 and ref["silicates"] == 0


def test_far_jump_needs_more_batteries():
    start()
    here = gs.ship.current_system_id
    far = max(gs.galaxy.systems, key=lambda s: gs.galaxy.distance_ly(here, s.id))
    ok, msg = world.begin_warp(gs, far.id)
    assert not ok and "warp batteries" in msg


def test_oxygen_can_be_made_from_ice_and_loaded_into_life_support():
    start()
    sh = gs.ship
    ref = sh.rooms["sub_deck_refinery"]
    ref["silicates"] = 400
    sh.synthesis_alloc.update({k: 0.0 for k in sh.synthesis_alloc})
    sh.synthesis_alloc["oxygen"] = 100.0
    ticks(20)
    made = ref.get("oxygen_reserves", 0)
    assert made > 50
    o2 = sh.oxygen_reserves
    send("sub_deck_refinery", "life_support", "oxygen_reserves", made)
    wait_bots()
    assert sh.oxygen_reserves >= o2 + made - 1


def test_reactor_stock_lasts_about_twenty_minutes_at_cruise_and_mining_refills_fast():
    start()
    from game.constants import REACTOR_FUEL_PER_TICK_AT_FULL, REACTOR_ROOM_FUEL_START, MINING_YIELD_PER_BOT
    per_tick = 2 * 0.30 * REACTOR_FUEL_PER_TICK_AT_FULL
    minutes = REACTOR_ROOM_FUEL_START / per_tick / 60
    assert 15 <= minutes <= 40
    # four bots on a rich gas giant fill a fresh reactor room in about a minute
    assert REACTOR_ROOM_FUEL_START / (4 * 0.9 * MINING_YIELD_PER_BOT) < 90
