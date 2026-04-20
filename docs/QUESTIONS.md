# Questions for Review

> All items resolved. ✅ = implemented or answered.

---

## ✅ RESOLVED — Game Design

### Q1: What happens at hull_health = 0? ✅
**Answer:** Generic game-over screen needed. Not yet implemented in frontend, but design direction settled.

### Q2: Is there an intended win condition? ✅
**Answer:** Intentionally open sandbox. AI Game Master will eventually drive storylines.

### Q3: What is the purpose of `people_on_board`? ✅
**Implemented:** `people_on_board` starts at 0. People are tracked as items in room inventories (`"people"` key in living_quarters). Transportable like consumables (1 person = 1 unit). `count_people()` sums across all rooms. Life support GW scales dynamically with people count.

### Q4: What should happen when power starves individual stations? ✅
**Answer:** Stations naturally stop functioning without power (engines can't run, lasers/shields inactive, manufacturing halts). No special "OFFLINE" state needed.

### Q5: Planet `health` field — what's it for? ✅
**Implemented:** Removed `health` field from Planet and Moon dataclasses. Mining formula simplified to `count * richness / 100`.

### Q6: NPC ships — what do they DO? ✅
**Answer:** Placeholders. AI Game Master will control spawn/despawn and behavior.

### Q7: What is the intended role of the AI Game Master? ✅
**Answer:** AI controls all events, NPCs, and story flow. Current focus is sandbox mode.

### Q8: Comms — should NPCs ever reply? ✅
**Answer:** AI Game Master will handle message reading/responding and NPC actions.

### Q9: Room capacity limits — enforce or remove? ✅
**Implemented:** Room capacities enforced. `ROOM_CAPACITY_STANDARD = 10,000`, `ROOM_CAPACITY_LARGE = 100,000`. Checked in `_validate_transport()` and `_complete_manufactured_item()`. `room_used()` / `room_free()` helpers added. Broadcast to frontend as `room_capacity` and `room_used`.

### Q10: Warp — can you warp while orbiting? ✅
**Answer:** Yes, you can warp anytime with sufficient energy in the warp capacitor.

### Q11: Relationship between "repairs" power allocation and repair bots? ✅
**Implemented:** Removed `repairs` power allocation entirely. Renamed to `charging_bay`. All bot types (transport, repair, mining) share the charging bay power allocation for recharging.

### Q12: Should power affect component installation? ✅
**Implemented:** Install/uninstall is now a progress-based job system. 1 GW = 1% progress per tick. Power split evenly among a station's active jobs. `component_jobs` list tracks all in-progress jobs. `update_component_jobs()` runs each tick.

### Q13: Mining bots — legacy dict vs. entity list? ✅
**Implemented:** Mining bots are now fully entity-based (`mining_bots_list`). Each has `{id, charge, health, location, state, assignment}`. `mining_bot_counts()` derives resource→count dict. Legacy `mining_bots` dict removed. Uses dedicated constants: `MINING_BOT_CHARGE_MAX`, `MINING_BOT_HEALTH_MAX`, `MINING_BOT_CHARGE_COST`.

### Q14: Transport bot planet source? ✅
**Implemented:** When orbiting, planet appears as a transport room. Double travel time for planet trips (`TRANSPORT_TRAVEL_TICKS * 2`). Planet destination bypasses room capacity check. `update_transport()` accepts `planet_stockpile` parameter.

### Q15: What determines manufacturing recipes? ✅
**Answer:** Just the 9 hardcoded recipes.

### Q16: Charging bay power allocation? ✅
**Implemented:** `charging_bay` is a proper power allocation key with a slider in PowerPanel. GW is evenly distributed among all idle bots in the bay. Each bot type respects its own charge max (`TRANSPORT_BOT_CHARGE_MAX`, `REPAIR_BOT_CHARGE_MAX`, `MINING_BOT_CHARGE_MAX`).

---

## ✅ RESOLVED — Frontend / UI

### Q17: Target device? ✅
**Answer:** Tablets running browsers in fullscreen (1280×800, Galaxy Tab S9).

### Q18: How many players? ✅
**Answer:** Team-building or family activity. Player count optimization deferred to user testing.

### Q19: Theme persistence? ✅
**Answer:** Building a CSS creation tool. Themes are CSS-only for now.

### Q20: Observer page? ✅
**Answer:** Temporary development/testing page for full ship access.

### Q21: Station manning tracking? ✅
**Answer:** Deferred to later design decisions.

---

## ✅ RESOLVED — Technical / Architecture

### Q22: State persistence? ✅
**Answer:** No saving. One session = one adventure.

### Q23: Multi-ship support? ✅
**Answer:** Currently single-ship. Architecture should leave door open for multi-ship.

### Q24: Tick rate? ✅
**Answer:** 1 second. Speed may need adjustment based on playtesting.

### Q25: AI API authentication? ✅
**Answer:** Needs proper authentication and encryption for GPU-hosted AI module.

### Q26: Test coverage? ✅
**Answer:** Leave existing 7 Playwright tests as-is for now.

### Q27: Standalone design app? ✅
**Answer:** Fully functional universe sandbox without AI driving story.

### Q28–31: Design app feedback? ✅
**Answer:** Like/dislike + text input. Same VPS. Test with all audiences. Everything iterable.

---

## ✅ RESOLVED — New Design Questions

### QN1: Should system_health affect scanner/comms/shields/weapons output? ✅
**Implemented:** `health_fraction` now applied to `comms_gw()`, `short_range_scan_gw()`, `long_range_scan_gw()`, `shields_gw()`, and `weapons_gw()` in ship.py. All system outputs degrade proportionally with damage.

### QN2: Battery starting energy? ✅
**Implemented:** `create_ship()` now seeds `battery_energy_gw = 12.0` for immediate usability.

### QN3: Life support — what happens when power is insufficient? ✅
**Implemented:** `update_life_support()` added to ship.py. When life support power is below minimum: temperature drops, air quality degrades, scrubbers stop working. Passengers take health damage based on air quality. Called each tick via `tick.py`.

### QN4: Planet stockpile — should there be a cap? ✅
**Answer:** No cap needed currently. Ship capacity limits and stockpile loss on departure are sufficient constraints.

### QN5: NPCs only in starting system ✅
**Answer:** Intentional. AI Game Master will handle NPC spawning in other systems.

### QN6: Game-over screen implementation ✅
**Implemented:** `GamePage.jsx` shows a full-screen game-over overlay when `hullHealth ≤ 0` with ship destruction message and option to restart.
