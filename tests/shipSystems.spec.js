/**
 * Ship Systems Acceptance Tests
 *
 * Two suites:
 *   A — Entry flow:        LandingPage → NewGamePage / JOIN role-picker / ADMIN
 *   B — Cross-system:      end-to-end interactions through the new entry flow,
 *                          covering stations from docs/05-stations-and-crew.md
 *
 * The tests drive the UI in real browser contexts (one per "tablet"). All
 * game-state mutations go through the panels themselves; only GET
 * /api/game/state is used for verification.
 *
 * Prerequisites:
 *   - Backend  on http://localhost:8000   (./start-backend.sh)
 *   - Frontend on http://localhost:5174   (./start-frontend.sh)
 *
 * Run:  npx playwright test  (from workspace root)
 */

import { test, expect } from '@playwright/test'

// ── Shared state for serial integration suite ────────────────────────────────
const shared = {}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch full game state via the frontend's proxy (avoids CORS). */
async function apiState(page) {
  return page.evaluate(() => fetch('/api/game/state').then(r => r.json()))
}

/** Poll the API until `predicate(state)` returns truthy. */
async function waitFor(page, predicate, { timeout = 90_000, interval = 2_000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const state = await apiState(page)
    if (predicate(state)) return state
    await page.waitForTimeout(interval)
  }
  const state = await apiState(page)
  throw new Error(
    `waitFor: condition not met within ${timeout}ms.\n` +
    `Last status: ${state?.status ?? 'unknown'}`
  )
}

/** Move a React-controlled <input type="range"> via the native value setter. */
async function setSlider(page, testId, value) {
  const loc = page.locator(`[data-testid="${testId}"]`)
  await loc.waitFor({ state: 'visible', timeout: 15_000 })
  await loc.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, String(v))
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  await page.waitForTimeout(400)
}

/** REST-level helper: ensure a fresh game is running with the given crew size. */
async function ensureGame(page, { playerCount = 6, mode = 'empty', seed = 42 } = {}) {
  await page.goto('/')
  await page.evaluate(({ pc, m, s }) =>
    fetch(`/api/game/start?mode=${m}&player_count=${pc}&seed=${s}`, { method: 'POST' })
      .then(r => r.json()),
    { pc: playerCount, m: mode, s: seed }
  )
  // Reload so the LandingPage observes the running state via WS.
  await page.goto('/')
  await page.waitForFunction(() => /IN PROGRESS/.test(document.body.innerText), { timeout: 10_000 })
}

/**
 * Land → JOIN → CUSTOM → pick consoles → ENTER. Returns { page, ctx }.
 * Use ctx.close() when done.
 */
async function openConsole(browser, consoleIds) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="join-btn"]')
  await page.click('[data-testid="mode-custom-btn"]')
  for (const id of consoleIds) {
    await page.click(`[data-testid="console-btn-${id}"]`)
  }
  await page.click('[data-testid="enter-btn"]')
  await page.waitForFunction(
    () => document.body.innerText.includes('● LIVE'),
    { timeout: 15_000 }
  )
  await page.waitForTimeout(500)
  return { page, ctx }
}

/** Land → JOIN → ROLE → pick role-btn-{id}. Returns { page, ctx }. */
async function openRole(browser, roleId) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="join-btn"]')
  await page.click('[data-testid="mode-role-btn"]')
  await page.click(`[data-testid="role-btn-${roleId}"]`)
  await page.waitForFunction(
    () => document.body.innerText.includes('● LIVE'),
    { timeout: 15_000 }
  )
  await page.waitForTimeout(500)
  return { page, ctx }
}

/** Land → ADMIN. Returns { page, ctx }. */
async function openAdmin(browser) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="admin-btn"]')
  await page.waitForTimeout(400)
  return { page, ctx }
}


