import { useState, useEffect, useCallback } from 'react'

// ── Static maps ────────────────────────────────────────────────────────────
const REACTOR_KEYS = ['reactor_1_fuel', 'reactor_2_fuel', 'reactor_3_rad', 'reactor_4_rad']
const REACTOR_LABELS = {
  reactor_1_fuel: 'R1 FUEL', reactor_2_fuel: 'R2 FUEL',
  reactor_3_rad:  'R3 RAD',  reactor_4_rad:  'R4 RAD',
}

// Keys shown as draggable sliders in the grid (warp_drive and battery handled separately)
const SLIDER_KEYS = [
  'engines', 'shields', 'weapons',
  'short_range_scanner', 'long_range_scanner', 'comms', 'life_support',
  'general_systems', 'manufacturing', 'repairs',
]
// All 12 keys the server tracks
const ALL_ALLOC_KEYS = [...SLIDER_KEYS, 'warp_drive', 'battery']
const ALLOC_LABELS = {
  engines: 'ENGINES', shields: 'SHIELDS', weapons: 'WEAPONS',
  short_range_scanner: 'SHORT SCAN', long_range_scanner: 'LONG SCAN',
  comms: 'COMMS', life_support: 'LIFE SUPPORT',
  general_systems: 'GENERAL SYS', manufacturing: 'MANUFACTURE', repairs: 'REPAIRS',
}

const ACCENT   = '#ffaa00'
const ACCENT2  = '#00ffcc'
const BG       = '#070714'
const CARD_BG  = '#09091c'
const MAX_REACTOR_GW = 1000  // matches backend constant

// ── Colour helpers ─────────────────────────────────────────────────────────
function healthColor(pct) {
  if (pct >= 70) return '#00ff88'
  if (pct >= 40) return ACCENT
  return '#ff4444'
}
function heatColor(pct) {
  if (pct < 50) return '#00ff88'
  if (pct < 80) return ACCENT
  return '#ff4444'
}

// ── Normalise allocations so sum stays at exactly 100 % ───────────────────
// `station` is one of SLIDER_KEYS; redistributes delta among other unlocked SLIDER_KEYS.
// warp_drive and battery are left untouched (managed elsewhere).
function normalise(current, locks, station, newPct) {
  const clamped = Math.max(0, Math.min(100, newPct))
  const delta   = clamped - (current[station] ?? 0)
  if (Math.abs(delta) < 0.001) return current

  const others = SLIDER_KEYS.filter(k => !locks[k] && k !== station)
  const next   = { ...current, [station]: clamped }

  const otherSum = others.reduce((s, k) => s + Math.max(0, next[k] ?? 0), 0)
  if (otherSum > 0.001) {
    for (const k of others) {
      const frac = Math.max(0, next[k] ?? 0) / otherSum
      next[k] = Math.max(0, (next[k] ?? 0) - delta * frac)
    }
  } else if (others.length > 0) {
    const share = -delta / others.length
    for (const k of others) next[k] = Math.max(0, (next[k] ?? 0) + share)
  }

  // Absorb rounding error into the moved slider
  const sliderSum = SLIDER_KEYS.reduce((s, k) => s + (next[k] ?? 0), 0)
  const target    = 100 - (current.warp_drive ?? 0)
  const err       = target - sliderSum
  if (Math.abs(err) > 0.01) next[station] = Math.max(0, (next[station] ?? 0) + err)

  for (const k of ALL_ALLOC_KEYS) next[k] = Math.round((next[k] ?? 0) * 10) / 10
  return next
}

