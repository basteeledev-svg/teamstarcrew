// Kept for backwards compat — use ShortRangePanel / LongRangePanel instead.
export default function SciencePanel({ gameState, sendCommand }) {
  return <BlankPanel name="SCIENCE" icon="◎" color="#44ffaa" />
}

function BlankPanel({ name, icon, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#070714' }}>
      <div style={{ fontSize: '48px', opacity: 0.15, color }}>{icon}</div>
      <div style={{ color: '#1a2a3a', fontSize: '12px', letterSpacing: '4px', marginTop: '12px', fontFamily: 'Courier New' }}>{name}</div>
    </div>
  )
}
