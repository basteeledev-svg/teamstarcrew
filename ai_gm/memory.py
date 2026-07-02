"""Persistent GM memory.

A single JSON file (`gm_memory.json`) at the repo root keeps continuity
across restarts. The LLM never sees the raw file — `gm.py` summarizes
the relevant slice into the prompt each call.

Schema:
{
    "current_arc": {
        "archetype": str,           # "dark_star" | "diplomatic" | "transport" | "escort"
        "title": str,
        "summary": str,             # one paragraph
        "objectives": [str],
        "started_tick": int,
    },
    "threads": [                    # active sub-plots
        {"id": str, "title": str, "summary": str, "status": "active|done|failed"}
    ],
    "side_quest_seeds": [           # planted but not yet activated
        {"id": str, "summary": str, "trigger": str}
    ],
    "npc_relationships": {          # npc_id → notes the GM keeps about them
        "npc_3": {"role": "...", "notes": "..."}
    },
    "log": [                        # append-only event log (last N kept)
        {"tick": int, "summary": str}
    ]
}
"""

import json
import os
import threading
from pathlib import Path
from typing import Any

DEFAULT_PATH = Path(os.getenv("AI_GM_MEMORY_PATH", "gm_memory.json"))
LOG_KEEP_LAST = 60


_BLANK: dict[str, Any] = {
    "current_arc":       None,
    "factions":          [],     # generated fresh per game (see set_factions)
    "threads":           [],
    "side_quest_seeds":  [],
    "npc_relationships": {},
    "log":               [],
    "game_started_at_tick": None,  # backend tick when this campaign began
}


class Memory:
    def __init__(self, path: Path = DEFAULT_PATH) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.data: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return json.loads(json.dumps(_BLANK))  # deep copy
        try:
            with self.path.open("r") as f:
                d = json.load(f)
            for k, v in _BLANK.items():
                d.setdefault(k, v)
            return d
        except Exception as e:
            print(f"[gm.memory] failed to load {self.path}: {e}; starting fresh")
            return json.loads(json.dumps(_BLANK))

    def save(self) -> None:
        with self._lock:
            tmp = self.path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self.data, indent=2))
            tmp.replace(self.path)

    # ── Convenience mutators ────────────────────────────────────────────
    def reset(self, started_at_tick: int) -> None:
        """Wipe memory for a brand-new campaign."""
        self.data = json.loads(json.dumps(_BLANK))
        self.data["game_started_at_tick"] = started_at_tick
        self.save()

    def set_arc(self, arc: dict[str, Any]) -> None:
        self.data["current_arc"] = arc
        self.save()

    def set_factions(self, factions: list[dict[str, Any]]) -> None:
        self.data["factions"] = factions
        self.save()

    def has_factions(self) -> bool:
        return bool(self.data.get("factions"))

    def add_log(self, tick: int, summary: str) -> None:
        self.data["log"].append({"tick": tick, "summary": summary})
        if len(self.data["log"]) > LOG_KEEP_LAST:
            self.data["log"] = self.data["log"][-LOG_KEEP_LAST:]
        self.save()

    def upsert_thread(self, thread: dict[str, Any]) -> None:
        threads = self.data["threads"]
        for i, t in enumerate(threads):
            if t.get("id") == thread.get("id"):
                threads[i] = {**t, **thread}
                self.save()
                return
        threads.append(thread)
        self.save()

    def add_seed(self, seed: dict[str, Any]) -> None:
        self.data["side_quest_seeds"].append(seed)
        self.save()

    def consume_seed(self, seed_id: str) -> dict | None:
        seeds = self.data["side_quest_seeds"]
        for i, s in enumerate(seeds):
            if s.get("id") == seed_id:
                self.data["side_quest_seeds"] = seeds[:i] + seeds[i+1:]
                self.save()
                return s
        return None

    def remember_npc(self, npc_id: str, notes: dict[str, Any]) -> None:
        self.data["npc_relationships"][npc_id] = {
            **self.data["npc_relationships"].get(npc_id, {}),
            **notes,
        }
        self.save()

    def has_arc(self) -> bool:
        return bool(self.data.get("current_arc"))

    def factions_block(self) -> str:
        """Render the faction roster for the LLM prompt."""
        facs = self.data.get("factions") or []
        if not facs:
            return "(no factions defined yet)"
        lines = []
        for f in facs:
            name   = f.get("name", "?")
            traits = ", ".join(f.get("traits", []) or []) or "?"
            speech = f.get("speech_style", "?")
            values = f.get("values", "?")
            allies = ", ".join(f.get("allies", []) or []) or "—"
            enemies= ", ".join(f.get("enemies", []) or []) or "—"
            lines.append(
                f"  {name}: traits=[{traits}]  speech=\"{speech}\"  values=\"{values}\"\n"
                f"    allies: {allies}   enemies: {enemies}"
            )
        return "\n".join(lines)

    def to_prompt_summary(self) -> str:
        """Render a compact text view for inclusion in the LLM prompt."""
        d = self.data
        out = []
        if d.get("factions"):
            out.append("FACTIONS:")
            out.append(self.factions_block())
            out.append("")
        if d["current_arc"]:
            arc = d["current_arc"]
            out.append(f"ACTIVE ARC: [{arc.get('archetype','?')}] {arc.get('title','')}")
            out.append(f"  {arc.get('summary','')}")
            objs = arc.get("objectives") or []
            for o in objs:
                out.append(f"  - {o}")
        else:
            out.append("ACTIVE ARC: (none yet)")

        active = [t for t in d["threads"] if t.get("status") != "done"]
        if active:
            out.append("\nOPEN THREADS:")
            for t in active[:8]:
                out.append(f"  - [{t.get('id')}] {t.get('title','')}: {t.get('summary','')[:120]}")

        if d["side_quest_seeds"]:
            out.append(f"\nSIDE-QUEST SEEDS PLANTED: {len(d['side_quest_seeds'])}")

        recent = d["log"][-8:]
        if recent:
            out.append("\nRECENT EVENTS (last 8):")
            for e in recent:
                out.append(f"  T{e.get('tick')}: {e.get('summary','')}")
        return "\n".join(out)
