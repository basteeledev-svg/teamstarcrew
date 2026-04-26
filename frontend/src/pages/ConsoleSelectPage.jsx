import { useState } from 'react'
import { CONSOLES } from '../consoles.js'
import { CREW_LAYOUTS } from '../crewLayouts.js'
import { Btn } from '../components/ui'

const W = 1280
const H = 800
const MAX_CUSTOM_SELECTION = 4

/**
 * Station/role picker shown when a game is running.
 *
 * Default mode: "ROLE" — players pick a pre-defined role from the layout for
 * the current game's player_count.
 * Fallback mode: "CUSTOM" — free-pick up to 4 stations (preserves the old
 * workflow + existing tests).
 */
export default function ConsoleSelectPage({ gameState, onEnter, onNewGame, onStyle }) {
  const playerCount = gameState?.player_count ?? 6
  const layout      = CREW_LAYOUTS[playerCount] ?? CREW_LAYOUTS[6]

  const [mode, setMode]         = useState('role')   // 'role' | 'custom'
  const [selected, setSelected] = useState([])

  function toggleCustom(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_CUSTOM_SELECTION) return prev
      return [...prev, id]
    })
  }

  function pickRole(role, hud = false) {
    onEnter({ role: 'crew', consoles: role.consoles, mode: hud ? 'hud' : undefined })
  }

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
          ★ TEAM STAR CREW
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 2 }}>
          STATION SELECTION · {playerCount}-PLAYER CREW
        </span>

        {/* Mode toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 0 }}>
          <ModeTab active={mode === 'role'}   onClick={() => setMode('role')}>ROLES</ModeTab>
          <ModeTab active={mode === 'custom'} onClick={() => setMode('custom')}>CUSTOM</ModeTab>
        </div>
      </div>

      {/* Body */}
      {mode === 'role' ? (
        <RolePicker layout={layout} onPick={pickRole} />
      ) : (
        <CustomPicker selected={selected} toggle={toggleCustom} />
      )}

      {/* Footer */}
      <div style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {mode === 'custom' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selected.map(id => {
              const c = CONSOLES.find(x => x.id === id)
              return (
                <span key={id} style={{
                  fontSize: 10, padding: '3px 10px',
                  border: `1px solid ${c.color}`, color: c.color,
                  borderRadius: 2, letterSpacing: 1,
                }}>
                  {c.icon} {c.name}
                </span>
              )
            })}
          </div>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
            TAP A ROLE TO TAKE THAT TABLET. EVERY ROLE IS ASSIGNED INDEPENDENTLY.
          </span>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn onClick={onNewGame}
               color="var(--accent-amber)" borderColor="var(--accent-amber)"
               style={{ padding: '8px 16px', letterSpacing: 2, fontSize: 11 }}>
            ✦ NEW GAME
          </Btn>
          <Btn onClick={onStyle}
               color="var(--accent-cyan)" borderColor="var(--border)"
               style={{ padding: '8px 16px', letterSpacing: 2, fontSize: 11 }}>
            STYLE LAB
          </Btn>
          <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <Btn onClick={() => onEnter({ role: 'observer' })}
               color="var(--text-muted)" borderColor="var(--text-dim)"
               style={{ padding: '8px 18px', letterSpacing: 2, fontSize: 11 }}>
            OBSERVER
          </Btn>
          <Btn data-testid="admin-btn"
               onClick={() => onEnter({ role: 'admin' })}
               color="var(--text-muted)" borderColor="var(--text-dim)"
               style={{ padding: '8px 18px', letterSpacing: 2, fontSize: 11 }}>
            ADMIN
          </Btn>

          {mode === 'custom' && (
            <>
              <Btn
                data-testid="hud-btn"
                disabled={selected.length === 0}
                onClick={() => onEnter({ role: 'crew', consoles: selected, mode: 'hud' })}
                color="var(--accent-cyan)" bg="var(--tint-accent)"
                style={{
                  padding: '8px 18px', letterSpacing: 2, fontSize: 12,
                  opacity: selected.length === 0 ? 0.3 : 1,
                  cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ★ HUD MODE
              </Btn>
              <Btn
                data-testid="enter-btn"
                disabled={selected.length === 0}
                onClick={() => onEnter({ role: 'crew', consoles: selected })}
                color="var(--accent-green)" bg="var(--tint-success)"
                style={{
                  padding: '8px 28px', letterSpacing: 2, fontSize: 12,
                  opacity: selected.length === 0 ? 0.3 : 1,
                  cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ENTER SHIP →
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Role-picker body ─────────────────────────────────────────────────────────
function RolePicker({ layout, onPick }) {
  const cols = layout.length <= 6 ? 3 : layout.length <= 8 ? 4 : 5
  return (
    <div style={{ flex: 1, padding: '20px 32px', overflowY: 'auto', minHeight: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 14, alignContent: 'start',
      }}>
        {layout.map(role => (
          <div key={role.id} style={{
            border: `1px solid ${role.color}`,
            background: `${role.color}10`,
            padding: '14px 14px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24, color: role.color }}>{role.icon}</span>
              <span style={{ fontSize: 12, color: role.color, letterSpacing: 2.5, fontWeight: 'bold' }}>
                {role.name}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, lineHeight: 1.4 }}>
              {role.desc}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {role.consoles.map(cid => {
                const c = CONSOLES.find(x => x.id === cid)
                if (!c) return null
                return (
                  <span key={cid} style={{
                    fontSize: 9, padding: '2px 6px',
                    color: c.color,
                    border: `1px solid ${c.color}40`,
                    letterSpacing: 1,
                  }}>
                    {c.icon} {c.name}
                  </span>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
              <button
                data-testid={`role-btn-${role.id}`}
                onClick={() => onPick(role, false)}
                style={{
                  flex: 1,
                  background: 'var(--tint-success)',
                  border: '1px solid var(--accent-green)',
                  color: 'var(--accent-green)',
                  padding: '6px 0', fontSize: 11, letterSpacing: 2,
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  borderRadius: 'var(--btn-radius, 2px)',
                }}>
                TAKE STATION →
              </button>
              <button
                data-testid={`role-hud-btn-${role.id}`}
                onClick={() => onPick(role, true)}
                title="Enter with HUD theme"
                style={{
                  background: 'var(--tint-accent)',
                  border: '1px solid var(--accent-cyan)',
                  color: 'var(--accent-cyan)',
                  padding: '6px 10px', fontSize: 11, letterSpacing: 2,
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  borderRadius: 'var(--btn-radius, 2px)',
                }}>
                ★
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Custom-picker body (legacy free-select) ──────────────────────────────────
function CustomPicker({ selected, toggle }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 32px 16px', minHeight: 0 }}>
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16, letterSpacing: 1 }}>
        SELECT 1–{MAX_CUSTOM_SELECTION} STATIONS FOR THIS TABLET. TAP TO TOGGLE.
        ({selected.length} / {MAX_CUSTOM_SELECTION})
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
        flex: 1, overflowY: 'auto',
      }}>
        {CONSOLES.map(c => {
          const isSelected = selected.includes(c.id)
          const isDisabled = !isSelected && selected.length >= MAX_CUSTOM_SELECTION
          return (
            <button
              key={c.id}
              data-testid={`console-btn-${c.id}`}
              onClick={() => toggle(c.id)}
              disabled={isDisabled}
              style={{
                background: isSelected ? `${c.color}18` : 'var(--bg-card)',
                border: `1px solid ${isSelected ? c.color : 'var(--border)'}`,
                borderRadius: 4, padding: '14px 12px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                opacity: isDisabled ? 0.35 : 1,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <span style={{ fontSize: 22, color: isSelected ? c.color : 'var(--text-dim)' }}>{c.icon}</span>
                {isSelected && (
                  <span style={{
                    marginLeft: 'auto', background: c.color, color: 'var(--bg-base)',
                    fontSize: 9, fontWeight: 'bold', padding: '2px 5px',
                    borderRadius: 2, letterSpacing: 1,
                  }}>
                    #{selected.indexOf(c.id) + 1}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: isSelected ? c.color : 'var(--text-secondary)', letterSpacing: 1.5 }}>
                {c.name}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.4 }}>{c.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ModeTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 18px',
      background: active ? 'var(--tint-accent)' : 'transparent',
      border: '1px solid var(--border)',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
      cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}
