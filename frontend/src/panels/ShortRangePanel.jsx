import { useState, useMemo } from 'react'
import { RACE_COLORS, PLANET_TYPE_COLORS } from '../shared'
import './keyframes.css'
import s from './ShortRangePanel.module.css'

// ── Theme ──────────────────────────────────────────────────────────────────────
const ACCENT  = '#44ffaa'

// ── Resource bucket helpers ────────────────────────────────────────────────────
const BUCKET_COLORS = {
  trace:     '#334444',
  low:       '#446655',
  moderate:  '#558866',
  high:      '#44aa77',
  rich:      '#44ffaa',
}
const BUCKET_PCT = { trace: 10, low: 30, moderate: 55, high: 75, rich: 95 }

// ── Radar constants ────────────────────────────────────────────────────────────
const SVG_SIZE  = 540
const CENTER    = SVG_SIZE / 2
const RADAR_R   = SVG_SIZE / 2 - 26   // usable pixel radius

// ── Tier ring definitions (for planet detection rings) ─────────────────────────
const PLANET_THRESHOLDS = [10, 5, 2, 0.5]       // T4 → T1 (inner to outer)
const RING_COLORS       = ['#00ffcc', '#00ccaa', '#008877', '#004433']
const RING_DASHES       = ['3,4', '4,7', '4,10', '3,14']

