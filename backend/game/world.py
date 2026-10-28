"""Living world layer: factions, system population, and how the galaxy reacts.

Design rule: the game never hands the crew a menu of choices. Ships and
settlements talk over comms and react to what physically happens:

* A crippled ship broadcasts a mayday. Its air really runs out. Oxygen that a
  transport bot carries over buys it time; enough repair patches get it flying;
  people can be ferried back to the living quarters and later down to a
  settlement in orbit.
* Raiders demand a toll over comms. They only leave if the toll actually
  arrives in their hold (by transport bot), if a threat convinces them, if the
  crew outruns them, or if they're destroyed.
* Traders and settlements make offers when hailed. Payment is delivered by
  bot; the goods appear in their hold / depot and the crew fetches them.

Everything works without the Ollama Game Master. When the GM is connected it
answers hails in character and can give NPCs cargo and wants of its own
(/api/ai/npc/{id}/cargo, /api/ai/npc/{id}/wants, /api/ai/settlement/{id}/wants).
"""

from __future__ import annotations

import math
import random
import time
from typing import Optional

from .constants import (
    CREW_BASE,
    WARP_MIN_HEALTH,
    WARP_WEAR_BASE,
    WARP_WEAR_PER_PC,
    NPC_RACES,
    ORBIT_DISTANCE_AU,
    PC_TO_LY,
    WARP_COST_ADDITIVE,
    WARP_COST_BASE,
    WARP_COST_EXPONENT,
)

# ── Tunables ─────────────────────────────────────────────────────────────────
OUTLAW_FACTION        = "Void Raiders"
TRANSPORT_RANGE_AU    = 1.5     # bots can only reach ships this close
RAIDER_DETECT_AU      = 15.0    # raiders notice the ship inside this range
RAIDER_GIVE_UP_AU     = 20.0    # ...and give up the chase beyond this range
RAIDER_SPEED_AU       = 0.55    # player at >55% sublight can outrun them
RAIDER_PATIENCE_TICKS = 45      # time to pay before they open fire
TRAFFIC_SPEED_AU      = 0.25
TRADER_HOLD_TICKS     = 120     # a trader that agrees to a deal waits for your bot
DERELICT_AIR_TICKS    = (240, 330)
AIR_TICKS_PER_O2      = 3       # each unit of oxygen delivered buys this many seconds
DERELICT_PATCHES      = 6       # repair patches that get a derelict moving again
WARP_SPOOL_TICKS      = 8
WARP_TRANSIT_BASE     = 6       # ticks
WARP_TRANSIT_PER_PC   = 1.5     # extra ticks per parsec
GM_ACTIVE_WINDOW_S    = 30.0    # GM counts as connected if it polled this recently
REPLY_DELAY           = (4, 9)  # ticks before an NPC answers a hail

FACTION_TRAITS = [
    "honour-bound", "treacherous", "fearful", "aggressive",
    "mercantile", "isolationist", "zealous", "curious",
]
FACTION_COLORS = ["#44aaff", "#ff8844", "#aaff44", "#cc66ff", "#ffcc33", "#33ffcc"]
SPEECH_STYLES = [
    "clipped and formal", "flowery and polite", "blunt and suspicious",
    "cheerful and chatty", "cold and bureaucratic", "ritualistic, speaks of honour",
]
SURVIVOR_ORIGINS = [
    "mining hauler", "pilgrim transport", "survey cutter",
    "colony ferry", "medical frigate", "merchant barge",
]

# Things people trade. (want item, want amount, give item, give amount)
DEALS = [
    ("hydrocarbons", 40, "fuel", 2500),
    ("metals", 60, "repair_patches", 4),
    ("silicates", 50, "oxygen_reserves", 120),
    ("metals", 40, "bio_matter_rations", 120),
    ("rare_earth", 30, "missiles", 2),
    ("electronics", 4, "fuel", 3000),
]

# Where goods land when they arrive aboard by bot (the bot drops them here).
ITEM_HOME = {"fuel": "cargo_bay", "missiles": "cargo_bay"}


# ═════════════════════════════════════════════════════════════════════════════
# Setup
# ═════════════════════════════════════════════════════════════════════════════

