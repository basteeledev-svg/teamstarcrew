# Design Review Questions - Remaining Work

All outstanding design questions have been resolved and implemented.

## COMPLETED THIS SESSION

| Item | Change |
|------|--------|
| N-5 Fabrication Bots | Full entity + Industry Points model; `FABRICATION_RECIPES` in ship.py; ManufacturingPanel.jsx rewritten with bot-assignment sliders + IP progress bars; 2 bots seeded at start |
| N-10 Room renames | `fore`/`aft` replace `front`/`back` in SECTION_SIDES + all hull section keys throughout backend and frontend; `weapons_room` + `shields_room` merged into `tactical_bridge` |
| N-12 AI GM spec | Section 6 added to cooperative_simulator_spec.md covering GM architecture, faction gen, arc archetypes, NPC behavior tree, panic controls, and session setup |

## Remaining minor items (low priority)
- `cargo_bay` could be renamed `central_warehouse` to match spec §14 — currently deferred as cosmetic
- Observer read-only panel variants (TODO comments already in Navigation, Comms, Tactical panels)
- N-12 playtest verification checkboxes (spec §16 life support, §15 mining) are still unchecked


| Item | Change |
|------|--------|
| N-6 Laser mode toggle | `mode` field per laser; DEF/ATK toggle in TacticalPanel + ShieldsPanel; `weapon_energy_pool` charges from attack-mode lasers each tick; FIRE button drains pool |
| N-11 Planetary hopper UI | MiningPanel shows per-resource hopper stockpile with RETRIEVE buttons; `retrieve_mining_hopper` WS handler dispatches transport bot |
| N-14 Spec richness | Spec §15 playtest corrected: richness=0.95 → 9.50 units/tick |
| UniversePanel fix | Warp formula updated to spec (15*D_pc^1.5+20); labels TW; parsec distances shown |
| MiningPanel richness fix | Rate formula = 10 * richness * bots (spec); richness displayed as % |

## STILL OPEN

### N-5 - Fabrication Bots full implementation
Stubs exist. Still needed: entity structure, Industry Points model, ManufacturingPanel.jsx bot-assignment UI.

---

### N-10 - Remaining room renames
Still needed: weapons_room+shields_room->tactical_bridge, cargo_bay->central_warehouse, front/back->fore/aft in SECTION_SIDES.

---

### N-12 - AI GM section in spec
Write Section 6 for cooperative_simulator_spec.md: AI GM architecture, NPC behavior tree, arc archetypes, GM panic controls.

---

## IMPLEMENTED THIS SESSION

| Item | Change |
|------|--------|
| N-1 TW labels | to_dict() keys renamed to _tw; PowerPanel labels updated |
| N-2 Synthesis Panel | SynthesisPanel.jsx created; update_synthesis() in ship.py; synthesis console added |
| N-3 Repair patches | update_repair_bots() consumes 1 repair_patch per 10 HP restored |
| N-4 Life support | update_life_support(tick) drains O2/rations every 100 ticks; base crew=10 |
| N-7 Power alloc | battery removed, scanners merged, manufacturing->synthesis; P3-C hard safeguard added |
| N-8 Battery panel | BatteryPanel.jsx with -100..+100 slider; battery console added |
| N-9 Install timers | Fixed tick countdown: 80 install / 50 uninstall |
| N-10 Room renames | reactor_room, engine_bay, sub_deck_refinery done in backend |
| N-13 Observer TODOs | TODO comments in Navigation, Comms, Tactical panels |

## STILL OPEN

### N-5 - Fabrication Bots full implementation
Stubs exist. Still needed: entity structure, Industry Points model, ManufacturingPanel.jsx bot-assignment UI.

**Answer:**

---

### N-6 - Defense/Attack mode toggle per laser
Stubs exist (weapon_energy_pool). Still needed: per-laser mode field, TacticalPanel.jsx toggle.

**Answer:**

---

### N-10 - Remaining room renames
Still needed: weapons_room+shields_room->tactical_bridge, cargo_bay->central_warehouse, front/back->fore/aft.

**Answer:**

---

### N-11 - Planetary hopper UI
mine_tick() correct. MiningPanel.jsx needs hopper display and Transport Bot dispatch button.

**Answer:**

---

### N-12 - AI GM section in spec
Write Section 6 for cooperative_simulator_spec.md covering AI GM, NPCs, arc archetypes, panic controls.

**Answer:**

---

### N-14 - Update spec richness playtest value
Change spec section 15 playtest from richness=1.35 to richness=0.95 (gives 9.50 units/tick).

**Answer:** Implement immediately

---
