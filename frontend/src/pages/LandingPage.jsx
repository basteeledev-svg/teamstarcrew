import { useEffect, useRef, useState } from 'react'
import '../hud/hud.css'

const W = 1280
const H = 800

export default function LandingPage({ gameState, onNewGame, onJoin, onObserver, onAdmin, onStyle }) {
  const isRunning   = gameState?.status === 'running'
  const tick        = gameState?.tick ?? 0
  const playerCount = gameState?.player_count ?? null
  const systemName  = gameState?.current_system?.name ?? '—'
  const hull        = gameState?.ship?.hull_health
  const fuel        = gameState?.ship?.fuel

  const clock = useClock()

  const hullClass =
    typeof hull === 'number' ? (hull > 60 ? 'g' : hull > 30 ? 'a' : 'r') : 'c'

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className={`hud-pip${isRunning ? '' : ' offline'}`} />
        <span className="hud-tag">
          STATUS <b>{isRunning ? 'IN PROGRESS' : 'STANDBY'}</b>
        </span>
        <span className="hud-sp" />
        <span className="hud-clock">{clock}</span>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="hud-content" style={{ padding: '24px 48px', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>

        {/* Status panel */}
        <div className="po" style={{ flex: '0 0 auto', width: 720, height: isRunning ? 220 : 160 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: isRunning ? 'var(--hud-cg)' : 'var(--hud-txd)' }}>
                {isRunning ? '◉' : '○'}
              </span>
              <span className="ptitle">
                {isRunning ? 'GAME IN PROGRESS' : 'NO GAME RUNNING'}
              </span>
              {isRunning && (
                <span className="pstat">
                  <span>TICK <span className="vc">{tick}</span></span>
                </span>
              )}
            </div>
            <div style={{ flex: 1, padding: '20px 32px', display: 'flex', alignItems: 'center', minHeight: 0 }}>
              {isRunning ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, width: '100%' }}>
                  <Stat label="CREW SIZE"  value={playerCount ? `${playerCount} PLAYERS` : '—'} />
                  <Stat label="SYSTEM"     value={systemName} />
                  <Stat label="HULL"       value={typeof hull === 'number' ? `${hull.toFixed(0)}%` : '—'} cls={hullClass} />
                  <Stat label="FUEL"       value={typeof fuel === 'number' ? Math.round(fuel).toLocaleString() : '—'} />
                </div>
              ) : (
                <div style={{ fontSize: 18, color: 'var(--hud-tx)', letterSpacing: 3, lineHeight: 1.6 }}>
                  NO ACTIVE GAME. START A NEW MISSION TO GENERATE A GALAXY
                  AND ASSIGN CREW STATIONS.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {isRunning && (
            <button
              data-testid="join-btn"
              onClick={onJoin}
              className="hbtn hbtn-lg grn"
              style={{ letterSpacing: 4 }}
            >
              JOIN CURRENT GAME →
            </button>
          )}
          <button
            data-testid="new-game-btn"
            onClick={onNewGame}
            className={`hbtn hbtn-lg ${isRunning ? 'amb' : 'pri'}`}
            style={{ letterSpacing: 4 }}
          >
            ✦ NEW GAME
          </button>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 32px',
        borderTop: '1px solid rgba(0,229,255,0.18)',
        background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.04) 60%, rgba(0,229,255,0.10))',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
      }}>
        <button onClick={onStyle} className="hud-chip" style={{ width: 130, height: 44 }}>
          ✦ STYLE LAB
        </button>
        <button onClick={onObserver} className="hud-chip" style={{ width: 110, height: 44 }}>
          OBSERVER
        </button>
        <button data-testid="admin-btn" onClick={onAdmin} className="hud-chip dan" style={{ width: 90, height: 44 }}>
          ADMIN
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, cls = 'c' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--hud-txd)', letterSpacing: 3 }}>{label}</span>
      <span className={`hud-rv ${cls}`} style={{ fontSize: 26 }}>{value}</span>
    </div>
  )
}

function useClock() {
  const [c, setC] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const t = () => {
      const n = new Date()
      setC(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`)
    }
    t()
    ref.current = setInterval(t, 1000)
    return () => clearInterval(ref.current)
  }, [])
  return c
}
