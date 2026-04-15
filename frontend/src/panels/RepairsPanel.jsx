import { useState, useMemo } from 'react'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG    = '#070714'
const CARD  = '#09091c'
const MUTED = '#1a2a3a'
const ACCENT = '#ffaa00'   // amber — distinct from navigation green and LRS cyan

// ── Static label maps ─────────────────────────────────────────────────────────
const SYSTEM_LABELS = {
  reactor_1_fuel:      'Reactor 1 (Fuel)',
  reactor_2_fuel:      'Reactor 2 (Fuel)',
  reactor_3_rad:       'Reactor 3 (Rad)',
  reactor_4_rad:       'Reactor 4 (Rad)',
  engine_1_electric:   'Engine 1 (Elec)',
  engine_2_electric:   'Engine 2 (Elec)',
  engine_3_fuel:       'Engine 3 (Fuel)',
  engine_4_fuel:       'Engine 4 (Fuel)',
  warp_drive:          'Warp Drive',
  short_range_scanner: 'Short-Range Scanner',
  long_range_scanner:  'Long-Range Scanner',
  comms_array:         'Comms Array',
  shield_system:       'Shield System',
  weapons_system:      'Weapons System',
}
const ROOM_LABELS = {
  power_room:     'Power Room',
  engine_room:    'Engine Room',
  weapons_room:   'Weapons Room',
  shields_room:   'Shields Room',
  living_quarters:'Living Quarters',
  cargo_bay:      'Cargo Bay',
  manufacturing:  'Manufacturing',
  charging_bay:   'Charging Bay',
}
const OUTER_LABELS = {
  front:     'Hull — Front',
  back:      'Hull — Back',
  port:      'Hull — Port',
  starboard: 'Hull — Starboard',
  above:     'Hull — Above',
  below:     'Hull — Below',
}
const ITEM_LABELS = {
  air_scrubbers:    'Air Scrubbers',
  lasers:           'Lasers',
  shield_batteries: 'Shield Batteries',
}
const BOT_TYPE_LABELS = { transport: 'Transport Bot', repair: 'Repair Bot', mining: 'Mining Bot' }

function healthColor(h) {
  if (h >= 80) return '#00ff88'
  if (h >= 50) return ACCENT
  if (h >= 25) return '#ff8800'
  return '#ff3333'
}

// ── Health bar ────────────────────────────────────────────────────────────────
function HealthBar({ value, width = '100%', height = 4 }) {
  const color = healthColor(value)
  return (
    <div style={{ width, height, background: '#111', border: '1px solid #223', flexShrink: 0 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color }} />
    </div>
  )
}

// ── Charge bar ────────────────────────────────────────────────────────────────
function ChargeBar({ value, width = '100%', height = 4 }) {
  return (
    <div style={{ width, height, background: '#111', border: '1px solid #223', flexShrink: 0 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: '#2288ff' }} />
    </div>
  )
}

