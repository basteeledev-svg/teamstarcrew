"""Singleton game state and WebSocket connection manager."""
import json
from typing import Optional

from fastapi import WebSocket

from .galaxy import Galaxy
from .ship import Ship


class ConnectionManager:
    """Tracks all open WebSocket connections and broadcasts state."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections = [c for c in self._connections if c is not ws]

    async def broadcast(self, payload: dict) -> None:
        data = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


class GameState:
    def __init__(self) -> None:
        self.galaxy: Optional[Galaxy] = None
        self.ship: Optional[Ship]     = None
        self.tick: int                = 0
        self.running: bool            = False

    def is_started(self) -> bool:
        return self.galaxy is not None and self.ship is not None

    def to_dict(self) -> dict:
        if not self.is_started():
            return {"type": "state", "status": "not_started", "tick": self.tick}

        current_system = self.galaxy.get_system(self.ship.current_system_id)
        return {
            "type": "state",
            "status": "running",
            "tick": self.tick,
            "ship": self.ship.to_dict(),
            "current_system": current_system.to_dict() if current_system else None,
            "galaxy_systems": [s.to_summary_dict() for s in self.galaxy.systems],
        }


# Module-level singletons — imported everywhere
game_state = GameState()
manager    = ConnectionManager()
