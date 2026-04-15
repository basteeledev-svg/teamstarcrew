import { useEffect, useRef, useState, useMemo } from 'react'

const STAR_RADIUS = 10
const COMPASS_R   = 56

// Warp cost formula (mirrors backend constants)
const WARP_COST_BASE     = 100.0
const WARP_COST_EXPONENT = 1.3

const RACE_COLORS = {
  'Human':     '#4488ff',
  'Ssysrian':  '#44ff88',
  'Unitarian': '#ffcc44',
  'Fulborg':   '#ff4455',
  'Klackin':   '#cc44ff',
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function NavigationPanel({ gameState, sendCommand }) {
  const canvasRef  = useRef(null)
  const compassRef = useRef(null)
  const planetHits = useRef([])
  const npcHits    = useRef([])   // [{ship, px, py}]

  const [zoom,          setZoom]       = useState(1.0)
  const [selectedId,    setSelectedId] = useState(null)
  const [directHeading, setDirectHdg]  = useState('')
  const [rightTab,      setRightTab]   = useState('CONTROLS')    // 'CONTROLS' | 'WARP'
  const [warpTargetId,  setWarpTarget]  = useState(null)
  const [npcSelected,   setNpcSelected] = useState(null)         // selected NPC ship on map

  const ship    = gameState?.ship
  const planets = gameState?.current_system?.planets ?? []
  const system  = gameState?.current_system
  const npcShips = gameState?.short_range_scan?.npc_ships ?? []

  // Galaxy systems list for warp tab, sorted by distance
  const galaxySystems = useMemo(() => {
    const systems = gameState?.galaxy_systems ?? []
    const currentId = gameState?.ship?.current_system_id
    return [...systems]
      .filter(s => s.id !== currentId)
      .sort((a, b) => (a.distance_ly ?? 0) - (b.distance_ly ?? 0))
  }, [gameState?.galaxy_systems, gameState?.ship?.current_system_id])

  // Selected warp target details
  const warpTarget = useMemo(() => {
    if (!warpTargetId) return null
    const s = gameState?.galaxy_systems?.find(g => g.id === warpTargetId)
    if (!s) return null
    const dist = s.distance_ly ?? 0
    const cost = WARP_COST_BASE * (dist ** WARP_COST_EXPONENT)
    const charge = gameState?.ship?.warp_capacitor_gw ?? 0
    return { ...s, cost: Math.round(cost), charge: Math.round(charge), canWarp: charge >= cost, dist }
  }, [warpTargetId, gameState])

  const engaged     = (ship?.thrust ?? 0) > 0
  const engineSpeed = ship?.engine_thrust_au ?? 0

  const selectedPlanet = planets.find(p => p.id === selectedId) ?? null

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

  useEffect(() => {
    if (orbitingPlanet) setSelectedId(orbitingPlanet.id)
  }, [orbitingPlanet?.id])

  // ── System map draw ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!system || !ship) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const BASE_AU = 30
    const scale   = ((Math.min(W, H) / 2 - 16) / BASE_AU) * zoom
    const cx = W / 2, cy = H / 2
    const starPx = cx - ship.position.x * scale
    const starPy = cy - ship.position.z * scale

    // Star
    ctx.beginPath()
    ctx.arc(starPx, starPy, STAR_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle   = system.star_color ?? '#ffee88'
    ctx.shadowColor = system.star_color ?? '#ffee88'
    ctx.shadowBlur  = 18
    ctx.fill()
    ctx.shadowBlur = 0

    planetHits.current = []

    for (const planet of planets) {
      const px = starPx + planet.position.x * scale
      const py = starPy + planet.position.z * scale
      const r  = planet.type.includes('Giant') ? 7 : 4
      const isSel = planet.id === selectedId

      // Orbit ring
      ctx.beginPath()
      ctx.arc(starPx, starPy, planet.orbital_distance_au * scale, 0, Math.PI * 2)
      ctx.strokeStyle = isSel ? 'rgba(0,255,200,0.25)' : 'rgba(150,150,200,0.12)'
      ctx.lineWidth   = isSel ? 1.5 : 1
      ctx.stroke()

      // Planet dot
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fillStyle = planetColor(planet.type)
      ctx.fill()

      if (isSel) {
        ctx.beginPath()
        ctx.arc(px, py, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#00ffcc'
        ctx.lineWidth   = 1.5
        ctx.stroke()
      }

      // Label
      ctx.fillStyle = isSel ? '#00ffcc' : '#8899bb'
      ctx.font      = isSel ? 'bold 9px Courier New' : '8px Courier New'
      ctx.fillText(planet.name.split('-').pop(), px + r + 2, py + 3)

      planetHits.current.push({ planet, px, py, r: r + 6 })
    }

    // Nearby planet proximity ring
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

    // Orbiting ship: dashed orbit ring + glowing dot
    if (orbitingPlanet) {
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
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fillStyle   = '#00ffcc'
      ctx.shadowColor = '#00ffcc'
      ctx.shadowBlur  = 8
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      drawShipTriangle(ctx, cx, cy, ship.direction)
    }

    // Heading vector line from ship
    if (!orbitingPlanet && ship.direction) {
      const d = ship.direction
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + d.x * 30, cy + d.z * 30)
      ctx.strokeStyle = 'rgba(0,255,204,0.25)'
      ctx.lineWidth   = 1
      ctx.stroke()
      // Target direction
      const td = ship.target_direction
      if (td) {
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + td.x * 30, cy + td.z * 30)
        ctx.strokeStyle = 'rgba(0,200,160,0.12)'
        ctx.setLineDash([3, 4])
        ctx.lineWidth   = 1
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // NPC ships from short-range scan (tier >= 1 → visible on map)
    const visibleNpcs = npcShips.filter(s => s.tier >= 1)
    npcHits.current = []
    for (const npc of visibleNpcs) {
      if (!npc.position) continue
      const nx = starPx + npc.position.x * scale
      const ny = starPy + (npc.position.z ?? 0) * scale
      const color = RACE_COLORS[npc.race] ?? '#aaaaaa'
      const isSel = npcSelected?.id === npc.id

      // Diamond shape (rotated square)
      const hs = isSel ? 7 : 5
      ctx.save()
      ctx.translate(nx, ny)
      ctx.rotate(Math.PI / 4)
      ctx.beginPath()
      ctx.rect(-hs / 2, -hs / 2, hs, hs)
      ctx.fillStyle   = color
      ctx.globalAlpha = 0.85
      ctx.fill()
      if (isSel) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth   = 1
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.restore()

      npcHits.current.push({ ship: npc, px: nx, py: ny })
    }

    // Scale hint
    ctx.fillStyle = '#445566'
    ctx.font = '8px Courier New'
    ctx.fillText(`${zoom.toFixed(1)}×  1px≈${(1 / scale).toFixed(3)} AU`, 5, H - 5)
  }, [gameState, zoom, selectedId, nearbyPlanet, orbitingPlanet, npcSelected, npcShips])

  // ── Compass draw ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = compassRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = COMPASS_R, cy = COMPASS_R
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.beginPath()
    ctx.arc(cx, cy, COMPASS_R - 2, 0, Math.PI * 2)
    ctx.strokeStyle = '#335'
    ctx.lineWidth   = 1.5
    ctx.stroke()

    ctx.strokeStyle = '#223'
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(cx, cy - COMPASS_R + 2); ctx.lineTo(cx, cy + COMPASS_R - 2)
    ctx.moveTo(cx - COMPASS_R + 2, cy); ctx.lineTo(cx + COMPASS_R - 2, cy)
    ctx.stroke()

    ctx.fillStyle = '#557'
    ctx.font = '8px Courier New'
    ctx.fillText('N', cx - 3, cy - COMPASS_R + 12)
    ctx.fillText('S', cx - 3, cy + COMPASS_R - 4)
    ctx.fillText('E', cx + COMPASS_R - 10, cy + 3)
    ctx.fillText('W', cx - COMPASS_R + 3, cy + 3)

    const dir = ship?.direction
    if (dir) {
      const dx = cx + dir.x * (COMPASS_R - 10)
      const dy = cy + dir.z * (COMPASS_R - 10)
      // Heading line
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(dx, dy)
      ctx.strokeStyle = '#00ffcc'
      ctx.lineWidth   = 1.5
      ctx.stroke()
      // Arrowhead dot
      ctx.beginPath()
      ctx.arc(dx, dy, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#00ffcc'
      ctx.fill()
    }

    const td = ship?.target_direction
    if (td) {
      const tx = cx + td.x * (COMPASS_R - 10)
      const ty = cy + td.z * (COMPASS_R - 10)
      ctx.beginPath()
      ctx.arc(tx, ty, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,220,180,0.4)'
      ctx.fill()
    }
  }, [ship?.direction, ship?.target_direction])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleCanvasClick(e) {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top)  * scaleY

    // Check NPC ships first (smaller → higher priority)
    let npcHit = null, npcBest = 10
    for (const h of npcHits.current) {
      const d = Math.sqrt((mx - h.px) ** 2 + (my - h.py) ** 2)
      if (d <= 10 && d < npcBest) { npcBest = d; npcHit = h.ship }
    }
    if (npcHit) {
      setNpcSelected(prev => prev?.id === npcHit.id ? null : npcHit)
      setSelectedId(null)
      return
    }

    // Check planets
    let hit = null, best = Infinity
    for (const h of planetHits.current) {
      const d = Math.sqrt((mx - h.px) ** 2 + (my - h.py) ** 2)
      if (d <= h.r && d < best) { best = d; hit = h.planet }
    }
    setSelectedId(hit?.id === selectedId ? null : hit?.id ?? null)
    setNpcSelected(null)
  }

  function handleCompassClick(e) {
    const canvas = compassRef.current
    const rect   = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left - COMPASS_R
    const my = e.clientY - rect.top  - COMPASS_R
    const mag = Math.sqrt(mx * mx + my * my) || 1
    sendCommand({ type: 'set_target_direction', x: mx / mag, y: 0, z: my / mag })
  }

  function handleDirectHeadingSet() {
    const deg = parseFloat(directHeading)
    if (isNaN(deg)) return
    const rad = (((deg % 360) + 360) % 360) * Math.PI / 180
    sendCommand({ type: 'set_target_direction', x: Math.sin(rad), y: 0, z: Math.cos(rad) })
  }

  const isRunning = gameState?.status === 'running'
  const pos = ship?.position

  // Current heading in degrees (clockwise from N/+Z)
  const dir = ship?.direction
  const headingDeg = dir ? ((Math.atan2(dir.x, dir.z) * 180 / Math.PI + 360) % 360).toFixed(1) : '—'

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', background: '#070714', fontFamily: 'Courier New', overflow: 'hidden' }}>

      {/* Left column — system map */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', borderRight: '1px solid #0d0d22' }}>
        {/* System name bar */}
        <div style={{ padding: '5px 10px', background: '#050510', borderBottom: '1px solid #0d0d22', fontSize: '10px', color: '#445577', letterSpacing: '2px', flexShrink: 0 }}>
          {system ? `⊙ ${system.name}  ·  ${system.star_type}` : 'NO SYSTEM DATA'}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            width={760}
            height={712}
            onClick={handleCanvasClick}
            style={{ width: '100%', height: '100%', background: '#050510', cursor: 'crosshair', display: 'block' }}
          />

          {/* Zoom controls */}
          <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(5,5,16,0.8)', border: '1px solid #223', padding: '4px 8px', fontSize: '10px' }}>
            <button onClick={() => setZoom(z => Math.max(0.25, +(z / 1.5).toFixed(2)))} style={iconBtn}>−</button>
            <span style={{ color: '#8899bb', minWidth: '44px', textAlign: 'center' }}>{zoom.toFixed(1)}× ZOOM</span>
            <button onClick={() => setZoom(z => Math.min(20, +(z * 1.5).toFixed(2)))} style={iconBtn}>+</button>
            <button onClick={() => setZoom(1.0)} style={{ ...iconBtn, width: 'auto', padding: '0 6px', color: '#445' }}>FIT</button>
          </div>

          {/* Orbit action bar */}
          {orbitingPlanet && (
            <div style={orbitBarStyle}>
              <span style={{ color: '#00ffcc' }}>⊙ IN ORBIT: {orbitingPlanet.name.split('-').pop()}</span>
              <button onClick={() => sendCommand({ type: 'leave_orbit' })} style={actionBtn('#550011')}>LEAVE ORBIT</button>
            </div>
          )}
          {!orbitingPlanet && nearbyPlanet && (
            <div style={orbitBarStyle}>
              <span style={{ color: '#ffcc00' }}>◎ {nearbyPlanet.name.split('-').pop()} WITHIN RANGE</span>
              <button onClick={() => sendCommand({ type: 'orbit', planet_id: nearbyPlanet.id })} style={actionBtn('#003322')}>ENTER ORBIT</button>
            </div>
          )}

          {/* Selected planet panel */}
          {selectedPlanet && (
            <PlanetInfo
              planet={selectedPlanet}
              shipPos={pos}
              ship={ship}
              sendCommand={sendCommand}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      {/* Right column — tabbed controls */}
      <div style={{ width: 240, display: 'flex', flexDirection: 'column', background: '#070714', flexShrink: 0 }}>

        {/* Tab header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #0d0d22', flexShrink: 0 }}>
          {['CONTROLS', 'WARP'].map(tab => (
            <button key={tab} onClick={() => setRightTab(tab)} style={{
              flex: 1, padding: '7px 0', background: rightTab === tab ? '#0a1020' : 'transparent',
              color: rightTab === tab ? '#00ffcc' : '#334455',
              border: 'none', borderBottom: rightTab === tab ? '2px solid #00ffcc' : '2px solid transparent',
              fontFamily: 'Courier New', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer',
            }}>
              {tab}
            </button>
          ))}
        </div>

        {rightTab === 'CONTROLS' ? (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* NPC ship info if selected */}
            {npcSelected && (
              <Section label="CONTACT">
                <NpcInfo npc={npcSelected} onClose={() => setNpcSelected(null)} />
              </Section>
            )}

            {/* Position readout */}
            <Section label="POSITION">
              <Readout label="X" value={pos ? pos.x.toFixed(3) + ' AU' : '—'} />
              <Readout label="Z" value={pos ? pos.z.toFixed(3) + ' AU' : '—'} />
              <Readout label="HDG" value={`${headingDeg}°`} color="#00ffcc" />
            </Section>

            {/* Compass */}
            <Section label="HEADING — CLICK TO STEER">
              <canvas
                ref={compassRef}
                width={COMPASS_R * 2}
                height={COMPASS_R * 2}
                onClick={handleCompassClick}
                style={{ background: '#050510', border: '1px solid #223', cursor: 'crosshair', display: 'block', margin: '0 auto' }}
              />
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <input
                  type="number" min="0" max="360" step="1"
                  value={directHeading}
                  onChange={e => setDirectHdg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && isRunning && handleDirectHeadingSet()}
                  disabled={!isRunning}
                  placeholder="0–360°"
                  style={numInput}
                />
                <button onClick={handleDirectHeadingSet} disabled={!isRunning} style={actionBtn('#001133', true)}>SET</button>
              </div>
            </Section>

            {/* Engine controls */}
            <Section label="ENGINES">
              <div style={{ fontSize: '11px', color: '#334455', marginBottom: '4px' }}>ENGINE SPEED</div>
              <div style={{ fontSize: '22px', color: engaged ? '#00ffcc' : '#334', fontFamily: 'Courier New', marginBottom: '2px' }}>
                {(engineSpeed * 1000).toFixed(3)}
                <span style={{ fontSize: '10px', color: '#557', marginLeft: '4px' }}>mAU/tk</span>
              </div>
              <div style={{ fontSize: '10px', color: engaged ? '#00ffcc' : '#664433', marginBottom: '8px', letterSpacing: '1px' }}>
                {engaged ? '▶ ENGAGED' : '■ OFFLINE'}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => sendCommand({ type: 'stop' })} disabled={!isRunning || !engaged} style={actionBtn('#550011')}>STOP</button>
                <button onClick={() => sendCommand({ type: 'set_thrust', value: 1.0 })} disabled={!isRunning || engaged} style={actionBtn('#003322')}>ENGAGE</button>
              </div>
            </Section>

            {/* Orbit controls */}
            <Section label="ORBIT">
              {orbitingPlanet ? (
                <>
                  <div style={{ color: '#00ffcc', fontSize: '10px', marginBottom: '6px' }}>⊙ {orbitingPlanet.name.split('-').pop()}</div>
                  <button onClick={() => sendCommand({ type: 'leave_orbit' })} disabled={!isRunning} style={{ ...actionBtn('#550011'), width: '100%' }}>
                    LEAVE ORBIT
                  </button>
                </>
              ) : nearbyPlanet ? (
                <>
                  <div style={{ color: '#ffcc00', fontSize: '10px', marginBottom: '6px' }}>◎ {nearbyPlanet.name.split('-').pop()} in range</div>
                  <button onClick={() => sendCommand({ type: 'orbit', planet_id: nearbyPlanet.id })} disabled={!isRunning} style={{ ...actionBtn('#003322'), width: '100%' }}>
                    ENTER ORBIT
                  </button>
                </>
              ) : (
                <div style={{ color: '#334455', fontSize: '10px' }}>No planet within 0.5 AU</div>
              )}
            </Section>

            {/* Hull / system quick status */}
            <Section label="HULL">
              <MiniBar label="HULL" value={ship?.hull_health ?? 0} color="#00cc66" />
            </Section>

          </div>
        ) : (
          /* WARP TAB */
          <WarpTab
            systems={galaxySystems}
            warpTarget={warpTarget}
            warpTargetId={warpTargetId}
            setWarpTarget={setWarpTarget}
            isRunning={isRunning}
            onWarp={() => { sendCommand({ type: 'warp', system_id: warpTargetId }); setWarpTarget(null) }}
          />
        )}
      </div>
    </div>
  )
}

