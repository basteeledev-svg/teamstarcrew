import { useState, useEffect } from 'react'
import { healthColor } from '../shared'
import s from './EnginesPanel.module.css'

// ── Constants (fallback defaults; overridden by server-sent values) ────────────
const _FUEL_ENGINE_MAX_THRUST = 0.025
const _ELEC_ENGINE_MAX_THRUST = 0.0125
const _WARP_CAP_MAX           = 100_000
const _WARP_LEAK_GW           = 0.5

const ENGINE_KEYS = {
  fuel: ['engine_3_fuel', 'engine_4_fuel'],
  elec: ['engine_1_electric', 'engine_2_electric'],
}
const ENGINE_LABELS = {
  engine_3_fuel:     'FUEL ENG 1',
  engine_4_fuel:     'FUEL ENG 2',
  engine_1_electric: 'ELEC ENG 1',
  engine_2_electric: 'ELEC ENG 2',
}

const ACCENT  = '#ffaa00'   // amber (fuel) → var(--accent-amber)
const ELEC    = '#00aaff'   // blue  (electric) → var(--accent)
const WARP    = '#aa44ff'   // purple (warp)
const ACCENT2 = '#00ffcc'   // teal  (readouts) → var(--accent-cyan)

// ── Quadratic consumption formula ─────────────────────────────────────────────
// floor(x * (1 + 3x/100)) where x = output fraction × 100
// → 1 unit/% at low power, 4 units/% at 100%
function engineConsumption(outputFrac) {
  const x = outputFrac * 100
  return Math.floor(x * (1 + 3 * x / 100))
}

// Inverse of engineConsumption: given a GW budget, return max output fraction (0-1)
// Solves floor(x*(1+3x/100)) = budget  →  quadratic: 3x²/100 + x - budget = 0
// → x = (-100 + √(10000 + 1200·budget)) / 6  (in %, then /100 for fraction)
function maxOutputFracForBudget(budgetGW) {
  if (budgetGW <= 0) return 0
  const pct = (-100 + Math.sqrt(10000 + 1200 * budgetGW)) / 6
  return Math.max(0, Math.min(1, pct / 100))
}

