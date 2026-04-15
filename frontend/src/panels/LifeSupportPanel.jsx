import { useState } from 'react'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#09091c'
const MUTED  = '#1a2a3a'
const ACCENT = '#44ffcc'   // teal — life support

function healthColor(h) {
  if (h >= 80) return '#00ff88'
  if (h >= 50) return '#ffaa00'
  if (h >= 25) return '#ff8800'
  return '#ff3333'
}
function atmoColor(q) {
  if (q >= 85) return '#00ff88'
  if (q >= 65) return ACCENT
  if (q >= 40) return '#ffaa00'
  if (q >= 20) return '#ff8800'
  return '#ff3333'
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
    <div style={{ flex: 1, height, background: '#111', border: '1px solid #223', borderRadius: 2 }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
        height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s ease',
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
    <div style={{
      background: CARD, border: '1px solid #101030', borderRadius: 3,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 3, color: MUTED, fontFamily: 'Courier New' }}>{title}</div>
      {children}
    </div>
  )
}

// ── Row helpers ───────────────────────────────────────────────────────────────
function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: '#8899aa', fontFamily: 'Courier New' }}>{label}</span>
      <span style={{ fontSize: 9, color: valueColor ?? ACCENT, fontFamily: 'Courier New' }}>{value}</span>
    </div>
  )
}

