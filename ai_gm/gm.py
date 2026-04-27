"""Game Master main loop.

Orchestrates the LLM, the backend, and the persistent memory.

Cadence (all configurable via env):
  - On startup (if no arc): plan main arc + initial actions.
  - Every PLAN_INTERVAL_S (default 600s = 10 min): replan / new beats.
  - Every POLL_INTERVAL_S (default 5s): check state, react to fresh
    inbound player messages with comms replies (delayed delivery).
"""

import asyncio
import json
import os
import sys
import traceback
from typing import Any

from .llm           import LLMClient
from .memory        import Memory
from .prompts       import (
    ARC_ARCHETYPES,
    GM_SYSTEM_PROMPT,
    PLAN_MAIN_ARC_PROMPT,
    PLAN_TICK_PROMPT,
    COMMS_REPLY_PROMPT,
)
from .state_summarizer import (
    state_to_prompt,
    systems_for_planning,
    summarize_ship,
)
from .tools         import BackendClient, TOOL_SCHEMA_TEXT


PLAN_INTERVAL_S    = float(os.getenv("AI_GM_PLAN_INTERVAL_S", "600"))
POLL_INTERVAL_S    = float(os.getenv("AI_GM_POLL_INTERVAL_S", "5"))
WAIT_FOR_GAME_S    = float(os.getenv("AI_GM_WAIT_FOR_GAME_S", "5"))


# ─────────────────────────────────────────────────────────────────────────────

def _archetypes_block() -> str:
    return "\n".join(
        f"  {a['id']}: \"{a['title']}\" — {a['hook']}" for a in ARC_ARCHETYPES
    )


async def _execute_actions(backend: BackendClient, actions: list[dict]) -> list[dict]:
    results = []
    for a in actions or []:
        if not isinstance(a, dict):
            continue
        r = await backend.execute(a)
        results.append(r)
        if not r.get("ok"):
            print(f"[gm] action failed: {a} → {r}")
        else:
            print(f"[gm] ok: {a.get('tool')}")
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Main-arc planning (once per game)
# ─────────────────────────────────────────────────────────────────────────────

async def plan_main_arc(llm: LLMClient, backend: BackendClient, mem: Memory) -> None:
    state = await backend.get_state()
    user = PLAN_MAIN_ARC_PROMPT.format(
        archetypes   = _archetypes_block(),
        systems      = systems_for_planning(state),
        ship_state   = summarize_ship(state),
        tool_schemas = TOOL_SCHEMA_TEXT,
    )
    print("[gm] planning main arc…")
    reply = await llm.chat_json(GM_SYSTEM_PROMPT, user, temperature=0.85, max_tokens=2000)

    arc = reply.get("arc") or {}
    if arc:
        arc["started_tick"] = state.get("tick", 0)
        mem.set_arc(arc)
        print(f"[gm] arc chosen: [{arc.get('archetype')}] {arc.get('title')}")

    for seed in (reply.get("side_quest_seeds") or []):
        mem.add_seed(seed)

    await _execute_actions(backend, reply.get("actions") or [])
    mem.add_log(state.get("tick", 0), f"Arc start: {arc.get('title','?')}")


# ─────────────────────────────────────────────────────────────────────────────
# Periodic replanning
# ─────────────────────────────────────────────────────────────────────────────

async def plan_next_beat(llm: LLMClient, backend: BackendClient, mem: Memory) -> None:
    state  = await backend.get_state()
    recent = ""
    msgs = state.get("comms", {}).get("messages") or state.get("messages") or []
    sent_by_player = [m for m in msgs[-12:] if m.get("direction") == "sent"]
    if sent_by_player:
        recent = "\n".join(
            f"  T{m.get('tick','?')} crew→{m.get('to_name','?')}: \"{m.get('subject','')}\" — {m.get('body','')[:200]}"
            for m in sent_by_player[-6:]
        )
    else:
        recent = "  (no fresh player messages)"

    user = PLAN_TICK_PROMPT.format(
        memory       = mem.to_prompt_summary(),
        state        = state_to_prompt(state),
        recent       = recent,
        tool_schemas = TOOL_SCHEMA_TEXT,
    )
    print("[gm] planning next beat…")
    reply = await llm.chat_json(GM_SYSTEM_PROMPT, user, temperature=0.7, max_tokens=1500)

    rationale = reply.get("rationale", "")
    if rationale:
        print(f"[gm] rationale: {rationale}")

    await _execute_actions(backend, reply.get("actions") or [])
    log = reply.get("log")
    if log:
        mem.add_log(state.get("tick", 0), log)


