import { useState, lazy, Suspense } from 'react'
import { Btn } from '../components/ui'
import { CONSOLES } from '../consoles.js'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
const W = 1280
const H = 800

// Map console id → lazy-loaded panel component
const PANEL_MAP = {
  navigation:     lazy(() => import('../panels/NavigationPanel.jsx')),
  short_range:    lazy(() => import('../panels/ShortRangePanel.jsx')),
  long_range:     lazy(() => import('../panels/LongRangePanel.jsx')),
  weapons:        lazy(() => import('../panels/TacticalPanel.jsx')),
  shields:        lazy(() => import('../panels/ShieldsPanel.jsx')),
  repairs:        lazy(() => import('../panels/RepairsPanel.jsx')),
  transportation: lazy(() => import('../panels/TransportationPanel.jsx')),
  manufacturing:  lazy(() => import('../panels/ManufacturingPanel.jsx')),
  power:          lazy(() => import('../panels/PowerPanel.jsx')),
  engines:        lazy(() => import('../panels/EnginesPanel.jsx')),
  life_support:   lazy(() => import('../panels/LifeSupportPanel.jsx')),
  comms:          lazy(() => import('../panels/CommunicationsPanel.jsx')),
  mining:         lazy(() => import('../panels/MiningPanel.jsx')),
}

export default function GamePage({ consoles, gameState, sendCommand, lastError, lastAck, onExit }) {
  const [index, setIndex] = useState(0)
  const count = consoles.length

  const consoleDef  = CONSOLES.find(c => c.id === consoles[index])
  const PanelComp   = PANEL_MAP[consoles[index]] ?? (() => null)
  const isPowerConsole = consoles[index] === 'power'

  // General Systems power check — below 20 GW triggers a blocking warning on all non-power consoles
  const ship = gameState?.ship
  const totalPowerGW    = ship?.net_power_gw ?? 0
  const genSysPct       = ship?.power_allocation?.general_systems ?? 0
  const genSysGW        = (genSysPct / 100) * totalPowerGW
  const lowGenSysPower  = gameState != null && genSysGW < 20

  const prev = () => setIndex(i => (i - 1 + count) % count)
  const next = () => setIndex(i => (i + 1) % count)

  // Game over detection
  const hullHealth = ship?.hull_health ?? 100
  const isGameOver = gameState != null && hullHealth <= 0

  return (
    <div style={{
      width: W, height: H, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)', overflow: 'hidden', position: 'relative',
    }}>
      {/* Top bar */}
      <div style={{
        height: 32, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 40px',                          // leave room for arrows
        background: 'var(--bg-base)', borderBottom: '1px solid var(--border-faint)',
        fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '2px',
      }}>
        <span style={{ color: consoleDef?.color ?? 'var(--text-primary)', letterSpacing: '2px' }}>
          {consoleDef?.icon} {consoleDef?.name}
        </span>

        {/* Tab pips */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
          {consoles.map((id, i) => {
            const c = CONSOLES.find(x => x.id === id)
            return (
              <button
                key={id}
                onClick={() => setIndex(i)}
                style={{
                  width: 8, height: 8, borderRadius: '50%', border: 'none',
                  background: i === index ? (c?.color ?? 'var(--text-primary)') : 'var(--border)',
                  cursor: 'pointer', padding: 0,
                }}
              />
            )
          })}
        </div>

        <span style={{ marginLeft: 'auto', color: 'var(--text-ghost)' }}>
          TICK {gameState?.tick ?? '—'}
        </span>
        <Btn onClick={onExit} color="var(--text-dim)" style={{ padding: '2px 10px', fontSize: '9px', letterSpacing: '1px' }}>EXIT</Btn>
      </div>

      {/* Panel content — inset by arrow width so no content hides behind the buttons */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', marginLeft: count > 1 ? 36 : 0, marginRight: count > 1 ? 36 : 0 }}>
        <Suspense fallback={<Loading />}>
          <PanelComp gameState={gameState} sendCommand={sendCommand} lastError={lastError} lastAck={lastAck} />
        </Suspense>

        {/* ── Insufficient General Systems Power overlay ── */}
        {lowGenSysPower && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '10px',
            // Power console: overlay visible but pointer-events pass through so it stays usable
            pointerEvents: isPowerConsole ? 'none' : 'all',
            zIndex: 50,
          }}>
            <div style={{
              border: '2px solid var(--status-danger)',
              background: 'var(--tint-danger)',
              borderRadius: '8px',
              padding: '18px 32px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: '22px', color: 'var(--status-danger)', letterSpacing: '4px', fontWeight: 'bold' }}>
                ⚠ INSUFFICIENT POWER
              </span>
              <span style={{ fontSize: '11px', color: 'var(--status-bad)', letterSpacing: '2px' }}>
                GENERAL SYSTEMS: {genSysGW.toFixed(1)} GW — MINIMUM 20 GW REQUIRED
              </span>
              {isPowerConsole && (
                <span style={{ fontSize: '10px', color: '#ff444488', letterSpacing: '1px', marginTop: '2px' }}>
                  ALLOCATE MORE POWER TO GENERAL SYSTEMS
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Left arrow — only shown when more than 1 console */}
      {count > 1 && (
        <button onClick={prev} style={{ ...arrowBtn, left: 0, borderRadius: '0 50% 50% 0' }} aria-label="Previous console">
          ‹
        </button>
      )}

      {/* Right arrow */}
      {count > 1 && (
        <button onClick={next} style={{ ...arrowBtn, right: 0, borderRadius: '50% 0 0 50%' }} aria-label="Next console">
          ›
        </button>
      )}

      {/* ── Game Over overlay ── */}
      {isGameOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <span style={{
            fontSize: 48, color: '#ff2222', fontWeight: 'bold',
            letterSpacing: 8, textShadow: '0 0 30px #ff0000',
          }}>
            SHIP DESTROYED
          </span>
          <span style={{
            fontSize: 14, color: '#ff8888', letterSpacing: 3,
          }}>
            HULL INTEGRITY: 0%
          </span>
          <span style={{
            fontSize: 11, color: '#666', letterSpacing: 2, marginTop: 8,
          }}>
            TICK {gameState?.tick ?? '—'}
          </span>
          <Btn onClick={onExit} color="#ff4444" style={{
            marginTop: 20, padding: '8px 32px', fontSize: 12,
            letterSpacing: 3, border: '1px solid #ff4444',
          }}>
            EXIT
          </Btn>
        </div>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', fontSize: '11px', letterSpacing: '3px' }}>
      LOADING…
    </div>
  )
}

// Compact half-circle arrow buttons, vertically centered
const arrowBtn = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 36,
  height: 72,
  background: 'var(--btn-arrow-bg)',
  border: 'none',
  color: 'var(--text-bright)',
  fontSize: '28px',
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10,
  transition: 'background 0.15s',
  padding: 0,
}

