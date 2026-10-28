"""Living world layer: factions, system population, situations and objectives.

Everything here runs in plain code every tick, so the galaxy is alive and the
crew always has decisions to make, even when the Ollama Game Master is not
running. When the GM is connected it can add its own situations and
objectives through /api/ai/situation and /api/ai/objective; they use the same
option/effect format and resolve through the same code.

Key ideas
---------
* Factions get a fresh temperament and standing every game.
* Systems are populated the first time the ship arrives: traders and patrols
  of the local factions, sometimes raiders, sometimes a derelict.
* A *situation* is a decision the whole crew sees: a title, a countdown and
  2-4 options. Stations vote; the captain (or whoever holds Comms / Mission)
  commits. If time runs out the default option happens.
* An *objective* is a task with a destination and a deadline, e.g. "deliver
  12 survivors to Haven". It is completed by orbiting the destination and
  using the settlement services.
"""

from __future__ import annotations

import math
import random
import time
from typing import Optional

from .constants import (
    CREW_BASE,
    NPC_RACES,
    ORBIT_DISTANCE_AU,
    PC_TO_LY,
    WARP_COST_ADDITIVE,
    WARP_COST_BASE,
    WARP_COST_EXPONENT,
)

# ── Tunables ─────────────────────────────────────────────────────────────────
OUTLAW_FACTION         = "Void Raiders"
RAIDER_DETECT_AU       = 15.0    # raiders notice the ship inside this range
RAIDER_GIVE_UP_AU      = 26.0    # ...and give up the chase beyond this range
RAIDER_SPEED_AU        = 0.55    # player at >55% sublight can outrun them
TRAFFIC_SPEED_AU       = 0.25
DERELICT_NOTICE_AU     = 6.0     # derelict situation opens inside this range
RESCUE_RANGE_AU        = 1.0     # must be this close to dock with a derelict
DEMAND_DEADLINE_TICKS  = 45
DERELICT_DEADLINE_TICKS = 240    # survivors' air runs out
WARP_SPOOL_TICKS       = 8
WARP_TRANSIT_BASE      = 10      # ticks
WARP_TRANSIT_PER_PC    = 2.0     # extra ticks per parsec
GM_ACTIVE_WINDOW_S     = 30.0    # GM counts as connected if it polled this recently
AUTO_REPLY_DELAY       = (4, 9)  # ticks before an automatic hail reply arrives

FACTION_TRAITS = [
    "honour-bound", "treacherous", "fearful", "aggressive",
    "mercantile", "isolationist", "zealous", "curious",
]
FACTION_COLORS = ["#44aaff", "#ff8844", "#aaff44", "#cc66ff", "#ffcc33", "#33ffcc"]
SPEECH_STYLES = [
    "clipped and formal", "flowery and polite", "blunt and suspicious",
    "cheerful and chatty", "cold and bureaucratic", "ritualistic, speaks of honour",
]

TRADE_GOODS = {
    # give (cargo key, amount) -> get (where, key, amount)
    "fuel":      ("cargo_bay", "hydrocarbons", 40, "engine_bay", "fuel", 2500),
    "patches":   ("cargo_bay", "metals", 60, "cargo_bay", "repair_patches", 4),
    "oxygen":    ("cargo_bay", "silicates", 50, "ship", "oxygen_reserves", 120),
    "rations":   ("cargo_bay", "metals", 40, "ship", "bio_matter_rations", 120),
    "missiles":  ("cargo_bay", "rare_earth", 30, "tactical_bridge", "missiles", 2),
}

SURVIVOR_ORIGINS = [
    "a mining hauler", "a pilgrim transport", "a survey cutter",
    "a colony ferry", "a medical frigate", "a merchant barge",
]


# ═════════════════════════════════════════════════════════════════════════════
# Setup
# ═════════════════════════════════════════════════════════════════════════════

def new_world() -> dict:
    """Empty world container stored on GameState.world."""
    return {
        "factions": {},
        "settlements": {},         # planet_id -> settlement dict
        "populated": [],           # system ids already populated
        "situations": [],
        "objectives": [],
        "log": [],                 # short crew-facing event log
        "next_id": 1,
        "gm_last_seen": 0.0,
        "arrivals": 0,             # systems entered (for the first-raid guarantee)
    }


def _nid(gs, prefix: str) -> str:
    w = gs.world
    i = w["next_id"]
    w["next_id"] += 1
    return f"{prefix}_{i}"


def init_world(gs, rng: Optional[random.Random] = None) -> None:
    """Roll factions, assign settlements, populate the starting system."""
    rng = rng or random.Random()
    gs.world = new_world()
    w = gs.world

    # Factions: every race gets a random temperament this game.
    races = list(NPC_RACES)
    rng.shuffle(races)
    for i, race in enumerate(races):
        traits = rng.sample(FACTION_TRAITS, 2)
        if i == 0:
            standing = rng.randint(30, 55)       # one likely ally
        elif i == 1:
            standing = rng.randint(-45, -25)     # one likely rival
        else:
            standing = rng.randint(-15, 25)
        if "aggressive" in traits:
            standing -= 10
        w["factions"][race] = {
            "name": race,
            "traits": traits,
            "speech": rng.choice(SPEECH_STYLES),
            "standing": standing,              # -100 (war) .. 100 (allied)
            "color": FACTION_COLORS[i % len(FACTION_COLORS)],
        }
    w["factions"][OUTLAW_FACTION] = {
        "name": OUTLAW_FACTION, "traits": ["treacherous", "aggressive"],
        "speech": "sneering and threatening", "standing": -80, "color": "#ff3344",
    }

    # Settlements: every inhabited planet belongs to a (non-outlaw) faction.
    lawful = [r for r in races]
    for system in gs.galaxy.systems:
        for planet in system.planets:
            if planet.inhabited:
                fac = rng.choice(lawful)
                w["settlements"][planet.id] = {
                    "planet_id": planet.id,
                    "planet_name": planet.name,
                    "system_id": system.id,
                    "system_name": system.name,
                    "faction": fac,
                    "trades": rng.sample(list(TRADE_GOODS.keys()), 3),
                }

    start = gs.galaxy.get_system(gs.ship.current_system_id)
    if start:
        populate_system(gs, start, rng, starting=True)


