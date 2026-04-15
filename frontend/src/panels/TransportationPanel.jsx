import { useState } from 'react'

// ── Style constants (match other panels) ──────────────────────────────────
const BG      = '#070714'
const CARD_BG = '#09091c'
const ACCENT  = '#ff88cc'
const ACCENT2 = '#00ffcc'
const DIM     = '#334'
const FONT    = 'Courier New'

const ROOM_LABELS = {
  power_room:       'POWER ROOM',
  engine_room:      'ENGINE ROOM',
  weapons_room:     'WEAPONS',
  shields_room:     'SHIELDS',
  living_quarters:  'LIVING QTRS',
  cargo_bay:        'CARGO BAY',
  manufacturing:    'MANUFACTURING',
  charging_bay:     'CHARGING BAY',
  planet:           'PLANET',
}

// Rooms excluded from item transport (bots-only or internal)
const TRANSPORT_EXCLUDED_ROOMS = new Set(['charging_bay'])

const LARGE_ITEMS = new Set([
  'lasers', 'missiles', 'shield_batteries', 'power_batteries',
  'air_scrubbers', 'transport_bots',
])

function statusColor(state) {
  if (state === 'idle') return ACCENT2
  if (state === 'pickup') return '#ffaa00'
  if (state === 'deliver') return ACCENT
  if (state === 'returning') return '#00aaff'
  return DIM
}

function healthColor(hp) {
  if (hp >= 70) return '#00ff88'
  if (hp >= 40) return '#ffaa00'
  return '#ff4444'
}

function fmtNum(n) {
  if (n == null) return '0'
  return Number(n) % 1 === 0 ? String(Math.floor(n)) : n.toFixed(1)
}

