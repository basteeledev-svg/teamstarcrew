"""REST endpoints for game lifecycle and ship control."""
import math
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from game.galaxy import generate_galaxy
from game.ship import create_ship
from game.state import game_state
from game.constants import WARP_COST_BASE, WARP_COST_EXPONENT, WARP_COST_ADDITIVE, PC_TO_LY
from game.vector3 import normalize

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

    if mode == "full":
        game_state.seed_npc_ships(starting_system.id)
        game_state.seed_initial_messages()

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
    _require_running()
    target = game_state.galaxy.get_system(req.system_id)
    if not target:
        raise HTTPException(status_code=404, detail="System not found")
    if target.id == game_state.ship.current_system_id:
        raise HTTPException(status_code=400, detail="Already in that system")

    warp_health = game_state.ship.system_health.get("warp_drive", 100.0)
    if warp_health <= 0:
        raise HTTPException(status_code=400, detail="Warp drive non-functional")

    dist_ly  = game_state.galaxy.distance_ly(game_state.ship.current_system_id, req.system_id)
    dist_pc  = dist_ly / PC_TO_LY
    cost_tw  = round(WARP_COST_BASE * (dist_pc ** WARP_COST_EXPONENT) + WARP_COST_ADDITIVE, 1)

    if game_state.ship.warp_capacitor_gw < cost_tw:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient warp charge ({game_state.ship.warp_capacitor_gw:,.0f} TW, need {cost_tw:,.0f} TW for {dist_pc:.1f} pc)",
        )
    game_state.ship.warp_capacitor_gw -= cost_tw

    game_state.ship.warp_to(req.system_id, target.max_orbital_distance_au)
    target.visited = True

    return {
        "status": "warped",
        "destination": target.name,
        "distance_pc": round(dist_pc, 2),
        "warp_cost_tw": cost_tw,
    }
