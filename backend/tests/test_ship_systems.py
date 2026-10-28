"""How the ship's panels affect each other.

Every test drives the game through the same WebSocket commands the station
consoles send (Power, Engines, Shields, Tactical, Scanners, Comms, Mining,
Transport, Repairs, Synthesis, Life Support), then checks the effect shows up
somewhere else on the ship. Run from backend/:  python -m pytest -q
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_world import (  # noqa: E402  (shared helpers: one app, one game state)
    client, gs, start, ticks, ws_cmd, send, wait_bots, world,
)
from game.constants import SECTION_SIDES  # noqa: E402

SH = lambda: gs.ship  # noqa: E731


def state():
    return client.get("/api/game/state").json()


def alloc_with(**changes):
    """What the Power console sends: the full allocation dict with some keys changed."""
    a = dict(SH().power_allocation)
    a.update(changes)
    return a


def ack(payload):
    m = ws_cmd(payload)
    assert m["type"] == "ack", m
    return m


def all_reactors(value):
    for k in ("reactor_1_fuel", "reactor_2_fuel", "reactor_3_rad", "reactor_4_rad"):
        ack({"type": "set_reactor_output", "reactor": k, "value": value})


# ── Power console → every other system ──────────────────────────────────────

def test_power_console_allocation_is_accepted_and_sums_to_100():
    start()
    a = alloc_with(scanner=30.0, general_systems=5.0)
    ack({"type": "set_power_allocation", "allocations": a})
    pa = SH().power_allocation
    assert pa["scanner"] > 20
    assert abs(sum(pa.values()) - 100.0) < 0.5


def test_engines_console_warp_slider_changes_charge_rate():
    start()
    sh = SH()
    sh.warp_capacitor_gw = 0
    ack({"type": "set_power_allocation", "allocations": alloc_with(warp_drive=2.0)})
    ticks(10)
    slow = sh.warp_capacitor_gw
    sh.warp_capacitor_gw = 0
    ack({"type": "set_power_allocation", "allocations": alloc_with(warp_drive=18.0, engines=20.0)})
    ticks(10)
    assert sh.warp_capacitor_gw > slow * 3


def test_scanner_power_reveals_more_detail():
    start()
    ack({"type": "set_power_allocation", "allocations": alloc_with(scanner=1.0)})
    low = {p["id"]: p["tier"] for p in state()["short_range_scan"]["planets"]}
    ack({"type": "set_power_allocation", "allocations": alloc_with(scanner=40.0)})
    high = {p["id"]: p["tier"] for p in state()["short_range_scan"]["planets"]}
    assert sum(high.values()) > sum(low.values())
    assert all(high[k] >= low[k] for k in low)


def test_comms_power_sets_reach_to_other_systems():
    start()
    ack({"type": "set_power_allocation", "allocations": alloc_with(comms=0.5)})
    low = state()["comms"]
    ack({"type": "set_power_allocation", "allocations": alloc_with(comms=30.0)})
    high = state()["comms"]
    assert high["range_ly"] > low["range_ly"] * 10
    far = lambda c: [x for x in c["contacts"] if not x["same_system"] and x["in_range"]]  # noqa: E731
    assert len(far(high)) >= len(far(low))


def test_ship_starts_with_no_shields_installed():
    start()
    assert all(not sec.get("shield_generators") for sec in SH().hull_sections.values())
    assert SH().get_section_shield_reduction("fore") == 0.0


def test_shield_power_reduces_hull_damage_once_a_generator_is_installed():
    start()
    install_now("fore", "shield_battery", "shields")
    sh = SH()
    assert sh.hull_sections["fore"]["shield_generators"]

    def hit():
        h0 = sh.outer_hull_health["fore"]
        sh.apply_hit_damage(20.0, ["fore", "above"], 1.0, 0.0)
        return h0 - sh.outer_hull_health["fore"]

    ack({"type": "set_power_allocation", "allocations": alloc_with(shields=0.5)})
    weak = hit()
    ack({"type": "set_power_allocation", "allocations": alloc_with(shields=40.0)})
    strong = hit()
    assert strong < weak * 0.6


def test_charging_bay_power_recharges_bots_faster():
    start()
    sh = SH()
    bot = sh.transport_bots[0]
    ack({"type": "set_power_allocation", "allocations": alloc_with(charging_bay=0.5)})
    bot["charge"] = 10.0
    ticks(5)
    slow = bot["charge"] - 10.0
    ack({"type": "set_power_allocation", "allocations": alloc_with(charging_bay=20.0)})
    bot["charge"] = 10.0
    ticks(5)
    assert bot["charge"] - 10.0 > slow


def test_synthesis_power_scales_fuel_production():
    start()
    sh = SH()
    sh.synthesis_alloc.update({k: 0.0 for k in sh.synthesis_alloc})
    sh.synthesis_alloc["fuel"] = 100.0
    ref = sh.rooms["sub_deck_refinery"]
    ref["hydrocarbons"] = 100000
    ack({"type": "set_power_allocation", "allocations": alloc_with(synthesis=2.0)})
    f0 = ref.get("fuel", 0)
    ticks(5)
    slow = ref.get("fuel", 0) - f0
    ack({"type": "set_power_allocation", "allocations": alloc_with(synthesis=15.0)})
    f0 = ref.get("fuel", 0)
    ticks(5)
    assert ref.get("fuel", 0) - f0 > slow * 3


# ── Reactors & battery → net power ──────────────────────────────────────────

def test_reactor_output_drives_every_subsystem():
    start()
    all_reactors(0.2)
    low = (SH().net_power_gw(), SH().short_range_scan_gw(), SH().comms_gw(), SH().shields_gw())
    all_reactors(0.5)
    high = (SH().net_power_gw(), SH().short_range_scan_gw(), SH().comms_gw(), SH().shields_gw())
    assert all(h > l for h, l in zip(high, low))


def test_damaged_reactor_produces_less():
    start()
    p0 = SH().effective_reactor_output_gw()
    SH().system_health["reactor_3_rad"] = 50.0
    assert SH().effective_reactor_output_gw() < p0


def test_reactors_starve_when_their_stock_runs_out():
    start()
    SH().rooms["reactor_room"]["radioactive"] = 1.0
    p0 = SH().net_power_gw()
    ticks(3)
    assert SH().reactor_outputs["reactor_3_rad"] == 0 and SH().net_power_gw() < p0 * 0.5


def test_transporting_radioactives_to_the_reactor_room_refuels_it():
    start()
    rr = SH().rooms["reactor_room"]
    r0 = rr["radioactive"]
    SH().rooms["cargo_bay"]["radioactive"] = 1000
    send("cargo_bay", "reactor_room", "radioactive", 1000)
    wait_bots()
    assert rr["radioactive"] > r0 + 900


def test_battery_discharge_adds_power_and_charge_costs_power():
    start()
    sh = SH()
    sh.battery_energy_gw = sh.battery_capacity_gw() / 2
    base = sh.net_power_gw()
    ack({"type": "set_battery_slider", "value": 50})
    assert sh.net_power_gw() > base
    e0 = sh.battery_energy_gw
    ticks(1)
    assert sh.battery_energy_gw < e0
    ack({"type": "set_battery_slider", "value": -50})
    assert sh.net_power_gw() < base
    e0 = sh.battery_energy_gw
    ticks(1)
    assert sh.battery_energy_gw > e0


# ── Engines ↔ engine bay fuel ───────────────────────────────────────────────

def test_fuel_engines_stop_without_fuel_and_restart_after_a_transport():
    start()
    sh = SH()
    sh.rooms["engine_bay"]["fuel"] = 0
    ack({"type": "set_engine_output", "engine": "engine_3_fuel", "value": 0.6})
    ticks(2)
    assert sh.engine_outputs["engine_3_fuel"] == 0 and sh.engine_thrust_au == 0
    sh.rooms["cargo_bay"]["fuel"] = 500
    send("cargo_bay", "engine_bay", "fuel", 500)
    wait_bots()
    ack({"type": "set_engine_output", "engine": "engine_3_fuel", "value": 0.6})
    ticks(2)
    assert sh.engine_thrust_au > 0


def test_engine_bay_only_accepts_fuel():
    start()
    world.refresh_externals(gs)
    ok, msg, _ = SH().queue_transport("cargo_bay", "engine_bay", "metals", 10)
    assert not ok and "accept" in msg


def test_electric_engines_need_engine_power():
    start()
    ack({"type": "set_power_allocation", "allocations": alloc_with(engines=0.5, warp_drive=0.0)})
    ack({"type": "set_engine_output", "engine": "engine_1_electric", "value": 1.0})
    ticks(1)
    starved = SH().engine_thrust_au
    ack({"type": "set_power_allocation", "allocations": alloc_with(engines=35.0, warp_drive=0.0)})
    ack({"type": "set_engine_output", "engine": "engine_1_electric", "value": 1.0})
    ticks(1)
    assert SH().engine_thrust_au > starved


# ── Shields & Tactical consoles ─────────────────────────────────────────────

def test_shields_section_sliders_accept_fore_aft():
    start()
    ack({"type": "set_shields_section_alloc",
         "alloc": {s: (60 if s == "fore" else 8) for s in SECTION_SIDES}})
    assert SH().shields_section_alloc["fore"] > 50


def test_weapons_section_sliders_accept_fore_aft():
    start()
    ack({"type": "set_weapons_alloc", "targeting_pct": 30,
         "section_alloc": {s: (60 if s == "fore" else 8) for s in SECTION_SIDES}})
    assert SH().weapons_section_alloc["fore"] > 50 and SH().weapons_targeting_pct == 30


def test_component_power_sliders_accept_fore():
    start()
    ack({"type": "set_shields_component_alloc", "section": "fore", "alloc": {}})
    ack({"type": "set_weapons_component_alloc", "section": "fore", "alloc": {}})


def test_installing_a_shield_generator_takes_time_and_uses_stock():
    start()
    sh = SH()
    tb = sh.rooms["tactical_bridge"]
    stock = tb["shield_generators"]
    before = len(sh.hull_sections["port"].get("shield_generators", []))
    ack({"type": "install_component", "section": "port", "role": "shield_battery", "station": "shields"})
    assert tb["shield_generators"] == stock - 1
    ticks(10)
    assert len(sh.hull_sections["port"].get("shield_generators", [])) == before
    ticks(120)
    assert len(sh.hull_sections["port"].get("shield_generators", [])) == before + 1


def test_installing_needs_parts_in_the_tactical_bridge():
    start()
    SH().rooms["tactical_bridge"]["lasers"] = 0
    m = ws_cmd({"type": "install_component", "section": "fore", "role": "offense_laser", "station": "weapons"})
    assert m["type"] == "error"
    SH().rooms["cargo_bay"]["lasers"] = 2
    send("cargo_bay", "tactical_bridge", "lasers", 1)
    wait_bots()
    ack({"type": "install_component", "section": "fore", "role": "offense_laser", "station": "weapons"})


def install_now(section, role, station):
    sh = SH()
    sh.rooms["tactical_bridge"]["lasers"] = sh.rooms["tactical_bridge"].get("lasers", 0) + 1
    sh.rooms["tactical_bridge"]["shield_generators"] = sh.rooms["tactical_bridge"].get("shield_generators", 0) + 1
    ack({"type": "install_component", "section": section, "role": role, "station": station})
    ticks(130)


def test_attack_mode_lasers_fill_the_weapon_pool_and_firing_damages_the_locked_target():
    start()
    install_now("fore", "offense_laser", "weapons")
    sh = SH()
    ack({"type": "set_power_allocation", "allocations": alloc_with(weapons=30.0)})
    ack({"type": "set_weapons_alloc", "targeting_pct": 10,
         "section_alloc": {s: (100 if s == "fore" else 0) for s in SECTION_SIDES}})
    sh.weapon_energy_pool = 0
    ticks(10)
    assert sh.weapon_energy_pool > 0
    sysobj = gs.galaxy.get_system(sh.current_system_id)
    p = sh.position
    tgt = world.spawn_npc(gs, sysobj, role="raider", faction=world.OUTLAW_FACTION, size="small",
                          position={"x": p["x"] + 2, "y": 0, "z": p["z"]})
    ack({"type": "set_weapons_target", "target_id": tgt["id"]})
    m = ack({"type": "fire_weapon_pool", "fraction": 1.0})
    assert m["fired_tw"] > 0 and m["damage"] > 0 and tgt["hull_health"] < 100
    assert sh.weapon_energy_pool == 0


def test_defense_mode_lasers_do_not_fill_the_pool():
    start()
    install_now("aft", "defense_laser", "shields")
    sh = SH()
    for sec in sh.hull_sections.values():
        for key in ("offense_lasers", "defense_lasers"):
            for laser in sec.get(key, []):
                laser["mode"] = "defense"
    sh.weapon_energy_pool = 0
    ticks(10)
    assert sh.weapon_energy_pool == 0


def test_missiles_need_stock_on_the_bridge_and_hit_their_target():
    start()
    sh = SH()
    sysobj = gs.galaxy.get_system(sh.current_system_id)
    p = sh.position
    tgt = world.spawn_npc(gs, sysobj, role="raider", faction=world.OUTLAW_FACTION, size="small",
                          position={"x": p["x"] + 3, "y": 0, "z": p["z"]})
    sh.rooms["tactical_bridge"]["missiles"] = 0
    assert ws_cmd({"type": "fire_missile", "target_id": tgt["id"]})["type"] == "error"
    sh.rooms["tactical_bridge"]["missiles"] = 1
    ack({"type": "fire_missile", "target_id": tgt["id"]})
    assert sh.rooms["tactical_bridge"]["missiles"] == 0
    for _ in range(15):
        ticks(1)
        if tgt["hull_health"] < 100 or tgt not in gs.npc_ships:
            break
    assert tgt["hull_health"] < 100 or tgt not in gs.npc_ships


def test_targeting_range_follows_weapons_power():
    start()
    ack({"type": "set_power_allocation", "allocations": alloc_with(weapons=2.0)})
    ack({"type": "set_weapons_alloc", "targeting_pct": 50})
    low = SH().targeting_range_au()
    ack({"type": "set_power_allocation", "allocations": alloc_with(weapons=30.0)})
    assert SH().targeting_range_au() > low * 5


# ── Mining → planet hopper → transport ──────────────────────────────────────

def orbit_richest(resource):
    sysobj = gs.galaxy.get_system(SH().current_system_id)
    planet = max(sysobj.planets, key=lambda p: getattr(p, resource))
    SH().orbit_planet(planet.id, planet.position)
    return planet


def test_mining_needs_orbit():
    start()
    assert ws_cmd({"type": "set_mining_bots", "resource": "metals", "value": 2})["type"] == "error"


def test_mining_fills_the_hopper_by_richness_and_bots_bring_it_aboard():
    start()
    planet = orbit_richest("metals")
    m = ack({"type": "set_mining_bots", "resource": "metals", "value": 2})
    assert m["value"] == 2
    h0 = planet.stockpile.get("metals", 0)
    ticks(10)
    gained = planet.stockpile["metals"] - h0
    assert abs(gained - 10 * 2 * 25.0 * planet.metals) < 1.0
    cargo0 = SH().rooms["cargo_bay"]["metals"]
    ack({"type": "retrieve_mining_hopper", "resource": "metals", "amount": 200})
    for _ in range(30):
        ticks(1)
        if SH().rooms["cargo_bay"]["metals"] > cargo0:
            break
    assert SH().rooms["cargo_bay"]["metals"] >= cargo0 + 199


def test_silicates_can_be_mined():
    start()
    orbit_richest("silicates")
    assert ack({"type": "set_mining_bots", "resource": "silicates", "value": 1})["value"] == 1


def test_mining_bots_run_flat_and_stop():
    start()
    orbit_richest("metals")
    ack({"type": "set_mining_bots", "resource": "metals", "value": 1})
    bot = next(b for b in SH().mining_bots_list if b["state"] == "mining")
    bot["charge"] = 0.2
    ticks(3)
    assert bot["state"] == "idle"


def test_leaving_orbit_stops_mining_income():
    start()
    planet = orbit_richest("metals")
    ack({"type": "set_mining_bots", "resource": "metals", "value": 2})
    ticks(2)
    ack({"type": "leave_orbit"})
    h = planet.stockpile["metals"]
    ticks(5)
    assert planet.stockpile["metals"] == h


# ── Damage & repairs ────────────────────────────────────────────────────────

def test_damaged_systems_work_worse_until_repaired():
    start()
    sh = SH()
    s0, c0 = sh.short_range_scan_gw(), sh.comms_gw()
    sh.system_health["short_range_scanner"] = 40.0
    sh.system_health["comms_array"] = 40.0
    assert sh.short_range_scan_gw() < s0 * 0.5 and sh.comms_gw() < c0 * 0.5
    bot = sh.repair_bots[0]
    ack({"type": "dispatch_repair_bot", "bot_id": bot["id"],
         "target": {"type": "system", "key": "short_range_scanner"}})
    ticks(40)
    assert sh.system_health["short_range_scanner"] > 50


def test_repair_bots_need_charging_bay_power():
    start()
    sh = SH()
    sh.system_health["comms_array"] = 50.0
    ack({"type": "set_power_allocation", "allocations": alloc_with(charging_bay=0.0)})
    sh.power_allocation["charging_bay"] = 0.0
    bot = sh.repair_bots[0]
    ack({"type": "dispatch_repair_bot", "bot_id": bot["id"], "target": {"type": "system", "key": "comms_array"}})
    ticks(30)
    assert sh.system_health["comms_array"] == 50.0


# ── Life support ────────────────────────────────────────────────────────────

def test_without_power_life_support_fails_and_passengers_die():
    start()
    sh = SH()
    sh.rooms["living_quarters"]["people"] = 30
    random.seed(3)
    all_reactors(0.0)
    sh.battery_slider = 0
    ticks(200)
    assert sh.rooms["living_quarters"]["people"] < 30


def test_running_out_of_air_ends_the_game():
    start()
    sh = SH()
    sh.oxygen_reserves = 0
    ticks(25)
    assert gs.game_over_reason == "crew_asphyxiated" and not gs.running


def test_rations_from_synthesis_reach_the_tanks_by_transport():
    start()
    sh = SH()
    ref = sh.rooms["sub_deck_refinery"]
    ref["hydrocarbons"] = 1000
    sh.synthesis_alloc.update({k: 0.0 for k in sh.synthesis_alloc})
    sh.synthesis_alloc["rations"] = 100.0
    ticks(10)
    made = ref.get("bio_matter_rations", 0)
    assert made > 0
    r0 = sh.bio_matter_rations
    send("sub_deck_refinery", "life_support", "bio_matter_rations", made)
    wait_bots()
    assert sh.bio_matter_rations >= r0 + made - 1


# ── Navigation ──────────────────────────────────────────────────────────────

def test_orbit_needs_the_pilot_to_be_close():
    start()
    sysobj = gs.galaxy.get_system(SH().current_system_id)
    far = max(sysobj.planets, key=lambda p: math.hypot(p.position["x"] - SH().position["x"],
                                                        p.position["z"] - SH().position["z"]))
    assert ws_cmd({"type": "orbit", "planet_id": far.id})["type"] == "error"


def test_hull_destroyed_ends_the_game():
    start()
    SH().hull_health = 0
    ticks(1)
    assert gs.game_over_reason == "hull_destroyed"