// ── Big gauge ─────────────────────────────────────────────────────────────────
function BigGauge({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 9, color: '#8899aa', fontFamily: 'Courier New', letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 14, color, fontFamily: 'Courier New', fontWeight: 'bold' }}>{Math.round(value)}%</span>
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

  // Crew
  const crew    = ship.people_on_board ?? 0
  const lqHull  = ship.room_hull_health?.living_quarters ?? 100

  // Air scrubbers
  const scrubberCount  = ship.rooms?.living_quarters?.air_scrubbers ?? 0
  const cargoScrubbers = ship.rooms?.cargo_bay?.air_scrubbers ?? 0
  const mfgScrubbers   = ship.rooms?.manufacturing?.air_scrubbers ?? 0
  const scrubberHealth = ship.item_health?.air_scrubbers ?? 100

  // Atmosphere quality (0–100)
  const powerRatio    = minGw > 0 ? Math.min(1.0, actualGw / minGw) : 1.0
  const scrubberBonus = Math.min(1.0, (scrubberCount * (scrubberHealth / 100)) / Math.max(1, Math.ceil(crew / 30)))
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
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: BG, padding: 12, gap: 10,
      fontFamily: 'Courier New', overflowY: 'auto',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: ACCENT }}>✚</span>
          <span style={{ fontSize: 11, letterSpacing: 4, color: ACCENT }}>LIFE SUPPORT</span>
        </div>
        <div style={{
          fontSize: 10, letterSpacing: 2, color: statusColor,
          padding: '2px 10px', border: `1px solid ${statusColor}`, borderRadius: 2,
        }}>
          {statusLabel}
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Atmosphere readouts */}
          <Section title="ATMOSPHERIC STATUS">
            <BigGauge label="ATMOSPHERE QUALITY" value={atmoQuality} color={statusColor} />
            <div style={{ borderTop: '1px solid #0d0d20', paddingTop: 8 }}>
              <BigGauge label="CO₂ CONCENTRATION" value={co2} color={co2 > 50 ? '#ff3333' : co2 > 30 ? '#ffaa00' : '#00ff88'} />
            </div>
            <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1, textAlign: 'center', marginTop: 2 }}>
              {atmoQuality >= 85
                ? 'All systems nominal — atmosphere stable'
                : atmoQuality >= 65
                  ? 'Marginal — increase power or add scrubbers'
                  : atmoQuality >= 40
                    ? '⚠ Atmosphere degraded — crew at risk'
                    : '⚠⚠ CRITICAL — immediate action required'}
            </div>
          </Section>

          {/* Crew status */}
          <Section title="CREW STATUS">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: '#8899aa' }}>PERSONNEL ABOARD</span>
              <span style={{ fontSize: 28, color: ACCENT, letterSpacing: 3 }}>{crew}</span>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#8899aa' }}>LIVING QUARTERS HULL</span>
                <span style={{ fontSize: 9, color: healthColor(lqHull) }}>{Math.round(lqHull)}%</span>
              </div>
              <HealthBar value={lqHull} />
            </div>
            <Row
              label="POWER REQ / 100 CREW"
              value={`+10.0 GW`}
              valueColor={MUTED}
            />
          </Section>

        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Power systems */}
          <Section title="POWER SYSTEMS">
            <Row label="MINIMUM REQUIRED" value={`${minGw.toFixed(1)} GW`} valueColor="#8899aa" />
            <Row
              label="CURRENT DELIVERY"
              value={`${actualGw.toFixed(1)} GW`}
              valueColor={actualGw >= minGw ? '#00ff88' : '#ff3333'}
            />
            <Row label="NET SHIP POWER" value={`${netGw.toFixed(1)} GW`} valueColor={MUTED} />

            <div style={{ paddingTop: 4, borderTop: '1px solid #0d0d20' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8, color: MUTED }}>POWER ADEQUACY</span>
                <span style={{ fontSize: 8, color: actualGw >= minGw ? '#00ff88' : '#ff3333' }}>
                  {minGw > 0 ? Math.round(actualGw / minGw * 100) : 100}%
                </span>
              </div>
              <Bar value={adequacyPct / 2} color={actualGw >= minGw ? '#00ff88' : '#ff3333'} height={7} />
            </div>

            <div style={{ paddingTop: 4, borderTop: '1px solid #0d0d20' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#8899aa' }}>GW TARGET</span>
                <span style={{ fontSize: 9, color: ACCENT }}>{displayGw.toFixed(1)} GW</span>
              </div>
              <input type="range"
                min={minGw} max={sliderMax} step={0.1}
                value={Math.max(minGw, displayGw)}
                onChange={e => setLocalGw(parseFloat(e.target.value))}
                onMouseUp={e => commitGw(parseFloat(e.target.value))}
                onTouchEnd={e => commitGw(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: ACCENT, height: 12 }}
              />
              <div style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
                Floor locked at {minGw.toFixed(1)} GW — set higher to buffer against power fluctuations
              </div>
            </div>
          </Section>

          {/* Air scrubbers */}
          <Section title="AIR SCRUBBERS">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#8899aa' }}>INSTALLED IN LIVING QUARTERS</span>
              <span style={{ fontSize: 22, color: scrubberCount > 0 ? ACCENT : '#334455', letterSpacing: 2 }}>
                {scrubberCount}
              </span>
            </div>

            {scrubberCount > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: '#8899aa' }}>SCRUBBER HEALTH</span>
                  <span style={{ fontSize: 9, color: healthColor(scrubberHealth) }}>{Math.round(scrubberHealth)}%</span>
                </div>
                <HealthBar value={scrubberHealth} height={8} />
              </div>
            )}

            <div style={{ borderTop: '1px solid #0d0d20', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Row label="IN CARGO BAY" value={cargoScrubbers} valueColor={cargoScrubbers > 0 ? '#8899aa' : MUTED} />
              {mfgScrubbers > 0 && (
                <Row label="IN MANUFACTURING" value={mfgScrubbers} valueColor="#8899aa" />
              )}
            </div>

            {scrubberCount === 0 && (
              <div style={{
                fontSize: 8, color: '#ff8800', letterSpacing: 1,
                padding: '6px 8px', border: '1px solid #443300', borderRadius: 2, background: '#110800',
              }}>
                ⚠ NO SCRUBBERS INSTALLED
                <br />Request Transportation to move scrubbers from Cargo to Living Quarters
              </div>
            )}
            {scrubberCount > 0 && scrubberHealth < 50 && (
              <div style={{
                fontSize: 8, color: '#ffaa00', letterSpacing: 1,
                padding: '6px 8px', border: '1px solid #443300', borderRadius: 2, background: '#110800',
              }}>
                ⚠ SCRUBBER HEALTH LOW — contact Repairs
              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  )
}
