import { useState, useEffect } from 'react'

// ── Constants (must match backend) ────────────────────────────────────────────
const FUEL_ENGINE_MAX_THRUST = 0.025    // AU/tick at 100% output
const ELEC_ENGINE_MAX_THRUST = 0.0125   // AU/tick at 100% output
const WARP_CAP_MAX           = 100_000  // GW
const WARP_LEAK_GW           = 0.5     // GW/tick passive loss

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

const ACCENT  = '#ffaa00'   // amber (fuel)
const ELEC    = '#00aaff'   // blue  (electric)
const WARP    = '#aa44ff'   // purple (warp)
const ACCENT2 = '#00ffcc'   // teal  (readouts)
const BG      = '#070714'
const CARD_BG = '#09091c'

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

function healthColor(pct) {
  if (pct >= 70) return '#00ff88'
  if (pct >= 40) return ACCENT
  return '#ff4444'
}

// ══════════════════════════════════════════════════════════════════════════════
export default function EnginesPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship

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
      <div style={{ flex: 1, background: BG, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#222', fontFamily: 'Courier New',
                    fontSize: '12px', letterSpacing: '4px' }}>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG,
                  fontFamily: 'Courier New', color: '#ccc', overflow: 'hidden',
                  userSelect: 'none' }}>

      {/* ── Header ── */}
      <div style={{ padding: '5px 14px', background: '#070712',
                    borderBottom: `1px solid ${ACCENT}33`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexShrink: 0 }}>
        <span style={{ color: ACCENT, fontWeight: 'bold', fontSize: '12px', letterSpacing: '3px' }}>
          🚀 ENGINES
        </span>
        <div style={{ display: 'flex', gap: '24px', fontSize: '11px' }}>
          <span style={{ color: ACCENT2 }}>
            THRUST <b>{(engineThrustAU * 1000).toFixed(2)}</b> mAU/tk
          </span>
          <span style={{ color: overBudget ? '#ff4444' : '#555', fontSize: '10px' }}>
            ELEC {elecDraw.toFixed(0)}/{engineAllocGW.toFixed(0)} GW
          </span>
          <span style={{ color: WARP, fontSize: '10px' }}>
            WARP {Math.round(warpCapGW).toLocaleString()} GW
          </span>
        </div>
      </div>

      {/* ── Engine Room, fuel & power budget strip ── */}
      <div style={{ padding: '4px 10px', background: '#09091a',
                    borderBottom: `1px solid ${ACCENT}22`, flexShrink: 0,
                    display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: '#555', letterSpacing: '2px', flexShrink: 0 }}>
          ENG ROOM
        </span>
        {/* Fuel bar — max display = 50 000 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8px', color: '#666', flexShrink: 0, width: '26px' }}>FUEL</span>
          <div style={{ flex: 1, height: '5px', background: '#111', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, (engineRoomFuel / 50000) * 100)}%`,
              height: '100%',
              background: engineRoomFuel < 5000 ? '#ff4444' : engineRoomFuel < 15000 ? ACCENT : '#ffcc44',
              transition: 'width 0.8s ease', borderRadius: '3px',
            }} />
          </div>
          <span style={{ fontSize: '8px', color: ACCENT, flexShrink: 0, minWidth: '58px', textAlign: 'right' }}>
            {Math.round(engineRoomFuel).toLocaleString()}
          </span>
        </div>
        <span style={{ fontSize: '8px', color: '#555', flexShrink: 0 }}>
          {fuelDraw > 0 ? `−${fuelDraw.toLocaleString()}/tk` : '— idle'}
        </span>
        <div style={{ display: 'flex', gap: '6px', fontSize: '9px', alignItems: 'center',
                      paddingLeft: '8px', borderLeft: '1px solid #ffffff11' }}>
          <span style={{ color: '#555' }}>ENGINES ALLOC</span>
          <span style={{ color: overBudget ? '#ff4444' : ACCENT2 }}>
            {engineAllocGW.toFixed(0)} GW
          </span>
        </div>
      </div>

      {/* ── Engine power budget bar: shows elec | warp | free headroom ── */}
      <div style={{ padding: '4px 10px', background: '#060616',
                    borderBottom: `1px solid ${ACCENT}11`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: '8px', marginBottom: '2px', color: '#444' }}>
          <span>ENGINE POWER BUDGET</span>
          <span style={{ color: overBudget ? '#ff4444' : '#555' }}>
            {engineBudgetUsedGW.toFixed(0)} / {engineAllocGW.toFixed(0)} GW used
          </span>
        </div>
        <div style={{ height: '6px', background: '#111', borderRadius: '3px',
                      overflow: 'hidden', display: 'flex' }}>
          {/* Electric portion */}
          <div style={{
            width: `${engineAllocGW > 0 ? Math.min(100, (elecDraw / engineAllocGW) * 100) : 0}%`,
            height: '100%', background: ELEC, transition: 'width 0.3s',
          }} />
          {/* Warp portion */}
          <div style={{
            width: `${engineAllocGW > 0 ? Math.min(100 - (elecDraw / engineAllocGW) * 100, (warpAllocGW / engineAllocGW) * 100) : 0}%`,
            height: '100%', background: WARP, transition: 'width 0.3s',
          }} />
          {/* Over-budget overflow indicator */}
          {overBudget && (
            <div style={{ flex: 1, height: '100%', background: '#ff444488' }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '2px', fontSize: '7px', color: '#333' }}>
          <span style={{ color: ELEC }}>▬ ELEC {elecDraw.toFixed(0)} GW</span>
          <span style={{ color: WARP }}>▬ WARP {warpAllocGW.toFixed(0)} GW</span>
          {!overBudget && (
            <span style={{ color: '#333' }}>▬ FREE {Math.max(0, engineAllocGW - engineBudgetUsedGW).toFixed(0)} GW</span>
          )}
          {overBudget && (
            <span style={{ color: '#ff4444' }}>⚠ OVER BY {(engineBudgetUsedGW - engineAllocGW).toFixed(0)} GW</span>
          )}
        </div>
      </div>

      {/* ── Engine cards ── */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', flexShrink: 0 }}>
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
              onOutput={v => handleEngineChange(key, v)}
            />
          )
        })}
      </div>

      {/* ── Warp Drive ── */}
      <div style={{ padding: '0 10px 10px', flex: 1 }}>
        <WarpCapacitorSection
          capacitorGW={warpCapGW}
          warpAllocGW={warpAllocGW}
          netRate={warpNetRate}
          warpDrivePct={curWarpPct}
          maxWarpPct={totalPowerGW > 0 ? (warpBudgetGW / totalPowerGW) * 100 : 0}
          onWarpChange={handleWarpDriveChange}
        />
      </div>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE CARD
