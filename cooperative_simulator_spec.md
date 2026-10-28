# 🚀 COOPERATIVE SIMULATOR: SYSTEM DESIGN & GAME-WIDE DEFINITION OF DONE (DoD)

## 📖 SECTION 1: SYSTEM OVERVIEW & WORKFLOW CORE
This document details a multi-station, cooperative multiplayer space simulation game. Players operate a single automated starship as a unified crew. Individual players are assigned to specific **Control Panels** nested within localized ship **Rooms**. 

### 🔄 The Universal Gameplay Cycle
1. **The Grid & Energy:** The *Reactor Room* generates and routes raw terawatts to consumer systems.
2. **Refining & Synthesis:** The *Sub-Deck Refinery* converts raw planetary elements into vital ship consumables and prints hardware components.
3. **Logistics & Warehousing:** The *Logistics Panel* uses automation bots to manually transport goods into room storage lockers. Subsystem panels can **only** operate if their specific room inventories physically hold matching cargo.
4. **Traversal & Exploration:** The *Operations Deck* scans deep space, allowing *System Navigation* to fly through free-roaming 2D grids and *Universe Navigation* to perform long-distance warp jumps.
5. **Combat & Survival:** The *Tactical Bridge* routes dynamic defenses against incoming threats while balancing modular hardware component deterioration.

---

## 🛠️ SECTION 2: THE UNIVERSAL SYSTEM DESIGN LAWS
The AI Coding Assistant must satisfy these global technical laws across all written scripts:
* **Zero Placeholders:** Do not emit lazy comments like `// TODO: implement logic here`. Code arrays, functions, and logic fields must be fully realized, clean, and functional.
* **Component-Based State Isolation:** Maintain strict separation between UI data-binding views, localized client math logic, and synchronized server network states.
* **Component Degradation Multiplier:** All physical ship components (Generators, Engines, Shields, Lasers, Arrays, Panels) are vulnerable to structural damage. Unless specified otherwise, their peak output or capacity is throttled by their current health:  
  $$Actual Operational Output = Theoretical Peak Output \times \left(\frac{Current Component Health}{Max Health}\right)$$
* **Systemic Floats:** All resource counts, energy states, and coordinate vectors must maintain precise calculations locked to exactly **2 decimal places** to eliminate floating-point precision drift.

---

## 💎 SECTION 3: THE GAME ECONOMY AND RESOURCE DATA TREE
The database must rigidly track inventory across three separate structural tiers. Items can only reside in specified room inventories or the Central Warehouse.

### 1. Raw Resources
* **Metals:** Standard structural building blocks for hull patching and base items.
* **Rare Elements:** Used in high-tier electronics, warp cores, and laser lenses.
* **Silicates:** Transformed into circuit substrates, life support matrix layers, and battery glass.
* **Hydrocarbons:** Processed directly into chemical thruster fuel.
* **Radioactive Materials:** Raw, unrefined isotopes used to synthesize nuclear fuel rods.
* **Space Scrap / Debris:** Wreckage salvaged from destroyed entities or sector exploration.

### 2. Consumables
* **Fuel:** Burned exponentially by sub-light Fuel Engines.
* **Enriched Nuclear Material:** Consumed systematically by Nuclear Reactors.
* **Electronics:** Expended alongside patches to restore broken control panel components.
* **Metal Repair Patches:** Expended to fix raw system health pools.
* **Oxygen (O2) Reserves:** Gradually consumed based on active player slots.
* **Bio-Matter Rations:** Expended systematically to maintain connected player life metrics.

### 3. Inventory Items (Hardware Modules)
* **Automation Units:** `Repair Bots`, `Transport Bots`, `Mining Bots`, `Fabrication Bots`.
* **Component Modules:** `Shield Generators` (0–50 TW capacity), `Lasers` (Defense/Attack modules).
* **Core Systems:** `Air Scrubbers`, `Standard Batteries`, `Warp Batteries`.
* **Munitions:** `Missiles` (stored in finite silo item stacks).

---

## 🎛️ SECTION 4: CONTROL PANEL SPECIFICATIONS & LOCAL DoD

```
========================================================================================
[REACTOR ROOM CONSOLE ARRAYS]
========================================================================================
```
### 1. REACTOR PANEL
* **Technical Logic:** Track and process unique variables every game tick for **2x Fuel Generators** and **2x Nuclear Reactors**. Output a global `raw_power_output` variable as the combined sum of all four active systems.
* **Fuel Generator Math:**
  * Map slider input (0–100%) linearly to base power output (0–100 Terawatts).
  * Heat generation scales exponentially based on current power output.
  * Execute step-wise damage check tick logic for heat ranges:
    * *0–49 Heat:* 0 damage.
    * *50–60 Heat:* Roll 1x per tick for 1 damage at an X% chance (where X = current heat value).
    * *61–70 Heat:* Execute the calculation 2x per tick (possible 0–2 damage).
    * *71–80 Heat:* Execute the calculation 3x per tick (possible 0–3 damage).
    * *81–100 Heat:* Execute the calculation 4x per tick (possible 0–4 damage).
