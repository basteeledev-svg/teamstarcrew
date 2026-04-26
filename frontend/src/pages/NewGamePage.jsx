import { useState } from 'react'
import { Btn } from '../components/ui'
import { ALLOWED_PLAYER_COUNTS, CREW_LAYOUTS } from '../crewLayouts.js'

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
    <div style={{
      width: W, height: H, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)', color: 'var(--text-body)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 32px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: 24,
      }}>
        <span style={{ fontSize: 20, letterSpacing: 4, color: 'var(--text-primary)' }}>
          ★ NEW GAME
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2 }}>
          GENERATE GALAXY · CHOOSE CREW SIZE
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', padding: '20px 32px', gap: 24, minHeight: 0 }}>
        {/* Left column — settings */}
        <div style={{
          flex: '0 0 380px',
          display: 'flex', flexDirection: 'column', gap: 22,
        }}>
          {/* Player count */}
          <div>
            <Label>CREW SIZE</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {ALLOWED_PLAYER_COUNTS.map(n => (
                <button key={n}
                  data-testid={`pc-btn-${n}`}
                  onClick={() => setPlayerCount(n)}
                  style={{
                    padding: '14px 0',
                    background: playerCount === n ? 'var(--tint-accent)' : 'var(--bg-card)',
                    border: `1px solid ${playerCount === n ? 'var(--accent)' : 'var(--border)'}`,
                    color: playerCount === n ? 'var(--accent)' : 'var(--text-body)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 18, letterSpacing: 2,
                    cursor: 'pointer',
                    borderRadius: 'var(--btn-radius, 2px)',
                  }}>
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, marginTop: 6 }}>
              ALLOWED: 4, 5, 6, 8, OR 10 PLAYERS
            </div>
          </div>

          {/* Game mode */}
          <div>
            <Label>MODE</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { id: 'full',  name: 'FULL',  desc: 'NPCs + story' },
                { id: 'empty', name: 'EMPTY', desc: 'physics sandbox' },
              ].map(m => (
                <button key={m.id}
                  onClick={() => setMode(m.id)}
                  style={{
                    padding: '10px',
                    background: mode === m.id ? 'var(--tint-accent)' : 'var(--bg-card)',
                    border: `1px solid ${mode === m.id ? 'var(--accent)' : 'var(--border)'}`,
                    color: mode === m.id ? 'var(--accent)' : 'var(--text-body)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12, letterSpacing: 2,
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                    borderRadius: 'var(--btn-radius, 2px)',
                  }}>
                  <span>{m.name}</span>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seed */}
          <div>
            <Label>SEED <span style={{ color: 'var(--text-dim)' }}>(optional)</span></Label>
            <input
              type="text"
              value={seed}
              onChange={e => setSeed(e.target.value)}
              placeholder="leave blank for random"
              style={{
                width: '100%', padding: '8px 10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-bright)',
                fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1,
                outline: 'none',
                borderRadius: 'var(--btn-radius, 2px)',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: 10, fontSize: 10,
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)', letterSpacing: 1,
            }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Right column — role preview */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          padding: 16, minWidth: 0,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--text-muted)', marginBottom: 10 }}>
            CREW LAYOUT — {playerCount} ROLES
          </div>
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: playerCount <= 6 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
            gap: 8, overflowY: 'auto', alignContent: 'start',
          }}>
            {layout.map(role => (
              <div key={role.id} style={{
                padding: '10px 12px',
                border: `1px solid ${role.color}`,
                background: `${role.color}10`,
                display: 'flex', flexDirection: 'column', gap: 4,
                minHeight: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, color: role.color }}>{role.icon}</span>
                  <span style={{ fontSize: 11, color: role.color, letterSpacing: 2, fontWeight: 'bold' }}>
                    {role.name}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, lineHeight: 1.4 }}>
                  {role.desc}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: 1, marginTop: 2 }}>
                  {role.consoles.map(c => c.toUpperCase().replace('_', ' ')).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
      }}>
        <Btn onClick={onCancel} disabled={busy}
             color="var(--text-muted)" borderColor="var(--text-dim)"
             style={{ padding: '8px 18px', letterSpacing: 2 }}>
          CANCEL
        </Btn>
        <Btn
          data-testid="confirm-new-game-btn"
          onClick={startGame}
          disabled={busy}
          color="var(--accent-green)" bg="var(--tint-success)"
          style={{
            padding: '8px 28px', letterSpacing: 3, fontSize: 13,
            opacity: busy ? 0.4 : 1, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'GENERATING…' : 'GENERATE GALAXY →'}
        </Btn>
      </div>
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 3, color: 'var(--text-muted)', marginBottom: 6 }}>
      {children}
    </div>
  )
}
