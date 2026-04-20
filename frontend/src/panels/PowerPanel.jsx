import { useState, useEffect, useCallback } from 'react'
import { healthColor, heatColor } from '../shared'
import s from './PowerPanel.module.css'

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
  'general_systems', 'manufacturing', 'charging_bay',
]
// All 12 keys the server tracks
const ALL_ALLOC_KEYS = [...SLIDER_KEYS, 'warp_drive', 'battery']
const ALLOC_LABELS = {
  engines: 'ENGINES', shields: 'SHIELDS', weapons: 'WEAPONS',
  short_range_scanner: 'SHORT SCAN', long_range_scanner: 'LONG SCAN',
  comms: 'COMMS', life_support: 'LIFE SUPPORT',
  general_systems: 'GENERAL SYS', manufacturing: 'MANUFACTURE', charging_bay: 'CHARGING BAY',
}

const ACCENT   = 'var(--accent-amber)'
const ACCENT2  = 'var(--accent-cyan)'
const MAX_REACTOR_GW = 1000  // fallback; overridden by server

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
  const powerRoom      = ship?.rooms?.power_room ?? { fuel: 0, radioactive: 0 }

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
      <div className={s.noSignal}>
        NO SIGNAL
      </div>
    )
  }

  const allocSum = SLIDER_KEYS.reduce((s, k) => s + (curAlloc[k] ?? 0), 0)
  const totalAllocSum = allocSum + (curAlloc.warp_drive ?? 0)

  return (
    <div className={s.container}>

      {/* ── Header ── */}
      <div className={s.header} style={{ borderBottom: `1px solid ${ACCENT}33` }}>
        <span className={s.headerTitle} style={{ color: ACCENT }}>
          ⚡ POWER MANAGEMENT
        </span>
        <div className={s.headerStats}>
          <span style={{ color: ACCENT2 }}>OUTPUT <b>{totalPowerGW.toFixed(0)}</b> GW</span>
          <span className={s.headerSigma} style={{ color: totalAllocSum.toFixed(1) === '100.0' ? 'var(--text-secondary)' : 'var(--status-bad)' }}>
            Σ {totalAllocSum.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* ── Power Room Inventory ── */}
      <div className={s.powerRoom} style={{ borderBottom: `1px solid ${ACCENT}22` }}>
        <span className={s.powerRoomLabel}>
          POWER ROOM
        </span>
        <FuelBar label="FUEL" value={powerRoom.fuel} max={10000} color="#ffaa00" />
        <FuelBar label="RAD" value={powerRoom.radioactive} max={10000} color="#aa44ff" />
      </div>

      {/* ── Reactors ── */}
      <div className={s.reactorRow}>
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
      <div className={s.batterySection}>
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
        <div className={s.lsWarning}>
          ⚠ LIFE SUPPORT BELOW MINIMUM ({lsActualGW.toFixed(0)} GW &lt; {lsMinGW.toFixed(0)} GW REQ)
        </div>
      )}

      {/* ── Allocation label ── */}
      <div className={s.allocLabel}>
        <div className={s.allocLabelText} style={{ color: ACCENT }}>
          POWER DISTRIBUTION — {totalPowerGW.toFixed(0)} GW AVAILABLE
        </div>
      </div>

      {/* ── Allocation sliders ── */}
      <div className={s.allocScroll}>
        <div className={s.allocGrid}>
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
  const borderCol = shutdown ? 'var(--status-bad)' : heat >= 90 ? 'var(--accent-amber)' : `${ACCENT}33`

  return (
    <div className={s.reactorCard} style={{ border: `1px solid ${borderCol}`,
                  opacity: shutdown ? 0.75 : 1 }}>
      <div className={s.reactorLabel} style={{ color: shutdown ? 'var(--status-bad)' : ACCENT }}>
        {label}
      </div>

      {/* Shutdown banner */}
      {shutdown && (
        <div className={s.reactorShutdownBanner}>
          ⚠ MELTDOWN — COOLING…
        </div>
      )}

      {/* Health + Heat */}
      <div className={s.reactorHealthHeat}>
        <span style={{ color: healthColor(health) }}>HP {health.toFixed(1)}%</span>
        <span style={{ color: heatColor(heat) }}>HEAT {heat.toFixed(0)}%</span>
      </div>

      {/* Heat bar */}
      <div className={s.reactorHeatBar}>
        <div className={s.reactorHeatFill} style={{ width: `${heat}%`, background: heatColor(heat) }} />
      </div>

      {/* Output label */}
      <div className={s.reactorOutputRow}>
        <span className={s.reactorOutputLabel}>OUTPUT</span>
        <span style={{ color: shutdown ? 'var(--status-bad)' : ACCENT }}>
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
      <div className={s.reactorGw} style={{ color: ACCENT2 }}>
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
    <div className={s.batteryChargeWrapper} style={{
                  border: `1px solid ${isDischarging ? '#ff664433' : isCharging ? `${ACCENT2}33` : '#ffffff11'}` }}>
      <div className={s.batteryChargeHeader}>
        <span className={s.batteryChargeLabel}>BATTERY CHARGE</span>
        <div className={s.batteryChargeDisplay}>
          <span className={s.batteryDirLabel}>DISCH ◄</span>
          <span className={s.batteryChargeValue} style={{ color: accentColor }}>
            {isDischarging ? `▼ ${displayPct}%` : isCharging ? `▲ ${displayPct}%` : '— OFF'}
          </span>
          <span className={s.batteryDirLabel}>► CHRG</span>
        </div>
      </div>
      {/* Bipolar track: centre = 0, left half = discharge, right half = charge */}
      <div className={s.batteryTrack}>
        {isDischarging ? (
          <div className={s.batteryDischargeFill} style={{
            width: `${(Math.abs(clampedPct) / 100) * 50}%`,
          }} />
        ) : isCharging ? (
          <div className={s.batteryChargeFill} style={{
            width: `${(clampedPct / 100) * 50}%`,
            background: ACCENT2,
          }} />
        ) : null}
        {/* Centre mark */}
        <div className={s.batteryCentreMark} />
      </div>
      <input
        type="range" min={rangeMin} max={rangeMax} step="0.5"
        value={clampedPct}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: accentColor, margin: 0, cursor: 'pointer' }}
      />
      {(batteryFull || batteryEmpty) && (
        <div className={s.batteryLimitNote} style={{ color: batteryFull ? ACCENT2 : '#ff6644' }}>
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
  const color = pct < 20 ? 'var(--status-bad)' : pct < 50 ? ACCENT : 'var(--status-good)'
  const statusLabel = charging ? '▲ CHARGING' : discharging ? '▼ DISCHARGING' : '— STANDBY'
  const statusColor = charging ? ACCENT2 : discharging ? ACCENT : 'var(--text-secondary)'

  return (
    <div className={s.batteryBar} style={{ border: `1px solid ${ACCENT}33` }}>
      <div className={s.batteryBarHeader}>
        <span className={s.batteryBankLabel} style={{ color: ACCENT }}>⚡ BATTERY BANK</span>
        <div className={s.batteryBarStats}>
          <span className={s.batteryBarStatus} style={{ color: statusColor }}>{statusLabel}</span>
          <span style={{ color: ACCENT2 }}>
            {energy.toFixed(0)} / {capacity.toFixed(0)} GW
          </span>
          <span style={{ color: 'var(--text-body)' }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <div className={s.batteryBarTrack}>
        <div className={s.batteryBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FUEL BAR — compact power room inventory indicator
// ══════════════════════════════════════════════════════════════════════════════
function FuelBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const barColor = pct < 15 ? 'var(--status-bad)' : pct < 35 ? ACCENT : color

  return (
    <div className={s.fuelBar}>
      <span className={s.fuelBarLabel}>
        {label}
      </span>
      <div className={s.fuelBarTrack}>
        <div className={s.fuelBarFill} style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className={s.fuelBarValue} style={{ color: barColor }}>
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
  else                 { lockLabel = '🔓';   lockColor = 'var(--text-dim)' }

  return (
    <div className={s.allocCard} style={{ border: `1px solid ${borderColor}` }}>

      {/* Label row */}
      <div className={s.allocCardLabel}>
        <span className={s.allocStationName}
              style={{ color: gwLocked ? '#00ccff' : pctLocked ? ACCENT : 'var(--text-body)' }}>{label}</span>
        <div className={s.allocCardRight}>
          {isLifeSupport && lsMinGW !== undefined && (
            <span className={s.allocLsMin}>MIN {lsMinGW.toFixed(0)}GW</span>
          )}
          <span className={s.allocPct} style={{ color: ACCENT2 }}>
            {pct.toFixed(1)}%
          </span>
          {/* Show GW target when GW-locked, otherwise show actual flowing GW */}
          <span className={s.allocGw} style={{ color: gwLocked ? '#00ccff' : 'var(--text-bright)' }}>
            {gwLocked
              ? `🟴${(gwTarget ?? 0).toFixed(0)}GW`
              : `${Math.abs(actualGW).toFixed(0)}GW`
            }
          </span>
          <button
            onClick={onLockCycle}
            disabled={isLifeSupport}
            className={s.lockButton}
            style={{ cursor: isLifeSupport ? 'default' : 'pointer',
                     color: lockColor, opacity: isLifeSupport ? 0.5 : 1 }}
          >
            {lockLabel}
          </button>
        </div>
      </div>

      {/* Fill bar */}
      <div className={s.allocFillBar}>
        <div className={s.allocFill} style={{ width: `${barPct}%`, background: barColor }} />
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

