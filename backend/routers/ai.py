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
"""

import math
import os
import random
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from game.state import game_state, manager
from game.constants import TICK_RATE_SECONDS
from game.npc_ai import VALID_BEHAVIORS

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
    video_color: str = "#4488ff"
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
    base = game_state.to_dict()
    # Attach full NPC data (to_dict already includes npc_ships in scan data;
    # this gives the AI the raw list directly)
    base["ai"] = {
        "npc_ships_full": game_state.npc_ships,
        "dynamic_objects": game_state.dynamic_objects,
        "tick": game_state.tick,
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
