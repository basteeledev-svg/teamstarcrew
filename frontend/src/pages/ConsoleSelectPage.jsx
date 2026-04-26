import { useState } from 'react'
import { CONSOLES } from '../consoles.js'
import { CREW_LAYOUTS } from '../crewLayouts.js'
import '../hud/hud.css'

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

  function pickRole(role) {
    onEnter({ role: 'crew', consoles: role.consoles })
  }

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className="hud-pip" />
        <span className="hud-tag">
          STATION SELECT · <b>{playerCount}-PLAYER CREW</b>
        </span>
        <span className="hud-sp" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="mode-role-btn"
                  className={`hud-chip${mode === 'role' ? ' on' : ''}`}
                  onClick={() => setMode('role')}
                  style={{ width: 110, height: 50 }}>ROLES</button>
          <button data-testid="mode-custom-btn"
                  className={`hud-chip${mode === 'custom' ? ' on' : ''}`}
                  onClick={() => setMode('custom')}
                  style={{ width: 110, height: 50 }}>CUSTOM</button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="hud-content" style={{ padding: '12px' }}>
        <div className="po" style={{ flex: 1 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>
                {mode === 'role' ? '◈' : '◇'}
              </span>
              <span className="ptitle">
                {mode === 'role' ? 'CREW ROSTER' : 'CUSTOM STATION PICK'}
              </span>
              <span className="pstat">
                {mode === 'role' ? (
                  <span>TAP A ROLE TO TAKE THAT TABLET</span>
                ) : (
                  <span>SELECT 1–{MAX_CUSTOM_SELECTION} STATIONS · <span className="vc">{selected.length}</span>/{MAX_CUSTOM_SELECTION}</span>
                )}
              </span>
            </div>

            {mode === 'role' ? (
              <RolePicker layout={layout} onPick={pickRole} />
            ) : (
              <CustomPicker selected={selected} toggle={toggleCustom} />
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid rgba(0,229,255,0.18)',
        background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.04) 60%, rgba(0,229,255,0.10))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {/* Left side: selection chips (custom only) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {mode === 'custom' && selected.map(id => {
            const c = CONSOLES.find(x => x.id === id)
            return (
              <span key={id} style={{
                fontSize: 13, padding: '5px 12px',
                border: `1px solid ${c.color}`, color: c.color,
                background: `${c.color}14`,
                letterSpacing: 2,
                boxShadow: `0 0 4px ${c.color}66`,
              }}>
                {c.icon} {c.name}
              </span>
            )
          })}
        </div>

        {/* Right side: action buttons */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={onNewGame} className="hud-chip amb" style={{ width: 130, height: 50, color: 'var(--hud-ca)' }}>
            ✦ NEW GAME
          </button>
          <button onClick={onStyle} className="hud-chip" style={{ width: 110, height: 50 }}>
            STYLE LAB
          </button>
          <button onClick={() => onEnter({ role: 'observer' })} className="hud-chip" style={{ width: 110, height: 50 }}>
            OBSERVER
          </button>
          <button data-testid="admin-btn" onClick={() => onEnter({ role: 'admin' })}
                  className="hud-chip" style={{ width: 90, height: 50 }}>
            ADMIN
          </button>

          {mode === 'custom' && (
            <button
              data-testid="enter-btn"
              disabled={selected.length === 0}
              onClick={() => onEnter({ role: 'crew', consoles: selected })}
              className="hbtn hbtn-md grn"
              style={{ letterSpacing: 3 }}
            >
              ENTER SHIP →
            </button>
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
    <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12, alignContent: 'start',
      }}>
        {layout.map(role => (
          <div key={role.id} style={{
            border: `1px solid ${role.color}`,
            background: `${role.color}14`,
            boxShadow: `0 0 8px ${role.color}33`,
            padding: '14px 14px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, color: role.color, textShadow: `0 0 8px ${role.color}` }}>
                {role.icon}
              </span>
              <span style={{
                fontSize: 14, color: role.color, letterSpacing: 3,
                fontWeight: 'bold', textShadow: `0 0 6px ${role.color}66`,
              }}>
                {role.name}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--hud-tx)', letterSpacing: 1, lineHeight: 1.5 }}>
              {role.desc}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {role.consoles.map(cid => {
                const c = CONSOLES.find(x => x.id === cid)
                if (!c) return null
                return (
                  <span key={cid} style={{
                    fontSize: 10, padding: '2px 8px',
                    color: c.color,
                    border: `1px solid ${c.color}55`,
                    background: `${c.color}10`,
                    letterSpacing: 1.5,
                  }}>
                    {c.icon} {c.name}
                  </span>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
              <button
                data-testid={`role-btn-${role.id}`}
                onClick={() => onPick(role)}
                className="hbtn grn"
                style={{
                  flex: 1, height: 48, fontSize: 13, letterSpacing: 3,
                }}>
                TAKE STATION →
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', minHeight: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
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
                background: isSelected ? `${c.color}22` : 'rgba(0,229,255,0.04)',
                border: `1px solid ${isSelected ? c.color : 'rgba(0,229,255,0.2)'}`,
                boxShadow: isSelected ? `0 0 10px ${c.color}66` : 'none',
                padding: '14px 12px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                opacity: isDisabled ? 0.35 : 1,
                textAlign: 'left',
                fontFamily: 'var(--font-mono)',
                color: 'var(--hud-tx)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <span style={{
                  fontSize: 26,
                  color: isSelected ? c.color : 'var(--hud-txd)',
                  textShadow: isSelected ? `0 0 6px ${c.color}` : 'none',
                }}>
                  {c.icon}
                </span>
                {isSelected && (
                  <span style={{
                    marginLeft: 'auto', background: c.color, color: 'var(--hud-bg)',
                    fontSize: 11, fontWeight: 'bold', padding: '2px 7px',
                    letterSpacing: 1,
                  }}>
                    #{selected.indexOf(c.id) + 1}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 13,
                color: isSelected ? c.color : 'var(--hud-tx)',
                letterSpacing: 2,
              }}>
                {c.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--hud-txd)', letterSpacing: 1, lineHeight: 1.4 }}>
                {c.desc}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
