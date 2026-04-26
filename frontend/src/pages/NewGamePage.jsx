import { useState } from 'react'
import { ALLOWED_PLAYER_COUNTS, CREW_LAYOUTS } from '../crewLayouts.js'
import '../hud/hud.css'

const W = 1280
const H = 800

export default function NewGamePage({ onCancel, onStarted }) {
  const [playerCount, setPlayerCount] = useState(6)
  const [seed,        setSeed]        = useState('')
  const [mode,        setMode]        = useState('full')      // 'full' | 'empty'
  const [busy,        setBusy]        = useState(false)
  const [error,       setError]       = useState(null)

  async function startGame() {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('mode', mode)
      params.set('player_count', String(playerCount))
      if (seed.trim()) params.set('seed', seed.trim())
      const r = await fetch(`/api/game/start?${params.toString()}`, { method: 'POST' })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(`HTTP ${r.status}: ${txt}`)
      }
      const data = await r.json()
      onStarted?.(data)
    } catch (e) {
      setError(String(e.message ?? e))
      setBusy(false)
    }
  }

  const layout = CREW_LAYOUTS[playerCount] ?? []

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="hud-top">
        <span className="hud-logo">★ NEW GAME</span>
        <span className="hud-tag">GENERATE GALAXY · CHOOSE CREW SIZE</span>
        <span className="hud-sp" />
        <button onClick={onCancel} className="hud-exit">EXIT</button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="hud-content" style={{ padding: '12px 12px 8px', gap: 12 }}>

        {/* Settings panel */}
        <div className="po" style={{ flex: '0 0 440px' }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>⚙</span>
              <span className="ptitle">CONFIGURATION</span>
            </div>

            <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}>
              {/* Crew size */}
              <div>
                <div className="hud-slbl">CREW SIZE</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {ALLOWED_PLAYER_COUNTS.map(n => (
                    <button
                      key={n}
                      data-testid={`pc-btn-${n}`}
                      onClick={() => setPlayerCount(n)}
                      className={`hud-chip${playerCount === n ? ' on' : ''}`}
                      style={{ height: 60, fontSize: 26, letterSpacing: 0 }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: 'var(--hud-txd)', letterSpacing: 2, marginTop: 8 }}>
                  ALLOWED: 4 · 5 · 6 · 8 · 10 PLAYERS
                </div>
              </div>

              {/* Mode */}
              <div>
                <div className="hud-slbl">MODE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { id: 'full',  name: 'FULL',  desc: 'NPCS + STORY' },
                    { id: 'empty', name: 'EMPTY', desc: 'PHYSICS SANDBOX' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`hud-chip${mode === m.id ? ' on' : ''}`}
                      style={{ height: 70, flexDirection: 'column', gap: 4, letterSpacing: 3 }}
                    >
                      <span style={{ fontSize: 18 }}>{m.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--hud-txd)', letterSpacing: 2 }}>{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Seed */}
              <div>
                <div className="hud-slbl">SEED <span style={{ color: 'var(--hud-txd)' }}>(OPTIONAL)</span></div>
                <input
                  type="text"
                  value={seed}
                  onChange={e => setSeed(e.target.value)}
                  placeholder="LEAVE BLANK FOR RANDOM"
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    background: 'rgba(0,229,255,0.04)',
                    border: '1px solid rgba(0,229,255,0.25)',
                    color: 'var(--hud-txb)',
                    fontFamily: 'var(--font-mono)', fontSize: 16, letterSpacing: 2,
                    outline: 'none',
                    borderRadius: 0,
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 12px', fontSize: 13, letterSpacing: 2,
                  border: '1px solid var(--hud-cr)',
                  color: 'var(--hud-cr)',
                  background: 'rgba(255,61,0,0.08)',
                }}>
                  ⚠ {error}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Crew preview panel */}
        <div className="po" style={{ flex: 1 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-cg)' }}>◈</span>
              <span className="ptitle">CREW LAYOUT</span>
              <span className="pstat">
                <span><span className="vc">{playerCount}</span> ROLES</span>
              </span>
            </div>

            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: playerCount <= 6 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                gap: 10,
              }}>
                {layout.map(role => (
                  <div key={role.id} style={{
                    padding: '12px 14px',
                    border: `1px solid ${role.color}`,
                    background: `${role.color}14`,
                    boxShadow: `0 0 8px ${role.color}33`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22, color: role.color, textShadow: `0 0 6px ${role.color}` }}>
                        {role.icon}
                      </span>
                      <span style={{ fontSize: 14, color: role.color, letterSpacing: 3, fontWeight: 'bold' }}>
                        {role.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--hud-tx)', letterSpacing: 1, lineHeight: 1.5 }}>
                      {role.desc}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--hud-txd)', letterSpacing: 2, marginTop: 2 }}>
                      {role.consoles.map(c => c.toUpperCase().replace(/_/g, ' ')).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 32px',
        borderTop: '1px solid rgba(0,229,255,0.18)',
        background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.04) 60%, rgba(0,229,255,0.10))',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16,
      }}>
        <button
          onClick={onCancel}
          disabled={busy}
          className="hud-chip"
          style={{ width: 130, height: 50, letterSpacing: 3 }}
        >
          CANCEL
        </button>
        <button
          data-testid="confirm-new-game-btn"
          onClick={startGame}
          disabled={busy}
          className="hbtn hbtn-md grn"
          style={{ letterSpacing: 3 }}
        >
          {busy ? 'GENERATING…' : 'GENERATE GALAXY →'}
        </button>
      </div>
    </div>
  )
}
