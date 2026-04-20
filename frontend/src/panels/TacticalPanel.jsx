import { useState, useMemo } from 'react'
import { Btn, Slider } from '../components/ui'
import { healthColor, RACE_COLORS } from '../shared'
import s from './TacticalPanel.module.css'

// ── Theme ─────────────────────────────────────────────────────────────────────
const MUTED  = 'var(--text-ghost)'
const ACCENT = 'var(--status-bad)'

const SIDES = ['front', 'back', 'port', 'starboard', 'above', 'below']
const SIDE_LABELS = { front: 'Front', back: 'Back', port: 'Port', starboard: 'Starboard', above: 'Above', below: 'Below' }
const SIDE_ICON   = { front: '▲', back: '▼', port: '◄', starboard: '►', above: '△', below: '▽' }

function HealthBar({ value, height = 4, color }) {
  return (
    <div className={s.healthBarTrack} style={{ height }}>
      <div className={s.healthBarFill} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: color ?? healthColor(value ?? 0) }} />
    </div>
  )
}


// ── Offense laser row ────────────────────────────────────────────────────────
function LaserRow({ comp, section, weight, totalWeight, onWeightChange, onUninstall }) {
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 100
  return (
    <div className={s.laserRow}>
      <div className={s.laserRowHeader}>
        <span className={s.laserRowLabel}>OFF LASER #{comp.id}</span>
        <div className={s.laserRowActions}>
          <span className={s.laserRowHp} style={{ color: healthColor(comp.health) }}>{Math.round(comp.health)}% HP</span>
          <Btn small onClick={() => onUninstall(section, comp.id)} bg="var(--tint-danger)" color="var(--status-bad)" borderColor="var(--accent-red)" style={{ padding: '1px 5px', fontSize: 7 }}>✕</Btn>
        </div>
      </div>
      <HealthBar value={comp.health} height={3} />
      <div className={s.laserRowControls}>
        <div className={s.laserRowSliderRow}>
          <span className={s.laserRowPwrLabel}>PWR</span>
          <input type="range" min={0} max={100} step={1} value={weight ?? 50}
            onChange={e => onWeightChange(comp.id, parseFloat(e.target.value))}
            className={s.laserRowSlider} style={{ accentColor: ACCENT }} />
          <span className={s.laserRowPct}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Section detail ────────────────────────────────────────────────────────────
function SectionDetail({ section, ship, sendCommand, laserGw }) {
  const secData   = ship?.hull_sections?.[section] ?? {}
  const lasers    = secData.offense_lasers ?? []
  const compAlloc = ship?.weapons_component_alloc?.[section] ?? {}
  const totalW    = lasers.reduce((s, l) => s + (compAlloc[String(l.id)] ?? 50), 0) || 1
  const sectionGw = laserGw * (ship?.weapons_section_alloc?.[section] ?? 16.67) / 100

  const uninstalled = ship?.rooms?.weapons_room?.lasers ?? 0

  function setCompWeight(compId, w) {
    const cur = { ...compAlloc }
    cur[String(compId)] = w
    sendCommand({ type: 'set_weapons_component_alloc', section, alloc: cur })
  }
  function uninstall(sec, id) {
    sendCommand({ type: 'uninstall_component', section: sec, role: 'offense_laser', component_id: id })
  }

  return (
    <div className={s.sectionDetail}>
      <div className={s.sectionDetailHeader}>
        <div className={s.sectionDetailHeaderRow}>
          <span className={s.sectionDetailTitle}>
            {SIDE_ICON[section]} {SIDE_LABELS[section].toUpperCase()}
          </span>
          <div className={s.sectionDetailGw}>
            <span className={s.mutedText}>SECTION GW </span>
            <span className={s.accentText}>{sectionGw.toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div className={s.sectionDetailScroll}>
        <div className={s.sectionDetailSubheader}>
          OFFENSE LASERS ({lasers.length} / 5)
        </div>
        {lasers.length === 0 && (
          <div className={s.sectionDetailEmpty}>None installed</div>
        )}
        {lasers.map(l => (
          <LaserRow key={l.id} comp={l} section={section}
            weight={compAlloc[String(l.id)] ?? 50} totalWeight={totalW}
            onWeightChange={setCompWeight} onUninstall={uninstall} />
        ))}
        {lasers.length < 5 && uninstalled > 0 && (
          <div className={s.installRow}>
            <Btn onClick={() => sendCommand({ type: 'install_component', section, role: 'offense_laser', station: 'weapons' })}
              color={ACCENT} bg="var(--tint-danger)" style={{ padding: '4px 10px', fontSize: 8, letterSpacing: 1 }}>
              + INSTALL OFFENSE LASER ({uninstalled} avail)
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section overview ──────────────────────────────────────────────────────────
function SectionOverviewTac({ ship, laserGw, onSelect, pendingAlloc, onAllocChange }) {
  return (
    <div className={s.sectionOverview}>
      {SIDES.map(side => {
        const secData = ship?.hull_sections?.[side] ?? {}
        const lasers = secData.offense_lasers ?? []
        const allPct = pendingAlloc[side] ?? (ship?.weapons_section_alloc?.[side] ?? 16.67)
        const secGw  = laserGw * allPct / 100

        return (
          <div key={side} className={s.sectionCard}>
            <div className={s.sectionCardHeader}>
              <button onClick={() => onSelect(side)} className={s.sectionCardBtn}>
                {SIDE_ICON[side]} {SIDE_LABELS[side].toUpperCase()} →
              </button>
              <div className={s.sectionCardMeta}>
                <span className={s.mutedText}>LASERS: <span className={s.accentText}>{lasers.length}</span></span>
              </div>
            </div>
            <Slider label="PWR %" value={allPct} accent={ACCENT} onChange={v => onAllocChange(side, v)} />
            <div className={s.sectionCardGw}>
              <span className={s.mutedText}>GW: <span className={s.accentText}>{secGw.toFixed(1)}</span></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Target card ────────────────────────────────────────────────────────────────
function TargetCard({ target, lockedId, onLock, onUnlock, onFireMissile, missileCount, weaponsGw, isRunning }) {
  const isLocked = target.id === lockedId
  const raceColor = RACE_COLORS[target.race] ?? 'var(--text-body)'
  const canFire = missileCount > 0 && isRunning
  return (
    <div className={s.targetCard} style={{
      background: isLocked ? 'var(--tint-danger)' : 'transparent',
      borderLeft: `3px solid ${isLocked ? ACCENT : 'transparent'}`,
    }}>
      <div className={s.targetCardHeader}>
        <span className={s.targetCardName} style={{ color: raceColor }}>{target.name ?? target.id}</span>
        <span className={s.targetCardDist}>{target.distance_au?.toFixed(2)} AU</span>
      </div>
      <div className={s.targetCardHullRow}>
        <span className={s.targetCardHullLabel}>HULL</span>
        <HealthBar value={target.hull_health} height={3} />
        <span className={s.targetCardHullValue} style={{ color: healthColor(target.hull_health) }}>{Math.round(target.hull_health)}%</span>
      </div>
      <div className={s.targetCardActions}>
        {isLocked ? (
          <Btn onClick={onUnlock} color={ACCENT} bg="var(--tint-danger)" style={{ padding: '3px 8px', fontSize: 7, letterSpacing: 1 }}>UNLOCK</Btn>
        ) : (
          <Btn onClick={() => onLock(target.id)} color="var(--text-body)" bg="var(--bg-base)" style={{ padding: '3px 8px', fontSize: 7, letterSpacing: 1 }}>LOCK</Btn>
        )}
        <Btn disabled={!canFire} onClick={() => onFireMissile(target.id)}
          color={canFire ? '#ff8800' : 'var(--text-dim)'}
          bg={canFire ? '#330000' : 'var(--bg-base)'}
          borderColor={canFire ? '#ff8800' : 'var(--border)'}
          style={{ padding: '3px 8px', fontSize: 7, letterSpacing: 1, cursor: canFire ? 'pointer' : 'not-allowed' }}>🚀 FIRE MISSILE</Btn>
      </div>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function TacticalPanel({ gameState, sendCommand }) {
  const [tab, setTab] = useState('TARGETING')  // 'TARGETING' | 'SECTIONS'
  const [selectedSection, setSelectedSection] = useState(null)
  const [pendingSectionAlloc, setPendingSectionAlloc] = useState({})

  const ship       = gameState?.ship
  const weaponsGw  = ship?.weapons_gw ?? 0
  const tgtPct     = ship?.weapons_targeting_pct ?? 30
  const laserGw    = weaponsGw * Math.max(0, 100 - tgtPct) / 100
  const targetingGw= weaponsGw * tgtPct / 100
  const tgtRange   = ship?.targeting_range_au ?? 0
  const contacts   = gameState?.targeting_contacts ?? []
  const lockedId   = ship?.weapons_locked_target_id ?? null
  const missiles   = ship?.rooms?.weapons_room?.missiles ?? 0
  const missiles_cargo = ship?.rooms?.cargo_bay?.missiles ?? 0
  const playerMissiles = (gameState?.dynamic_objects ?? []).filter(o => o.type === 'player_missile')
  const isRunning  = gameState?.status === 'running'

  // Total installed offense lasers
  const totalLasers = useMemo(() => {
    if (!ship?.hull_sections) return 0
    return Object.values(ship.hull_sections).reduce((n, sd) => n + (sd.offense_lasers?.length ?? 0), 0)
  }, [ship?.hull_sections])

  const uninstalled = ship?.rooms?.weapons_room?.lasers ?? 0

  function lock(id) {
    sendCommand({ type: 'set_weapons_target', target_id: id })
  }
  function unlock() {
    sendCommand({ type: 'set_weapons_target', target_id: null })
  }
  function fireMissile(id) {
    sendCommand({ type: 'fire_missile', target_id: id })
  }

  function handleAllocChange(side, val) {
    setPendingSectionAlloc(cur => {
      const next = { ...cur, [side]: val }
      const base = {}
      SIDES.forEach(s => { base[s] = next[s] ?? (ship?.weapons_section_alloc?.[s] ?? 16.67) })
      const total = Object.values(base).reduce((a, b) => a + b, 0) || 100
      const normalized = {}
      SIDES.forEach(s => { normalized[s] = Math.round((base[s] / total) * 1000) / 10 })
      return normalized
    })
  }

  function applyAlloc() {
    const base = {}
    SIDES.forEach(s => { base[s] = pendingSectionAlloc[s] ?? (ship?.weapons_section_alloc?.[s] ?? 16.67) })
    sendCommand({ type: 'set_weapons_alloc', section_alloc: base })
    setPendingSectionAlloc({})
  }

  const hasPending = Object.keys(pendingSectionAlloc).length > 0

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>⊕ WEAPONS</span>
        <span className={s.headerSummary}>
          {totalLasers} LASERS · {contacts.length} TARGET{contacts.length !== 1 ? 'S' : ''} · {missiles} MISSILES ARMED
        </span>
        <span className={s.headerGw} style={{ color: weaponsGw > 0 ? ACCENT : 'var(--text-dim)' }}>
          {weaponsGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div className={s.body}>
        {/* Left column: controls + power */}
        <div className={s.leftCol}>
          {selectedSection && tab === 'SECTIONS' && (
            <button onClick={() => setSelectedSection(null)} className={s.backBtn}>← ALL SECTIONS</button>
          )}

          {/* Tabs */}
          <div className={s.tabBar}>
            {['TARGETING', 'SECTIONS'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSelectedSection(null) }} className={s.tabBtn} style={{
                background: tab === t ? 'var(--bg-base)' : 'transparent',
                color: tab === t ? ACCENT : MUTED,
                borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent',
              }}>{t}</button>
            ))}
          </div>

          <div className={s.controlsArea}>
            {/* Targeting power slider */}
            <div className={s.sectionLabel}>TARGETING SYSTEM</div>
            <Slider label="PWR %" value={tgtPct} accent={ACCENT}
              onChange={v => sendCommand({ type: 'set_weapons_alloc', targeting_pct: v })} />
            <div className={s.statsLine}>
              <span className={s.mutedText}>T-GW </span>
              <span className={s.accentText}>{targetingGw.toFixed(1)}</span>
              <span className={s.mutedText}> · RANGE </span>
              <span className={s.amberText}>{tgtRange.toFixed(2)} AU</span>
            </div>
          </div>

          <div className={s.missilesArea}>
            <div className={s.sectionLabel}>MISSILES</div>
            <div style={{ fontSize: 11, color: missiles > 0 ? '#ff8800' : MUTED }}>{missiles}</div>
            <div className={s.missileSubtext}>armed · {missiles_cargo} in cargo</div>
          </div>

          {playerMissiles.length > 0 && (
            <div className={s.inFlightArea}>
              <div className={s.inFlightLabel}>IN FLIGHT</div>
              {playerMissiles.map(m => (
                <div key={m.id} className={s.missileItem}>
                  <div className={s.missileTarget}>🚀 → {m.target_npc_id}</div>
                  <div className={s.missileHealthRow}>
                    <HealthBar value={(m.health / m.max_health) * 100} height={3} color="#ff8800" />
                    <span className={s.missileHealthPct}>{Math.round(m.health)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: targeting contacts OR section view */}
        <div className={s.rightCol}>
          {tab === 'TARGETING' ? (
            <>
              <div className={s.contactsHeader}>
                CONTACTS IN RANGE ({contacts.length})
              </div>
              {contacts.length === 0 ? (
                <div className={s.noContactsCenter}>
                  <div className={s.noContactsText}>
                      <div className={s.noContactsTitle}>NO CONTACTS</div>
                    <div className={s.noContactsRange}>targeting range: {tgtRange.toFixed(2)} AU</div>
                    {tgtRange < 0.1 && <div className={s.noContactsHint}>Allocate more power to targeting system</div>}
                  </div>
                </div>
              ) : (
                <div className={s.contactsList}>
                  {contacts.map(c => (
                    <TargetCard key={c.id} target={c} lockedId={lockedId}
                      onLock={lock} onUnlock={unlock} onFireMissile={fireMissile}
                      missileCount={missiles} weaponsGw={weaponsGw} isRunning={isRunning} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {hasPending && !selectedSection && (
                <div className={s.pendingBar}>
                  <span className={s.pendingText}>Unsaved section changes</span>
                  <Btn onClick={applyAlloc} color={ACCENT} bg="var(--tint-danger)" style={{ padding: '3px 10px', fontSize: 8 }}>APPLY</Btn>
                </div>
              )}
              {selectedSection ? (
                <SectionDetail
                  section={selectedSection}
                  ship={ship}
                  sendCommand={sendCommand}
                  laserGw={laserGw}
                />
              ) : (
                <SectionOverviewTac
                  ship={ship}
                  laserGw={laserGw}
                  onSelect={setSelectedSection}
                  pendingAlloc={pendingSectionAlloc}
                  onAllocChange={handleAllocChange}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
