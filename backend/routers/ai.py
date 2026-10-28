"""AI integration endpoints.

The AI (running on a separate GPU instance) communicates with the game server
through these endpoints. All routes require the `X-AI-Key` header to match
the `AI_API_KEY` environment variable.

If AI_API_KEY is not set in the environment, all AI endpoints return 503.
This lets the same server binary run in "human-only" mode or "AI-enabled" mode
purely through environment configuration.

Endpoint summary
────────────────
GET  /api/ai/state                     – full game state (superset of /api/game/state)
POST /api/ai/npc/spawn                 – spawn an NPC ship
POST /api/ai/npc/{npc_id}/move        – teleport / set velocity of an NPC
DEL  /api/ai/npc/{npc_id}             – despawn an NPC
POST /api/ai/event                     – inject a narrative event (broadcasts via WS)
POST /api/ai/message                   – deliver a message to the crew inbox
POST /api/ai/galaxy/system/{system_id}/annotate  – attach story notes to a star system
POST /api/ai/situation                 – put a decision in front of the crew (options + effects)
POST /api/ai/objective                 – give the crew a task with a destination and deadline
"""

import math
import os
import random
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from game.state import game_state, manager
from game.constants import TICK_RATE_SECONDS
from game.npc_ai import VALID_BEHAVIORS
from game import world

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ── Auth helper ───────────────────────────────────────────────────────────────

