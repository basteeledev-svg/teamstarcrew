import { useState } from 'react'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#09091c'
const MUTED  = '#1a2a3a'
const ACCENT = '#aa88ff'   // purple — mining

const MINING_BOTS_MAX = 20

const RESOURCES = ['metals', 'rare_earth', 'radioactive', 'hydrocarbons']
const RES_CONFIG = {
  metals:       { label: 'METALS',       icon: '◼', color: '#aabbdd' },
  rare_earth:   { label: 'RARE EARTH',   icon: '◆', color: '#44ffcc' },
  radioactive:  { label: 'RADIOACTIVE',  icon: '☢', color: '#aaff44' },
  hydrocarbons: { label: 'HYDROCARBONS', icon: '◉', color: '#ff8844' },
}

function healthColor(h) {
  if (h >= 80) return '#00ff88'
  if (h >= 50) return '#ffaa00'
  if (h >= 25) return '#ff8800'
  return '#ff3333'
}
function chargeColor(c) {
  if (c >= 60) return '#2288ff'
  if (c >= 30) return '#ffaa00'
  return '#ff3333'
}

function Bar({ value, color, height = 6 }) {
  return (
    <div style={{ flex: 1, height, background: '#111', border: '1px solid #223', borderRadius: 2 }}>
      <div style={{
        width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
        height: '100%', background: color, borderRadius: 2,
      }} />
    </div>
  )
}

// ── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{
      background: CARD, border: '1px solid #101030', borderRadius: 3,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 3, color: MUTED, fontFamily: 'Courier New' }}>{title}</div>
      {children}
    </div>
  )
}

