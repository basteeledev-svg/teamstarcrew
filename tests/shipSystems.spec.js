/**
 * Ship Systems Integration Tests
 *
 * Tests cross-system interactions using the frontend UI. All game-state
 * mutations go through the browser; only GET /api/game/state is used to
 * verify results.
 *
 * Prerequisites:
 *   - Backend running:  cd backend && uvicorn main:app --reload  (port 8000)
 *   - Frontend running: cd frontend && npm run dev               (port 5173)
 *
 * Run:  npx playwright test  (from workspace root)
 */

import { test, expect } from '@playwright/test'

// ── Shared test state ─────────────────────────────────────────────────────────
// Some tests rely on state left by prior tests (serial execution).
// We use a module-level object rather than fixtures so data survives serial runs.
const shared = {}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch the full game state via the frontend's proxy (avoids CORS). */
async function apiState(page) {
  return page.evaluate(() =>
    fetch('/api/game/state').then(r => r.json())
  )
}

/**
 * Poll the API until `predicate(state)` returns truthy, then return the state.
 * Throws after `timeout` ms if the condition is never met.
 */
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

/**
 * Move a React <input type="range"> to the given numeric value.
 * React's synthetic onChange does not fire on programmatic .value assignment,
 * so we use the native HTMLInputElement value setter and dispatch native events.
 */
async function setSlider(page, testId, value) {
  const loc = page.locator(`[data-testid="${testId}"]`)
  // Wait explicitly for element to be visible (panel may still be loading)
  await loc.waitFor({ state: 'visible', timeout: 15_000 })
  await loc.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, String(v))
    // React 17+ listens to 'input' events via root delegation
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  // Small pause so the WS command can be dispatched before any subsequent actions
  await page.waitForTimeout(400)
}

/**
 * Open a new browser context, navigate to the console select page,
 * toggle the given console(s), then click "ENTER SHIP".
 * Returns { page, ctx } – call ctx.close() when done.
 */
async function openConsole(browser, consoleIds) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  for (const id of consoleIds) {
    await page.click(`[data-testid="console-btn-${id}"]`)
  }
  await page.click('[data-testid="enter-btn"]')
  // Wait for the WS to deliver game state: the '● LIVE' indicator appears when connected
  // and the panel replaces its "NO SIGNAL" / loading state with real content.
  // We wait for the live indicator to be visible (connected + state received).
  await page.waitForFunction(
    () => document.body.innerText.includes('● LIVE'),
    { timeout: 15_000 }
  )
  // Small extra buffer for React to finish rendering the panel
  await page.waitForTimeout(500)
  return { page, ctx }
}

/**
 * Open a new browser context and navigate to the Admin page.
 * Returns { page, ctx } – call ctx.close() when done.
 */
async function openAdmin(browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="admin-btn"]')
  await page.waitForTimeout(400)
  return { page, ctx }
}

