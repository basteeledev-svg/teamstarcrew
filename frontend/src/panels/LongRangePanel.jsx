import { useState, useMemo, useRef, useEffect } from 'react'

// ── Theme ──────────────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#09091c'
const ACCENT = '#88ddff'
const MUTED  = '#1a3344'
const DIM    = '#0d1d2a'

const MAP_W = 560
const MAP_H = 540
const PAD   = 28

// Tier ring colours (T1 outermost → T6 innermost)
const TIER_COLORS = [
  '#88ddff', // T1
  '#55aacc', // T2
  '#3388aa', // T3
  '#226688', // T4
  '#114466', // T5
  '#0a3355', // T6
]
const TIER_LABELS = [
  'star name',
  'approx planets',
  'exact planets',
  '+ moon counts',
  'planet types',
  'ship activity',
]
const TIER_DASHES = ['3,5', '4,7', '5,9', '4,11', '3,13', '2,14']

// ── Projection helpers ─────────────────────────────────────────────────────────
function buildProjection(systems) {
  const xs = systems.map(s => s.position_ly.x)
  const zs = systems.map(s => s.position_ly.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const rangeX = maxX - minX || 1
  const rangeZ = maxZ - minZ || 1
  const scaleV = Math.min((MAP_W - PAD * 2) / rangeX, (MAP_H - PAD * 2) / rangeZ)
  const toXY = (pos) => ({
    x: (pos.x - minX) * scaleV + PAD,
    y: (pos.z - minZ) * scaleV + PAD,
  })
  return { toXY, scaleV, minX, minZ }
}

// ── Keyframes ──────────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes lrsPulse {
    0%, 100% { opacity: 0.7; }
    50%       { opacity: 1.0; }
  }
