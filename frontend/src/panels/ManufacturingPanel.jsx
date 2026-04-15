import { useState, useEffect } from 'react'

// ── Style ─────────────────────────────────────────────────────────────────────
const BG      = '#070714'
const CARD_BG = '#09091c'
const ACCENT  = '#ffcc44'
const ACCENT2 = '#00ffcc'
const FONT    = 'Courier New'

// Mirror backend MANUFACTURING_RECIPES
const RECIPES = {
  fuel: {
    kind: 'rate', label: 'FUEL',
    materialsPerGw: { hydrocarbons: 1 }, outputPerGw: 1, unit: 'fuel',
  },
  transport_bot:    { kind: 'progress', label: 'TRANSPORT BOT',  totalGw: 1000, materials: { metals: 500, rare_earth: 200 } },
  mining_bot:       { kind: 'progress', label: 'MINING BOT',     totalGw: 1000, materials: { metals: 500, rare_earth: 200, radioactive_material: 50 } },
  repair_bot:       { kind: 'progress', label: 'REPAIR BOT',     totalGw: 800,  materials: { metals: 400, rare_earth: 150, radioactive_material: 30 } },
  lasers:           { kind: 'progress', label: 'LASER',          totalGw: 500,  materials: { metals: 200, rare_earth: 100 } },
  missiles:         { kind: 'progress', label: 'MISSILE',        totalGw: 400,  materials: { metals: 150, radioactive_material: 50 } },
  shield_batteries: { kind: 'progress', label: 'SHIELD BATTERY', totalGw: 300,  materials: { metals: 100, rare_earth: 50 } },
  power_batteries:  { kind: 'progress', label: 'POWER BATTERY',  totalGw: 350,  materials: { metals: 200, rare_earth: 50 } },
  air_scrubbers:    { kind: 'progress', label: 'AIR SCRUBBER',   totalGw: 200,  materials: { metals: 50,  rare_earth: 10 } },
}
const RECIPE_KEYS = Object.keys(RECIPES)

function fmtNum(n) {
  if (n == null || n === 0) return '0'
  return n % 1 === 0 ? String(Math.floor(n)) : n.toFixed(1)
}

