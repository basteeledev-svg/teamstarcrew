"""Station management — server-side tablet assignment with 4-digit join codes."""
import random
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from game.state import game_state

router = APIRouter(prefix="/api/stations", tags=["stations"])


def _gen_code(existing: set[str]) -> str:
    """Return a unique 4-digit code not already in `existing`."""
    while True:
        code = str(random.randint(1000, 9999))
        if code not in existing:
            return code


class StationIn(BaseModel):
    station_id: str
    name: str
    icon: str
    color: str
    panels: list[str]
    code: Optional[str] = None   # supply to preserve a specific code


class StationsSetupRequest(BaseModel):
    stations: list[StationIn]


class PanelsUpdate(BaseModel):
    panels: list[str]


@router.get("")
async def list_stations():
    return {"stations": list(game_state.stations.values())}


@router.post("")
async def setup_stations(req: StationsSetupRequest):
    existing: set[str] = set()
    result: dict[str, dict] = {}

    for s in req.stations:
        if s.code and len(s.code) == 4 and s.code.isdigit() and s.code not in existing:
            code = s.code
        else:
            code = _gen_code(existing)
        existing.add(code)
        result[code] = {
            "code": code,
            "station_id": s.station_id,
            "name": s.name,
            "icon": s.icon,
            "color": s.color,
            "panels": s.panels,
        }

    game_state.stations = result
    return {"stations": list(result.values())}


@router.get("/{code}")
async def get_station(code: str):
    station = game_state.stations.get(code)
    if not station:
        raise HTTPException(status_code=404, detail="Station code not found")
    if not game_state.running:
        raise HTTPException(status_code=503, detail="Game not running")
    return station


@router.patch("/{code}/panels")
async def update_station_panels(code: str, req: PanelsUpdate):
    station = game_state.stations.get(code)
    if not station:
        raise HTTPException(status_code=404, detail="Station code not found")
    station["panels"] = req.panels
    return station


@router.delete("")
async def clear_stations():
    game_state.stations.clear()
    return {"ok": True}
