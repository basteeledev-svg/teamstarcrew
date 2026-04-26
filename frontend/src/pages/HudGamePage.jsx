import { useState, lazy, Suspense, useEffect, useRef } from 'react'
import { CONSOLES } from '../consoles.js'
import '../hud/hud.css'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
const W = 1280
const H = 800

// Map console id → lazy-loaded panel component (same as GamePage)
const PANEL_MAP = {
  navigation:     lazy(() => import('../panels/NavigationPanel.jsx')),
  short_range:    lazy(() => import('../panels/ShortRangePanel.jsx')),
  long_range:     lazy(() => import('../panels/LongRangePanel.jsx')),
  weapons:        lazy(() => import('../panels/TacticalPanel.jsx')),
  shields:        lazy(() => import('../panels/ShieldsPanel.jsx')),
  repairs:        lazy(() => import('../panels/RepairsPanel.jsx')),
  transportation: lazy(() => import('../panels/TransportationPanel.jsx')),
  manufacturing:  lazy(() => import('../panels/ManufacturingPanel.jsx')),
  power:          lazy(() => import('../panels/PowerPanel.jsx')),
  engines:        lazy(() => import('../panels/EnginesPanel.jsx')),
  life_support:   lazy(() => import('../panels/LifeSupportPanel.jsx')),
  comms:          lazy(() => import('../panels/CommunicationsPanel.jsx')),
  mining:         lazy(() => import('../panels/MiningPanel.jsx')),
}

