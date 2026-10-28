import { useState, useMemo } from 'react'
import GalaxyMap from '../components/GalaxyMap.jsx'
import { Btn }   from '../components/ui'
import s from './UniversePanel.module.css'

const _WARP_COST_BASE     = 15.0
const _WARP_COST_EXPONENT = 1.5
const _WARP_COST_ADDITIVE = 20.0
const PC_TO_LY            = 3.2616

export default function UniversePanel({ gameState, sendCommand }) {
  const C = gameState?.constants ?? {}
  const WARP_COST_BASE     = C.WARP_COST_BASE     ?? _WARP_COST_BASE
  const WARP_COST_EXPONENT = C.WARP_COST_EXPONENT ?? _WARP_COST_EXPONENT
  const WARP_COST_ADDITIVE = C.WARP_COST_ADDITIVE  ?? _WARP_COST_ADDITIVE
  const PC_TO_LY_C         = C.PC_TO_LY           ?? PC_TO_LY

  const [warpTargetId, setWarpTarget] = useState(null)

  const ship = gameState?.ship

  const galaxySystems = useMemo(() => {
    const systems = gameState?.galaxy_systems ?? []
    const currentId = ship?.current_system_id
    return [...systems]
      .filter(sys => sys.id !== currentId)
      .sort((a, b) => (a.distance_ly ?? 0) - (b.distance_ly ?? 0))
  }, [gameState?.galaxy_systems, ship?.current_system_id])

  const warpTarget = useMemo(() => {
    if (!warpTargetId) return null
    const sys = gameState?.galaxy_systems?.find(g => g.id === warpTargetId)
    if (!sys) return null
    const dist    = sys.distance_ly ?? 0
    const dist_pc = dist / PC_TO_LY_C
    const cost    = WARP_COST_BASE * (dist_pc ** WARP_COST_EXPONENT) + WARP_COST_ADDITIVE
    const charge  = ship?.warp_capacitor_tw ?? 0
    const W = gameState?.world?.constants ?? {}
    const transit = Math.round((W.WARP_TRANSIT_BASE ?? 10) + (W.WARP_TRANSIT_PER_PC ?? 2) * dist_pc)
    return { ...sys, cost: Math.round(cost), charge: Math.round(charge), canWarp: charge >= cost, dist, dist_pc,
             transit, spool: W.WARP_SPOOL_TICKS ?? 8 }
  }, [warpTargetId, gameState])

  const isRunning  = gameState?.status === 'running'
  const capMax     = C.WARP_CAPACITOR_MAX_TW ?? 4_000
  const warp       = gameState?.world?.warp ?? null
  const objectiveSystems = new Set((gameState?.world?.objectives ?? [])
    .filter(o => o.status === 'active' && o.system_id).map(o => o.system_id))
  const capCharge  = ship?.warp_capacitor_tw ?? 0
  const capPct     = Math.min(100, (capCharge / capMax) * 100)

  if (!gameState) {
    return <div className={s.noSignal}>NO SIGNAL</div>
  }

  return (
    <div className={s.container}>

      {/* Left — galaxy map */}
      <div className={s.mapColumn}>
        <div className={s.mapHeader}>⊙ UNIVERSE NAVIGATION — LoD 1–2 DATA ONLY</div>
        <div className={s.mapWrap}>
          <GalaxyMap
            gameState={gameState}
            onSelectSystem={sys => setWarpTarget(prev => prev === sys.id ? null : sys.id)}
          />
        </div>
        <div className={s.mapLegend}>
          <span style={{ color: '#ffffff' }}>◎ CURRENT</span>
          <span style={{ color: '#887733' }}>● VISITED</span>
          <span style={{ color: 'var(--text-dim)' }}>· UNVISITED</span>
          <span style={{ color: 'var(--text-ghost)', marginLeft: 'auto' }}>CLICK SYSTEM TO TARGET</span>
        </div>
      </div>

      {/* Right — warp controls */}
      <div className={s.rightColumn}>

        <div className={s.sectionLabel}>WARP DRIVE</div>

        {/* Warp capacitor readout */}
        <div className={s.chargeBlock}>
          <div className={s.chargeRow}>
            <span className={s.chargeLbl}>WARP CHARGE</span>
            <span className={s.chargeVal}>{Math.round(capCharge).toLocaleString()} / {capMax.toLocaleString()} TW</span>
          </div>
          <div className={s.chargeTrack}>
            <div className={s.chargeFill} style={{ width: `${capPct}%` }} />
          </div>
        </div>

        {warp && (
          <div className={s.warpPanel} style={{ borderColor: '#aa88ff' }}>
            <div className={s.warpName} style={{ color: '#cc99ff' }}>
              {warp.phase === 'spool' ? 'SPOOLING' : 'IN WARP'} → {warp.dest_name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-body)', margin: '4px 0 8px' }}>
              {warp.phase === 'spool'
                ? `Jump in ${warp.ticks_left}s — abort now to recover half the charge.`
                : `Arriving in ${warp.ticks_left}s. Nothing can reach you in warp.`}
            </div>
            {warp.phase === 'spool' && (
              <Btn onClick={() => sendCommand({ type: 'cancel_warp' })} bg="#330011" color="var(--text-bright)"
                   borderColor="var(--border-faint)" style={{ width: '100%' }}>ABORT WARP</Btn>
            )}
          </div>
        )}

        {/* Selected system details + warp button */}
        {warpTarget && (
          <div className={s.warpPanel}>
            <div className={s.warpName} style={{ color: warpTarget.star_color ?? 'var(--text-primary)' }}>
              {warpTarget.name}
            </div>
            <div className={s.warpGrid}>
              <span className={s.warpLbl}>TYPE</span>
              <span style={{ color: 'var(--text-secondary)' }}>{warpTarget.star_type}-TYPE STAR</span>
              <span className={s.warpLbl}>DIST</span>
              <span style={{ color: 'var(--text-body)' }}>{warpTarget.dist_pc?.toFixed(2) ?? warpTarget.dist.toFixed(2)} pc</span>
              <span className={s.warpLbl}>COST</span>
              <span style={{ color: warpTarget.canWarp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {warpTarget.cost.toLocaleString()} TW
              </span>
              <span className={s.warpLbl}>CHARGE</span>
              <span style={{ color: 'var(--text-body)' }}>{warpTarget.charge.toLocaleString()} TW</span>
              <span className={s.warpLbl}>TIME</span>
              <span style={{ color: 'var(--text-body)' }}>{warpTarget.spool}s spool + {warpTarget.transit}s transit</span>
              {objectiveSystems.has(warpTarget.id) && <>
                <span className={s.warpLbl}>MISSION</span>
                <span style={{ color: 'var(--hud-ca)' }}>◆ objective destination</span>
              </>}
            </div>
            {!warpTarget.canWarp && (
              <div className={s.warpInsufficient}>✕ INSUFFICIENT WARP CHARGE</div>
            )}
            <div className={s.warpBtnRow}>
              <Btn
                onClick={() => { sendCommand({ type: 'warp', system_id: warpTargetId }); setWarpTarget(null) }}
                disabled={!isRunning || !warpTarget.canWarp || !!warp}
                bg={warpTarget.canWarp ? '#002244' : '#1a1a1a'}
                color="var(--text-bright)" borderColor="var(--border-faint)"
                style={{ flex: 1 }}
              >
                INITIATE WARP
              </Btn>
              <Btn small onClick={() => setWarpTarget(null)} bg="#0a0a20" color="var(--text-bright)" borderColor="var(--border-faint)">✕</Btn>
            </div>
          </div>
        )}

        {/* System list — shows only LoD ≥ 1 name; higher tiers from scanner */}
        <div className={s.sysList}>
          {galaxySystems.length === 0 && (
            <div className={s.noData}>NO GALAXY DATA</div>
          )}
          {galaxySystems.map(sys => {
            const isSel   = sys.id === warpTargetId
            const dist    = sys.distance_ly ?? 0
            const dist_pc = dist / PC_TO_LY
            const cost    = Math.round(_WARP_COST_BASE * (dist_pc ** _WARP_COST_EXPONENT) + _WARP_COST_ADDITIVE)
            const visible = (sys.tier ?? 0) >= 1
            return (
              <div
                key={sys.id}
                onClick={() => setWarpTarget(prev => prev === sys.id ? null : sys.id)}
                className={s.sysItem}
                style={{
                  background: isSel ? '#040f18' : 'transparent',
                  borderLeft: isSel ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  opacity: visible ? 1 : 0.35,
                }}
              >
                <div className={s.sysItemTop}>
                  <span style={{ color: visible ? (sys.visited ? (sys.star_color ?? 'var(--text-primary)') : 'var(--text-body)') : 'var(--text-ghost)' }}>
                    {visible ? sys.name : '?????'}
                  </span>
                  {sys.visited && <span className={s.visBadge}>VIS</span>}
                </div>
                {visible && (
                  <div className={s.sysItemSub}>
                    <span style={{ color: 'var(--text-dim)' }}>{sys.star_type}-type{sys.planet_count ? ` · ${sys.planet_count}pl` : ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{dist_pc.toFixed(1)} pc · {cost.toLocaleString()} TW</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