// ── Helpers ────────────────────────────────────────────────────────────────────
function auToPx(au, scale) { return au * scale }
function posToXY(pos, scale) {
  return {
    x: CENTER + (pos.x ?? 0) * scale,
    y: CENTER - (pos.z ?? 0) * scale,   // invert z for screen-y
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TierRings({ scanGw, scale }) {
  return (
    <>
      {PLANET_THRESHOLDS.map((thresh, i) => {
        const r = auToPx(scanGw / thresh, scale)
        if (r < 4 || r > RADAR_R + 60) return null
        return (
          <circle
            key={i}
            cx={CENTER} cy={CENTER} r={Math.min(r, RADAR_R + 60)}
            fill="none"
            stroke={RING_COLORS[i]}
            strokeWidth={1}
            strokeDasharray={RING_DASHES[i]}
            opacity={0.55}
          />
        )
      })}
    </>
  )
}

function OrbitRing({ planet, scale }) {
  const r = auToPx(planet.orbital_distance_au ?? planet.distance_au, scale)
  if (!r || r < 2) return null
  return (
    <circle
      cx={CENTER} cy={CENTER} r={r}
      fill="none" stroke="#0a1a10" strokeWidth={1}
    />
  )
}

function PlanetDot({ planet, scale, selected, onSelect }) {
  const { x, y } = posToXY(planet.position, scale)
  const color = planet.tier >= 1 ? (PLANET_TYPE_COLORS[planet.type] ?? '#888888') : '#334444'
  const r = 6

  return (
    <g
      onClick={() => onSelect(selected ? null : planet.id)}
      style={{ cursor: 'pointer' }}
    >
      {selected && (
        <circle cx={x} cy={y} r={r + 8} fill="none" stroke={color} strokeWidth={1} opacity={0.5} strokeDasharray="3,3" />
      )}
      <circle cx={x} cy={y} r={r} fill={color} opacity={planet.tier >= 1 ? 0.9 : 0.25} />
      {planet.orbiting && (
        <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth={1}
          style={{ animation: 'srsPulse 2s ease-in-out infinite' }} />
      )}
      {/* Inhabited triangle */}
      {planet.tier >= 2 && planet.inhabited && (
        <text x={x} y={y - r - 4} fontSize={8} fill="#ffee88" textAnchor="middle" fontFamily="Courier New">▲</text>
      )}
      {/* Name label */}
      {planet.tier >= 1 && (
        <text x={x + r + 4} y={y + 4} fontSize={8} fill={color} fontFamily="Courier New" opacity={0.85}>
          {planet.name}
        </text>
      )}
    </g>
  )
}

function ShipDot({ ship, scale, selected, onSelect }) {
  const { x, y } = posToXY(ship.position, scale)
  const color = ship.tier >= 3 ? (RACE_COLORS[ship.race] ?? '#888888') : '#667788'
  const size  = ship.tier >= 2
    ? ({ capital: 9, large: 7, medium: 5, small: 4 }[ship.size] ?? 5)
    : 5
  const pts = `${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`

  return (
    <g
      onClick={() => onSelect(selected ? null : ship.id)}
      style={{ cursor: 'pointer' }}
    >
      {selected && (
        <polygon
          points={`${x},${y - size - 5} ${x + size + 5},${y} ${x},${y + size + 5} ${x - size - 5},${y}`}
          fill="none" stroke={color} strokeWidth={1} opacity={0.5}
        />
      )}
      <polygon points={pts} fill={color} opacity={0.85} />
    </g>
  )
}

function PlayerMarker({ position, scale }) {
  const { x, y } = posToXY(position, scale)
  const s = 7
  return (
    <g>
      <line x1={x - s} y1={y} x2={x + s} y2={y} stroke={ACCENT} strokeWidth={1.5} opacity={0.9} />
      <line x1={x} y1={y - s} x2={x} y2={y + s} stroke={ACCENT} strokeWidth={1.5} opacity={0.9} />
      <circle cx={x} cy={y} r={3} fill={ACCENT} opacity={0.8} />
    </g>
  )
}

function SweepLine() {
  return (
    <g
      transform={`translate(${CENTER}, ${CENTER})`}
      style={{ transformOrigin: '0 0', animation: 'srsSweep 8s linear infinite' }}
    >
      <defs>
        <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity={0} />
          <stop offset="100%" stopColor={ACCENT} stopOpacity={0.18} />
        </linearGradient>
      </defs>
      <line x1={0} y1={0} x2={0} y2={-(RADAR_R)} stroke={ACCENT} strokeWidth={1} opacity={0.2} />
    </g>
  )
}

// ── Radar canvas ───────────────────────────────────────────────────────────────
function Radar({ scanData, ship, selectedId, onSelect }) {
  const system    = scanData?.system
  const planets   = scanData?.planets   ?? []
  const npcShips  = scanData?.npc_ships ?? []
  const scanGw    = scanData?.scan_gw   ?? 0
  const shipPos   = ship?.position ?? { x: 0, y: 0, z: 0 }
  const maxOrbit  = system?.max_orbital_distance_au ?? 10
  const scale     = RADAR_R / (maxOrbit * 1.15)

  return (
    <div className={s.radarContainer}>
      <svg
        width={SVG_SIZE} height={SVG_SIZE}
        className={s.radarSvg}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      >
        {/* Background grid */}
        <circle cx={CENTER} cy={CENTER} r={RADAR_R}      fill="none" stroke="#0a1a10" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={RADAR_R * 0.66} fill="none" stroke="#0a1a10" strokeWidth={1} opacity={0.5} />
        <circle cx={CENTER} cy={CENTER} r={RADAR_R * 0.33} fill="none" stroke="#0a1a10" strokeWidth={1} opacity={0.5} />
        <line x1={CENTER - RADAR_R} y1={CENTER} x2={CENTER + RADAR_R} y2={CENTER} stroke="#0a1a10" strokeWidth={1} />
        <line x1={CENTER} y1={CENTER - RADAR_R} x2={CENTER} y2={CENTER + RADAR_R} stroke="#0a1a10" strokeWidth={1} />

        {/* Orbit rings from current_system planet data */}
        {planets.map(p => (
          <circle
            key={`orbit-${p.id}`}
            cx={CENTER} cy={CENTER}
            r={auToPx(Math.sqrt(
              (p.position.x ** 2) + (p.position.z ** 2)
            ), scale)}
            fill="none" stroke="#0a1a10" strokeWidth={1}
          />
        ))}

        {/* Tier scan rings overlay */}
        <TierRings scanGw={scanGw} scale={scale} />

        {/* Sweep line */}
        <SweepLine />

        {/* Star */}
        <circle cx={CENTER} cy={CENTER} r={8} fill={system?.star_color ?? '#ffee88'} opacity={0.9} />
        <circle cx={CENTER} cy={CENTER} r={14} fill="none" stroke={system?.star_color ?? '#ffee88'} strokeWidth={1} opacity={0.3} />

        {/* Planet dots */}
        {planets.map(p => (
          <PlanetDot key={p.id} planet={p} scale={scale}
            selected={selectedId === p.id} onSelect={onSelect} />
        ))}

        {/* NPC ship dots */}
        {npcShips.map(s => (
          <ShipDot key={s.id} ship={s} scale={scale}
            selected={selectedId === s.id} onSelect={onSelect} />
        ))}

        {/* Player ship */}
        <PlayerMarker position={shipPos} scale={scale} />

        {/* Scale indicator */}
        <text x={CENTER + RADAR_R - 4} y={CENTER + 12}
          fontSize={8} fill="#1a4433" textAnchor="end" fontFamily="Courier New">
          {maxOrbit.toFixed(0)} AU
        </text>

        {/* Scan ring labels — tiny, top-right */}
        {scanGw > 0 && PLANET_THRESHOLDS.map((thresh, i) => {
          const r = auToPx(scanGw / thresh, scale)
          if (r < 4 || r > RADAR_R + 60) return null
          const rCapped = Math.min(r, RADAR_R)
          return (
            <text key={i}
              x={CENTER + rCapped * 0.707 + 2} y={CENTER - rCapped * 0.707 - 2}
              fontSize={7} fill={RING_COLORS[i]} fontFamily="Courier New" opacity={0.7}
            >
              T{4 - i}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function ResourceBar({ label, value }) {
  const pct = BUCKET_PCT[value] ?? 0
  const color = BUCKET_COLORS[value] ?? '#223333'
  return (
    <div className={s.resourceBarRow}>
      <span className={s.resourceLabel}>{label}</span>
      <div className={s.barTrack}>
        <div className={s.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={s.resourceBarValue} style={{ color }}>{value.toUpperCase()}</span>
    </div>
  )
}

function ResourceExact({ label, value }) {
  const pct  = Math.min(100, value)
  const color = BUCKET_COLORS[
    value < 20 ? 'trace' : value < 40 ? 'low' : value < 60 ? 'moderate' : value < 80 ? 'high' : 'rich'
  ]
  return (
    <div className={s.resourceExactRow}>
      <span className={s.resourceLabel}>{label}</span>
      <div className={s.barTrack}>
        <div className={s.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={s.resourceExactValue} style={{ color }}>{value.toFixed(1)}</span>
    </div>
  )
}

function SectionHead({ label }) {
  return (
    <div className={s.sectionHead}>
      {label}
    </div>
  )
}

function TierBadge({ tier, max = 4 }) {
  return (
    <div className={s.tierBadge}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={s.tierBar} style={{
          background: i < tier ? ACCENT : '#0a2a1a',
        }} />
      ))}
      <span className={s.tierLabel}>
        TIER {tier}/{max}
      </span>
    </div>
  )
}

function NextTierHint({ obj, scanGw, thresholds, kind }) {
  const tList = kind === 'planet' ? thresholds.planet : thresholds.ship
  const next  = tList[obj.tier]   // tier N+1 threshold (array is [T1, T2, T3, T4])
  if (obj.tier >= 4 || !next) return null
  const needed = Math.max(0, next * obj.distance_au - scanGw)
  const labels = kind === 'planet'
    ? ['planet type', 'inhabited status', 'approx resources', 'precise data']
    : ['contact', 'ship size', 'faction', 'hull health']
  return (
    <div className={s.nextTierHint}>
      <span className={s.nextTierPrefix}>NEXT TIER: </span>
      <span className={s.nextTierName}>{labels[obj.tier]}</span>
      <span className={s.nextTierNeeded}>
        {needed > 0 ? ` — +${needed.toFixed(1)} GW needed` : ' — UNLOCKING...'}
      </span>
    </div>
  )
}

function PlanetDetail({ planet, scanGw, thresholds }) {
  const color = (planet.tier >= 1 ? PLANET_TYPE_COLORS[planet.type] : null) ?? '#334444'
  return (
    <div className={s.detailContent}>
      {/* Header */}
      <div className={s.detailHeader}>
        <div className={s.planetDotIcon} style={{ background: color }} />
        <div>
          <div className={s.detailName} style={{ color }}>
            {planet.tier >= 1 ? planet.name : 'UNKNOWN'}
          </div>
          <div className={s.detailSubtitle}>
            PLANET {planet.tier >= 1 ? `· ${planet.type.toUpperCase()}` : ''}
          </div>
        </div>
      </div>

      <TierBadge tier={planet.tier} />

      <SectionHead label="SCAN DATA" />
      <div className={s.scanDataGrid}>
        {[
          ['DISTANCE', `${planet.distance_au} AU`],
          ['SIGNAL',   `${planet.signal}`],
          ...(planet.tier >= 1 ? [['MOONS', String(planet.moons ?? 0)]] : []),
        ].map(([k, v]) => (
          <>
            <span key={`k-${k}`} className={s.scanDataKey}>{k}</span>
            <span key={`v-${k}`} className={s.scanDataValue}>{v}</span>
          </>
        ))}
      </div>

      {planet.tier >= 2 && (
        <>
          <SectionHead label="POPULATION" />
          <div className={s.populationBadge} style={{
            background: planet.inhabited ? '#0a2a0a' : '#1a1a0a',
            border: `1px solid ${planet.inhabited ? '#447744' : '#334433'}`,
            color: planet.inhabited ? '#44aa44' : '#665544',
          }}>
            {planet.inhabited ? '▲ INHABITED' : '○ UNINHABITED'}
          </div>
        </>
      )}

      {planet.tier >= 3 && planet.resources_approx && (
        <>
          <SectionHead label="RESOURCES (APPROX)" />
          <ResourceBar label="Metals"       value={planet.resources_approx.metals} />
          <ResourceBar label="Rare Earth"   value={planet.resources_approx.rare_earth} />
          <ResourceBar label="Radioactive"  value={planet.resources_approx.radioactive} />
          <ResourceBar label="Hydrocarbons" value={planet.resources_approx.hydrocarbons} />
          <SectionHead label="HOSTILITY (APPROX)" />
          <ResourceBar label="Hostility" value={planet.hostility_approx} />
        </>
      )}

      {planet.tier >= 4 && planet.resources && (
        <>
          <SectionHead label="RESOURCES (PRECISE)" />
          <ResourceExact label="Metals"       value={planet.resources.metals} />
          <ResourceExact label="Rare Earth"   value={planet.resources.rare_earth} />
          <ResourceExact label="Radioactive"  value={planet.resources.radioactive} />
          <ResourceExact label="Hydrocarbons" value={planet.resources.hydrocarbons} />
          <SectionHead label="HOSTILITY (PRECISE)" />
          <ResourceExact label="Hostility" value={planet.hostility} />
        </>
      )}

      {planet.tier < 4 && (
        <NextTierHint obj={planet} scanGw={scanGw} thresholds={thresholds} kind="planet" />
      )}
    </div>
  )
}

function NpcShipDetail({ ship, scanGw, thresholds }) {
  const raceColor = ship.tier >= 3 ? (RACE_COLORS[ship.race] ?? '#667788') : '#445566'
  const SIZE_LABELS = { small: 'SMALL VESSEL', medium: 'MEDIUM VESSEL', large: 'LARGE VESSEL', capital: 'CAPITAL SHIP' }

  return (
    <div className={s.detailContent}>
      <div className={s.detailHeader}>
        <div className={s.shipTriangle} style={{ borderBottom: `14px solid ${raceColor}` }} />
        <div>
          <div className={s.detailName} style={{ color: raceColor }}>
            {ship.tier >= 3 ? ship.name : 'CONTACT'}
          </div>
          <div className={s.detailSubtitle}>
            {ship.tier >= 2 ? (SIZE_LABELS[ship.size] ?? 'VESSEL') : 'UNCLASSIFIED VESSEL'}
          </div>
        </div>
      </div>

      <TierBadge tier={ship.tier} />

      <SectionHead label="SCAN DATA" />
      <div className={s.scanDataGrid}>
        {[
          ['DISTANCE', `${ship.distance_au} AU`],
          ['SIGNAL',   `${ship.signal}`],
          ...(ship.tier >= 2 ? [['CLASS', (ship.size ?? '—').toUpperCase()]] : []),
          ...(ship.tier >= 3 ? [['FACTION', ship.race ?? '—']] : []),
        ].map(([k, v]) => (
          <>
            <span key={`k-${k}`} className={s.scanDataKey}>{k}</span>
            <span key={`v-${k}`} className={s.scanDataValue} style={{ color: raceColor }}>{v}</span>
          </>
        ))}
      </div>

      {ship.tier >= 3 && (
        <>
          <SectionHead label="FACTION" />
          <div className={s.factionBadge} style={{
            background: `${raceColor}18`, border: `1px solid ${raceColor}44`, color: raceColor,
          }}>
            {ship.race}
          </div>
        </>
      )}

      {ship.tier >= 4 && ship.hull_health != null && (
        <>
          <SectionHead label="HULL INTEGRITY" />
          <div className={s.hullBarGrid}>
            <div className={s.hullTrack}>
              <div className={s.hullFill} style={{
                width: `${Math.max(0, ship.hull_health)}%`,
                background: ship.hull_health > 60 ? '#44aa55'
                  : ship.hull_health > 30 ? '#aaaa44' : '#aa4444',
              }} />
            </div>
            <span className={s.hullValue}>
              {ship.hull_health.toFixed(0)}%
            </span>
          </div>
        </>
      )}

      {ship.tier < 4 && (
        <NextTierHint obj={ship} scanGw={scanGw} thresholds={thresholds} kind="ship" />
      )}
    </div>
  )
}

function EmptyDetail({ scanGw, planetCount, shipCount }) {
  return (
    <div className={s.emptyDetail}>
      <div className={s.emptyIcon}>◎</div>
      <div className={s.emptyTitle}>
        SELECT AN OBJECT
      </div>
      <div className={s.emptyStats}>
        <div className={s.emptyStatRow}>
          <span className={s.emptyStatLabel}>PLANETS DETECTED</span>
          <span className={s.emptyStatValue}>{planetCount}</span>
        </div>
        <div className={s.emptyStatRow}>
          <span className={s.emptyStatLabel}>SHIPS DETECTED</span>
          <span className={s.emptyStatValue}>{shipCount}</span>
        </div>
        <div className={s.emptyStatRow} style={{ marginTop: 4 }}>
          <span className={s.emptyStatLabel}>SCAN POWER</span>
          <span className={s.emptyStatAccent}>{scanGw.toFixed(1)} GW</span>
        </div>
      </div>
      <div className={s.emptyLegend}>
        ◆ = NPC SHIP &nbsp;&nbsp; ● = PLANET<br />
        ✛ = PLAYER SHIP
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function ShortRangePanel({ gameState, sendCommand }) {
  const [selectedId, setSelectedId] = useState(null)

  const scan       = gameState?.short_range_scan ?? {}
  const ship       = gameState?.ship
  const scanGw     = scan.scan_gw    ?? 0
  const planets    = scan.planets    ?? []
  const npcShips   = scan.npc_ships  ?? []
  const system     = scan.system
  const thresholds = scan.thresholds ?? { planet: [0.5, 2, 5, 10], ship: [1, 3, 7, 15] }

  const allObjects = useMemo(() => [...planets, ...npcShips], [planets, npcShips])
  const selected   = useMemo(() => allObjects.find(o => o.id === selectedId) ?? null, [allObjects, selectedId])

  function handleSelect(id) {
    setSelectedId(id)
  }

  return (
    <div className={s.container}>

      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>
          ◎ SHORT RANGE SCAN
        </span>
        <span className={s.headerGw}>
          {scanGw.toFixed(1)} GW
        </span>
        {system && (
          <span className={s.headerSystem}>
            · {system.name} ({system.star_type} STAR)
          </span>
        )}
        <div className={s.headerLegend}>
          {[['◆', 'NPC SHIP', '#667788'], ['●', 'PLANET', '#1a4433'], ['✛', 'PLAYER', ACCENT]].map(([sym, lbl, col]) => (
            <span key={lbl} className={s.legendItem} style={{ color: col }}>
              {sym} {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Body: radar left, detail right */}
      <div className={s.body}>

        {/* Left: radar */}
        <div className={s.radarPane}>
          <Radar
            scanData={scan}
            ship={ship}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Right: detail */}
        <div className={s.detailPane}>
          {selected
            ? selected.kind === 'planet'
              ? <PlanetDetail planet={selected} scanGw={scanGw} thresholds={thresholds} />
              : <NpcShipDetail ship={selected} scanGw={scanGw} thresholds={thresholds} />
            : <EmptyDetail
                scanGw={scanGw}
                planetCount={planets.length}
                shipCount={npcShips.length}
              />
          }
        </div>
      </div>
    </div>
  )
}

