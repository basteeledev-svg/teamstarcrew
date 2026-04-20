import { useEffect, useRef, useState, useMemo } from 'react'
import { Btn, IconBtn } from '../components/ui'
import { RACE_COLORS } from '../shared'
import s from './NavigationPanel.module.css'

const STAR_RADIUS = 10
const COMPASS_R   = 56

// Warp cost formula (fallback; overridden by server-sent constants)
const _WARP_COST_BASE     = 100.0
const _WARP_COST_EXPONENT = 1.3

// ── Main panel ────────────────────────────────────────────────────────────────
export default function NavigationPanel({ gameState, sendCommand }) {
  const C = gameState?.constants ?? {}
  const WARP_COST_BASE     = C.WARP_COST_BASE ?? _WARP_COST_BASE
  const WARP_COST_EXPONENT = C.WARP_COST_EXPONENT ?? _WARP_COST_EXPONENT
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
      .filter(sys => sys.id !== currentId)
      .sort((a, b) => (a.distance_ly ?? 0) - (b.distance_ly ?? 0))
  }, [gameState?.galaxy_systems, gameState?.ship?.current_system_id])

  // Selected warp target details
  const warpTarget = useMemo(() => {
    if (!warpTargetId) return null
    const sys = gameState?.galaxy_systems?.find(g => g.id === warpTargetId)
    if (!sys) return null
    const dist = sys.distance_ly ?? 0
    const cost = WARP_COST_BASE * (dist ** WARP_COST_EXPONENT)
    const charge = gameState?.ship?.warp_capacitor_gw ?? 0
    return { ...sys, cost: Math.round(cost), charge: Math.round(charge), canWarp: charge >= cost, dist }
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
    <div className={s.container}>

      {/* Left column — system map */}
      <div className={s.mapColumn}>
        {/* System name bar */}
        <div className={s.systemBar}>
          {system ? `⊙ ${system.name}  ·  ${system.star_type}` : 'NO SYSTEM DATA'}
        </div>

        {/* Canvas */}
        <div className={s.canvasWrap}>
          <canvas
            ref={canvasRef}
            width={760}
            height={712}
            onClick={handleCanvasClick}
            className={s.canvas}
          />

          {/* Zoom controls */}
          <div className={s.zoomControls}>
            <IconBtn onClick={() => setZoom(z => Math.max(0.25, +(z / 1.5).toFixed(2)))}>−</IconBtn>
            <span className={s.zoomText}>{zoom.toFixed(1)}× ZOOM</span>
            <IconBtn onClick={() => setZoom(z => Math.min(20, +(z * 1.5).toFixed(2)))}>+</IconBtn>
            <IconBtn onClick={() => setZoom(1.0)} style={{ width: 'auto', padding: '0 6px', color: 'var(--text-dim)' }}>FIT</IconBtn>
          </div>

          {/* Orbit action bar */}
          {orbitingPlanet && (
            <div className={s.orbitBar}>
              <span style={{ color: '#00ffcc' }}>⊙ IN ORBIT: {orbitingPlanet.name.split('-').pop()}</span>
              <Btn onClick={() => sendCommand({ type: 'leave_orbit' })} bg="#550011" color="var(--text-bright)" borderColor="var(--border-faint)">LEAVE ORBIT</Btn>
            </div>
          )}
          {!orbitingPlanet && nearbyPlanet && (
            <div className={s.orbitBar}>
              <span style={{ color: '#ffcc00' }}>◎ {nearbyPlanet.name.split('-').pop()} WITHIN RANGE</span>
              <Btn onClick={() => sendCommand({ type: 'orbit', planet_id: nearbyPlanet.id })} bg="#003322" color="var(--text-bright)" borderColor="var(--border-faint)">ENTER ORBIT</Btn>
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
      <div className={s.rightColumn}>

        {/* Tab header */}
        <div className={s.tabHeader}>
          {['CONTROLS', 'WARP'].map(tab => (
            <button key={tab} onClick={() => setRightTab(tab)} className={s.tabBtn} style={{
              background: rightTab === tab ? 'var(--bg-raised)' : 'transparent',
              color: rightTab === tab ? 'var(--accent-cyan)' : 'var(--text-dim)',
              borderBottom: rightTab === tab ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            }}>
              {tab}
            </button>
          ))}
        </div>

        {rightTab === 'CONTROLS' ? (
          <div className={s.controlsScroll}>

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
                className={s.compassCanvas}
              />
              <div className={s.headingRow}>
                <input
                  type="number" min="0" max="360" step="1"
                  value={directHeading}
                  onChange={e => setDirectHdg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && isRunning && handleDirectHeadingSet()}
                  disabled={!isRunning}
                  placeholder="0–360°"
                  className={s.numInput}
                />
                <Btn small onClick={handleDirectHeadingSet} disabled={!isRunning} bg="#001133" color="var(--text-bright)" borderColor="var(--border-faint)">SET</Btn>
              </div>
            </Section>

            {/* Engine controls */}
            <Section label="ENGINES">
              <div className={s.engineSpeedLabel}>ENGINE SPEED</div>
              <div className={s.engineSpeedValue} style={{ color: engaged ? '#00ffcc' : 'var(--text-ghost)' }}>
                {(engineSpeed * 1000).toFixed(3)}
                <span className={s.engineSpeedUnit}>mAU/tk</span>
              </div>
              <div className={s.engineStatus} style={{ color: engaged ? '#00ffcc' : '#664433' }}>
                {engaged ? '▶ ENGAGED' : '■ OFFLINE'}
              </div>
              <div className={s.btnRow}>
                <Btn onClick={() => sendCommand({ type: 'stop' })} disabled={!isRunning || !engaged} bg="#550011" color="var(--text-bright)" borderColor="var(--border-faint)">STOP</Btn>
                <Btn onClick={() => sendCommand({ type: 'set_thrust', value: 1.0 })} disabled={!isRunning || engaged} bg="#003322" color="var(--text-bright)" borderColor="var(--border-faint)">ENGAGE</Btn>
              </div>
            </Section>

            {/* Orbit controls */}
            <Section label="ORBIT">
              {orbitingPlanet ? (
                <>
                  <div className={s.orbitStatusText} style={{ color: '#00ffcc' }}>⊙ {orbitingPlanet.name.split('-').pop()}</div>
                  <Btn onClick={() => sendCommand({ type: 'leave_orbit' })} disabled={!isRunning} bg="#550011" color="var(--text-bright)" borderColor="var(--border-faint)" style={{ width: '100%' }}>
                    LEAVE ORBIT
                  </Btn>
                </>
              ) : nearbyPlanet ? (
                <>
                  <div className={s.orbitStatusText} style={{ color: '#ffcc00' }}>◎ {nearbyPlanet.name.split('-').pop()} in range</div>
                  <Btn onClick={() => sendCommand({ type: 'orbit', planet_id: nearbyPlanet.id })} disabled={!isRunning} bg="#003322" color="var(--text-bright)" borderColor="var(--border-faint)" style={{ width: '100%' }}>
                    ENTER ORBIT
                  </Btn>
                </>
              ) : (
                <div className={s.noPlanetText}>No planet within 0.5 AU</div>
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
      <div className={s.npcHeader}>
        <span className={s.npcRace} style={{ color }}>◆ {npc.race}</span>
        <IconBtn onClick={onClose}>✕</IconBtn>
      </div>
      <div className={s.npcGrid}>
        <span className={s.npcGridLabel}>SIZE</span>
        <span className={s.npcGridValue}>{npc.size?.toUpperCase()}</span>
        <span className={s.npcGridLabel}>DIST</span>
        <span className={s.npcGridValue}>{npc.distance_au?.toFixed(2)} AU</span>
        <span className={s.npcGridLabel}>HULL</span>
        <span className={s.npcGridValue} style={{ textTransform: 'uppercase' }}>{npc.hull_category ?? '—'}</span>
      </div>
    </div>
  )
}

// ── Warp tab ──────────────────────────────────────────────────────────────────
function WarpTab({ systems, warpTarget, warpTargetId, setWarpTarget, isRunning, onWarp }) {
  return (
    <div className={s.warpTabContainer}>

      {/* Selected system warp panel */}
      {warpTarget && (
        <div className={s.warpPanel}>
          <div className={s.warpSystemName} style={{ color: warpTarget.star_color ?? 'var(--text-primary)' }}>
            {warpTarget.name}
          </div>
          <div className={s.warpGrid}>
            <span className={s.warpGridLabel}>TYPE</span>
            <span style={{ color: 'var(--text-secondary)' }}>{warpTarget.star_type}-TYPE STAR</span>
            <span className={s.warpGridLabel}>DIST</span>
            <span style={{ color: 'var(--text-body)' }}>{warpTarget.dist.toFixed(2)} LY</span>
            <span className={s.warpGridLabel}>COST</span>
            <span style={{ color: warpTarget.canWarp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {warpTarget.cost.toLocaleString()} GW
            </span>
            <span className={s.warpGridLabel}>CHARGE</span>
            <span style={{ color: 'var(--text-body)' }}>{warpTarget.charge.toLocaleString()} GW</span>
          </div>
          {!warpTarget.canWarp && (
            <div className={s.warpInsufficient}>
              ✕ INSUFFICIENT WARP CHARGE
            </div>
          )}
          <div className={s.warpBtnRow}>
            <Btn onClick={onWarp} disabled={!isRunning || !warpTarget.canWarp}
              bg={warpTarget.canWarp ? '#002244' : '#1a1a1a'} color="var(--text-bright)" borderColor="var(--border-faint)" style={{ flex: 1 }}>
              INITIATE WARP
            </Btn>
            <Btn small onClick={() => setWarpTarget(null)} bg="#0a0a20" color="var(--text-bright)" borderColor="var(--border-faint)">✕</Btn>
          </div>
        </div>
      )}

      {/* Systems list */}
      <div className={s.systemsList}>
        {systems.length === 0 && (
          <div className={s.noGalaxyData}>
            NO GALAXY DATA
          </div>
        )}
        {systems.map(sys => {
          const isSel = sys.id === warpTargetId
          const dist  = sys.distance_ly ?? 0
          const cost  = Math.round(_WARP_COST_BASE * (dist ** _WARP_COST_EXPONENT))
          return (
            <div key={sys.id}
              onClick={() => setWarpTarget(prev => prev === sys.id ? null : sys.id)}
              className={s.systemItem}
              style={{
                background: isSel ? '#040f18' : 'transparent',
                borderLeft: isSel ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              }}
            >
              <div className={s.systemItemHeader}>
                <span className={s.systemItemName} style={{ color: sys.visited ? (sys.star_color ?? 'var(--text-primary)') : 'var(--text-muted)' }}>
                  {sys.name}
                </span>
                {sys.visited && (
                  <span className={s.visitedBadge}>
                    VIS
                  </span>
                )}
              </div>
              <div className={s.systemItemDetails}>
                <span style={{ color: 'var(--text-dim)' }}>{sys.star_type}-type · {sys.planet_count}pl</span>
                <span style={{ color: 'var(--text-muted)' }}>{dist.toFixed(1)} LY · {cost.toLocaleString()} GW</span>
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
    <div className={s.section}>
      <div className={s.sectionLabel}>{label}</div>
      {children}
    </div>
  )
}

function Readout({ label, value, color = 'var(--text-body)' }) {
  return (
    <div className={s.readout}>
      <span className={s.readoutLabel}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div className={s.miniBar}>
      <div className={s.miniBarHeader}>
        <span className={s.miniBarLabel}>{label}</span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className={s.miniBarTrack}>
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
    <div className={s.planetInfoPanel}>
      <div className={s.planetInfoHeader}>
        <span className={s.planetInfoName}>{planet.name.split('-').pop()}</span>
        <IconBtn onClick={onClose}>✕</IconBtn>
      </div>
      <PIRow label="TYPE"      value={planet.type} />
      <PIRow label="ORBIT"     value={`${planet.orbital_distance_au.toFixed(2)} AU`} />
      {distAU && <PIRow label="DIST" value={`${distAU} AU`} color="#ffcc44" />}
      <PIRow label="HOSTILITY" value={<MiniBarInline value={planet.total_hostility} color="#cc3300" />} />
      {planet.inhabited && <PIRow label="INHABITED" value="YES" color="#ffcc00" />}
      {planet.moons?.length > 0 && <PIRow label="MOONS" value={planet.moons.length} />}
      {isOrbiting && (
        <div className={s.orbitingStatus}>⊙ Currently orbiting</div>
      )}
    </div>
  )
}

function PIRow({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div className={s.piRow}>
      <span className={s.piRowLabel}>{label}</span>
      <span style={{ color, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function MiniBarInline({ value, color }) {
  return (
    <div className={s.miniBarInline}>
      <div className={s.miniBarInlineTrack}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
      <span className={s.miniBarInlineValue}>{Math.round(value)}</span>
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