// ══════════════════════════════════════════════════════════════════════════════
export default function PowerPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship

  // Local state: mirrors server, updated optimistically on user interaction
  const [reactorOutputs, setReactorOutputs] = useState(null)
  const [alloc, setAlloc]                   = useState(null)
  const [locks, setLocks]                   = useState(null)
  const [gwTargets, setGwTargets]           = useState(null)

  // Sync from server only on first load (alloc/locks/gwTargets null)
  useEffect(() => {
    if (ship?.reactor_outputs && !reactorOutputs)
      setReactorOutputs({ ...ship.reactor_outputs })
  }, [ship?.reactor_outputs])
  useEffect(() => {
    if (ship?.power_allocation && !alloc)
      setAlloc({ ...ship.power_allocation })
  }, [ship?.power_allocation])
  useEffect(() => {
    if (ship?.power_allocation_locked && !locks)
      setLocks({ ...ship.power_allocation_locked })
  }, [ship?.power_allocation_locked])
  useEffect(() => {
    if (ship?.power_allocation_gw_targets && !gwTargets)
      setGwTargets({ ...ship.power_allocation_gw_targets })
  }, [ship?.power_allocation_gw_targets])

  // For GW-locked stations the server recomputes pct each tick — always
  // pull those from server so the local slider stays in sync.
  const curGwTargets = gwTargets ?? ship?.power_allocation_gw_targets ?? {}
  const localAlloc   = alloc     ?? ship?.power_allocation ?? {}
  const curAlloc = { ...localAlloc }
  // Battery pct is always authoritative from server — server snaps it to 0 on full/empty
  if (ship?.power_allocation?.battery !== undefined)
    curAlloc.battery = ship.power_allocation.battery
  // Override GW-locked stations with server values (server recomputes them every tick)
  // and redistribute the resulting drift to free stations so sum stays exactly 100.
  let gwDrift = 0
  for (const k of Object.keys(curGwTargets)) {
    if (curGwTargets[k] !== null && ship?.power_allocation?.[k] !== undefined) {
      const oldVal = curAlloc[k] ?? 0
      curAlloc[k] = ship.power_allocation[k]
      gwDrift += curAlloc[k] - oldVal
    }
  }
  if (Math.abs(gwDrift) > 0.01) {
    // Only SLIDER_KEYS absorb the drift (warp_drive and battery float independently)
    const freeKeys = SLIDER_KEYS.filter(k =>
      (curGwTargets[k] === null || curGwTargets[k] === undefined) &&
      !(locks ?? ship?.power_allocation_locked ?? {})[k]
    )
    const freeSum = freeKeys.reduce((s, k) => s + Math.max(0, curAlloc[k] ?? 0), 0)
    for (const k of freeKeys) {
      const frac = freeSum > 0.001
        ? Math.max(0, curAlloc[k] ?? 0) / freeSum
        : 1 / Math.max(1, freeKeys.length)
      curAlloc[k] = Math.max(0, (curAlloc[k] ?? 0) - gwDrift * frac)
    }
  }
  const rHeat      = ship?.reactor_heat     ?? {}
  const rShutdown  = ship?.reactor_shutdown ?? {}
  const rHealth    = ship?.system_health    ?? {}
  const rOuts      = reactorOutputs         ?? ship?.reactor_outputs ?? {}
  const curLocks   = locks ?? ship?.power_allocation_locked ?? {}

  const totalPowerGW   = ship?.net_power_gw ?? 0
  const batteryEnergy  = ship?.battery_energy_gw  ?? 0
  const batteryCap     = ship?.battery_capacity_gw ?? 500
  const lsMinGW        = ship?.life_support_min_gw ?? 5
  const lsActualGW     = ((curAlloc.life_support ?? 0) / 100) * totalPowerGW
  const lsBelowMin     = lsActualGW < lsMinGW - 0.01
  const powerRoom      = ship?.rooms?.power_room ?? { fuel: 0, radioactive_material: 0 }

  // ── Reactor output change ─────────────────────────────────────────────────
  function handleReactorOutput(reactor, rawValue) {
    const value = Math.round(rawValue * 100) / 100
    setReactorOutputs(prev => ({ ...prev, [reactor]: value }))
    sendCommand({ type: 'set_reactor_output', reactor, value })
  }

  // ── Allocation slider change (free stations) ────────────────────────────
  function handleAllocChange(station, newPct) {
    if (curLocks[station] || curGwTargets[station] !== null) return
    // Build combinedLocks: merge %-locks then layer GW-locks on top.
    // Do NOT spread the full curGwTargets map — that would overwrite %-locks with false.
    const combinedLocks = { ...curLocks }
    for (const [k, v] of Object.entries(curGwTargets)) {
      if (v !== null) combinedLocks[k] = true
    }
    const next = normalise(curAlloc, combinedLocks, station, newPct)
    setAlloc(next)
    sendCommand({ type: 'set_power_allocation', allocations: next })
  }

  // ── Battery charge slider: sets battery contribution, no redistribution needed ─
  // Battery is outside the 100% sum — changing it grows/shrinks net_power_gw.
  function handleBatteryChargeChange(newPct) {
    const isFull  = batteryEnergy >= batteryCap - 0.1
    const isEmpty = batteryEnergy <= 0.1
    const clamped = Math.max(isEmpty ? 0 : -100, Math.min(isFull ? 0 : 100, newPct))
    const next = { ...curAlloc, battery: clamped }
    setAlloc(next)
    sendCommand({ type: 'set_power_allocation', allocations: next })
  }

  // ── GW-locked slider: user manually adjusts the GW target ────────────────
  function handleGwAllocChange(station, newPct) {
    const minGW     = station === 'life_support' ? lsMinGW : 0
    const newGW     = (newPct / 100) * totalPowerGW
    const clampedGW = Math.max(minGW, Math.min(totalPowerGW, newGW))
    // Don't touch setAlloc — curAlloc always reads GW-locked stations from the server,
    // so a local setAlloc would cause a false gwDrift and move the free sliders.
    setGwTargets(prev => ({ ...prev, [station]: clampedGW }))
    sendCommand({ type: 'set_gw_lock', station, gw_target: clampedGW })
  }

  // ── Lock cycle: none → % lock → GW lock → none ────────────────────────
  // Life support is always GW-locked; its lock button is disabled in the UI
  function handleLockCycle(station) {
    if (station === 'life_support') return
    const isPctLocked = curLocks[station]
    const isGwLocked  = curGwTargets[station] !== null

    if (!isPctLocked && !isGwLocked) {
      // → % lock
      const newLocks = { ...curLocks, [station]: true }
      setLocks(newLocks)
      // also clear any residual GW target locally
      setGwTargets(prev => ({ ...prev, [station]: null }))
      sendCommand({ type: 'toggle_power_lock', station })
    } else if (isPctLocked) {
      // → GW lock (capture current GW)
      const currentGW = ((curAlloc[station] ?? 0) / 100) * totalPowerGW
      const newLocks  = { ...curLocks, [station]: false }
      setLocks(newLocks)
      setGwTargets(prev => ({ ...prev, [station]: currentGW }))
      sendCommand({ type: 'set_gw_lock', station, gw_target: currentGW })
    } else {
      // GW locked → none
      setGwTargets(prev => ({ ...prev, [station]: null }))
      sendCommand({ type: 'set_gw_lock', station, gw_target: null })
    }
  }

  if (!ship) {
    return (
      <div style={{ flex: 1, background: BG, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#222', fontFamily: 'Courier New',
                    fontSize: '12px', letterSpacing: '4px' }}>
        NO SIGNAL
      </div>
    )
  }

  const allocSum = SLIDER_KEYS.reduce((s, k) => s + (curAlloc[k] ?? 0), 0)
  const totalAllocSum = allocSum + (curAlloc.warp_drive ?? 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG,
                  fontFamily: 'Courier New', color: '#ccc', overflow: 'hidden', userSelect: 'none' }}>

      {/* ── Header ── */}
      <div style={{ padding: '5px 14px', background: '#070712',
                    borderBottom: `1px solid ${ACCENT}33`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexShrink: 0 }}>
        <span style={{ color: ACCENT, fontWeight: 'bold', fontSize: '12px', letterSpacing: '3px' }}>
          ⚡ POWER MANAGEMENT
        </span>
        <div style={{ display: 'flex', gap: '20px', fontSize: '11px' }}>
          <span style={{ color: ACCENT2 }}>OUTPUT <b>{totalPowerGW.toFixed(0)}</b> GW</span>
          <span style={{ color: totalAllocSum.toFixed(1) === '100.0' ? '#555' : '#ff4444', fontSize: '10px' }}>
            Σ {totalAllocSum.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* ── Power Room Inventory ── */}
      <div style={{ padding: '4px 10px', background: '#09091a',
                    borderBottom: `1px solid ${ACCENT}22`, flexShrink: 0,
                    display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: '#555', letterSpacing: '2px', flexShrink: 0 }}>
          POWER ROOM
        </span>
        <FuelBar label="FUEL" value={powerRoom.fuel} max={10000} color="#ffaa00" />
        <FuelBar label="RAD" value={powerRoom.radioactive_material} max={10000} color="#aa44ff" />
      </div>

      {/* ── Reactors ── */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', flexShrink: 0 }}>
        {REACTOR_KEYS.map(key => (
          <ReactorCard
            key={key}
            reactorKey={key}
            label={REACTOR_LABELS[key]}
            output={rOuts[key] ?? 1.0}
            health={rHealth[key] ?? 100}
            heat={rHeat[key] ?? 0}
            shutdown={rShutdown[key] ?? false}
            onOutput={v => handleReactorOutput(key, v)}
          />
        ))}
      </div>

      {/* ── Battery ── */}
      <div style={{ padding: '0 10px 6px', flexShrink: 0 }}>
        <BatteryBar
          energy={batteryEnergy}
          capacity={batteryCap}
          charging={(curAlloc.battery ?? 0) > 0}
          discharging={(curAlloc.battery ?? 0) < 0}
        />
        <BatteryChargeSlider
          pct={curAlloc.battery ?? 0}
          batteryFull={batteryEnergy >= batteryCap - 0.1}
          batteryEmpty={batteryEnergy <= 0.1}
          onChange={handleBatteryChargeChange}
        />
      </div>

      {/* ── Life support warning ── */}
      {lsBelowMin && (
        <div style={{ margin: '0 10px 4px', padding: '4px 10px', background: '#ff000022',
                      border: '1px solid #ff4444', borderRadius: '4px',
                      color: '#ff4444', fontSize: '10px', letterSpacing: '1px', flexShrink: 0 }}>
          ⚠ LIFE SUPPORT BELOW MINIMUM ({lsActualGW.toFixed(0)} GW &lt; {lsMinGW.toFixed(0)} GW REQ)
        </div>
      )}

      {/* ── Allocation label ── */}
      <div style={{ padding: '0 10px 3px', flexShrink: 0 }}>
        <div style={{ fontSize: '9px', color: ACCENT, letterSpacing: '2px' }}>
          POWER DISTRIBUTION — {totalPowerGW.toFixed(0)} GW AVAILABLE
        </div>
      </div>

      {/* ── Allocation sliders ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
          {SLIDER_KEYS.map(key => (
            <AllocSlider
              key={key}
              station={key}
              label={ALLOC_LABELS[key]}
              pct={curAlloc[key] ?? 0}
              pctLocked={curLocks[key] ?? false}
              gwLocked={curGwTargets[key] !== null && curGwTargets[key] !== undefined}
              gwTarget={curGwTargets[key] ?? null}
              isLifeSupport={key === 'life_support'}
              totalPowerGW={totalPowerGW}
              lsMinGW={key === 'life_support' ? lsMinGW : undefined}
              onPct={v => curGwTargets[key] !== null ? handleGwAllocChange(key, v) : handleAllocChange(key, v)}
              onLockCycle={() => handleLockCycle(key)}
            />
          ))}
        </div>
      </div>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REACTOR CARD
// ══════════════════════════════════════════════════════════════════════════════
function ReactorCard({ label, reactorKey, output, health, heat, shutdown, onOutput }) {
  const outputGW = output * (health / 100) * MAX_REACTOR_GW
  const borderCol = shutdown ? '#ff4444' : heat >= 90 ? '#ff6600' : `${ACCENT}33`

  return (
    <div style={{ flex: 1, background: CARD_BG, border: `1px solid ${borderCol}`,
                  borderRadius: '6px', padding: '8px', display: 'flex',
                  flexDirection: 'column', gap: '3px',
                  opacity: shutdown ? 0.75 : 1 }}>
      <div style={{ color: shutdown ? '#ff4444' : ACCENT,
                    fontSize: '11px', letterSpacing: '2px', fontWeight: 'bold' }}>
        {label}
      </div>

      {/* Shutdown banner */}
      {shutdown && (
        <div style={{ fontSize: '9px', color: '#ff4444', background: '#3a000011',
                      border: '1px solid #ff444433', borderRadius: '3px',
                      padding: '2px 5px', letterSpacing: '1px', textAlign: 'center' }}>
          ⚠ MELTDOWN — COOLING…
        </div>
      )}

      {/* Health + Heat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
        <span style={{ color: healthColor(health) }}>HP {health.toFixed(1)}%</span>
        <span style={{ color: heatColor(heat) }}>HEAT {heat.toFixed(0)}%</span>
      </div>

      {/* Heat bar */}
      <div style={{ height: '3px', background: '#111', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${heat}%`, height: '100%', background: heatColor(heat),
                      transition: 'width 0.6s linear', borderRadius: '2px' }} />
      </div>

      {/* Output label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '2px' }}>
        <span style={{ color: '#666' }}>OUTPUT</span>
        <span style={{ color: shutdown ? '#ff4444' : ACCENT }}>
          {shutdown ? 'OFFLINE' : `${(output * 100).toFixed(0)}%`}
        </span>
      </div>

      {/* Output slider */}
      <input
        data-testid={`reactor-slider-${reactorKey}`}
        type="range" min="0" max="100" step="1"
        value={Math.round(output * 100)}
        disabled={shutdown}
        onChange={e => onOutput(parseInt(e.target.value) / 100)}
        style={{ width: '100%', accentColor: ACCENT,
                 cursor: shutdown ? 'not-allowed' : 'pointer',
                 opacity: shutdown ? 0.3 : 1, margin: '1px 0' }}
      />

      {/* GW output */}
      <div style={{ fontSize: '10px', color: ACCENT2, textAlign: 'right' }}>
        {outputGW.toFixed(0)} GW
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// BATTERY CHARGE SLIDER — bipolar, sits directly under the battery gauge
// Negative = discharge (draw from battery), positive = charge (send to battery)
// ══════════════════════════════════════════════════════════════════════════════
function BatteryChargeSlider({ pct, batteryFull, batteryEmpty, onChange }) {
  const rangeMin      = -100
  const rangeMax      =  100
  const clampedPct    = Math.max(batteryEmpty ? 0 : -100, Math.min(batteryFull ? 0 : 100, pct))
  const isDischarging = clampedPct < -0.05
  const isCharging    = clampedPct > 0.05
  const displayPct    = Math.abs(clampedPct).toFixed(1)
  const accentColor   = isDischarging ? '#ff6644' : ACCENT2

  return (
    <div style={{ marginTop: '5px', background: '#0a0a1e',
                  border: `1px solid ${isDischarging ? '#ff664433' : isCharging ? `${ACCENT2}33` : '#ffffff11'}`,
                  borderRadius: '5px', padding: '5px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '4px' }}>
        <span style={{ fontSize: '9px', color: '#666', letterSpacing: '2px' }}>BATTERY CHARGE</span>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '9px' }}>
          <span style={{ color: '#444' }}>DISCH ◄</span>
          <span style={{ color: accentColor, minWidth: '36px', textAlign: 'center' }}>
            {isDischarging ? `▼ ${displayPct}%` : isCharging ? `▲ ${displayPct}%` : '— OFF'}
          </span>
          <span style={{ color: '#444' }}>► CHRG</span>
        </div>
      </div>
      {/* Bipolar track: centre = 0, left half = discharge, right half = charge */}
      <div style={{ position: 'relative', height: '8px', background: '#111',
                    borderRadius: '4px', overflow: 'hidden', marginBottom: '3px' }}>
        {isDischarging ? (
          <div style={{
            position: 'absolute',
            right: '50%',
            width: `${(Math.abs(clampedPct) / 100) * 50}%`,
            height: '100%', background: '#ff6644', borderRadius: '4px 0 0 4px',
          }} />
        ) : isCharging ? (
          <div style={{
            position: 'absolute',
            left: '50%',
            width: `${(clampedPct / 100) * 50}%`,
            height: '100%', background: ACCENT2, borderRadius: '0 4px 4px 0',
          }} />
        ) : null}
        {/* Centre mark */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0,
                      width: '1px', background: '#333' }} />
      </div>
      <input
        type="range" min={rangeMin} max={rangeMax} step="0.5"
        value={clampedPct}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: accentColor, margin: 0, cursor: 'pointer' }}
      />
      {(batteryFull || batteryEmpty) && (
        <div style={{ fontSize: '8px', color: batteryFull ? ACCENT2 : '#ff6644',
                      textAlign: 'center', letterSpacing: '1px', marginTop: '2px' }}>
          {batteryFull ? 'BATTERY FULL — DISCHARGE ONLY' : 'BATTERY EMPTY — CHARGE ONLY'}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// BATTERY BAR
// ══════════════════════════════════════════════════════════════════════════════
function BatteryBar({ energy, capacity, charging, discharging }) {
  const pct   = capacity > 0 ? Math.min(100, (energy / capacity) * 100) : 0
  const color = pct < 20 ? '#ff4444' : pct < 50 ? ACCENT : '#00ff88'
  const statusLabel = charging ? '▲ CHARGING' : discharging ? '▼ DISCHARGING' : '— STANDBY'
  const statusColor = charging ? ACCENT2 : discharging ? ACCENT : '#555'

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${ACCENT}33`,
                  borderRadius: '6px', padding: '7px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px' }}>
        <span style={{ color: ACCENT, letterSpacing: '2px' }}>⚡ BATTERY BANK</span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ color: statusColor, fontSize: '9px' }}>{statusLabel}</span>
          <span style={{ color: ACCENT2 }}>
            {energy.toFixed(0)} / {capacity.toFixed(0)} GW
          </span>
          <span style={{ color: '#777' }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div style={{ height: '10px', background: '#111', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color,
                      transition: 'width 0.8s ease', borderRadius: '5px' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FUEL BAR — compact power room inventory indicator
// ══════════════════════════════════════════════════════════════════════════════
function FuelBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const barColor = pct < 15 ? '#ff4444' : pct < 35 ? ACCENT : color

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ fontSize: '8px', color: '#666', letterSpacing: '1px', flexShrink: 0, width: '22px' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '5px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor,
                      transition: 'width 0.8s ease', borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '8px', color: barColor, flexShrink: 0, textAlign: 'right', minWidth: '34px' }}>
        {Math.round(value).toLocaleString()}
      </span>
    </div>
  )
}

