import { useState } from 'react'
import { healthColor } from '../shared'
import s from './MiningPanel.module.css'

// ── Theme ─────────────────────────────────────────────────────────────────────
const MUTED  = 'var(--text-ghost)'
const ACCENT = '#aa88ff'   // purple — mining

const _MINING_BOTS_MAX = 20

const RESOURCES = ['metals', 'rare_earth', 'radioactive', 'hydrocarbons']
const RES_CONFIG = {
  metals:       { label: 'METALS',       icon: '◼', color: '#aabbdd' },
  rare_earth:   { label: 'RARE EARTH',   icon: '◆', color: '#44ffcc' },
  radioactive:  { label: 'RADIOACTIVE',  icon: '☢', color: '#aaff44' },
  hydrocarbons: { label: 'HYDROCARBONS', icon: '◉', color: '#ff8844' },
}

function chargeColor(c) {
  if (c >= 60) return 'var(--accent)'
  if (c >= 30) return 'var(--accent-amber)'
  return 'var(--status-danger)'
}

function Bar({ value, color, height = 6 }) {
  return (
    <div className={s.barTrack} style={{ height }}>
      <div className={s.barFill} style={{
        width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
        height: '100%', background: color,
      }} />
    </div>
  )
}

// ── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className={s.card}>
      <div className={s.cardTitle}>{title}</div>
      {children}
    </div>
  )
}

