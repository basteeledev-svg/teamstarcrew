import { useState, useEffect } from 'react'
import { CONSOLES } from '../consoles.js'
import { apiPath, BASE_PATH } from '../api/paths.js'
import '../hud/hud.css'

const W = 1280
const H = 800

export default function StationJoinPage({ code, gameState, onEnter }) {
  const [station, setStation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function fetchStation() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiPath(`/api/stations/${code}`))
      if (r.status === 404) { setError('Station code not found. Check the code and try again.'); return }
      if (r.status === 503) { setError('Game has not started yet.'); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setStation(await r.json())
    } catch (e) {
      setError(String(e.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStation() }, [code])

  // Retry once the game transitions to running (handles "waiting for GM" case)
  useEffect(() => {
    if (gameState?.status === 'running' && error?.includes('started')) fetchStation()
  }, [gameState?.status])

  const isRunning = gameState?.status === 'running'
  const mainHref  = BASE_PATH || '/'

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className="hud-pip" />
        <span className="hud-tag">
          STATION CODE <b style={{ letterSpacing: 6 }}>{code}</b>
        </span>
        <span className="hud-sp" />
        <a href={mainHref} style={{
          fontSize: 12, color: 'var(--hud-txd)', letterSpacing: 2,
          textDecoration: 'none', fontFamily: 'var(--font-mono)', padding: '0 12px',
        }}>
          ← MAIN
        </a>
      </div>

      <div className="hud-content" style={{ padding: '12px', alignItems: 'center', justifyContent: 'center' }}>
        <div className="po" style={{ flex: '0 0 auto', width: 520 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel" style={{ minHeight: 340 }}>

            {loading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--hud-txd)', letterSpacing: 3, fontSize: 14 }}>LOADING…</span>
              </div>
            )}

            {!loading && error && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
                <span style={{ fontSize: 36, color: 'var(--hud-cr)' }}>⚠</span>
                <span style={{ color: 'var(--hud-cr)', letterSpacing: 2, fontSize: 13, textAlign: 'center' }}>
                  {error}
                </span>
                {!isRunning && (
                  <span style={{ color: 'var(--hud-txd)', fontSize: 12, letterSpacing: 1, textAlign: 'center' }}>
                    Waiting for the GM to start the game…
                  </span>
                )}
                <button onClick={fetchStation} className="hud-chip" style={{ marginTop: 8, height: 40, fontSize: 11, letterSpacing: 2 }}>
                  RETRY
                </button>
              </div>
            )}

            {!loading && station && (
              <>
                <div className="phdr">
                  <span className="pico" style={{ color: station.color }}>{station.icon}</span>
                  <span className="ptitle" style={{ color: station.color }}>{station.name}</span>
                  <span className="pstat">
                    <span style={{ color: isRunning ? 'var(--status-good)' : 'var(--hud-txd)' }}>
                      {isRunning ? '● GAME LIVE' : '○ WAITING'}
                    </span>
                  </span>
                </div>

                <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--hud-txd)', letterSpacing: 3 }}>YOUR PANELS</div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {station.panels.map(pid => {
                      const c = CONSOLES.find(x => x.id === pid)
                      return c ? (
                        <div key={pid} style={{
                          border: `1px solid ${c.color}`, background: `${c.color}14`,
                          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
                          boxShadow: `0 0 8px ${c.color}33`,
                        }}>
                          <span style={{ fontSize: 20, color: c.color }}>{c.icon}</span>
                          <div>
                            <div style={{ fontSize: 11, color: c.color, letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>{c.name}</div>
                            <div style={{ fontSize: 9, color: 'var(--hud-txd)', letterSpacing: 1 }}>{c.desc}</div>
                          </div>
                        </div>
                      ) : null
                    })}
                  </div>

                  {isRunning ? (
                    <button
                      onClick={() => onEnter({ role: 'crew', consoles: station.panels })}
                      className="hbtn hbtn-md grn"
                      style={{ letterSpacing: 3, marginTop: 4 }}
                    >
                      ENTER SHIP →
                    </button>
                  ) : (
                    <div style={{
                      padding: '12px 24px',
                      border: '1px solid rgba(0,229,255,0.3)',
                      color: 'var(--hud-txd)', fontSize: 12, letterSpacing: 2,
                    }}>
                      WAITING FOR GAME TO START…
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: 'var(--hud-txd)', letterSpacing: 1, marginTop: 'auto', textAlign: 'center' }}>
                    YOUR CODE: {code} · BOOKMARK THIS PAGE TO REJOIN AFTER DISCONNECT
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
