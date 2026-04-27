"""Tool / action schemas for the LLM and a dispatcher that calls the
backend's /api/ai/* endpoints.

The LLM emits a list of `action` dicts. Each action has a `tool` key
matching one of the schemas below; the rest of the keys are arguments.
"""

import os
from typing import Any, Optional

import httpx


BACKEND_URL = os.getenv("AI_GM_BACKEND_URL", "http://localhost:8000")
AI_API_KEY  = os.getenv("AI_API_KEY", "devkey")


# Pretty schema text we paste into the system prompt — keeps the LLM
# from inventing fields. NOT JSON-Schema, just descriptive.
TOOL_SCHEMA_TEXT = """\
spawn_npc:
  Spawns an NPC ship.
  args: {name: str, race: str, size: "small|medium|large|capital",
         system_id: str, x: float, z: float, hull_health: float = 100,
         role: str?, faction: str?}

set_npc_behavior:
  Sets an NPC's high-level behavior (steering runs in code per-tick).
  args: {npc_id: str,
         behavior: "idle|patrol|follow|attack|flee|move_to|intercept",
         target_id: str? ("player" or another npc id),
         waypoint: {x:float, z:float}?,
         patrol_points: [{x:float,z:float}]?,
         speed: float?,
         weapon_range_au: float?,
         flee_distance_au: float?}

move_npc:
  Teleport / set raw velocity. Prefer set_npc_behavior unless you need a hard reset.
  args: {npc_id: str, x: float?, z: float?, vx: float?, vz: float?}

despawn_npc:
  Removes an NPC.
  args: {npc_id: str}

inject_event:
  Broadcasts a narrative event (alert tones, log entries).
  args: {event_type: "anomaly|distress_call|encounter|warning|info",
         title: str, description: str, system_id: str?, position: {x:float,z:float}?}

send_message:
  Delivers a message to the crew inbox. Use deliver_in_seconds (30-50 typical)
  to simulate comms delay so your latency is invisible.
  args: {from_name: str, subject: str, body: str,
         from_id: str = "ai", has_video: bool = false,
         video_color: str = "#4488ff", deliver_in_seconds: float = 0}

annotate_system:
  Attach narrative metadata to a star system. Persists across the game.
  args: {system_id: str, story_note: str?, faction_control: str?,
         threat_level: "low|medium|high|critical"?,
         points_of_interest: [{name: str, desc: str}]?}
"""


class BackendClient:
    def __init__(self, url: str = BACKEND_URL, key: str = AI_API_KEY) -> None:
        self.url     = url.rstrip("/")
        self.headers = {"X-AI-Key": key}
        self._client = httpx.AsyncClient(timeout=15.0, headers=self.headers)

    async def close(self) -> None:
        await self._client.aclose()

    async def get_state(self) -> dict[str, Any]:
        r = await self._client.get(f"{self.url}/api/ai/state")
        r.raise_for_status()
        return r.json()

    # ── Tool dispatch ───────────────────────────────────────────────────
    async def execute(self, action: dict[str, Any]) -> dict[str, Any]:
        tool = action.get("tool")
        args = {k: v for k, v in action.items() if k != "tool"}
        try:
            if tool == "spawn_npc":
                r = await self._client.post(f"{self.url}/api/ai/npc/spawn", json=args)
            elif tool == "set_npc_behavior":
                npc_id = args.pop("npc_id")
                r = await self._client.post(f"{self.url}/api/ai/npc/{npc_id}/behavior", json=args)
            elif tool == "move_npc":
                npc_id = args.pop("npc_id")
                r = await self._client.post(f"{self.url}/api/ai/npc/{npc_id}/move", json=args)
            elif tool == "despawn_npc":
                npc_id = args.pop("npc_id")
                r = await self._client.delete(f"{self.url}/api/ai/npc/{npc_id}")
            elif tool == "inject_event":
                r = await self._client.post(f"{self.url}/api/ai/event", json=args)
            elif tool == "send_message":
                r = await self._client.post(f"{self.url}/api/ai/message", json=args)
            elif tool == "annotate_system":
                sid = args.pop("system_id")
                r = await self._client.post(f"{self.url}/api/ai/galaxy/system/{sid}/annotate", json=args)
            else:
                return {"ok": False, "error": f"unknown tool {tool!r}"}
            ok = r.status_code < 300
            payload: Any
            try:
                payload = r.json() if r.content else {}
            except Exception:
                payload = r.text
            return {"ok": ok, "status": r.status_code, "tool": tool, "result": payload}
        except httpx.HTTPError as e:
            return {"ok": False, "tool": tool, "error": str(e)}
