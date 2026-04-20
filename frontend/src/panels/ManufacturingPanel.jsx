import { useState, useEffect } from 'react'
import s from './ManufacturingPanel.module.css'

// ── Style ─────────────────────────────────────────────────────────────────────
const ACCENT  = '#ffcc44'
const ACCENT2 = '#00ffcc'

// Mirror backend MANUFACTURING_RECIPES
const RECIPES = {
  fuel: {
    kind: 'rate', label: 'FUEL',
    materialsPerGw: { hydrocarbons: 1 }, outputPerGw: 1, unit: 'fuel',
  },
  transport_bot:    { kind: 'progress', label: 'TRANSPORT BOT',  totalGw: 1000, materials: { metals: 500, rare_earth: 200 } },
  mining_bot:       { kind: 'progress', label: 'MINING BOT',     totalGw: 1000, materials: { metals: 500, rare_earth: 200, radioactive: 50 } },
  repair_bot:       { kind: 'progress', label: 'REPAIR BOT',     totalGw: 800,  materials: { metals: 400, rare_earth: 150, radioactive: 30 } },
  lasers:           { kind: 'progress', label: 'LASER',          totalGw: 500,  materials: { metals: 200, rare_earth: 100 } },
  missiles:         { kind: 'progress', label: 'MISSILE',        totalGw: 400,  materials: { metals: 150, radioactive: 50 } },
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
      <div className={s.noSignal}>
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
    <div className={s.container}>

      {/* ── LEFT: Inventory + power summary ─────────────────────────────── */}
      <div className={s.sidebar}>

        <div className={s.sectionLabel}>MFG INVENTORY</div>
        {invItems.length === 0
          ? <div className={s.invEmpty}>empty</div>
          : invItems.map(([item, qty]) => (
              <div key={item} className={s.invRow}>
                <span className={s.invItem}>{item}</span>
                <span className={s.invQty}>{fmtNum(qty)}</span>
              </div>
            ))
        }

        <div className={s.sectionLabelMt}>POWER</div>
        <div className={s.powerPct}>Room alloc: {mfgPct.toFixed(1)}%</div>
        <div className={s.powerGw}>{mfgGw.toFixed(1)} GW</div>
        <div className={s.totalPct}>
          Total: <span className={Math.abs(totalPct - 100) > 1 ? s.totalPctBad : s.totalPctOk}>
            {totalPct.toFixed(0)}%
          </span>
        </div>

        <div className={s.sectionLabelMt}>LEGEND</div>
        <div className={s.legend}>
          Rate items produce<br />each tick × GW.<br />
          Progress items<br />complete then deliver<br />1 unit to inventory.<br /><br />
          🔒 Lock a slider to<br />exclude from<br />redistribution.
        </div>
      </div>

      {/* ── CENTER: Recipe sliders ───────────────────────────────────────── */}
      <div className={s.center}>
        <div className={s.sectionLabel}>PRODUCTION — POWER ALLOCATION (sum = 100%)</div>

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
            <div key={key} className={s.recipeCard} style={{
              background: active ? 'var(--bg-input)' : 'var(--bg-base)',
              border: `1px solid ${locked ? '#332200' : active ? 'var(--border)' : 'var(--border-faint)'}`,
            }}>
              <div className={s.recipeRow}>
                {/* Lock button */}
                <button
                  onClick={() => toggleLock(key)}
                  title={locked ? 'Unlock' : 'Lock'}
                  className={s.lockBtn}
                  style={{ color: locked ? ACCENT : 'var(--text-dim)' }}
                >
                  {locked ? '🔒' : '🔓'}
                </button>

                {/* Label + material cost */}
                <div className={s.labelWrap}>
                  <div className={s.labelName} style={{ color: active ? ACCENT : 'var(--text-dim)' }}>
                    {recipe.label}
                  </div>
                  <div className={s.labelMat}>{matStr}</div>
                </div>

                {/* Slider */}
                <input
                  data-testid={`mfg-slider-${key}`}
                  type="range" min={0} max={100} step={0.5}
                  value={pct}
                  disabled={locked}
                  onChange={e => handleSlider(key, parseFloat(e.target.value))}
                  className={s.slider}
                  style={{
                    accentColor: locked ? '#664400' : ACCENT,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked ? 0.5 : 1,
                  }}
                />

                {/* Pct + GW readout */}
                <div className={s.readout}>
                  <span style={{ color: active ? (locked ? '#aa7700' : ACCENT) : 'var(--text-dim)' }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span className={s.readoutDim}> {slotGw.toFixed(1)}GW</span>
                </div>
              </div>

              {/* Progress bar */}
              {active && recipe.kind === 'progress' && (
                <div className={s.progressWrap}>
                  <div className={s.progressHeader}>
                    <span>PROGRESS</span>
                    <span className={s.progressLabel}>
                      {progPct.toFixed(1)}%
                      {ticksLeft != null && ` · ~${ticksLeft}t`}
                    </span>
                  </div>
                  <div className={s.progressTrack}>
                    <div className={s.progressFill} style={{ width: `${progPct}%` }} />
                  </div>
                </div>
              )}

              {/* Rate output */}
              {active && recipe.kind === 'rate' && rateStr && (
                <div className={s.rateOutput}>
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

