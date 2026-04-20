import { useState, useMemo, useRef, useEffect } from 'react'
import { PLANET_TYPE_COLORS } from '../shared'
import './keyframes.css'
import s from './LongRangePanel.module.css'

// ── Theme ──────────────────────────────────────────────────────────────────────
const ACCENT = '#88ddff'
const MUTED  = '#1a3344'

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


// ── System dot on the galaxy map ───────────────────────────────────────────────
function SystemDot({ sys, xy, selected, onSelect }) {
  const r       = sys.current ? 7 : sys.visited ? 4 : 3
  const opacity = sys.tier === 0 ? 0.2 : sys.visited || sys.current ? 1.0 : 0.6
  const color   = sys.tier === 0 ? 'var(--text-dim)' : (sys.star_color ?? 'var(--text-primary)')

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
      style={{ background: 'var(--bg-base)', display: 'block' }}
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
    <div className={s.sectionHead}>
      {label}
    </div>
  )
}

function TierBadge({ tier, max = 6 }) {
  return (
    <div className={s.tierBadge}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={s.tierBlock} style={{
          background: i < tier ? TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)] : '#0a1d2a',
        }} />
      ))}
      <span className={s.tierLabel}>
        TIER {tier}/6
      </span>
    </div>
  )
}

function KvRow({ label, value, valueColor }) {
  return (
    <>
      <span className={s.kvLabel}>
        {label}
      </span>
      <span className={s.kvValue} style={{ color: valueColor ?? 'var(--text-body)' }}>
        {value}
      </span>
    </>
  )
}

function PlanetTypeTag({ type, moons }) {
  const color = PLANET_TYPE_COLORS[type] ?? '#667788'
  return (
    <div className={s.planetTag} style={{
      background: `${color}18`, border: `1px solid ${color}44`, color,
    }}>
      <div className={s.planetDot} style={{ background: color }} />
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
    <div className={s.nextTier}>
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
    <div className={s.sysDetail}>
      {/* Header */}
      <div className={s.sysHeader}>
        <div className={s.starDot} style={{
          background: starColor, boxShadow: `0 0 6px ${starColor}88`,
        }} />
        <div>
          <div className={s.sysName} style={{ color: starColor }}>
            {sys.tier >= 1 ? sys.name : 'UNKNOWN SYSTEM'}
          </div>
          <div className={s.sysSubtitle}>
            {sys.star_type ?? '?'} STAR
            {sys.current ? ' · CURRENT LOCATION' : ''}
            {sys.visited && !sys.current ? ' · VISITED' : ''}
          </div>
        </div>
      </div>

      <TierBadge tier={sys.tier} />

      <SectionHead label="SCAN DATA" />
      <div className={s.scanGrid}>
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
            <div className={s.planetCount}>
              {sys.planet_count_approx}
            </div>
          )}
          {sys.tier >= 3 && (
            <div className={s.scanGrid}>
              <KvRow label="PLANETS" value={String(sys.planet_count)} />
              {sys.tier >= 4 && <KvRow label="MOONS" value={String(sys.moon_count)} />}
            </div>
          )}
        </>
      )}

      {sys.tier >= 5 && sys.planet_types?.length > 0 && (
        <>
          <SectionHead label="PLANET TYPES" />
          <div className={s.planetTypeWrap}>
            {sys.planet_types.map((p, i) => (
              <div key={i}>
                <div className={s.planetName}>
                  {p.name}
                </div>
                <PlanetTypeTag type={p.type} moons={p.moons} />
                {p.moons?.length > 0 && (
                  <div className={s.moonWrap}>
                    {p.moons.map((m, j) => (
                      <div key={j} className={s.moonTag}>
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
          <div className={s.activityBadge} style={{
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
    <div className={s.emptyWrap}>
      <div className={s.emptyIcon}>⊙</div>
      <div className={s.emptyLabel}>
        SELECT A SYSTEM
      </div>
      <div className={s.statsWrap}>
        {[
          ['SCAN POWER', `${lrsGw.toFixed(1)} GW`],
          ['TOTAL SYSTEMS', String(totalSystems)],
          ['NAMED (T1+)', String(scannedAtT1)],
          ['DETAILED (T3+)', String(scannedAtT3)],
          ['VISITED', String(visited)],
        ].map(([k, v]) => (
          <div key={k} className={s.statRow}>
            <span className={s.statLabel}>{k}</span>
            <span style={{ color: k === 'SCAN POWER' ? ACCENT : '#5588aa' }}>{v}</span>
          </div>
        ))}
      </div>
      <div className={s.tierHints}>
        {TIER_LABELS.map((l, i) => (
          <div key={i}>
            <span style={{ color: TIER_COLORS[i] }}>T{i + 1}</span>
            <span className={s.tierHintDash}> — {l}</span>
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
    <div className={s.container}>

      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>
          ⊙ LONG RANGE SCAN
        </span>
        <span className={s.headerInfo}>
          {lrsGw.toFixed(1)} GW · {systems.filter(s => s.tier >= 1).length}/{systems.length} SYSTEMS IDENTIFIED
        </span>
        <div className={s.tierLegend}>
          {TIER_COLORS.map((c, i) => (
            <span key={i} className={s.tierTag} style={{ color: c }}>
              T{i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className={s.body}>
        {/* Left: galaxy map */}
        <div className={s.mapWrap}>
          <GalaxyMap
            systems={systems}
            lrsGw={lrsGw}
            thresholds={thresholds}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Right: detail */}
        <div className={s.detailWrap}>
          {selected
            ? <SystemDetail sys={selected} lrsGw={lrsGw} thresholds={thresholds} />
            : <EmptyDetail systems={systems} lrsGw={lrsGw} />
          }
        </div>
      </div>
    </div>
  )
}

