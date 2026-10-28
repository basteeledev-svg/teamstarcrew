"""FastAPI application entry point."""
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from game.tick import tick_loop
from routers.game     import router as game_router
from routers.ws       import router as ws_router
from routers.ai       import router as ai_router
from routers.feedback import router as feedback_router
from routers.stations import router as stations_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(tick_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="TeamStarCrew Game Server", lifespan=lifespan)

# CORS — allow all in dev, restrict in prod via ALLOWED_ORIGINS env var
_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

def include_app_routers(prefix: str = ""):
    app.include_router(game_router,     prefix=prefix)
    app.include_router(ws_router,       prefix=prefix)
    app.include_router(ai_router,       prefix=prefix)
    app.include_router(feedback_router, prefix=prefix)
    app.include_router(stations_router, prefix=prefix)


include_app_routers()

# Optional mirrored routes for subpath deployments (e.g., /sim/api, /sim/ws).
include_app_routers(prefix="/sim")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/sim/health")
async def sim_health():
    return {"status": "ok"}


# Serve built frontend in production (static files at ../frontend/dist)
_static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _static_dir.is_dir():
    # Optional mount for subpath deployments. Keep mounted before root fallback.
    app.mount("/sim", StaticFiles(directory=str(_static_dir), html=True), name="frontend-sim")
    # Mount at root LAST so /api and /ws routes take priority
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")
