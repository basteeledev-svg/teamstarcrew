"""Balance simulator: a scripted "explorer crew" plays an hour of game time.

    cd backend && python tools/balance_sim.py [--seeds 1,2,3] [--minutes 60] [--reckless]

The crew explores (nearest unvisited system it can afford), mines when supplies
run low (picking the planet whose resources match what it needs), refines
hydrocarbons into fuel, repairs the warp drive, and pays raiders. Reported:
systems reached, time spent mining, lowest reserves and breakdowns.

Use it after changing the economy constants in game/constants.py
(REACTOR_*_PER_TICK_AT_FULL, *_START, MINING_YIELD_PER_BOT, SYNTH_FUEL_PER_TW,
BASE_FUEL_COEFF, WARP_WEAR_*). Target: a competent crew reaches ~70% of systems
in an hour; a reckless one (redlined engines/reactors) breaks things.
"""
import argparse
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from game import world  # noqa: E402
from game.state import game_state as gs  # noqa: E402
from game.tick import advance_tick  # noqa: E402

client = TestClient(main.app)

# What a careful crew keeps in stock, and when it goes mining.
TARGET = {"reactor_fuel": 3000, "reactor_rad": 4000, "engine_fuel": 2000, "patches": 12}
LOW = {"reactor_fuel": 1100, "reactor_rad": 1100, "engine_fuel": 700, "patches": 4}
MINE_RES = ("hydrocarbons", "radioactive", "metals", "rare_earth", "silicates")