* **Nuclear Reactor Math:**
  * Map slider input (0–100%) to exponential resource consumption and base power output (0–400 Terawatts).
  * Heat dissipation/generation must follow exact target rates per tick based on power usage:
    * *0% Power:* -4 heat/tick
    * *1–10% Power:* -2 heat/tick
    * *11–40% Power:* -1 heat/tick
    * *41–60% Power:* 0 heat/tick
    * *61–70% Power:* +1 heat/tick
    * *71–80% Power:* +2 heat/tick
    * *81–95% Power:* +3 heat/tick
    * *96%+ Power:* +4 heat/tick
* **UI Enforcements:** Render 4 independent target sliders, 4 real-time power outputs, 4 individual heat labels, 4 health readouts, and 1 global "Total Energy Output" indicator.
* **Human Playtest Verification:**
  - [ ] Check that a Fuel Generator operating in the 50–60 heat zone takes damage probabilistically, and that damage frequency increases scaling up past the 60, 70, and 80 thresholds.
  - [ ] Idle a Nuclear Reactor at 0% power and confirm heat drops exactly by 4 units per game tick down to a floor of 0.
  - [ ] Confirm a reactor damaged by 25% has its maximum available power clamped to exactly 75% of its peak rating.

### 2. BATTERY PANEL
* **Technical Logic:** Read the variable `raw_power_output` globally. Calculate `net_power_output` dynamically based on user battery allocation adjustments.
* **Slider Mechanics:** Map a strict float slider ranging from -100 to 100.
* **State Math:** Update `current_battery_charge` each tick based on slider allocation. Charge cannot exceed `total_charge_capacity`.
* **UI Enforcements:** Bind distinct text labels displaying incoming power, outgoing power, current charge status, and absolute capacity ceiling parameters.
* **Human Playtest Verification:**
  - [ ] Set the charging slider to 100 with full raw power and verify that `current_battery_charge` caps perfectly at `total_charge_capacity` without experiencing variable overflow errors.
  - [ ] Verify that changing the battery slider directly changes input/output text labels and shifts the remaining downstream power.

### 3. POWER OUTPUT PANEL
* **Technical Logic:** Receive the `net_power_output` float and distribute it to 5 specific consumer subsystem variable streams: *Shields*, *Charging Dock*, *Scanner*, *Communication*, and *Manufacturing*.
* **Relative Balancing Constraints:** The group of 5 consumer sliders must remain strictly locked to a cumulative total of 100% of available output. 
* **Lock/Unlock Mechanics:** Implement toggleable locks for individual sliders. Moving an unlocked slider must proportionally pull or push percentages exclusively from other *unlocked* sliders to preserve the 100% rule.
* **Hard Safeguard:** If all sliders except 1 are locked, throw a soft input block preventing the user from altering the remaining free slider.
* **UI Enforcements:** Force math truncation or strict rounding to exactly 2 decimal places across all consumer arrays to eliminate floating-point creep.
* **Human Playtest Verification:**
  - [ ] Lock 2 out of the 5 consumer sliders, drag a 3rd slider, and verify that *only* the remaining 2 unlocked sliders adjust their percentages to compensate.
  - [ ] Lock 4 sliders, attempt to drag the 5th slider, and confirm the UI systematically blocks the interaction.

```
========================================================================================
[ENGINE BAY CONSOLE ARRAYS]
========================================================================================
```
### 4. SUB-LIGHT PROPULSION ENGINE PANEL
* **Technical Logic:** Monitor and maintain parameters for **2x Fuel Engines** and **2x Electric Engines**. Total engine thrust is the net cumulative sum of all four engine outputs.
* **Heat & Damage Framework:** Mirror the exact step-wise heat range damage checks established for the generators.
* **Electric Engine Logic:** 
  * Electric engines have no interactive throttle sliders. They operate dynamically, drawing power directly from the assigned Power Output allocation variable stream.
  * Map received subsystem power (0 to Max Allocated TW) directly to a linear thrust scale of 0–100 MegaNewtons (MN) of thrust per engine. Heat scales linearly with power draw.
* **Fuel Engine Logic:**
  * Managed via interactive user sliders adjusting target throttle limits from 0–100%, generating a theoretical maximum of 0–500 MN of thrust per engine.
  * Physics-Based Fuel Consumption: Fuel consumption per tick must grow exponentially relative to the throttle percentage to simulate propulsion drag overhead using the formula:
    $$	ext{Fuel Consumed Per Tick} = 	ext{Base Coefficient} 	imes (	ext{Throttle Percentage}^{2.5})$$
  * Heat generation scales exponentially alongside throttle position.
