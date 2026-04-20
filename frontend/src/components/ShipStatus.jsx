export default function ShipStatus({ gameState }) {
  if (!gameState?.ship) return null
  const ship = gameState.ship
  const sys  = gameState.current_system

  const pos   = ship.position
  const dist  = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2).toFixed(2)
  const dir   = ship.direction
  const power = ship.effective_power_gw?.toFixed(0) ?? '—'

  return (
    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-faint)', fontSize: '11px', lineHeight: '1.7' }}>
      <Row label="SYSTEM"   value={sys?.name ?? '—'} />
      <Row label="POSITION" value={`(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}) AU`} />
      <Row label="DIST★"    value={`${dist} AU`} />
      <Row label="HEADING"  value={`(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`} />
      <Row label="THRUST"   value={`${(ship.thrust * 100).toFixed(0)}%`} />
      <Row label="HULL"     value={<HealthBar value={ship.hull_health} />} />
      <Row label="POWER"    value={`${power} GW`} />
      <Row label="TICK"     value={gameState.tick} />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '80px' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function HealthBar({ value }) {
  const color = value > 60 ? 'var(--accent-green)' : value > 30 ? 'var(--accent-amber)' : 'var(--accent-red)'
  return (
    <span>
      <span style={{ color }}>{value.toFixed(0)}%</span>
      <span style={{ marginLeft: '6px', color: 'var(--text-ghost)' }}>
        {'█'.repeat(Math.round(value / 10))}{'░'.repeat(10 - Math.round(value / 10))}
      </span>
    </span>
  )
}