def gm_active(gs) -> bool:
    return (time.time() - gs.world.get("gm_last_seen", 0.0)) < GM_ACTIVE_WINDOW_S


def log(gs, text: str) -> None:
    gs.world["log"].append({"tick": gs.tick, "text": text})
    gs.world["log"] = gs.world["log"][-40:]


# ═════════════════════════════════════════════════════════════════════════════
# Population
# ═════════════════════════════════════════════════════════════════════════════

def _random_point(rng, max_au: float, lo=0.15, hi=0.85) -> dict:
    a = rng.uniform(0, math.pi * 2)
    d = rng.uniform(max_au * lo, max_au * hi)
    return {"x": round(d * math.cos(a), 4), "y": 0.0, "z": round(d * math.sin(a), 4)}


def spawn_npc(gs, system, *, role: str, faction: str, size: str, position: dict,
              name: Optional[str] = None, **extra) -> dict:
    idx = gs._next_npc_ship_id
    gs._next_npc_ship_id += 1
    race = faction if faction in NPC_RACES else random.choice(NPC_RACES)
    label = {"trader": "Freighter", "patrol": "Patrol", "raider": "Raider",
             "derelict": "Derelict"}.get(role, "Vessel")
    npc = {
        "id": f"npc_{idx}",
        "name": name or f"{faction} {label} {idx}",
        "race": race,
        "faction": faction,
        "role": role,
        "size": size,
        "hull_health": 100.0 if role != "derelict" else round(random.uniform(15, 40), 1),
        "position": dict(position),
        "velocity": {"x": 0.0, "y": 0.0, "z": 0.0},
        "system_id": system.id,
        "behavior": "idle",
    }
    npc.update(extra)
    gs.npc_ships.append(npc)
    return npc


def populate_system(gs, system, rng: Optional[random.Random] = None, starting: bool = False) -> None:
    """Fill a system with life the first time the ship arrives."""
    rng = rng or random.Random()
    w = gs.world
    if system.id in w["populated"]:
        return
    w["populated"].append(system.id)
    max_au = max(5.0, system.max_orbital_distance_au)

    local = [s["faction"] for s in w["settlements"].values() if s["system_id"] == system.id]
    lawful = [f for f in w["factions"] if f != OUTLAW_FACTION]
    planet_pts = [{"x": p.position["x"], "z": p.position.get("z", 0.0)} for p in system.planets] or [
        _random_point(rng, max_au)]

    # Traffic: traders hop between planets, patrols circle.
    for _ in range(rng.randint(1, 3)):
        fac = rng.choice(local or lawful)
        pts = rng.sample(planet_pts, min(len(planet_pts), 3)) + [_random_point(rng, max_au)]
        spawn_npc(gs, system, role="trader", faction=fac, size=rng.choice(["small", "medium", "large"]),
                  position=_random_point(rng, max_au), behavior="patrol", patrol_points=pts,
                  patrol_index=0, speed=TRAFFIC_SPEED_AU)
    if local or rng.random() < 0.4:
        fac = rng.choice(local or lawful)
        pts = [_random_point(rng, max_au, 0.2, 0.6) for _ in range(3)]
        spawn_npc(gs, system, role="patrol", faction=fac, size=rng.choice(["medium", "large"]),
                  position=pts[0], behavior="patrol", patrol_points=pts, patrol_index=0,
                  speed=TRAFFIC_SPEED_AU * 1.4)

    if starting:
        # The opening hook: a derelict with survivors, a short flight away.
        _spawn_derelict(gs, system, rng, near_ship=True)
        return

    w["arrivals"] += 1
    raid_chance = 1.0 if w["arrivals"] == 1 else 0.35
    if rng.random() < raid_chance:
        n = 1 if rng.random() < 0.7 else 2
        if w["arrivals"] == 1:
            # First contact: they're lurking a little inside the jump-in point.
            sp = gs.ship.position
            r = math.hypot(sp["x"], sp["z"]) or 1.0
            k = max(0.0, (r - 14.0) / r)
            base = {"x": round(sp["x"] * k, 4), "y": 0.0, "z": round(sp["z"] * k, 4)}
        else:
            base = _random_point(rng, max_au, 0.3, 0.7)
        for i in range(n):
            pos = {"x": base["x"] + i * 0.8, "y": 0.0, "z": base["z"] - i * 0.6}
            spawn_npc(gs, system, role="raider", faction=OUTLAW_FACTION,
                      size="small" if i else rng.choice(["small", "medium"]), position=pos,
                      behavior="idle", speed=RAIDER_SPEED_AU, weapon_range_au=3.0)
    if rng.random() < 0.2:
        _spawn_derelict(gs, system, rng)


def _spawn_derelict(gs, system, rng, near_ship: bool = False) -> dict:
    if near_ship:
        sp = gs.ship.position
        a = rng.uniform(0, math.pi * 2)
        d = rng.uniform(18.0, 26.0)
        pos = {"x": round(sp["x"] + d * math.cos(a), 4), "y": 0.0, "z": round(sp["z"] + d * math.sin(a), 4)}
    else:
        pos = _random_point(rng, max(5.0, system.max_orbital_distance_au), 0.2, 0.7)
    origin = rng.choice(SURVIVOR_ORIGINS)
    return spawn_npc(gs, system, role="derelict", faction=rng.choice(list(gs.world["factions"])[:-1]),
                     size="medium", position=pos, name=f"Derelict {origin.split()[-1].title()}",
                     survivors=rng.randint(8, 18), origin=origin)


# ═════════════════════════════════════════════════════════════════════════════
# Situations — crew decisions
# ═════════════════════════════════════════════════════════════════════════════

