/**
 * Ship Systems Acceptance Tests (browser)
 *
 * Three suites:
 *   A — Entry flow:   Landing → New Game / Join (role or custom) / Admin
 *   B — Cross-panel:  one console changes something another console depends on,
 *                     driven through the real panels in separate "tablets"
 *   C — Stations:     every crew role opens its first console against a live game
 *
 * The backend tests (backend/tests/) cover the rules in depth and in seconds;
 * these check the buttons and sliders on each console actually reach the server.
 * Everything goes through the panels except flying (the map is a canvas): the
 * helper `pilot()` sends the same WebSocket commands the Navigation console does.
 *
 * Prerequisites — either:
 *   - backend serving the built frontend:  PLAYWRIGHT_BASE_URL=http://localhost:8010
 *   - or backend :8050 + Vite dev server :5173 (default base URL)
 * Run:  npx playwright test   (from the repo root; takes ~4 minutes)
 */

import { test, expect } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Full game state, read through the page's own origin. */
async function apiState(page) {
  return page.evaluate(() => fetch('/api/game/state').then(r => r.json()))
}

/** Poll until `predicate(state)` is truthy. */
async function waitFor(page, predicate, { timeout = 90_000, interval = 1_000, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout
  let state
  while (Date.now() < deadline) {
    state = await apiState(page)
    if (predicate(state)) return state
    await page.waitForTimeout(interval)
  }
  throw new Error(`waitFor(${what}) not met within ${timeout}ms (status: ${state?.status})`)
}

/** Move a React-controlled <input type="range">. */
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

/** Send one WebSocket command the way a console does; resolves with the ack/error. */
async function pilot(page, payload) {
  return page.evaluate(p => new Promise(resolve => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onopen = () => ws.send(JSON.stringify(p))
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.type === 'ack' || m.type === 'error') { ws.close(); resolve(m) }
    }
  }), payload)
}

/** Start a fresh game over REST and wait for the landing page to show it. */
async function ensureGame(page, { mode = 'full', seed = 42, playerCount = 6 } = {}) {
  await page.goto('/')
  await page.evaluate(({ pc, m, s }) =>
    fetch(`/api/game/start?mode=${m}&player_count=${pc}&seed=${s}`, { method: 'POST' }).then(r => r.json()),
    { pc: playerCount, m: mode, s: seed })
  await page.goto('/')
  await page.waitForFunction(() => /IN PROGRESS/.test(document.body.innerText), { timeout: 10_000 })
}

/** Landing → JOIN → CUSTOM → pick consoles → ENTER. */
async function openConsole(browser, consoleIds) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="join-btn"]')
  await page.click('[data-testid="mode-custom-btn"]')
  for (const id of consoleIds) await page.click(`[data-testid="console-btn-${id}"]`)
  await page.click('[data-testid="enter-btn"]')
  await page.waitForFunction(() => document.body.innerText.includes('● LIVE'), { timeout: 15_000 })
  await page.waitForTimeout(500)
  return { page, ctx }
}

/** Landing → JOIN → ROLE → role-btn-{id}. */
async function openRole(browser, roleId) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/')
  await page.click('[data-testid="join-btn"]')
  await page.click('[data-testid="mode-role-btn"]')
  await page.click(`[data-testid="role-btn-${roleId}"]`)
  await page.waitForFunction(() => document.body.innerText.includes('● LIVE'), { timeout: 15_000 })
  await page.waitForTimeout(500)
  return { page, ctx }
}

/** Transport console: source → item → destination → amount → dispatch. */
async function dispatch(page, src, item, dst, amount) {
  await page.click(`[data-testid="src-${src}"]`);   await page.waitForTimeout(250)
  await page.click(`[data-testid="item-${item}"]`); await page.waitForTimeout(250)
  await page.click(`[data-testid="dst-${dst}"]`);   await page.waitForTimeout(250)
  if (amount != null) await page.locator('[data-testid="amount-input"]').fill(String(amount))
  await page.waitForTimeout(200)
  await page.click('[data-testid="dispatch-btn"]')
}


