import { useState } from 'react'
import { Btn, ChipBtn } from '../components/ui'
import { healthColor } from '../shared'
import s from './TransportationPanel.module.css'

// ── Style constants (match other panels) ──────────────────────────────────
const ACCENT  = '#ff88cc'
const ACCENT2 = 'var(--accent-cyan)'

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
  if (state === 'pickup') return 'var(--accent-amber)'
  if (state === 'deliver') return ACCENT
  if (state === 'returning') return 'var(--accent)'
  return DIM
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
      <div className={s.noSignal}>
        NO SIGNAL
      </div>
    )
  }

  // Planet stockpile (only available as source when orbiting)
  const planetStockpile = orbitingPlanet
    ? gameState?.current_system?.planets
        ?.find(p => p.id === orbitingPlanet)?.stockpile ?? null
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
    <div className={s.container}>

      {/* ── LEFT: Bot Fleet ──────────────────────────────────────────────── */}
      <div className={s.fleet}>
        {/* Fleet header + charging bay info */}
        <div className={s.fleetHeader}>
          <div className={s.fleetTitle}>
            TRANSPORT FLEET ({bots.length})
          </div>
          {(() => {
            const totalGw = ship.net_power_gw ?? 0
            const bayPct  = ship.power_allocation?.charging_bay ?? 0
            const bayGw   = totalGw * bayPct / 100
            const chargeRate = gameState?.constants?.CHARGING_BAY_CHARGE_RATE_PER_GW ?? 2
            const allBots = [...bots, ...(ship.repair_bots ?? []), ...(ship.mining_bots_list ?? [])]
            const inBay   = allBots.filter(b => b.location === 'charging_bay' && b.state === 'idle').length
            return (
              <div className={s.bayInfo}>
                CHARGING BAY: <span style={{ color: 'var(--accent)' }}>{bayGw.toFixed(1)} GW</span>
                {inBay > 0 && <span style={{ color: 'var(--text-muted)' }}> ÷ {inBay} bot{inBay !== 1 ? 's' : ''} = <span style={{ color: 'var(--accent)' }}>{inBay > 0 ? (bayGw / inBay * chargeRate).toFixed(1) : '0'} CHG/t</span></span>}
              </div>
            )
          })()}
        </div>

        {bots.map(bot => (
          <div key={bot.id} className={s.botCard} style={{
            border: `1px solid ${bot.state !== 'idle' ? ACCENT : 'var(--border)'}`,
          }}>
            <div className={s.botTop}>
              <span style={{ color: statusColor(bot.state), fontWeight: 'bold' }}>
                TRANSPORT #{bot.id}
              </span>
              <div className={s.botRight}>
                <span className={s.botStatus} style={{ color: statusColor(bot.state) }}>
                  {bot.state.toUpperCase()}
                </span>
                <div className={s.botLoc}>
                  @ {ROOM_LABELS[bot.location] ?? bot.location ?? '?'}
                </div>
              </div>
            </div>

            {/* Health + Charge bars */}
            <div className={s.botBars}>
              <MiniBar label="HP" value={bot.health} max={100} color={healthColor(bot.health)} />
              <MiniBar label="CHG" value={bot.charge} max={100} color="#00aaff" />
              {bot.state === 'idle' && bot.location !== 'charging_bay' && (
                <Btn small onClick={() => handleCharge(bot.id)} color="var(--accent)">CHG</Btn>
              )}
              {bot.state === 'idle' && bot.location === 'charging_bay' && bot.charge < 100 && (
                <span className={s.chargingSmall}>↑CHG</span>
              )}
            </div>

            {/* Active job */}
            {bot.job && bot.state !== 'returning' && (
              <div className={s.jobWrap}>
                <div className={s.jobHeader}>
                  <span className={s.jobItem}>{fmtNum(bot.job.amount)} {bot.job.item}</span>
                  {bot.job.trips_remaining !== undefined && (
                    <span className={s.jobTrips}>
                      {bot.job.trips_remaining === null ? '∞' : bot.job.trips_remaining}x
                    </span>
                  )}
                </div>
                <div className={s.jobRoute}>
                  {ROOM_LABELS[bot.job.source] ?? bot.job.source}
                  {' → '}{ROOM_LABELS[bot.job.dest] ?? bot.job.dest}
                </div>
                <div className={s.jobProgress}>
                  <div className={s.jobTrack}>
                    <div className={s.jobFill} style={{
                      width: `${((5 - bot.job.ticks_left) / 5) * 100}%`,
                      background: bot.state === 'pickup' ? '#ffaa00' : ACCENT,
                    }} />
                  </div>
                  <span className={s.jobTicks}>{bot.job.ticks_left}t</span>
                  <Btn small onClick={() => handleCancel(bot.id)} color="var(--status-bad)">✕</Btn>
                  <Btn small onClick={() => handleCharge(bot.id)} color="var(--accent)">CHG</Btn>
                </div>
              </div>
            )}
            {/* Returning to charge */}
            {bot.state === 'returning' && (
              <div className={s.returnInfo}>
                ⟵ CHARGING BAY ({bot.job?.ticks_left}t)
                <Btn small onClick={() => handleCancel(bot.id)} color="var(--status-bad)" style={{ marginLeft: '6px' }}>✕</Btn>
              </div>
            )}
          </div>
        ))}

      </div>

      {/* ── CENTER: Dispatch Form ────────────────────────────────────────── */}
      <div className={s.dispatch}>
        <div className={s.dispatchTitle}>
          DISPATCH TRANSPORT
        </div>

        {/* Source selection */}
        <Section label="SOURCE">
          <div className={s.chipWrap}>
            {sourceKeys.map(k => (
              <ChipBtn key={k} data-testid={`src-${k}`} onClick={() => { setSelSource(k); setSelItem(null); setSelAmount('') }}
                       active={selSource === k} accentColor={ACCENT} activeBg="#1a0a18">
                {ROOM_LABELS[k] ?? k}
              </ChipBtn>
            ))}
          </div>
        </Section>

        {/* Items at source */}
        {selSource && (
          <Section label="ITEM">
            <div className={s.chipWrap}>
              {sourceItems.length === 0 && <span className={s.noItems}>No items</span>}
              {sourceItems.map(([item, qty]) => (
                <ChipBtn key={item} data-testid={`item-${item}`} onClick={() => { setSelItem(item); setSelAmount('') }}
                         active={selItem === item} accentColor={ACCENT} activeBg="#1a0a18">
                  {item} ({fmtNum(qty)})
                </ChipBtn>
              ))}
            </div>
          </Section>
        )}

        {/* Destination selection */}
        {selItem && (
          <Section label="DESTINATION">
            <div className={s.chipWrap}>
              {destKeys.map(k => (
                <ChipBtn key={k} data-testid={`dst-${k}`} onClick={() => setSelDest(k)}
                         active={selDest === k} accentColor={ACCENT} activeBg="#1a0a18">
                  {ROOM_LABELS[k] ?? k}
                </ChipBtn>
              ))}
            </div>
          </Section>
        )}

        {/* Amount + trips */}
        {selDest && selItem && (
          <Section label={`AMOUNT (max ${fmtNum(maxAmt)}${LARGE_ITEMS.has(selItem) ? ' — large item' : ''})`}>
            <div className={s.amountRow}>
              <input data-testid="amount-input" type="number" min={1} max={maxAmt} step={LARGE_ITEMS.has(selItem) ? 1 : 100}
                     value={selAmount} placeholder={fmtNum(maxAmt)}
                     onChange={e => setSelAmount(e.target.value)}
                     className={s.amountInput} />
              <Btn small onClick={() => setSelAmount(String(maxAmt))} color={ACCENT2}>MAX</Btn>
            </div>
          </Section>
        )}

        {/* Trips */}
        {selDest && selItem && (
          <Section label="TRIPS">
            <div className={s.chipWrap}>
              {[1, 5, 10, null].map(t => (
                <ChipBtn key={String(t)} onClick={() => setSelTrips(t)}
                         active={selTrips === t} accentColor={ACCENT2} activeBg="var(--tint-success)">
                  {t === null ? '∞' : t}
                </ChipBtn>
              ))}
            </div>
          </Section>
        )}

        {/* Bot picker (optional) */}
        {selDest && selItem && idleBots.length > 1 && (
          <Section label="ASSIGN TRANSPORT (optional)">
            <div className={s.chipWrap}>
              <ChipBtn onClick={() => setSelBotId(null)} active={!selBotId} accentColor={ACCENT} activeBg="#1a0a18">AUTO</ChipBtn>
              {idleBots.map(b => (
                <ChipBtn key={b.id} onClick={() => setSelBotId(b.id)}
                         active={selBotId === b.id} accentColor={ACCENT} activeBg="#1a0a18">
                  T-{b.id} (HP:{Math.floor(b.health)} CHG:{Math.floor(b.charge)})
                </ChipBtn>
              ))}
            </div>
          </Section>
        )}

        {/* Dispatch button */}
        {selDest && selItem && (
          <Btn data-testid="dispatch-btn" onClick={handleDispatch} disabled={idleBots.length === 0}
               color={idleBots.length > 0 ? ACCENT2 : 'var(--text-muted)'}
               borderColor={idleBots.length > 0 ? ACCENT2 : 'var(--border-faint)'}
               style={{ marginTop: '4px', padding: '8px 12px', fontSize: '11px', letterSpacing: '1px', borderRadius: '4px', opacity: idleBots.length > 0 ? 1 : 0.4 }}>
            {idleBots.length > 0
              ? `DISPATCH: ${fmtNum(selAmount || maxAmt)} ${selItem}  →  ${ROOM_LABELS[selDest] ?? selDest}`
              : 'NO IDLE TRANSPORTS'}
          </Btn>
        )}
      </div>

      {/* ── RIGHT: Room Inventories ──────────────────────────────────────── */}
      <div className={s.inventories}>
        <div className={s.invTitle}>
          INVENTORIES
        </div>

        {Object.entries(rooms).map(([roomKey, inv]) => {
          if (TRANSPORT_EXCLUDED_ROOMS.has(roomKey)) return null
          const items = Object.entries(inv).filter(([, v]) => v > 0)
          if (items.length === 0) return null
          return (
            <div key={roomKey} className={s.roomCard}>
              <div className={s.roomName}>
                {ROOM_LABELS[roomKey] ?? roomKey}
              </div>
              {items.map(([item, qty]) => (
                <div key={item} className={s.invRow}>
                  <span className={s.invItem}>{item}</span>
                  <span className={s.invQty}>{fmtNum(qty)}</span>
                </div>
              ))}
            </div>
          )
        })}

        {/* Planet stockpile */}
        {planetStockpile && (
          <div className={s.planetCard}>
            <div className={s.planetLabel}>
              PLANET
            </div>
            {Object.entries(planetStockpile).filter(([, v]) => v > 0).map(([item, qty]) => (
              <div key={item} className={s.invRow}>
                <span className={s.invItem}>{item}</span>
                <span className={s.planetQty}>{fmtNum(qty)}</span>
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
      <div className={s.sectionLabel}>{label}</div>
      {children}
    </div>
  )
}

function MiniBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className={s.miniBarWrap}>
      <div className={s.miniBarHeader}>
        <span>{label}</span><span style={{ color }}>{Math.floor(value)}</span>
      </div>
      <div className={s.miniBarTrack}>
        <div className={s.miniBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Style objects ────────────────────────────────────────────────────────────