// Lock modes cycle on tap: none → 🔒% (pct fixed) → 🔒GW (GW fixed) → none
// ══════════════════════════════════════════════════════════════════════════════
function AllocSlider({
  label, station, pct, pctLocked, gwLocked, gwTarget,
  isLifeSupport, totalPowerGW, lsMinGW,
  onPct, onLockCycle
}) {
  const actualGW      = (pct / 100) * totalPowerGW
  const barPct        = Math.min(100, pct)
  const barColor      = gwLocked ? '#00ccff' : pctLocked ? `${ACCENT}88` : ACCENT2
  const borderColor   = gwLocked ? '#00ccff44' : pctLocked ? `${ACCENT}55` : '#ffffff11'

  // Lock button label and colour
  let lockLabel, lockColor
  if (gwLocked)   { lockLabel = '🔒GW'; lockColor = isLifeSupport ? '#00ccff88' : '#00ccff' }
  else if (pctLocked)  { lockLabel = '🔒%';  lockColor = ACCENT }
  else                 { lockLabel = '🔓';   lockColor = '#444' }

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${borderColor}`,
                  borderRadius: '4px', padding: '5px 7px' }}>

      {/* Label row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '2px' }}>
        <span style={{ fontSize: '9px', letterSpacing: '1px',
                       color: gwLocked ? '#00ccff' : pctLocked ? ACCENT : '#999' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {isLifeSupport && lsMinGW !== undefined && (
            <span style={{ fontSize: '8px', color: '#555' }}>MIN {lsMinGW.toFixed(0)}GW</span>
          )}
          <span style={{ fontSize: '10px', color: ACCENT2 }}>
            {pct.toFixed(1)}%
          </span>
          {/* Show GW target when GW-locked, otherwise show actual flowing GW */}
          <span style={{ fontSize: '9px', color: gwLocked ? '#00ccff' : '#ccc' }}>
            {gwLocked
              ? `🟴${(gwTarget ?? 0).toFixed(0)}GW`
              : `${Math.abs(actualGW).toFixed(0)}GW`
            }
          </span>
          <button
            onClick={onLockCycle}
            disabled={isLifeSupport}
            style={{ background: 'none', border: 'none',
                     cursor: isLifeSupport ? 'default' : 'pointer',
                     fontSize: '10px', padding: '0 2px',
                     color: lockColor, opacity: isLifeSupport ? 0.5 : 1,
                     lineHeight: 1, fontFamily: 'Courier New', fontWeight: 'bold' }}
          >
            {lockLabel}
          </button>
        </div>
      </div>

      {/* Fill bar */}
      <div style={{ height: '3px', background: '#111', borderRadius: '2px',
                    marginBottom: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${barPct}%`, height: '100%', background: barColor,
                      transition: 'width 0.3s', borderRadius: '2px' }} />
      </div>

      {/* Slider */}
      <input
        data-testid={`alloc-slider-${station}`}
        type="range"
        min={0}
        max="100"
        step="0.1"
        value={pct}
        disabled={pctLocked}
        onChange={e => onPct(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: gwLocked ? '#00ccff' : ACCENT,
                 cursor: pctLocked ? 'not-allowed' : 'pointer',
                 opacity: pctLocked ? 0.45 : 1, margin: 0 }}
      />
    </div>
  )
}

