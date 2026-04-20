import { useEffect, useRef, useState } from 'react'

const PAD = 20

function projectToCanvas(posLy, systems, width, height) {
  // Project 3D galaxy coords onto 2D canvas (use x,z plane)
  const xs = systems.map(s => s.position_ly.x)
  const zs = systems.map(s => s.position_ly.z)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minZ = Math.min(...zs), maxZ = Math.max(...zs)
  const rangeX = maxX - minX || 1
  const rangeZ = maxZ - minZ || 1
  const scale = Math.min((width - PAD * 2) / rangeX, (height - PAD * 2) / rangeZ)
  const cx = (posLy.x - minX) * scale + PAD
  const cy = (posLy.z - minZ) * scale + PAD
  return { cx, cy, scale, minX, minZ }
}

export default function GalaxyMap({ gameState, onSelectSystem }) {
  const canvasRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const metaRef = useRef(null)  // stores projection metadata for click handling

  useEffect(() => {
    if (!gameState?.galaxy_systems?.length) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const systems = gameState.galaxy_systems
    const currentId = gameState.ship?.current_system_id

    // Build projection metadata once per render
    const xs = systems.map(s => s.position_ly.x)
    const zs = systems.map(s => s.position_ly.z)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const rangeX = maxX - minX || 1
    const rangeZ = maxZ - minZ || 1
    const scale = Math.min((width - PAD * 2) / rangeX, (height - PAD * 2) / rangeZ)

    const toCanvas = (s) => ({
      cx: (s.position_ly.x - minX) * scale + PAD,
      cy: (s.position_ly.z - minZ) * scale + PAD,
    })

    metaRef.current = { systems, minX, minZ, scale }

    for (const s of systems) {
      const { cx, cy } = toCanvas(s)
      const isCurrent  = s.id === currentId
      const isSelected = s.id === selected

      // Glow ring for selected
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(cx, cy, 9, 0, Math.PI * 2)
        ctx.strokeStyle = '#00ffcc'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // System dot
      ctx.beginPath()
      ctx.arc(cx, cy, isCurrent ? 6 : 3, 0, Math.PI * 2)
      ctx.fillStyle = isCurrent ? '#ffffff' : (s.star_color ?? '#aaaaaa')
      ctx.globalAlpha = s.visited ? 1.0 : 0.5
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Name label for current system
      if (isCurrent) {
        ctx.fillStyle = '#ffffff'
        ctx.font = '9px Courier New'
        ctx.fillText(s.name, cx + 8, cy + 3)
      }
    }
  }, [gameState, selected])

  function handleClick(e) {
    if (!metaRef.current) return
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { systems, minX, minZ, scale } = metaRef.current
    let nearest = null, nearestDist = 12
    for (const s of systems) {
      const cx = (s.position_ly.x - minX) * scale + PAD
      const cy = (s.position_ly.z - minZ) * scale + PAD
      const d  = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
      if (d < nearestDist) { nearest = s; nearestDist = d }
    }
    if (nearest) {
      setSelected(nearest.id)
      onSelectSystem?.(nearest)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={460}
      height={460}
      onClick={handleClick}
      style={{ background: 'var(--bg-label)', border: '1px solid var(--border-faint)', cursor: 'crosshair', display: 'block' }}
    />
  )
}