def _check_auth(x_ai_key: Optional[str]) -> None:
    """Raise HTTPException if the AI key is wrong or integration is disabled."""
    configured_key = os.getenv("AI_API_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="AI integration not enabled on this server")
    if x_ai_key != configured_key:
        raise HTTPException(status_code=403, detail="Invalid AI API key")


def _require_running() -> None:
    if not game_state.running or not game_state.is_started():
        raise HTTPException(status_code=400, detail="Game not running")


# ── Request models ────────────────────────────────────────────────────────────

class NpcSpawnRequest(BaseModel):
    name: str
    race: str
    size: str                          # small | medium | large | capital
    system_id: str
    x: float
    z: float
    hull_health: float = 100.0
    # Optional AI-controlled behaviour tags (ignored by VPS, used by AI client)
    role: Optional[str] = None         # e.g. "patrol", "trader", "hostile"
    faction: Optional[str] = None


class NpcMoveRequest(BaseModel):
    x: Optional[float] = None
    z: Optional[float] = None
    vx: Optional[float] = None         # velocity per tick (AU)
    vz: Optional[float] = None


class NpcBehaviorRequest(BaseModel):
    behavior: str                       # idle | patrol | follow | attack | flee | move_to | intercept
    target_id: Optional[str] = None     # other npc id, or "player"
    waypoint: Optional[dict] = None     # {"x": float, "z": float}
    patrol_points: Optional[list] = None  # [{"x":..,"z":..}, ...]
    speed: Optional[float] = None
    weapon_range_au: Optional[float] = None
    flee_distance_au: Optional[float] = None


class EventRequest(BaseModel):
    event_type: str                    # e.g. "anomaly", "distress_call", "encounter"
    title: str
    description: str
    system_id: Optional[str] = None   # None = affects all systems
    position: Optional[dict] = None   # {"x": ..., "z": ...} in AU


class MessageRequest(BaseModel):
    from_name: str
    subject: str
    body: str
    from_id: str = "ai"
    has_video: bool = False
    video_color: str = "#4488ff"          # contact-avatar accent color
    video_url: Optional[str] = None        # if set, frontend plays this instead of the placeholder
    deliver_in_seconds: float = 0.0     # delay before message lands in inbox


class AnnotateSystemRequest(BaseModel):
    story_note: Optional[str] = None
    faction_control: Optional[str] = None
    threat_level: Optional[str] = None  # "low" | "medium" | "high" | "critical"
    points_of_interest: Optional[list] = None  # list of {"name": ..., "desc": ...}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/state")
async def ai_get_state(x_ai_key: Optional[str] = Header(default=None)):
    """Return the complete game state including all NPC internal data.

    Identical to GET /api/game/state but includes fields the AI needs that
    are hidden from ordinary players (e.g. full NPC health, roles, factions).
    """
    _check_auth(x_ai_key)
    _require_running()
    game_state.world["gm_last_seen"] = time.time()   # lets the server skip canned hail replies
    base = game_state.to_dict()
    # Attach full NPC data (to_dict already includes npc_ships in scan data;
    # this gives the AI the raw list directly)
    base["ai"] = {
        "npc_ships_full": game_state.npc_ships,
        "dynamic_objects": game_state.dynamic_objects,
        "tick": game_state.tick,
        "factions": game_state.world["factions"],
        "settlements": list(game_state.world["settlements"].values()),
    }
    return base


@router.post("/npc/spawn", status_code=201)
async def ai_spawn_npc(
    req: NpcSpawnRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Spawn an NPC ship anywhere in the galaxy."""
    _check_auth(x_ai_key)
    _require_running()

    if not game_state.galaxy.get_system(req.system_id):
        raise HTTPException(status_code=404, detail="system_id not found")

    npc_id = f"npc_{game_state._next_npc_ship_id}"
    game_state._next_npc_ship_id += 1

    npc = {
        "id":          npc_id,
        "name":        req.name,
        "race":        req.race,
        "size":        req.size,
        "hull_health": req.hull_health,
        "position":    {"x": round(req.x, 4), "y": 0.0, "z": round(req.z, 4)},
        "velocity":    {"x": 0.0, "y": 0.0, "z": 0.0},
        "system_id":   req.system_id,
        # AI metadata (not shown to players directly)
        "ai_role":     req.role,
        "role":        req.role,          # raider/trader/patrol/derelict drive built-in encounters
        "faction":     req.faction,
        "ai_faction":  req.faction,
    }
    game_state.npc_ships.append(npc)
    return {"id": npc_id, "npc": npc}


@router.post("/npc/{npc_id}/move")
async def ai_move_npc(
    npc_id: str,
    req: NpcMoveRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Update NPC position and/or velocity."""
    _check_auth(x_ai_key)
    _require_running()

    npc = next((n for n in game_state.npc_ships if n["id"] == npc_id), None)
    if npc is None:
        raise HTTPException(status_code=404, detail="NPC not found")

    if req.x is not None:
        npc["position"]["x"] = round(req.x, 4)
    if req.z is not None:
        npc["position"]["z"] = round(req.z, 4)

    if "velocity" not in npc:
        npc["velocity"] = {"x": 0.0, "y": 0.0, "z": 0.0}
    if req.vx is not None:
        npc["velocity"]["x"] = round(req.vx, 6)
    if req.vz is not None:
        npc["velocity"]["z"] = round(req.vz, 6)

    return {"id": npc_id, "position": npc["position"], "velocity": npc["velocity"]}


@router.post("/npc/{npc_id}/behavior")
async def ai_set_npc_behavior(
    npc_id: str,
    req: NpcBehaviorRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Set the high-level behavior driving an NPC's per-tick steering.

    The behavior runs in pure Python (no LLM in the tick loop). The GM
    client only needs to call this when an NPC's intent changes — it does
    NOT need to be called every tick.
    """
    _check_auth(x_ai_key)
    _require_running()

    if req.behavior not in VALID_BEHAVIORS:
        raise HTTPException(
            status_code=400,
            detail=f"behavior must be one of {sorted(VALID_BEHAVIORS)}",
        )

    npc = next((n for n in game_state.npc_ships if n["id"] == npc_id), None)
    if npc is None:
        raise HTTPException(status_code=404, detail="NPC not found")

    npc["behavior"] = req.behavior
    if req.target_id is not None:
        npc["target_id"] = req.target_id
    if req.waypoint is not None:
        npc["waypoint"] = req.waypoint
    if req.patrol_points is not None:
        npc["patrol_points"] = req.patrol_points
        npc["patrol_index"] = 0
    if req.speed is not None:
        npc["speed"] = req.speed
    if req.weapon_range_au is not None:
        npc["weapon_range_au"] = req.weapon_range_au
    if req.flee_distance_au is not None:
        npc["flee_distance_au"] = req.flee_distance_au

    return {
        "id":       npc_id,
        "behavior": npc["behavior"],
        "target_id": npc.get("target_id"),
    }


@router.delete("/npc/{npc_id}", status_code=204)
async def ai_despawn_npc(
    npc_id: str,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Remove an NPC ship from the game."""
    _check_auth(x_ai_key)
    _require_running()

    before = len(game_state.npc_ships)
    game_state.npc_ships = [n for n in game_state.npc_ships if n["id"] != npc_id]
    if len(game_state.npc_ships) == before:
        raise HTTPException(status_code=404, detail="NPC not found")


@router.post("/event")
async def ai_inject_event(
    req: EventRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Inject a narrative event. Stored in messages and broadcast over WebSocket.

    The frontend can display event_type payloads differently from normal messages.
    """
    _check_auth(x_ai_key)
    _require_running()

    msg = game_state._make_message(
        from_id="ai_event",
        from_name="SHIP COMPUTER",
        to_id="crew",
        to_name="All Stations",
        subject=req.title,
        body=req.description,
        direction="inbox",
    )

    # Also broadcast immediately over WebSocket so panels react in real time
    await manager.broadcast({
        "type": "ai_event",
        "event_type": req.event_type,
        "title": req.title,
        "description": req.description,
        "system_id": req.system_id,
        "position": req.position,
        "tick": game_state.tick,
        "msg_id": msg["id"],
    })

    return {"status": "injected", "msg_id": msg["id"]}


@router.post("/message")
async def ai_send_message(
    req: MessageRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Deliver a message directly to the crew inbox (Communications panel).

    If `deliver_in_seconds` > 0 the message is queued and delivered after
    that wall-clock delay (translated to ticks via TICK_RATE_SECONDS).
    Use this to simulate light-speed comms delay so the LLM's response
    latency is invisible to players.
    """
    _check_auth(x_ai_key)
    _require_running()

    kwargs = dict(
        from_id=req.from_id,
        from_name=req.from_name,
        to_id="crew",
        to_name="Crew",
        subject=req.subject,
        body=req.body,
        direction="inbox",
        has_video=req.has_video,
        video_color=req.video_color,
        video_url=req.video_url,
    )

    if req.deliver_in_seconds and req.deliver_in_seconds > 0:
        delay_ticks = max(1, int(round(req.deliver_in_seconds / TICK_RATE_SECONDS)))
        game_state.pending_messages.append({
            "deliver_at_tick": game_state.tick + delay_ticks,
            "kwargs":          kwargs,
        })
        return {
            "status":           "queued",
            "deliver_at_tick":  game_state.tick + delay_ticks,
            "delay_ticks":      delay_ticks,
        }

    msg = game_state._make_message(**kwargs)
    return {"status": "delivered", "msg_id": msg["id"]}


@router.post("/galaxy/system/{system_id}/annotate")
async def ai_annotate_system(
    system_id: str,
    req: AnnotateSystemRequest,
    x_ai_key: Optional[str] = Header(default=None),
):
    """Attach AI-generated story metadata to a star system.

    The VPS stores these annotations on the system object; the AI reads them
    back via GET /api/ai/state to maintain narrative continuity across ticks.
    """
    _check_auth(x_ai_key)
    _require_running()

    system = game_state.galaxy.get_system(system_id)
    if system is None:
        raise HTTPException(status_code=404, detail="System not found")

    if not hasattr(system, "ai_annotations"):
        system.ai_annotations = {}

    ann = system.ai_annotations
    if req.story_note is not None:
        ann["story_note"] = req.story_note
    if req.faction_control is not None:
        ann["faction_control"] = req.faction_control
    if req.threat_level is not None:
        ann["threat_level"] = req.threat_level
    if req.points_of_interest is not None:
        ann["points_of_interest"] = req.points_of_interest

    return {"system_id": system_id, "annotations": ann}


# ── Situations & objectives ──────────────────────────────────────────────────
# Effects are limited to a small whitelist with bounded amounts so a confused
# model can't wreck the game. See game/world.py:_apply_effect.

_EFFECT_TYPES = {"message", "npc_behavior", "cargo", "passengers", "standing",
                 "despawn", "hull", "text", "bluff"}


def _clean_effects(effects, depth: int = 0) -> list:
    out = []
    for e in (effects or [])[:6]:
        if not isinstance(e, dict) or e.get("type") not in _EFFECT_TYPES:
            raise HTTPException(status_code=422, detail=f"bad effect: {e}")
        e = dict(e)
        t = e["type"]
        if t == "cargo":
            e["delta"] = {str(k): max(-500.0, min(500.0, float(v))) for k, v in (e.get("delta") or {}).items()}
        elif t == "passengers":
            e["delta"] = max(-30, min(30, int(e.get("delta", 0))))
        elif t == "hull":
            e["delta"] = max(-30.0, min(30.0, float(e.get("delta", 0))))
        elif t == "standing":
            e["delta"] = max(-30, min(30, int(e.get("delta", 0))))
        elif t == "npc_behavior" and e.get("behavior") not in VALID_BEHAVIORS:
            raise HTTPException(status_code=422, detail=f"bad behavior: {e.get('behavior')}")
        elif t == "bluff":
            if depth:
                raise HTTPException(status_code=422, detail="nested bluff")
            e["success"] = _clean_effects(e.get("success"), depth + 1)
            e["failure"] = _clean_effects(e.get("failure"), depth + 1)
        out.append(e)
    return out


class SituationOption(BaseModel):
    id: str
    label: str
    hint: str = ""
    requires: Optional[dict] = None
    effects: list = []


class SituationRequest(BaseModel):
    title: str
    body: str
    options: list[SituationOption]
    default_option: str
    deadline_seconds: float = 60.0
    source_id: Optional[str] = None
    kind: str = "gm"


class ObjectiveRequest(BaseModel):
    title: str
    detail: str = ""
    kind: str = "visit"                 # visit | deliver_passengers | deliver_cargo
    planet_id: Optional[str] = None
    system_id: Optional[str] = None
    amount: int = 0
    deadline_seconds: Optional[float] = None
    reward: Optional[dict] = None       # {"standing": {faction: n}, "cargo": {key: n}}
    penalty: Optional[dict] = None


@router.post("/situation", status_code=201)
async def ai_situation(req: SituationRequest, x_ai_key: Optional[str] = Header(default=None)):
    _check_auth(x_ai_key)
    _require_running()
    if not 2 <= len(req.options) <= 4:
        raise HTTPException(status_code=422, detail="2-4 options required")
    if req.default_option not in {o.id for o in req.options}:
        raise HTTPException(status_code=422, detail="default_option must be one of the option ids")
    if len(world.open_situations(game_state)) >= 3:
        raise HTTPException(status_code=429, detail="crew already has 3 open situations")
    opts = [{"id": o.id[:24], "label": o.label[:80], "hint": o.hint[:120],
             "requires": o.requires or {}, "effects": _clean_effects(o.effects)} for o in req.options]
    sit = world.create_situation(
        game_state, kind=req.kind[:24], title=req.title[:120], body=req.body[:1200], options=opts,
        default_option=req.default_option[:24],
        deadline_ticks=int(max(15.0, min(600.0, req.deadline_seconds)) / TICK_RATE_SECONDS),
        source_id=req.source_id, from_gm=True)
    return {"id": sit["id"], "deadline_tick": sit["deadline_tick"]}


@router.post("/objective", status_code=201)
async def ai_objective(req: ObjectiveRequest, x_ai_key: Optional[str] = Header(default=None)):
    _check_auth(x_ai_key)
    _require_running()
    if req.kind not in ("visit", "deliver_passengers", "deliver_cargo"):
        raise HTTPException(status_code=422, detail="bad kind")
    if req.planet_id and req.planet_id not in game_state.world["settlements"]:
        raise HTTPException(status_code=422, detail="planet_id must be an inhabited planet")
    ticks = int(req.deadline_seconds / TICK_RATE_SECONDS) if req.deadline_seconds else None
    reward = {"standing": {k: max(-30, min(30, int(v))) for k, v in ((req.reward or {}).get("standing") or {}).items()},
              "cargo": {k: max(-500, min(500, float(v))) for k, v in ((req.reward or {}).get("cargo") or {}).items()}}
    penalty = {"standing": {k: max(-30, min(30, int(v))) for k, v in ((req.penalty or {}).get("standing") or {}).items()}}
    obj = world.create_objective(game_state, title=req.title[:120], kind=req.kind, detail=req.detail[:600],
                                 planet_id=req.planet_id, system_id=req.system_id, amount=req.amount,
                                 deadline_ticks=ticks, reward=reward, penalty=penalty)
    return {"id": obj["id"]}