def create_situation(gs, *, kind: str, title: str, body: str, options: list,
                     default_option: str, deadline_ticks: int, source_id: Optional[str] = None,
                     from_gm: bool = False) -> dict:
    sit = {
        "id": _nid(gs, "sit"),
        "kind": kind,
        "title": title,
        "body": body,
        "source_id": source_id,
        "created_tick": gs.tick,
        "deadline_tick": gs.tick + max(10, int(deadline_ticks)),
        "options": options,             # [{id,label,hint,requires?,effects:[...]}]
        "default_option": default_option,
        "votes": {},                    # voter_id -> {"option": id, "label": name}
        "status": "open",
        "outcome": None,
        "from_gm": from_gm,
    }
    gs.world["situations"].append(sit)
    log(gs, f"⚠ {title}")
    return sit


def open_situations(gs) -> list:
    return [s for s in gs.world["situations"] if s["status"] == "open"]


def _find_npc(gs, npc_id):
    return next((n for n in gs.npc_ships if n["id"] == npc_id), None)


def _dist_to(gs, pos: dict) -> float:
    sp = gs.ship.position
    return math.hypot(pos["x"] - sp["x"], pos.get("z", 0.0) - sp["z"])


def _cargo(gs, room: str, key: str) -> float:
    if room == "ship":
        return float(getattr(gs.ship, key, 0.0))
    return float(gs.ship.rooms.get(room, {}).get(key, 0) or 0)


def _add_cargo(gs, room: str, key: str, delta: float) -> None:
    if room == "ship":
        setattr(gs.ship, key, round(max(0.0, getattr(gs.ship, key, 0.0) + delta), 2))
        return
    inv = gs.ship.rooms.setdefault(room, {})
    cur = inv.get(key, 0) or 0
    new = max(0, cur + delta)
    inv[key] = int(new) if isinstance(cur, int) and float(delta).is_integer() else round(new, 2)


def passengers(gs) -> int:
    return int(gs.ship.rooms.get("living_quarters", {}).get("people", 0) or 0)


def option_blocker(gs, sit: dict, opt: dict) -> Optional[str]:
    """Return a reason string if the option can't be chosen right now."""
    req = opt.get("requires") or {}
    if "max_distance_au" in req:
        npc = _find_npc(gs, req.get("npc_id") or sit.get("source_id"))
        if npc is None:
            return "contact lost"
        d = _dist_to(gs, npc["position"])
        if d > req["max_distance_au"]:
            return f"must be within {req['max_distance_au']:g} AU (now {d:.1f})"
    for key, amount in (req.get("cargo") or {}).items():
        room, item = key.split(".", 1) if "." in key else ("cargo_bay", key)
        if _cargo(gs, room, item) < amount:
            return f"need {amount:g} {item.replace('_', ' ')}"
    if req.get("not_in_warp") and gs.ship.warp_phase:
        return "not while in warp"
    return None


def cast_vote(gs, sit_id: str, option_id: str, voter_id: str, voter_label: str) -> Optional[str]:
    sit = next((s for s in open_situations(gs) if s["id"] == sit_id), None)
    if not sit:
        return "Situation is no longer open"
    if not any(o["id"] == option_id for o in sit["options"]):
        return "Unknown option"
    sit["votes"][voter_id[:40]] = {"option": option_id, "label": (voter_label or "Crew")[:24]}
    return None


def commit_situation(gs, sit_id: str, option_id: str, by: str = "captain") -> Optional[str]:
    sit = next((s for s in open_situations(gs) if s["id"] == sit_id), None)
    if not sit:
        return "Situation is no longer open"
    opt = next((o for o in sit["options"] if o["id"] == option_id), None)
    if not opt:
        return "Unknown option"
    block = option_blocker(gs, sit, opt)
    if block:
        return f"Can't do that yet: {block}"
    _resolve(gs, sit, opt, by)
    return None


def _resolve(gs, sit: dict, opt: dict, by: str) -> None:
    sit["status"] = "resolved"
    sit["chosen"] = opt["id"]
    sit["resolved_tick"] = gs.tick
    sit["resolved_by"] = by
    texts = apply_effects(gs, opt.get("effects") or [], sit)
    sit["outcome"] = " ".join(t for t in texts if t) or opt["label"]
    log(gs, f"✓ {sit['title']}: {opt['label']}")


def _plurality(sit: dict) -> Optional[str]:
    counts: dict = {}
    for v in sit["votes"].values():
        counts[v["option"]] = counts.get(v["option"], 0) + 1
    if not counts:
        return None
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _expire_situations(gs) -> None:
    for sit in open_situations(gs):
        if gs.tick < sit["deadline_tick"]:
            continue
        # Time's up: the crew's most-voted option if it is possible, else the default.
        choice = None
        voted = _plurality(sit)
        for oid in (voted, sit["default_option"]):
            opt = next((o for o in sit["options"] if o["id"] == oid), None)
            if opt and not option_blocker(gs, sit, opt):
                choice = opt
                break
        if choice is None:
            choice = next((o for o in sit["options"] if o["id"] == sit["default_option"]), sit["options"][0])
        _resolve(gs, sit, choice, "timeout" if voted is None else "vote")


# ── Effects ──────────────────────────────────────────────────────────────────
# One small interpreter shared by built-in encounters and GM-authored ones.
# Each effect returns an optional crew-facing sentence.

def apply_effects(gs, effects: list, sit: Optional[dict] = None) -> list:
    out = []
    for eff in effects or []:
        try:
            out.append(_apply_effect(gs, eff, sit))
        except Exception as e:  # never let a bad effect break the tick loop
            out.append(None)
            print(f"[world] effect failed {eff}: {e}")
    return out


