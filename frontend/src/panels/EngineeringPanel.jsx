// Kept for backwards compat — Engineering maps to Power + Engines stations.
// Use PowerPanel or EnginesPanel instead.
export default function EngineeringPanel({ gameState, sendCommand }) {
  return <BlankPanel name="ENGINEERING" icon="⚙" color="#ffaa00" />
}

function BlankPanel({ name, icon, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#070714' }}>
      <div style={{ fontSize: '48px', opacity: 0.15, color }}>{icon}</div>
      <div style={{ color: '#1a2a3a', fontSize: '12px', letterSpacing: '4px', marginTop: '12px', fontFamily: 'Courier New' }}>{name}</div>
    </div>
  )
}
