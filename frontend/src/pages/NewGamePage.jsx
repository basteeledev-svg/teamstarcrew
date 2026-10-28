import { useState } from 'react'
import { apiPath } from '../api/paths.js'
import '../hud/hud.css'


export default function NewGamePage({ onCancel, onStarted }) {
  const [seed, setSeed]   = useState('')
  const [mode, setMode]   = useState('full')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  async function startGame() {
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('mode', mode)
      params.set('player_count', '6')
      if (seed.trim()) params.set('seed', seed.trim())
      const r = await fetch(`${apiPath('/api/game/start')}?${params.toString()}`, { method: 'POST' })
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

  return (
    <div className="hud-wrap" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ NEW GAME</span>
        <span className="hud-sp" />
        <button onClick={onCancel} className="hud-exit">EXIT</button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="po" style={{ width: 500 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>⚙</span>
              <span className="ptitle">CONFIGURATION</span>
            </div>

            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
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
                    outline: 'none', borderRadius: 0,
                  }}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 12px', fontSize: 13, letterSpacing: 2,
                  border: '1px solid var(--hud-cr)', color: 'var(--hud-cr)',
                  background: 'rgba(255,61,0,0.08)',
                }}>
                  ⚠ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
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
          </div>
        </div>
      </div>
    </div>
  )
}