def _apply_effect(gs, eff: dict, sit: Optional[dict]) -> Optional[str]:
    t = eff.get("type")
    src = sit.get("source_id") if sit else None
    if t == "message":
        _inbox(gs, eff.get("from_id", src or "unknown"), eff.get("from_name", "Unknown"),
               eff.get("subject", "Transmission"), eff.get("body", ""),
               color=eff.get("color", "#4488ff"), delay=int(eff.get("delay_ticks", 0)))
        return None
    if t == "npc_behavior":
        npc = _find_npc(gs, eff.get("npc_id") or src)
        if npc:
            npc["behavior"] = eff.get("behavior", "idle")
            if eff.get("target_id"):
                npc["target_id"] = eff["target_id"]
            if eff.get("speed"):
                npc["speed"] = float(eff["speed"])
            if npc["behavior"] == "flee" and not npc.get("target_id"):
                npc["target_id"] = "player"
        return None
    if t == "cargo":
        for key, delta in (eff.get("delta") or {}).items():
            room, item = key.split(".", 1) if "." in key else ("cargo_bay", key)
            _add_cargo(gs, room, item, float(delta))
        return eff.get("text")
    if t == "passengers":
        _add_cargo(gs, "living_quarters", "people", int(eff.get("delta", 0)))
        return eff.get("text")
    if t == "standing":
        fac = gs.world["factions"].get(eff.get("faction"))
        if fac:
            fac["standing"] = max(-100, min(100, fac["standing"] + int(eff.get("delta", 0))))
        return eff.get("text")
    if t == "objective":
        create_objective(gs, **{k: v for k, v in eff.items() if k != "type"})
        return eff.get("text")
    if t == "despawn":
        nid = eff.get("npc_id") or src
        gs.npc_ships = [n for n in gs.npc_ships if n["id"] != nid]
        return eff.get("text")
    if t == "hull":
        gs.ship.hull_health = round(max(0.0, min(100.0, gs.ship.hull_health + float(eff.get("delta", 0)))), 1)
        return eff.get("text")
    if t == "text":
        return eff.get("text")
    if t == "bluff":
        # Success chance grows with the power the crew shows on weapons + shields.
        npc = _find_npc(gs, src)
        p = bluff_chance(gs, npc)
        branch = eff.get("success") if random.random() < p else eff.get("failure")
        return " ".join(x for x in apply_effects(gs, branch or [], sit) if x)
    if t == "rescue":
        npc = _find_npc(gs, src)
        n = int(npc.get("survivors", 0)) if npc else 0
        if npc:
            npc["survivors"] = 0
        _add_cargo(gs, "living_quarters", "people", n)
        dest = _nearest_settlement(gs, exclude_system=gs.ship.current_system_id) or _nearest_settlement(gs)
        if dest and n:
            deadline = int(eta_ticks_to(gs, dest["system_id"]) * 1.5) + 240
            create_objective(gs, kind="deliver_passengers", title=f"Deliver {n} survivors to {dest['planet_name']}",
                             detail=f"Survivors from {npc.get('origin', 'the wreck')}. Every extra person aboard "
                                    f"uses oxygen and rations — get them to a settlement in time.",
                             planet_id=dest["planet_id"], amount=n, deadline_ticks=deadline,
                             reward={"standing": {dest["faction"]: 15}, "cargo": {"repair_patches": 6, "metals": 80}},
                             penalty={"standing": {dest["faction"]: -10}})
        return f"{n} survivors brought aboard." if n else "No one left to save."
    if t == "salvage":
        npc = _find_npc(gs, src)
        _add_cargo(gs, "cargo_bay", "metals", 120)
        _add_cargo(gs, "cargo_bay", "space_scrap", 60)
        _add_cargo(gs, "cargo_bay", "electronics", 3)
        if npc:
            gs.npc_ships = [n for n in gs.npc_ships if n["id"] != npc["id"]]
        return "Salvage crews strip the wreck: +120 metals, +60 scrap, +3 electronics."
    raise ValueError(f"unknown effect type {t}")


def bluff_chance(gs, npc: Optional[dict]) -> float:
    sh = gs.ship
    total = sh.net_power_gw() or 1.0
    shown = total * (sh.power_allocation.get("weapons", 0) + sh.power_allocation.get("shields", 0)) / 100.0
    size = {"small": 1.0, "medium": 1.5, "large": 2.2, "capital": 3.5}.get((npc or {}).get("size"), 1.5)
    return round(max(0.1, min(0.9, shown / (140.0 * size))), 2)


# ═════════════════════════════════════════════════════════════════════════════
# Objectives
# ═════════════════════════════════════════════════════════════════════════════

def create_objective(gs, *, title: str, kind: str = "visit", detail: str = "",
                     planet_id: Optional[str] = None, system_id: Optional[str] = None,
                     amount: int = 0, deadline_ticks: Optional[int] = None,
                     reward: Optional[dict] = None, penalty: Optional[dict] = None, **_ignored) -> dict:
    sett = gs.world["settlements"].get(planet_id) if planet_id else None
    if sett and not system_id:
        system_id = sett["system_id"]
    sysobj = gs.galaxy.get_system(system_id) if system_id else None
    obj = {
        "id": _nid(gs, "obj"),
        "kind": kind,                      # deliver_passengers | deliver_cargo | visit
        "title": title,
        "detail": detail,
        "planet_id": planet_id,
        "planet_name": sett["planet_name"] if sett else None,
        "system_id": system_id,
        "system_name": sysobj.name if sysobj else None,
        "amount": int(amount),
        "created_tick": gs.tick,
        "deadline_tick": gs.tick + int(deadline_ticks) if deadline_ticks else None,
        "reward": reward or {},
        "penalty": penalty or {},
        "status": "active",
    }
    gs.world["objectives"].append(obj)
    log(gs, f"◆ New objective: {title}")
    return obj


def _settle_objective(gs, obj: dict, success: bool) -> str:
    obj["status"] = "complete" if success else "failed"
    obj["closed_tick"] = gs.tick
    bundle = obj["reward"] if success else obj["penalty"]
    for fac, d in (bundle.get("standing") or {}).items():
        f = gs.world["factions"].get(fac)
        if f:
            f["standing"] = max(-100, min(100, f["standing"] + int(d)))
    for key, d in (bundle.get("cargo") or {}).items():
        room, item = key.split(".", 1) if "." in key else ("cargo_bay", key)
        _add_cargo(gs, room, item, float(d))
    word = "complete" if success else "FAILED"
    log(gs, f"◆ Objective {word}: {obj['title']}")
    return word


def _expire_objectives(gs) -> None:
    for obj in gs.world["objectives"]:
        if obj["status"] == "active" and obj["deadline_tick"] and gs.tick >= obj["deadline_tick"]:
            _settle_objective(gs, obj, False)
            sett = gs.world["settlements"].get(obj.get("planet_id"))
            if sett:
                _inbox(gs, f"planet_{sett['planet_id']}", f"{sett['faction']} Authority",
                       "Deadline missed", f"You were expected at {sett['planet_name']}. "
                       f"We won't forget this.", color=gs.world["factions"][sett["faction"]]["color"])