// ══════════════════════════════════════════════════════════════════════════════
export default function EnginesPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship
  const C = gameState?.constants ?? {}
  const FUEL_ENGINE_MAX_THRUST = C.FUEL_ENGINE_MAX_THRUST_AU ?? _FUEL_ENGINE_MAX_THRUST
  const ELEC_ENGINE_MAX_THRUST = C.ELEC_ENGINE_MAX_THRUST_AU ?? _ELEC_ENGINE_MAX_THRUST
  const WARP_CAP_MAX           = C.WARP_CAPACITOR_MAX_GW ?? _WARP_CAP_MAX
  const WARP_LEAK_GW           = C.WARP_CAPACITOR_LEAK_GW ?? _WARP_LEAK_GW

  const [engineOutputs, setEngineOutputs] = useState(null)
  const [warpDrivePct,  setWarpDrivePct]  = useState(null)

  // Sync from server once on first load
  useEffect(() => {
    if (ship?.engine_outputs && !engineOutputs)
      setEngineOutputs({ ...ship.engine_outputs })
  }, [ship?.engine_outputs])

  useEffect(() => {
    if (ship?.power_allocation?.warp_drive !== undefined && warpDrivePct === null)
      setWarpDrivePct(ship.power_allocation.warp_drive)
  }, [ship?.power_allocation?.warp_drive])

  if (!ship) {
    return (
      <div className={s.noSignal}>
        NO SIGNAL
      </div>
    )
  }

  const curEngines  = engineOutputs ?? ship?.engine_outputs ?? {}
  const curWarpPct  = warpDrivePct  ?? ship?.power_allocation?.warp_drive ?? 0

  // Derive display values
  const totalPowerGW   = ship?.net_power_gw ?? 0
  const engineAllocGW  = (ship?.power_allocation?.engines ?? 0) / 100 * totalPowerGW
  const warpAllocGW    = (curWarpPct / 100) * totalPowerGW
  const warpNetRate    = warpAllocGW - WARP_LEAK_GW
  const warpCapGW      = ship?.warp_capacitor_gw ?? 0

  const engineRoomFuel = ship?.rooms?.engine_room?.fuel ?? 0
  const sysHealth      = ship?.system_health ?? {}
  const engineThrustAU = ship?.engine_thrust_au ?? 0

  // Per-type consumption totals
  const elecDraw = ENGINE_KEYS.elec.reduce(
    (s, k) => s + engineConsumption(curEngines[k] ?? 0), 0
  )
  const fuelDraw = ENGINE_KEYS.fuel.reduce(
    (s, k) => s + engineConsumption(curEngines[k] ?? 0), 0
  )

  // Power budget: electric + warp share engineAllocGW; fuel engines are independent
  const elecBudgetGW   = Math.max(0, engineAllocGW - warpAllocGW)  // headroom for electric
  const warpBudgetGW   = Math.max(0, engineAllocGW - elecDraw)     // headroom for warp
  const engineBudgetUsedGW = elecDraw + warpAllocGW
  const overBudget     = engineBudgetUsedGW > engineAllocGW + 0.5

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleEngineChange(engineKey, newFrac) {
    const isElec = ENGINE_KEYS.elec.includes(engineKey)
    if (isElec) {
      // Cap so this engine + other electric engine + warp don't exceed engines budget
      const otherElecKey = ENGINE_KEYS.elec.find(k => k !== engineKey)
      const otherDraw    = engineConsumption(curEngines[otherElecKey] ?? 0)
      const budgetForThisEngine = Math.max(0, elecBudgetGW - otherDraw)
      const maxFrac = maxOutputFracForBudget(budgetForThisEngine)
      const v = Math.max(0, Math.min(maxFrac, newFrac))
      setEngineOutputs(prev => ({ ...prev, [engineKey]: v }))
      sendCommand({ type: 'set_engine_output', engine: engineKey, value: v })
    } else {
      const v = Math.max(0, Math.min(1, newFrac))
      setEngineOutputs(prev => ({ ...prev, [engineKey]: v }))
      sendCommand({ type: 'set_engine_output', engine: engineKey, value: v })
    }
  }

  function handleWarpDriveChange(newPct) {
    // Cap so warp + current electric draw don't exceed engines budget
    const maxWarpGW  = Math.max(0, engineAllocGW - elecDraw)
    const maxWarpPct = totalPowerGW > 0 ? (maxWarpGW / totalPowerGW) * 100 : 0
    const clamped    = Math.max(0, Math.min(maxWarpPct, newPct))
    setWarpDrivePct(clamped)
    const alloc = { ...(ship?.power_allocation ?? {}), warp_drive: clamped }
    sendCommand({ type: 'set_power_allocation', allocations: alloc })
  }

  return (
    <div className={s.container}>

      {/* ── Header ── */}
      <div className={s.header}>
        <span className={s.headerTitle}>
          🚀 ENGINES
        </span>
        <div className={s.headerStats}>
          <span className={s.thrustReadout}>
            THRUST <b>{(engineThrustAU * 1000).toFixed(2)}</b> mAU/tk
          </span>
          <span className={s.headerStatSmall} style={{ color: overBudget ? 'var(--status-bad)' : 'var(--text-secondary)' }}>
            ELEC {elecDraw.toFixed(0)}/{engineAllocGW.toFixed(0)} GW
          </span>
          <span className={s.headerStatSmall} style={{ color: WARP }}>
            WARP {Math.round(warpCapGW).toLocaleString()} GW
          </span>
        </div>
      </div>

      {/* ── Engine Room, fuel & power budget strip ── */}
      <div className={s.engineRoomStrip}>
        <span className={s.engineRoomLabel}>
          ENG ROOM
        </span>
        {/* Fuel bar — max display = 50 000 */}
        <div className={s.fuelBarContainer}>
          <span className={s.fuelLabel}>FUEL</span>
          <div className={s.fuelBarTrack}>
            <div className={s.fuelBarFill} style={{
              width: `${Math.min(100, (engineRoomFuel / 50000) * 100)}%`,
              background: engineRoomFuel < 5000 ? 'var(--status-bad)' : engineRoomFuel < 15000 ? ACCENT : '#ffcc44',
            }} />
          </div>
          <span className={s.fuelValue}>
            {Math.round(engineRoomFuel).toLocaleString()}
          </span>
        </div>
        <span className={s.allocDivider}>
        </span>
        <div className={s.allocSection}>
          <span className={s.allocLabel}>ENGINES ALLOC</span>
          <span style={{ color: overBudget ? 'var(--status-bad)' : ACCENT2 }}>
            {engineAllocGW.toFixed(0)} GW
          </span>
        </div>
      </div>

      {/* ── Engine power budget bar: shows elec | warp | free headroom ── */}
      <div className={s.budgetSection}>
        <div className={s.budgetHeader}>
          <span>ENGINE POWER BUDGET</span>
          <span style={{ color: overBudget ? 'var(--status-bad)' : 'var(--text-secondary)' }}>
          </span>
        </div>
        <div className={s.budgetBar}>
          {/* Electric portion */}
          <div className={s.budgetBarSegment} style={{
            width: `${engineAllocGW > 0 ? Math.min(100, (elecDraw / engineAllocGW) * 100) : 0}%`,
            background: ELEC,
          }} />
          {/* Warp portion */}
          <div className={s.budgetBarSegment} style={{
            width: `${engineAllocGW > 0 ? Math.min(100 - (elecDraw / engineAllocGW) * 100, (warpAllocGW / engineAllocGW) * 100) : 0}%`,
            background: WARP,
          }} />
          {/* Over-budget overflow indicator */}
          {overBudget && (
            <div className={s.budgetOverflow} />
          )}
        </div>
        <div className={s.budgetLegend}>
          <span style={{ color: ELEC }}>▬ ELEC {elecDraw.toFixed(0)} GW</span>
          <span style={{ color: WARP }}>▬ WARP {warpAllocGW.toFixed(0)} GW</span>
          {!overBudget && (
            <span style={{ color: 'var(--text-dim)' }}>▬ FREE {Math.max(0, engineAllocGW - engineBudgetUsedGW).toFixed(0)} GW</span>
          )}
          {overBudget && (
            <span style={{ color: 'var(--status-bad)' }}>⚠ OVER BY {(engineBudgetUsedGW - engineAllocGW).toFixed(0)} GW</span>
          )}
        </div>
      </div>

      {/* ── Engine cards ── */}
      <div className={s.engineCards}>
        {ENGINE_KEYS.fuel.map(key => (
          <EngineCard
            key={key}
            label={ENGINE_LABELS[key]}
            output={curEngines[key] ?? 0}
            health={sysHealth[key] ?? 100}
            isFuel={true}
            onOutput={v => handleEngineChange(key, v)}
          />
        ))}
        {ENGINE_KEYS.elec.map(key => {
          const otherElecKey = ENGINE_KEYS.elec.find(k => k !== key)
          const otherDraw    = engineConsumption(curEngines[otherElecKey] ?? 0)
          const maxFracThis  = maxOutputFracForBudget(Math.max(0, elecBudgetGW - otherDraw))
          return (
            <EngineCard
              key={key}
              label={ENGINE_LABELS[key]}
              output={curEngines[key] ?? 0}
              health={sysHealth[key] ?? 100}
              isFuel={false}
              maxOutputFrac={maxFracThis}
              fuelMaxThrust={FUEL_ENGINE_MAX_THRUST}
              elecMaxThrust={ELEC_ENGINE_MAX_THRUST}
              onOutput={v => handleEngineChange(key, v)}
            />
          )
        })}
      </div>

      {/* ── Warp Drive ── */}
      <div className={s.warpSection}>
        <WarpCapacitorSection
          capacitorGW={warpCapGW}
          warpAllocGW={warpAllocGW}
          netRate={warpNetRate}
          warpDrivePct={curWarpPct}
          maxWarpPct={totalPowerGW > 0 ? (warpBudgetGW / totalPowerGW) * 100 : 0}
          warpCapMax={WARP_CAP_MAX}
          warpLeakGW={WARP_LEAK_GW}
          onWarpChange={handleWarpDriveChange}
        />
      </div>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE CARD
// ══════════════════════════════════════════════════════════════════════════════
function EngineCard({ label, output, health, isFuel, maxOutputFrac = 1,
                     fuelMaxThrust = _FUEL_ENGINE_MAX_THRUST,
                     elecMaxThrust = _ELEC_ENGINE_MAX_THRUST,
                     onOutput }) {
  const accentCol    = isFuel ? ACCENT : ELEC
  const borderCol    = health < 40 ? '#ff444455' : `${accentCol}33`
  const consume      = engineConsumption(output)
  const consumeLabel = isFuel
    ? `${consume.toLocaleString()} fuel/tk`
    : `${consume.toLocaleString()} GW/tk`
  const thrustMax    = isFuel ? fuelMaxThrust : elecMaxThrust
  const thrustContrib = output * (health / 100) * thrustMax

  return (
    <div className={s.engineCard} style={{
      border: `1px solid ${borderCol}`,
      opacity: health <= 0 ? 0.5 : 1,
    }}>

      <div className={s.engineCardLabel} style={{ color: accentCol }}>
        {label}
      </div>

      <div className={s.engineCardStats}>
        <span style={{ color: healthColor(health) }}>HP {health.toFixed(1)}%</span>
        <span style={{ color: ACCENT2 }}>{(thrustContrib * 1000).toFixed(3)} mAU/tk</span>
      </div>

      {/* Health bar */}
      <div className={s.healthBar}>
        <div className={s.healthBarFill} style={{ width: `${health}%`,
                      background: healthColor(health) }} />
      </div>

      <div className={s.engineOutputRow}>
        <span className={s.engineOutputLabel}>OUTPUT</span>
        <span style={{ color: accentCol }}>{(output * 100).toFixed(0)}%</span>
      </div>

      <input
        type="range" min="0" max="100" step="1"
        value={Math.round(output * 100)}
        disabled={health <= 0}
        onChange={e => onOutput(parseInt(e.target.value) / 100)}
        style={{ width: '100%', accentColor: accentCol, margin: '1px 0',
                 cursor: health <= 0 ? 'not-allowed' : 'pointer',
                 opacity: health <= 0 ? 0.3 : 1 }}
      />
      {!isFuel && maxOutputFrac < 0.999 && (
          <div className={s.powerCapNote}>
          MAX {Math.round(maxOutputFrac * 100)}% (power cap)
        </div>
      )}

      <div className={s.engineConsumption}>
        {output > 0 ? consumeLabel : '— idle'}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WARP CAPACITOR SECTION
// ══════════════════════════════════════════════════════════════════════════════
function WarpCapacitorSection({ capacitorGW, warpAllocGW, netRate,
                                warpDrivePct, maxWarpPct,
                                warpCapMax = _WARP_CAP_MAX,
                                warpLeakGW = _WARP_LEAK_GW,
                                onWarpChange }) {
  const WARP_CAP_MAX = warpCapMax
  const WARP_LEAK_GW = warpLeakGW
  const pct      = Math.min(100, (capacitorGW / WARP_CAP_MAX) * 100)
  const isFull   = capacitorGW >= WARP_CAP_MAX - 1
  const isEmpty  = capacitorGW <= 0.1
  const barColor = pct < 15 ? 'var(--status-bad)' : pct < 40 ? ACCENT : WARP
  const netColor = netRate >= 0 ? WARP : '#ff6644'
  const netLabel = netRate >= 0
    ? `▲ +${netRate.toFixed(1)} GW/tk`
    : `▼ ${netRate.toFixed(1)} GW/tk`

  return (
    <div className={s.warpCard}>

      {/* Title row */}
      <div className={s.warpTitleRow}>
        <span className={s.warpTitle}>
          ⚡ WARP DRIVE
        </span>
        <div className={s.warpTitleStats}>
          <span style={{ color: netColor }}>{netLabel}</span>
          <span className={s.warpLeakLabel}>−{WARP_LEAK_GW} GW/tk leak</span>
          <span style={{ color: WARP }}>
            {Math.round(capacitorGW).toLocaleString()} / {WARP_CAP_MAX.toLocaleString()} GW
          </span>
          <span className={s.warpCapPct}>{pct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Capacitor bar */}
      <div className={s.capacitorBar}>
        <div className={s.capacitorBarFill} style={{ width: `${pct}%`, background: barColor,
                      boxShadow: pct > 5 ? `0 0 8px ${WARP}88` : 'none' }} />
      </div>

      {(isFull || isEmpty) && (
        <div className={s.capacitorStatus} style={{ color: isFull ? WARP : '#ff6644' }}>
          {isFull ? '— CAPACITOR FULL —' : '— CAPACITOR EMPTY —'}
        </div>
      )}

      {/* Warp power allocation slider */}
      <div className={s.chargingCard}>
        <div className={s.chargingHeader}>
          <span className={s.chargingLabel}>
            CHARGING ALLOCATION
          </span>
          <div className={s.chargingValues}>
            <span style={{ color: WARP }}>{warpDrivePct.toFixed(1)}%</span>
            <span className={s.chargingGW}>= {warpAllocGW.toFixed(0)} GW to capacitor</span>
          </div>
        </div>
        <input
          type="range" min="0" max="100" step="0.5"
          value={warpDrivePct}
          disabled={isFull}
          onChange={e => onWarpChange(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: WARP, margin: 0,
                   cursor: isFull ? 'not-allowed' : 'pointer',
                   opacity: isFull ? 0.4 : 1 }}
        />
        {maxWarpPct < 99.5 && !isFull && (
          <div className={s.warpMaxNote}>
            MAX {maxWarpPct.toFixed(1)}% (power cap)
          </div>
        )}
      </div>

      {/* Warp info text */}
      <div className={s.warpInfoText}>
        WARP ENERGY IS CONSUMED ON JUMP — ALLOCATION CONTROLLED HERE, POWER SOURCED FROM POWER CONSOLE
      </div>
    </div>
  )
}