// ── NPC ship info (shown in CONTROLS tab when a ship is clicked) ──────────────
function NpcInfo({ npc, onClose }) {
  const color = RACE_COLORS[npc.race] ?? '#aaaaaa'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color, fontSize: '12px', letterSpacing: '1px' }}>◆ {npc.race}</span>
        <button onClick={onClose} style={iconBtn}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: '10px' }}>
        <span style={{ color: '#445577' }}>SIZE</span>
        <span style={{ color: '#aabbdd' }}>{npc.size?.toUpperCase()}</span>
        <span style={{ color: '#445577' }}>DIST</span>
        <span style={{ color: '#aabbdd' }}>{npc.distance_au?.toFixed(2)} AU</span>
        <span style={{ color: '#445577' }}>HULL</span>
        <span style={{ color: '#aabbdd', textTransform: 'uppercase' }}>{npc.hull_category ?? '—'}</span>
      </div>
    </div>
  )
}

// ── Warp tab ──────────────────────────────────────────────────────────────────
function WarpTab({ systems, warpTarget, warpTargetId, setWarpTarget, isRunning, onWarp }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Selected system warp panel */}
      {warpTarget && (
        <div style={{
          padding: '10px 10px 8px', borderBottom: '1px solid #0d0d22',
          background: '#040a10', flexShrink: 0,
        }}>
          <div style={{ fontSize: '12px', color: warpTarget.star_color ?? '#aabbcc', letterSpacing: '1px', marginBottom: '4px', fontFamily: 'Courier New' }}>
            {warpTarget.name}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: '9px', marginBottom: '8px', fontFamily: 'Courier New' }}>
            <span style={{ color: '#334455' }}>TYPE</span>
            <span style={{ color: '#667788' }}>{warpTarget.star_type}-TYPE STAR</span>
            <span style={{ color: '#334455' }}>DIST</span>
            <span style={{ color: '#8899bb' }}>{warpTarget.dist.toFixed(2)} LY</span>
            <span style={{ color: '#334455' }}>COST</span>
            <span style={{ color: warpTarget.canWarp ? '#00cc66' : '#cc3300' }}>
              {warpTarget.cost.toLocaleString()} GW
            </span>
            <span style={{ color: '#334455' }}>CHARGE</span>
            <span style={{ color: '#8899bb' }}>{warpTarget.charge.toLocaleString()} GW</span>
          </div>
          {!warpTarget.canWarp && (
            <div style={{ fontSize: '9px', color: '#882222', fontFamily: 'Courier New', marginBottom: '6px', letterSpacing: '0.5px' }}>
              ✕ INSUFFICIENT WARP CHARGE
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={onWarp}
              disabled={!isRunning || !warpTarget.canWarp}
              style={{ ...actionBtn(warpTarget.canWarp ? '#002244' : '#1a1a1a'), flex: 1 }}
            >
              INITIATE WARP
            </button>
            <button onClick={() => setWarpTarget(null)} style={actionBtn('#0a0a20', true)}>✕</button>
          </div>
        </div>
      )}

      {/* Systems list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {systems.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#223344', fontSize: '10px', fontFamily: 'Courier New' }}>
            NO GALAXY DATA
          </div>
        )}
        {systems.map(s => {
          const isSel = s.id === warpTargetId
          const dist  = s.distance_ly ?? 0
          const cost  = Math.round(WARP_COST_BASE * (dist ** WARP_COST_EXPONENT))
          return (
            <div key={s.id}
              onClick={() => setWarpTarget(prev => prev === s.id ? null : s.id)}
              style={{
                padding: '7px 10px', borderBottom: '1px solid #0a0a18',
                background: isSel ? '#040f18' : 'transparent',
                cursor: 'pointer', borderLeft: isSel ? '2px solid #00ffcc' : '2px solid transparent',
                fontFamily: 'Courier New',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', color: s.visited ? (s.star_color ?? '#aabbcc') : '#445566' }}>
                  {s.name}
                </span>
                {s.visited && (
                  <span style={{ fontSize: '7px', color: '#003322', letterSpacing: '1px', border: '1px solid #003322', padding: '0 3px' }}>
                    VIS
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                <span style={{ color: '#334455' }}>{s.star_type}-type · {s.planet_count}pl</span>
                <span style={{ color: '#445566' }}>{dist.toFixed(1)} LY · {cost.toLocaleString()} GW</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{ borderBottom: '1px solid #0d0d22', padding: '8px 10px' }}>
      <div style={{ fontSize: '9px', color: '#334455', letterSpacing: '2px', marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

function Readout({ label, value, color = '#8899bb' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
      <span style={{ color: '#445577' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
        <span style={{ color: '#445577' }}>{label}</span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div style={{ height: '5px', background: '#111', border: '1px solid #223' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

function PlanetInfo({ planet, shipPos, ship, sendCommand, onClose }) {
  const distAU = shipPos ? Math.sqrt(
    (shipPos.x - planet.position.x) ** 2 +
    (shipPos.z - (planet.position.z ?? 0)) ** 2
  ).toFixed(2) : null
  const isOrbiting = ship?.orbiting_planet_id === planet.id

  return (
    <div style={{
      position: 'absolute', top: 8, left: 8,
      background: 'rgba(4,4,18,0.94)', border: '1px solid #335',
      padding: '10px 12px', minWidth: 200, fontSize: '11px',
      fontFamily: 'Courier New', maxHeight: 340, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: '#00ffcc', letterSpacing: '1px' }}>{planet.name.split('-').pop()}</span>
        <button onClick={onClose} style={iconBtn}>✕</button>
      </div>
      <PIRow label="TYPE"      value={planet.type} />
      <PIRow label="ORBIT"     value={`${planet.orbital_distance_au.toFixed(2)} AU`} />
      {distAU && <PIRow label="DIST" value={`${distAU} AU`} color="#ffcc44" />}
      <PIRow label="HOSTILITY" value={<MiniBarInline value={planet.total_hostility} color="#cc3300" />} />
      {planet.inhabited && <PIRow label="INHABITED" value="YES" color="#ffcc00" />}
      {planet.moons?.length > 0 && <PIRow label="MOONS" value={planet.moons.length} />}
      {isOrbiting && (
        <div style={{ color: '#00ffcc', fontSize: '10px', marginTop: '6px' }}>⊙ Currently orbiting</div>
      )}
    </div>
  )
}

function PIRow({ label, value, color = '#aabbdd' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
      <span style={{ color: '#445577', marginRight: '8px' }}>{label}</span>
      <span style={{ color, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function MiniBarInline({ value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ width: 60, height: 5, background: '#111', border: '1px solid #223' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: '10px', color: '#778899' }}>{Math.round(value)}</span>
    </div>
  )
}

function drawShipTriangle(ctx, x, y, dir, size = 7) {
  const angle = Math.atan2(dir.z ?? 0, dir.x)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.6,  size * 0.5)
  ctx.lineTo(-size * 0.6, -size * 0.5)
  ctx.closePath()
  ctx.fillStyle = '#00ffcc'
  ctx.fill()
  ctx.restore()
}

function planetColor(type) {
  const map = {
    'Terrestrial': '#4488ff', 'Ocean World': '#2255dd', 'Jungle/Lush': '#33aa55',
    'Desert/Arid': '#cc8833', 'Gas Giant': '#bb6622',   'Ice Giant': '#5588bb',
    'Ice World': '#aaccee',   'Volcanic/Magma': '#ff3300', 'Irradiated': '#aaff00',
    'Toxic/Corrosive': '#88ff44', 'Crystalline': '#cc88ff', 'Barren/Rocky': '#778899',
    'Super-Earth': '#5566ff', 'Tidally Locked': '#997755', 'Rogue/Dark': '#334455',
  }
  return map[type] ?? '#aaaaaa'
}

// ── Styles ────────────────────────────────────────────────────────────────────
const iconBtn = {
  background: 'none', border: '1px solid #335', color: '#8899bb',
  fontFamily: 'Courier New', fontSize: '12px', width: 22, height: 22,
  cursor: 'pointer', lineHeight: 1, padding: 0,
}

function actionBtn(bg, small = false) {
  return {
    background: bg, color: '#d0d8f0', border: '1px solid #446',
    padding: small ? '4px 8px' : '5px 10px',
    fontFamily: 'Courier New', fontSize: '11px', cursor: 'pointer',
  }
}

const numInput = {
  flex: 1, background: '#050510', color: '#00ffcc', border: '1px solid #335',
  padding: '4px 6px', fontFamily: 'Courier New', fontSize: '11px',
  width: 0,   // flex takes over
}

const orbitBarStyle = {
  position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: '12px',
  background: 'rgba(4,4,18,0.9)', border: '1px solid #335',
  padding: '6px 14px', fontSize: '11px', fontFamily: 'Courier New', whiteSpace: 'nowrap',
}

