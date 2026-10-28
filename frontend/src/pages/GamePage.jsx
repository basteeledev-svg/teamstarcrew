import { useState, lazy, Suspense, useEffect, useRef } from 'react'
import { CONSOLES } from '../consoles.js'
import '../hud/hud.css'
import { apiPath } from '../api/paths.js'
import CrewBanner from '../components/CrewBanner.jsx'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
const W = 1280
const H = 800

// Map console id → lazy-loaded panel component
const PANEL_MAP = {
  navigation:     lazy(() => import('../panels/NavigationPanel.jsx')),
  universe:       lazy(() => import('../panels/UniversePanel.jsx')),
  battery:        lazy(() => import('../panels/BatteryPanel.jsx')),
  synthesis:      lazy(() => import('../panels/SynthesisPanel.jsx')),
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
  mission:        lazy(() => import('../panels/MissionPanel.jsx')),
}

export default function GamePage({ consoles, gameState, sendCommand, lastError, lastAck, onExit, connected = true, stationName }) {
  const [index, setIndex] = useState(0)
  const count = consoles.length

  const consoleDef = CONSOLES.find(c => c.id === consoles[index])
  const PanelComp  = PANEL_MAP[consoles[index]] ?? (() => null)
  const isPowerConsole = consoles[index] === 'power'

  // General Systems power check
  const ship = gameState?.ship
  const totalPowerTW   = ship?.net_power_tw ?? 0
  const genSysPct      = ship?.power_allocation?.general_systems ?? 0
  const genSysTW       = (genSysPct / 100) * totalPowerTW
  // Tolerance: TW-locked allocation can drift by ~0.1 TW from rounding
  const lowGenSysPower = gameState != null && genSysTW < 19.9

  // Game over
  const hullHealth  = ship?.hull_health ?? 100
  const gameOverReason = gameState?.game_over_reason ?? null
  const lsCountdown    = gameState?.life_support_countdown ?? 0
  const isGameOver = gameState != null && (hullHealth <= 0 || gameOverReason != null)

  async function handleRestart() {
    const pc = gameState?.player_count ?? 6
    await fetch(apiPath('/api/game/start') + '?player_count=' + pc + '&mode=full', { method: 'POST' })
  }

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
  const fuelAmt    = (() => { const f = ship?.rooms?.engine_bay?.fuel ?? null; return f != null ? Math.round(f).toLocaleString() : '—' })()
  const systemName = gameState?.current_system?.name ?? '—'
  const o2Reserves = ship?.oxygen_reserves ?? null
  const o2Color    = o2Reserves == null ? 'var(--hud-c)' : o2Reserves > 100 ? 'var(--accent-green)' : o2Reserves > 30 ? 'var(--accent-amber)' : 'var(--hud-cr)'

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
          <span className="hud-tag">SYSTEM <b>{systemName}</b></span>
          <span className="hud-tag">
            HULL <b className={`pstat ${hullClass}`}>
              {typeof hullPct === 'number' ? `${hullPct.toFixed(0)}%` : hullPct}
            </b>
          </span>
          <span className="hud-tag">FUEL <b>{fuelAmt}</b></span>
          {o2Reserves != null && (
            <span className="hud-tag" style={{ color: o2Color }}>O2 <b>{Math.round(o2Reserves)}</b></span>
          )}
        </>}

        {/* Console pip tabs */}
        {count > 1 && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            {consoles.map((id, i) => {
              const c = CONSOLES.find(x => x.id === id)
              return (
                <button
                  key={id}
                  onClick={() => setIndex(i)}
                  aria-label={c?.name}
                  style={{
                    width: 12, height: 12, borderRadius: '50%', border: 'none', padding: 0,
                    background: i === index ? (c?.color ?? 'var(--hud-c)') : 'rgba(0,229,255,0.15)',
                    boxShadow: i === index ? `0 0 8px ${c?.color ?? 'var(--hud-c)'}` : 'none',
                    cursor: 'pointer',
                  }}
                />
              )
            })}
          </div>
        )}

        <span className="hud-sp" />
        <span className="hud-clock">{clock}</span>
        <button className="hud-exit" onClick={onExit}>✕ EXIT</button>
      </div>

      <CrewBanner gameState={gameState} sendCommand={sendCommand} stationName={stationName} />

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
                <span className="pico" style={{ color: consoleDef?.color ?? 'var(--hud-c)' }}>
                  {consoleDef?.icon ?? '◈'}
                </span>
                <span className="ptitle">{consoleDef?.name ?? consoles[index].toUpperCase()}</span>
                <div className="pstat">
                  <span>TICK <span className="vc">{gameState?.tick ?? '—'}</span></span>
                  <span className={connected ? 'vg' : 'vr'}>{connected ? '● LIVE' : '○ OFFLINE'}</span>
                </div>
              </div>

              {/* Panel body */}
              <div className="pbody">
                <Suspense fallback={<HudLoading />}>
                  <PanelComp
                    gameState={gameState}
                    sendCommand={sendCommand}
                    lastError={lastError}
                    lastAck={lastAck}
                    stationName={stationName}
                  />
                </Suspense>

                {/* Insufficient power overlay */}
                {lowGenSysPower && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(6,24,40,0.82)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 14,
                    pointerEvents: isPowerConsole ? 'none' : 'all',
                    zIndex: 50,
                  }}>
                    <div style={{
                      border: '2px solid var(--hud-cr)',
                      background: 'rgba(255,61,0,0.12)',
                      boxShadow: '0 0 20px rgba(255,61,0,0.4)',
                      padding: '20px 36px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      pointerEvents: 'none',
                    }}>
                      <span style={{
                        fontSize: 24, color: 'var(--hud-cr)', letterSpacing: 5, fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)', textShadow: '0 0 10px var(--hud-cr)',
                      }}>
                        ⚠ INSUFFICIENT POWER
                      </span>
                      <span style={{
                        fontSize: 14, color: '#ff7a5a', letterSpacing: 2, fontFamily: 'var(--font-mono)',
                      }}>
                        GENERAL SYSTEMS: {genSysTW.toFixed(1)} TW — MINIMUM 20 TW REQUIRED
                      </span>
                      {isPowerConsole && (
                        <span style={{ fontSize: 12, color: '#ff7a5a99', letterSpacing: 1.5, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          ALLOCATE MORE POWER TO GENERAL SYSTEMS
                        </span>
                      )}
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

      {/* ── Life-support critical warning (20 ticks before game over) ─── */}
      {!isGameOver && lsCountdown > 0 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 90,
          background: 'rgba(200,0,0,0.88)', padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ fontSize: 16, color: '#fff', letterSpacing: 3, fontWeight: 'bold' }}>
            ⚠ LIFE SUPPORT CRITICAL
          </span>
          <span style={{ fontSize: 13, color: '#ffaaaa', letterSpacing: 2 }}>
            CREW DEATH IN {20 - lsCountdown} TICKS — RESTORE O2 OR RATIONS
          </span>
        </div>
      )}

      {/* ── Game Over overlay ───────────────────────────────────────────── */}
      {isGameOver && (() => {
        const isAsphyxiated = gameOverReason === 'crew_asphyxiated'
        const title = isAsphyxiated ? 'CREW LOST' : 'SHIP DESTROYED'
        const sub   = isAsphyxiated ? 'LIFE SUPPORT FAILURE — ALL HANDS LOST' : `HULL INTEGRITY: ${hullHealth.toFixed(0)}%`
        return (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'rgba(6,24,40,0.96)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <span style={{
              fontSize: 52, color: 'var(--hud-cr)', fontWeight: 'bold', letterSpacing: 8,
              fontFamily: 'var(--font-mono)', textShadow: '0 0 40px var(--hud-cr)',
            }}>
              {title}
            </span>
            <span style={{ fontSize: 16, color: '#ff7a5a', letterSpacing: 3, fontFamily: 'var(--font-mono)' }}>
              {sub}
            </span>
            <span style={{ fontSize: 12, color: 'var(--hud-txd)', letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>
              SURVIVED {gameState?.tick ?? 0} TICKS ({Math.floor((gameState?.tick ?? 0) / 60)}m {(gameState?.tick ?? 0) % 60}s)
            </span>
            <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
              <button
                className="hbtn hbtn-md grn"
                style={{ letterSpacing: 3, minWidth: 160 }}
                onClick={handleRestart}
              >
                ↺ NEW GAME
              </button>
              <button
                className="hud-exit"
                style={{ fontSize: 14, padding: '8px 24px', color: 'var(--hud-cr)', borderColor: 'var(--hud-cr)' }}
                onClick={onExit}
              >
                ✕ EXIT
              </button>
            </div>
          </div>
        )
      })()}
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
