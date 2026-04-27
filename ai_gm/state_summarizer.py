"""Compress a full /api/ai/state response into a compact text the LLM can chew."""

from typing import Any


def summarize_systems(state: dict[str, Any]) -> str:
    out = []
    for s in state.get("galaxy_systems", []):
        anns = (s.get("ai_annotations") or {})
        marker = ""
        if anns:
            tl = anns.get("threat_level")
            fc = anns.get("faction_control")
            if tl: marker += f" threat={tl}"
            if fc: marker += f" ctrl={fc}"
        flag = " [HERE]" if s.get("id") == state.get("current_system", {}).get("id") else ""
        flag += " (visited)" if s.get("visited") else ""
        out.append(f"  {s['id']}: {s.get('name','?')}{flag}{marker}")
    return "\n".join(out) if out else "  (none)"


def summarize_ship(state: dict[str, Any]) -> str:
    s = state.get("ship") or {}
    pos = s.get("position", {})
    return (
        f"hull={s.get('hull_health','?')}%  "
        f"power={s.get('reactor_power_gw','?')}GW  "
        f"system={state.get('current_system',{}).get('name','?')}  "
        f"pos=({pos.get('x',0):.1f},{pos.get('z',0):.1f})  "
        f"crew_alive={len(s.get('crew',[]))}"
    )


def summarize_npcs(state: dict[str, Any]) -> str:
    npcs = ((state.get("ai") or {}).get("npc_ships_full")) or []
    if not npcs:
        return "  (none)"
    out = []
    for n in npcs:
        beh = n.get("behavior", "idle")
        tgt = f" → {n.get('target_id')}" if n.get("target_id") else ""
        faction = n.get("ai_faction") or "?"
        role = n.get("ai_role") or "?"
        out.append(
            f"  {n['id']} \"{n.get('name','?')}\" {n.get('size','?')} "
            f"{faction}/{role} hull={n.get('hull_health','?')} "
            f"sys={n.get('system_id','?')} beh={beh}{tgt}"
        )
    return "\n".join(out)


def summarize_recent_events(state: dict[str, Any], last_n: int = 6) -> str:
    msgs = state.get("comms", {}).get("messages", []) or state.get("messages", []) or []
    recent = msgs[-last_n:]
    if not recent:
        return "  (none)"
    out = []
    for m in recent:
        direction = m.get("direction", "?")
        out.append(f"  T{m.get('tick','?')} [{direction}] {m.get('from_name','?')} → \"{m.get('subject','')[:60]}\"")
    return "\n".join(out)


def state_to_prompt(state: dict[str, Any]) -> str:
    """Compact human-readable snapshot for the LLM."""
    return (
        f"TICK: {state.get('tick','?')}\n\n"
        f"SHIP: {summarize_ship(state)}\n\n"
        f"SYSTEMS:\n{summarize_systems(state)}\n\n"
        f"NPCS:\n{summarize_npcs(state)}\n\n"
        f"RECENT MESSAGES:\n{summarize_recent_events(state)}"
    )


def systems_for_planning(state: dict[str, Any]) -> str:
    out = []
    for s in state.get("galaxy_systems", []):
        out.append(f"  {s['id']}: \"{s.get('name','?')}\" planets={len(s.get('planets', []))}")
    return "\n".join(out) if out else "  (none)"
