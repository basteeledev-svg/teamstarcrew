"""Gameplay tests for travel, encounters, situations, objectives and settlements.

Run from backend/:  python -m pytest -q
The tick loop isn't started; tests call advance_tick() directly.
"""
import math
import os
import random
import sys

import pytest

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


# ── Setup ────────────────────────────────────────────────────────────────────

def test_new_game_rolls_factions_and_opening_derelict():
    start()
    facs = gs.world["factions"]
    assert world.OUTLAW_FACTION in facs
    assert len(facs) == 6
    d = derelict()
    assert 17.0 <= dist(d["position"]) <= 27.0
    assert d["survivors"] > 0
    assert all(s["faction"] in facs for s in gs.world["settlements"].values())
    state = client.get("/api/game/state").json()
    assert "world" in state and state["world"]["situations"] == []


# ── Travel ───────────────────────────────────────────────────────────────────

def test_engines_off_means_no_movement():
    start()
    gs.ship.thrust = 1.0
    p0 = dict(gs.ship.position)
    ticks(5)
    assert gs.ship.position == p0


def test_autopilot_reaches_planet_without_overshoot_and_can_orbit():
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
    assert gs.ship.course is None, "autopilot never arrived"
    assert n < start_d / 0.5 + 30, f"took {n} ticks for {start_d:.1f} AU"
    assert dist(planet.position) <= 0.5
    assert gs.ship.thrust == 0.0


# ── Derelict → rescue → delivery objective ───────────────────────────────────

def test_derelict_rescue_creates_deadline_objective():
    start()
    full_engines()
    d = derelict()
    n = d["survivors"]
    fly_to_npc(d)
    ticks(1)
    sit = next(s for s in world.open_situations(gs) if s["kind"] == "derelict")
    # Far-away commit is blocked; here we're docked so it works
    assert world.commit_situation(gs, sit["id"], "rescue") is None
    assert world.passengers(gs) == n
    obj = next(o for o in gs.world["objectives"] if o["kind"] == "deliver_passengers")
    assert obj["amount"] == n and obj["deadline_tick"] > gs.tick
    view = client.get("/api/game/state").json()["world"]
    assert view["people_aboard"] == 10 + n
    assert view["o2_ticks_left"] < 500 * 100 // 10


def test_rescue_is_blocked_when_far_away():
    start()
    d = derelict()
    sit = world.create_situation(gs, kind="derelict", source_id=d["id"], title="t", body="b",
                                 default_option="ignore", deadline_ticks=60,
                                 options=[{"id": "rescue", "label": "r",
                                           "requires": {"max_distance_au": 1.0}, "effects": [{"type": "rescue"}]},
                                          {"id": "ignore", "label": "i", "effects": []}])
    err = world.commit_situation(gs, sit["id"], "rescue")
    assert err and "within" in err


def test_unanswered_situation_takes_default_and_votes_win():
    start()
    a = world.create_situation(gs, kind="x", title="A", body="", default_option="no", deadline_ticks=10,
                               options=[{"id": "yes", "label": "Y", "effects": [{"type": "cargo", "delta": {"metals": 5}}]},
                                        {"id": "no", "label": "N", "effects": []}])
    b = world.create_situation(gs, kind="x", title="B", body="", default_option="no", deadline_ticks=10,
                               options=[{"id": "yes", "label": "Y", "effects": [{"type": "cargo", "delta": {"metals": 5}}]},
                                        {"id": "no", "label": "N", "effects": []}])
    m0 = gs.ship.rooms["cargo_bay"]["metals"]
    world.cast_vote(gs, b["id"], "yes", "tab1", "Pilot")
    world.cast_vote(gs, b["id"], "yes", "tab2", "Engineer")
    world.cast_vote(gs, b["id"], "no", "tab3", "Science")
    ticks(11)
    assert a["chosen"] == "no" and a["resolved_by"] == "timeout"
    assert b["chosen"] == "yes" and b["resolved_by"] == "vote"
    assert gs.ship.rooms["cargo_bay"]["metals"] == m0 + 5


# ── Warp ─────────────────────────────────────────────────────────────────────

def nearest_other_system():
    here = gs.ship.current_system_id
    return min((s for s in gs.galaxy.systems if s.id != here),
               key=lambda s: gs.galaxy.distance_ly(here, s.id))


def test_warp_takes_time_and_first_arrival_has_raiders():
    start()
    dest = nearest_other_system()
    cost, pc = world.warp_cost_tw(gs, dest.id)
    gs.ship.warp_capacitor_gw = cost + 10
    ok, _ = world.begin_warp(gs, dest.id)
    assert ok and gs.ship.warp_phase == "spool"
    assert gs.ship.warp_capacitor_gw < 20
    ticks(world.WARP_SPOOL_TICKS)
    assert gs.ship.warp_phase == "transit"
    origin_npcs = len(gs.npc_ships)
    ticks(world.warp_transit_ticks(pc) - 1)
    assert gs.ship.current_system_id != dest.id
    ticks(1)
    assert gs.ship.current_system_id == dest.id and gs.ship.warp_phase is None
    assert any(n.get("role") == "raider" and n["system_id"] == dest.id for n in gs.npc_ships)
    assert len(gs.npc_ships) > origin_npcs


