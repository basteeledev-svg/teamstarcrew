import { useState } from 'react'
import GalaxyMap    from '../components/GalaxyMap.jsx'
import SystemView   from '../components/SystemView.jsx'
import ShipControls from '../components/ShipControls.jsx'
import ShipStatus   from '../components/ShipStatus.jsx'
import '../hud/hud.css'

const W = 1280
const H = 800

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
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div className="hud-top">
        <span className="hud-logo">★ OBSERVER</span>
        <span className="hud-pip" />
        {isRunning && <>
          <span className="hud-tag">TICK <b>{gameState.tick}</b></span>
          <span className="hud-tag">SYSTEMS <b>{gameState.galaxy_systems?.length ?? 0}</b></span>
          <span className="hud-tag">CURRENT <b>{gameState.current_system?.name ?? '—'}</b></span>
        </>}
        <span className="hud-sp" />
        {!isRunning && (
          <button onClick={handleStartGame} disabled={starting} className="hbtn hbtn-sm grn">
            {starting ? 'GENERATING…' : '✦ START NEW GAME'}
          </button>
        )}
        <button onClick={onExit} className="hud-exit">← BACK</button>
      </div>

      {/* Main layout */}
      <div className="hud-content" style={{ padding: 10, gap: 10 }}>

        {/* Left: Galaxy map */}
        <div className="po" style={{ width: 520, display: 'flex' }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>◈</span>
              <span className="ptitle">GALAXY MAP</span>
              <span className="pstat">
                <span className={isRunning ? 'vg' : 'vr'}>{isRunning ? '● LIVE' : '○ IDLE'}</span>
              </span>
            </div>
            <div className="pbody" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <GalaxyMap gameState={gameState} onSelectSystem={setSelectedSystem} />
              </div>
              {selectedSystem && (
                <div style={{
                  padding: 12,
                  borderTop: '1px solid rgba(0,229,255,0.25)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ color: 'var(--hud-c)', letterSpacing: 2 }}>
                    ► {selectedSystem.name}
                    <span style={{ color: 'var(--hud-txd)', marginLeft: 8 }}>
                      ({selectedSystem.star_type}-TYPE · {selectedSystem.planet_count} PLANETS)
                    </span>
                  </div>
                  <button onClick={handleWarp} disabled={!isRunning} className="hbtn hbtn-sm pri">
                    ✦ INITIATE WARP JUMP
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: System view + ship */}
        <div className="po" style={{ flex: 1, display: 'flex' }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>◇</span>
              <span className="ptitle">
                CURRENT SYSTEM: {gameState?.current_system?.name ?? '—'}
              </span>
              <span className="pstat">
                <span>{gameState?.current_system?.star_type ?? '?'}-TYPE STAR</span>
              </span>
            </div>
            <div className="pbody" style={{ overflowY: 'auto' }}>
              <SystemView gameState={gameState} sendCommand={sendCommand} />
              <ShipStatus gameState={gameState} />
              <ShipControls gameState={gameState} sendCommand={sendCommand} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
