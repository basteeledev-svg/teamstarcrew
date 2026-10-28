import { useState } from 'react'
import { CONSOLES } from '../consoles.js'
import { STATIONS } from '../crewLayouts.js'
import '../hud/hud.css'

const MAX_CUSTOM_SELECTION = 4

/**
 * Station/role picker shown when a game is running.
 *
 * Default mode: "ROLE" — players pick a pre-defined role from the layout for
 * the current game's player_count.
 * Fallback mode: "CUSTOM" — free-pick up to 4 stations (preserves the old
 * workflow + existing tests).
 */
export default function ConsoleSelectPage({ gameState, onEnter, onNewGame }) {
  const [mode, setMode]              = useState('role')   // 'role' | 'custom'
  const [selected, setSelected]      = useState([])
  const [configStation, setConfig]   = useState(null)
  const [configPanels, setConfigPnl] = useState([])

  function toggleCustom(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_CUSTOM_SELECTION) return prev
      return [...prev, id]
    })
  }

  function openConfig(station) {
    setConfig(station)
    setConfigPnl([...station.defaultPanels])
  }
  function closeConfig() { setConfig(null); setConfigPnl([]) }
  function toggleConfigPanel(id) {
    setConfigPnl(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  if (configStation) {
    return (
      <ConfigureOverlay
        station={configStation}
        panels={configPanels}
        onToggle={toggleConfigPanel}
        onBack={closeConfig}
        onEnter={() => { onEnter({ role: 'crew', consoles: configPanels }); closeConfig() }}
      />
    )
  }

  return (
    <div className="hud-wrap" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className="hud-pip" />
        <span className="hud-tag">STATION SELECT</span>
        <span className="hud-sp" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="mode-role-btn"
                  className={`hud-chip${mode === 'role' ? ' on' : ''}`}
                  onClick={() => setMode('role')}
                  style={{ width: 110, height: 50 }}>STATIONS</button>
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
                  <span>TAP A STATION TO ENTER · ⚙ TO CUSTOMISE PANELS</span>
                ) : (
                  <span>SELECT 1–{MAX_CUSTOM_SELECTION} STATIONS · <span className="vc">{selected.length}</span>/{MAX_CUSTOM_SELECTION}</span>
                )}
              </span>
            </div>

            {mode === 'role' ? (
              <StationPicker
                stations={STATIONS}
                onTake={s => onEnter({ role: 'crew', consoles: s.defaultPanels, stationName: s.name })}
                onCustomise={openConfig}
              />
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

// ── Station-picker (default flow: take station with default panels) ──────────
function StationPicker({ stations, onTake, onCustomise }) {
  const cols = stations.length <= 6 ? 3 : stations.length <= 9 ? 3 : 4
  return (
    <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12, alignContent: 'start',
      }}>
        {stations.map(station => (
          <div key={station.id} style={{
            border: `1px solid ${station.color}`,
            background: `${station.color}14`,
            boxShadow: `0 0 8px ${station.color}33`,
            padding: '14px 14px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28, color: station.color, textShadow: `0 0 8px ${station.color}` }}>
                {station.icon}
              </span>
              <span style={{
                fontSize: 14, color: station.color, letterSpacing: 3,
                fontWeight: 'bold', textShadow: `0 0 6px ${station.color}66`,
              }}>
                {station.name}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--hud-tx)', letterSpacing: 1, lineHeight: 1.5 }}>
              {station.desc}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {station.defaultPanels.map(cid => {
                const c = CONSOLES.find(x => x.id === cid)
                if (!c) return null
                return (
                  <span key={cid} style={{
                    fontSize: 10, padding: '2px 8px', color: c.color,
                    border: `1px solid ${c.color}55`, background: `${c.color}10`, letterSpacing: 1.5,
                  }}>
                    {c.icon} {c.name}
                  </span>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
              <button
                data-testid={`role-btn-${station.id}`}
                onClick={() => onTake(station)}
                className="hbtn grn"
                style={{ flex: 1, height: 44, fontSize: 12, letterSpacing: 2 }}>
                TAKE STATION →
              </button>
              <button
                onClick={() => onCustomise(station)}
                className="hud-chip"
                title="Customise panels"
                style={{ width: 44, height: 44, fontSize: 14, padding: 0 }}>
                ⚙
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Panel-customisation overlay ───────────────────────────────────────────────
function ConfigureOverlay({ station, panels, onToggle, onBack, onEnter }) {
  return (
    <div className="hud-wrap" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ TEAM STAR CREW</span>
        <span className="hud-pip" />
        <span className="hud-tag" style={{ color: station.color }}>
          {station.icon} {station.name} — CONFIGURE PANELS
        </span>
        <span className="hud-sp" />
        <button onClick={onBack} className="hud-exit">← BACK</button>
      </div>
      <div className="hud-content" style={{ padding: '12px' }}>
        <div className="po" style={{ flex: 1 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: station.color }}>{station.icon}</span>
              <span className="ptitle">SELECT PANELS</span>
              <span className="pstat"><span className="vc">{panels.length}</span> SELECTED</span>
            </div>
            <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--hud-txd)', letterSpacing: 2, marginBottom: 12 }}>
                DEFAULTS PRE-SELECTED — TOGGLE ANY PANEL TO ADD OR REMOVE
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {CONSOLES.map(c => {
                  const on = panels.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => onToggle(c.id)} style={{
                      background: on ? `${c.color}22` : 'rgba(0,229,255,0.04)',
                      border: `1px solid ${on ? c.color : 'rgba(0,229,255,0.2)'}`,
                      boxShadow: on ? `0 0 10px ${c.color}66` : 'none',
                      padding: '14px 12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
                      textAlign: 'left', fontFamily: 'var(--font-mono)', color: 'var(--hud-tx)',
                    }}>
                      <span style={{ fontSize: 26, color: on ? c.color : 'var(--hud-txd)', textShadow: on ? `0 0 6px ${c.color}` : 'none' }}>
                        {c.icon}
                      </span>
                      <span style={{ fontSize: 11, letterSpacing: 1.5, color: on ? c.color : 'var(--hud-tx)' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--hud-txd)', letterSpacing: 1, lineHeight: 1.4 }}>
                        {c.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid rgba(0,229,255,0.18)',
        background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.04) 60%, rgba(0,229,255,0.10))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          {panels.map(id => {
            const c = CONSOLES.find(x => x.id === id)
            return c ? (
              <span key={id} style={{ fontSize: 13, padding: '5px 12px', border: `1px solid ${c.color}`, color: c.color, background: `${c.color}14`, letterSpacing: 2, boxShadow: `0 0 4px ${c.color}66` }}>
                {c.icon} {c.name}
              </span>
            ) : null
          })}
        </div>
        <button disabled={panels.length === 0} onClick={onEnter} className="hbtn hbtn-md grn" style={{ letterSpacing: 3 }}>
          ENTER SHIP →
        </button>
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