export default function HudGamePage({ consoles, gameState, sendCommand, lastError, lastAck, onExit, connected }) {
  const [index, setIndex] = useState(0)
  const count = consoles.length

  const consoleDef = CONSOLES.find(c => c.id === consoles[index])
  const PanelComp  = PANEL_MAP[consoles[index]] ?? (() => null)
  const isPowerConsole = consoles[index] === 'power'

  // General Systems power check
  const ship = gameState?.ship
  const totalPowerGW   = ship?.net_power_gw ?? 0
  const genSysPct      = ship?.power_allocation?.general_systems ?? 0
  const genSysGW       = (genSysPct / 100) * totalPowerGW
  const lowGenSysPower = gameState != null && genSysGW < 20

  // Game over
  const hullHealth = ship?.hull_health ?? 100
  const isGameOver = gameState != null && hullHealth <= 0

  const prev = () => setIndex(i => (i - 1 + count) % count)
  const next = () => setIndex(i => (i + 1) % count)

  // Clock
  const [clock, setClock] = useState('')
  const clockRef = useRef(null)
  useEffect(() => {
    function tick() {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      setClock(`${hh}:${mm}:${ss}`)
    }
    tick()
    clockRef.current = setInterval(tick, 1000)
    return () => clearInterval(clockRef.current)
  }, [])

  // Top-bar stats from gameState
  const hullPct    = ship?.hull_health ?? '—'
  const fuelAmt    = ship?.fuel != null ? Math.round(ship.fuel).toLocaleString() : '—'
  const systemName = gameState?.current_system?.name ?? '—'
  const crewTotal  = gameState?.crew?.length ?? '—'
  const crewActive = Array.isArray(gameState?.crew)
    ? gameState.crew.filter(c => c.status !== 'OFFLINE').length : '—'

  // Hull colour class
  const hullClass = typeof hullPct === 'number'
    ? (hullPct > 60 ? 'vg' : hullPct > 30 ? 'va' : 'vr')
    : 'vc'

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className={`hud-pip${connected ? '' : ' offline'}`} />

        {gameState && <>
          <span className="hud-tag">
            SYSTEM <b>{systemName}</b>
          </span>
          <span className="hud-tag">
            CREW <b>{crewActive}/{crewTotal}</b>
          </span>
          <span className="hud-tag">
            HULL <b className={`pstat ${hullClass}`}>{typeof hullPct === 'number' ? `${hullPct.toFixed(0)}%` : hullPct}</b>
          </span>
          <span className="hud-tag">
            FUEL <b>{fuelAmt}</b>
          </span>
        </>}

        {/* Console tabs */}
        {count > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
            {consoles.map((id, i) => {
              const c = CONSOLES.find(x => x.id === id)
              return (
                <button
                  key={id}
                  onClick={() => setIndex(i)}
                  style={{
                    width: 10, height: 10, borderRadius: '50%', border: 'none', padding: 0,
                    background: i === index ? (c?.color ?? 'var(--hud-c)') : 'rgba(0,229,255,0.15)',
                    boxShadow: i === index ? `0 0 6px ${c?.color ?? 'var(--hud-c)'}` : 'none',
                    cursor: 'pointer',
                  }}
                />
              )
            })}
          </div>
        )}

        <div className="hud-sp" />
        <span className="hud-clock">{clock}</span>
        <button className="hud-exit" onClick={onExit}>✕ EXIT</button>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="hud-content">

        {count > 1 && (
          <div className="hud-arrow-col left">
            <button className="hud-nav-arrow" onClick={prev} aria-label="Previous console">‹</button>
          </div>
        )}

        <div className="hud-panel-col">
          <div className="po">
            <span className="corn tl" /><span className="corn tr" />
            <span className="corn bl" /><span className="corn br" />

            <div className="hud-panel">
              {/* Panel header */}
              <div className="phdr">
                <span className="pico">{consoleDef?.icon ?? '◈'}</span>
                <span className="ptitle">{consoleDef?.name ?? consoles[index].toUpperCase()}</span>
                <div className="pstat">
                  <span>TICK <span className="vc">{gameState?.tick ?? '—'}</span></span>
                  <span className={connected ? 'vg' : 'vr'}>{connected ? 'LIVE' : 'OFFLINE'}</span>
                </div>
              </div>

              {/* Panel body — hosts the real panel component unchanged */}
              <div className="pbody">
                <Suspense fallback={<HudLoading />}>
                  <PanelComp
                    gameState={gameState}
                    sendCommand={sendCommand}
                    lastError={lastError}
                    lastAck={lastAck}
                  />
                </Suspense>

                {/* Insufficient power overlay */}
                {lowGenSysPower && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(6,24,40,0.82)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 12,
                    pointerEvents: isPowerConsole ? 'none' : 'all',
                    zIndex: 50,
                  }}>
                    <div style={{
                      border: '2px solid #ff3d00',
                      background: 'rgba(255,61,0,0.10)',
                      padding: '20px 36px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 22, color: '#ff3d00', letterSpacing: 4, fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
                        ⚠ INSUFFICIENT POWER
                      </span>
                      <span style={{ fontSize: 13, color: '#ff7a5a', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
                        GENERAL SYSTEMS: {genSysGW.toFixed(1)} GW — MINIMUM 20 GW REQUIRED
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {count > 1 && (
          <div className="hud-arrow-col right">
            <button className="hud-nav-arrow" onClick={next} aria-label="Next console">›</button>
          </div>
        )}
      </div>

      {/* ── Game Over overlay ───────────────────────────────────────────── */}
      {isGameOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(6,24,40,0.95)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <span style={{ fontSize: 48, color: '#ff3d00', fontWeight: 'bold', letterSpacing: 8, fontFamily: 'var(--font-mono)', textShadow: '0 0 30px #ff3d00' }}>
            SHIP DESTROYED
          </span>
          <span style={{ fontSize: 16, color: '#ff7a5a', letterSpacing: 3, fontFamily: 'var(--font-mono)' }}>
            HULL INTEGRITY: 0%
          </span>
          <span style={{ fontSize: 13, color: 'var(--hud-txd)', letterSpacing: 2, marginTop: 8, fontFamily: 'var(--font-mono)' }}>
            TICK {gameState?.tick ?? '—'}
          </span>
          <button className="hud-exit" style={{ marginTop: 20, fontSize: 16, padding: '8px 32px', color: '#ff3d00', borderColor: '#ff3d00' }} onClick={onExit}>
            ✕ EXIT
          </button>
        </div>
      )}
    </div>
  )
}

function HudLoading() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--hud-txd)', fontSize: 16, letterSpacing: 4, fontFamily: 'var(--font-mono)',
    }}>
      LOADING…
    </div>
  )
}
