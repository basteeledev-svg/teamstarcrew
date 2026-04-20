import { useState, useMemo } from 'react'
import { healthColor } from '../shared'
import s from './RepairsPanel.module.css'
// ── Theme ─────────────────────────────────────────────────────────────────────
const MUTED  = 'var(--text-ghost)'
const ACCENT = 'var(--accent-amber)'

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

// ── Health bar ────────────────────────────────────────────────────────────────
function HealthBar({ value, width = '100%', height = 4 }) {
  const color = healthColor(value)
  return (
    <div className={s.barTrack} style={{ width, height }}>
      <div className={s.barFill} style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  )
}

// ── Charge bar ────────────────────────────────────────────────────────────────
function ChargeBar({ value, width = '100%', height = 4 }) {
  return (
    <div className={s.barTrack} style={{ width, height }}>
      <div className={s.chargeBarFill} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

// ── Bot list (left column) ────────────────────────────────────────────────────
function BotList({ bots, selectedId, setSelected }) {
  if (bots.length === 0) {
    return (
      <div className={s.botListEmpty}>
        <div className={s.botListEmptyText}>
          NO REPAIR BOTS
        </div>
      </div>
    )
  }
  return (
    <div className={s.botListScroll}>
      {bots.map(bot => {
        const isSel  = bot.id === selectedId
        const stateColor = {
          idle:      'var(--text-dim)',
          traveling: ACCENT,
          repairing: '#44ff88',
          returning: '#4488ff',
        }[bot.state] ?? 'var(--text-dim)'
        return (
          <div key={bot.id}
            data-testid={`rep-bot-${bot.id}`}
            onClick={() => setSelected(isSel ? null : bot.id)}
            className={s.botListEntry}
            style={{
              background: isSel ? 'var(--bg-raised)' : 'transparent',
              borderLeft: `3px solid ${isSel ? ACCENT : 'transparent'}`,
            }}>
            <div className={s.botEntryHeader}>
              <span className={s.botEntryName} style={{ color: isSel ? ACCENT : 'var(--text-body)' }}>
                ✦ BOT #{bot.id}
              </span>
              <span className={s.botEntryState} style={{ color: stateColor }}>
                {bot.state.toUpperCase()}
              </span>
            </div>
            <div className={s.barRow} style={{ marginBottom: 3 }}>
              <span className={s.barLabel}>HLTH</span>
              <HealthBar value={bot.health} width="100%" />
              <span className={s.barValue} style={{ color: healthColor(bot.health) }}>
                {Math.round(bot.health)}%
              </span>
            </div>
            <div className={s.barRow}>
              <span className={s.barLabel}>CHG</span>
              <ChargeBar value={bot.charge} width="100%" />
              <span className={s.barValue}>
                {Math.round(bot.charge)}%
              </span>
            </div>
            {bot.job?.target && (
              <div className={s.botEntryTarget}>
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
      className={s.targetRow}
      style={{
        background: isSel ? 'var(--bg-raised)' : 'transparent',
        borderLeft: `3px solid ${isSel ? '#44ff88' : 'transparent'}`,
        cursor: needsRepair ? 'pointer' : 'default',
        opacity: needsRepair ? 1 : 0.4,
      }}
      data-testid={`rep-target-${target.type}-${_testKey}`}
      >
      <div className={s.targetRowHeader}>
        <span className={s.targetRowLabel} style={{ color: isSel ? '#44ff88' : 'var(--text-body)' }}>{label}</span>
        <span className={s.targetRowHealth} style={{ color: healthColor(health) }}>{Math.round(health)}%</span>
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
      return <div className={s.noBotsMsg}>No bots aboard</div>
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
    <div className={s.dispatchCol}>
      {/* Power indicator */}
      <div className={s.powerSection}>
        <div className={s.powerHeader}>
          <span className={s.powerLabel}>REPAIRS POWER</span>
          <span style={{ color: repairsGw > 0 ? ACCENT : 'var(--text-dim)' }}>{repairsGw.toFixed(1)} GW</span>
        </div>
        <div className={s.powerBarTrack}>
          <div className={s.powerBarFill} style={{ width: `${Math.min(100, repairsGw)}%` }} />
        </div>
        {repairsGw < 1 && (
          <div className={s.powerWarning}>
            ⚠ Allocate REPAIRS power to operate bots
          </div>
        )}
      </div>

      <div className={s.dispatchScroll}>
        {/* Selected bot */}
        <div className={s.sectionLabel}>
          REPAIR BOT
        </div>
        {bot ? (
          <div className={s.botCard} style={{ border: `1px solid ${ACCENT}33` }}>
            <div className={s.botCardName} style={{ color: ACCENT }}>✦ BOT #{bot.id}</div>
            <div className={s.barRow} style={{ marginBottom: 3 }}>
              <span className={s.barLabel} style={{ color: 'var(--text-ghost)' }}>HLTH</span>
              <HealthBar value={bot.health} width="100%" />
              <span className={s.barValue}>
                {Math.round(bot.charge)}%
              </span>
            </div>
            <div className={s.barRow} style={{ marginBottom: 6 }}>
              <span className={s.barLabel} style={{ color: 'var(--text-ghost)' }}>CHG</span>
              <ChargeBar value={bot.charge} width="100%" />
              <span className={s.barValue}>
                {Math.round(bot.charge)}%
              </span>
            </div>
            <div className={s.botCardState} style={{ color: {
              idle: 'var(--text-dim)', traveling: ACCENT, repairing: '#44ff88', returning: '#4488ff',
            }[bot.state] ?? 'var(--text-dim)' }}>
              {bot.state.toUpperCase()}
            </div>
          </div>
        ) : (
          <div className={s.selectPrompt}>
            Select a repair bot ←
          </div>
        )}

        {/* Selected target */}
        <div className={s.sectionLabel}>
          TARGET
        </div>
        {selectedTarget ? (
          <div className={s.targetCard}>
            <div className={s.targetCardName}>
              {targetLabel(selectedTarget)}
            </div>
            <div className={s.targetCardType}>
              {selectedTarget.type.replace('_', ' ').toUpperCase()}
            </div>
            {targetHealth !== null && (
              <div className={s.healthRow}>
                <HealthBar value={targetHealth} width="100%" />
                <span className={s.barValue} style={{ color: healthColor(targetHealth) }}>
                  {Math.round(targetHealth)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className={s.selectPrompt}>
            Select a target →
          </div>
        )}

        {/* Action buttons */}
        <div className={s.actionButtons}>
          <button
            data-testid="rep-dispatch-btn"
            disabled={!canDispatch}
            onClick={() => sendCommand({ type: 'dispatch_repair_bot', bot_id: selectedBotId, target: selectedTarget })}
            className={s.actionBtn}
            style={{
              background: canDispatch ? 'var(--tint-success)' : 'var(--bg-base)',
              border: `1px solid ${canDispatch ? '#44ff88' : 'var(--border)'}`,
              color: canDispatch ? '#44ff88' : 'var(--text-dim)',
              cursor: canDispatch ? 'pointer' : 'not-allowed',
            }}>
            ▶ DISPATCH BOT
          </button>
          <button
            disabled={!canRecall}
            onClick={() => sendCommand({ type: 'recall_repair_bot', bot_id: selectedBotId })}
            className={s.actionBtn}
            style={{
              background: canRecall ? '#221100' : 'var(--bg-base)',
              border: `1px solid ${canRecall ? ACCENT : 'var(--border)'}`,
              color: canRecall ? ACCENT : 'var(--text-dim)',
              cursor: canRecall ? 'pointer' : 'not-allowed',
            }}>
            ◀ RECALL BOT
          </button>
        </div>

        {/* Repair rate hint */}
        {canDispatch && (
          <div className={s.rateHint}>
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
    ? (ship.net_power_gw ?? 0) * ((ship.power_allocation?.charging_bay ?? 0) / 100)
    : 0

  // Summary counts for header
  const damagedSystems = Object.values(ship?.system_health ?? {}).filter(h => h < 100).length
  const damagedRooms   = [
    ...Object.values(ship?.room_hull_health ?? {}),
    ...Object.values(ship?.outer_hull_health ?? {}),
  ].filter(h => h < 100).length
  const damagedTotal = damagedSystems + damagedRooms

  return (
    <div className={s.container}>

      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle} style={{ color: ACCENT }}>
          ✦ REPAIRS
        </span>
        <span className={s.headerSummary}>
          {bots.length} BOT{bots.length !== 1 ? 'S' : ''} · {damagedTotal} COMPONENT{damagedTotal !== 1 ? 'S' : ''} DAMAGED
        </span>
        <span className={s.headerPower} style={{ color: repairsGw > 0 ? ACCENT : 'var(--text-dim)' }}>
          {repairsGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div className={s.body}>

        {/* Left: bot list */}
        <div className={s.leftCol}>
          <div className={s.colTitle}>
            REPAIR BOTS
          </div>
          <BotList bots={bots} selectedId={selectedBotId} setSelected={setSelectedBotId} />
        </div>

        {/* Middle: target categories + list */}
        <div className={s.middleCol}>
          {/* Category tabs */}
          <div className={s.catTabs}>
            {CAT_TABS.map(tab => (
              <button key={tab} data-testid={`rep-tab-${tab.toLowerCase()}`} onClick={() => setCat(tab)}
                className={s.catTab}
                style={{
                  background: cat === tab ? '#0a1020' : 'transparent',
                  color: cat === tab ? ACCENT : MUTED,
                  borderBottom: cat === tab ? `2px solid ${ACCENT}` : '2px solid transparent',
                }}>
                {tab}
              </button>
            ))}
          </div>
          <div className={s.targetScroll}>
            {ship ? (
              <TargetList ship={ship} cat={cat} selectedTarget={selectedTarget} setTarget={setSelectedTarget} />
            ) : (
              <div className={s.noData}>No game data</div>
            )}
          </div>
        </div>

        {/* Right: dispatch controls */}
        <div className={s.rightCol}>
          <div className={s.colTitle}>
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
