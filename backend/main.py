"""FastAPI application entry point."""
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from game.tick import tick_loop
from routers.game import router as game_router
from routers.ws   import router as ws_router
from routers.ai   import router as ai_router
from routers.feedback import router as feedback_router


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

app.include_router(game_router)
app.include_router(ws_router)
app.include_router(ai_router)
app.include_router(feedback_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Serve built frontend in production (static files at ../frontend/dist)
_static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _static_dir.is_dir():
    # Mount at root LAST so /api and /ws routes take priority
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")
