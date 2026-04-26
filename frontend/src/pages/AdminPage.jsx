import { useState } from 'react'
import { CONSOLES } from '../consoles.js'
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
    ['EFFECTIVE POWER', `${ship.effective_power_gw ?? '—'} GW`],
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

/* ── Stations ── */
function StationsTab() {
  return (
    <div style={{ padding: '20px 24px' }}>
      <SectionHeading>ALL 13 STATIONS</SectionHeading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {CONSOLES.map(c => (
          <div key={c.id} style={{
            border: `1px solid ${c.color}55`,
            background: `${c.color}0d`,
            boxShadow: `0 0 6px ${c.color}22`,
            padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, color: c.color, textShadow: `0 0 6px ${c.color}` }}>{c.icon}</span>
              <span style={{ fontSize: 12, color: c.color, letterSpacing: 2, fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
                {c.name}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--hud-txd)', letterSpacing: 1, lineHeight: 1.4, fontFamily: 'var(--font-mono)' }}>
              {c.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Game Control ── */
function GameControlTab({ gameState, sendCommand }) {
  const [mode, setMode] = useState('empty')

  async function startGame() {
    await fetch(`/api/game/start?mode=${mode}`, { method: 'POST' })
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

function Placeholder({ text }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--hud-txd)', fontSize: 12, letterSpacing: 4,
      fontFamily: 'var(--font-mono)', padding: 40,
    }}>
      {text}
    </div>
  )
}
