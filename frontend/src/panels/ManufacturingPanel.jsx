import { useState, useEffect } from 'react'
import s from './ManufacturingPanel.module.css'

const ACCENT  = '#ffcc44'
const MUTED   = 'var(--text-ghost)'

// Spec §11 fabrication recipes
const FAB_RECIPES = [
  { key: 'bot',         label: 'ALL BOTS',        color: '#44ffcc', ip: 1000,
    mats: { metals: 100, rare_earth: 50, electronics: 10 }, output: '1× Bot (any type)' },
  { key: 'component',   label: 'SHIELD GEN / LASER', color: '#4488ff', ip: 1500,
    mats: { metals: 150, rare_earth: 30, electronics: 25 }, output: '1× Component' },
  { key: 'air_scrubber',label: 'AIR SCRUBBER',    color: '#44ffaa', ip: 800,
    mats: { metals: 80, silicates: 40, electronics: 15 }, output: '1× Air Scrubber' },
  { key: 'battery',     label: 'BATTERY / WARP BATTERY', color: '#aaaaff', ip: 2000,
    mats: { metals: 200, silicates: 120, rare_earth: 60 }, output: '1× Battery' },
  { key: 'missile',     label: 'MISSILE',          color: '#ff6644', ip: 400,
    mats: { metals: 40, hydrocarbons: 10, electronics: 5 }, output: '1× Missile' },
]

const MAT_LABELS = {
  metals: 'METALS', rare_earth: 'RARE EARTH', electronics: 'ELECTRONICS',
  silicates: 'SILICATES', hydrocarbons: 'HYDROCARBONS',
}

