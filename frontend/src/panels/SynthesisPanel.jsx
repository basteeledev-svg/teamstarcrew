import { useState, useEffect } from 'react'
import s from './SynthesisPanel.module.css'

const ACCENT = 'var(--accent-cyan)'

const RECIPES = [
  { key: 'fuel',             label: 'FUEL SYNTHESIS',       color: '#ff6600', icon: '◉',
    inputs: '1× Hydrocarbons', output: '1× Fuel',         threshold: 1  },
  { key: 'enriched_nuclear', label: 'ENRICHED NUCLEAR',    color: '#aaff44', icon: '☢',
    inputs: '1× Radioactive',  output: '1× Enriched Nuclear', threshold: 1  },
  { key: 'electronics',      label: 'ELECTRONICS',          color: '#00ffcc', icon: '◆',
    inputs: '5× Silicates + 5× Rare Earth + 3× Metals', output: '1× Electronics', threshold: 10 },
  { key: 'repair_patches',   label: 'REPAIR PATCHES',       color: '#ffaa00', icon: '✦',
    inputs: '10× Metals + 2× Rare Earth', output: '1× Repair Patch', threshold: 10 },
  { key: 'space_scrap',      label: 'SCRAP RECLAMATION',    color: '#888899', icon: '⬡',
    inputs: '2× Metals + 2× Rare Earth',  output: '10× Space Scrap', threshold: 3  },
]

export default function SynthesisPanel({ gameState, sendCommand }) {
  const ship       = gameState?.ship
  const [alloc, setAlloc] = useState(null)

  useEffect(() => {
    if (ship?.synthesis_alloc && !alloc)
      setAlloc({ ...ship.synthesis_alloc })
  }, [ship?.synthesis_alloc])

  if (!ship) return <div className={s.noSignal}>NO SIGNAL</div>

  const curAlloc    = alloc ?? ship?.synthesis_alloc ?? {}
  const progress    = ship?.synthesis_progress ?? {}
  const synthesisTW = ((curAlloc.synthesis ?? ship?.power_allocation?.synthesis ?? 0) / 100) * (ship?.net_power_tw ?? 0)
  const inv         = ship?.rooms?.sub_deck_refinery ?? {}
  const isRunning   = gameState?.status === 'running'

  function setRecipePct(key, newPct) {
    const clamped = Math.max(0, Math.min(100, newPct))
    const others  = RECIPES.map(r => r.key).filter(k => k !== key)
    const delta   = clamped - (curAlloc[key] ?? 0)
    if (Math.abs(delta) < 0.001) return

    const otherSum = others.reduce((s, k) => s + (curAlloc[k] ?? 0), 0)
    const next = { ...curAlloc, [key]: clamped }
    if (otherSum > 0.001) {
      for (const k of others) {
        const frac = (curAlloc[k] ?? 0) / otherSum
        next[k] = Math.max(0, (curAlloc[k] ?? 0) - delta * frac)
      }
    }
    // Absorb rounding error
    const total = Object.values(next).reduce((s, v) => s + v, 0)
    const err   = 100 - total
    if (Math.abs(err) > 0.01) next[key] = Math.max(0, (next[key] ?? 0) + err)
    for (const k of RECIPES.map(r => r.key)) next[k] = Math.round((next[k] ?? 0) * 10) / 10

    setAlloc(next)
    sendCommand({ type: 'set_synthesis_alloc', alloc: next })
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <span>MOLECULAR SYNTHESIS</span>
        <span className={s.headerTW}>{synthesisTW.toFixed(1)} TW</span>
      </div>

      <div className={s.recipes}>
        {RECIPES.map(r => {
          const pct      = curAlloc[r.key] ?? 0
          const recipeTW = synthesisTW * pct / 100
          const prog     = progress[r.key] ?? 0
          const progPct  = r.threshold > 0 ? Math.min(100, (prog / r.threshold) * 100) : 0

          return (
            <div key={r.key} className={s.recipeCard}>
              <div className={s.recipeHeader}>
                <span className={s.recipeIcon} style={{ color: r.color }}>{r.icon}</span>
                <span className={s.recipeLabel} style={{ color: r.color }}>{r.label}</span>
                <span className={s.recipeTW}>{recipeTW.toFixed(1)} TW</span>
              </div>
              <div className={s.recipeIO}>
                <span className={s.recipeIn}>IN: {r.inputs}</span>
                <span className={s.recipeOut} style={{ color: r.color }}>OUT: {r.output}</span>
              </div>

              {/* Priority slider */}
              <div className={s.sliderRow}>
                <input
                  type="range" min={0} max={100} step={1}
                  value={pct}
                  onChange={e => setRecipePct(r.key, parseFloat(e.target.value))}
                  disabled={!isRunning}
                  className={s.slider}
                  style={{ accentColor: r.color }}
                />
                <span className={s.sliderPct} style={{ color: r.color }}>{pct.toFixed(0)}%</span>
              </div>

              {/* Progress bar */}
              <div className={s.progressRow}>
                <div className={s.progressTrack}>
                  <div className={s.progressFill} style={{ width: `${progPct}%`, background: r.color }} />
                </div>
                <span className={s.progressLabel}>{prog.toFixed(1)} / {r.threshold} TW</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Inventory snapshot */}
      <div className={s.invCard}>
        <div className={s.invTitle}>SUB-DECK REFINERY INVENTORY</div>
        <div className={s.invGrid}>
          {[
            ['Hydrocarbons', inv.hydrocarbons ?? 0],
            ['Radioactive',  inv.radioactive ?? 0],
            ['Silicates',    inv.silicates ?? 0],
            ['Rare Earth',   inv.rare_earth ?? 0],
            ['Metals',       inv.metals ?? 0],
            ['Fuel',         inv.fuel ?? 0],
            ['Enriched Nuc', inv.enriched_nuclear ?? 0],
            ['Electronics',  inv.electronics ?? 0],
            ['Repair Patches', inv.repair_patches ?? 0],
            ['Space Scrap',  inv.space_scrap ?? 0],
          ].map(([label, qty]) => (
            <div key={label} className={s.invItem}>
              <span className={s.invLabel}>{label}</span>
              <span className={s.invQty}>{typeof qty === 'number' ? qty.toFixed(0) : qty}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
