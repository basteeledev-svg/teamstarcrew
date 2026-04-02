"""REST endpoints for game lifecycle and ship control."""
import math
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from game.galaxy import generate_galaxy
from game.ship import create_ship
from game.state import game_state
from game.constants import WARP_COST_BASE, WARP_COST_EXPONENT
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
async def start_game(seed: Optional[int] = None):
    """Generate a new galaxy, spawn the ship, begin the tick loop."""
    galaxy = generate_galaxy(seed)
    starting_system = galaxy.systems[0]
    starting_system.visited = True

    game_state.galaxy  = galaxy
    game_state.ship    = create_ship(starting_system.id)
    game_state.tick    = 0
    game_state.running = True

    return {
        "status": "started",
        "seed": galaxy.seed,
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

    dist_ly = game_state.galaxy.distance_ly(
        game_state.ship.current_system_id, req.system_id
    )
    cost_gw = round(WARP_COST_BASE * (dist_ly ** WARP_COST_EXPONENT), 1)

    # Power stub: warp always succeeds if drive is functional
    # TODO: enforce against available power once power station is built

    game_state.ship.warp_to(req.system_id, target.max_orbital_distance_au)
    target.visited = True

    return {
        "status": "warped",
        "destination": target.name,
        "distance_ly": round(dist_ly, 2),
        "warp_cost_gw": cost_gw,
        "note": "Power cost not yet enforced — power station TBD",
    }