// ── Normalise alloc so all values sum to exactly 100 % ────────────────────
// Moving `key` by delta redistributes proportionally across unlocked others.
function normalise(alloc, locks, key, newPct) {
  const clamped = Math.max(0, Math.min(100, newPct))
  const delta   = clamped - (alloc[key] ?? 0)
  if (Math.abs(delta) < 0.001) return alloc

  const others  = RECIPE_KEYS.filter(k => !locks[k] && k !== key)
  const next    = { ...alloc, [key]: clamped }

  const otherSum = others.reduce((s, k) => s + Math.max(0, next[k] ?? 0), 0)
  if (otherSum > 0.001) {
    for (const k of others) {
      const frac = Math.max(0, next[k] ?? 0) / otherSum
      next[k] = Math.max(0, (next[k] ?? 0) - delta * frac)
    }
  } else if (others.length > 0) {
    const share = -delta / others.length
    for (const k of others) next[k] = Math.max(0, (next[k] ?? 0) + share)
  }

  // Absorb rounding error back into moved key
  const total = RECIPE_KEYS.reduce((s, k) => s + (next[k] ?? 0), 0)
  const err   = 100 - total
  if (Math.abs(err) > 0.01) next[key] = Math.max(0, (next[key] ?? 0) + err)

  for (const k of RECIPE_KEYS) next[k] = Math.round((next[k] ?? 0) * 10) / 10
  return next
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ManufacturingPanel({ gameState, sendCommand }) {
  const ship     = gameState?.ship
  const mfgRoom  = ship?.rooms?.manufacturing ?? {}
  const svrAlloc = ship?.manufacturing_alloc   ?? {}
  const progress = ship?.manufacturing_progress ?? {}

  const [alloc, setAlloc] = useState(null)
  const [locks, setLocks] = useState(() => Object.fromEntries(RECIPE_KEYS.map(k => [k, false])))

  // Sync local alloc from server on first load only
  useEffect(() => {
    if (svrAlloc && !alloc) {
      // If server alloc sums to ~0 (fresh game), init evenly
      const svrSum = RECIPE_KEYS.reduce((s, k) => s + (svrAlloc[k] ?? 0), 0)
      if (svrSum < 1) {
        const even = Math.round(100 / RECIPE_KEYS.length * 10) / 10
        const init = Object.fromEntries(RECIPE_KEYS.map(k => [k, even]))
        setAlloc(init)
      } else {
        setAlloc({ ...svrAlloc })
      }
    }
  }, [svrAlloc])

  if (!ship) {
    return (
      <div style={{ flex: 1, background: BG, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#222', fontFamily: FONT,
                    fontSize: '12px', letterSpacing: '4px' }}>
        NO SIGNAL
      </div>
    )
  }

  const curAlloc = alloc ?? svrAlloc
  const totalGw  = ship.net_power_gw ?? 0
  const mfgPct   = ship.power_allocation?.manufacturing ?? 0
  const mfgGw    = totalGw * mfgPct / 100
  const totalPct = RECIPE_KEYS.reduce((s, k) => s + (curAlloc[k] ?? 0), 0)

  function handleSlider(key, rawPct) {
    const next = normalise(curAlloc, locks, key, rawPct)
    setAlloc(next)
    // Send updates for all changed keys
    for (const k of RECIPE_KEYS) {
      if (Math.abs((next[k] ?? 0) - (curAlloc[k] ?? 0)) > 0.05) {
        sendCommand({ type: 'set_manufacturing_alloc', item: k, pct: next[k] })
      }
    }
  }

  function toggleLock(key) {
    setLocks(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Inventory items with non-zero qty
  const invItems = Object.entries(mfgRoom).filter(([, v]) => v > 0)

  return (
    <div style={{ flex: 1, display: 'flex', background: BG, fontFamily: FONT,
                  color: '#ccc', fontSize: '11px', overflow: 'hidden' }}>

      {/* ── LEFT: Inventory + power summary ─────────────────────────────── */}
      <div style={{ width: '196px', flexShrink: 0, borderRight: '1px solid #111',
                    display: 'flex', flexDirection: 'column', padding: '8px', overflowY: 'auto' }}>

        <div style={sectionLabel}>MFG INVENTORY</div>
        {invItems.length === 0
          ? <div style={{ color: '#333', fontSize: '10px' }}>empty</div>
          : invItems.map(([item, qty]) => (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between',
                                       padding: '2px 0', borderBottom: '1px solid #0d0d1a' }}>
                <span style={{ color: '#777', fontSize: '10px' }}>{item}</span>
                <span style={{ color: ACCENT2, fontSize: '10px' }}>{fmtNum(qty)}</span>
              </div>
            ))
        }

        <div style={{ ...sectionLabel, marginTop: '14px' }}>POWER</div>
        <div style={{ color: '#666', fontSize: '10px' }}>Room alloc: {mfgPct.toFixed(1)}%</div>
        <div style={{ color: ACCENT2, fontSize: '14px', fontWeight: 'bold' }}>{mfgGw.toFixed(1)} GW</div>
        <div style={{ color: '#555', fontSize: '9px', marginTop: '3px' }}>
          Total: <span style={{ color: Math.abs(totalPct - 100) > 1 ? '#ff4444' : '#888' }}>
            {totalPct.toFixed(0)}%
          </span>
        </div>

        <div style={{ ...sectionLabel, marginTop: '14px' }}>LEGEND</div>
        <div style={{ color: '#555', fontSize: '9px', lineHeight: '1.6' }}>
          Rate items produce<br />each tick × GW.<br />
          Progress items<br />complete then deliver<br />1 unit to inventory.<br /><br />
          🔒 Lock a slider to<br />exclude from<br />redistribution.
        </div>
      </div>

      {/* ── CENTER: Recipe sliders ───────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        <div style={sectionLabel}>PRODUCTION — POWER ALLOCATION (sum = 100%)</div>

        {RECIPE_KEYS.map(key => {
          const recipe   = RECIPES[key]
          const pct      = curAlloc[key] ?? 0
          const locked   = locks[key] ?? false
          const slotGw   = mfgGw * pct / 100
          const prog     = progress[key] ?? 0
          const progPct  = recipe.kind === 'progress' ? Math.min(100, (prog / recipe.totalGw) * 100) : 0
          const active   = pct > 0.05

          const rateStr = (recipe.kind === 'rate' && slotGw > 0)
            ? `→ ${fmtNum(slotGw * recipe.outputPerGw)} ${recipe.unit}/tick`
            : ''

          const matStr = recipe.kind === 'rate'
            ? Object.entries(recipe.materialsPerGw).map(([m, r]) => `${r}/GW ${m}`).join(' · ')
            : Object.entries(recipe.materials).map(([m, v]) => `${fmtNum(v)} ${m}`).join(' · ')

          const ticksLeft = (recipe.kind === 'progress' && slotGw > 0.001)
            ? Math.ceil((recipe.totalGw - prog) / slotGw)
            : null

          return (
            <div key={key} style={{
              background: active ? CARD_BG : '#050510',
              border: `1px solid ${locked ? '#332200' : active ? '#1e1e38' : '#0a0a18'}`,
              borderRadius: '4px', padding: '6px 8px', marginBottom: '4px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Lock button */}
                <button
                  onClick={() => toggleLock(key)}
                  title={locked ? 'Unlock' : 'Lock'}
                  style={{
                    flexShrink: 0, background: 'transparent', border: 'none',
                    cursor: 'pointer', fontSize: '12px', padding: '0 2px',
                    color: locked ? ACCENT : '#333', lineHeight: 1,
                  }}
                >
                  {locked ? '🔒' : '🔓'}
                </button>

                {/* Label + material cost */}
                <div style={{ width: '130px', flexShrink: 0 }}>
                  <div style={{ color: active ? ACCENT : '#444', fontSize: '11px', letterSpacing: '1px' }}>
                    {recipe.label}
                  </div>
                  <div style={{ color: '#3a3a50', fontSize: '8px', marginTop: '1px' }}>{matStr}</div>
                </div>

                {/* Slider */}
                <input
                  data-testid={`mfg-slider-${key}`}
                  type="range" min={0} max={100} step={0.5}
                  value={pct}
                  disabled={locked}
                  onChange={e => handleSlider(key, parseFloat(e.target.value))}
                  style={{
                    flex: 1, accentColor: locked ? '#664400' : ACCENT,
                    cursor: locked ? 'not-allowed' : 'pointer', height: '14px',
                    opacity: locked ? 0.5 : 1,
                  }}
                />

                {/* Pct + GW readout */}
                <div style={{ width: '76px', textAlign: 'right', flexShrink: 0, fontSize: '10px' }}>
                  <span style={{ color: active ? (locked ? '#aa7700' : ACCENT) : '#333' }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{ color: '#444' }}> {slotGw.toFixed(1)}GW</span>
                </div>
              </div>

              {/* Progress bar */}
              {active && recipe.kind === 'progress' && (
                <div style={{ marginTop: '4px', paddingLeft: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                fontSize: '8px', color: '#555', marginBottom: '1px' }}>
                    <span>PROGRESS</span>
                    <span style={{ color: '#777' }}>
                      {progPct.toFixed(1)}%
                      {ticksLeft != null && ` · ~${ticksLeft}t`}
                    </span>
                  </div>
                  <div style={{ height: '4px', background: '#111', borderRadius: '2px' }}>
                    <div style={{
                      width: `${progPct}%`, height: '100%', background: ACCENT,
                      borderRadius: '2px', transition: 'width 0.4s',
                    }} />
                  </div>
                </div>
              )}

              {/* Rate output */}
              {active && recipe.kind === 'rate' && rateStr && (
                <div style={{ fontSize: '9px', color: ACCENT2, marginTop: '3px', paddingLeft: '22px' }}>
                  {rateStr}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────────
const sectionLabel = {
  color: ACCENT, fontSize: '10px', letterSpacing: '3px', marginBottom: '5px',
  fontFamily: FONT,
}