class Crew:
    def __init__(self, seed, reckless=False):
        random.seed(seed)
        client.post(f"/api/game/start?seed={seed}&player_count=6")
        self.reckless = reckless
        self.stats = {"mining_ticks": 0, "mining_stops": 0, "jumps": 0, "low": {}, "breakdowns": [],
                      "repair_ticks": 0, "raids_paid": 0, "hull_min": 100.0, "warp_min": 100.0}
        sh = gs.ship
        sh.power_allocation["warp_drive"] = 15.0
        sh.power_allocation["general_systems"] -= 5.0
        sh.synthesis_alloc.update({"fuel": 50.0, "enriched_nuclear": 0.0, "electronics": 0.0,
                                   "repair_patches": 30.0, "space_scrap": 0.0, "oxygen": 10.0, "rations": 10.0})
        if reckless:
            for k in sh.reactor_outputs:
                sh.reactor_outputs[k] = 0.85

    # ── helpers ──
    def tick(self, n=1):
        for _ in range(n):
            advance_tick(gs)
            self._watch()

    def _watch(self):
        sh = gs.ship
        self.stats["hull_min"] = min(self.stats["hull_min"], sh.hull_health)
        self.stats["warp_min"] = min(self.stats["warp_min"], sh.system_health["warp_drive"])
        for k, v in self.stock().items():
            self.stats["low"][k] = min(self.stats["low"].get(k, 1e9), v)
        for k in list(sh.engine_shutdown) + list(sh.reactor_shutdown):
            down = sh.engine_shutdown.get(k) or sh.reactor_shutdown.get(k)
            if down and (not self.stats["breakdowns"] or self.stats["breakdowns"][-1][1] != k):
                self.stats["breakdowns"].append((gs.tick, k))
        # Pay raiders who demand a toll, if a bot can reach them.
        for n in gs.npc_ships:
            d = n.get("demand")
            if d and not d["paid"] and not n.get("_paying") and n["system_id"] == sh.current_system_id:
                world.refresh_externals(gs)
                if f"ship:{n['id']}" in sh.external_inventories:
                    self.ensure("cargo_bay", "metals", d["amount"])
                    ok, _, _ = sh.queue_transport("cargo_bay", f"ship:{n['id']}", "metals", d["amount"])
                    if ok:
                        n["_paying"] = True
                        self.stats["raids_paid"] += 1

    def stock(self):
        r = gs.ship.rooms
        return {"reactor_fuel": r["reactor_room"]["fuel"], "reactor_rad": r["reactor_room"]["radioactive"],
                "engine_fuel": r["engine_bay"]["fuel"],
                "patches": r["cargo_bay"]["repair_patches"] + r["sub_deck_refinery"]["repair_patches"],
                "o2": gs.ship.oxygen_reserves}

    def ensure(self, room, item, amount):
        """Cheat-free: only used for raider tolls — move metals from refinery if cargo is short."""
        inv = gs.ship.rooms[room]
        if inv.get(item, 0) < amount and gs.ship.rooms["sub_deck_refinery"].get(item, 0) >= amount:
            gs.ship.queue_transport("sub_deck_refinery", room, item, amount)

    def engines(self, on):
        lvl = 1.0 if self.reckless else 0.6
        gs.ship.engine_outputs.update({"engine_3_fuel": lvl if on else 0.0, "engine_4_fuel": lvl if on else 0.0})
        gs.ship.thrust = 1.0 if on else 0.0

    def fly_to(self, kind, oid, name, limit=400):
        gs.ship.course = {"kind": kind, "id": oid, "name": name}
        self.engines(True)
        for _ in range(limit):
            self.tick()
            if gs.ship.course is None:
                break
        self.engines(False)

    def send(self, src, dst, item, amt, planet=None):
        stock = planet.stockpile if planet else None
        ok, _, _ = gs.ship.queue_transport(src, dst, item, amt, planet_stockpile=stock)
        return ok

    def idle_bots(self):
        return [b for b in gs.ship.transport_bots if b["state"] == "idle"]

    def move_fuel(self):
        """Refinery fuel → reactor room / engine bay; oxygen/rations → life support."""
        ref = gs.ship.rooms["sub_deck_refinery"]
        s = self.stock()
        for item in ("oxygen_reserves", "bio_matter_rations"):
            if ref.get(item, 0) >= 40 and self.idle_bots():
                self.send("sub_deck_refinery", "life_support", item, ref[item])
        if ref.get("fuel", 0) >= 50 and self.idle_bots():
            dst = "engine_bay" if s["engine_fuel"] < s["reactor_fuel"] * 0.7 else "reactor_room"
            self.send("sub_deck_refinery", dst, "fuel", 1000)

    # ── decisions ──
    def needs(self):
        s = self.stock()
        need = {}
        fuel_def = max(0, TARGET["reactor_fuel"] - s["reactor_fuel"]) + max(0, TARGET["engine_fuel"] - s["engine_fuel"])
        if s["reactor_fuel"] < LOW["reactor_fuel"] or s["engine_fuel"] < LOW["engine_fuel"]:
            need["hydrocarbons"] = fuel_def
        if s["reactor_rad"] < LOW["reactor_rad"]:
            need["radioactive"] = TARGET["reactor_rad"] - s["reactor_rad"]
        ref = gs.ship.rooms["sub_deck_refinery"]
        if s["patches"] < LOW["patches"] and ref.get("metals", 0) < 200:
            need["metals"] = 400
        return need

    def opportunity(self):
        """Top up when passing a rich source of something we're below 70% on."""
        s = self.stock()
        sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
        best = {}
        for p in sysobj.planets:
            if p.radioactive >= 0.4 and s["reactor_rad"] < TARGET["reactor_rad"] * 0.7:
                best["radioactive"] = TARGET["reactor_rad"] - s["reactor_rad"]
            if p.hydrocarbons >= 0.6 and s["reactor_fuel"] + s["engine_fuel"] < (TARGET["reactor_fuel"] + TARGET["engine_fuel"]) * 0.6:
                best["hydrocarbons"] = 1
        return best

    def mine(self, need):
        sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
        # top up everything that's below target while we're stopped anyway
        s = self.stock()
        want = dict(need)
        if s["reactor_rad"] < TARGET["reactor_rad"] * 0.8:
            want.setdefault("radioactive", TARGET["reactor_rad"] - s["reactor_rad"])
        if s["reactor_fuel"] + s["engine_fuel"] < (TARGET["reactor_fuel"] + TARGET["engine_fuel"]) * 0.8:
            want.setdefault("hydrocarbons", 1)
        best, best_score = None, 0
        for p in sysobj.planets:
            score = sum(getattr(p, r) * (2 if r in need else 1) for r in want)
            d = math.hypot(p.position["x"] - gs.ship.position["x"], p.position["z"] - gs.ship.position["z"])
            score /= (1 + d / 40)
            if score > best_score:
                best, best_score = p, score
        if not best or best_score < 0.3:
            return False
        t0 = gs.tick
        self.fly_to("planet", best.id, best.name)
        gs.ship.orbit_planet(best.id, best.position)
        self.stats["mining_stops"] += 1
        bots = [b for b in gs.ship.mining_bots_list if b["health"] > 0 and b["charge"] > 5]
        want = {r: v for r, v in want.items() if getattr(best, r) >= 0.25} or want   # skip what it barely has
        order = sorted(want, key=lambda r: -getattr(best, r))
        for i, b in enumerate(bots):
            b.update(state="mining", assignment=order[i % len(order)], location="on_duty")
        dest = {"hydrocarbons": "sub_deck_refinery", "radioactive": "reactor_room",
                "metals": "sub_deck_refinery", "rare_earth": "sub_deck_refinery"}
        gathered = {r: 0.0 for r in want}
        s = self.stock()
        fuel_gap = max(0, TARGET["reactor_fuel"] - s["reactor_fuel"]) + max(0, TARGET["engine_fuel"] - s["engine_fuel"])
        goal = {r: (max(800, fuel_gap - gs.ship.rooms["sub_deck_refinery"].get("hydrocarbons", 0))
                    if r == "hydrocarbons" else max(600, TARGET["reactor_rad"] - s["reactor_rad"])
                    if r == "radioactive" else want.get(r, 600)) for r in want}
        for r in want:
            if r not in dest:
                dest[r] = "sub_deck_refinery"
        for _ in range(420):
            self.tick()
            for r in want:
                if best.stockpile.get(r, 0) >= 400 and self.idle_bots():
                    amt = min(1000, best.stockpile[r])
                    if self.send("planet", dest[r], r, amt, planet=best):
                        gathered[r] += amt
            self.move_fuel()
            if all(gathered[r] >= goal[r] for r in want):
                break
        for b in gs.ship.mining_bots_list:
            if b["state"] == "mining":
                b.update(state="idle", assignment=None, location="charging_bay")
        while any(b["state"] != "idle" and b.get("location") != "planet" for b in gs.ship.transport_bots):
            self.tick()
        for b in gs.ship.transport_bots:   # bots parked on the surface come home
            if b["state"] == "idle" and b.get("location") == "planet":
                b["location"] = "charging_bay"
        gs.ship.leave_orbit()
        self.stats["mining_ticks"] += gs.tick - t0
        return True

    def build_warp_batteries(self, cost, end):
        """Manufacture warp batteries until the capacitor can hold `cost`."""
        sh = gs.ship
        need = math.ceil((cost - sh.warp_capacity()) / 3500)
        self.stats.setdefault("batteries_built", 0)
        sh.fabrication_choice["battery"] = "warp_batteries"
        sh.fabrication_assignment.update({k: 0 for k in sh.fabrication_assignment})
        sh.fabrication_assignment["battery"] = len(sh.fabrication_bots)
        sh.power_allocation["synthesis"] = max(sh.power_allocation["synthesis"], 8.0)
        target = sh.rooms["reactor_room"].get("warp_batteries", 0) + need
        t0 = gs.tick
        while sh.rooms["reactor_room"].get("warp_batteries", 0) < target and gs.tick < end:
            ref = sh.rooms["sub_deck_refinery"]
            short = [r for r, q in (("metals", 200), ("silicates", 120), ("rare_earth", 60)) if ref.get(r, 0) < q]
            if short:
                # pull from the cargo bay first, otherwise go mining for it
                moved = False
                for r in short:
                    if sh.rooms["cargo_bay"].get(r, 0) >= 50 and self.idle_bots():
                        moved |= self.send("cargo_bay", "sub_deck_refinery", r, 1000)
                if not moved and not any(b["state"] != "idle" for b in sh.transport_bots):
                    if not self.mine({r: 600 for r in short}):
                        return False
            self.tick()
        sh.fabrication_assignment["battery"] = 0
        self.stats["batteries_built"] += need
        self.stats["building_ticks"] = self.stats.get("building_ticks", 0) + gs.tick - t0
        return True

    def repair(self):
        sh = gs.ship
        if sh.system_health["warp_drive"] < 55 and self.stock()["patches"] >= 3:
            bot = next((b for b in sh.repair_bots if b["state"] == "idle"), None)
            if bot:
                sh.dispatch_repair_bot(bot["id"], {"type": "system", "key": "warp_drive"})
        for k in ("engine_3_fuel", "engine_4_fuel", "reactor_1_fuel", "reactor_3_rad"):
            if sh.system_health[k] < 50 and self.stock()["patches"] >= 3:
                bot = next((b for b in sh.repair_bots if b["state"] == "idle"), None)
                if bot:
                    sh.dispatch_repair_bot(bot["id"], {"type": "system", "key": k})

    def next_system(self):
        here = gs.ship.current_system_id
        cands = [s for s in gs.galaxy.systems if not s.visited and s.id != here]
        cands.sort(key=lambda s: gs.galaxy.distance_ly(here, s.id))
        cap = gs.ship.warp_capacity() - 50
        for s in cands:
            if world.warp_cost_tw(gs, s.id)[0] <= cap:
                return s
        return cands[0] if cands else None

    def run(self, minutes=60):
        end = minutes * 60
        while gs.tick < end:
            need = self.needs() or self.opportunity()
            if need:
                if not self.mine(need):
                    pass   # nothing useful here — move on and hope
            self.repair()
            self.move_fuel()
            dest = self.next_system()
            if not dest:
                break
            cost, _ = world.warp_cost_tw(gs, dest.id)
            if cost > gs.ship.warp_capacity():
                if not self.build_warp_batteries(cost, end):
                    break
            while gs.ship.warp_capacitor_gw < cost and gs.tick < end:
                self.tick()
                self.move_fuel()
            while any(b["state"] != "idle" for b in gs.ship.transport_bots) and gs.tick < end:
                self.tick()
            if gs.tick >= end:
                break
            ok, msg = world.begin_warp(gs, dest.id)
            if not ok:
                # e.g. drive too damaged: wait for repairs
                self.repair()
                self.tick(20)
                self.stats["repair_ticks"] += 20
                continue
            self.stats["jumps"] += 1
            while gs.ship.warp_phase and gs.tick < end:
                self.tick()
        visited = sum(1 for s in gs.galaxy.systems if s.visited)
        return visited, len(gs.galaxy.systems)


def main_cli():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="1,2,3,4,5")
    ap.add_argument("--minutes", type=int, default=60)
    ap.add_argument("--reckless", action="store_true")
    a = ap.parse_args()
    pcts = []
    for seed in [int(x) for x in a.seeds.split(",")]:
        crew = Crew(seed, reckless=a.reckless)
        v, total = crew.run(a.minutes)
        st = crew.stats
        pcts.append(v / total)
        low = {k: round(v) for k, v in st["low"].items()}
        print(f"seed {seed}: {v}/{total} systems ({v / total:.0%}) in {gs.tick // 60} min · jumps {st['jumps']} · "
              f"mining {st['mining_stops']} stops / {st['mining_ticks'] // 60} min · warp min {st['warp_min']:.0f}% · "
              f"hull min {st['hull_min']:.0f} · raids paid {st['raids_paid']} · breakdowns {len(st['breakdowns'])} · "
              f"lows {low}")
    print(f"average: {sum(pcts) / len(pcts):.0%} of systems")


if __name__ == "__main__":
    main_cli()