def test_cancel_warp_refunds_half():
    start()
    dest = nearest_other_system()
    cost, _ = world.warp_cost_tw(gs, dest.id)
    gs.ship.warp_capacitor_gw = cost
    world.begin_warp(gs, dest.id)
    ok, _ = world.cancel_warp(gs)
    assert ok and gs.ship.warp_phase is None
    assert abs(gs.ship.warp_capacitor_gw - cost * 0.5) < 1


def test_capacitor_is_capped():
    start()
    gs.ship.power_allocation["warp_drive"] = gs.ship.power_allocation["engines"]
    ticks(400)
    assert gs.ship.warp_capacitor_gw <= 4000


# ── Raiders ──────────────────────────────────────────────────────────────────

def raider_next_to_ship(size="small"):
    sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
    p = gs.ship.position
    return world.spawn_npc(gs, sysobj, role="raider", faction=world.OUTLAW_FACTION, size=size,
                           position={"x": p["x"] + 6.0, "y": 0, "z": p["z"]},
                           speed=world.RAIDER_SPEED_AU)


def test_raider_demand_pay_requires_metals_then_they_leave():
    start()
    r = raider_next_to_ship()
    ticks(1)
    sit = next(s for s in world.open_situations(gs) if s["source_id"] == r["id"])
    gs.ship.rooms["cargo_bay"]["metals"] = 0
    assert "need" in world.commit_situation(gs, sit["id"], "pay")
    gs.ship.rooms["cargo_bay"]["metals"] = 500
    assert world.commit_situation(gs, sit["id"], "pay") is None
    assert r["behavior"] == "flee"
    assert gs.ship.rooms["cargo_bay"]["metals"] < 500


def test_refusing_raiders_means_combat_and_outrunning_ends_it():
    start()
    r = raider_next_to_ship()
    ticks(1)
    sit = next(s for s in world.open_situations(gs) if s["source_id"] == r["id"])
    world.commit_situation(gs, sit["id"], "refuse")
    assert r["behavior"] == "attack"
    armour0 = sum(gs.ship.outer_hull_health.values())
    ticks(20)
    assert sum(gs.ship.outer_hull_health.values()) < armour0 - 5
    # Run: full sublight straight away from them
    full_engines()
    gs.ship.course = None
    dx, dz = gs.ship.position["x"] - r["position"]["x"], gs.ship.position["z"] - r["position"]["z"]
    m = math.hypot(dx, dz)
    gs.ship.target_direction = {"x": dx / m, "y": 0, "z": dz / m}
    gs.ship.thrust = 1.0
    for _ in range(200):
        advance_tick(gs)
        if r["behavior"] == "idle":
            break
    assert r["behavior"] == "idle"


def test_destroying_raider_resolves_situation():
    start()
    r = raider_next_to_ship()
    ticks(1)
    gs.npc_ships = [n for n in gs.npc_ships if n["id"] != r["id"]]
    ticks(1)
    sit = next(s for s in gs.world["situations"] if s["source_id"] == r["id"])
    assert sit["status"] == "resolved" and "destroyed" in sit["outcome"]


# ── Settlements ──────────────────────────────────────────────────────────────

def orbit_settlement():
    sett = next(iter(gs.world["settlements"].values()))
    gs.ship.current_system_id = sett["system_id"]
    planet = gs.galaxy.get_system(sett["system_id"]).get_planet(sett["planet_id"])
    gs.ship.orbit_planet(planet.id, planet.position)
    return sett


def test_settlement_delivery_completes_objective_and_pays():
    start()
    sett = orbit_settlement()
    gs.ship.rooms["living_quarters"]["people"] = 7
    obj = world.create_objective(gs, kind="deliver_passengers", title="drop", planet_id=sett["planet_id"],
                                 amount=7, deadline_ticks=500, reward={"cargo": {"repair_patches": 6}})
    patches0 = gs.ship.rooms["cargo_bay"]["repair_patches"]
    ok, msg = world.settlement_action(gs, "deliver")
    assert ok, msg
    assert obj["status"] == "complete" and world.passengers(gs) == 0
    assert gs.ship.rooms["cargo_bay"]["repair_patches"] == patches0 + 6


def test_settlement_trade_and_job():
    start()
    sett = orbit_settlement()
    t = sett["trades"][0]
    g_room, g_key, g_amt, *_ = world.TRADE_GOODS[t]
    gs.ship.rooms[g_room][g_key] = 0
    ok, msg = world.settlement_action(gs, "trade", t)
    assert not ok
    gs.ship.rooms[g_room][g_key] = g_amt
    ok, msg = world.settlement_action(gs, "trade", t)
    assert ok, msg
    if len({s["system_id"] for s in gs.world["settlements"].values()}) > 1:
        ok, msg = world.settlement_action(gs, "job")
        assert ok, msg
        ok2, _ = world.settlement_action(gs, "job")
        assert not ok2