// ══════════════════════════════════════════════════════════════════════════════
export default function TransportationPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship
  const rooms = ship?.rooms ?? {}
  const bots  = ship?.transport_bots ?? []
  const orbitingPlanet = ship?.orbiting_planet_id

  // UI state
  const [selSource, setSelSource] = useState(null)
  const [selDest,   setSelDest]   = useState(null)
  const [selItem,   setSelItem]   = useState(null)
  const [selAmount, setSelAmount] = useState('')
  const [selBotId,  setSelBotId]  = useState(null)
  const [selTrips,  setSelTrips]  = useState(1)  // 1, 5, 10, or null = infinite

  function handleCharge(botId) {
    sendCommand({ type: 'charge_transport', bot_id: botId })
  }

  if (!ship) {
    return (
      <div style={{ flex: 1, background: BG, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#222', fontFamily: FONT,
                    fontSize: '12px', letterSpacing: '4px' }}>
        NO SIGNAL
      </div>
    )
  }

  // Planet stockpile (only available as source when orbiting)
  const planetStockpile = orbitingPlanet
    ? gameState?.galaxy?.systems
        ?.find(s => s.id === ship.current_system_id)
        ?.planets?.find(p => p.id === orbitingPlanet)?.stockpile ?? null
    : null

  // Build source options: non-excluded rooms + planet
  const sourceKeys = Object.keys(rooms).filter(k => !TRANSPORT_EXCLUDED_ROOMS.has(k))
  if (planetStockpile) sourceKeys.push('planet')

  // Items available at selected source
  const sourceInv = selSource === 'planet'
    ? planetStockpile ?? {}
    : rooms[selSource] ?? {}
  const sourceItems = Object.entries(sourceInv).filter(([, v]) => v > 0)

  // Destination options: ship rooms only (exclude source and excluded rooms)
  const destKeys = Object.keys(rooms).filter(k => k !== selSource && !TRANSPORT_EXCLUDED_ROOMS.has(k))

  // Max amount for selected item
  const maxAmt = selItem
    ? Math.min(
        sourceInv[selItem] ?? 0,
        LARGE_ITEMS.has(selItem) ? 1 : 1000
      )
    : 0

  // Idle bots
  const idleBots = bots.filter(b => b.state === 'idle' && b.health > 0 && b.charge >= 10)

  function handleDispatch() {
    const amt = selAmount === '' ? maxAmt : parseFloat(selAmount)
    if (!selSource || !selDest || !selItem || !amt || amt <= 0) return
    const cmd = { type: 'transport_items', source: selSource, dest: selDest, item: selItem, amount: amt, trips: selTrips }
    if (selBotId) cmd.bot_id = selBotId
    sendCommand(cmd)
    setSelItem(null)
    setSelAmount('')
    setSelBotId(null)
  }

  function handleCancel(botId) {
    sendCommand({ type: 'cancel_transport', bot_id: botId })
  }

  // ── Layout: left=bot fleet, center=dispatch form, right=room inventories ──
  return (
    <div style={{ flex: 1, display: 'flex', background: BG, fontFamily: FONT, color: '#ccc',
                  fontSize: '11px', overflow: 'hidden' }}>

      {/* ── LEFT: Bot Fleet ──────────────────────────────────────────────── */}
      <div style={{ width: '260px', borderRight: '1px solid #111', display: 'flex',
                    flexDirection: 'column', padding: '8px', gap: '4px', overflowY: 'auto' }}>
        {/* Fleet header + charging bay info */}
        <div style={{ marginBottom: '4px' }}>
          <div style={{ color: ACCENT, fontSize: '10px', letterSpacing: '3px' }}>
            TRANSPORT FLEET ({bots.length})
          </div>
          {(() => {
            const totalGw = ship.net_power_gw ?? 0
            const bayPct  = ship.power_allocation?.charging_bay ?? 0
            const bayGw   = totalGw * bayPct / 100
            const allBots = [...bots, ...(ship.repair_bots ?? []), ...(ship.mining_bots_list ?? [])]
            const inBay   = allBots.filter(b => b.location === 'charging_bay' && b.state === 'idle').length
            return (
              <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
                CHARGING BAY: <span style={{ color: '#00aaff' }}>{bayGw.toFixed(1)} GW</span>
                {inBay > 0 && <span style={{ color: '#444' }}> ÷ {inBay} bot{inBay !== 1 ? 's' : ''} = <span style={{ color: '#00aaff' }}>{inBay > 0 ? (bayGw / inBay * 2).toFixed(1) : '0'} CHG/t</span></span>}
              </div>
            )
          })()}
        </div>

        {bots.map(bot => (
          <div key={bot.id} style={{ background: CARD_BG, borderRadius: '4px', padding: '6px 8px',
                                      border: `1px solid ${bot.state !== 'idle' ? ACCENT : '#151530'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: statusColor(bot.state), fontWeight: 'bold' }}>
                TRANSPORT #{bot.id}
              </span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: statusColor(bot.state), fontSize: '9px', letterSpacing: '1px' }}>
                  {bot.state.toUpperCase()}
                </span>
                <div style={{ fontSize: '8px', color: '#444', marginTop: '1px' }}>
                  @ {ROOM_LABELS[bot.location] ?? bot.location ?? '?'}
                </div>
              </div>
            </div>

            {/* Health + Charge bars */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
              <MiniBar label="HP" value={bot.health} max={100} color={healthColor(bot.health)} />
              <MiniBar label="CHG" value={bot.charge} max={100} color="#00aaff" />
              {bot.state === 'idle' && bot.location !== 'charging_bay' && (
                <button onClick={() => handleCharge(bot.id)}
                        style={{ ...smallBtn, color: '#00aaff', borderColor: '#00aaff' }}>CHG</button>
              )}
              {bot.state === 'idle' && bot.location === 'charging_bay' && bot.charge < 100 && (
                <span style={{ fontSize: '8px', color: '#00aaff' }}>↑CHG</span>
              )}
            </div>

            {/* Active job */}
            {bot.job && bot.state !== 'returning' && (
              <div style={{ marginTop: '4px', fontSize: '9px', color: '#888' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#aaa' }}>{fmtNum(bot.job.amount)} {bot.job.item}</span>
                  {bot.job.trips_remaining !== undefined && (
                    <span style={{ color: '#555' }}>
                      {bot.job.trips_remaining === null ? '∞' : bot.job.trips_remaining}x
                    </span>
                  )}
                </div>
                <div style={{ color: '#777' }}>
                  {ROOM_LABELS[bot.job.source] ?? bot.job.source}
                  {' → '}{ROOM_LABELS[bot.job.dest] ?? bot.job.dest}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <div style={{ flex: 1, height: '3px', background: '#111', borderRadius: '2px' }}>
                    <div style={{ width: `${((5 - bot.job.ticks_left) / 5) * 100}%`, height: '100%',
                                  background: bot.state === 'pickup' ? '#ffaa00' : ACCENT,
                                  borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '8px', color: '#666' }}>{bot.job.ticks_left}t</span>
                  <button onClick={() => handleCancel(bot.id)}
                          style={{ ...smallBtn, color: '#ff4444', borderColor: '#ff4444' }}>✕</button>
                  <button onClick={() => handleCharge(bot.id)}
                          style={{ ...smallBtn, color: '#00aaff', borderColor: '#00aaff' }}>CHG</button>
                </div>
              </div>
            )}
            {/* Returning to charge */}
            {bot.state === 'returning' && (
              <div style={{ marginTop: '4px', fontSize: '9px', color: '#00aaff' }}>
                ⟵ CHARGING BAY ({bot.job?.ticks_left}t)
                <button onClick={() => handleCancel(bot.id)}
                        style={{ ...smallBtn, color: '#ff4444', borderColor: '#ff4444', marginLeft: '6px' }}>✕</button>
              </div>
            )}
          </div>
        ))}

      </div>

      {/* ── CENTER: Dispatch Form ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px', gap: '6px',
                    overflowY: 'auto', minWidth: 0 }}>
        <div style={{ color: ACCENT, fontSize: '10px', letterSpacing: '3px', marginBottom: '2px' }}>
          DISPATCH TRANSPORT
        </div>

        {/* Source selection */}
        <Section label="SOURCE">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {sourceKeys.map(k => (
              <button key={k} data-testid={`src-${k}`} onClick={() => { setSelSource(k); setSelItem(null); setSelAmount('') }}
                      style={{ ...chipBtn, ...(selSource === k ? chipActive : {}) }}>
                {ROOM_LABELS[k] ?? k}
              </button>
            ))}
          </div>
        </Section>

        {/* Items at source */}
        {selSource && (
          <Section label="ITEM">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {sourceItems.length === 0 && <span style={{ color: '#444', fontSize: '10px' }}>No items</span>}
              {sourceItems.map(([item, qty]) => (
                <button key={item} data-testid={`item-${item}`} onClick={() => { setSelItem(item); setSelAmount('') }}
                        style={{ ...chipBtn, ...(selItem === item ? chipActive : {}) }}>
                  {item} ({fmtNum(qty)})
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Destination selection */}
        {selItem && (
          <Section label="DESTINATION">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {destKeys.map(k => (
                <button key={k} data-testid={`dst-${k}`} onClick={() => setSelDest(k)}
                        style={{ ...chipBtn, ...(selDest === k ? chipActive : {}) }}>
                  {ROOM_LABELS[k] ?? k}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Amount + trips */}
        {selDest && selItem && (
          <Section label={`AMOUNT (max ${fmtNum(maxAmt)}${LARGE_ITEMS.has(selItem) ? ' — large item' : ''})`}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input data-testid="amount-input" type="number" min={1} max={maxAmt} step={LARGE_ITEMS.has(selItem) ? 1 : 100}
                     value={selAmount} placeholder={fmtNum(maxAmt)}
                     onChange={e => setSelAmount(e.target.value)}
                     style={inputStyle} />
              <button onClick={() => setSelAmount(String(maxAmt))}
                      style={{ ...smallBtn, color: ACCENT2, borderColor: ACCENT2 }}>MAX</button>
            </div>
          </Section>
        )}

        {/* Trips */}
        {selDest && selItem && (
          <Section label="TRIPS">
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 5, 10, null].map(t => (
                <button key={String(t)} onClick={() => setSelTrips(t)}
                        style={{ ...chipBtn, ...(selTrips === t ? { ...chipActive, borderColor: ACCENT2, color: ACCENT2, background: '#0a1a18' } : {}) }}>
                  {t === null ? '∞' : t}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Bot picker (optional) */}
        {selDest && selItem && idleBots.length > 1 && (
          <Section label="ASSIGN TRANSPORT (optional)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <button onClick={() => setSelBotId(null)}
                      style={{ ...chipBtn, ...(!selBotId ? chipActive : {}) }}>AUTO</button>
              {idleBots.map(b => (
                <button key={b.id} onClick={() => setSelBotId(b.id)}
                        style={{ ...chipBtn, ...(selBotId === b.id ? chipActive : {}) }}>
                  T-{b.id} (HP:{Math.floor(b.health)} CHG:{Math.floor(b.charge)})
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Dispatch button */}
        {selDest && selItem && (
          <button data-testid="dispatch-btn" onClick={handleDispatch} disabled={idleBots.length === 0}
                  style={{ ...actionBtn, marginTop: '4px',
                           borderColor: idleBots.length > 0 ? ACCENT2 : '#333',
                           color: idleBots.length > 0 ? ACCENT2 : '#444',
                           opacity: idleBots.length > 0 ? 1 : 0.4 }}>
            {idleBots.length > 0
              ? `DISPATCH: ${fmtNum(selAmount || maxAmt)} ${selItem}  →  ${ROOM_LABELS[selDest] ?? selDest}`
              : 'NO IDLE TRANSPORTS'}
          </button>
        )}
      </div>

      {/* ── RIGHT: Room Inventories ──────────────────────────────────────── */}
      <div style={{ width: '240px', borderLeft: '1px solid #111', display: 'flex',
                    flexDirection: 'column', padding: '8px', gap: '4px', overflowY: 'auto' }}>
        <div style={{ color: ACCENT, fontSize: '10px', letterSpacing: '3px', marginBottom: '4px' }}>
          INVENTORIES
        </div>

        {Object.entries(rooms).map(([roomKey, inv]) => {
          if (TRANSPORT_EXCLUDED_ROOMS.has(roomKey)) return null
          const items = Object.entries(inv).filter(([, v]) => v > 0)
          if (items.length === 0) return null
          return (
            <div key={roomKey} style={{ background: CARD_BG, borderRadius: '4px', padding: '4px 6px',
                                         border: '1px solid #151530' }}>
              <div style={{ color: '#888', fontSize: '9px', letterSpacing: '2px', marginBottom: '2px' }}>
                {ROOM_LABELS[roomKey] ?? roomKey}
              </div>
              {items.map(([item, qty]) => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                  <span style={{ color: '#aaa' }}>{item}</span>
                  <span style={{ color: ACCENT2 }}>{fmtNum(qty)}</span>
                </div>
              ))}
            </div>
          )
        })}

        {/* Planet stockpile */}
        {planetStockpile && (
          <div style={{ background: CARD_BG, borderRadius: '4px', padding: '4px 6px',
                        border: '1px solid #2a1a30' }}>
            <div style={{ color: '#aa88ff', fontSize: '9px', letterSpacing: '2px', marginBottom: '2px' }}>
              PLANET
            </div>
            {Object.entries(planetStockpile).filter(([, v]) => v > 0).map(([item, qty]) => (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                <span style={{ color: '#aaa' }}>{item}</span>
                <span style={{ color: '#aa88ff' }}>{fmtNum(qty)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reusable sub-components ──────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div>
      <div style={{ color: '#555', fontSize: '9px', letterSpacing: '2px', marginBottom: '3px' }}>{label}</div>
      {children}
    </div>
  )
}

function MiniBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#666' }}>
        <span>{label}</span><span style={{ color }}>{Math.floor(value)}</span>
      </div>
      <div style={{ height: '3px', background: '#111', borderRadius: '2px', marginTop: '1px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

// ── Style objects ────────────────────────────────────────────────────────────

const chipBtn = {
  background: 'transparent', border: '1px solid #333', borderRadius: '3px',
  color: '#888', fontFamily: FONT, fontSize: '10px', padding: '3px 8px',
  cursor: 'pointer', transition: 'all .15s',
}
const chipActive = {
  borderColor: ACCENT, color: ACCENT, background: '#1a0a18',
}
const actionBtn = {
  background: 'transparent', border: '1px solid #333', borderRadius: '4px',
  color: '#888', fontFamily: FONT, fontSize: '11px', padding: '8px 12px',
  cursor: 'pointer', letterSpacing: '1px',
}
const smallBtn = {
  background: 'transparent', border: '1px solid #333', borderRadius: '3px',
  fontFamily: FONT, fontSize: '9px', padding: '2px 6px', cursor: 'pointer',
}
const inputStyle = {
  background: '#0a0a1a', border: '1px solid #333', borderRadius: '3px',
  color: ACCENT2, fontFamily: FONT, fontSize: '12px', padding: '4px 8px',
  width: '100px', outline: 'none',
}