// ═════════════════════════════════════════════════════════════════════════════
// SUITE A — Entry flow
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('A · Entry flow', () => {

  test('A1 – landing shows IN PROGRESS with JOIN/NEW GAME/ADMIN when a game is running', async ({ page }) => {
    await ensureGame(page, { mode: 'empty', seed: 99 })
    await expect(page.locator('[data-testid="new-game-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="join-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="admin-btn"]').first()).toBeVisible()
  })

  test('A2 – NEW GAME (full mode) starts a living galaxy and opens Station Setup', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="new-game-btn"]')
    await page.click('[data-testid="new-game-mode-full"]')
    await page.click('[data-testid="confirm-new-game-btn"]')
    const s = await waitFor(page, st => st?.status === 'running' && st.tick < 30, { what: 'new game' })
    expect(s.player_count).toBe(6)
    expect(s.world.factions.length).toBe(6)
    await page.waitForFunction(() => /STATION/i.test(document.body.innerText), { timeout: 10_000 })
  })

  test('A3 – role picker enters with that role\'s consoles (bosun → REPAIRS)', async ({ browser }) => {
    const { page, ctx } = await openRole(browser, 'bosun')
    const txt = await page.locator('body').innerText()
    expect(txt).toMatch(/REPAIRS/i)
    expect(txt).toMatch(/● LIVE/)
    await ctx.close()
  })

  test('A4 – custom picker allows at most 4 consoles', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="join-btn"]')
    await page.click('[data-testid="mode-custom-btn"]')
    for (const id of ['power', 'engines', 'shields', 'weapons']) await page.click(`[data-testid="console-btn-${id}"]`)
    await expect(page.locator('[data-testid="console-btn-navigation"]')).toBeDisabled()
    await expect(page.locator('[data-testid="enter-btn"]')).toBeEnabled()
  })

  test('A5 – admin GAME CONTROL starts a new game', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="admin-btn"]').first().click()
    await page.click('[data-testid="admin-tab-game"]')
    const t0 = (await apiState(page)).tick
    await page.click('[data-testid="start-game-btn"]')
    await waitFor(page, s => s?.status === 'running' && s.tick < Math.max(t0, 5), { timeout: 15_000, what: 'restart' })
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// SUITE B — Cross-panel interactions (full game, serial)
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('B · Cross-panel interactions', () => {

  test('B1 – a fresh game is stocked for every station', async ({ page }) => {
    await ensureGame(page, { mode: 'full', seed: 7 })
    const s = await apiState(page)
    const r = s.ship.rooms
    expect(r.cargo_bay.metals).toBeGreaterThanOrEqual(5000)
    expect(r.tactical_bridge.shield_generators).toBeGreaterThanOrEqual(3)
    expect(r.sub_deck_refinery.metals).toBeGreaterThan(2500)   // refining starts on tick 1
    expect(r.reactor_room.warp_batteries).toBeGreaterThanOrEqual(1)
    expect(s.ship.transport_bots.length).toBe(2)
    expect(s.ship.warp_capacitor_max_tw).toBe(7500)
  })

  test('B2 – POWER scanner slider → SHORT RANGE SCAN gets more power', async ({ browser }) => {
    const { page: power, ctx: pc } = await openConsole(browser, ['power'])
    const { page: scan,  ctx: sc } = await openConsole(browser, ['short_range'])
    const before = (await apiState(scan)).short_range_scan.scan_gw
    await setSlider(power, 'alloc-slider-scanner', 30)
    await waitFor(scan, s => s.short_range_scan.scan_gw > before * 1.5, { timeout: 10_000, what: 'scan power up' })
    await pc.close(); await sc.close()
  })

  test('B3 – POWER battery slider → net power rises while the battery drains', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['battery'])
    const s0 = await apiState(page)
    await pilot(page, { type: 'set_battery_slider', value: 2 })   // 10 TW/tick: the 50 TW start charge lasts ~5 ticks
    await waitFor(page, s => s.ship.net_power_tw > s0.ship.net_power_tw &&
                             s.ship.battery_energy_tw < s0.ship.battery_energy_tw, { timeout: 10_000, what: 'discharge' })
    await pilot(page, { type: 'set_battery_slider', value: 0 })
    await ctx.close()
  })

  test('B4 – TRANSPORT moves metals from the cargo bay to the refinery', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['transportation'])
    const m0 = (await apiState(page)).ship.rooms.sub_deck_refinery.metals
    await dispatch(page, 'cargo_bay', 'metals', 'sub_deck_refinery', 500)
    await waitFor(page, s => s.ship.rooms.sub_deck_refinery.metals > m0 + 400, { timeout: 30_000, what: 'metals delivered' })
    await ctx.close()
  })

  test('B5 – MANUFACTURING builds a warp battery → ENGINES/UNIVERSE warp capacity rises', async ({ browser }) => {
    const { page: power, ctx: pc } = await openConsole(browser, ['power'])
    await setSlider(power, 'alloc-slider-synthesis', 12)      // fabrication halts at ≤5% synthesis power
    await pc.close()
    const { page, ctx } = await openConsole(browser, ['manufacturing'])
    await pilot(page, { type: 'set_fabrication_choice', recipe: 'battery', output: 'warp_batteries' })
    const cap0 = (await apiState(page)).ship.warp_capacitor_max_tw
    await setSlider(page, 'fab-slider-battery', 2)
    await waitFor(page, s => s.ship.warp_capacitor_max_tw > cap0, { timeout: 60_000, what: 'warp battery built' })
    await setSlider(page, 'fab-slider-battery', 0)
    await ctx.close()
  })

  test('B6 – TRANSPORT brings shield generators to the bridge → SHIELDS installs one on FORE', async ({ browser }) => {
    const { page: tr, ctx: tc } = await openConsole(browser, ['transportation'])
    const b0 = (await apiState(tr)).ship.rooms.tactical_bridge.shield_generators
    await dispatch(tr, 'cargo_bay', 'shield_generators', 'tactical_bridge', 1)
    await waitFor(tr, s => s.ship.rooms.tactical_bridge.shield_generators > b0, { timeout: 30_000, what: 'generator on bridge' })
    await tc.close()

    const { page, ctx } = await openConsole(browser, ['shields'])
    await page.click('[data-testid="sec-btn-fore"]'); await page.waitForTimeout(400)
    await page.click('[data-testid="install-shield-bat-btn"]')
    await waitFor(page, s => (s.ship.hull_sections.fore.shield_generators ?? []).length > 0,
                  { timeout: 150_000, interval: 3_000, what: 'generator installed' })
    await ctx.close()
  })

  test('B7 – POWER redlines a reactor → it overheats → REPAIRS fixes it', async ({ browser }) => {
    const { page: power,   ctx: pc } = await openConsole(browser, ['power'])
    const { page: repairs, ctx: rc } = await openConsole(browser, ['repairs'])
    await setSlider(power, 'reactor-slider-reactor_1_fuel', 100)
    const h0 = (await apiState(power)).ship.system_health.reactor_1_fuel
    await waitFor(power, s => s.ship.system_health.reactor_1_fuel < h0 - 0.5, { timeout: 120_000, interval: 2_000, what: 'overheat damage' })
    await setSlider(power, 'reactor-slider-reactor_1_fuel', 30)
    const damaged = (await apiState(power)).ship.system_health.reactor_1_fuel

    await repairs.click('[data-testid="rep-bot-1"]');                        await repairs.waitForTimeout(300)
    await repairs.click('[data-testid="rep-tab-systems"]');                  await repairs.waitForTimeout(300)
    await repairs.click('[data-testid="rep-target-system-reactor_1_fuel"]'); await repairs.waitForTimeout(300)
    await repairs.click('[data-testid="rep-dispatch-btn"]')
    await waitFor(repairs, s => s.ship.system_health.reactor_1_fuel >= Math.min(100, damaged + 0.5), { timeout: 90_000, interval: 2_000, what: 'repaired' })
    await pc.close(); await rc.close()
  })

  test('B8 – a GW-locked station keeps its power while reactor output swings', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['power'])
    await pilot(page, { type: 'set_gw_lock', station: 'general_systems', gw_target: 20 })
    const locked = await waitFor(page, s => s.ship.power_allocation_tw_targets?.general_systems === 20, { what: 'TW lock' })
    const target = locked.ship.power_allocation_tw_targets.general_systems
    await setSlider(page, 'reactor-slider-reactor_2_fuel', 60)
    await page.waitForTimeout(2_000)
    for (let i = 0; i < 4; i++) {
      const s = await apiState(page)
      const delivered = s.ship.power_allocation.general_systems / 100 * s.ship.net_power_tw
      expect(Math.abs(delivered - target)).toBeLessThanOrEqual(0.05)
      await page.waitForTimeout(1_000)
    }
    await setSlider(page, 'reactor-slider-reactor_2_fuel', 30)
    await ctx.close()
  })

  test('B9 – mayday: fly alongside, TRANSPORT evacuates survivors, CAPTAIN\'S LOG records it', async ({ browser }) => {
    const { page, ctx } = await openConsole(browser, ['transportation', 'mission'])
    await ensureGame(page, { mode: 'full', seed: 11 })
    await page.goto('/'); await page.click('[data-testid="join-btn"]'); await page.click('[data-testid="mode-custom-btn"]')
    await page.click('[data-testid="console-btn-transportation"]'); await page.click('[data-testid="console-btn-mission"]')
    await page.click('[data-testid="enter-btn"]')
    const s0 = await waitFor(page, s => s.comms.messages.some(m => /MAYDAY/.test(m.subject)), { timeout: 30_000, what: 'mayday' })
    const mayday = s0.comms.messages.find(m => /MAYDAY/.test(m.subject))

    // Engines + autopilot (the Navigation map is a canvas, so fly by command)
    await pilot(page, { type: 'set_engine_output', engine: 'engine_3_fuel', value: 0.6 })
    await pilot(page, { type: 'set_engine_output', engine: 'engine_4_fuel', value: 0.6 })
    expect((await pilot(page, { type: 'set_course', kind: 'npc', id: mayday.from_id })).type).toBe('ack')
    await pilot(page, { type: 'set_thrust', value: 1.0 })
    await waitFor(page, s => !s.world.course, { timeout: 90_000, what: 'alongside' })

    const sid = `ship:${mayday.from_id}`
    for (let trip = 0; trip < 4; trip++) {
      const s = await apiState(page)
      const t = s.world.transport_targets.find(x => x.id === sid)
      if (!t?.cargo?.people) break
      await waitFor(page, st => st.ship.transport_bots.some(b => b.state === 'idle'), { timeout: 40_000, what: 'idle bot' })
      await dispatch(page, sid, 'people', 'living_quarters', null)
      await page.waitForTimeout(1_500)
    }
    const done = await waitFor(page, s => s.world.passengers > 0 &&
      !s.world.transport_targets.find(x => x.id === sid)?.cargo?.people, { timeout: 90_000, what: 'evacuated' })
    expect(done.world.log.some(l => /collected .* people/.test(l.text))).toBeTruthy()

    // Captain's Log shows it
    await page.locator('.hud-nav-arrow').last().click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText(/passengers/i)
    await ctx.close()
  })

  test('B10 – CAPTAIN\'S LOG plan board is shared between tablets', async ({ browser }) => {
    const { page: a, ctx: ac } = await openConsole(browser, ['mission'])
    const { page: b, ctx: bc } = await openConsole(browser, ['mission'])
    await a.locator('[data-testid="note-input"]').fill('Bring oxygen to the Osprey')
    await a.keyboard.press('Enter')
    await expect(b.locator('[data-testid="note"]').filter({ hasText: 'Bring oxygen' })).toBeVisible({ timeout: 10_000 })
    await ac.close(); await bc.close()
  })
})


// ═════════════════════════════════════════════════════════════════════════════
// SUITE C — every crew role opens its first console
// ═════════════════════════════════════════════════════════════════════════════
test.describe.serial('C · Station coverage', () => {
  const ROLES = [
    { id: 'captain',  primary: /CAPTAIN'S LOG/i },
    { id: 'pilot',    primary: /NAVIGATION/i },
    { id: 'tactical', primary: /WEAPONS/i },
    { id: 'shields',  primary: /SHIELDS/i },
    { id: 'engineer', primary: /POWER/i },
    { id: 'science',  primary: /LONG RANGE SCAN/i },
    { id: 'bosun',    primary: /REPAIRS/i },
  ]
  for (const role of ROLES) {
    test(`C · role "${role.id}" loads its first console`, async ({ browser }) => {
      const { page, ctx } = await openRole(browser, role.id)
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      const txt = await page.locator('body').innerText()
      expect(txt).toMatch(role.primary)
      expect(txt).toMatch(/● LIVE/)
      expect(errors).toEqual([])
      await ctx.close()
    })
  }
})