def test_missed_deadline_fails_objective_and_costs_standing():
    start()
    sett = next(iter(gs.world["settlements"].values()))
    s0 = gs.world["factions"][sett["faction"]]["standing"]
    obj = world.create_objective(gs, kind="visit", title="v", planet_id=sett["planet_id"], deadline_ticks=5,
                                 penalty={"standing": {sett["faction"]: -10}})
    ticks(6)
    assert obj["status"] == "failed"
    assert gs.world["factions"][sett["faction"]]["standing"] == max(-100, s0 - 10)


# ── Hails ────────────────────────────────────────────────────────────────────

def test_hailing_a_ship_gets_an_automatic_reply():
    start()
    gs.ship.power_allocation["scanner"] = 30.0
    trader = next(n for n in gs.npc_ships if n.get("role") in ("trader", "patrol"))
    trader["position"] = {"x": gs.ship.position["x"] + 1.0, "y": 0, "z": gs.ship.position["z"]}
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "send_message", "to_id": trader["id"], "subject": "Hello", "body": "Any news of raiders?"})
        while True:
            m = ws.receive_json()
            if m.get("type") in ("ack", "error"):
                break
        assert m["type"] == "ack", m
    before = len(gs.messages)
    ticks(world.AUTO_REPLY_DELAY[1] + 1)
    reply = gs.messages[-1]
    assert len(gs.messages) > before and reply["from_id"] == trader["id"] and reply["subject"].startswith("RE:")


def test_no_canned_reply_while_gm_is_connected():
    start()
    import time
    gs.world["gm_last_seen"] = time.time()
    trader = next(n for n in gs.npc_ships if n.get("role") in ("trader", "patrol"))
    world.auto_reply(gs, trader["id"], trader["name"], "hi", "hello", "#fff")
    assert not gs.pending_messages


# ── WebSocket commands ───────────────────────────────────────────────────────

def ws_cmd(payload):
    with client.websocket_connect("/ws") as ws:
        ws.send_json(payload)
        while True:
            m = ws.receive_json()
            if m.get("type") in ("ack", "error"):
                return m


def test_ws_course_vote_commit_and_warp():
    start()
    planet = gs.galaxy.get_system(gs.ship.current_system_id).planets[0]
    assert ws_cmd({"type": "set_course", "kind": "planet", "id": planet.id})["type"] == "ack"
    assert gs.ship.course["id"] == planet.id
    assert ws_cmd({"type": "set_target_direction", "x": 1, "y": 0, "z": 0})["type"] == "ack"
    assert gs.ship.course is None
    sit = world.create_situation(gs, kind="x", title="T", body="", default_option="a", deadline_ticks=30,
                                 options=[{"id": "a", "label": "A", "effects": []},
                                          {"id": "b", "label": "B", "effects": []}])
    assert ws_cmd({"type": "situation_vote", "situation_id": sit["id"], "option_id": "b",
                   "voter_id": "x1", "voter_label": "Pilot"})["type"] == "ack"
    assert ws_cmd({"type": "situation_commit", "situation_id": sit["id"], "option_id": "b"})["type"] == "ack"
    assert sit["chosen"] == "b"
    dest = nearest_other_system()
    gs.ship.warp_capacitor_gw = 0
    assert ws_cmd({"type": "warp", "system_id": dest.id})["type"] == "error"
    gs.ship.warp_capacitor_gw = 4000
    assert ws_cmd({"type": "warp", "system_id": dest.id})["type"] == "ack"
    assert ws_cmd({"type": "cancel_warp"})["type"] == "ack"


# ── GM endpoints ─────────────────────────────────────────────────────────────

def test_gm_situation_endpoint_validates_and_works(monkeypatch):
    monkeypatch.setenv("AI_API_KEY", "k")
    start()
    h = {"X-AI-Key": "k"}
    bad = {"title": "t", "body": "b", "default_option": "a",
           "options": [{"id": "a", "label": "A", "effects": [{"type": "explode"}]},
                       {"id": "b", "label": "B"}]}
    assert client.post("/api/ai/situation", json=bad, headers=h).status_code == 422
    good = {"title": "Strange signal", "body": "b", "default_option": "a", "deadline_seconds": 30,
            "options": [{"id": "a", "label": "Ignore"},
                        {"id": "b", "label": "Investigate",
                         "effects": [{"type": "cargo", "delta": {"metals": 99999}}]}]}
    r = client.post("/api/ai/situation", json=good, headers=h)
    assert r.status_code == 201, r.text
    sit = next(s for s in gs.world["situations"] if s["id"] == r.json()["id"])
    assert sit["options"][1]["effects"][0]["delta"]["metals"] == 500   # clamped
    sett = next(iter(gs.world["settlements"]))
    r = client.post("/api/ai/objective", json={"title": "Go", "planet_id": sett, "deadline_seconds": 300},
                    headers=h)
    assert r.status_code == 201, r.text
    assert client.get("/api/ai/state", headers=h).status_code == 200
    assert world.gm_active(gs)
