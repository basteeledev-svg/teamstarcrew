import { useState, useMemo } from 'react'

// ── Theme ──────────────────────────────────────────────────────────────────────
const BG      = '#070714'
const CARD    = '#09091c'
const ACCENT  = '#44ffaa'
const MUTED   = '#1a4433'
const DIM     = '#0d2d22'

// ── Injected keyframes ─────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes srsSweep {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes srsPulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1.0; }
  }
`

// ── Planet type colours ────────────────────────────────────────────────────────
const PLANET_COLORS = {
  'Barren/Rocky':    '#996655',
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

// ── Faction colours ────────────────────────────────────────────────────────────
const RACE_COLORS = {
  'Human':      '#4488ff',
  'Ssysrian':   '#44ff88',
  'Unitarian':  '#ffcc44',
  'Fulborg':    '#ff4455',
  'Klackin':    '#cc44ff',
}

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
  const color = planet.tier >= 1 ? (PLANET_COLORS[planet.type] ?? '#888888') : '#334444'
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
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <svg
        width={SVG_SIZE} height={SVG_SIZE}
        style={{ background: '#020a06', display: 'block' }}
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
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: '#557766', fontFamily: 'Courier New', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ height: 6, background: '#0a1a10', borderRadius: 2 }}>
        <div style={{ height: 6, width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'Courier New', letterSpacing: 1 }}>{value.toUpperCase()}</span>
    </div>
  )
}

function ResourceExact({ label, value }) {
  const pct  = Math.min(100, value)
  const color = BUCKET_COLORS[
    value < 20 ? 'trace' : value < 40 ? 'low' : value < 60 ? 'moderate' : value < 80 ? 'high' : 'rich'
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 44px', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 9, color: '#557766', fontFamily: 'Courier New', letterSpacing: 0.5 }}>{label}</span>
      <div style={{ height: 6, background: '#0a1a10', borderRadius: 2 }}>
        <div style={{ height: 6, width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color, fontFamily: 'Courier New', textAlign: 'right' }}>{value.toFixed(1)}</span>
    </div>
  )
}

function SectionHead({ label }) {
  return (
    <div style={{ fontSize: 8, letterSpacing: 2, color: MUTED, fontFamily: 'Courier New', marginBottom: 8, marginTop: 14, borderBottom: '1px solid #0a2a1a', paddingBottom: 4 }}>
      {label}
    </div>
  )
}

function TierBadge({ tier, max = 4 }) {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 22, height: 4, borderRadius: 1,
          background: i < tier ? ACCENT : '#0a2a1a',
        }} />
      ))}
      <span style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New', marginLeft: 4, lineHeight: '4px' }}>
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
    <div style={{ marginTop: 10, padding: '8px 10px', background: '#040d08', border: '1px solid #0a2a1a', fontSize: 9, fontFamily: 'Courier New' }}>
      <span style={{ color: MUTED }}>NEXT TIER: </span>
      <span style={{ color: '#447766' }}>{labels[obj.tier]}</span>
      <span style={{ color: '#224433' }}>
        {needed > 0 ? ` — +${needed.toFixed(1)} GW needed` : ' — UNLOCKING...'}
      </span>
    </div>
  )
}

function PlanetDetail({ planet, scanGw, thresholds }) {
  const color = (planet.tier >= 1 ? PLANET_COLORS[planet.type] : null) ?? '#334444'
  return (
    <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, color, fontFamily: 'Courier New', letterSpacing: 1 }}>
            {planet.tier >= 1 ? planet.name : 'UNKNOWN'}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1, marginTop: 2 }}>
            PLANET {planet.tier >= 1 ? `· ${planet.type.toUpperCase()}` : ''}
          </div>
        </div>
      </div>

      <TierBadge tier={planet.tier} />

      <SectionHead label="SCAN DATA" />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: 8 }}>
        {[
          ['DISTANCE', `${planet.distance_au} AU`],
          ['SIGNAL',   `${planet.signal}`],
          ...(planet.tier >= 1 ? [['MOONS', String(planet.moons ?? 0)]] : []),
        ].map(([k, v]) => (
          <>
            <span key={`k-${k}`} style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1 }}>{k}</span>
            <span key={`v-${k}`} style={{ fontSize: 9, color: '#668877', fontFamily: 'Courier New' }}>{v}</span>
          </>
        ))}
      </div>

      {planet.tier >= 2 && (
        <>
          <SectionHead label="POPULATION" />
          <div style={{
            display: 'inline-block', padding: '3px 10px', fontSize: 9, fontFamily: 'Courier New', letterSpacing: 2,
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
    <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 0, height: 0,
          borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
          borderBottom: `14px solid ${raceColor}`, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, color: raceColor, fontFamily: 'Courier New', letterSpacing: 1 }}>
            {ship.tier >= 3 ? ship.name : 'CONTACT'}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1, marginTop: 2 }}>
            {ship.tier >= 2 ? (SIZE_LABELS[ship.size] ?? 'VESSEL') : 'UNCLASSIFIED VESSEL'}
          </div>
        </div>
      </div>

      <TierBadge tier={ship.tier} />

      <SectionHead label="SCAN DATA" />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginBottom: 8 }}>
        {[
          ['DISTANCE', `${ship.distance_au} AU`],
          ['SIGNAL',   `${ship.signal}`],
          ...(ship.tier >= 2 ? [['CLASS', (ship.size ?? '—').toUpperCase()]] : []),
          ...(ship.tier >= 3 ? [['FACTION', ship.race ?? '—']] : []),
        ].map(([k, v]) => (
          <>
            <span key={`k-${k}`} style={{ fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1 }}>{k}</span>
            <span key={`v-${k}`} style={{ fontSize: 9, color: raceColor, fontFamily: 'Courier New' }}>{v}</span>
          </>
        ))}
      </div>

      {ship.tier >= 3 && (
        <>
          <SectionHead label="FACTION" />
          <div style={{
            display: 'inline-block', padding: '4px 12px', fontSize: 10, fontFamily: 'Courier New', letterSpacing: 2,
            background: `${raceColor}18`, border: `1px solid ${raceColor}44`, color: raceColor,
          }}>
            {ship.race}
          </div>
        </>
      )}

      {ship.tier >= 4 && ship.hull_health != null && (
        <>
          <SectionHead label="HULL INTEGRITY" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 46px', alignItems: 'center', gap: 8 }}>
            <div style={{ height: 8, background: '#0a1a10', borderRadius: 2 }}>
              <div style={{
                height: 8, borderRadius: 2,
                width: `${Math.max(0, ship.hull_health)}%`,
                background: ship.hull_health > 60 ? '#44aa55'
                  : ship.hull_health > 30 ? '#aaaa44' : '#aa4444',
              }} />
            </div>
            <span style={{ fontSize: 10, color: '#668877', fontFamily: 'Courier New', textAlign: 'right' }}>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
      <div style={{ fontSize: 42, opacity: 0.08, color: ACCENT }}>◎</div>
      <div style={{ color: MUTED, fontSize: 10, letterSpacing: 3, fontFamily: 'Courier New' }}>
        SELECT AN OBJECT
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, width: '100%', maxWidth: 220 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Courier New' }}>
          <span style={{ color: MUTED }}>PLANETS DETECTED</span>
          <span style={{ color: '#668877' }}>{planetCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Courier New' }}>
          <span style={{ color: MUTED }}>SHIPS DETECTED</span>
          <span style={{ color: '#668877' }}>{shipCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Courier New', marginTop: 4 }}>
          <span style={{ color: MUTED }}>SCAN POWER</span>
          <span style={{ color: ACCENT }}>{scanGw.toFixed(1)} GW</span>
        </div>
      </div>
      <div style={{ fontSize: 8, color: '#0a3020', fontFamily: 'Courier New', letterSpacing: 1, textAlign: 'center', marginTop: 4 }}>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* Header */}
      <div style={{
        padding: '7px 14px', borderBottom: '1px solid #0a2a1a',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 3, fontFamily: 'Courier New', color: ACCENT, fontWeight: 'bold' }}>
          ◎ SHORT RANGE SCAN
        </span>
        <span style={{ fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New', color: MUTED }}>
          {scanGw.toFixed(1)} GW
        </span>
        {system && (
          <span style={{ fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New', color: '#2a5a3a' }}>
            · {system.name} ({system.star_type} STAR)
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {[['◆', 'NPC SHIP', '#667788'], ['●', 'PLANET', MUTED], ['✛', 'PLAYER', ACCENT]].map(([sym, lbl, col]) => (
            <span key={lbl} style={{ fontSize: 8, fontFamily: 'Courier New', color: col, letterSpacing: 1 }}>
              {sym} {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Body: radar left, detail right */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: radar */}
        <div style={{ flexShrink: 0, borderRight: '1px solid #0a2a1a', overflow: 'hidden' }}>
          <Radar
            scanData={scan}
            ship={ship}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#050d08' }}>
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