# ═════════════════════════════════════════════════════════════════════════════
# Settlements
# ═════════════════════════════════════════════════════════════════════════════

def _nearest_settlement(gs, exclude_system: Optional[str] = None) -> Optional[dict]:
    best, best_d = None, float("inf")
    for s in gs.world["settlements"].values():
        if exclude_system and s["system_id"] == exclude_system:
            continue
        d = 0.0 if s["system_id"] == gs.ship.current_system_id else gs.galaxy.distance_ly(
            gs.ship.current_system_id, s["system_id"])
        if d < best_d:
            best, best_d = s, d
    return best


def current_settlement(gs) -> Optional[dict]:
    pid = gs.ship.orbiting_planet_id
    return gs.world["settlements"].get(pid) if pid else None


def settlement_action(gs, action: str, arg: Optional[str] = None) -> tuple[bool, str]:
    sett = current_settlement(gs)
    if not sett:
        return False, "Not in orbit of a settlement"
    fac = gs.world["factions"][sett["faction"]]
    if fac["standing"] <= -60:
        return False, f"{sett['faction']} refuse to deal with you"

    if action == "deliver":
        done = []
        for obj in gs.world["objectives"]:
            if obj["status"] != "active" or obj.get("planet_id") != sett["planet_id"]:
                continue
            if obj["kind"] == "deliver_passengers":
                if passengers(gs) < obj["amount"]:
                    continue
                _add_cargo(gs, "living_quarters", "people", -obj["amount"])
            elif obj["kind"] == "deliver_cargo":
                if obj.get("cargo_tag") and _cargo(gs, "cargo_bay", obj["cargo_tag"]) < obj["amount"]:
                    continue
                if obj.get("cargo_tag"):
                    _add_cargo(gs, "cargo_bay", obj["cargo_tag"], -obj["amount"])
            _settle_objective(gs, obj, True)
            done.append(obj["title"])
        # Stray passengers can always be dropped off, for a little goodwill.
        extra = passengers(gs)
        if extra and not done:
            _add_cargo(gs, "living_quarters", "people", -extra)
            fac["standing"] = min(100, fac["standing"] + 3)
            return True, f"{extra} passengers disembark at {sett['planet_name']}."
        if not done:
            return False, "Nothing to deliver here"
        return True, "Delivered: " + "; ".join(done)

    if action == "trade":
        if arg not in sett["trades"]:
            return False, "They don't offer that trade"
        g_room, g_key, g_amt, r_room, r_key, r_amt = TRADE_GOODS[arg]
        if _cargo(gs, g_room, g_key) < g_amt:
            return False, f"Need {g_amt} {g_key.replace('_', ' ')} in the cargo bay"
        _add_cargo(gs, g_room, g_key, -g_amt)
        _add_cargo(gs, r_room, r_key, r_amt)
        return True, f"Traded {g_amt} {g_key.replace('_', ' ')} for {r_amt} {r_key.replace('_', ' ')}."

    if action == "job":
        if any(o["status"] == "active" and o.get("issuer") == sett["planet_id"] for o in gs.world["objectives"]):
            return False, "They already gave you a job"
        others = [s for s in gs.world["settlements"].values() if s["system_id"] != sett["system_id"]]
        if not others:
            return False, "No other settlements to deliver to"
        others.sort(key=lambda s: gs.galaxy.distance_ly(sett["system_id"], s["system_id"]))
        dest = random.choice(others[:3])
        cargo = random.choice(["medical supplies", "seed stock", "reactor parts", "sealed diplomatic pouch"])
        deadline = eta_ticks_to(gs, dest["system_id"]) + 300
        obj = create_objective(
            gs, kind="deliver_cargo", title=f"Carry {cargo} to {dest['planet_name']}",
            detail=f"A job from {sett['planet_name']} ({sett['faction']}).",
            planet_id=dest["planet_id"], amount=0, deadline_ticks=deadline,
            reward={"standing": {sett["faction"]: 10, dest["faction"]: 5},
                    "cargo": {"metals": 150, "rare_earth": 40, "engine_bay.fuel": 3000}},
            penalty={"standing": {sett["faction"]: -15}})
        obj["issuer"] = sett["planet_id"]
        return True, f"Job accepted: {obj['title']}"

    return False, "Unknown settlement action"


def settlement_view(gs) -> Optional[dict]:
    sett = current_settlement(gs)
    if not sett:
        return None
    fac = gs.world["factions"][sett["faction"]]
    trades = []
    for key in sett["trades"]:
        g_room, g_key, g_amt, r_room, r_key, r_amt = TRADE_GOODS[key]
        trades.append({"id": key, "give": f"{g_amt} {g_key.replace('_', ' ')}",
                       "get": f"{r_amt} {r_key.replace('_', ' ')}",
                       "can_afford": _cargo(gs, g_room, g_key) >= g_amt})
    deliverable = [o["id"] for o in gs.world["objectives"]
                   if o["status"] == "active" and o.get("planet_id") == sett["planet_id"]]
    return {**sett, "standing": fac["standing"], "trades": trades, "deliverable": deliverable,
            "refuses": fac["standing"] <= -60}


# ═════════════════════════════════════════════════════════════════════════════
# Travel helpers (warp + autopilot)
# ═════════════════════════════════════════════════════════════════════════════

def warp_cost_tw(gs, system_id: str) -> tuple[float, float]:
    dist_pc = gs.galaxy.distance_ly(gs.ship.current_system_id, system_id) / PC_TO_LY
    return WARP_COST_BASE * (dist_pc ** WARP_COST_EXPONENT) + WARP_COST_ADDITIVE, dist_pc


def warp_transit_ticks(dist_pc: float) -> int:
    return int(round(WARP_TRANSIT_BASE + WARP_TRANSIT_PER_PC * dist_pc))


