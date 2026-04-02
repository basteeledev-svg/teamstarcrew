import { useRef, useEffect, useState } from 'react'

const COMPASS_R = 60   // radius of direction compass circle

export default function ShipControls({ gameState, sendCommand }) {
  const compassRef = useRef(null)
  const [directHeading, setDirectHeading] = useState('')

  const ship        = gameState?.ship
  const engaged     = (ship?.thrust ?? 0) > 0
  const engineSpeed = ship?.engine_thrust_au ?? 0

  function handleStop() {
    sendCommand({ type: 'stop' })
  }

  // Heading is measured clockwise from North (+Z). Convert to XZ unit vector.
  function degreesToDirection(deg) {
    const rad = (deg * Math.PI) / 180
    return { x: Math.sin(rad), y: 0, z: Math.cos(rad) }
  }

  function handleDirectHeadingSet() {
    const deg = parseFloat(directHeading)
    if (isNaN(deg)) return
    const dir = degreesToDirection(((deg % 360) + 360) % 360)
    sendCommand({ type: 'set_target_direction', ...dir })
  }

  function handleCompassClick(e) {
    const canvas = compassRef.current
    const rect   = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left - COMPASS_R
    const my = e.clientY - rect.top  - COMPASS_R
    const mag = Math.sqrt(mx * mx + my * my) || 1
    const x   = mx / mag
    const z   = my / mag
    sendCommand({ type: 'set_target_direction', x, y: 0, z })
  }

  // Draw compass
  useEffect(() => {
    const canvas = compassRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const cx = W / 2, cy = H / 2
    ctx.clearRect(0, 0, W, H)

    // Outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, COMPASS_R, 0, Math.PI * 2)
    ctx.strokeStyle = '#335'
    ctx.lineWidth = 2
    ctx.stroke()

    // Cross-hairs
    ctx.strokeStyle = '#223'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, cy - COMPASS_R); ctx.lineTo(cx, cy + COMPASS_R)
    ctx.moveTo(cx - COMPASS_R, cy); ctx.lineTo(cx + COMPASS_R, cy)
    ctx.stroke()

    // Labels
    ctx.fillStyle = '#557'
    ctx.font = '9px Courier New'
    ctx.fillText('N', cx - 4, cy - COMPASS_R + 12)
    ctx.fillText('S', cx - 4, cy + COMPASS_R - 4)
    ctx.fillText('E', cx + COMPASS_R - 10, cy + 3)
    ctx.fillText('W', cx - COMPASS_R + 3, cy + 3)

    // Current direction dot
    const dir = gameState?.ship?.direction
    if (dir) {
      const dx = cx + dir.x * COMPASS_R * 0.85
      const dy = cy + dir.z * COMPASS_R * 0.85
      ctx.beginPath()
      ctx.arc(dx, dy, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#00ffcc'
      ctx.fill()
    }

    // Target direction dot (dimmer)
    const tdir = gameState?.ship?.target_direction
    if (tdir) {
      const tx = cx + tdir.x * COMPASS_R * 0.85
      const ty = cy + tdir.z * COMPASS_R * 0.85
      ctx.beginPath()
      ctx.arc(tx, ty, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,220,180,0.35)'
      ctx.fill()
    }
  }, [gameState?.ship?.direction, gameState?.ship?.target_direction])

  const isRunning = gameState?.status === 'running'

  return (
    <div style={{ padding: '10px', borderTop: '1px solid #223' }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>

        {/* Compass */}
        <div>
          <div style={{ fontSize: '10px', color: '#557', marginBottom: '4px' }}>
            HEADING (click to steer)
          </div>
          <canvas
            ref={compassRef}
            width={COMPASS_R * 2 + 4}
            height={COMPASS_R * 2 + 4}
            onClick={handleCompassClick}
            style={{ background: '#050510', border: '1px solid #223', cursor: 'crosshair', display: 'block' }}
          />
        </div>

        {/* Engine status */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#557', marginBottom: '2px' }}>ENGINE SPEED</div>
            <div style={{ fontFamily: 'Courier New', fontSize: '22px', color: engaged ? '#00ffcc' : '#445' }}>
              {(engineSpeed * 1000).toFixed(3)}
              <span style={{ fontSize: '11px', color: '#557', marginLeft: '4px' }}>mAU/tk</span>
            </div>
          </div>
          <div style={{ fontSize: '10px', color: engaged ? '#00ffcc' : '#665544', marginBottom: '8px' }}>
            STATUS: {engaged ? '▶ ENGINES ENGAGED' : '■ ENGINES OFFLINE'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleStop}
              disabled={!isRunning || !engaged}
              style={btnStyle('#550011')}
            >
              FULL STOP
            </button>
            <button
              onClick={() => sendCommand({ type: 'set_thrust', value: 1.0 })}
              disabled={!isRunning || engaged}
              style={btnStyle('#003322')}
            >
              ENGAGE ENGINES
            </button>
          </div>
        </div>
      </div>

      {/* Direct entry box */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        border: '1px solid #335',
        background: '#07070f',
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ fontSize: '10px', color: '#557', width: '100%', marginBottom: '2px' }}>
          DIRECT ENTRY
        </div>

        {/* Heading */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '10px', color: '#557' }}>HEADING (0–360°)</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="number" min="0" max="360" step="1"
              value={directHeading}
              onChange={e => setDirectHeading(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isRunning && handleDirectHeadingSet()}
              disabled={!isRunning}
              placeholder="deg"
              style={inputStyle}
            />
            <button
              onClick={handleDirectHeadingSet}
              disabled={!isRunning}
              style={btnStyle('#001133')}
            >SET</button>
          </div>
        </div>


      </div>
    </div>
  )
}

function btnStyle(bg) {
  return {
    background: bg,
    color: '#d0d8f0',
    border: '1px solid #335',
    padding: '6px 12px',
    fontFamily: 'Courier New',
    fontSize: '11px',
    cursor: 'pointer',
  }
}

const inputStyle = {
  width: '70px',
  background: '#050510',
  color: '#00ffcc',
  border: '1px solid #335',
  padding: '5px 8px',
  fontFamily: 'Courier New',
  fontSize: '12px',
}