// ── Test suite (serial – each test depends on the previous) ──────────────────
test.describe.serial('Ship Systems Integration', () => {

  // ── Test 1: Start a new game ───────────────────────────────────────────────
  test('1 – admin console starts a new game', async ({ browser }) => {
    const { page, ctx } = await openAdmin(browser)

    // The START NEW GAME card lives in the "GAME CONTROL" tab (not the default "SHIP STATUS")
    await page.click('button:has-text("GAME CONTROL")')
    await page.waitForTimeout(300)

    // The START NEW GAME card has an EXECUTE button with our testId
    await page.click('[data-testid="start-game-btn"]')

    await waitFor(page, s => s?.status === 'running', { timeout: 15_000, interval: 1_000 })

    // Confirm seeded resources are present in the cargo bay
    const state = await apiState(page)
    expect(state.ship.rooms.cargo_bay.metals).toBeGreaterThanOrEqual(5000)
    expect(state.ship.rooms.cargo_bay.shield_batteries).toBeGreaterThanOrEqual(4)
    expect(state.ship.rooms.shields_room.shield_batteries).toBeGreaterThanOrEqual(3)
    expect(state.ship.rooms.manufacturing.metals).toBeGreaterThanOrEqual(3000)

    await ctx.close()
  })

  // ── Test 2: Power allocation changes propagate to scan range ──────────────
  // Window A (power) → slides scanner allocation up.
  // Window B (short_range) represents a second crew member's tablet.
  // Both windows share the same backend game state; API verifies the effect.
  test('2 – power allocation change increases scan range', async ({ browser }) => {
    // Window A: power console
    const { page: powerPage, ctx: powerCtx } = await openConsole(browser, ['power'])
    // Window B: short-range scanner console (second tablet, read-only in this test)
    const { page: scanPage, ctx: scanCtx }   = await openConsole(browser, ['short_range'])

    // Record baseline scan power (short_range_scanner at 5 % of net GW from default reactor output)
    const before = await apiState(scanPage)
    const initialScanGw = before.short_range_scan.scan_gw
    // net_power_gw must be > 0 for this test to be meaningful
    expect(before.ship.net_power_gw).toBeGreaterThan(0)

    // Increase scanner allocation from 5 % → 25 % using the power console slider.
    // The game starts with reactors at 5% output producing ~200 GW — enough for a
    // detectable scan_gw change without touching reactor output sliders.
    await setSlider(powerPage, 'alloc-slider-short_range_scanner', 25)
    await powerPage.waitForTimeout(1_000)

    // API should now show a higher scan_gw on the short-range scanner
    const after = await apiState(scanPage)
    expect(after.short_range_scan.scan_gw).toBeGreaterThan(initialScanGw)

    // Store net power for subsequent tests
    shared.netPowerGw = after.ship.net_power_gw

    await powerCtx.close()
    await scanCtx.close()
  })

  // ── Test 3: Transportation panel moves items between rooms ─────────────────
  test('3 – transport moves metals from cargo bay to manufacturing', async ({ browser }) => {
    // Read baseline manufacturing metals before dispatching
    const { page: apiPage, ctx: apiCtx } = await openConsole(browser, ['short_range'])
    const before = await apiState(apiPage)
    const initialMfgMetals = before.ship.rooms.manufacturing.metals
    await apiCtx.close()

    // Open transportation console
    const { page, ctx } = await openConsole(browser, ['transportation'])

    // Step 1: pick source room
    await page.click('[data-testid="src-cargo_bay"]')
    await page.waitForTimeout(300)

    // Step 2: pick item (metals)
    await page.click('[data-testid="item-metals"]')
    await page.waitForTimeout(300)

    // Step 3: pick destination
    await page.click('[data-testid="dst-manufacturing"]')
    await page.waitForTimeout(300)

    // Step 4: set a specific amount
    await page.locator('[data-testid="amount-input"]').fill('500')
    await page.waitForTimeout(200)

    // Step 5: dispatch – button is visible only when src + item + dest are all chosen
    await page.click('[data-testid="dispatch-btn"]')

    // Transport takes ~10 ticks (5 pickup + 5 delivery = 10 seconds)
    await waitFor(
      page,
      s => s.ship.rooms.manufacturing.metals > initialMfgMetals,
      { timeout: 30_000, interval: 2_000 }
    )

    const after = await apiState(page)
    expect(after.ship.rooms.manufacturing.metals).toBeCloseTo(initialMfgMetals + 500, 0)

    await ctx.close()
  })

  // ── Test 4: Manufacturing panel produces components ────────────────────────
  test('4 – manufacturing console produces air scrubbers', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['manufacturing'])

    // Baseline
    const before = await apiState(page)
    const initialScrubbers = before.ship.rooms.manufacturing.air_scrubbers ?? 0

    // Set the air_scrubbers recipe slider to 100 % – commits all manufacturing
    // power to air scrubber production.
    // Recipe cost: 200 GW-ticks. At 5 % alloc of net GW the recipe finishes in
    // a few ticks; manufacturing room already has the required metals + rare_earth.
    await setSlider(page, 'mfg-slider-air_scrubbers', 100)

    await waitFor(
      page,
      s => (s.ship.rooms.manufacturing.air_scrubbers ?? 0) > initialScrubbers,
      { timeout: 60_000, interval: 2_000 }
    )

    const after = await apiState(page)
    expect(after.ship.rooms.manufacturing.air_scrubbers).toBeGreaterThan(initialScrubbers)

    await ctx.close()
  })

  // ── Test 5: Manufactured goods transported to destination room ─────────────
  test('5 – transport moves air scrubbers from manufacturing to living quarters', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['transportation'])

    const before = await apiState(page)
    const initialLqScrubbers = before.ship.rooms.living_quarters.air_scrubbers ?? 0
    const availableScrubbers  = before.ship.rooms.manufacturing.air_scrubbers  ?? 0

    // Need at least one air scrubber in manufacturing (produced by test 4)
    expect(availableScrubbers).toBeGreaterThan(0)

    // Source: manufacturing room
    await page.click('[data-testid="src-manufacturing"]')
    await page.waitForTimeout(300)

    // Item: air_scrubbers
    await page.click('[data-testid="item-air_scrubbers"]')
    await page.waitForTimeout(300)

    // Destination: living quarters
    await page.click('[data-testid="dst-living_quarters"]')
    await page.waitForTimeout(300)

    // Dispatch all available (leave amount empty → picks up maxAmt)
    await page.click('[data-testid="dispatch-btn"]')

    await waitFor(
      page,
      s => (s.ship.rooms.living_quarters.air_scrubbers ?? 0) > initialLqScrubbers,
      { timeout: 30_000, interval: 2_000 }
    )

    const after = await apiState(page)
    expect(after.ship.rooms.living_quarters.air_scrubbers).toBeGreaterThan(initialLqScrubbers)

    await ctx.close()
  })

  // ── Test 6: Shields console installs a defense laser ──────────────────────
  // shields_room is seeded with lasers: 2 so there are components to install.
  test('6 – shields console installs a defense laser on the front section', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['shields'])

    const before = await apiState(page)
    const initialLasers = before.ship.hull_sections.front.defense_lasers.length

    // Navigate into the front hull section detail
    await page.click('[data-testid="sec-btn-front"]')
    await page.waitForTimeout(500)

    // Install one defense laser
    await page.click('[data-testid="install-def-laser-btn"]')
    await page.waitForTimeout(1_000)

    const after = await apiState(page)
    expect(after.ship.hull_sections.front.defense_lasers.length).toBeGreaterThan(initialLasers)

    await ctx.close()
  })

  // ── Test 7: Reactor overheat causes damage; repair bot restores health ─────
  // This test deliberately runs a reactor at 100 % until meltdown, then uses
  // the repairs console to dispatch a bot that restores the system health.
  // It uses two simultaneous browser windows (power + repairs), matching the
  // "different crew members on different tablets" scenario.
  test('7 – reactor overheat damages reactor; repair bot restores it', async ({ browser }) => {
    const { page: powerPage, ctx: powerCtx }     = await openConsole(browser, ['power'])
    const { page: repairsPage, ctx: repairsCtx } = await openConsole(browser, ['repairs'])

    // ── Phase A: drive reactor_1_fuel to overheat ──────────────────────────
    // Set to 100 % output → heat rises +2/tick → meltdown at heat = 100 (≈50 ticks).
    // With 1M fuel seeded, this won't deplete the tank.
    await setSlider(powerPage, 'reactor-slider-reactor_1_fuel', 100)

    const beforeHealth = (await apiState(powerPage)).ship.system_health.reactor_1_fuel

    // Poll until the reactor takes any heat damage (meltdown or earlier heat damage)
    await waitFor(
      powerPage,
      s => (s.ship.system_health.reactor_1_fuel ?? 100) < beforeHealth - 0.5,
      { timeout: 120_000, interval: 3_000 }
    )

    const damagedState = await apiState(powerPage)
    const damagedHealth = damagedState.ship.system_health.reactor_1_fuel
    expect(damagedHealth).toBeLessThan(beforeHealth)

    // ── Phase B: repairs console dispatches a bot to fix the reactor ───────
    // The first (and only) repair bot has id=1
    await repairsPage.click('[data-testid="rep-bot-1"]')
    await repairsPage.waitForTimeout(300)

    // Switch to the SYSTEMS tab to see reactor targets
    await repairsPage.click('[data-testid="rep-tab-systems"]')
    await repairsPage.waitForTimeout(300)

    // Click the reactor_1_fuel target row (visible and clickable because health < 100)
    await repairsPage.click('[data-testid="rep-target-system-reactor_1_fuel"]')
    await repairsPage.waitForTimeout(300)

    // Dispatch the bot
    await repairsPage.click('[data-testid="rep-dispatch-btn"]')

    // Poll until health improves (repair takes a few ticks per HP)
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
})