def eta_ticks_to(gs, system_id: str) -> int:
    """Rough door-to-door estimate used to set fair deadlines."""
    if system_id == gs.ship.current_system_id:
        return 90
    cost, pc = warp_cost_tw(gs, system_id)
    charge_time = max(0.0, cost - gs.ship.warp_capacitor_gw) / 25.0
    return int(charge_time + WARP_SPOOL_TICKS + warp_transit_ticks(pc) + 120)


def begin_warp(gs, system_id: str) -> tuple[bool, str]:
    sh = gs.ship
    if sh.warp_phase:
        return False, "Already warping"
    target = gs.galaxy.get_system(system_id)
    if not target:
        return False, "System not found"
    if target.id == sh.current_system_id:
        return False, "Already in that system"
    if sh.system_health.get("warp_drive", 100.0) <= 0:
        return False, "Warp drive non-functional"
    cost, pc = warp_cost_tw(gs, target.id)
    if sh.warp_capacitor_gw < cost:
        return False, (f"Insufficient warp charge ({sh.warp_capacitor_gw:,.0f} TW, "
                       f"need {cost:,.0f} TW for {pc:.1f} pc)")
    sh.warp_capacitor_gw = round(sh.warp_capacitor_gw - cost, 2)
    sh.leave_orbit()
    sh.course = None
    sh.thrust = 0.0
    sh.warp_phase = "spool"
    sh.warp_dest_id = target.id
    sh.warp_dest_name = target.name
    sh.warp_ticks_left = WARP_SPOOL_TICKS
    sh.warp_transit_total = warp_transit_ticks(pc)
    sh.warp_cost_paid = round(cost, 2)
    log(gs, f"Warp drive spooling for {target.name} ({pc:.1f} pc)")
    return True, f"Spooling warp drive — {target.name}, {pc:.1f} pc"


def cancel_warp(gs) -> tuple[bool, str]:
    sh = gs.ship
    if sh.warp_phase != "spool":
        return False, "Can only abort while spooling"
    refund = round(sh.warp_cost_paid * 0.5, 2)
    sh.warp_capacitor_gw = round(sh.warp_capacitor_gw + refund, 2)
    sh.warp_phase = None
    sh.warp_dest_id = None
    log(gs, "Warp aborted")
    return True, f"Warp aborted — {refund:,.0f} TW recovered"


def update_warp(gs) -> None:
    sh = gs.ship
    if not sh.warp_phase:
        return
    sh.warp_ticks_left -= 1
    if sh.warp_ticks_left > 0:
        return
    if sh.warp_phase == "spool":
        sh.warp_phase = "transit"
        sh.warp_ticks_left = sh.warp_transit_total
        log(gs, f"Jumped to warp — {sh.warp_dest_name}")
        return
    # Arrival
    target = gs.galaxy.get_system(sh.warp_dest_id)
    sh.warp_phase = None
    sh.warp_dest_id = None
    if target:
        sh.warp_to(target.id, target.max_orbital_distance_au)
        target.visited = True
        populate_system(gs, target)
        log(gs, f"Arrived at {target.name}")


def course_target_pos(gs) -> Optional[dict]:
    c = gs.ship.course
    if not c:
        return None
    if c["kind"] == "planet":
        sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
        p = sysobj.get_planet(c["id"]) if sysobj else None
        return p.position if p else None
    if c["kind"] == "npc":
        n = _find_npc(gs, c["id"])
        if n and n["system_id"] == gs.ship.current_system_id:
            return n["position"]
        return None
    if c["kind"] == "point":
        return c.get("pos")
    return None


def apply_autopilot(gs) -> None:
    """Steer toward the plotted course and stop just short of it."""
    sh = gs.ship
    sh.max_step_au = None
    if not sh.course or sh.orbiting_planet_id:
        return
    pos = course_target_pos(gs)
    if pos is None:
        sh.course = None
        return
    dx = pos["x"] - sh.position["x"]
    dz = pos.get("z", 0.0) - sh.position["z"]
    d = math.hypot(dx, dz)
    stop_at = ORBIT_DISTANCE_AU * 0.6 if sh.course["kind"] == "planet" else 0.6
    if d <= stop_at + 0.01:
        sh.thrust = 0.0
        sh.course = None
        log(gs, "Autopilot: arrived")
        return
    sh.target_direction = {"x": dx / d, "y": 0.0, "z": dz / d}
    sh.max_step_au = d - stop_at


# ═════════════════════════════════════════════════════════════════════════════
# Encounter director
# ═════════════════════════════════════════════════════════════════════════════

def _has_situation_for(gs, npc_id: str, kind: Optional[str] = None) -> bool:
    return any(s.get("source_id") == npc_id and (kind is None or s["kind"] == kind)
               for s in gs.world["situations"])


def _inbox(gs, from_id, from_name, subject, body, color="#4488ff", delay=0) -> None:
    kwargs = dict(from_id=from_id, from_name=from_name, to_id="player", to_name="TSC Prometheus",
                  subject=subject, body=body, direction="inbox", has_video=True, video_color=color)
    if delay > 0:
        gs.pending_messages.append({"deliver_at_tick": gs.tick + delay, "kwargs": kwargs})
    else:
        gs._make_message(**kwargs)