function healthColor(h) {
  if (h >= 70) return 'var(--status-good)'
  if (h >= 30) return 'var(--accent-amber)'
  return 'var(--status-danger)'
}
function chargeColor(c) {
  if (c >= 50) return 'var(--accent)'
  if (c >= 20) return 'var(--accent-amber)'
  return 'var(--status-danger)'
}
function Bar({ value, color, height = 5 }) {
  return (
    <div style={{ height, background: 'var(--bg-base)', border: '1px solid var(--border-faint)' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value ?? 0)}%`, background: color, transition: 'width 0.3s' }} />
    </div>
  )
}

export default function ManufacturingPanel({ gameState, sendCommand }) {
  const ship      = gameState?.ship
  const isRunning = gameState?.status === 'running'

  const fabBots   = ship?.fabrication_bots ?? []
  const svrAssign = ship?.fabrication_assignment ?? {}
  const ipProgress= ship?.industry_progress ?? {}
  const mfgRoom   = ship?.rooms?.sub_deck_refinery ?? {}
  const synthPct  = ship?.power_allocation?.synthesis ?? 0
  const netPowerTW= ship?.net_power_tw ?? 0
  const synthActive = synthPct > 5.0

  const totalBots  = fabBots.length
  const totalBotHP = totalBots > 0 ? Math.round(fabBots.reduce((s, b) => s + (b.health ?? 0), 0) / totalBots) : 0
  const totalBotCh = totalBots > 0 ? Math.round(fabBots.reduce((s, b) => s + (b.charge ?? 0), 0) / totalBots) : 0

  const [assign, setAssign] = useState(null)

  useEffect(() => {
    if (svrAssign && !assign) setAssign({ ...svrAssign })
  }, [svrAssign])

  const cur = assign ?? svrAssign
  const totalAssigned = Object.values(cur).reduce((s, v) => s + (v ?? 0), 0)

  function setCount(key, val) {
    const newCount = Math.max(0, Math.min(totalBots, val))
    // Clamp so total doesn't exceed totalBots
    const others = FAB_RECIPES.filter(r => r.key !== key)
    const othersSum = others.reduce((s, r) => s + (cur[r.key] ?? 0), 0)
    const clamped = Math.min(newCount, Math.max(0, totalBots - othersSum))
    const next = { ...cur, [key]: clamped }
    setAssign(next)
    sendCommand({ type: 'set_fabrication_assignment', assignment: next })
  }

  function calcIP(key) {
    const count = cur[key] ?? 0
    // Sort by health desc, take first N that aren't already assigned to earlier recipes
    const sorted = [...fabBots].sort((a, b) => (b.health ?? 0) - (a.health ?? 0))
    let offset = 0
    for (const r of FAB_RECIPES) {
      const c = cur[r.key] ?? 0
      if (r.key === key) {
        return sorted.slice(offset, offset + count).reduce((s, b) => s + 100 * (b.health ?? 100) / 100, 0)
      }
      offset += c
    }
    return 0
  }

  if (!ship) return <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:MUTED, fontFamily:'var(--font-mono)', letterSpacing:3 }}>NO SIGNAL</div>

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', padding:10, gap:8, overflowY:'auto', fontFamily:'var(--font-mono)', background:'var(--bg-label)' }}>

      {/* Header */}
      <div style={{ fontSize:10, letterSpacing:3, color:ACCENT, paddingBottom:4, borderBottom:'1px solid var(--border-faint)', display:'flex', justifyContent:'space-between' }}>
        <span>FABRICATION MANUFACTURING</span>
        <span style={{ color: synthActive ? ACCENT : 'var(--status-danger)' }}>
          {synthActive ? `${Math.round(synthPct)}% SYNTH POWER` : '⚠ POWER UNSTABLE'}
        </span>
      </div>

      {/* Fabrication bot fleet */}
      <div style={{ background:'var(--bg-raised)', border:'1px solid var(--border-faint)', padding:'8px 10px' }}>
        <div style={{ fontSize:9, letterSpacing:2, color:MUTED, marginBottom:5 }}>FABRICATION BOTS</div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:12, color:ACCENT }}>{totalBots} BOTS</span>
          <span style={{ fontSize:11, color:totalAssigned <= totalBots ? ACCENT : 'var(--status-danger)' }}>
            {totalAssigned} / {totalBots} ASSIGNED
          </span>
        </div>
        {totalBots > 0 && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:MUTED, marginBottom:2 }}>
              <span>AVG HP</span><span style={{ color:healthColor(totalBotHP) }}>{totalBotHP}%</span>
            </div>
            <Bar value={totalBotHP} color={healthColor(totalBotHP)} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:MUTED, marginTop:4, marginBottom:2 }}>
              <span>AVG CHARGE</span><span style={{ color:chargeColor(totalBotCh) }}>{totalBotCh}%</span>
            </div>
            <Bar value={totalBotCh} color={chargeColor(totalBotCh)} />
          </>
        )}
        {totalBots === 0 && (
          <div style={{ fontSize:9, color:MUTED, letterSpacing:1 }}>No fabrication bots. Manufacture one via the Bot recipe below.</div>
        )}
      </div>

      {/* Recipes */}
      {FAB_RECIPES.map(r => {
        const count   = cur[r.key] ?? 0
        const ip      = calcIP(r.key)
        const prog    = ipProgress[r.key] ?? 0
        const progPct = Math.min(100, (prog / r.ip) * 100)
        const ticksLeft = ip > 0 ? Math.ceil((r.ip - prog) / ip) : null

        return (
          <div key={r.key} style={{
            background: 'var(--bg-raised)', border: `1px solid ${count > 0 ? r.color + '66' : 'var(--border-faint)'}`,
            padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color: count > 0 ? r.color : 'var(--text-body)', letterSpacing:2, fontWeight:'bold' }}>
                {r.label}
              </span>
              <span style={{ fontSize:9, color:MUTED }}>{r.output}</span>
            </div>
            {r.key === 'battery' && (
              <div style={{ display:'flex', gap:6, fontSize:9 }}>
                {[['warp_batteries', 'WARP (+capacitor, goes to reactor room)'], ['power_batteries', 'POWER (battery bank)']].map(([k, lbl]) => {
                  const chosen = (gameState?.ship?.fabrication_choice?.battery ?? 'warp_batteries') === k
                  return (
                    <button key={k} onClick={() => sendCommand({ type: 'set_fabrication_choice', recipe: 'battery', output: k })}
                      style={{ background: chosen ? '#1a1a3a' : 'transparent', border: `1px solid ${chosen ? r.color : 'var(--border-faint)'}`,
                               color: chosen ? r.color : 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 9,
                               padding: '2px 6px', cursor: 'pointer', letterSpacing: 1 }}>
                      {lbl}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Materials */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {Object.entries(r.mats).map(([mat, qty]) => {
                const have = mfgRoom[mat] ?? 0
                const ok   = have >= qty
                return (
                  <span key={mat} style={{
                    fontSize:8, padding:'1px 6px',
                    border:`1px solid ${ok ? 'var(--border-faint)' : 'var(--accent-red)'}`,
                    color: ok ? 'var(--text-dim)' : 'var(--status-danger)', letterSpacing:1,
                  }}>
                    {MAT_LABELS[mat] ?? mat}: {typeof have === 'number' ? Math.floor(have) : have}/{qty}
                  </span>
                )
              })}
            </div>

            {/* Bot count slider */}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:9, color:MUTED, flexShrink:0 }}>BOTS</span>
              <input type="range" min={0} max={totalBots} step={1} value={count}
                onChange={e => setCount(r.key, parseInt(e.target.value))}
                disabled={!isRunning || totalBots === 0}
                style={{ flex:1, accentColor: r.color }} />
              <span style={{ fontSize:11, color: count > 0 ? r.color : MUTED, width:20, textAlign:'right' }}>{count}</span>
            </div>

            {/* IP rate + progress */}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:MUTED }}>
              <span>{ip > 0 ? `${Math.round(ip)} IP/tick` : '—'}</span>
              <span style={{ color: progPct > 0 ? r.color : MUTED }}>
                {Math.round(prog)}/{r.ip} IP{ticksLeft ? ` · ~${ticksLeft} ticks` : ''}
              </span>
            </div>
            <Bar value={progPct} color={r.color} height={4} />
          </div>
        )
      })}
    </div>
  )
}
