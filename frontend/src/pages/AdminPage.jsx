import { useState, useEffect, useRef } from 'react'
import { CONSOLES } from '../consoles.js'
import { apiPath } from '../api/paths.js'
import '../hud/hud.css'

const W = 1280
const H = 800

export default function AdminPage({ gameState, sendCommand, onExit, onObserver }) {
  const [activeTab, setActiveTab] = useState('ship')

  const ship   = gameState?.ship
  const system = gameState?.current_system

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="hud-top">
        <span className="hud-logo">★ ADMIN</span>
        <span className="hud-pip" />
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'ship',     label: 'SHIP STATUS' },
            { id: 'stations', label: 'STATIONS' },
            { id: 'game',     label: 'GAME CONTROL' },
          ].map(tab => (
            <button
              key={tab.id}
              data-testid={`admin-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`hud-chip${activeTab === tab.id ? ' on' : ''}`}
              style={{ width: 130, height: 50 }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="hud-sp" />
        <span className="hud-tag">TICK <b>{gameState?.tick ?? '—'}</b></span>
        <span className="hud-tag">STATUS <b>{gameState?.status ?? '—'}</b></span>
        {onObserver && (
          <button onClick={onObserver} className="hud-chip" style={{ width: 130, height: 50 }}>
            OBSERVER
          </button>
        )}
        <button onClick={onExit} className="hud-exit">← BACK</button>
      </div>

      {/* Body */}
      <div className="hud-content" style={{ padding: 12 }}>
        <div className="po" style={{ flex: 1 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-c)' }}>◈</span>
              <span className="ptitle">
                {activeTab === 'ship' ? 'SHIP DIAGNOSTICS'
                  : activeTab === 'stations' ? 'STATION INVENTORY'
                  : 'GAME CONTROL'}
              </span>
              <span className="pstat">
                <span>ADMIN</span>
                <span className="vc">● LIVE</span>
              </span>
            </div>
            <div className="pbody" style={{ overflowY: 'auto' }}>
              {activeTab === 'ship'     && <ShipStatusTab ship={ship} system={system} />}
              {activeTab === 'stations' && <StationsTab />}
              {activeTab === 'game'     && <GameControlTab gameState={gameState} sendCommand={sendCommand} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Ship Status ── */
function ShipStatusTab({ ship, system }) {
  if (!ship) return <Placeholder text="NO GAME STATE — START GAME FIRST" />

  const rows = [
    ['HULL HEALTH',     `${Math.round(ship.hull_health)}%`],
    ['THRUST',          `${Math.round((ship.thrust ?? 0) * 100)}%`],
    ['POSITION X',      `${ship.position?.x ?? '—'} AU`],
    ['POSITION Z',      `${ship.position?.z ?? '—'} AU`],
    ['ORBITING',        ship.orbiting_planet_id ? 'YES' : 'NO'],
    ['MINING BOTS',     ship.mining_bots ? Object.entries(ship.mining_bots).map(([k,v]) => `${k}:${v}`).join('  ') : '—'],
    ['EFFECTIVE POWER', `${ship.effective_power_tw ?? '—'} TW`],
    ['SYSTEM',          system?.name ?? '—'],
    ['PLANETS NEARBY',  `${system?.planets?.length ?? 0}`],
  ]

  return (
    <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
      <div>
        <SectionHeading>SHIP ATTRIBUTES</SectionHeading>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          <tbody>
            {rows.map(([label, val]) => (
              <tr key={label} style={{ borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                <td style={{ padding: '7px 12px 7px 0', color: 'var(--hud-txd)', letterSpacing: 2 }}>{label}</td>
                <td style={{ padding: '7px 0', color: 'var(--hud-tx)', textAlign: 'right' }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <SectionHeading>SYSTEM HEALTH</SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ship.system_health && Object.entries(ship.system_health).map(([key, val]) => {
            const colorVar = val > 50 ? 'var(--hud-cg)' : val > 25 ? 'var(--hud-ca)' : 'var(--hud-cr)'
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--hud-txd)', flex: 1, letterSpacing: 1.5 }}>
                  {key.replace(/_/g, ' ').toUpperCase()}
                </span>
                <div style={{ width: 140, height: 7, background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.25)' }}>
                  <div style={{ width: `${val}%`, height: '100%', background: colorVar, boxShadow: `0 0 5px ${colorVar}` }} />
                </div>
                <span style={{ color: 'var(--hud-tx)', minWidth: 32, textAlign: 'right' }}>{Math.round(val)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Stations (live panel editor) ── */
function StationsTab() {
  const [stations, setStations] = useState([])
  const [saving,   setSaving]   = useState({})   // code → 'ok' | 'err'
  const [loading,  setLoading]  = useState(true)
  const dragPanel = useRef(null)

  useEffect(() => {
    fetch(apiPath('/api/stations'))
      .then(r => r.json())
      .then(d => setStations(d.stations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function patchPanels(code, panels) {
    setSaving(s => ({ ...s, [code]: null }))
    try {
      const r = await fetch(apiPath(`/api/stations/${code}/panels`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panels }),
      })
      setSaving(s => ({ ...s, [code]: r.ok ? 'ok' : 'err' }))
      setTimeout(() => setSaving(s => ({ ...s, [code]: null })), 1500)
    } catch {
      setSaving(s => ({ ...s, [code]: 'err' }))
    }
  }

  function addPanel(code, panelId) {
    setStations(prev => {
      const next = prev.map(s => {
        if (s.code !== code || s.panels.includes(panelId)) return s
        const updated = { ...s, panels: [...s.panels, panelId] }
        patchPanels(code, updated.panels)
        return updated
      })
      return next
    })
  }

  function removePanel(code, panelId) {
    setStations(prev => {
      const next = prev.map(s => {
        if (s.code !== code) return s
        const updated = { ...s, panels: s.panels.filter(p => p !== panelId) }
        patchPanels(code, updated.panels)
        return updated
      })
      return next
    })
  }

  function onDrop(e, code) {
    e.preventDefault()
    if (dragPanel.current) addPanel(code, dragPanel.current)
    dragPanel.current = null
  }

  if (loading) return <Placeholder text="LOADING STATIONS…" />
  if (!stations.length) return <Placeholder text="NO STATIONS CONFIGURED — USE STATION SETUP AFTER STARTING A GAME" />

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 10, padding: '10px 12px' }}>
      {/* Panel pool */}
      <div style={{
        width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
        border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.02)',
      }}>
        <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(0,229,255,0.15)', fontSize: 9, letterSpacing: 3, color: 'var(--hud-c)' }}>
          PANELS — DRAG TO STATION
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CONSOLES.map(c => {
            const count = stations.filter(s => s.panels.includes(c.id)).length
            return (
              <div
                key={c.id}
                draggable
                onDragStart={() => { dragPanel.current = c.id }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
                  border: `1px solid ${count > 0 ? c.color + '88' : c.color + '33'}`,
                  background: count > 0 ? `${c.color}15` : `${c.color}08`,
                  color: c.color, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                  cursor: 'grab', userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{c.icon}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 'bold', background: `${c.color}2a`, color: c.color, padding: '1px 4px', flexShrink: 0 }}>
                    {count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Station columns */}
      <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 8, alignItems: 'stretch' }}>
        {stations.map(st => (
          <AdminStationColumn
            key={st.code}
            station={st}
            saveStatus={saving[st.code]}
            onDrop={e => onDrop(e, st.code)}
            onRemovePanel={pid => removePanel(st.code, pid)}
          />
        ))}
      </div>
    </div>
  )
}

function AdminStationColumn({ station, saveStatus, onDrop, onRemovePanel }) {
  const [over, setOver] = useState(false)

  return (
    <div style={{
      width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: `1px solid ${station.color}55`, background: `${station.color}07`,
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 8px', background: `${station.color}18`,
        borderBottom: `1px solid ${station.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: station.color, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 'bold' }}>
          {station.name}
        </span>
        {saveStatus && (
          <span style={{ fontSize: 10, color: saveStatus === 'ok' ? 'var(--hud-cg)' : 'var(--hud-cr)' }}>
            {saveStatus === 'ok' ? '✓' : '✗'}
          </span>
        )}
      </div>
      {/* Code label */}
      <div style={{ padding: '3px 8px', borderBottom: `1px solid ${station.color}22`, fontSize: 9, color: 'var(--hud-txd)', letterSpacing: 2 }}>
        CODE <span style={{ color: station.color, fontWeight: 'bold', letterSpacing: 4 }}>{station.code}</span>
      </div>
      {/* Drop zone */}
      <div
        onDrop={e => { setOver(false); onDrop(e) }}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        style={{
          flex: 1, padding: '4px',
          background: over ? `${station.color}18` : 'transparent',
          outline: over ? `1px dashed ${station.color}88` : '1px dashed transparent',
          outlineOffset: -3,
          display: 'flex', flexDirection: 'column', gap: 3, minHeight: 60,
        }}
      >
        {station.panels.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,229,255,0.15)', fontSize: 9, letterSpacing: 2, pointerEvents: 'none', textAlign: 'center' }}>
            DROP PANELS HERE
          </div>
        )}
        {station.panels.map(pid => {
          const c = CONSOLES.find(x => x.id === pid)
          if (!c) return null
          return (
            <div key={pid} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 5px',
              border: `1px solid ${c.color}44`, background: `${c.color}10`,
            }}>
              <span style={{ color: c.color, fontSize: 12, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ flex: 1, color: c.color, fontSize: 9, letterSpacing: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <button
                onClick={() => onRemovePanel(pid)}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,100,100,0.55)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 1px', flexShrink: 0 }}
              >×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Placeholder({ text }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hud-txd)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3 }}>
      {text}
    </div>
  )
}