def _raider_demand(gs, npc: dict) -> None:
    fac = gs.world["factions"][OUTLAW_FACTION]
    toll = {"small": 60, "medium": 100, "large": 160}.get(npc["size"], 100)
    npc["behavior"] = "intercept"
    npc["target_id"] = "player"
    npc["speed"] = RAIDER_SPEED_AU
    _inbox(gs, npc["id"], npc["name"], "Cut your engines",
           f"Nice ship. Be a shame to scratch it. Dump {toll} metals out the airlock "
           f"and we'll let you fly on. You have forty-five seconds.", color=fac["color"])
    create_situation(
        gs, kind="raider_demand", source_id=npc["id"],
        title=f"Raiders demand {toll} metals",
        body=(f"{npc['name']} ({npc['size']}) is closing fast and wants a toll. Pay up, call their bluff "
              f"by showing power on weapons and shields, or fight. Running works too if the engines "
              f"can outpace them ({RAIDER_SPEED_AU:g} AU/s) — or warp out."),
        deadline_ticks=DEMAND_DEADLINE_TICKS,
        default_option="refuse",
        options=[
            {"id": "pay", "label": f"Pay {toll} metals", "hint": "Safe, costly",
             "requires": {"cargo": {"metals": toll}},
             "effects": [{"type": "cargo", "delta": {"metals": -toll}},
                         {"type": "npc_behavior", "behavior": "flee"},
                         {"type": "text", "text": "The raiders take the toll and peel away."}]},
            {"id": "bluff", "label": "Warn them off", "hint": "Odds rise with weapons + shields power",
             "effects": [{"type": "bluff",
                          "success": [{"type": "npc_behavior", "behavior": "flee"},
                                      {"type": "text", "text": "They blink first and break off."}],
                          "failure": [{"type": "npc_behavior", "behavior": "attack", "target_id": "player"},
                                      {"type": "text", "text": "They laugh — and open fire."}]}]},
            {"id": "refuse", "label": "Refuse — battle stations", "hint": "They attack",
             "effects": [{"type": "npc_behavior", "behavior": "attack", "target_id": "player"},
                         {"type": "text", "text": "Raiders opening fire!"}]},
        ],
    )


def _derelict_found(gs, npc: dict) -> None:
    n = npc.get("survivors", 0)
    create_situation(
        gs, kind="derelict", source_id=npc["id"],
        title=f"Distress beacon: {npc['name']}",
        body=(f"A crippled {npc.get('origin', 'ship')} drifts ahead. Life signs: {n}. Their air will last "
              f"about {DERELICT_DEADLINE_TICKS // 60} minutes. Docking needs the ship within "
              f"{RESCUE_RANGE_AU:g} AU. Rescued survivors use oxygen and rations until you reach a settlement."),
        deadline_ticks=DERELICT_DEADLINE_TICKS,
        default_option="ignore",
        options=[
            {"id": "rescue", "label": f"Dock and take {n} aboard", "hint": "Creates a delivery deadline",
             "requires": {"max_distance_au": RESCUE_RANGE_AU, "not_in_warp": True},
             "effects": [{"type": "rescue"}, {"type": "standing", "faction": npc["faction"], "delta": 5}]},
            {"id": "salvage", "label": "Strip it for salvage", "hint": "Metals and parts — survivors are lost",
             "requires": {"max_distance_au": RESCUE_RANGE_AU, "not_in_warp": True},
             "effects": [{"type": "salvage"}, {"type": "standing", "faction": npc["faction"], "delta": -10}]},
            {"id": "ignore", "label": "Leave them", "hint": "No cost — no help",
             "effects": [{"type": "text", "text": "The beacon fades behind you."}]},
        ],
    )


def update_world(gs) -> None:
    """Called every tick from the game loop (after NPC movement)."""
    w = getattr(gs, "world", None)
    if not w or not gs.is_started():
        return
    sh = gs.ship
    _expire_situations(gs)
    _expire_objectives(gs)
    if sh.warp_phase == "transit":
        return

    for npc in list(gs.npc_ships):
        if npc.get("system_id") != sh.current_system_id:
            continue
        d = _dist_to(gs, npc["position"])
        role = npc.get("role")
        if role == "raider":
            beh = npc.get("behavior", "idle")
            if not _has_situation_for(gs, npc["id"]) and d <= RAIDER_DETECT_AU and not sh.warp_phase:
                _raider_demand(gs, npc)
            elif beh in ("attack", "intercept") and d > RAIDER_GIVE_UP_AU:
                npc["behavior"] = "idle"
                npc["target_id"] = None
                for s in open_situations(gs):
                    if s["source_id"] == npc["id"]:
                        s["status"] = "resolved"
                        s["outcome"] = "You outran them."
                        s["chosen"] = None
                log(gs, f"{npc['name']} gave up the chase")
                _inbox(gs, npc["id"], npc["name"], "Next time",
                       "Run while you can. This lane is ours.", color="#ff3344")
        elif role == "derelict":
            if npc.get("survivors", 0) > 0 and not _has_situation_for(gs, npc["id"]) and d <= DERELICT_NOTICE_AU:
                _derelict_found(gs, npc)

    # Raiders that were destroyed resolve their situation.
    alive = {n["id"] for n in gs.npc_ships}
    for s in open_situations(gs):
        if s["kind"] == "raider_demand" and s["source_id"] not in alive:
            s["status"] = "resolved"
            s["outcome"] = "Raider destroyed. Salvage recovered."
            _add_cargo(gs, "cargo_bay", "space_scrap", 40)
            _add_cargo(gs, "cargo_bay", "metals", 60)
            log(gs, "✓ Raider destroyed")


# ═════════════════════════════════════════════════════════════════════════════
# Hails — automatic replies when the GM isn't connected
# ═════════════════════════════════════════════════════════════════════════════

def _intent(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ("surrender", "give up", "mercy", "don't shoot", "dont shoot")):
        return "surrender"
    if any(k in t for k in ("stand down", "back off", "open fire", "destroy", "warning", "leave")):
        return "threat"
    if any(k in t for k in ("trade", "buy", "sell", "fuel", "supplies", "cargo")):
        return "trade"
    if any(k in t for k in ("help", "assist", "aid", "distress", "survivor", "rescue")):
        return "help"
    if any(k in t for k in ("raider", "pirate", "danger", "threat", "news", "rumou", "rumor")):
        return "intel"
    return "greet"