// ── Bot list (left column) ────────────────────────────────────────────────────
function BotList({ bots, selectedId, setSelected }) {
  if (bots.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: MUTED, fontSize: 10, letterSpacing: 2, fontFamily: 'Courier New' }}>
          NO REPAIR BOTS
        </div>
      </div>
    )
  }
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {bots.map(bot => {
        const isSel  = bot.id === selectedId
        const stateColor = {
          idle:      '#334455',
          traveling: ACCENT,
          repairing: '#44ff88',
          returning: '#4488ff',
        }[bot.state] ?? '#334455'
        return (
          <div key={bot.id}
            data-testid={`rep-bot-${bot.id}`}
            onClick={() => setSelected(isSel ? null : bot.id)}
            style={{
              padding: '10px 10px', borderBottom: '1px solid #0a0a18',
              background: isSel ? '#0a1420' : 'transparent',
              borderLeft: `3px solid ${isSel ? ACCENT : 'transparent'}`,
              cursor: 'pointer', fontFamily: 'Courier New',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: isSel ? ACCENT : '#8899bb' }}>
                ✦ BOT #{bot.id}
              </span>
              <span style={{ fontSize: 9, color: stateColor, letterSpacing: 1 }}>
                {bot.state.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 8, color: '#334455', width: 36 }}>HLTH</span>
              <HealthBar value={bot.health} width="100%" />
              <span style={{ fontSize: 8, color: healthColor(bot.health), minWidth: 28, textAlign: 'right' }}>
                {Math.round(bot.health)}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: '#334455', width: 36 }}>CHG</span>
              <ChargeBar value={bot.charge} width="100%" />
              <span style={{ fontSize: 8, color: '#5588aa', minWidth: 28, textAlign: 'right' }}>
                {Math.round(bot.charge)}%
              </span>
            </div>
            {bot.job?.target && (
              <div style={{ fontSize: 8, color: '#3a5566', marginTop: 4, letterSpacing: 0.5 }}>
                → {bot.job.target.type}: {
                  bot.job.target.key ?? bot.job.target.room ?? bot.job.target.side ?? bot.job.target.item ??
                  (bot.job.target.bot_type ? `${bot.job.target.bot_type} #${bot.job.target.id}` : '?')
                }
                {bot.state === 'traveling' && ` (${bot.job.ticks_left}t)`}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Target list (middle column) ───────────────────────────────────────────────
const CAT_TABS = ['SYSTEMS', 'ROOMS', 'HULL', 'BOTS', 'ITEMS']

function TargetRow({ label, health, target, selectedTarget, onSelect }) {
  const isSel = JSON.stringify(selectedTarget) === JSON.stringify(target)
  const needsRepair = health < 100
  const _testKey = target.key ?? target.room ?? target.side ?? target.item ?? `${target.bot_type}-${target.id}`
  return (
    <div
      onClick={() => needsRepair && onSelect(isSel ? null : target)}
      style={{
        padding: '7px 10px', borderBottom: '1px solid #0a0a18',
        background: isSel ? '#10180a' : 'transparent',
        borderLeft: `3px solid ${isSel ? '#44ff88' : 'transparent'}`,
        cursor: needsRepair ? 'pointer' : 'default',
        opacity: needsRepair ? 1 : 0.4,
        fontFamily: 'Courier New',
      }}
      data-testid={`rep-target-${target.type}-${_testKey}`}
      >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: isSel ? '#44ff88' : '#7799aa' }}>{label}</span>
        <span style={{ fontSize: 9, color: healthColor(health) }}>{Math.round(health)}%</span>
      </div>
      <HealthBar value={health} />
    </div>
  )
}

function TargetList({ ship, cat, selectedTarget, setTarget }) {
  const bots = useMemo(() => {
    const all = []
    ;(ship.transport_bots ?? []).forEach(b => all.push({ ...b, bot_type: 'transport' }))
    ;(ship.repair_bots ?? []).forEach(b => all.push({ ...b, bot_type: 'repair' }))
    ;(ship.mining_bots_list ?? []).forEach(b => all.push({ ...b, bot_type: 'mining' }))
    return all
  }, [ship])

  if (cat === 'SYSTEMS') {
    return Object.entries(ship.system_health ?? {}).map(([key, h]) => (
      <TargetRow key={key} label={SYSTEM_LABELS[key] ?? key} health={h}
        target={{ type: 'system', key }} selectedTarget={selectedTarget} onSelect={setTarget} />
    ))
  }
  if (cat === 'ROOMS') {
    return Object.entries(ship.room_hull_health ?? {}).map(([room, h]) => (
      <TargetRow key={room} label={ROOM_LABELS[room] ?? room} health={h}
        target={{ type: 'room_hull', room }} selectedTarget={selectedTarget} onSelect={setTarget} />
    ))
  }
  if (cat === 'HULL') {
    return Object.entries(ship.outer_hull_health ?? {}).map(([side, h]) => (
      <TargetRow key={side} label={OUTER_LABELS[side] ?? side} health={h}
        target={{ type: 'outer_hull', side }} selectedTarget={selectedTarget} onSelect={setTarget} />
    ))
  }
  if (cat === 'BOTS') {
    if (bots.length === 0) {
      return <div style={{ padding: 16, color: MUTED, fontSize: 10, fontFamily: 'Courier New' }}>No bots aboard</div>
    }
    return bots.map(b => (
      <TargetRow key={`${b.bot_type}-${b.id}`}
        label={`${BOT_TYPE_LABELS[b.bot_type] ?? b.bot_type} #${b.id}`}
        health={b.health}
        target={{ type: 'bot', bot_type: b.bot_type, id: b.id }}
        selectedTarget={selectedTarget} onSelect={setTarget} />
    ))
  }
  if (cat === 'ITEMS') {
    return Object.entries(ship.item_health ?? {}).map(([item, h]) => (
      <TargetRow key={item} label={ITEM_LABELS[item] ?? item} health={h}
        target={{ type: 'item', item }} selectedTarget={selectedTarget} onSelect={setTarget} />
    ))
  }
  return null
}

// ── Dispatch card (right column) ──────────────────────────────────────────────
function targetLabel(t) {
  if (!t) return ''
  if (t.type === 'system')     return SYSTEM_LABELS[t.key] ?? t.key
  if (t.type === 'room_hull')  return ROOM_LABELS[t.room] ?? t.room
  if (t.type === 'outer_hull') return OUTER_LABELS[t.side] ?? t.side
  if (t.type === 'bot')        return `${BOT_TYPE_LABELS[t.bot_type] ?? t.bot_type} #${t.id}`
  if (t.type === 'item')       return ITEM_LABELS[t.item] ?? t.item
  return '?'
}

function currentTargetHealth(ship, t) {
  if (!t || !ship) return null
  if (t.type === 'system')     return ship.system_health?.[t.key]
  if (t.type === 'room_hull')  return ship.room_hull_health?.[t.room]
  if (t.type === 'outer_hull') return ship.outer_hull_health?.[t.side]
  if (t.type === 'item')       return ship.item_health?.[t.item]
  if (t.type === 'bot') {
    const list = t.bot_type === 'transport' ? ship.transport_bots
               : t.bot_type === 'repair'    ? ship.repair_bots
               : ship.mining_bots_list ?? []
    return (list ?? []).find(b => b.id === t.id)?.health ?? null
  }
  return null
}

function DispatchCard({ ship, selectedBotId, selectedTarget, isRunning, sendCommand, repairsGw }) {
  const bot = (ship?.repair_bots ?? []).find(b => b.id === selectedBotId)

  const canDispatch = bot && bot.state === 'idle' && selectedTarget && isRunning
  const canRecall   = bot && bot.state !== 'idle' && isRunning

  const targetHealth = currentTargetHealth(ship, selectedTarget)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Power indicator */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #0a1020', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Courier New' }}>
          <span style={{ color: MUTED }}>REPAIRS POWER</span>
          <span style={{ color: repairsGw > 0 ? ACCENT : '#334455' }}>{repairsGw.toFixed(1)} GW</span>
        </div>
        <div style={{ marginTop: 4, height: 3, background: '#0a1020', border: '1px solid #0d1a28' }}>
          <div style={{ width: `${Math.min(100, repairsGw)}%`, height: '100%', background: ACCENT, opacity: 0.6 }} />
        </div>
        {repairsGw < 1 && (
          <div style={{ fontSize: 8, color: '#664400', fontFamily: 'Courier New', marginTop: 4, letterSpacing: 0.5 }}>
            ⚠ Allocate REPAIRS power to operate bots
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
        {/* Selected bot */}
        <div style={{ fontSize: 8, color: MUTED, letterSpacing: 2, fontFamily: 'Courier New', marginBottom: 6 }}>
          REPAIR BOT
        </div>
        {bot ? (
          <div style={{
            padding: '8px 10px', background: '#040a10', border: `1px solid ${ACCENT}33`,
            fontFamily: 'Courier New', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: ACCENT, marginBottom: 6 }}>✦ BOT #{bot.id}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 8, color: MUTED, width: 36 }}>HLTH</span>
              <HealthBar value={bot.health} width="100%" />
              <span style={{ fontSize: 8, color: healthColor(bot.health), minWidth: 28, textAlign: 'right' }}>
                {Math.round(bot.health)}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 8, color: MUTED, width: 36 }}>CHG</span>
              <ChargeBar value={bot.charge} width="100%" />
              <span style={{ fontSize: 8, color: '#5588aa', minWidth: 28, textAlign: 'right' }}>
                {Math.round(bot.charge)}%
              </span>
            </div>
            <div style={{ fontSize: 9, color: {
              idle: '#334455', traveling: ACCENT, repairing: '#44ff88', returning: '#4488ff',
            }[bot.state] ?? '#334455', letterSpacing: 1 }}>
              {bot.state.toUpperCase()}
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px 10px', background: '#040a10', border: '1px solid #0a1828',
            color: MUTED, fontSize: 10, fontFamily: 'Courier New', marginBottom: 14 }}>
            Select a repair bot ←
          </div>
        )}

        {/* Selected target */}
        <div style={{ fontSize: 8, color: MUTED, letterSpacing: 2, fontFamily: 'Courier New', marginBottom: 6 }}>
          TARGET
        </div>
        {selectedTarget ? (
          <div style={{
            padding: '8px 10px', background: '#040a10', border: '1px solid #1a3a1a',
            fontFamily: 'Courier New', marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: '#44ff88', marginBottom: 4 }}>
              {targetLabel(selectedTarget)}
            </div>
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>
              {selectedTarget.type.replace('_', ' ').toUpperCase()}
            </div>
            {targetHealth !== null && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <HealthBar value={targetHealth} width="100%" />
                <span style={{ fontSize: 8, color: healthColor(targetHealth), minWidth: 28, textAlign: 'right' }}>
                  {Math.round(targetHealth)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '8px 10px', background: '#040a10', border: '1px solid #0a1828',
            color: MUTED, fontSize: 10, fontFamily: 'Courier New', marginBottom: 14 }}>
            Select a target →
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            data-testid="rep-dispatch-btn"
            disabled={!canDispatch}
            onClick={() => sendCommand({ type: 'dispatch_repair_bot', bot_id: selectedBotId, target: selectedTarget })}
            style={{
              padding: '8px', fontFamily: 'Courier New', fontSize: 10, letterSpacing: 1,
              background: canDispatch ? '#002211' : '#0a0a0a',
              border: `1px solid ${canDispatch ? '#44ff88' : '#1a1a1a'}`,
              color: canDispatch ? '#44ff88' : '#334455',
              cursor: canDispatch ? 'pointer' : 'not-allowed',
            }}>
            ▶ DISPATCH BOT
          </button>
          <button
            disabled={!canRecall}
            onClick={() => sendCommand({ type: 'recall_repair_bot', bot_id: selectedBotId })}
            style={{
              padding: '8px', fontFamily: 'Courier New', fontSize: 10, letterSpacing: 1,
              background: canRecall ? '#221100' : '#0a0a0a',
              border: `1px solid ${canRecall ? ACCENT : '#1a1a1a'}`,
              color: canRecall ? ACCENT : '#334455',
              cursor: canRecall ? 'pointer' : 'not-allowed',
            }}>
            ◀ RECALL BOT
          </button>
        </div>

        {/* Repair rate hint */}
        {canDispatch && (
          <div style={{ marginTop: 10, fontSize: 8, color: '#335533', fontFamily: 'Courier New', letterSpacing: 0.5 }}>
            Rate: +0.5 HP/tick · ~{Math.ceil((100 - (targetHealth ?? 100)) / 0.5)} ticks
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function RepairsPanel({ gameState, sendCommand }) {
  const [selectedBotId, setSelectedBotId] = useState(null)
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [cat, setCat] = useState('SYSTEMS')

  const ship     = gameState?.ship
  const bots     = ship?.repair_bots ?? []
  const isRunning = gameState?.status === 'running'

  const repairsGw = ship
    ? (ship.net_power_gw ?? 0) * ((ship.power_allocation?.repairs ?? 0) / 100)
    : 0

  // Summary counts for header
  const damagedSystems = Object.values(ship?.system_health ?? {}).filter(h => h < 100).length
  const damagedRooms   = [
    ...Object.values(ship?.room_hull_health ?? {}),
    ...Object.values(ship?.outer_hull_health ?? {}),
  ].filter(h => h < 100).length
  const damagedTotal = damagedSystems + damagedRooms

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden', fontFamily: 'Courier New' }}>

      {/* Header */}
      <div style={{
        padding: '7px 14px', borderBottom: '1px solid #1a1a0a', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 11, color: ACCENT, letterSpacing: 3, fontWeight: 'bold' }}>
          ✦ REPAIRS
        </span>
        <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>
          {bots.length} BOT{bots.length !== 1 ? 'S' : ''} · {damagedTotal} COMPONENT{damagedTotal !== 1 ? 'S' : ''} DAMAGED
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: repairsGw > 0 ? ACCENT : '#334455' }}>
          {repairsGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: bot list */}
        <div style={{ width: 180, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0a0a18', flexShrink: 0 }}>
          <div style={{ padding: '5px 10px', fontSize: 8, color: MUTED, letterSpacing: 2, borderBottom: '1px solid #0a0a18', flexShrink: 0 }}>
            REPAIR BOTS
          </div>
          <BotList bots={bots} selectedId={selectedBotId} setSelected={setSelectedBotId} />
        </div>

        {/* Middle: target categories + list */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0a0a18', overflow: 'hidden' }}>
          {/* Category tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #0a0a18', flexShrink: 0 }}>
            {CAT_TABS.map(tab => (
              <button key={tab} data-testid={`rep-tab-${tab.toLowerCase()}`} onClick={() => setCat(tab)} style={{
                flex: 1, padding: '6px 2px', background: cat === tab ? '#0a1020' : 'transparent',
                color: cat === tab ? ACCENT : MUTED,
                border: 'none', borderBottom: cat === tab ? `2px solid ${ACCENT}` : '2px solid transparent',
                fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1, cursor: 'pointer',
              }}>
                {tab}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {ship ? (
              <TargetList ship={ship} cat={cat} selectedTarget={selectedTarget} setTarget={setSelectedTarget} />
            ) : (
              <div style={{ padding: 20, color: MUTED, fontSize: 10 }}>No game data</div>
            )}
          </div>
        </div>

        {/* Right: dispatch controls */}
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '5px 10px', fontSize: 8, color: MUTED, letterSpacing: 2, borderBottom: '1px solid #0a0a18', flexShrink: 0 }}>
            DISPATCH
          </div>
          <DispatchCard
            ship={ship}
            selectedBotId={selectedBotId}
            selectedTarget={selectedTarget}
            isRunning={isRunning}
            sendCommand={sendCommand}
            repairsGw={repairsGw}
          />
        </div>

      </div>
    </div>
  )
}
