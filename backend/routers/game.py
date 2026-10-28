"""REST endpoints for game lifecycle and ship control."""
import math
import random
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from game.galaxy import generate_galaxy
from game.ship import create_ship
from game.state import game_state
from game.constants import WARP_COST_BASE, WARP_COST_EXPONENT, WARP_COST_ADDITIVE, PC_TO_LY
from game.vector3 import normalize
from game import world

router = APIRouter(prefix="/api", tags=["game"])


# ── Request models ────────────────────────────────────────────────────────────

class ThrustRequest(BaseModel):
    value: float = Field(..., ge=0.0, le=1.0)

class DirectionRequest(BaseModel):
    x: float
    y: float
    z: float

class WarpRequest(BaseModel):
    system_id: str


# ── Game lifecycle ────────────────────────────────────────────────────────────

@router.post("/game/start")
async def start_game(seed: Optional[int] = None, mode: str = "full", player_count: int = 6):
    """Generate a new galaxy, spawn the ship, begin the tick loop.

    mode="full"  – seed NPC ships and initial messages (default)
    mode="empty" – pure physics sandbox: no NPCs, no story messages
    player_count – crew size (1, 4, 5, 6, 8, or 10); controls station-role layout
    """
    if mode not in ("full", "empty"):
        raise HTTPException(status_code=400, detail="mode must be 'full' or 'empty'")
    if player_count not in (1, 4, 5, 6, 8, 10):
        raise HTTPException(status_code=400, detail="player_count must be 1, 4, 5, 6, 8, or 10")

    galaxy = generate_galaxy(seed)
    starting_system = galaxy.systems[0]
    starting_system.visited = True

    game_state.galaxy          = galaxy
    game_state.ship            = create_ship(starting_system.id)
    game_state.ship.auto_repair_enabled = (player_count == 1)
    game_state.tick            = 0
    game_state.running         = True
    game_state.player_count    = player_count
    game_state.npc_ships       = []
    game_state.messages        = []
    game_state.dynamic_objects = []
    game_state.stations        = {}
    game_state.game_over_reason      = None
    game_state.life_support_countdown = 0
    game_state._next_npc_ship_id = 1
    game_state._next_obj_id      = 1

    game_state.pending_messages = []
    if mode == "full":
        world.init_world(game_state, random.Random(seed) if seed is not None else None)   # same seed → same world
        game_state.seed_initial_messages()
    else:
        game_state.world = world.new_world()

    return {
        "status": "started",
        "mode": mode,
        "seed": galaxy.seed,
        "player_count": player_count,
        "system_count": len(galaxy.systems),
        "starting_system": starting_system.name,
    }


@router.post("/game/stop")
async def stop_game():
    game_state.running = False
    return {"status": "stopped", "ticks_elapsed": game_state.tick}


@router.get("/game/state")
async def get_state():
    return game_state.to_dict()


# ── Ship control ──────────────────────────────────────────────────────────────

def _require_running():
    if not game_state.running or not game_state.is_started():
        raise HTTPException(status_code=400, detail="Game not running")


@router.post("/ship/thrust")
async def set_thrust(req: ThrustRequest):
    _require_running()
    game_state.ship.thrust = req.value
    return {"thrust": game_state.ship.thrust}


@router.post("/ship/direction")
async def set_direction(req: DirectionRequest):
    _require_running()
    raw = {"x": req.x, "y": req.y, "z": req.z}
    game_state.ship.target_direction = normalize(raw)
    return {"target_direction": game_state.ship.target_direction}


@router.post("/ship/stop")
async def stop_ship():
    _require_running()
    game_state.ship.thrust = 0.0
    return {"thrust": 0.0}


@router.post("/ship/warp")
async def warp(req: WarpRequest):
    """Start a timed warp (spool, then transit). Same rules as the WebSocket 'warp' command."""
    _require_running()
    ok, detail = world.begin_warp(game_state, req.system_id)
    if not ok:
        raise HTTPException(status_code=400, detail=detail)
    return {"status": "spooling", "detail": detail, "warp": world.world_view(game_state)["warp"]}