// ── Resource card ─────────────────────────────────────────────────────────────
function ResourceCard({ resource, richness, botCount, planetHealth, stockpile, inOrbit, onSetBots }) {
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
    <div style={{
      background: '#060610',
      border: `1px solid ${inOrbit && (botCount ?? 0) > 0 ? cfg.color + '55' : '#0d0d20'}`,
      borderRadius: 3, padding: '9px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: cfg.color, fontFamily: 'Courier New', letterSpacing: 1 }}>
          {cfg.icon} {cfg.label}
        </span>
        <span style={{ fontSize: 9, color: parseFloat(rate) > 0 ? cfg.color : MUTED, fontFamily: 'Courier New' }}>
          +{rate} u/tick
        </span>
      </div>

      {/* Richness */}
      {richness != null ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New' }}>RICHNESS</span>
            <span style={{ fontSize: 8, color: '#9999bb', fontFamily: 'Courier New' }}>{richness.toFixed(1)}%</span>
          </div>
          <Bar value={richness} color={cfg.color} height={5} />
        </div>
      ) : (
        <div style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New', fontStyle: 'italic' }}>
          Scan planet to see richness
        </div>
      )}

      {/* Bot count slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New' }}>BOTS DEPLOYED</span>
          <span style={{ fontSize: 8, color: display > 0 ? cfg.color : MUTED, fontFamily: 'Courier New' }}>{display}</span>
        </div>
        <input type="range" min={0} max={MINING_BOTS_MAX} step={1}
          value={display}
          disabled={!inOrbit}
          onChange={e => { if (inOrbit) setLocal(parseInt(e.target.value)) }}
          onMouseUp={e => { if (inOrbit) commit(parseInt(e.target.value)) }}
          onTouchEnd={e => { if (inOrbit) commit(parseInt(e.target.value)) }}
          style={{ width: '100%', accentColor: cfg.color, height: 10, opacity: inOrbit ? 1 : 0.35 }}
        />
      </div>

      {/* Planet stockpile */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New' }}>PLANET STOCKPILE</span>
        <span style={{ fontSize: 9, color: (stockpile ?? 0) > 0 ? cfg.color : MUTED, fontFamily: 'Courier New' }}>
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
  const orbitColor  = inOrbit ? '#00ff88' : '#334455'
  const orbitLabel  = inOrbit ? 'IN ORBIT' : 'NOT IN ORBIT'

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: BG, padding: 12, gap: 10,
      fontFamily: 'Courier New', overflowY: 'auto',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, color: ACCENT }}>◈</span>
          <span style={{ fontSize: 11, letterSpacing: 4, color: ACCENT }}>MINING OPS</span>
        </div>
        <div style={{
          fontSize: 10, letterSpacing: 2, color: orbitColor,
          padding: '2px 10px', border: `1px solid ${orbitColor}`, borderRadius: 2,
        }}>
          {orbitLabel}
        </div>
      </div>

      {/* ── Two-column main layout ── */}
      <div style={{ display: 'flex', gap: 10, flex: 1 }}>

        {/* ═══ LEFT — Resource cards ═══ */}
        <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Planet info */}
          {inOrbit && planet ? (
            <Section title="CURRENT PLANET">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: ACCENT, letterSpacing: 2 }}>{planet.name}</div>
                  <div style={{ fontSize: 9, color: '#8899aa', marginTop: 2 }}>{planet.type}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 8, color: '#8899aa' }}>PLANET HEALTH</span>
                  <span style={{ fontSize: 10, color: healthColor(planet.health ?? 100) }}>
                    {Math.round(planet.health ?? 100)}%
                  </span>
                </div>
              </div>
              {planet.health != null && (
                <Bar value={planet.health} color={healthColor(planet.health)} height={5} />
              )}
            </Section>
          ) : (
            <Section title="CURRENT PLANET">
              <div style={{ padding: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#334455', letterSpacing: 2 }}>NOT IN ORBIT</div>
                <div style={{ fontSize: 8, color: MUTED, marginTop: 6, letterSpacing: 1 }}>
                  Request Navigation to orbit a planet to begin mining operations
                </div>
              </div>
            </Section>
          )}

          {/* Resource cards 2×2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                />
              )
            })}
          </div>

          {!inOrbit && (
            <div style={{
              fontSize: 8, color: '#886622', letterSpacing: 1, textAlign: 'center',
              padding: '8px 12px', border: '1px solid #443311', borderRadius: 2, background: '#110800',
            }}>
              ⚠ Bot assignments require being in orbit — sliders locked
            </div>
          )}
        </div>

        {/* ═══ RIGHT — Fleet & Cargo ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Mining fleet */}
          <Section title="MINING FLEET">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#8899aa' }}>TOTAL BOTS</span>
              <span style={{ fontSize: 24, color: ACCENT, letterSpacing: 2 }}>{totalBots}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, color: '#8899aa' }}>ASSIGNED</span>
              <span style={{ fontSize: 9, color: totalDeployed > totalBots ? '#ff3333' : totalDeployed > 0 ? ACCENT : MUTED }}>
                {totalDeployed} / {totalBots}
              </span>
            </div>

            {totalBots > 0 ? (
              <>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: MUTED }}>AVG HEALTH</span>
                    <span style={{ fontSize: 8, color: healthColor(avgBotHealth) }}>{avgBotHealth}%</span>
                  </div>
                  <Bar value={avgBotHealth} color={healthColor(avgBotHealth)} height={5} />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: MUTED }}>AVG CHARGE</span>
                    <span style={{ fontSize: 8, color: chargeColor(avgBotCharge) }}>{avgBotCharge}%</span>
                  </div>
                  <Bar value={avgBotCharge} color={chargeColor(avgBotCharge)} height={5} />
                </div>

                {/* Individual bots (scrollable) */}
                <div style={{
                  maxHeight: 140, overflowY: 'auto',
                  border: '1px solid #0d0d20', borderRadius: 2,
                }}>
                  {botsList.map(bot => (
                    <div key={bot.id} style={{
                      padding: '5px 8px',
                      borderBottom: '1px solid #0a0a18',
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 8, color: '#7788aa', fontFamily: 'Courier New',
                    }}>
                      <span style={{ width: 32, flexShrink: 0 }}>#{bot.id}</span>
                      <span style={{
                        width: 48, flexShrink: 0,
                        color: bot.state === 'mining' ? ACCENT : '#334455',
                      }}>
                        {(bot.state ?? 'idle').toUpperCase()}
                      </span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Bar value={bot.health ?? 100} color={healthColor(bot.health ?? 100)} height={3} />
                        <Bar value={bot.charge ?? 100} color={chargeColor(bot.charge ?? 100)} height={3} />
                      </div>
                      <div style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: 7, lineHeight: '1.6' }}>
                        <div style={{ color: healthColor(bot.health ?? 100) }}>{Math.round(bot.health ?? 100)}% HP</div>
                        <div style={{ color: chargeColor(bot.charge ?? 100) }}>{Math.round(bot.charge ?? 100)}% CH</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 8, color: MUTED, textAlign: 'center', padding: '8px 0', letterSpacing: 1 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 8, color: '#8899aa' }}>{cfg.label}</span>
                    <span style={{ fontSize: 8, color: amt > 0 ? cfg.color : MUTED }}>
                      {amt.toLocaleString()} u
                    </span>
                  </div>
                </div>
              )
            })}
            <div style={{ borderTop: '1px solid #0d0d20', paddingTop: 6 }}>
              {['fuel', 'lasers', 'missiles', 'shield_batteries', 'air_scrubbers'].map(item => {
                const amt = cargo[item]
                if (!amt) return null
                return (
                  <div key={item} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>{item.replace('_', ' ')}</span>
                    <span style={{ fontSize: 7, color: '#7788aa' }}>{typeof amt === 'number' ? amt.toLocaleString() : amt}</span>
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
