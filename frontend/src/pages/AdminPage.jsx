import { useState } from 'react'
import { CONSOLES } from '../consoles.js'

const W = 1280
const H = 800

export default function AdminPage({ gameState, sendCommand, onExit, onObserver }) {
  const [activeTab, setActiveTab] = useState('ship')

  const ship = gameState?.ship
  const system = gameState?.current_system

  return (
    <div style={{
      width: W, height: H, background: '#050510',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Courier New', color: '#8899cc', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0',
        borderBottom: '1px solid #1a1a2e', background: '#050510',
      }}>
        <div style={{ padding: '0 20px', fontSize: '11px', color: '#334455', letterSpacing: '3px', borderRight: '1px solid #1a1a2e', height: '100%', display: 'flex', alignItems: 'center' }}>
          ★ ADMIN
        </div>
        {[
          { id: 'ship',     label: 'SHIP STATUS' },
          { id: 'stations', label: 'STATIONS' },
          { id: 'game',     label: 'GAME CONTROL' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              height: '100%', padding: '0 22px',
              background: activeTab === tab.id ? '#0a0a20' : 'transparent',
              border: 'none',
              borderRight: '1px solid #1a1a2e',
              borderBottom: activeTab === tab.id ? '2px solid #00aaff' : '2px solid transparent',
              color: activeTab === tab.id ? '#aabbdd' : '#334455',
              fontFamily: 'Courier New', fontSize: '10px', letterSpacing: '2px',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '10px', color: '#1a2a3a' }}>TICK {gameState?.tick ?? '—'}</span>
          {onObserver && (
            <button onClick={onObserver} style={{ ...exitBtn, color: '#00aaff', borderColor: '#003355' }}>OBSERVER VIEW</button>
          )}
          <button onClick={onExit} style={exitBtn}>← BACK</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {activeTab === 'ship'     && <ShipStatusTab ship={ship} system={system} />}
        {activeTab === 'stations' && <StationsTab sendCommand={sendCommand} />}
        {activeTab === 'game'     && <GameControlTab gameState={gameState} sendCommand={sendCommand} />}
      </div>
    </div>
  )
}

/* ── Ship Status ── */
function ShipStatusTab({ ship, system }) {
  if (!ship) return <Placeholder text="NO GAME STATE — START GAME FIRST" />

  const rows = [
    ['Hull Health',     `${Math.round(ship.hull_health)}%`],
    ['Thrust',          `${Math.round((ship.thrust ?? 0) * 100)}%`],
    ['Position X',      `${ship.position?.x ?? '—'} AU`],
    ['Position Z',      `${ship.position?.z ?? '—'} AU`],
    ['Orbiting',        ship.orbiting_planet_id ? 'YES' : 'NO'],
    ['Mining Bots',     ship.mining_bots ? Object.entries(ship.mining_bots).map(([k,v]) => `${k}:${v}`).join('  ') : '—'],
    ['Effective Power', `${ship.effective_power_gw ?? '—'} GW`],
    ['System',          system?.name ?? '—'],
    ['Planets Nearby',  `${system?.planets?.length ?? 0}`],
  ]

  return (
    <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <SectionHeading>SHIP ATTRIBUTES</SectionHeading>
      <table style={{ borderCollapse: 'collapse', width: '60%', fontSize: '11px' }}>
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td style={{ padding: '6px 16px 6px 0', color: '#445566', letterSpacing: '1px', whiteSpace: 'nowrap' }}>{label.toUpperCase()}</td>
              <td style={{ padding: '6px 0', color: '#aabbdd', fontFamily: 'Courier New' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SectionHeading style={{ marginTop: 28 }}>SYSTEM HEALTH</SectionHeading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px', maxWidth: 700 }}>
        {ship.system_health && Object.entries(ship.system_health).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px' }}>
            <span style={{ color: '#334455', flex: 1, letterSpacing: '1px' }}>{key.replace(/_/g, ' ').toUpperCase()}</span>
            <div style={{ width: 80, height: 5, background: '#0a0a20', border: '1px solid #1a1a2e' }}>
              <div style={{ width: `${val}%`, height: '100%', background: val > 50 ? '#00cc66' : val > 25 ? '#ffaa00' : '#cc3300' }} />
            </div>
            <span style={{ color: '#556677', minWidth: 28, textAlign: 'right' }}>{Math.round(val)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Stations ── */
function StationsTab({ sendCommand }) {
  return (
    <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <SectionHeading>ALL 13 STATIONS</SectionHeading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', maxWidth: 900 }}>
        {CONSOLES.map(c => (
          <div key={c.id} style={{
            border: '1px solid #1a1a2e', padding: '12px 14px',
            background: '#08081a', borderRadius: '3px',
          }}>
            <div style={{ fontSize: '18px', color: c.color, opacity: 0.7, marginBottom: '6px' }}>{c.icon}</div>
            <div style={{ fontSize: '10px', color: '#8899aa', letterSpacing: '1px' }}>{c.name}</div>
            <div style={{ fontSize: '9px', color: '#334455', marginTop: '4px', lineHeight: 1.4 }}>{c.desc}</div>
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
    <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
      <SectionHeading>GAME CONTROL</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 400 }}>
        {/* Mode selector */}
        <div style={{ padding: '12px 14px', border: '1px solid #1a1a2e', background: '#08081a', borderRadius: '3px' }}>
          <div style={{ fontSize: '11px', color: '#8899aa', letterSpacing: '1px', marginBottom: 8 }}>UNIVERSE MODE</div>
          {[
            { id: 'empty', label: 'EMPTY UNIVERSE', desc: 'No NPCs or events — test ship systems and mechanics' },
            { id: 'full',  label: 'FULL UNIVERSE',  desc: 'NPC ships, factions, and initial messages (AI optional)' },
          ].map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
              <input
                type="radio"
                name="mode"
                value={opt.id}
                checked={mode === opt.id}
                onChange={() => setMode(opt.id)}
                style={{ accentColor: '#00aaff' }}
              />
              <div>
                <span style={{ fontSize: '10px', color: mode === opt.id ? '#aabbdd' : '#445566', letterSpacing: '1px' }}>{opt.label}</span>
                <div style={{ fontSize: '9px', color: '#334455', marginTop: 1 }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <AdminAction
          label="START NEW GAME"
          desc={`Generate a fresh galaxy in ${mode} mode`}
          color="#00cc66"
          onClick={startGame}
          testId="start-game-btn"
        />
        <AdminAction
          label="STOP ENGINES"
          desc="Set ship thrust to 0"
          color="#ffaa00"
          onClick={() => sendCommand({ type: 'stop' })}
        />
        <AdminAction
          label="LEAVE ORBIT"
          desc="Force ship to exit any active orbit"
          color="#ffaa00"
          onClick={() => sendCommand({ type: 'leave_orbit' })}
        />
      </div>

      <div style={{ marginTop: 32, fontSize: '10px', color: '#1a2a3a', lineHeight: 2 }}>
        <div>STATUS: {gameState?.status ?? '—'}</div>
        <div>TICK: {gameState?.tick ?? '—'}</div>
        <div>SYSTEMS: {gameState?.galaxy_systems?.length ?? '—'}</div>
      </div>
    </div>
  )
}

function AdminAction({ label, desc, color, onClick, testId }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 14px', border: '1px solid #1a1a2e', background: '#08081a', borderRadius: '3px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', color: '#8899aa', letterSpacing: '1px' }}>{label}</div>
        <div style={{ fontSize: '9px', color: '#334455', marginTop: '3px' }}>{desc}</div>
      </div>
      <button
        data-testid={testId}
        onClick={onClick}
        style={{
          background: 'transparent', border: `1px solid ${color}`,
          color, padding: '5px 14px',
          fontFamily: 'Courier New', fontSize: '10px',
          letterSpacing: '1px', cursor: 'pointer', borderRadius: '2px', whiteSpace: 'nowrap',
        }}
      >
        EXECUTE
      </button>
    </div>
  )
}

/* ── Shared ── */
function SectionHeading({ children, style }) {
  return (
    <div style={{ fontSize: '9px', color: '#334455', letterSpacing: '3px', marginBottom: '14px', paddingBottom: '6px', borderBottom: '1px solid #0d0d22', ...style }}>
      {children}
    </div>
  )
}

function Placeholder({ text }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2a3a', fontSize: '11px', letterSpacing: '3px' }}>
      {text}
    </div>
  )
}

const exitBtn = {
  background: 'transparent',
  border: '1px solid #1a2a3a',
  color: '#334455',
  padding: '4px 12px',
  fontFamily: 'Courier New',
  fontSize: '9px',
  letterSpacing: '1px',
  cursor: 'pointer',
  borderRadius: '2px',
}
