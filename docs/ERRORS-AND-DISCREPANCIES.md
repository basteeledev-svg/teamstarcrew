# Errors & Discrepancies — Historical Archive

> All items in this file have been **resolved**. Kept as a record of issues caught during prior reviews.
> For current open issues, see `QUESTIONS.md`.

## Summary

- **30+ items** identified across multiple audits (BUG-1, BUG-2, INCON-1..16, E1..E29).
- All resolved as of commit `31afc30` (April 2026).
- Categories: random-seed bugs, capacity not enforced, planet `health` field removal, `repairs` → `charging_bay` allocation rename, mining bot legacy dict removed, component-job system added, life-support model added, AI GM behaviour tree added.

If an old report references a specific INCON/E number not described here, run `git log --all -S 'INCON-N'` to find the fix commit.

---

## Notable design pivots that landed

| # | Pivot | Where |
|---|------|------|
| E2  | Galaxy generator now uses local `_rng` | `backend/game/galaxy.py` |
| E11 | `repairs` allocation removed; renamed to `charging_bay` | `constants.py`, `PowerPanel`, `ship.py` |
| E12 | Component install/uninstall is a progress-based job system | `ship.update_component_jobs()` |
| E13 | Mining bots are entity-tracked (no legacy dict) | `ship.mining_bots_list` |
| E14 | Planet trips bypass room capacity check | `_validate_transport()` |
| E22 | Removed unused legacy panels (Engineering / Medical / Science) | `frontend/src/panels/` |
| E29 | NPC seeding intentionally limited to starting system | `state.seed_npc_ships()` |
| QN1 | Health degrades all system outputs (comms/scan/shields/weapons) | `ship.py` getters |
| QN3 | Life-support model added | `ship.update_life_support()` |
| AI  | NPC behaviour tree (idle/patrol/follow/attack/flee/move_to/intercept) | `backend/game/npc_ai.py` |
| AI  | Delayed comms via `pending_messages` + `deliver_in_seconds` | `state.py`, `tick._drain_pending_messages` |