// ══════════════════════════════════════════════════════════════════════════════
function EngineCard({ label, output, health, isFuel, maxOutputFrac = 1, onOutput }) {
  const accentCol    = isFuel ? ACCENT : ELEC
  const borderCol    = health < 40 ? '#ff444455' : `${accentCol}33`
  const consume      = engineConsumption(output)
  const consumeLabel = isFuel
    ? `${consume.toLocaleString()} fuel/tk`
    : `${consume.toLocaleString()} GW/tk`
  const thrustMax    = isFuel ? FUEL_ENGINE_MAX_THRUST : ELEC_ENGINE_MAX_THRUST
  const thrustContrib = output * (health / 100) * thrustMax

  return (
    <div style={{ flex: 1, background: CARD_BG, border: `1px solid ${borderCol}`,
                  borderRadius: '6px', padding: '8px', display: 'flex',
                  flexDirection: 'column', gap: '4px',
                  opacity: health <= 0 ? 0.5 : 1 }}>

      <div style={{ color: accentCol, fontSize: '10px', letterSpacing: '2px', fontWeight: 'bold' }}>
        {label}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
        <span style={{ color: healthColor(health) }}>HP {health.toFixed(1)}%</span>
        <span style={{ color: ACCENT2 }}>{(thrustContrib * 1000).toFixed(3)} mAU/tk</span>
      </div>

      {/* Health bar */}
      <div style={{ height: '2px', background: '#111', borderRadius: '1px', overflow: 'hidden' }}>
        <div style={{ width: `${health}%`, height: '100%',
                      background: healthColor(health), transition: 'width 0.6s' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: '10px', marginTop: '2px' }}>
        <span style={{ color: '#666' }}>OUTPUT</span>
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
        <div style={{ fontSize: '8px', color: '#333', textAlign: 'right', letterSpacing: '1px' }}>
          MAX {Math.round(maxOutputFrac * 100)}% (power cap)
        </div>
      )}

      <div style={{ fontSize: '9px', color: '#555', textAlign: 'right' }}>
        {output > 0 ? consumeLabel : '— idle'}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WARP CAPACITOR SECTION