* **UI Enforcements:** Render 2 distinct engine state zones (Fuel vs. Electric). Display fuel burn rates, power draw indicators, individual heat/health metrics, and a global "Total Velocity Vector" text output tracking combined MegaNewtons.
* **Human Playtest Verification:**
  - [ ] Drop the Power Output Panel's allocation for the engine matrix down to 20% and confirm both Electric Engines automatically clamp their maximum thrust output to exactly 20 MN.
  - [ ] Run a Fuel Engine at 50% throttle, then push it to 100%. Verify that the fuel drain rate at 100% is significantly higher than double the 50% rate.

```
========================================================================================
[TACTICAL BRIDGE CONSOLE ARRAYS]
========================================================================================
```
### 5. SHIELDS CONTROL PANEL
* **Technical Logic:** Track 6 discrete directional shield sectors: *Fore*, *Aft*, *Port*, *Starboard*, *Above*, and *Below*. The ship supports a fixed inventory of discrete Shield Generator items. Each sector can structurally hold an absolute capacity grid of 0 to 4 installed generators.
* **Power Architecture:** Each individual operational Shield Generator draws between 0 and 50 TW of power based on active user throttle settings, capped by the global Shields allocation stream.
* **Drag-and-Drop / Reconfiguration Timers:**
  * Dragging a generator out of a sector immediately sets its state to "Uninstalling" for exactly **50 game ticks**. During this time, it remains in the sector but contributes 0 protection and draws 0 power.
  * Dropping a generator into a new sector sets its state to "Installing" for exactly **80 game ticks**. It remains offline, drawing 0 power, until the countdown hits zero.
* **UI Enforcements:** Sliders must be fully adaptive: render power distribution sliders *only* for specific generators that are currently installed and fully operational within each of the 6 sectors.
* **Human Playtest Verification:**
  - [ ] Drag a generator from Fore to Aft. Verify that the Fore sector UI instantly updates to remove its power slider, and that the Aft UI populates an uneditable deployment timer.
  - [ ] Verify that an uninstallation process lasts precisely 50 game ticks and an installation process takes exactly 80 game ticks before toggling the generator's status flag to `Online`.
  - [ ] Attempt to drag a 5th generator into a single directional sector grid and confirm the game logic rejects the drop action.

### 6. LASERS & TARGETING PANEL
* **Technical Logic:** Mirror the exact 6-sided orientation framework (Fore, Aft, Port, Starboard, Above, Below) with 0–4 component capacity per side, alongside the 50-tick uninstall and 80-tick install timers. Individual laser modules operate at 0–50 TW capacities.
* **Dynamic Posture Modes:** Each active laser component exposes a toggle state to switch between "Defense Mode" and "Attack Mode."
  * *Defense Mode:* Draws a constant, steady-state continuous power allocation based on its slider setting to automatically sweep for and neutralize incoming projectiles.
  * *Attack Mode:* Contributes its available power capacity directly into a centralized, global "Weapon Energy Pool." It consumes power from this collective pool only when actively fired.
* **Weapons Targeting Subsystem:** Tracks and communicates directly with the Attack Pool and the ship's physical Missile Silo inventory.
  * *Laser Fire:* Firing attack lasers drains the global "Weapon Energy Pool" instantaneously. Total destructive damage output scales directly with the collective terawatts drained from the pool.
  * *Missile Fire:* Reading from a finite physical asset count, firing a missile consumes 1 ammunition asset unit per execution frame. Missile damage tracking relies on an independent travel velocity vector time loop before applying flat target damage calculations upon arrival.
* **UI Enforcements:** Dynamic sliders must only show for installed, online hardware. Add a distinct toggle button for Defense/Attack next to each active component slot.
* **Human Playtest Verification:**
  - [ ] Set 2 lasers to Defense Mode and 2 lasers to Attack Mode. Verify that the Defense lasers draw power steadily every tick, while the Attack lasers do not consume net energy until a weapon discharge event is actively triggered.
  - [ ] Attempt to click the "Fire Missile" button when the physical ammo counter variable is sitting at 0. Verify that the execution logic blocks the action.

```
========================================================================================
[OPERATIONS DECK CONSOLE ARRAYS]
========================================================================================
```
### 7. SCANNER PANEL
* **Technical Logic:** Read the scanner subsystem power variable dynamically from the Power Output panel array (0 to Max Allocated TW). If Power == 0, return zero visual data arrays for all solar systems.
* **Detection Math Matrix:** Implement an inverse-square signal decay calculation. For any target at distance D (measured in **parsecs (pc)**), determine the active Level of Detail (LoD) visibility tier using the formula:  
  $$	ext{Target Visible LoD} = 	ext{highest tier where } D \le 	ext{Coefficient} 	imes \sqrt{	ext{Scanner Power}}$$
  * *Tier 1 (Presence):* Coefficient = 4.25. Unlocks: Star presence.
  * *Tier 2 (System Layout):* Coefficient = 2.83. Unlocks: Planet count, planet structural types.
  * *Tier 3 (Basic Intel):* Coefficient = 1.41. Unlocks: Approximate resource indicators, approximate ship count arrays.
  * *Tier 4 (Deep Inventory):* Coefficient = 0.99. Unlocks: Exact localized planetary resource metrics.
  * *Tier 5 (Tactical Scan):* Coefficient = 0.71. Unlocks: Exact target ship numbers, active ship faction/race properties.