`

// ── System dot on the galaxy map ───────────────────────────────────────────────
function SystemDot({ sys, xy, selected, onSelect }) {
  const r       = sys.current ? 7 : sys.visited ? 4 : 3
  const opacity = sys.tier === 0 ? 0.2 : sys.visited || sys.current ? 1.0 : 0.6
  const color   = sys.tier === 0 ? '#334455' : (sys.star_color ?? '#aabbcc')

  return (
    <g onClick={() => onSelect(sys.id)} style={{ cursor: 'pointer' }}>
      {selected && (
        <circle cx={xy.x} cy={xy.y} r={r + 7}
          fill="none" stroke={ACCENT} strokeWidth={1} strokeDasharray="3,3"
          style={{ animation: 'lrsPulse 2s ease-in-out infinite' }} />
      )}
      <circle cx={xy.x} cy={xy.y} r={r}
        fill={color} opacity={opacity} />
      {sys.current && (
        <circle cx={xy.x} cy={xy.y} r={r + 3}
          fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
      )}
      {/* Label: only if tier >= 1 */}
      {sys.tier >= 1 && (
        <text x={xy.x + r + 4} y={xy.y + 4}
          fontSize={8} fill={color} opacity={opacity} fontFamily="Courier New">
          {sys.name}
        </text>
      )}
    </g>
  )
}

// ── Scan range rings centred on current system ────────────────────────────────
function ScanRings({ lrsGw, currentXY, thresholds, scaleV }) {
  if (lrsGw <= 0) return null
  return (
    <>
      {thresholds.map((thresh, i) => {
        const rangeLy  = lrsGw / thresh
        const r_px     = rangeLy * scaleV
        if (r_px < 4) return null
        return (
          <circle key={i}
            cx={currentXY.x} cy={currentXY.y} r={r_px}
            fill="none"
            stroke={TIER_COLORS[i]}
            strokeWidth={1}
            strokeDasharray={TIER_DASHES[i]}
            opacity={0.45}
          />
        )
      })}
    </>
  )
}

// ── Galaxy map SVG ─────────────────────────────────────────────────────────────
function GalaxyMap({ systems, lrsGw, thresholds, selectedId, onSelect }) {
  const proj = useMemo(() => buildProjection(systems), [systems])
  const { toXY, scaleV } = proj

  const current    = systems.find(s => s.current)
  const currentXY  = current ? toXY(current.position_ly) : { x: MAP_W / 2, y: MAP_H / 2 }

  return (
    <svg width={MAP_W} height={MAP_H}
      style={{ background: '#020508', display: 'block' }}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
    >
      {/* Scan range rings */}
      <ScanRings lrsGw={lrsGw} currentXY={currentXY} thresholds={thresholds} scaleV={scaleV} />

      {/* Tier ring labels (small, near each ring) */}
      {lrsGw > 0 && thresholds.map((thresh, i) => {
        const r_px = lrsGw / thresh * scaleV
        if (r_px < 10) return null
        const angle = -Math.PI * 0.18 * (i + 1)
        const lx = currentXY.x + Math.cos(angle) * Math.min(r_px, MAP_W)
        const ly = currentXY.y + Math.sin(angle) * Math.min(r_px, MAP_H)
        if (lx < 0 || lx > MAP_W || ly < 0 || ly > MAP_H) return null
        return (
          <text key={i} x={lx} y={ly}
            fontSize={7} fill={TIER_COLORS[i]} fontFamily="Courier New"
            opacity={0.65} textAnchor="middle">
            T{i + 1}
          </text>
        )
      })}

      {/* System dots */}
      {systems.map(sys => {
        const xy = toXY(sys.position_ly)
        return (
          <SystemDot key={sys.id} sys={sys} xy={xy}
            selected={selectedId === sys.id}
            onSelect={onSelect} />
        )
      })}
    </svg>
  )
}

// ── Detail panel helpers ───────────────────────────────────────────────────────
function SectionHead({ label }) {
  return (
    <div style={{
      fontSize: 8, letterSpacing: 2, color: MUTED, fontFamily: 'Courier New',
      marginTop: 14, marginBottom: 6, borderBottom: '1px solid #0a1d2a', paddingBottom: 4,
    }}>
      {label}
    </div>
  )
}

function TierBadge({ tier, max = 6 }) {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 8, marginBottom: 2 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 18, height: 4, borderRadius: 1,
          background: i < tier ? TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] : '#0a1d2a',
        }} />
      ))}
      <span style={{
        fontSize: 8, color: MUTED, fontFamily: 'Courier New', marginLeft: 5, lineHeight: '4px',
      }}>
        TIER {tier}/6
      </span>
    </div>
  )
}

function KvRow({ label, value, valueColor }) {
  return (
    <>
      <span style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 9, color: valueColor ?? '#7aaccc', fontFamily: 'Courier New' }}>
        {value}
      </span>
    </>
  )
}

const PLANET_TYPE_COLORS = {
  'Barren/Rocky':    '#886655',
  'Terrestrial':     '#44bb77',
  'Desert/Arid':     '#cc8833',
  'Ice World':       '#88ddff',
  'Gas Giant':       '#9966dd',
  'Ice Giant':       '#66aacc',
  'Ocean World':     '#2288cc',
  'Jungle/Lush':     '#55cc44',
  'Tidally Locked':  '#aaaaaa',
  'Toxic/Corrosive': '#88cc22',
  'Volcanic/Magma':  '#ff6622',
  'Irradiated':      '#ddaa00',
  'Super-Earth':     '#77aa44',
  'Crystalline':     '#cc88ff',
  'Rogue/Dark':      '#334455',
}

function PlanetTypeTag({ type, moons }) {
  const color = PLANET_TYPE_COLORS[type] ?? '#667788'
  return (
    <div style={{
      padding: '2px 7px', fontSize: 8, fontFamily: 'Courier New', letterSpacing: 0.5,
      background: `${color}18`, border: `1px solid ${color}44`, color,
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: 0.85 }} />
      {type}
      {moons?.length > 0 && (
        <span style={{ color: '#446677', fontSize: 7 }}>+{moons.length} moon{moons.length > 1 ? 's' : ''}</span>
      )}
    </div>
  )
}

const SHIP_ACTIVITY_COLOR = {
  'clear':                '#334455',
  'minimal activity':     '#336655',
  'patrol group':         '#886633',
  'active fleet':         '#884433',
  'major fleet presence': '#cc3333',
}

function NextTierHint({ sys, lrsGw, thresholds }) {
  if (sys.tier >= 6 || sys.current) return null
  const nextThresh = thresholds[sys.tier]  // thresholds[0]=T1, [1]=T2, etc.
  if (!nextThresh) return null
  const neededGw = Math.max(0, nextThresh * sys.distance_ly - lrsGw)
  const label    = TIER_LABELS[sys.tier]
  return (
    <div style={{
      marginTop: 12, padding: '8px 10px',
      background: '#030a10', border: '1px solid #0a2030',
      fontSize: 9, fontFamily: 'Courier New',
    }}>
      <span style={{ color: '#1a3344' }}>NEXT TIER: </span>
      <span style={{ color: '#3a6688' }}>{label}</span>
      <span style={{ color: '#1a2a38' }}>
        {neededGw > 0.01
          ? ` — +${neededGw.toFixed(1)} GW needed`
          : ' — UNLOCKING...'}
      </span>
    </div>
  )
}

// ── System detail panel ────────────────────────────────────────────────────────
function SystemDetail({ sys, lrsGw, thresholds }) {
  const starColor = sys.star_color ?? '#aabbcc'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
          background: starColor, boxShadow: `0 0 6px ${starColor}88`,
        }} />
        <div>
          <div style={{ fontSize: 14, color: starColor, fontFamily: 'Courier New', letterSpacing: 1 }}>
            {sys.tier >= 1 ? sys.name : 'UNKNOWN SYSTEM'}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1, marginTop: 2 }}>
            {sys.star_type ?? '?'} STAR
            {sys.current ? ' · CURRENT LOCATION' : ''}
            {sys.visited && !sys.current ? ' · VISITED' : ''}
          </div>
        </div>
      </div>

      <TierBadge tier={sys.tier} />

      <SectionHead label="SCAN DATA" />
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', marginBottom: 4,
      }}>
        {sys.current
          ? <KvRow label="DISTANCE" value="LOCAL SYSTEM" />
          : <KvRow label="DISTANCE" value={`${sys.distance_ly} LY`} />
        }
        {!sys.current && <KvRow label="SIGNAL" value={sys.signal > 100 ? 'MAX' : sys.signal?.toFixed(2)} />}
      </div>

      {sys.tier >= 2 && (
        <>
          <SectionHead label="PLANETS" />
          {sys.tier === 2 && (
            <div style={{ fontSize: 10, color: '#5588aa', fontFamily: 'Courier New' }}>
              {sys.planet_count_approx}
            </div>
          )}
          {sys.tier >= 3 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px',
            }}>
              <KvRow label="PLANETS" value={String(sys.planet_count)} />
              {sys.tier >= 4 && <KvRow label="MOONS" value={String(sys.moon_count)} />}
            </div>
          )}
        </>
      )}

      {sys.tier >= 5 && sys.planet_types?.length > 0 && (
        <>
          <SectionHead label="PLANET TYPES" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sys.planet_types.map((p, i) => (
              <div key={i}>
                <div style={{ fontSize: 8, color: '#2a4455', fontFamily: 'Courier New', marginBottom: 2 }}>
                  {p.name}
                </div>
                <PlanetTypeTag type={p.type} moons={p.moons} />
                {p.moons?.length > 0 && (
                  <div style={{ paddingLeft: 12, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {p.moons.map((m, j) => (
                      <div key={j} style={{
                        fontSize: 7, padding: '1px 5px', fontFamily: 'Courier New',
                        color: '#334455', border: '1px solid #0a1a22',
                      }}>
                        {m.type}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {sys.tier >= 6 && sys.ship_count_approx !== undefined && (
        <>
          <SectionHead label="SHIP ACTIVITY" />
          <div style={{
            display: 'inline-block', padding: '3px 10px', fontSize: 9,
            fontFamily: 'Courier New', letterSpacing: 1,
            background: '#030a10',
            border: `1px solid ${SHIP_ACTIVITY_COLOR[sys.ship_count_approx] ?? '#334455'}55`,
            color: SHIP_ACTIVITY_COLOR[sys.ship_count_approx] ?? '#334455',
          }}>
            {sys.ship_count_approx.toUpperCase()}
          </div>
        </>
      )}

      <NextTierHint sys={sys} lrsGw={lrsGw} thresholds={thresholds} />
    </div>
  )
}

// ── No selection state ─────────────────────────────────────────────────────────
function EmptyDetail({ systems, lrsGw }) {
  const totalSystems   = systems.length
  const scannedAtT1    = systems.filter(s => s.tier >= 1).length
  const scannedAtT3    = systems.filter(s => s.tier >= 3).length
  const visited        = systems.filter(s => s.visited).length

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: 24,
    }}>
      <div style={{ fontSize: 42, opacity: 0.07, color: ACCENT }}>⊙</div>
      <div style={{ color: MUTED, fontSize: 10, letterSpacing: 3, fontFamily: 'Courier New' }}>
        SELECT A SYSTEM
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0', width: '100%', maxWidth: 230 }}>
        {[
          ['SCAN POWER', `${lrsGw.toFixed(1)} GW`],
          ['TOTAL SYSTEMS', String(totalSystems)],
          ['NAMED (T1+)', String(scannedAtT1)],
          ['DETAILED (T3+)', String(scannedAtT3)],
          ['VISITED', String(visited)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Courier New' }}>
            <span style={{ color: MUTED }}>{k}</span>
            <span style={{ color: k === 'SCAN POWER' ? ACCENT : '#5588aa' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 7, color: '#0a2030', fontFamily: 'Courier New', letterSpacing: 1, textAlign: 'center', lineHeight: 1.9 }}>
        {TIER_LABELS.map((l, i) => (
          <div key={i}>
            <span style={{ color: TIER_COLORS[i] }}>T{i + 1}</span>
            <span style={{ color: '#1a3040' }}> — {l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function LongRangePanel({ gameState, sendCommand }) {
  const [selectedId, setSelectedId] = useState(null)

  const lrs        = gameState?.long_range_scan ?? {}
  const systems    = lrs.systems    ?? []
  const lrsGw      = lrs.lrs_gw    ?? 0
  const thresholds = lrs.thresholds ?? [0.1, 0.5, 2, 5, 10, 25]

  const selected = useMemo(
    () => systems.find(s => s.id === selectedId) ?? null,
    [systems, selectedId],
  )

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Header */}
      <div style={{
        padding: '7px 14px', borderBottom: '1px solid #0a1d2a',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 3, fontFamily: 'Courier New', color: ACCENT, fontWeight: 'bold' }}>
          ⊙ LONG RANGE SCAN
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New', color: MUTED }}>
          {lrsGw.toFixed(1)} GW · {systems.filter(s => s.tier >= 1).length}/{systems.length} SYSTEMS IDENTIFIED
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {TIER_COLORS.map((c, i) => (
            <span key={i} style={{ fontSize: 7, fontFamily: 'Courier New', color: c, letterSpacing: 0.5 }}>
              T{i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: galaxy map */}
        <div style={{ flexShrink: 0, borderRight: '1px solid #0a1d2a' }}>
          <GalaxyMap
            systems={systems}
            lrsGw={lrsGw}
            thresholds={thresholds}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#040a10' }}>
          {selected
            ? <SystemDetail sys={selected} lrsGw={lrsGw} thresholds={thresholds} />
            : <EmptyDetail systems={systems} lrsGw={lrsGw} />
          }
        </div>
      </div>
    </div>
  )
}