// ═════════════════════════════════════════════════════════════════════════════
// SUITE A — Entry flow (LandingPage / NewGamePage / ConsoleSelectPage / Admin)
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('A · Entry flow', () => {

  // A1 — Verify Landing reflects the running game (IN PROGRESS state).
  // (Reaching STANDBY would require a full backend restart — the /game/stop
  // endpoint pauses ticks but doesn't tear down ship/galaxy state.)
  test('A1 – landing shows IN PROGRESS with a JOIN button when game is running', async ({ browser }) => {
    const ctx  = await browser.newContext()
    const page = await ctx.newPage()
    // Make sure a game is running.
    await ensureGame(page, { playerCount: 6, mode: 'empty', seed: 99 })
    await page.waitForFunction(() => /IN PROGRESS/.test(document.body.innerText), { timeout: 10_000 })

    await expect(page.locator('[data-testid="new-game-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="join-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="admin-btn"]')).toBeVisible()
    await ctx.close()
  })

  // A2 — Walk the NEW GAME flow with player_count=6 and verify the API.
  test('A2 – NEW GAME flow starts a 6-player game', async ({ browser }) => {
    const ctx  = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/')
    await page.click('[data-testid="new-game-btn"]')
    await page.click('[data-testid="pc-btn-6"]')
    await page.click('[data-testid="confirm-new-game-btn"]')

    // After generation, App routes us to ConsoleSelectPage (running game) or
    // straight back to landing if start callback only refreshed state. Either
    // way, the API state should now be running with player_count=6.
    const s = await waitFor(page, st => st?.status === 'running', { timeout: 15_000, interval: 1_000 })
    expect(s.player_count).toBe(6)
    await ctx.close()
  })

  // A3 — From ConsoleSelectPage in ROLE mode, taking a role enters the game
  //       with that role's full console set.
  test('A3 – role-picker enters game with the role consoles', async ({ browser }) => {
    const { page, ctx } = await openRole(browser, 'bosun')
    // Bosun's primary console (first in the 6P layout) is REPAIRS — verify it
    // rendered and the WS is live.
    const txt = await page.locator('body').innerText()
    expect(txt).toMatch(/REPAIRS/i)
    expect(txt).toMatch(/● LIVE/)
    await ctx.close()
  })

  // A4 — CUSTOM picker enforces the 4-station selection cap.
  test('A4 – custom-picker enforces 4-station max', async ({ browser }) => {
    const ctx  = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/')
    await page.click('[data-testid="join-btn"]')
    await page.click('[data-testid="mode-custom-btn"]')

    // Pick four valid stations.
    for (const id of ['power', 'engines', 'shields', 'weapons']) {
      await page.click(`[data-testid="console-btn-${id}"]`)
    }
    // The 5th button should be disabled now (visible but unclickable).
    const fifth = page.locator('[data-testid="console-btn-navigation"]')
    await expect(fifth).toBeDisabled()

    // ENTER button is enabled with our four picks.
    await expect(page.locator('[data-testid="enter-btn"]')).toBeEnabled()
    await ctx.close()
  })

  // A5 — From the Admin page, the GAME CONTROL tab can start a fresh game.
  test('A5 – admin GAME CONTROL tab starts a new game', async ({ browser }) => {
    const { page, ctx } = await openAdmin(browser)
    await page.click('[data-testid="admin-tab-game"]')
    await page.waitForTimeout(300)
    await page.click('[data-testid="start-game-btn"]')
    await waitFor(page, s => s?.status === 'running', { timeout: 15_000, interval: 1_000 })
    await ctx.close()
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// SUITE B — Cross-system integration (FULL mode game; serial)
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('B · Cross-system integration', () => {

  // B1 — Reset to a known-good FULL-mode game with seeded resources.
  test('B1 – fresh FULL-mode game has seeded resources', async ({ browser }) => {
    const ctx  = await browser.newContext()
    const page = await ctx.newPage()
    await ensureGame(page, { playerCount: 6, mode: 'full', seed: 7 })

    const state = await apiState(page)
    expect(state.status).toBe('running')
    expect(state.player_count).toBe(6)
    expect(state.ship.rooms.cargo_bay.metals).toBeGreaterThanOrEqual(5000)
    expect(state.ship.rooms.cargo_bay.shield_batteries).toBeGreaterThanOrEqual(4)
    expect(state.ship.rooms.shields_room.shield_batteries).toBeGreaterThanOrEqual(3)
    expect(state.ship.rooms.manufacturing.metals).toBeGreaterThanOrEqual(3000)
    await ctx.close()
  })

  // B2 — POWER station's allocation slider drives short-range scanner GW.
  // Verifies cross-tablet visibility: sliding on tablet A is visible in
  // the API state read by tablet B.
  test('B2 – power allocation change increases scan_gw', async ({ browser }) => {
    const { page: powerPage, ctx: powerCtx } = await openConsole(browser, ['power'])
    const { page: scanPage,  ctx: scanCtx  } = await openConsole(browser, ['short_range'])

    const before = await apiState(scanPage)
    const initialScanGw = before.short_range_scan.scan_gw
    expect(before.ship.net_power_gw).toBeGreaterThan(0)

    await setSlider(powerPage, 'alloc-slider-short_range_scanner', 25)
    await powerPage.waitForTimeout(1_000)

    const after = await apiState(scanPage)
    expect(after.short_range_scan.scan_gw).toBeGreaterThan(initialScanGw)
    shared.netPowerGw = after.ship.net_power_gw

    await powerCtx.close()
    await scanCtx.close()
  })

  // B3 — TRANSPORTATION moves cargo between rooms.
  test('B3 – transport moves metals from cargo bay to manufacturing', async ({ browser }) => {
    const { page: apiPage, ctx: apiCtx } = await openConsole(browser, ['short_range'])
    const before = await apiState(apiPage)
    const initialMfgMetals = before.ship.rooms.manufacturing.metals
    await apiCtx.close()

    const { page, ctx } = await openConsole(browser, ['transportation'])
    await page.click('[data-testid="src-cargo_bay"]');     await page.waitForTimeout(300)
    await page.click('[data-testid="item-metals"]');       await page.waitForTimeout(300)
    await page.click('[data-testid="dst-manufacturing"]'); await page.waitForTimeout(300)
    await page.locator('[data-testid="amount-input"]').fill('500')
    await page.waitForTimeout(200)
    await page.click('[data-testid="dispatch-btn"]')

    await waitFor(
      page,
      s => s.ship.rooms.manufacturing.metals > initialMfgMetals,
      { timeout: 30_000, interval: 2_000 }
    )
    const after = await apiState(page)
    expect(after.ship.rooms.manufacturing.metals).toBeCloseTo(initialMfgMetals + 500, 0)
    await ctx.close()
  })

  // B4 — MANUFACTURING produces components from staged inputs.
  // Note: completed air_scrubbers auto-deliver to living_quarters per the
  // ROOM_PERMISSIONS routing in ship.py.
  test('B4 – manufacturing produces air scrubbers (delivered to living_quarters)', async ({ browser }) => {
    // Ensure manufacturing has enough power allocation — prior tests may have
    // shifted percentages around (especially with general_systems GW-locked).
    const { page: powerPage, ctx: powerCtx } = await openConsole(browser, ['power'])
    await setSlider(powerPage, 'alloc-slider-manufacturing', 30)
    await powerPage.waitForTimeout(500)
    await powerCtx.close()

    const { page, ctx } = await openConsole(browser, ['manufacturing'])
    const before = await apiState(page)
    const initialScrubbers = before.ship.rooms.living_quarters.air_scrubbers ?? 0

    await setSlider(page, 'mfg-slider-air_scrubbers', 100)
    await waitFor(
      page,
      s => (s.ship.rooms.living_quarters.air_scrubbers ?? 0) > initialScrubbers,
      { timeout: 60_000, interval: 2_000 }
    )
    const after = await apiState(page)
    expect(after.ship.rooms.living_quarters.air_scrubbers).toBeGreaterThan(initialScrubbers)
    await ctx.close()
  })

  // B5 — TRANSPORTATION delivers an item between two arbitrary rooms
  // (cargo_bay → shields_room) using the dispatch flow.
  test('B5 – transport delivers shield batteries from cargo bay to shields room', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['transportation'])
    const before = await apiState(page)
    const initialShieldsRoom = before.ship.rooms.shields_room.shield_batteries ?? 0
    const availableInCargo  = before.ship.rooms.cargo_bay.shield_batteries  ?? 0
    expect(availableInCargo).toBeGreaterThan(0)

    await page.click('[data-testid="src-cargo_bay"]');         await page.waitForTimeout(300)
    await page.click('[data-testid="item-shield_batteries"]'); await page.waitForTimeout(300)
    await page.click('[data-testid="dst-shields_room"]');      await page.waitForTimeout(300)
    await page.locator('[data-testid="amount-input"]').fill('1')
    await page.waitForTimeout(200)
    await page.click('[data-testid="dispatch-btn"]')

    await waitFor(
      page,
      s => (s.ship.rooms.shields_room.shield_batteries ?? 0) > initialShieldsRoom,
      { timeout: 30_000, interval: 2_000 }
    )
    const after = await apiState(page)
    expect(after.ship.rooms.shields_room.shield_batteries).toBeGreaterThan(initialShieldsRoom)
    await ctx.close()
  })

  // B6 — SHIELDS officer installs hull-section components.
  // Install takes ~100 GW-ticks via station power; ensure shields has alloc.
  test('B6 – shields installs a defense laser on the front section', async ({ browser }) => {
    // Bump shields alloc + reactor output so the install job progresses fast.
    const { page: powerPage, ctx: powerCtx } = await openConsole(browser, ['power'])
    await setSlider(powerPage, 'reactor-slider-reactor_1_fuel', 50)
    await setSlider(powerPage, 'alloc-slider-shields', 30)
    await powerPage.waitForTimeout(800)
    await powerCtx.close()

    const { page, ctx } = await openConsole(browser, ['shields'])
    const before = await apiState(page)
    const initialLasers = before.ship.hull_sections.front.defense_lasers.length

    await page.click('[data-testid="sec-btn-front"]');    await page.waitForTimeout(500)
    await page.click('[data-testid="install-def-laser-btn"]')

    // Install queues a component_job; it appears in defense_lasers only after
    // the 100-GW-tick job completes.
    await waitFor(
      page,
      s => s.ship.hull_sections.front.defense_lasers.length > initialLasers,
      { timeout: 60_000, interval: 2_000 }
    )
    const after = await apiState(page)
    expect(after.ship.hull_sections.front.defense_lasers.length).toBeGreaterThan(initialLasers)
    await ctx.close()
  })

  // B7 — Reactor overheat → REPAIRS dispatch flow.
  test('B7 – reactor overheat damages reactor; repair bot restores it', async ({ browser }) => {
    const { page: powerPage,   ctx: powerCtx   } = await openConsole(browser, ['power'])
    const { page: repairsPage, ctx: repairsCtx } = await openConsole(browser, ['repairs'])

    await setSlider(powerPage, 'reactor-slider-reactor_1_fuel', 100)
    const beforeHealth = (await apiState(powerPage)).ship.system_health.reactor_1_fuel

    await waitFor(
      powerPage,
      s => (s.ship.system_health.reactor_1_fuel ?? 100) < beforeHealth - 0.5,
      { timeout: 120_000, interval: 3_000 }
    )
    const damagedHealth = (await apiState(powerPage)).ship.system_health.reactor_1_fuel
    expect(damagedHealth).toBeLessThan(beforeHealth)

    await repairsPage.click('[data-testid="rep-bot-1"]');                          await repairsPage.waitForTimeout(300)
    await repairsPage.click('[data-testid="rep-tab-systems"]');                    await repairsPage.waitForTimeout(300)
    await repairsPage.click('[data-testid="rep-target-system-reactor_1_fuel"]');   await repairsPage.waitForTimeout(300)
    await repairsPage.click('[data-testid="rep-dispatch-btn"]')

    await waitFor(
      repairsPage,
      s => s.ship.system_health.reactor_1_fuel > damagedHealth + 0.5,
      { timeout: 90_000, interval: 3_000 }
    )
    const finalState = await apiState(repairsPage)
    expect(finalState.ship.system_health.reactor_1_fuel).toBeGreaterThan(damagedHealth)
    await powerCtx.close()
    await repairsCtx.close()
  })

  // B8 — REGRESSION: GW-locks must hold delivered GW within rounding tolerance.
  // Bug fixed in commit a286fac: `update_gw_locks` rounded percentages to
  // 4 decimals, which lost ~0.45 GW at high total power. After the fix,
  // delivered GW for a locked station should match its target within 0.05 GW.
  test('B8 – GW lock holds 20 GW for general_systems across reactor swings', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['power'])

    // Baseline state: read current general_systems target and confirm it's locked.
    const s0 = await apiState(page)
    const targetGw = s0.ship.power_allocation_gw_targets?.general_systems
    expect(typeof targetGw).toBe('number')
    expect(targetGw).toBeGreaterThan(0)

    // Stress the rounding: bump several reactor sliders so total power changes
    // dramatically while general_systems lock should hold its delivered GW.
    await setSlider(page, 'reactor-slider-reactor_1_fuel', 80)
    await page.waitForTimeout(1_500)
    await setSlider(page, 'reactor-slider-reactor_2_fuel', 60)
    await page.waitForTimeout(1_500)

    // Sample delivered GW for general_systems across several ticks and verify
    // it stays within 0.05 GW of the target every time.
    const tolerance = 0.05
    const samples = []
    for (let i = 0; i < 6; i++) {
      const s = await apiState(page)
      const pct = s.ship.power_allocation.general_systems / 100
      const net = s.ship.net_power_gw
      const delivered = pct * net
      samples.push({ delivered, target: targetGw })
      expect(Math.abs(delivered - targetGw)).toBeLessThanOrEqual(tolerance)
      await page.waitForTimeout(1_500)
    }

    await ctx.close()
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// SUITE C — Doc-05 station coverage smoke (every 6P role can be entered)
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('C · Doc-05 station coverage', () => {
  // The 6P crew layout (from frontend/src/crewLayouts.js) covers every console
  // documented in docs/05-stations-and-crew.md exactly once. Entering each role
  // verifies its panels load against a live game without crashing.
  // GamePage shows ONE panel at a time (with arrow nav between consoles), so we
  // verify that each role's PRIMARY console renders and the WS is live.
  const SIX_P_ROLES = [
    { id: 'captain',  primary: /COMMUNICATIONS/i },
    { id: 'pilot',    primary: /NAVIGATION/i },
    { id: 'weapons',  primary: /WEAPONS/i },
    { id: 'shields',  primary: /SHIELDS/i },
    { id: 'engineer', primary: /POWER/i },
    { id: 'bosun',    primary: /REPAIRS/i },
  ]

  for (const role of SIX_P_ROLES) {
    test(`C · role "${role.id}" loads its primary console`, async ({ browser }) => {
      const { page, ctx } = await openRole(browser, role.id)
      const txt = await page.locator('body').innerText()
      expect(txt).toMatch(role.primary)
      expect(txt).toMatch(/● LIVE/)
      await ctx.close()
    })
  }
})