* **UI Enforcements:** Render an interactive system tracking log or star chart display showing real-time sensor health, power draw, and a dynamic distance threshold indicator showing max scan horizons for all 5 LoD tiers.
* **Human Playtest Verification:**
  - [ ] Place a target system exactly 10 parsecs away. Set scanner power to 50 TW. Verify that the UI displays LoD 3 data (approximate ships and resources). Increase power to 100 TW and verify that the UI upgrades the system info to LoD 4 data (exact resource variables).
  - [ ] Slide the Scanner power allocation to exactly 0 TW. Confirm the celestial interface wipes all active markers and planet details, rendering the map entirely dark.

### 8. NAVIGATION PANEL (UNIVERSE & LOCAL SYSTEMS)
* **Technical Logic:** Divide the navigation system into two functional display modes:
  * **Universe Navigation Map:** Displays an interstellar star map utilizing filtered scan tracking arrays. This view must exclusively display discovered star system nodes, planet counts, and planetary types (LoD 1 and LoD 2 data). It must strictly hide tactical entities and raw resource data.
  * **2D Free-Roam System Navigation:** Handles local movement between planets within the current star system on a Cartesian 2D grid matrix centered on the local star coordinate (0.0, 0.0), scaling outwards up to a maximum radius boundary of 50.0 AU.
* **Universe Warp Mechanics:**
  * Implement an independent `warp_battery_charge` storage floating pool capped by a global `max_warp_battery_capacity`. Each tick, read incoming power variables directly from the Charging Dock allocation to increment this pool.
  * Compute the energy penalty using the non-linear curve:  
    $$	ext{Warp Cost} = 15 	imes (D^{1.5}) + 20$$
  * Safety Interlock: If `current_warp_battery_charge` < Warp Cost, disable the interactive "Warp Engine Engagement" button element.
* **2D System Steering & Orbit Mechanics:**
  * Track active vector properties for `position_vector` (Vector2), `velocity_vector` (Vector2), and `heading_angle` (float in degrees, 0 to 359).
  * Read the net forward force value `total_thrust_mn` from the Engine Panel. Calculate acceleration magnitude: $	ext{Acceleration} = rac{	ext{total\_thrust\_mn}}{	ext{ship\_mass\_coefficient}}$.
  * Split acceleration into vector coordinates using current heading angle:  
    $$	ext{Accel\_X} = 	ext{Acceleration} 	imes \cos(	ext{heading}), \quad 	ext{Accel\_Y} = 	ext{Acceleration} 	imes \sin(	ext{heading})$$
  * Planetary Orbit: If Distance(ship_position, planet_position) $\le$ orbital_gravity_horizon (default 0.25 AU radius bubble), dynamically illuminate an interactive "Enter Orbit" execution toggle button. Clicking it zeroes out the velocity vector and docks the ship position directly to the planet's coordinate matrix, changing state to 'Anchored in Orbit'.
  * Hostile Intercepts: If the distance delta between the player's ship position and a hostile entity vector drops to $\le 1.5	ext{ AU}$, transition the system state machine to 'Combat Encounter Authorized'.
* **Human Playtest Verification:**
  - [ ] Select a system 5 parsecs away (Cost: 187.63 TW). Click the Warp button. Verify that the ship's system location updates immediately and that exactly 187.63 TW is deducted from your stored navigation battery bank.
  - [ ] Fire your engines to full thrust in local space, then drop your throttles to 0 MN. Verify that your ship continues to drift freely through the 2D coordinate map via its velocity vector rather than grinding to an instantaneous stop.

### 9. COMMUNICATIONS PANEL
* **Technical Logic:** Read incoming subsystem power variable streams directly from the Power Output panel array. Calculate maximum communication signal range using a linear parsec scaling formula: $	ext{Max Comms Range (pc)} = 0.5 	imes 	ext{Comms Power (TW)}$.
* **Inbox Data Management System:** Maintain two separate array storage states: `new_messages_inbox` and `archived_messages_vault`. Each message object must store variables for Sender_ID, Timestamp (Star Date), Distance_Sent (pc), Text_Body, Video_Asset_Reference, and a Boolean flag for `Story_Critical`.
* **Dynamic Sector Interception:** When the ship arrives in a new system or ticks forward in time, if a story transmission source's Distance (D) $\le$ Actual Signal Range, download the transmission automatically into `new_messages_inbox` and trigger a flashing notification alert on the terminal UI.
* **UI Enforcements:** Split screen layout into an interactive split pane: Left pane displays selectable Message Headers (sorted chronologically with unread status indicators). Right pane displays the selected message's Full Text and an embedded video media player frame.
* **Human Playtest Verification:**
  - [ ] Place a story transmission source exactly 25 parsecs away. Allocate 40 TW of power (Range = 20 pc) and verify the inbox remains empty. Bump power to 60 TW (Range = 30 pc) and verify the message pops into the inbox instantly.
  - [ ] Click the "Archive" action button on a new message. Verify that the object completely vacates the `new_messages_inbox` array and populates inside the `archived_messages_vault` menu.

