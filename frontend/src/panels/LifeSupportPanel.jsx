import { useState } from 'react'
import { healthColor } from '../shared'
import s from './LifeSupportPanel.module.css'

// ── Theme ─────────────────────────────────────────────────────────────────────
const MUTED  = 'var(--text-ghost)'
const ACCENT = '#44ffcc'   // teal — life support

function atmoColor(q) {
  if (q >= 85) return 'var(--status-good)'
  if (q >= 65) return ACCENT
  if (q >= 40) return 'var(--accent-amber)'
  if (q >= 20) return 'var(--accent-amber)'
  return 'var(--status-danger)'
}
function atmoStatus(q) {
  if (q >= 85) return 'NOMINAL'
  if (q >= 65) return 'ADEQUATE'
  if (q >= 40) return 'DEGRADED'
  if (q >= 20) return 'WARNING'
  return 'CRITICAL'
}

// ── Bars ─────────────────────────────────────────────────────────────────────
function Bar({ value, color, height = 6 }) {
  return (
    <div className={s.barTrack} style={{ height }}>
      <div className={s.barFill} style={{
        width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
        height: '100%', background: color,
      }} />
    </div>
  )
}
function HealthBar({ value, height = 6 }) {
  return <Bar value={value} color={healthColor(value)} height={height} />
}

// ── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className={s.card}>
      <div className={s.cardTitle}>{title}</div>
      {children}
    </div>
  )
}

// ── Row helpers ───────────────────────────────────────────────────────────────
function Row({ label, value, valueColor }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowValue} style={{ color: valueColor ?? ACCENT }}>{value}</span>
    </div>
  )
}