/* ── Game Control ── */
function GameControlTab({ gameState, sendCommand }) {
  const [mode, setMode] = useState('empty')

  async function startGame() {
    await fetch(`${apiPath('/api/game/start')}?mode=${mode}`, { method: 'POST' })
  }

  return (
    <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, fontFamily: 'var(--font-mono)' }}>
      <div>
        <SectionHeading>UNIVERSE MODE</SectionHeading>
        <div style={{
          border: '1px solid rgba(0,229,255,0.25)',
          background: 'rgba(0,229,255,0.05)',
          padding: '14px 16px',
        }}>
          {[
            { id: 'empty', label: 'EMPTY UNIVERSE', desc: 'No NPCs or events — test ship systems and mechanics' },
            { id: 'full',  label: 'FULL UNIVERSE',  desc: 'NPC ships, factions, and initial messages (AI optional)' },
          ].map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
              <input
                type="radio"
                name="mode"
                value={opt.id}
                checked={mode === opt.id}
                onChange={() => setMode(opt.id)}
                style={{ accentColor: 'var(--hud-c)', marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: 11, color: mode === opt.id ? 'var(--hud-c)' : 'var(--hud-tx)', letterSpacing: 2, fontWeight: mode === opt.id ? 'bold' : 'normal' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--hud-txd)', marginTop: 2, letterSpacing: 1 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <SectionHeading style={{ marginTop: 24 }}>STATE</SectionHeading>
        <div style={{ fontSize: 11, color: 'var(--hud-txd)', letterSpacing: 2, lineHeight: 2 }}>
          <div>STATUS: <span className="vc">{gameState?.status ?? '—'}</span></div>
          <div>TICK: <span className="vc">{gameState?.tick ?? '—'}</span></div>
          <div>SYSTEMS: <span className="vc">{gameState?.galaxy_systems?.length ?? '—'}</span></div>
        </div>
      </div>

      <div>
        <SectionHeading>ACTIONS</SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AdminAction
            label="START NEW GAME"
            desc={`Generate a fresh galaxy in ${mode} mode`}
            variant="grn"
            onClick={startGame}
            testId="start-game-btn"
          />
          <AdminAction
            label="STOP ENGINES"
            desc="Set ship thrust to 0"
            variant="amb"
            onClick={() => sendCommand({ type: 'stop' })}
          />
          <AdminAction
            label="LEAVE ORBIT"
            desc="Force ship to exit any active orbit"
            variant="amb"
            onClick={() => sendCommand({ type: 'leave_orbit' })}
          />
        </div>
      </div>
    </div>
  )
}

function AdminAction({ label, desc, variant, onClick, testId }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 16px',
      border: '1px solid rgba(0,229,255,0.25)',
      background: 'rgba(0,229,255,0.04)',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--hud-tx)', letterSpacing: 2, fontWeight: 'bold' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--hud-txd)', marginTop: 3, letterSpacing: 1 }}>{desc}</div>
      </div>
      <button
        data-testid={testId}
        onClick={onClick}
        className={`hbtn hbtn-sm ${variant}`}
        style={{ letterSpacing: 2 }}
      >
        EXECUTE
      </button>
    </div>
  )
}

/* ── Shared ── */
function SectionHeading({ children, style }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--hud-c)', letterSpacing: 4,
      marginBottom: 14, paddingBottom: 6,
      borderBottom: '1px solid rgba(0,229,255,0.25)',
      fontFamily: 'var(--font-mono)', fontWeight: 'bold',
      textShadow: '0 0 4px rgba(0,229,255,0.4)',
      ...style,
    }}>
      {children}
    </div>
  )
}