```
========================================================================================
[SUB-PLAYBACK REFINERY & LOGISTICS ARRAYS]
========================================================================================
```
### 10. MOLECULAR SYNTHESIS PANEL
* **Technical Logic:** Read the absolute incoming power allocation variable streamed from the Power Output panel (`net_synthesis_power`). 
* **Priority Slider Matrix:** The UI must feature 5 independent prioritization sliders (one for each synthesis recipe). These sliders behave like the Power Output panel: they are locked to a combined 100% distribution pool. Moving one adjustments the remaining unlocked sliders proportionally. Calculate the absolute Terawatts directed to each recipe per game tick:  
  $$	ext{Recipe Power} = 	ext{net\_synthesis\_power} 	imes \left(rac{	ext{Recipe\_Slider\_Percentage}}{100}
ight)$$
* **Progress Accumulation Math:** Maintain a persistent hidden floating-point `energy_accumulator` pool for each of the 5 recipes. Every game tick, if the required raw materials are present in inventory, add the `Recipe_Power` value directly to the recipe's accumulator. Check if `energy_accumulator` $\ge$ Required_TW_Threshold for that recipe to trigger synthesis execution.
* **Core Conversion Blueprints:**
  * *Fuel Synthesis:* Consumes 1x Hydrocarbons. Requires 1 TW total accumulation. Outputs 1x Fuel.
  * *Enriched Nuclear Synthesis:* Consumes 1x Radioactive Materials. Requires 1 TW total accumulation. Outputs 1x Enriched Nuclear Material.
  * *Electronics Synthesis:* Consumes 5x Silicates + 5x Rare Elements + 3x Metals. Requires 10 TW total accumulation. Outputs 1x Electronics.
  * *Repair Patch Synthesis:* Consumes 10x Metals + 2x Rare Elements. Requires 10 TW total accumulation. Outputs 1x Metal Repair Patch.
  * *Scrap Reclamation:* Consumes 2x Metals + 2x Rare Elements. Requires 3 TW total accumulation. Outputs 10x Space Scrap / Debris.
* **Human Playtest Verification:**
  - [ ] Give the ship 100 TW of total synthesis power and push the Fuel slider to 10% priority (yielding exactly 10 TW to fuel per tick). Verify that the system outputs exactly 10 finished Fuel units per game tick, exhausting 10 Hydrocarbons sequentially.
  - [ ] Allocate 10 TW of power to the Electronics recipe. Set your inventory counts to 0 Silicates. Verify that the loading progress bar freezes completely and no power is subtracted or converted.

### 11. FABRICATION MANUFACTURING PANEL
* **Technical Logic:** Read the active power allocation streamed from the Power Output panel for the Manufacturing deck. If power drops to $\le 5.00\%$, halt all manufacturing tick execution loops immediately and throw a "Power Grid Unstable" error flag.
* **Bot Allocation Matrix:** Players use 5 relative priority allocation sliders to assign physical Fabrication Bots from the local inventory stack into active recipe positions. Sliders are locked to a cumulative maximum equal to total assigned Fabrication Bots.
* **Industry Point Accumulation Math:** Every game tick (provided power > 5%), calculate the total Industry points generated for each specific recipe using the formula:  
  $$	ext{Recipe Industry Per Tick} = \sum \left(100 	imes \left(rac{	ext{Assigned Bot Health}}{100}
ight)
ight)$$
* **Core Component Blueprints:**
  * *All Bots (Repair, Transport, Mining, or Fabrication Bots):* Consumes 100x Metals + 50x Rare Elements + 10x Electronics. Requires 1,000 Industry total. Outputs 1x selected Bot item.
  * *Shield Generator / Laser Module:* Consumes 150x Metals + 30x Rare Elements + 25x Electronics. Requires 1,500 Industry total. Outputs 1x chosen Component item.
  * *Air Scrubber System:* Consumes 80x Metals + 40x Silicates + 15x Electronics. Requires 800 Industry total. Outputs 1x Air Scrubber.
  * *Standard Battery / Warp Battery Core:* Consumes 200x Metals + 120x Silicates + 60x Rare Elements. Requires 2,000 Industry total. Outputs 1x corresponding Battery unit.
  * *Structural Missile Payload:* Consumes 40x Metals + 10x Hydrocarbons + 5x Electronics. Requires 400 Industry total. Outputs 1x Missile item.