// ── Resource card ─────────────────────────────────────────────────────────────
function ResourceCard({ resource, richness, botCount, planetHealth, stockpile, inOrbit, onSetBots, maxBots }) {
  const cfg  = RES_CONFIG[resource]
  const rate = (inOrbit && richness != null && botCount > 0)
    ? (botCount * richness * (planetHealth ?? 100) / 100).toFixed(1)
    : '0'

  const [local, setLocal] = useState(null)
  const display = local ?? botCount ?? 0

  function commit(val) {
    setLocal(null)
    onSetBots(resource, val)
  }

  return (
    <div className={s.resCard} style={{
      border: `1px solid ${inOrbit && (botCount ?? 0) > 0 ? cfg.color + '55' : 'var(--border-faint)'}`,
    }}>
      {/* Header row */}
      <div className={s.resHeader}>
        <span className={s.resLabel} style={{ color: cfg.color }}>
          {cfg.icon} {cfg.label}
        </span>
        <span className={s.resRate} style={{ color: parseFloat(rate) > 0 ? cfg.color : MUTED }}>
          +{rate} u/tick
        </span>
      </div>

      {/* Richness */}
      {richness != null ? (
        <div>
          <div className={s.resRow}>
            <span className={s.resSmall}>RICHNESS</span>
            <span className={s.resSmallVal} style={{ color: 'var(--text-body)' }}>{richness.toFixed(1)}%</span>
          </div>
          <Bar value={richness} color={cfg.color} height={5} />
        </div>
      ) : (
        <div className={s.resNoData}>
          Scan planet to see richness
        </div>
      )}

      {/* Bot count slider */}
      <div>
        <div className={s.resRow}>
          <span className={s.resSmall}>BOTS DEPLOYED</span>
          <span className={s.resSmallVal} style={{ color: display > 0 ? cfg.color : MUTED }}>{display}</span>
        </div>
        <input type="range" min={0} max={maxBots} step={1}
          value={display}
          disabled={!inOrbit}
          onChange={e => { if (inOrbit) setLocal(parseInt(e.target.value)) }}
          onMouseUp={e => { if (inOrbit) commit(parseInt(e.target.value)) }}
          onTouchEnd={e => { if (inOrbit) commit(parseInt(e.target.value)) }}
          className={s.resSlider}
          style={{ accentColor: cfg.color, opacity: inOrbit ? 1 : 0.35 }}
        />
      </div>

      {/* Planet stockpile */}
      <div className={s.resStockRow}>
        <span className={s.resStockLabel}>PLANET STOCKPILE</span>
        <span className={s.resStockVal} style={{ color: (stockpile ?? 0) > 0 ? cfg.color : MUTED }}>
          {Math.round(stockpile ?? 0).toLocaleString()} u
        </span>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function MiningPanel({ gameState, sendCommand }) {
  const ship   = gameState?.ship ?? {}
  const system = gameState?.current_system ?? null
  const MINING_BOTS_MAX = gameState?.constants?.MINING_BOTS_MAX ?? _MINING_BOTS_MAX

  const orbitId   = ship.orbiting_planet_id ?? null
  const inOrbit   = !!orbitId
  const botsList  = ship.mining_bots_list ?? []
  const botAssign = ship.mining_bots ?? { metals: 0, rare_earth: 0, radioactive: 0, hydrocarbons: 0 }
  const cargo     = ship.rooms?.cargo_bay ?? {}

  // Find orbited planet
  const planet = system?.planets?.find(p => p.id === orbitId) ?? null
  const totalBots     = botsList.length
  const totalDeployed = RESOURCES.reduce((s, r) => s + (botAssign[r] ?? 0), 0)
  const avgBotHealth  = totalBots > 0
    ? Math.round(botsList.reduce((s, b) => s + (b.health ?? 100), 0) / totalBots)
    : 0
  const avgBotCharge  = totalBots > 0
    ? Math.round(botsList.reduce((s, b) => s + (b.charge ?? 100), 0) / totalBots)
    : 0

  function setBots(resource, value) {
    sendCommand({ type: 'set_mining_bots', resource, value })
  }

  // Orbit status color/label
  const orbitColor  = inOrbit ? 'var(--status-good)' : 'var(--text-dim)'
  const orbitLabel  = inOrbit ? 'IN ORBIT' : 'NOT IN ORBIT'

  return (
    <div className={s.container}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.headerIcon}>◈</span>
          <span className={s.headerTitle}>MINING OPS</span>
        </div>
        <div className={s.statusBadge} style={{
          color: orbitColor, border: `1px solid ${orbitColor}`,
        }}>
          {orbitLabel}
        </div>
      </div>

      {/* ── Two-column main layout ── */}
      <div className={s.mainLayout}>

        {/* ═══ LEFT — Resource cards ═══ */}
        <div className={s.leftCol}>

          {/* Planet info */}
          {inOrbit && planet ? (
            <Section title="CURRENT PLANET">
              <div className={s.planetRow}>
                <div>
                  <div className={s.planetName}>{planet.name}</div>
                  <div className={s.planetType}>{planet.type}</div>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="CURRENT PLANET">
              <div className={s.noOrbit}>
                <div className={s.noOrbitTitle}>NOT IN ORBIT</div>
                <div className={s.noOrbitHint}>
                  Request Navigation to orbit a planet to begin mining operations
                </div>
              </div>
            </Section>
          )}

          {/* Resource cards 2×2 grid */}
          <div className={s.resourceGrid}>
            {RESOURCES.map(res => {
              const richness  = planet?.resources?.[res] ?? planet?.[res] ?? null
              const stockpile = planet?.stockpile?.[res] ?? 0
              return (
                <ResourceCard
                  key={res}
                  resource={res}
                  richness={richness}
                  botCount={botAssign[res] ?? 0}
                  planetHealth={planet?.health ?? 100}
                  stockpile={stockpile}
                  inOrbit={inOrbit}
                  onSetBots={setBots}
                  maxBots={MINING_BOTS_MAX}
                />
              )
            })}
          </div>

          {!inOrbit && (
            <div className={s.warningBox}>
              ⚠ Bot assignments require being in orbit — sliders locked
            </div>
          )}
        </div>

        {/* ═══ RIGHT — Fleet & Cargo ═══ */}
        <div className={s.rightCol}>

          {/* Mining fleet */}
          <Section title="MINING FLEET">
            <div className={s.fleetRow}>
              <span className={s.fleetLabel}>TOTAL BOTS</span>
              <span className={s.fleetCount}>{totalBots}</span>
            </div>
            <div className={s.assignedRow}>
              <span className={s.assignedLabel}>ASSIGNED</span>
              <span className={s.assignedVal} style={{ color: totalDeployed > totalBots ? 'var(--status-danger)' : totalDeployed > 0 ? ACCENT : MUTED }}>
                {totalDeployed} / {totalBots}
              </span>
            </div>

            {totalBots > 0 ? (
              <>
                <div>
                  <div className={s.avgRow}>
                    <span className={s.avgLabel}>AVG HEALTH</span>
                    <span className={s.avgVal} style={{ color: healthColor(avgBotHealth) }}>{avgBotHealth}%</span>
                  </div>
                  <Bar value={avgBotHealth} color={healthColor(avgBotHealth)} height={5} />
                </div>
                <div>
                  <div className={s.avgRow}>
                    <span className={s.avgLabel}>AVG CHARGE</span>
                    <span className={s.avgVal} style={{ color: chargeColor(avgBotCharge) }}>{avgBotCharge}%</span>
                  </div>
                  <Bar value={avgBotCharge} color={chargeColor(avgBotCharge)} height={5} />
                </div>

                {/* Individual bots (scrollable) */}
                <div className={s.botList}>
                  {botsList.map(bot => (
                    <div key={bot.id} className={s.botRow}>
                      <span className={s.botId}>#{bot.id}</span>
                      <span className={s.botState} style={{
                        color: bot.state === 'mining' ? ACCENT : 'var(--text-dim)',
                      }}>
                        {(bot.state ?? 'idle').toUpperCase()}
                      </span>
                      <div className={s.botBars}>
                        <Bar value={bot.health ?? 100} color={healthColor(bot.health ?? 100)} height={3} />
                        <Bar value={bot.charge ?? 100} color={chargeColor(bot.charge ?? 100)} height={3} />
                      </div>
                      <div className={s.botStats}>
                        <div style={{ color: healthColor(bot.health ?? 100) }}>{Math.round(bot.health ?? 100)}% HP</div>
                        <div style={{ color: chargeColor(bot.charge ?? 100) }}>{Math.round(bot.charge ?? 100)}% CH</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={s.noBots}>
                NO BOTS — manufacture mining bots in Manufacturing
              </div>
            )}
          </Section>

          {/* Cargo bay */}
          <Section title="SHIP CARGO BAY">
            {RESOURCES.map(res => {
              const cfg  = RES_CONFIG[res]
              const amt  = cargo[res] ?? 0
              return (
                <div key={res}>
                  <div className={s.cargoRow}>
                    <span className={s.cargoLabel}>{cfg.label}</span>
                    <span className={s.cargoVal} style={{ color: amt > 0 ? cfg.color : MUTED }}>
                      {amt.toLocaleString()} u
                    </span>
                  </div>
                </div>
              )
            })}
            <div className={s.cargoDivider}>
              {['fuel', 'lasers', 'missiles', 'shield_batteries', 'air_scrubbers'].map(item => {
                const amt = cargo[item]
                if (!amt) return null
                return (
                  <div key={item} className={s.cargoExtraRow}>
                    <span className={s.cargoExtraLabel}>{item.replace('_', ' ')}</span>
                    <span className={s.cargoExtraVal}>{typeof amt === 'number' ? amt.toLocaleString() : amt}</span>
                  </div>
                )
              })}
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
