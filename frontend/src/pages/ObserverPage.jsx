import { useState } from 'react'
import GalaxyMap    from '../components/GalaxyMap.jsx'
import SystemView   from '../components/SystemView.jsx'
import ShipControls from '../components/ShipControls.jsx'
import ShipStatus   from '../components/ShipStatus.jsx'

export default function ObserverPage({ gameState, sendCommand, onExit }) {
  const [selectedSystem, setSelectedSystem] = useState(null)
  const [starting, setStarting]             = useState(false)

  async function handleStartGame() {
    setStarting(true)
    try {
      await fetch('/api/game/start', { method: 'POST' })
    } finally {
      setStarting(false)
    }
  }

  async function handleWarp() {
    if (!selectedSystem) return
    sendCommand({ type: 'warp', system_id: selectedSystem.id })
    setSelectedSystem(null)
  }

  const isRunning = gameState?.status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1280, height: 800, overflow: 'hidden' }}>

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ letterSpacing: '3px', fontSize: '14px' }}>★ TEAM STAR CREW</span>
        <span style={{ fontSize: '10px', color: '#334455', letterSpacing: '2px' }}>OBSERVER</span>
        <span style={{ fontSize: '11px', color: '#445577' }}>
          {!isRunning
            ? null
            : `TICK ${gameState.tick} · ${gameState.galaxy_systems?.length} SYSTEMS`
          }
        </span>
        {!isRunning && (
          <button onClick={handleStartGame} disabled={starting} style={btnStyle('#004422')}>
            {starting ? 'GENERATING GALAXY…' : 'START NEW GAME'}
          </button>
        )}
        <button onClick={onExit} style={{ ...btnStyle('#0a0a20'), marginLeft: 'auto', color: '#445566' }}>
          ← BACK
        </button>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Galaxy map */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a2e' }}>
          <SectionLabel>GALAXY MAP</SectionLabel>
          <GalaxyMap gameState={gameState} onSelectSystem={setSelectedSystem} />
          {selectedSystem && (
            <div style={{ padding: '8px', borderTop: '1px solid #223', fontSize: '11px' }}>
              <div style={{ color: '#aabbdd', marginBottom: '6px' }}>
                ► {selectedSystem.name}
                <span style={{ color: '#445577', marginLeft: '8px' }}>
                  ({selectedSystem.star_type}-type · {selectedSystem.planet_count} planets)
                </span>
              </div>
              <button onClick={handleWarp} disabled={!isRunning} style={btnStyle('#002244')}>
                INITIATE WARP JUMP
              </button>
            </div>
          )}
        </div>

        {/* Right: System view + controls */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <SectionLabel>
            CURRENT SYSTEM: {gameState?.current_system?.name ?? '—'}
            <span style={{ color: '#445577', marginLeft: '8px', fontSize: '10px' }}>
              ({gameState?.current_system?.star_type ?? '?'}-type star)
            </span>
          </SectionLabel>
          <SystemView gameState={gameState} sendCommand={sendCommand} />
          <ShipStatus gameState={gameState} />
          <ShipControls gameState={gameState} sendCommand={sendCommand} />
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      padding: '6px 10px',
      fontSize: '10px',
      color: '#334466',
      letterSpacing: '2px',
      borderBottom: '1px solid #1a1a2e',
      background: '#070714',
    }}>
      {children}
    </div>
  )
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  padding: '8px 16px',
  background: '#050510',
  borderBottom: '1px solid #1a1a2e',
  color: '#8899cc',
}

function btnStyle(bg) {
  return {
    background: bg,
    color: '#d0d8f0',
    border: '1px solid #335',
    padding: '5px 14px',
    fontFamily: 'Courier New',
    fontSize: '11px',
    cursor: 'pointer',
    letterSpacing: '1px',
  }
}