* **Human Playtest Verification:**
  - [ ] Drop the panel's input power line from the Power Output board down to exactly 4.5%. Verify that the completion progress bars freeze and the panel outputs exactly 0 Industry points on that tick frame.
  - [ ] Allocate 2 Fabrication Bots to the *All Bots* recipe. Set Bot #1 to 100% health and Bot #2 to 50% health. Verify that the recipe receives exactly 150 Industry points per tick instead of 200.

### 12. BOT CHARGING DOCK PANEL
* **Technical Logic:** Every autonomous Bot item must maintain a unique, individual structural floating-point state for `current_charge` and `max_charge` (default 100 units). 
* **Work Drain Loop:** For every game tick a bot is actively deployed or assigned to a panel workspace outside the charging dock, its `current_charge` drops at a steady rate of **0.10 units per tick** (0.15 units for Mining Bots). If charge hits 0, toggle its state to 'Dead Battery' and nullify its productivity outputs.
* **Power Distribution Sliders:** Read the incoming `charging_dock_power_output` variable from the main Power Output array. The interface must display 4 independent priority sliders locked to a combined 100% distribution pool representing the 4 bot categories.
* **Recharging Integration Math:** For each tick a bot is docked, calculate the energy distribution evenly across all docked bots of that specific type:  
  $$	ext{New Charge} = 	ext{current\_charge} + (	ext{Allocated\_Bot\_Power} 	imes 0.5)$$
  Cap the charge calculation strictly at the 100.00 max capacity float value.
* **Human Playtest Verification:**
  - [ ] Recall 1 Repair Bot to the dock with 20 TW of localized repair charging power. Note its charge acceleration rate per tick. Dock a 2nd Repair Bot alongside it and verify that the replenishment speed for both drops exactly by half (10 TW each).

### 13. DAMAGE CONTROL & REPAIR PANEL
* **Technical Logic:** Group all ship components into 5 distinct internal room arrays:
  * *Reactor Room:* 2x Fuel Generators, 2x Nuclear Reactors, Battery Pool Core.
  * *Engine Bay:* 2x Fuel Engines, 2x Electric Engines.
  * *Tactical Bridge:* 6x Directional Shield Slots, 6x Laser Array Modules, Weapons Targeting Core.
  * *Operations Deck:* Scanner Array, Communications Transceiver.
  * *Sub-Deck Refinery:* Molecular Synthesis Board, Fabrication Manufacturing Matrix, Charging Dock.
* **Repair Bot Allocation Mechanics:** Expose an input interface for each of the 5 rooms allowing players to allocate active, functional 'Repair Bots' from the global pool.
* **Restoration & Drain Math:** Every game tick, for each Repair Bot assigned to a room identify the component within that room array possessing the lowest health percentage. Add **+0.50% health** to that component's state up to a maximum of 100.00%, and deduct **-0.10 battery units** from the assigned bot's `current_charge` value. 
* **Human Playtest Verification:**
  - [ ] Cause 10% damage to a Fuel Generator and 40% damage to a Nuclear Reactor inside the Reactor Room. Assign 1 Repair Bot to the room. Verify that the bot ignores the minor generator damage and applies its restoration values strictly to the heavily damaged reactor until their health pools normalize.

### 14. LOGISTICS & TRANSPORTATION PANEL
* **Technical Logic:** Maintain distinct localized inventory dictionaries for 6 zones: Central Warehouse, Reactor Room, Engine Bay, Tactical Bridge, Operations Deck, and Sub-Deck Refinery. Enforce strict room inventory structural filtering rules:
  * *Reactor Room Storage:* Only accepts Enriched Nuclear Material, Standard Batteries, and Warp Batteries.
  * *Engine Bay Storage:* Only accepts Fuel.
  * *Tactical Bridge Storage:* Only accepts Shield Generators, Lasers, and Missiles.
  * *Central Warehouse & Refinery:* Accepts all 3 tiers (Raw, Consumable, Items).
* **System Check Constraint:** Subsystem panels can **ONLY** consume resources or install modules currently residing within their specific room inventory array.
* **Transport Bot Mission Logic:** Players assign 'Transport Bots' to move a specified quantity of items between two locations.
  * *Intra-ship trip duration:* 30 ticks constant.
  * *Off-ship trip duration:* 150 ticks $	imes$ Distance in Parsecs.
* **Execution State Loop:** Deduct the requested items from the source inventory array and place them into a hidden `in_transit_cargo` dictionary tied to the assigned Transport Bot. Deduct -0.10 battery units from the assigned bot's current charge per tick.
* **Human Playtest Verification:**
  - [ ] Place 5x Missiles in the Central Warehouse and 0x Missiles in the Tactical Bridge storage. Attempt to fire a missile from the Weapons Targeting Panel. Verify that the combat system systematically throws an "Ammunition Depleted" error.
  - [ ] Attempt to initialize a Transport Bot mission routing 50 units of Fuel from the Central Warehouse directly into the Tactical Bridge storage array. Verify that the system blocks the transaction at the UI layer.