// ══════════════════════════════════════════════════════════════════════════════
function WarpCapacitorSection({ capacitorGW, warpAllocGW, netRate,
                                warpDrivePct, maxWarpPct, onWarpChange }) {
  const pct      = Math.min(100, (capacitorGW / WARP_CAP_MAX) * 100)
  const isFull   = capacitorGW >= WARP_CAP_MAX - 1
  const isEmpty  = capacitorGW <= 0.1
  const barColor = pct < 15 ? '#ff4444' : pct < 40 ? ACCENT : WARP
  const netColor = netRate >= 0 ? WARP : '#ff6644'
  const netLabel = netRate >= 0
    ? `▲ +${netRate.toFixed(1)} GW/tk`
    : `▼ ${netRate.toFixed(1)} GW/tk`

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${WARP}33`,
                  borderRadius: '6px', padding: '10px', height: '100%', boxSizing: 'border-box' }}>

      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '8px' }}>
        <span style={{ color: WARP, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold' }}>
          ⚡ WARP DRIVE
        </span>
        <div style={{ display: 'flex', gap: '16px', fontSize: '9px', alignItems: 'center' }}>
          <span style={{ color: netColor }}>{netLabel}</span>
          <span style={{ color: '#444' }}>−{WARP_LEAK_GW} GW/tk leak</span>
          <span style={{ color: WARP }}>
            {Math.round(capacitorGW).toLocaleString()} / {WARP_CAP_MAX.toLocaleString()} GW
          </span>
          <span style={{ color: '#777' }}>{pct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Capacitor bar */}
      <div style={{ height: '16px', background: '#111', borderRadius: '8px',
                    overflow: 'hidden', marginBottom: '6px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor,
                      transition: 'width 0.8s ease', borderRadius: '8px',
                      boxShadow: pct > 5 ? `0 0 8px ${WARP}88` : 'none' }} />
      </div>

      {(isFull || isEmpty) && (
        <div style={{ fontSize: '8px', color: isFull ? WARP : '#ff6644',
                      textAlign: 'center', letterSpacing: '1px', marginBottom: '8px' }}>
          {isFull ? '— CAPACITOR FULL —' : '— CAPACITOR EMPTY —'}
        </div>
      )}

      {/* Warp power allocation slider */}
      <div style={{ background: '#07071a', border: `1px solid ${WARP}22`,
                    borderRadius: '4px', padding: '8px 10px', marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '9px', color: '#666', letterSpacing: '2px' }}>
            CHARGING ALLOCATION
          </span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '9px' }}>
            <span style={{ color: WARP }}>{warpDrivePct.toFixed(1)}%</span>
            <span style={{ color: '#555' }}>= {warpAllocGW.toFixed(0)} GW to capacitor</span>
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
          <div style={{ fontSize: '8px', color: '#333', textAlign: 'right',
                        marginTop: '2px', letterSpacing: '1px' }}>
            MAX {maxWarpPct.toFixed(1)}% (power cap)
          </div>
        )}
      </div>

      {/* Warp info text */}
      <div style={{ fontSize: '8px', color: '#333', textAlign: 'center',
                    marginTop: '8px', letterSpacing: '1px' }}>
        WARP ENERGY IS CONSUMED ON JUMP — ALLOCATION CONTROLLED HERE, POWER SOURCED FROM POWER CONSOLE
      </div>
    </div>
  )
}