_REPLIES = {
    "raider": {
        "surrender": "Smart. Dump the cargo and keep your engines cold.",
        "threat": "Big words from a ship that small.",
        "trade": "Only trade we do is your cargo for your life.",
        "help": "Help? Sure. Help yourself to the airlock.",
        "intel": "Danger's sitting right in front of you, friend.",
        "greet": "You're in our lane. Pay or bleed.",
    },
    "trader": {
        "surrender": "We're merchants, not soldiers! We have no quarrel with you.",
        "threat": "No need for that! We're leaving, we're leaving.",
        "trade": "We only sell at the settlements, captain — dock with one and ask for the trading post.",
        "help": "We can't spare much, but the nearest settlement is {settlement}.",
        "intel": "Watch yourselves — {raiders}",
        "greet": "Fair travels. We're hauling between the inner worlds.",
    },
    "patrol": {
        "surrender": "We accept. Hold position and power down weapons.",
        "threat": "Threatening a {faction} patrol is unwise. Stand down.",
        "trade": "This is a patrol vessel. Take commerce to {settlement}.",
        "help": "Noted. We'll log your request with {settlement}.",
        "intel": "{raiders}",
        "greet": "{faction} patrol. State your business in this system.",
    },
    "planet": {
        "surrender": "We're not at war with you, captain.",
        "threat": "Our defences are ready. We would rather talk.",
        "trade": "Our trading post is open to ships in orbit. Come down and see what we have.",
        "help": "If you're carrying people in need, bring them here — we'll take them in.",
        "intel": "{raiders}",
        "greet": "Welcome. Orbit and dock if you want trade, work or to drop off passengers.",
    },
}


def auto_reply(gs, to_id: str, to_name: str, subject: str, body: str, color: str) -> None:
    if gm_active(gs):
        return   # the Game Master will answer in character
    npc = _find_npc(gs, to_id)
    if npc:
        role = npc.get("role", "trader")
        if role == "derelict":
            return
        faction = npc.get("faction", "Unknown")
        name = npc["name"]
    else:
        role = "planet"
        sett = gs.world["settlements"].get(to_id.replace("planet_", "", 1))
        faction = sett["faction"] if sett else "Colony"
        name = to_name
    intent = _intent(f"{subject} {body}")
    table = _REPLIES.get(role, _REPLIES["trader"])
    raiders_here = [n for n in gs.npc_ships
                    if n.get("role") == "raider" and n["system_id"] == gs.ship.current_system_id]
    near = _nearest_settlement(gs)
    text = table[intent].format(
        faction=faction,
        settlement=near["planet_name"] if near else "nowhere close",
        raiders=("Raiders are working this system. Keep your shields up." if raiders_here
                 else "Quiet lanes lately. Can't promise it'll last."),
    )
    fac = gs.world["factions"].get(faction)
    if fac and role != "raider":
        if fac["standing"] < -30:
            text = "We have nothing to say to you. " + ("Leave." if intent != "trade" else "")
        elif "fearful" in fac["traits"] and intent == "threat":
            text = "Please! We'll go — don't fire!"
            if npc:
                npc["behavior"] = "flee"
                npc["target_id"] = "player"
    if intent == "surrender" and role == "raider" and npc:
        for s in open_situations(gs):
            if s["source_id"] == npc["id"]:
                text += " (Pay the toll from the situation panel.)"
    _inbox(gs, to_id, name, f"RE: {subject}"[:200], text, color=(fac or {}).get("color", color),
           delay=random.randint(*AUTO_REPLY_DELAY))


# ═════════════════════════════════════════════════════════════════════════════
# State view
# ═════════════════════════════════════════════════════════════════════════════

def world_view(gs) -> dict:
    w = gs.world
    sh = gs.ship
    sits = []
    for s in w["situations"][-8:]:
        v = {k: s[k] for k in ("id", "kind", "title", "body", "source_id", "created_tick",
                               "deadline_tick", "default_option", "status", "outcome", "from_gm")}
        v["chosen"] = s.get("chosen")
        v["votes"] = list(s["votes"].values())
        v["options"] = [{"id": o["id"], "label": o["label"], "hint": o.get("hint", ""),
                         "blocked": option_blocker(gs, s, o) if s["status"] == "open" else None,
                         "votes": sum(1 for x in s["votes"].values() if x["option"] == o["id"])}
                        for o in s["options"]]
        if s["kind"] == "raider_demand" and s["status"] == "open":
            v["bluff_chance"] = bluff_chance(gs, _find_npc(gs, s["source_id"]))
        sits.append(v)
    people = CREW_BASE + passengers(gs)
    o2_ticks = int(sh.oxygen_reserves / people * 100) if people else None
    food_ticks = int(sh.bio_matter_rations / people * 100) if people else None
    warp = None
    if sh.warp_phase:
        warp = {"phase": sh.warp_phase, "dest_id": sh.warp_dest_id, "dest_name": sh.warp_dest_name,
                "ticks_left": sh.warp_ticks_left,
                "transit_total": sh.warp_transit_total}
    course = None
    if sh.course:
        pos = course_target_pos(gs)
        if pos:
            d = _dist_to(gs, pos)
            speed = sh.thrust * sh.engine_thrust_au
            course = {**{k: v for k, v in sh.course.items() if k != "pos"}, "distance_au": round(d, 2),
                      "eta_ticks": int(d / speed) if speed > 1e-6 else None}
    objs = [o for o in w["objectives"] if o["status"] == "active"] + \
           [o for o in w["objectives"] if o["status"] != "active"][-4:]
    for o in objs:
        if o.get("system_id") and o["status"] == "active":
            if o["system_id"] == sh.current_system_id:
                o["route"] = {"same_system": True}
            else:
                cost, pc = warp_cost_tw(gs, o["system_id"])
                o["route"] = {"same_system": False, "dist_pc": round(pc, 1), "warp_cost_tw": round(cost),
                              "transit_ticks": warp_transit_ticks(pc), "eta_ticks": eta_ticks_to(gs, o["system_id"])}
    return {
        "factions": list(w["factions"].values()),
        "situations": sits,
        "objectives": objs,
        "settlement": settlement_view(gs),
        "log": w["log"][-12:],
        "warp": warp,
        "course": course,
        "passengers": passengers(gs),
        "people_aboard": people,
        "o2_ticks_left": o2_ticks,
        "food_ticks_left": food_ticks,
        "gm_active": gm_active(gs),
        "constants": {"WARP_SPOOL_TICKS": WARP_SPOOL_TICKS, "WARP_TRANSIT_BASE": WARP_TRANSIT_BASE,
                      "WARP_TRANSIT_PER_PC": WARP_TRANSIT_PER_PC, "RAIDER_SPEED_AU": RAIDER_SPEED_AU,
                      "RESCUE_RANGE_AU": RESCUE_RANGE_AU},
    }
