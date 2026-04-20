import { useEffect, useRef, useState } from 'react'
import { Btn, IconBtn } from '../components/ui'

const STAR_RADIUS = 10

function drawShipTriangle(ctx, x, y, dir, size = 7) {
  // dir is a {x,z} unit vector (y ignored in 2D top-down)
  const angle = Math.atan2(dir.z ?? dir.y ?? 0, dir.x)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.6, size * 0.5)
  ctx.lineTo(-size * 0.6, -size * 0.5)
  ctx.closePath()
  ctx.fillStyle = '#00ffcc'
  ctx.fill()
  ctx.restore()
}

export default function SystemView({ gameState, sendCommand }) {
  const canvasRef   = useRef(null)
  const planetHits  = useRef([])   // [{planet, cx, cy, r}] — updated each draw
  const [zoom, setZoom]           = useState(1.0)
  const [selectedPlanetId, setSelectedId] = useState(null)

  const ship    = gameState?.ship
  const planets = gameState?.current_system?.planets ?? []

  // Always derive the planet from the live state so stockpile/health stay current
  const selectedPlanet = planets.find(p => p.id === selectedPlanetId) ?? null

  // Find nearest planet and whether we're within orbit range
  const nearbyPlanet = (() => {
    if (!ship) return null
    let best = null, bestDist = Infinity
    for (const p of planets) {
      const dx = ship.position.x - p.position.x
      const dz = ship.position.z - (p.position.z ?? 0)
      const d  = Math.sqrt(dx * dx + dz * dz)
      if (d < bestDist) { bestDist = d; best = { planet: p, dist: d } }
    }
    return best && best.dist <= 0.5 ? best.planet : null
  })()

  const orbitingPlanet = ship?.orbiting_planet_id
    ? planets.find(p => p.id === ship.orbiting_planet_id) ?? null
    : null

  // Auto-open the planet panel when the ship enters orbit
  useEffect(() => {
    if (orbitingPlanet) setSelectedId(orbitingPlanet.id)
  }, [orbitingPlanet?.id])

  useEffect(() => {
    if (!gameState?.current_system || !gameState?.ship) return
    const canvas  = canvasRef.current
    const ctx     = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const system  = gameState.current_system
    const shipPos = ship.position
    const planets = system.planets ?? []

    // Dynamic scale based on zoom only — base scale = 30 AU fills half the canvas
    const BASE_AU = 30
    const scale = ((Math.min(width, height) / 2 - 20) / BASE_AU) * zoom

    // Ship is always centred; everything else is offset relative to it
    const cx = width  / 2
    const cy = height / 2
    // Star pixel position (star is at 0,0,0 AU)
    const starPx = cx - shipPos.x * scale
    const starPy = cy - shipPos.z * scale

    // Star
    ctx.beginPath()
    ctx.arc(starPx, starPy, STAR_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = system.star_color ?? '#ffee88'
    ctx.shadowColor = system.star_color ?? '#ffee88'
    ctx.shadowBlur  = 18
    ctx.fill()
    ctx.shadowBlur  = 0

    // Rebuild hit list
    planetHits.current = []

    // Planets
    for (const planet of planets) {
      const px = starPx + planet.position.x * scale
      const py = starPy + planet.position.z * scale
      const r  = planet.type.includes('Giant') ? 7 : 4
      const isSelected = planet.id === selectedPlanetId

      // Orbit ring (centred on star)
      const orbitR = planet.orbital_distance_au * scale
      ctx.beginPath()
      ctx.arc(starPx, starPy, orbitR, 0, Math.PI * 2)
      ctx.strokeStyle = isSelected ? 'rgba(0,255,200,0.25)' : 'rgba(150,150,200,0.15)'
      ctx.lineWidth = isSelected ? 1.5 : 1
      ctx.stroke()

      // Planet dot
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = planetColor(planet.type)
      ctx.fill()

      // Selection ring
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(px, py, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#00ffcc'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Name label
      ctx.fillStyle = isSelected ? '#00ffcc' : '#8899bb'
      ctx.font = isSelected ? 'bold 9px Courier New' : '8px Courier New'
      ctx.fillText(planet.name.split('-').pop(), px + r + 2, py + 3)

      // Store for hit-testing (use r+6 hit radius for easier clicking)
      planetHits.current.push({ planet, px, py, r: r + 6 })
    }

    // Ship is always at canvas centre
    const sx = cx
    const sy = cy

    if (orbitingPlanet) {
      // Draw the orbit path around the planet
      const opx = starPx + orbitingPlanet.position.x * scale
      const opy = starPy + orbitingPlanet.position.z * scale
      const orbitPxR = (ship.orbit_radius_au ?? 0.1) * scale
      ctx.beginPath()
      ctx.arc(opx, opy, orbitPxR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,255,200,0.3)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
      // Ship as small glowing dot while in orbit
      ctx.beginPath()
      ctx.arc(sx, sy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#00ffcc'
      ctx.shadowColor = '#00ffcc'
      ctx.shadowBlur = 8
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      drawShipTriangle(ctx, sx, sy, ship.direction)
    }

    // 0.5 AU proximity ring around nearby planet (if not already orbiting)
    if (nearbyPlanet && !orbitingPlanet) {
      const npx = starPx + nearbyPlanet.position.x * scale
      const npy = starPy + nearbyPlanet.position.z * scale
      ctx.beginPath()
      ctx.arc(npx, npy, 0.5 * scale, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,200,0,0.35)'
      ctx.setLineDash([3, 5])
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Scale indicator
    ctx.fillStyle = '#445566'
    ctx.font = '9px Courier New'
    ctx.fillText(`Zoom: ${zoom.toFixed(1)}×  (1px ≈ ${(1 / scale).toFixed(3)} AU)`, 6, height - 6)

  }, [gameState, zoom, selectedPlanetId, nearbyPlanet, orbitingPlanet])

  function handleCanvasClick(e) {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    // Account for CSS scaling (canvas is 460px wide but may be displayed differently)
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY

    let hit = null
    let best = Infinity
    for (const h of planetHits.current) {
      const d = Math.sqrt((mx - h.px) ** 2 + (my - h.py) ** 2)
      if (d <= h.r && d < best) { best = d; hit = h.planet }
    }
    setSelectedId(hit?.id === selectedPlanetId ? null : hit?.id ?? null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={460}
        height={320}
        onClick={handleCanvasClick}
        style={{ background: 'var(--bg-label)', border: '1px solid var(--border)', display: 'block', cursor: 'crosshair' }}
      />
      {/* Zoom controls — overlaid bottom-right */}
      <div style={{
        position: 'absolute', bottom: '8px', right: '8px',
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(5,5,16,0.75)', padding: '4px 8px',
        border: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-secondary)',
      }}>
        <IconBtn onClick={() => setZoom(z => Math.max(0.25, +(z / 1.5).toFixed(2)))}>−</IconBtn>
        <span style={{ minWidth: '48px', textAlign: 'center', color: 'var(--text-body)' }}>
          {zoom.toFixed(1)}× ZOOM
        </span>
        <IconBtn onClick={() => setZoom(z => Math.min(20, +(z * 1.5).toFixed(2)))}>+</IconBtn>
        <IconBtn onClick={() => setZoom(1.0)} style={{ marginLeft: '4px', color: 'var(--text-secondary)' }}>FIT</IconBtn>
      </div>

      {/* Planet info panel */}
      {selectedPlanet && (
        <PlanetPanel
          planet={selectedPlanet}
          shipPos={ship?.position}
          ship={ship}
          sendCommand={sendCommand}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Orbit action bar — bottom-centre */}
      {orbitingPlanet && (
        <div style={orbitBarStyle}>
          <span style={{ color: '#00ffcc' }}>⊙ IN ORBIT: {orbitingPlanet.name.split('-').pop()}</span>
          <Btn
            onClick={() => sendCommand({ type: 'leave_orbit' })}
            bg="#550011" color="var(--text-bright)" borderColor="var(--border)"
          >LEAVE ORBIT</Btn>
        </div>
      )}
      {!orbitingPlanet && nearbyPlanet && (
        <div style={orbitBarStyle}>
          <span style={{ color: '#ffcc00' }}>◎ {nearbyPlanet.name.split('-').pop()} within range</span>
          <Btn
            onClick={() => sendCommand({ type: 'orbit', planet_id: nearbyPlanet.id })}
            bg="#003322" color="var(--text-bright)" borderColor="var(--border)"
          >ORBIT PLANET</Btn>
        </div>
      )}
    </div>
  )
}

function PlanetPanel({ planet, shipPos, ship, sendCommand, onClose }) {
  const distAU = shipPos ? Math.sqrt(
    (shipPos.x - planet.position.x) ** 2 +
    (shipPos.y - (planet.position.y ?? 0)) ** 2 +
    (shipPos.z - (planet.position.z ?? 0)) ** 2
  ).toFixed(2) : null

  const res = [
    { label: 'Metals',       key: 'metals',       richness: planet.metals,       stockpile: planet.stockpile?.metals       ?? 0 },
    { label: 'Rare Earth',   key: 'rare_earth',   richness: planet.rare_earth,   stockpile: planet.stockpile?.rare_earth   ?? 0 },
    { label: 'Radioactive',  key: 'radioactive',  richness: planet.radioactive,  stockpile: planet.stockpile?.radioactive  ?? 0 },
    { label: 'Hydrocarbons', key: 'hydrocarbons', richness: planet.hydrocarbons, stockpile: planet.stockpile?.hydrocarbons ?? 0 },
  ]
  return (
    <div style={{
      position: 'absolute', top: '8px', left: '8px',
      background: 'rgba(4,4,18,0.93)', border: '1px solid var(--border)',
      padding: '10px 12px', minWidth: '210px', fontSize: '11px',
      fontFamily: 'var(--font-mono)', maxHeight: '310px', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: '#00ffcc', letterSpacing: '1px' }}>{planet.name.split('-').pop()}</span>
        <IconBtn onClick={onClose} style={{ fontSize: '11px' }}>✕</IconBtn>
      </div>

      <Row label="TYPE"      value={planet.type} />
      <Row label="ORBIT"     value={`${planet.orbital_distance_au.toFixed(2)} AU`} />
      {distAU !== null && <Row label="DISTANCE" value={`${distAU} AU`} valueColor="#ffcc44" />}
      <Row label="HOSTILITY" value={<Bar value={planet.total_hostility} color='var(--accent-red)' />} />
      {planet.inhabited && <Row label="INHABITED" value="YES" valueColor="#ffcc00" />}

      <div style={{ margin: '8px 0 4px', color: 'var(--text-ghost)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
        RESOURCES &amp; STOCKPILE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 46px', gap: '2px 6px', alignItems: 'center', marginBottom: '2px' }}>
        <span style={{ color: 'var(--text-ghost)' }}></span>
        <span style={{ color: 'var(--text-ghost)', fontSize: '9px' }}>RICHNESS</span>
        <span style={{ color: 'var(--text-ghost)', fontSize: '9px', textAlign: 'right' }}>STORED</span>
      </div>
      {res.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 46px', gap: '2px 6px', alignItems: 'center', marginBottom: '3px' }}>
          <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
          <Bar value={r.richness} color='var(--accent)' />
          <span style={{ color: 'var(--text-secondary)', fontSize: '10px', textAlign: 'right' }}>
            {r.stockpile.toFixed(1)}
          </span>
        </div>
      ))}

      {planet.moons?.length > 0 && (
        <>
          <div style={{ margin: '8px 0 4px', color: 'var(--text-ghost)', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
            MOONS ({planet.moons.length})
          </div>
          {planet.moons.map(m => (
            <div key={m.id} style={{ color: 'var(--text-secondary)', fontSize: '10px', paddingLeft: '4px' }}>
              · {m.name.split('-').pop()} <span style={{ color: 'var(--text-ghost)' }}>({m.type})</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function Row({ label, value, valueColor = 'var(--text-primary)' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
      <span style={{ color: 'var(--text-muted)', marginRight: '8px', flexShrink: 0 }}>{label}</span>
      <span style={{ color: valueColor, flex: 1, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Bar({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ width: '80px', height: '6px', background: 'var(--bg-base)', border: '1px solid var(--border-faint)' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-body)' }}>{Math.round(value)}</span>
    </div>
  )
}

function planetColor(type) {
  const map = {
    'Terrestrial': '#4488ff',
    'Ocean World': '#2255dd',
    'Jungle/Lush': '#33aa55',
    'Desert/Arid': '#cc8833',
    'Gas Giant':   '#bb6622',
    'Ice Giant':   '#5588bb',
    'Ice World':   '#aaccee',
    'Volcanic/Magma': '#ff3300',
    'Irradiated':  '#aaff00',
    'Toxic/Corrosive': '#88ff44',
    'Crystalline': '#cc88ff',
    'Barren/Rocky': '#778899',
    'Super-Earth': '#5566ff',
    'Tidally Locked': '#997755',
    'Rogue/Dark':  '#334455',
  }
  return map[type] ?? '#aaaaaa'
}


const orbitBarStyle = {
  position: 'absolute', bottom: '40px', left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: '12px',
  background: 'rgba(4,4,18,0.88)', border: '1px solid var(--border)',
  padding: '6px 14px', fontSize: '11px', fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
}