# ─────────────────────────────────────────────────────────────────────────────
# Player comms replies
# ─────────────────────────────────────────────────────────────────────────────

async def maybe_reply_to_player(
    llm: LLMClient,
    backend: BackendClient,
    mem: Memory,
    seen_msg_ids: set[str],
) -> None:
    state = await backend.get_state()
    msgs = state.get("comms", {}).get("messages") or state.get("messages") or []
    new_player_msgs = [
        m for m in msgs
        if m.get("direction") == "sent"
        and m.get("id") not in seen_msg_ids
    ]
    for m in new_player_msgs:
        seen_msg_ids.add(m["id"])
        # Skip echoes of our own activity
        to_name = m.get("to_name") or "Unknown Contact"
        arc      = mem.data.get("current_arc") or {}
        history  = ""  # could pull from npc_relationships later
        user = COMMS_REPLY_PROMPT.format(
            persona_name = to_name,
            persona_role = "contact",
            arc_summary  = arc.get("summary", "(none)"),
            history      = history or "(no prior contact)",
            subject      = m.get("subject", "(no subject)"),
            body         = m.get("body", ""),
        )
        try:
            reply = await llm.chat_json(GM_SYSTEM_PROMPT, user, temperature=0.7, max_tokens=600)
        except Exception as e:
            print(f"[gm] comms LLM failed: {e}")
            continue
        delay = float(reply.get("deliver_in_seconds") or 30)
        await backend.execute({
            "tool": "send_message",
            "from_name": to_name,
            "subject":   reply.get("subject", "Re: " + (m.get("subject") or "")),
            "body":      reply.get("body", ""),
            "deliver_in_seconds": delay,
        })
        print(f"[gm] queued reply from {to_name} in {delay:.0f}s")


# ─────────────────────────────────────────────────────────────────────────────
# Top-level loop
# ─────────────────────────────────────────────────────────────────────────────

async def wait_for_game(backend: BackendClient) -> None:
    while True:
        try:
            await backend.get_state()
            return
        except Exception as e:
            print(f"[gm] waiting for backend / running game ({e})")
            await asyncio.sleep(WAIT_FOR_GAME_S)


async def run() -> None:
    llm     = LLMClient()
    backend = BackendClient()
    mem     = Memory()

    print(f"[gm] model={llm.model}  ollama={llm.url}")
    if not await llm.health():
        print(f"[gm] WARNING: cannot reach Ollama at {llm.url}. Make sure `ollama serve` is running.")

    print(f"[gm] backend={backend.url}")
    await wait_for_game(backend)

    if not mem.has_arc():
        try:
            await plan_main_arc(llm, backend, mem)
        except Exception as e:
            print(f"[gm] main-arc planning failed: {e}")
            traceback.print_exc()

    seen_msg_ids: set[str] = set()
    # Pre-seed seen ids with anything already in the inbox, so we don't
    # reply to messages from before this client started.
    try:
        s0 = await backend.get_state()
        for m in (s0.get("comms", {}).get("messages") or s0.get("messages") or []):
            if m.get("id"):
                seen_msg_ids.add(m["id"])
    except Exception:
        pass

    last_plan_at = asyncio.get_event_loop().time()
    while True:
        try:
            await maybe_reply_to_player(llm, backend, mem, seen_msg_ids)
        except Exception as e:
            print(f"[gm] poll error: {e}")

        now = asyncio.get_event_loop().time()
        if now - last_plan_at >= PLAN_INTERVAL_S:
            try:
                await plan_next_beat(llm, backend, mem)
            except Exception as e:
                print(f"[gm] beat-planning error: {e}")
                traceback.print_exc()
            last_plan_at = now

        await asyncio.sleep(POLL_INTERVAL_S)


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        print("\n[gm] bye")
        sys.exit(0)


if __name__ == "__main__":
    main()