def new_world() -> dict:
    """Empty world container stored on GameState.world."""
    return {
        "factions": {},
        "settlements": {},         # planet_id -> settlement dict
        "populated": [],           # system ids already populated
        "log": [],                 # factual ship's log (events, not advice)
        "notes": [],               # the crew's own plans/promises
        "next_id": 1,
        "gm_last_seen": 0.0,
        "arrivals": 0,             # systems entered (for the first-raid guarantee)
        "known_raiders": {},       # raider id -> last position (to leave wrecks)
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

    races = list(NPC_RACES)
    rng.shuffle(races)
    for i, race in enumerate(races):
        traits = rng.sample(FACTION_TRAITS, 2)
        if i == 0:
            standing = rng.randint(30, 55)
        elif i == 1:
            standing = rng.randint(-45, -25)
        else:
            standing = rng.randint(-15, 25)
        if "aggressive" in traits:
            standing -= 10
        w["factions"][race] = {
            "name": race, "traits": traits, "speech": rng.choice(SPEECH_STYLES),
            "standing": standing, "color": FACTION_COLORS[i % len(FACTION_COLORS)],
        }
    w["factions"][OUTLAW_FACTION] = {
        "name": OUTLAW_FACTION, "traits": ["treacherous", "aggressive"],
        "speech": "sneering and threatening", "standing": -80, "color": "#ff3344",
    }

    for system in gs.galaxy.systems:
        for planet in system.planets:
            if planet.inhabited:
                deals = rng.sample(DEALS, 2)
                w["settlements"][planet.id] = {
                    "planet_id": planet.id, "planet_name": planet.name,
                    "system_id": system.id, "system_name": system.name,
                    "faction": rng.choice(races),
                    "wants": [_want_from_deal(d, place="depot") for d in deals],
                    "offered": False,
                }

    start = gs.galaxy.get_system(gs.ship.current_system_id)
    if start:
        populate_system(gs, start, rng, starting=True)


def gm_active(gs) -> bool:
    return (time.time() - gs.world.get("gm_last_seen", 0.0)) < GM_ACTIVE_WINDOW_S


def log(gs, text: str) -> None:
    gs.world["log"].append({"tick": gs.tick, "text": text})
    gs.world["log"] = gs.world["log"][-60:]


def _pretty(item: str) -> str:
    return {"oxygen_reserves": "oxygen", "bio_matter_rations": "rations",
            "repair_patches": "repair patches", "rare_earth": "rare earth",
            "space_scrap": "scrap"}.get(item, item.replace("_", " "))


# ═════════════════════════════════════════════════════════════════════════════
# Population
# ═════════════════════════════════════════════════════════════════════════════

def _random_point(rng, max_au: float, lo=0.15, hi=0.85) -> dict:
    a = rng.uniform(0, math.pi * 2)
    d = rng.uniform(max_au * lo, max_au * hi)
    return {"x": round(d * math.cos(a), 4), "y": 0.0, "z": round(d * math.sin(a), 4)}


def spawn_npc(gs, system, *, role: str, faction: str, size: str, position: dict,
              name: Optional[str] = None, cargo: Optional[dict] = None, **extra) -> dict:
    idx = gs._next_npc_ship_id
    gs._next_npc_ship_id += 1
    race = faction if faction in NPC_RACES else random.choice(NPC_RACES)
    label = {"trader": "Freighter", "patrol": "Patrol", "raider": "Raider",
             "derelict": "Derelict", "wreck": "Wreck"}.get(role, "Vessel")
    npc = {
        "id": f"npc_{idx}",
        "name": name or f"{faction} {label} {idx}",
        "race": race,
        "faction": faction,
        "role": role,
        "size": size,
        "hull_health": 100.0,
        "position": dict(position),
        "velocity": {"x": 0.0, "y": 0.0, "z": 0.0},
        "system_id": system.id,
        "behavior": "idle",
        "cargo": dict(cargo or {}),
        "wants": [],
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

    for _ in range(rng.randint(1, 3)):
        fac = rng.choice(local or lawful)
        pts = rng.sample(planet_pts, min(len(planet_pts), 3)) + [_random_point(rng, max_au)]
        spawn_npc(gs, system, role="trader", faction=fac, size=rng.choice(["small", "medium", "large"]),
                  position=_random_point(rng, max_au), behavior="patrol", patrol_points=pts,
                  patrol_index=0, speed=TRAFFIC_SPEED_AU,
                  cargo={"fuel": 4000, "hydrocarbons": 150, "metals": 200, "repair_patches": 6,
                         "oxygen_reserves": 150})
    if local or rng.random() < 0.4:
        fac = rng.choice(local or lawful)
        pts = [_random_point(rng, max_au, 0.2, 0.6) for _ in range(3)]
        spawn_npc(gs, system, role="patrol", faction=fac, size=rng.choice(["medium", "large"]),
                  position=pts[0], behavior="patrol", patrol_points=pts, patrol_index=0,
                  speed=TRAFFIC_SPEED_AU * 1.4)

    if starting:
        _spawn_derelict(gs, system, rng, near_ship=True)
        return

    w["arrivals"] += 1
    if rng.random() < (1.0 if w["arrivals"] == 1 else 0.35):
        n = 1 if rng.random() < 0.7 else 2
        if w["arrivals"] == 1:
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
                      speed=RAIDER_SPEED_AU, weapon_range_au=3.0, cargo={"metals": 0})
    if rng.random() < 0.25:
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
    lawful = [f for f in gs.world["factions"] if f != OUTLAW_FACTION]
    npc = spawn_npc(gs, system, role="derelict", faction=rng.choice(lawful), size="medium", position=pos,
                    name=f"{origin.split()[-1].title()} {rng.choice(['Halcyon', 'Meridian', 'Kestrel', 'Lantern', 'Osprey', 'Vesta'])}",
                    cargo={"people": rng.randint(8, 18), "metals": 120, "space_scrap": 60,
                           "electronics": 3, "repair_patches": 0, "oxygen_reserves": 0},
                    disabled=True, origin=origin, air_ticks=rng.randint(*DERELICT_AIR_TICKS),
                    patches_needed=DERELICT_PATCHES, distress_stage=0)
    npc["hull_health"] = round(rng.uniform(15, 40), 1)
    return npc


# ═════════════════════════════════════════════════════════════════════════════
# Messages & wants
# ═════════════════════════════════════════════════════════════════════════════

def _inbox(gs, from_id, from_name, subject, body, color="#4488ff", delay=0) -> None:
    kwargs = dict(from_id=from_id, from_name=from_name, to_id="player", to_name="TSC Prometheus",
                  subject=subject, body=body, direction="inbox", has_video=True, video_color=color)
    if delay > 0:
        gs.pending_messages.append({"deliver_at_tick": gs.tick + delay, "kwargs": kwargs})
    else:
        gs._make_message(**kwargs)


def _color(gs, faction: Optional[str]) -> str:
    return (gs.world["factions"].get(faction) or {}).get("color", "#4488ff")


def _say(gs, npc: dict, subject: str, body: str, delay: int = 0) -> None:
    _inbox(gs, npc["id"], npc["name"], subject, body, color=_color(gs, npc.get("faction")), delay=delay)


def _want_from_deal(deal, place: str) -> dict:
    want_item, want_amt, give_item, give_amt = deal
    return {"item": want_item, "amount": want_amt, "received": 0,
            "give": {give_item: give_amt}, "place": place, "done": False}


def _find_npc(gs, npc_id):
    return next((n for n in gs.npc_ships if n["id"] == npc_id), None)


def _dist_to(gs, pos: dict) -> float:
    sp = gs.ship.position
    return math.hypot(pos["x"] - sp["x"], pos.get("z", 0.0) - sp["z"])


def passengers(gs) -> int:
    return int(gs.ship.rooms.get("living_quarters", {}).get("people", 0) or 0)


def _standing(gs, faction: Optional[str], delta: int) -> None:
    f = gs.world["factions"].get(faction)
    if f:
        f["standing"] = max(-100, min(100, f["standing"] + int(delta)))


def _apply_wants(gs, holder: dict, item: str, amount: float, speaker, place_inv: dict) -> None:
    """Count a delivery toward any open want; pay out when one is filled."""
    for want in holder.get("wants", []):
        if want["done"] or want["item"] != item:
            continue
        want["received"] += amount
        if want["received"] + 1e-6 < want["amount"]:
            continue
        want["done"] = True
        for k, v in (want.get("give") or {}).items():
            place_inv[k] = round(place_inv.get(k, 0) + v, 2)
        given = ", ".join(f"{v:,.0f} {_pretty(k)}" for k, v in (want.get("give") or {}).items())
        where = "our depot on the surface" if want.get("place") == "depot" else "our hold"
        text = want.get("reply") or (f"Received, thank you. {given} is waiting in {where} — "
                                     f"send a bot over to collect it." if given else "Received. Thank you.")
        speaker(f"Deal done", text)
        if want.get("standing"):
            _standing(gs, holder.get("faction"), want["standing"])
        log(gs, f"Deal completed with {holder.get('name') or holder.get('planet_name')}: {given or 'no payment'}")


# ═════════════════════════════════════════════════════════════════════════════
# Transport reach & reactions
# ═════════════════════════════════════════════════════════════════════════════

def refresh_externals(gs) -> None:
    """Tell the ship which other ships its transport bots can reach right now."""
    sh = gs.ship
    reach = {}
    if sh.warp_phase != "transit":
        for npc in gs.npc_ships:
            if npc.get("system_id") == sh.current_system_id and _dist_to(gs, npc["position"]) <= TRANSPORT_RANGE_AU:
                reach[f"ship:{npc['id']}"] = npc.setdefault("cargo", {})
    sh.external_inventories = reach


def _process_transport_events(gs) -> None:
    sh = gs.ship
    events, sh.transport_events = sh.transport_events, []
    for ev in events:
        where, item, amount, kind = ev["where"], ev["item"], ev["amount"], ev["kind"]
        if kind == "aborted":
            log(gs, f"Transport could not reach {where.replace('ship:', '')} — {amount:g} {_pretty(item)} brought back")
            continue
        if where == "planet":
            _planet_event(gs, kind, item, amount)
            continue
        npc = _find_npc(gs, where.split(":", 1)[1])
        if not npc:
            continue
        if kind == "pickup":
            log(gs, f"Bot collected {amount:g} {_pretty(item)} from {npc['name']}")
            _npc_pickup(gs, npc, item, amount)
        else:
            log(gs, f"Bot delivered {amount:g} {_pretty(item)} to {npc['name']}")
            _npc_delivery(gs, npc, item, amount)


def _npc_pickup(gs, npc: dict, item: str, amount: float) -> None:
    role = npc.get("role")
    if role == "derelict":
        if item == "people":
            left = int(npc["cargo"].get("people", 0))
            if left <= 0:
                npc["evacuated"] = True
                _standing(gs, npc.get("faction"), 10)
                _say(gs, npc, "That's everyone", "That's the last of us. We owe you our lives. "
                     f"We're {npc.get('faction')} — any settlement will take us in.", delay=2)
            elif not npc.get("boarding_said"):
                npc["boarding_said"] = True
                _say(gs, npc, "First group aboard", f"First group is aboard your ship. {left} still here — "
                     "please hurry.", delay=2)
        elif npc["cargo"].get("people", 0) > 0 and not npc.get("looting_said"):
            npc["looting_said"] = True
            _standing(gs, npc.get("faction"), -8)
            _say(gs, npc, "What are you doing?!", "You're stripping our ship while we're still aboard? "
                 "We will remember this.", delay=2)
    elif role in ("trader", "patrol") and item != "people":
        # Taking goods nobody gave you is theft.
        if not npc.get("_paid_for", {}).get(item):
            _standing(gs, npc.get("faction"), -15)
            npc["behavior"] = "flee"
            npc["target_id"] = "player"
            _say(gs, npc, "Thieves!", "That cargo wasn't yours. Every port in the sector will hear of this.", delay=1)


def _npc_delivery(gs, npc: dict, item: str, amount: float) -> None:
    role = npc.get("role")
    cargo = npc["cargo"]
    if role == "derelict" and npc.get("disabled"):
        if item == "oxygen_reserves":
            extra = int(amount * AIR_TICKS_PER_O2)
            npc["air_ticks"] = npc.get("air_ticks", 0) + extra
            cargo["oxygen_reserves"] = 0
            if cargo.get("people", 0) > 0:
                _say(gs, npc, "Air received", f"Oxygen received — that buys us about {extra // 60} more "
                     f"minutes. Thank you.", delay=2)
        elif item == "repair_patches":
            if cargo.get("repair_patches", 0) >= npc.get("patches_needed", DERELICT_PATCHES):
                _derelict_repaired(gs, npc)
            elif not npc.get("patch_ack"):
                npc["patch_ack"] = True
                need = npc.get("patches_needed", DERELICT_PATCHES) - cargo.get("repair_patches", 0)
                _say(gs, npc, "Patching the hull", f"Our engineer is on it. {need:g} more patches and we can "
                     f"seal the breach and get the engines back.", delay=2)
        elif item == "people" and cargo.get("people", 0) > 0:
            _say(gs, npc, "Why send them here?", "We're trying to get people OFF this wreck!", delay=2)
    if role == "raider":
        d = npc.get("demand")
        if d and not d.get("paid") and item == d["item"]:
            d["received"] = d.get("received", 0) + amount
            if d["received"] + 1e-6 >= d["amount"]:
                d["paid"] = True
                npc["behavior"] = "flee"
                npc["target_id"] = "player"
                _say(gs, npc, "Pleasure doing business", "Smart choice. Fly safe... for now.", delay=1)
                log(gs, f"{npc['name']} took the toll and is leaving")
            else:
                _say(gs, npc, "Short", f"That's {d['received']:g}. We said {d['amount']:g}. Keep it coming.", delay=1)
        return
    if item in (w["item"] for w in npc.get("wants", []) if not w["done"]):
        _apply_wants(gs, npc, item, amount, lambda s, b: _say(gs, npc, s, b, delay=3), cargo)
        if npc.get("role") == "trader":
            npc["hold_until"] = gs.tick + TRADER_HOLD_TICKS
            npc.setdefault("_paid_for", {}).update({k: True for w in npc["wants"] if w["done"] for k in w["give"]})


def _derelict_repaired(gs, npc: dict) -> None:
    npc["disabled"] = False
    npc["role"] = "trader"
    npc["name"] = npc["name"].replace("Derelict ", "")
    _standing(gs, npc.get("faction"), 12)
    _say(gs, npc, "We're moving!", "The breach is sealed and the engines are lit. We'll limp to port "
         "on our own. Thank you, Prometheus — we won't forget this.", delay=2)
    log(gs, f"{npc['name']} repaired and under way")
    # Head for the nearest local settlement, or jump out.
    sysobj = gs.galaxy.get_system(npc["system_id"])
    port = next((s for s in gs.world["settlements"].values() if s["system_id"] == npc["system_id"]), None)
    if port and sysobj:
        p = sysobj.get_planet(port["planet_id"])
        npc["behavior"] = "move_to"
        npc["waypoint"] = {"x": p.position["x"], "z": p.position.get("z", 0.0)}
        npc["speed"] = TRAFFIC_SPEED_AU
    npc["leave_at"] = gs.tick + 90


def _planet_event(gs, kind: str, item: str, amount: float) -> None:
    sett = current_settlement(gs)
    if not sett or kind != "delivery":
        return
    sysobj = gs.galaxy.get_system(sett["system_id"])
    planet = sysobj.get_planet(sett["planet_id"]) if sysobj else None
    if not planet:
        return
    depot = planet.stockpile
    speak = lambda s, b: _inbox(gs, f"planet_{sett['planet_id']}", f"{sett['faction']} — {sett['planet_name']}",
                                s, b, color=_color(gs, sett["faction"]), delay=3)
    fac = gs.world["factions"].get(sett["faction"], {})
    if item == "people":
        depot["people"] = 0       # they walk off the landing pad
        sett["people_received"] = sett.get("people_received", 0) + int(amount)
        gain = min(15, int(amount))
        _standing(gs, sett["faction"], gain)
        gift = {"oxygen_reserves": 20 * int(amount), "bio_matter_rations": 20 * int(amount)}
        for k, v in gift.items():
            depot[k] = round(depot.get(k, 0) + v, 2)
        speak("Refugees received", f"{int(amount)} people landed safely and we'll look after them. "
              f"We've left {gift['oxygen_reserves']} oxygen and {gift['bio_matter_rations']} rations at our "
              f"depot for your crew.")
        log(gs, f"{int(amount)} people landed at {sett['planet_name']}")
        return
    if fac.get("standing", 0) <= -60:
        speak("Not welcome", "We didn't ask for anything from you.")
        return
    _apply_wants(gs, sett, item, amount, speak, depot)


# ═════════════════════════════════════════════════════════════════════════════
# Settlements
# ═════════════════════════════════════════════════════════════════════════════

def current_settlement(gs) -> Optional[dict]:
    pid = gs.ship.orbiting_planet_id
    return gs.world["settlements"].get(pid) if pid else None


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


# ═════════════════════════════════════════════════════════════════════════════
# Travel helpers (warp + autopilot)
# ═════════════════════════════════════════════════════════════════════════════

def warp_cost_tw(gs, system_id: str) -> tuple[float, float]:
    dist_pc = gs.galaxy.distance_ly(gs.ship.current_system_id, system_id) / PC_TO_LY
    return WARP_COST_BASE * (dist_pc ** WARP_COST_EXPONENT) + WARP_COST_ADDITIVE, dist_pc


def warp_transit_ticks(dist_pc: float) -> int:
    return int(round(WARP_TRANSIT_BASE + WARP_TRANSIT_PER_PC * dist_pc))


def warp_spool_ticks(health: float) -> int:
    """A worn drive takes longer to spool: 8 s at 100%, 16 s at 50%, ~21 s at 20%."""
    return int(round(WARP_SPOOL_TICKS * (1 + (100.0 - health) / 50.0)))


def warp_wear(pc: float) -> float:
    return WARP_WEAR_BASE + WARP_WEAR_PER_PC * pc


def begin_warp(gs, system_id: str) -> tuple[bool, str]:
    sh = gs.ship
    if sh.warp_phase:
        return False, "Already warping"
    target = gs.galaxy.get_system(system_id) if system_id else None
    if not target:
        return False, "System not found"
    if target.id == sh.current_system_id:
        return False, "Already in that system"
    health = sh.system_health.get("warp_drive", 100.0)
    if health <= WARP_MIN_HEALTH:
        return False, f"Warp drive too damaged to spool ({health:.0f}%) — repair it first"
    cost, pc = warp_cost_tw(gs, target.id)
    if cost > sh.warp_capacity():
        return False, (f"{pc:.1f} pc needs {cost:,.0f} TW but the capacitor holds {sh.warp_capacity():,.0f} TW — "
                       f"install more warp batteries in the reactor room")
    if sh.warp_capacitor_gw < cost:
        return False, (f"Insufficient warp charge ({sh.warp_capacitor_gw:,.0f} TW, "
                       f"need {cost:,.0f} TW for {pc:.1f} pc)")
    away = [b for b in sh.transport_bots if b.get("job") and (
        str(b["job"].get("source", "")).startswith("ship:") or str(b["job"].get("dest", "")).startswith("ship:")
        or b["job"].get("source") == "planet" or b["job"].get("dest") == "planet")]
    if away:
        return False, f"Transport bot #{away[0]['id']} is still outside the ship"
    sh.warp_capacitor_gw = round(sh.warp_capacitor_gw - cost, 2)
    sh.leave_orbit()
    sh.course = None
    sh.thrust = 0.0
    sh.warp_phase = "spool"
    sh.warp_dest_id = target.id
    sh.warp_dest_name = target.name
    sh.warp_ticks_left = warp_spool_ticks(health)
    sh.warp_transit_total = warp_transit_ticks(pc)
    sh.warp_pc = round(pc, 2)
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
        h = sh.system_health.get("warp_drive", 100.0)
        sh.system_health["warp_drive"] = round(max(0.0, h - warp_wear(getattr(sh, "warp_pc", 10.0))), 2)
        log(gs, f"Jumped to warp — {sh.warp_dest_name}")
        return
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
    return c.get("pos")


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
        log(gs, f"Autopilot: arrived at {sh.course['name']}")
        sh.course = None
        return
    sh.target_direction = {"x": dx / d, "y": 0.0, "z": dz / d}
    sh.max_step_au = d - stop_at


# ═════════════════════════════════════════════════════════════════════════════
# Per-tick world behaviour
# ═════════════════════════════════════════════════════════════════════════════

def _crew_here(gs, npc) -> bool:
    return npc.get("system_id") == gs.ship.current_system_id and gs.ship.warp_phase != "transit"


def _derelict_tick(gs, npc: dict) -> None:
    people = int(npc["cargo"].get("people", 0))
    if not npc.get("disabled") or people <= 0:
        return
    npc["air_ticks"] = npc.get("air_ticks", 0) - 1
    mins = max(0, npc["air_ticks"]) / 60.0
    here = _crew_here(gs, npc)
    stage = npc.get("distress_stage", 0)
    if here and stage == 0 and gs.tick >= 8:
        npc["distress_stage"] = 1
        _say(gs, npc, "MAYDAY MAYDAY", f"This is the {npc.get('origin', 'ship')} {npc['name']}. Hull breach, "
             f"engines dead, life support failing. {people} souls aboard and about {mins:.0f} minutes of air. "
             f"We need oxygen or evacuation — anyone who hears this, please respond.")
        log(gs, f"Distress call received from {npc['name']}")
    elif here and stage == 1 and npc["air_ticks"] <= 120:
        npc["distress_stage"] = 2
        _say(gs, npc, "Two minutes of air left", f"Air is thin. {people} of us still aboard. Please.")
    elif here and stage == 2 and npc["air_ticks"] <= 40:
        npc["distress_stage"] = 3
        _say(gs, npc, "...", "Can't... much longer. Tell our families we tried.")
    if npc["air_ticks"] <= 0:
        npc["cargo"]["people"] = 0
        npc["lost"] = people
        npc["disabled"] = True
        log(gs, f"Life signs aboard {npc['name']} have stopped ({people} lost)")


def _raider_tick(gs, npc: dict) -> None:
    if not _crew_here(gs, npc):
        return
    gs.world["known_raiders"][npc["id"]] = dict(npc["position"])
    d = _dist_to(gs, npc["position"])
    demand = npc.get("demand")
    beh = npc.get("behavior", "idle")
    if demand is None and d <= RAIDER_DETECT_AU:
        toll = {"small": 60, "medium": 100, "large": 160}.get(npc["size"], 100)
        npc["demand"] = {"item": "metals", "amount": toll, "received": 0,
                         "deadline_tick": gs.tick + RAIDER_PATIENCE_TICKS, "paid": False}
        npc["behavior"] = "intercept"
        npc["target_id"] = "player"
        npc["speed"] = RAIDER_SPEED_AU
        npc["hold_distance_au"] = 1.0      # close enough for a bot to bring the toll
        _say(gs, npc, "Cut your engines", f"Nice ship. Be a shame to scratch it. Send {toll} metals across "
             f"with one of your little bots and we'll let you fly on. You've got {RAIDER_PATIENCE_TICKS} seconds.")
        log(gs, f"{npc['name']} is closing and demanding {toll} metals")
        return
    if demand and not demand["paid"] and beh == "intercept" and gs.tick >= demand["deadline_tick"]:
        npc["behavior"] = "attack"
        npc["hold_distance_au"] = None
        _say(gs, npc, "Time's up", "Have it your way.")
        log(gs, f"{npc['name']} opened fire")
    if beh in ("attack", "intercept") and d > RAIDER_GIVE_UP_AU:
        npc["behavior"] = "idle"
        npc["target_id"] = None
        log(gs, f"{npc['name']} gave up the chase")
        _say(gs, npc, "Next time", "Run while you can. This lane is ours.")


def _trader_tick(gs, npc: dict) -> None:
    if npc.get("hold_until") is not None:
        if gs.tick < npc["hold_until"]:
            npc["behavior"] = "idle"
            npc["velocity"] = {"x": 0.0, "y": 0.0, "z": 0.0}
        else:
            npc["hold_until"] = None
            npc["behavior"] = "patrol" if npc.get("patrol_points") else "idle"
    if npc.get("leave_at") and gs.tick >= npc["leave_at"]:
        gs.npc_ships = [n for n in gs.npc_ships if n["id"] != npc["id"]]
        log(gs, f"{npc['name']} jumped out of the system")


def _leave_wrecks(gs) -> None:
    alive = {n["id"] for n in gs.npc_ships}
    for rid, pos in list(gs.world["known_raiders"].items()):
        if rid in alive:
            continue
        del gs.world["known_raiders"][rid]
        sysobj = gs.galaxy.get_system(gs.ship.current_system_id)
        if sysobj:
            spawn_npc(gs, sysobj, role="wreck", faction=OUTLAW_FACTION, size="small", position=pos,
                      name="Raider wreck", cargo={"metals": 80, "space_scrap": 50, "missiles": 1})
            log(gs, "Raider destroyed — the wreck is drifting")


def update_world(gs) -> None:
    """Called every tick from the game loop (after NPC movement)."""
    w = getattr(gs, "world", None)
    if not w or not gs.is_started():
        return
    refresh_externals(gs)
    _process_transport_events(gs)
    for npc in list(gs.npc_ships):
        role = npc.get("role")
        if role == "derelict":
            _derelict_tick(gs, npc)
        elif role == "raider":
            _raider_tick(gs, npc)
        elif role == "trader":
            _trader_tick(gs, npc)
    _leave_wrecks(gs)


# ═════════════════════════════════════════════════════════════════════════════
# Hails — automatic replies when the GM isn't connected
# ═════════════════════════════════════════════════════════════════════════════

def _intent(text: str) -> str:
    t = text.lower()
    if any(k in t for k in ("surrender", "give up", "mercy", "don't shoot", "dont shoot")):
        return "surrender"
    if any(k in t for k in ("stand down", "back off", "open fire", "destroy", "warning", "or else", "leave us")):
        return "threat"
    if any(k in t for k in ("trade", "buy", "sell", "deal", "offer", "price")):
        return "trade"
    if any(k in t for k in ("help", "assist", "aid", "coming", "on our way", "hold on", "status", "need",
                            "survivor", "rescue", "supplies", "oxygen", "evacuat")):
        return "help"
    if any(k in t for k in ("raider", "pirate", "danger", "news", "rumou", "rumor")):
        return "intel"
    return "greet"


def _offer_text(want: dict, where: str) -> str:
    give = ", ".join(f"{v:,.0f} {_pretty(k)}" for k, v in want["give"].items())
    return (f"We'll give {give} for {want['amount']:g} {_pretty(want['item'])}. "
            f"Send it to {where} by transport bot and the goods are yours.")


def auto_reply(gs, to_id: str, to_name: str, subject: str, body: str, color: str) -> None:
    if gm_active(gs):
        return   # the Game Master answers in character
    intent = _intent(f"{subject} {body}")
    npc = _find_npc(gs, to_id)
    delay = random.randint(*REPLY_DELAY)
    re = f"RE: {subject}"[:200]
    near = _nearest_settlement(gs)
    raiders_here = [n for n in gs.npc_ships if n.get("role") == "raider"
                    and n["system_id"] == gs.ship.current_system_id and n.get("behavior") != "flee"]
    intel = ("Raiders are working this system. Keep your shields up." if raiders_here
             else "Quiet lanes lately. Can't promise it'll last.")

    if npc is None:   # a settlement
        sett = gs.world["settlements"].get(to_id.replace("planet_", "", 1))
        if not sett:
            return
        fac = gs.world["factions"].get(sett["faction"], {})
        name = f"{sett['faction']} — {sett['planet_name']}"
        if fac.get("standing", 0) <= -50:
            text = "We have nothing to say to you."
        elif intent == "trade":
            open_w = [w for w in sett["wants"] if not w["done"]]
            text = (" ".join(_offer_text(w, "our landing pad while you're in orbit") for w in open_w)
                    or "We've nothing more to trade right now.")
        elif intent == "help":
            text = ("If you're carrying people who need a home, bring your ship into orbit and send them down "
                    "by transport. We'll take them in.")
        elif intent == "intel":
            text = intel
        elif intent == "threat":
            text = "Our defences are ready. We would rather talk."
        else:
            text = f"{sett['planet_name']} control. Orbit and send a bot down if you want to trade or land passengers."
        _inbox(gs, to_id, name, re, text, color=fac.get("color", color), delay=delay)
        return

    role = npc.get("role", "trader")
    fac = gs.world["factions"].get(npc.get("faction"), {})
    say = lambda t: _say(gs, npc, re, t, delay=delay)

    if role == "wreck":
        return
    if role == "derelict":
        people = int(npc["cargo"].get("people", 0))
        if not npc.get("disabled"):
            say("We're under way, thanks to you.")
        elif people <= 0:
            return   # nobody left to answer
        else:
            mins = max(0, npc.get("air_ticks", 0)) / 60
            need = npc.get("patches_needed", DERELICT_PATCHES) - npc["cargo"].get("repair_patches", 0)
            say(f"{people} of us aboard, about {mins:.0f} minutes of air left. Oxygen would buy us time; "
                f"{need:g} repair patches would let us seal the breach. Or take us off — your bots can carry "
                f"a few of us per trip if you come within {TRANSPORT_RANGE_AU:g} AU.")
        return
    if role == "raider":
        d = npc.get("demand") or {}
        if intent == "threat" and not npc.get("bluffed") and npc.get("behavior") in ("intercept", "idle"):
            npc["bluffed"] = True
            if random.random() < bluff_chance(gs, npc):
                npc["behavior"] = "flee"
                npc["target_id"] = "player"
                say("...Not worth it. We're leaving.")
                log(gs, f"{npc['name']} backed off")
            else:
                npc["behavior"] = "attack"
                npc["target_id"] = "player"
                say("Wrong answer.")
            return
        replies = {
            "surrender": f"Smart. {d.get('amount', 100):g} metals, by bot. Now.",
            "threat": "Big words from a ship that small.",
            "trade": "Only trade we do is your cargo for your life.",
            "help": "Help? Sure. Help yourself to the airlock.",
            "intel": "Danger's sitting right in front of you, friend.",
            "greet": "You're in our lane. Pay or bleed.",
        }
        say(replies[intent])
        return

    # trader / patrol
    if fac.get("standing", 0) < -30:
        say("We have nothing to say to you. Leave.")
        return
    if intent == "threat" and "fearful" in fac.get("traits", []):
        npc["behavior"] = "flee"
        npc["target_id"] = "player"
        say("Please! We'll go — don't fire!")
        return
    if role == "trader" and intent == "trade":
        if not any(not w["done"] for w in npc.get("wants", [])):
            deal = random.choice(DEALS)
            want = _want_from_deal(deal, place="hold")
            npc["wants"].append(want)
            npc["cargo"][deal[2]] = max(npc["cargo"].get(deal[2], 0), 0)   # goods appear on payment
        want = next(w for w in npc["wants"] if not w["done"])
        npc["hold_until"] = gs.tick + TRADER_HOLD_TICKS
        say(_offer_text(want, "our hold") + f" We'll hold position for two minutes — come within "
            f"{TRANSPORT_RANGE_AU:g} AU.")
        return
    replies = {
        "surrender": "We're not at war with you, captain.",
        "threat": f"Threatening a {npc.get('faction')} ship is unwise.",
        "trade": f"This is a patrol vessel. Take commerce to {near['planet_name'] if near else 'a settlement'}.",
        "help": f"We can't spare much. Nearest port is {near['planet_name'] if near else 'a long way off'}.",
        "intel": intel,
        "greet": ("Fair travels. We're hauling between the inner worlds." if role == "trader"
                  else f"{npc.get('faction')} patrol. State your business in this system."),
    }
    say(replies[intent])


def bluff_chance(gs, npc: Optional[dict]) -> float:
    sh = gs.ship
    total = sh.net_power_gw() or 1.0
    shown = total * (sh.power_allocation.get("weapons", 0) + sh.power_allocation.get("shields", 0)) / 100.0
    size = {"small": 1.0, "medium": 1.5, "large": 2.2, "capital": 3.5}.get((npc or {}).get("size"), 1.5)
    return round(max(0.1, min(0.9, shown / (140.0 * size))), 2)


# ═════════════════════════════════════════════════════════════════════════════
# Crew notes
# ═════════════════════════════════════════════════════════════════════════════

def add_note(gs, text: str, author: str) -> Optional[str]:
    text = (text or "").strip()[:200]
    if not text:
        return "Empty note"
    gs.world["notes"].append({"id": _nid(gs, "note"), "text": text, "author": (author or "Crew")[:24],
                              "done": False, "tick": gs.tick})
    gs.world["notes"] = gs.world["notes"][-30:]
    return None


def toggle_note(gs, note_id: str) -> Optional[str]:
    n = next((x for x in gs.world["notes"] if x["id"] == note_id), None)
    if not n:
        return "Note not found"
    n["done"] = not n["done"]
    return None


def delete_note(gs, note_id: str) -> Optional[str]:
    before = len(gs.world["notes"])
    gs.world["notes"] = [x for x in gs.world["notes"] if x["id"] != note_id]
    return None if len(gs.world["notes"]) < before else "Note not found"


# ═════════════════════════════════════════════════════════════════════════════
# State view
# ═════════════════════════════════════════════════════════════════════════════

def world_view(gs) -> dict:
    w = gs.world
    sh = gs.ship
    people = CREW_BASE + passengers(gs)
    warp = None
    if sh.warp_phase:
        warp = {"phase": sh.warp_phase, "dest_id": sh.warp_dest_id, "dest_name": sh.warp_dest_name,
                "ticks_left": sh.warp_ticks_left, "transit_total": sh.warp_transit_total}
    course = None
    if sh.course:
        pos = course_target_pos(gs)
        if pos:
            d = _dist_to(gs, pos)
            speed = sh.thrust * sh.engine_thrust_au
            course = {"kind": sh.course["kind"], "id": sh.course["id"], "name": sh.course["name"],
                      "distance_au": round(d, 2), "eta_ticks": int(d / speed) if speed > 1e-6 else None}
    # Ships the bots could reach, with what's in their hold (you can see it once alongside).
    targets = []
    if sh.warp_phase != "transit":
        for npc in gs.npc_ships:
            if npc.get("system_id") != sh.current_system_id:
                continue
            d = _dist_to(gs, npc["position"])
            if d > TRANSPORT_RANGE_AU * 4:
                continue
            in_range = d <= TRANSPORT_RANGE_AU
            targets.append({"id": f"ship:{npc['id']}", "name": npc["name"], "distance_au": round(d, 2),
                            "in_range": in_range,
                            "cargo": {k: v for k, v in npc.get("cargo", {}).items() if v} if in_range else None})
    return {
        "factions": list(w["factions"].values()),
        "log": w["log"][-20:],
        "notes": w["notes"],
        "warp": warp,
        "course": course,
        "passengers": passengers(gs),
        "people_aboard": people,
        "o2_ticks_left": int(sh.oxygen_reserves / people * 100) if people else None,
        "food_ticks_left": int(sh.bio_matter_rations / people * 100) if people else None,
        "transport_targets": targets,
        "gm_active": gm_active(gs),
        "constants": {"WARP_SPOOL_TICKS": WARP_SPOOL_TICKS, "WARP_TRANSIT_BASE": WARP_TRANSIT_BASE,
                      "WARP_TRANSIT_PER_PC": WARP_TRANSIT_PER_PC, "TRANSPORT_RANGE_AU": TRANSPORT_RANGE_AU},
    }