### 15. PLANETARY MINING PANEL
* **Technical Logic:** Mining operations can only be initiated if the ship is anchored in a star system via the Universe Navigation Map, and a local planet has been scanned to at least LoD 4.
* **Targeted Extraction & Yield Math:** Every game tick a bot is deployed on the surface, calculate its extraction rate using the formula:  
  $$	ext{Tick Yield} = 10 	imes 	ext{Resource\_Richness} 	imes \left(rac{	ext{Current Bot Health}}{100}
ight)$$
  Accumulate raw resources directly into a local `planetary_hopper_inventory` dictionary up to two-decimal precision. This hopper must be physically emptied back to the ship via Transport Bots.
* **State Machine & Battery Lifespans:** Working on the planet surface drains `-0.15` battery units per tick. Clicking the "Recall & Recharge" command button places the bot into an 'In-Transit to Dock' state for 30 ticks before automatically moving it to the Charging Dock panel inventory list.
* **Human Playtest Verification:**
  - [ ] Deploy a 100% health Mining Bot onto a planet node with a Metals richness value of `0.95` (Rocky planet max). Verify that every single game tick adds exactly `9.50` units of raw metals into the planetary hopper ledger without floating precision rounding creep.

```
========================================================================================
[LIFE SUPPORT TICK DRAIN SYSTEM - GLOBAL TIMED TASK]
========================================================================================
```
### 16. LIFE SUPPORT ENGINE
* **Technical Logic:** Every 100 game ticks, subtract 1x Oxygen Reserve and 1x Bio-Matter Ration per active connected player slot.
* **Asphyxiation State Interlock:** If Oxygen Reserves == 0, trigger a global 'Asphyxiation' damage loop dealing 5 structural health damage per tick to all ship systems and panels until replenishment occurs.
* **Human Playtest Verification:**
  - [ ] Artificially set `Oxygen_Reserves` down to 0 while players are connected. Confirm that every ship component console panel (Reactors, Shields, Engines) begins leaking health at a steady rate of 5 points per tick.

---

## 🪐 SECTION 5: PROCEDURAL PLANET ARCHETYPES
When a star system is initialized, every planet must be assigned an archetype. Roll random float values for all 5 Raw Resources strictly capped by the archetype's specific richness bounds (expressed as multipliers from 0.00 to 1.00):
* **Rocky:** Metals [0.60 - 1.00], Silicates [0.40 - 0.80], Rare Elements [0.10 - 0.30], Hydrocarbons [0.00 - 0.10], Radioactive Materials [0.05 - 0.20]
* **Desert:** Silicates [0.70 - 1.00], Metals [0.20 - 0.50], Rare Elements [0.10 - 0.40], Hydrocarbons [0.05 - 0.20], Radioactive Materials [0.00 - 0.10]
* **Volcanic:** Metals [0.50 - 0.90], Radioactive Materials [0.40 - 0.80], Rare Elements [0.20 - 0.60], Silicates [0.10 - 0.40], Hydrocarbons [0.00 - 0.05]
* **Gas Giant:** Hydrocarbons [0.80 - 1.00], Metals [0.00 - 0.05], Silicates [0.00 - 0.05], Rare Elements [0.00 - 0.05], Radioactive Materials [0.00 - 0.05]
* **Frozen:** Silicates (Ice/Crystals) [0.50 - 0.80], Hydrocarbons [0.20 - 0.50], Metals [0.10 - 0.30], Rare Elements [0.05 - 0.20], Radioactive Materials [0.00 - 0.05]
* **Earth-Like:** Metals [0.30 - 0.60], Silicates [0.30 - 0.60], Hydrocarbons [0.20 - 0.50], Rare Elements [0.05 - 0.20], Radioactive Materials [0.01 - 0.10]
* **Gaia:** Metals [0.40 - 0.70], Silicates [0.40 - 0.70], Hydrocarbons [0.30 - 0.60], Rare Elements [0.20 - 0.40], Radioactive Materials [0.00 - 0.05]
* **Radioactive:** Radioactive Materials [0.70 - 1.00], Rare Elements [0.30 - 0.60], Metals [0.20 - 0.50], Silicates [0.10 - 0.40], Hydrocarbons [0.00 - 0.10]
* **Toxic:** Hydrocarbons [0.50 - 0.80], Rare Elements [0.30 - 0.60], Silicates [0.20 - 0.50], Metals [0.10 - 0.40], Radioactive Materials [0.10 - 0.30]

---

## 🤖 SECTION 6: AI GAME MASTER SYSTEM

### 6.1 System Overview
The AI Game Master (GM) is an optional background service that runs alongside the game server. It uses a Large Language Model (LLM) to generate dynamic story arcs, control NPC behaviour, and deliver in-world communications to the crew. The GM operates entirely through the same REST/WebSocket API used by player tablets — it has no privileged back-channel.

