export default function NavigationPanel({ gameState, sendCommand }) {
  return <BlankPanel name="NAVIGATION" icon="⊕" color="#00aaff" />
}

function BlankPanel({ name, icon, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#070714' }}>
      <div style={{ fontSize: '48px', opacity: 0.15, color }}>{icon}</div>
      <div style={{ color: '#1a2a3a', fontSize: '12px', letterSpacing: '4px', marginTop: '12px', fontFamily: 'Courier New' }}>{name}</div>
    </div>
  )
}