// ── Big gauge ─────────────────────────────────────────────────────────────────
function BigGauge({ label, value, color }) {
  return (
    <div className={s.gaugeWrap}>
      <div className={s.gaugeHeader}>
        <span className={s.gaugeLabel}>{label}</span>
        <span className={s.gaugeValue} style={{ color }}>{Math.round(value)}%</span>
      </div>
      <Bar value={value} color={color} height={10} />
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function LifeSupportPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship ?? {}

  // Power data
  const minGw    = ship.life_support_min_gw ?? 5
  const netGw    = ship.net_power_gw ?? 0
  const gwTarget = ship.power_allocation_gw_targets?.life_support ?? minGw
  const lsPct    = ship.power_allocation?.life_support ?? 0
  const actualGw = gwTarget != null
    ? Math.min(netGw, gwTarget)
    : (netGw * lsPct / 100)

  // Passengers
  const passengers = ship.people_on_board ?? 0
  const lqHull  = ship.room_hull_health?.living_quarters ?? 100

  // Air scrubbers
  const scrubberCount  = ship.rooms?.living_quarters?.air_scrubbers ?? 0
  const cargoScrubbers = ship.rooms?.cargo_bay?.air_scrubbers ?? 0
  const mfgScrubbers   = ship.rooms?.manufacturing?.air_scrubbers ?? 0
  const scrubberHealth = ship.item_health?.air_scrubbers ?? 100

  // Atmosphere quality (0–100)
  const powerRatio    = minGw > 0 ? Math.min(1.0, actualGw / minGw) : 1.0
  const scrubberBonus = Math.min(1.0, (scrubberCount * (scrubberHealth / 100)) / Math.max(1, Math.ceil(passengers / 30)))
  const atmoQuality   = Math.round((powerRatio * 0.7 + scrubberBonus * 0.3) * 100)
  const statusLabel   = atmoStatus(atmoQuality)
  const statusColor   = atmoColor(atmoQuality)

  // CO2 (inverse of scrubbing effectiveness; always improves with power + scrubbers)
  const co2 = Math.round((1 - powerRatio * (0.6 + 0.4 * scrubberBonus)) * 100)

  // GW target slider
  const sliderMax = Math.max(minGw * 4, 50)
  const [localGw, setLocalGw] = useState(null)
  const displayGw = localGw ?? gwTarget ?? minGw

  function commitGw(val) {
    setLocalGw(null)
    sendCommand({ type: 'set_gw_lock', station: 'life_support', gw_target: val })
  }

  // Power adequacy percent (capped display at 200)
  const adequacyPct = minGw > 0 ? Math.min(200, (actualGw / minGw) * 100) : 100

  return (
    <div className={s.container}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.headerIcon}>✚</span>
          <span className={s.headerTitle}>LIFE SUPPORT</span>
        </div>
        <div className={s.statusBadge} style={{
          color: statusColor,
          border: `1px solid ${statusColor}`,
        }}>
          {statusLabel}
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div className={s.grid}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div className={s.col}>

          {/* Atmosphere readouts */}
          <Section title="ATMOSPHERIC STATUS">
            <BigGauge label="ATMOSPHERE QUALITY" value={atmoQuality} color={statusColor} />
            <div className={s.divider}>
              <BigGauge label="CO₂ CONCENTRATION" value={co2} color={co2 > 50 ? 'var(--status-danger)' : co2 > 30 ? 'var(--accent-amber)' : 'var(--status-good)'} />
            </div>
            <div className={s.atmoHint}>
              {atmoQuality >= 85
                ? 'All systems nominal — atmosphere stable'
                : atmoQuality >= 65
                  ? 'Marginal — increase power or add scrubbers'
                  : atmoQuality >= 40
                    ? '⚠ Atmosphere degraded — passengers at risk'
                    : '⚠⚠ CRITICAL — immediate action required'}
            </div>
          </Section>

          {/* Passenger status */}
          <Section title="PASSENGER STATUS">
            <div className={s.passRow}>
              <span className={s.passLabel}>PASSENGERS ABOARD</span>
              <span className={s.passCount}>{passengers}</span>
            </div>
            <div>
              <div className={s.hullRow}>
                <span className={s.hullLabel}>LIVING QUARTERS HULL</span>
                <span className={s.hullValue} style={{ color: healthColor(lqHull) }}>{Math.round(lqHull)}%</span>
              </div>
              <HealthBar value={lqHull} />
            </div>
            <Row
              label="POWER REQ / 100 PASSENGERS"
              value={`+10.0 GW`}
              valueColor={MUTED}
            />
          </Section>

        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className={s.col}>

          {/* Power systems */}
          <Section title="POWER SYSTEMS">
            <Row label="MINIMUM REQUIRED" value={`${minGw.toFixed(1)} GW`} valueColor="var(--text-body)" />
            <Row
              label="CURRENT DELIVERY"
              value={`${actualGw.toFixed(1)} GW`}
              valueColor={actualGw >= minGw ? 'var(--status-good)' : 'var(--status-danger)'}
            />
            <Row label="NET SHIP POWER" value={`${netGw.toFixed(1)} GW`} valueColor={MUTED} />

            <div className={s.powerBlock}>
              <div className={s.powerHeader}>
                <span className={s.powerMuted}>POWER ADEQUACY</span>
                <span className={s.powerSmall} style={{ color: actualGw >= minGw ? 'var(--status-good)' : 'var(--status-danger)' }}>
                  {minGw > 0 ? Math.round(actualGw / minGw * 100) : 100}%
                </span>
              </div>
              <Bar value={adequacyPct / 2} color={actualGw >= minGw ? 'var(--status-good)' : 'var(--status-danger)'} height={7} />
            </div>

            <div className={s.powerBlock}>
              <div className={s.gwRow}>
                <span className={s.gwLabel}>GW TARGET</span>
                <span className={s.gwValue}>{displayGw.toFixed(1)} GW</span>
              </div>
              <input type="range"
                min={minGw} max={sliderMax} step={0.1}
                value={Math.max(minGw, displayGw)}
                onChange={e => setLocalGw(parseFloat(e.target.value))}
                onMouseUp={e => commitGw(parseFloat(e.target.value))}
                onTouchEnd={e => commitGw(parseFloat(e.target.value))}
                className={s.gwSlider}
              />
              <div className={s.gwHint}>
                Floor locked at {minGw.toFixed(1)} GW — set higher to buffer against power fluctuations
              </div>
            </div>
          </Section>

          {/* Air scrubbers */}
          <Section title="AIR SCRUBBERS">
            <div className={s.scrubberRow}>
              <span className={s.scrubberLabel}>INSTALLED IN LIVING QUARTERS</span>
              <span className={s.scrubberCount} style={{ color: scrubberCount > 0 ? ACCENT : 'var(--text-dim)' }}>
                {scrubberCount}
              </span>
            </div>

            {scrubberCount > 0 && (
              <div>
                <div className={s.scrubberHealthRow}>
                  <span className={s.scrubberHealthLabel}>SCRUBBER HEALTH</span>
                  <span className={s.scrubberHealthValue} style={{ color: healthColor(scrubberHealth) }}>{Math.round(scrubberHealth)}%</span>
                </div>
                <HealthBar value={scrubberHealth} height={8} />
              </div>
            )}

            <div className={s.scrubberExtra}>
              <Row label="IN CARGO BAY" value={cargoScrubbers} valueColor={cargoScrubbers > 0 ? 'var(--text-body)' : MUTED} />
              {mfgScrubbers > 0 && (
                <Row label="IN MANUFACTURING" value={mfgScrubbers} valueColor="var(--text-body)" />
              )}
            </div>

            {scrubberCount === 0 && (
              <div className={s.warningBox}>
                ⚠ NO SCRUBBERS INSTALLED
                <br />Request Transportation to move scrubbers from Cargo to Living Quarters
              </div>
            )}
            {scrubberCount > 0 && scrubberHealth < 50 && (
              <div className={s.warningBox}>
                ⚠ SCRUBBER HEALTH LOW — contact Repairs
              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  )
}