**Runtime Stack:**
- LLM backend: Ollama (local) running `qwen2.5:14b-instruct` (default) or any OpenAI-compatible endpoint
- GM process: `ai_gm/gm.py` — standalone Python service, separate from the game server
- Communication: HTTP polling of `/api/ai/*` endpoints (auth-gated via `AI_API_KEY`)

### 6.2 Campaign Initialisation
On first startup against a running game, the GM executes one-time campaign setup:

1. **Faction Generation** — calls the LLM to invent all alien factions for this campaign. Each faction receives:
   - Unique name, visual aesthetic, and communication style
   - Disposition values: warlike/diplomatic, honourable/treacherous, fearful/aggressive
   - Relationship matrix: which factions like, hate, or trade with each other
   - Faction data is stored in `gm_memory.json` and used for all subsequent NPC spawns

2. **Main Arc Planning** — the GM selects one arc archetype and generates 4–6 story beats (events, messages, NPC encounters) spread across the galaxy.

3. **Initial Actions** — spawns starting NPCs in the starting system and queues any opening transmissions.

### 6.3 Operational Cadence
| Event | Default Interval | Configurable via |
|-------|-----------------|-----------------|
| Replan (new beats, reassess arcs) | Every 600 s | `AI_GM_PLAN_INTERVAL_S` |
| State poll (react to player messages) | Every 5 s | `AI_GM_POLL_INTERVAL_S` |
| Wait for game to start | 5 s retry | `AI_GM_WAIT_FOR_GAME_S` |

### 6.4 Arc Archetypes
The GM selects from four built-in story templates:

| Archetype | Title | Hook |
|-----------|-------|------|
| `dark_star` | Dark Star Anomaly | An anomalous signal draws the crew toward a stellar phenomenon that defies known physics |
| `diplomatic` | First Contact | The crew stumbles upon an uncharted civilisation; first impressions determine alliance or war |
| `transport` | Critical Cargo | A high-value package with unknown contents must be delivered across contested space |
| `escort` | The Refugee Fleet | Civilian ships fleeing a conflict zone need protection from pursuing hunters |

In addition to the main arc, the GM weaves **sidequests** triggered by proximity events (derelict ships, distress beacons, factional disputes). Sidequests are independent of the main arc and can branch based on crew decisions.

### 6.5 NPC Behaviour Tree
NPCs are controlled by a per-tick code-based steering system (`npc_ai.py`). The GM sets high-level behaviour via the `/api/ai/npc/{id}/behavior` endpoint; the tick loop executes the low-level physics.

| Behaviour | Description |
|-----------|-------------|
| `idle` | Stationary; takes no action |
| `patrol` | Cycles between a list of waypoints |
| `follow` | Maintains proximity to a target ship |
| `attack` | Closes to weapon range and fires |
| `flee` | Accelerates away from a threat until safe distance |
| `move_to` | Navigates to a single waypoint, then idles |
| `intercept` | Closes to weapon range but does not fire (intimidation) |

NPC attack state persists across player warps — a hostile NPC in a system stays hostile if the player returns.

### 6.6 In-World Communications
The GM delivers narrative through delayed transmissions:
- Messages are queued with a `deliver_in_seconds` delay so they arrive at dramatically appropriate moments
- Each message carries: `from_name`, `body`, optional `video_color` (faction accent), optional `video_url`
- The crew's Communications Panel gates reception by signal range; the GM accounts for this when targeting systems

### 6.7 Panic Controls & Rate Limits
To prevent a runaway LLM from corrupting an active session:

| Safeguard | Mechanism |
|-----------|-----------|
| NPC spawn cap | Max NPCs configurable; GM cannot exceed it |
| Message queue depth | Pending messages capped; oldest dropped if limit exceeded |
| Manual kill | `POST /api/ai/reset` clears all pending messages and despawns all NPCs |
| Session isolation | `gm_memory.json` is cleared and regenerated on each new `/api/game/start` call |

### 6.8 Session Setup & Player Join Flow
The game supports a 4-digit station code system for multi-tablet sessions:

1. After starting a game, the Game Master navigates to **Station Setup**
2. Each physical tablet station is assigned a name, icon, panel list, and a unique 4-digit code
3. Players navigate to `<host>/<code>` (e.g. `192.168.1.10:8000/4471`) and see their pre-configured panel list
4. The join URL can be bookmarked — refreshing it reconnects the player to the same station instantly
5. Station assignments persist server-side; codes survive game-running state changes until a new game is started

### 6.9 Launch Commands (Windows)
```powershell
# Start backend server
cd backend; uvicorn main:app --host 0.0.0.0 --port 8000

# Start GM (in a separate terminal; requires Ollama running)
.\start-gm.ps1

# Start all station browser windows (kiosk mode, one per monitor)
.\start-local.ps1
```

---
