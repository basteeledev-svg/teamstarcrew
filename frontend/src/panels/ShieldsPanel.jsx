import { useState, useMemo } from 'react'
import { Btn, Slider } from '../components/ui'
import { healthColor } from '../shared'
import s from './ShieldsPanel.module.css'

// ── Theme ─────────────────────────────────────────────────────────────────────
const MUTED  = 'var(--text-ghost)'
const ACCENT = '#00ccff'   // cyan

const SIDES = ['front', 'back', 'port', 'starboard', 'above', 'below']
const SIDE_LABELS = { front: 'Front', back: 'Back', port: 'Port', starboard: 'Starboard', above: 'Above', below: 'Below' }
const SIDE_ICON   = { front: '▲', back: '▼', port: '◄', starboard: '►', above: '△', below: '▽' }

function HealthBar({ value, width = '100%', height = 4 }) {
  return (
    <div className={s.barOuter} style={{ width, height }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, height: '100%', background: healthColor(value ?? 0) }} />
    </div>
  )
}
function PowerBar({ value, width = '100%', height = 4 }) {
  return (
    <div className={s.barOuter} style={{ width, height }}>
      <div className={s.powerBarFill} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  )
}

// ── Component row ─────────────────────────────────────────────────────────────
function CompRow({ comp, role, section, weight, totalWeight, onWeightChange, onUninstall }) {
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : Math.round(100 / 1)
  const roleLabel = { defense_laser: 'DEF LASER', shield_battery: 'SHIELD BAT' }[role] ?? role
  const roleColor = role === 'defense_laser' ? 'var(--accent-amber)' : ACCENT
  return (
    <div className={s.compRow}>
      <div className={s.compRowHead}>
        <span className={s.compRowRoleLabel} style={{ color: roleColor }}>{roleLabel} #{comp.id}</span>
        <div className={s.compRowStats}>
          <span className={s.compRowHp} style={{ color: healthColor(comp.health) }}>{Math.round(comp.health)}% HP</span>
          <Btn small onClick={() => onUninstall(section, role, comp.id)}
            bg="var(--tint-danger)" color="var(--status-bad)" borderColor="var(--accent-red)"
            style={{ padding: '1px 5px', fontSize: 7 }}>
            ✕
          </Btn>
        </div>
      </div>
      <HealthBar value={comp.health} height={3} />
      <div className={s.compRowPower}>
        <div className={s.compRowPowerRow}>
          <span className={s.compRowPwrLabel}>PWR</span>
          <input type="range" min={0} max={100} step={1} value={weight ?? 50}
            onChange={e => onWeightChange(comp.id, parseFloat(e.target.value))}
            className={s.compRowSlider} style={{ accentColor: roleColor }} />
          <span className={s.compRowPct} style={{ color: roleColor }}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Section detail view ────────────────────────────────────────────────────────
function SectionDetail({ section, ship, sendCommand, shipGw, threats }) {
  const secData   = ship.hull_sections?.[section] ?? {}
  const defLasers = secData.defense_lasers ?? []
  const shields   = secData.shield_batteries ?? []
  const compAlloc = ship.shields_component_alloc?.[section] ?? {}
  const sectionGw = shipGw * (ship.shields_section_alloc?.[section] ?? 0) / 100

  const uninstalled_lasers     = ship.rooms?.shields_room?.lasers ?? 0
  const uninstalled_batteries  = ship.rooms?.shields_room?.shield_batteries ?? 0

  const defInfo   = ship.section_defense?.[section]
  const reduction = ship.section_shield_reduction?.[section] ?? 0
  const hullH     = ship.outer_hull_health?.[section] ?? 100

  // Total weight for normalizing component sliders
  const totalWeight = [...defLasers, ...shields].reduce((s, c) => s + (compAlloc[String(c.id)] ?? 50), 0) || 1

  function setCompWeight(compId, w) {
    const cur = { ...compAlloc }
    cur[String(compId)] = w
    sendCommand({ type: 'set_shields_component_alloc', section, alloc: cur })
  }

  function installComp(role) {
    sendCommand({ type: 'install_component', section, role, station: 'shields' })
  }
  function uninstallComp(sec, role, id) {
    sendCommand({ type: 'uninstall_component', section: sec, role, component_id: id })
  }

  const threatHere = threats.filter(t => {
    const sides = [...(t.from_sides ?? []), t.vert_side].filter(Boolean)
    return sides.includes(section)
  })

  return (
    <div className={s.sectionDetail}>
      {/* Section header */}
      <div className={s.sectionHeader}>
        <div className={s.sectionHeaderRow}>
          <span className={s.sectionTitle}>
            {SIDE_ICON[section]} {SIDE_LABELS[section].toUpperCase()}
          </span>
          <div className={s.sectionHullWrap}>
            <div className={s.sectionHullLabel}>HULL</div>
            <div className={s.sectionHullVal} style={{ color: healthColor(hullH) }}>{Math.round(hullH)}%</div>
          </div>
        </div>
        <div className={s.sectionStats}>
          <div className={s.stat}>
            <span className={s.statLabel}>SECTION GW </span>
            <span className={s.statAccent}>{sectionGw.toFixed(1)}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>REDUCTION </span>
            <span className={s.statAccent}>{Math.round(reduction * 100)}%</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>DEF RANGE </span>
            <span className={s.statAmber}>{defInfo?.range_au?.toFixed(2) ?? '0.00'} AU</span>
          </div>
        </div>
      </div>

      {/* Active threats */}
      {threatHere.length > 0 && (
        <div className={s.threatBar}>
          {threatHere.map(t => (
            <div key={t.id} className={s.threatRow}>
              <span className={s.threatLabel}>⚠ {t.type.toUpperCase()} {t.size ? `(${t.size})` : ''}</span>
              <span className={s.threatHp}>{t.health?.toFixed(0)}/{t.max_health?.toFixed(0)} HP</span>
            </div>
          ))}
        </div>
      )}

      <div className={s.scrollArea}>
        {/* Defense lasers */}
        <div className={s.groupHeader} style={{ color: 'var(--accent-amber)' }}>
          DEFENSE LASERS ({defLasers.length} / 5)
        </div>
        {defLasers.length === 0 && (
          <div className={s.emptyMsg}>None installed</div>
        )}
        {defLasers.map(c => (
          <CompRow key={c.id} comp={c} role="defense_laser" section={section}
            weight={compAlloc[String(c.id)] ?? 50} totalWeight={totalWeight}
            onWeightChange={setCompWeight} onUninstall={uninstallComp} />
        ))}
        {defLasers.length < 5 && uninstalled_lasers > 0 && (
          <div className={s.installWrap}>
            <Btn data-testid="install-def-laser-btn" onClick={() => installComp('defense_laser')}
              color="var(--accent-amber)" bg="var(--tint-success)"
              style={{ padding: '4px 10px', fontSize: 8, letterSpacing: 1 }}>
              + INSTALL DEF LASER ({uninstalled_lasers} avail)
            </Btn>
          </div>
        )}

        {/* Shield batteries */}
        <div className={s.groupHeader} style={{ color: ACCENT }}>
          SHIELD BATTERIES ({shields.length} / 5)
        </div>
        {shields.length === 0 && (
          <div className={s.emptyMsg}>None installed</div>
        )}
        {shields.map(c => (
          <CompRow key={c.id} comp={c} role="shield_battery" section={section}
            weight={compAlloc[String(c.id)] ?? 50} totalWeight={totalWeight}
            onWeightChange={setCompWeight} onUninstall={uninstallComp} />
        ))}
        {shields.length < 5 && uninstalled_batteries > 0 && (
          <div className={s.installWrap}>
            <Btn data-testid="install-shield-bat-btn" onClick={() => installComp('shield_battery')}
              color={ACCENT} bg="var(--tint-accent)"
              style={{ padding: '4px 10px', fontSize: 8, letterSpacing: 1 }}>
              + INSTALL SHIELD BAT ({uninstalled_batteries} avail)
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section overview grid ─────────────────────────────────────────────────────
function SectionOverview({ ship, shipGw, onSelect, pendingSectionAlloc, onSectionAllocChange, onApplySectionAlloc }) {
  const hullH = ship.outer_hull_health ?? {}

  return (
    <div className={s.overviewScroll}>
      {SIDES.map(side => {
        const secData = ship.hull_sections?.[side] ?? {}
        const defLasers = secData.defense_lasers ?? []
        const shields   = secData.shield_batteries ?? []
        const allPct    = pendingSectionAlloc[side] ?? (ship.shields_section_alloc?.[side] ?? 16.67)
        const secGw     = shipGw * allPct / 100
        const defInfo   = ship.section_defense?.[side]
        const reduction = ship.section_shield_reduction?.[side] ?? 0
        const hullPct   = hullH[side] ?? 100

        return (
          <div key={side} className={s.overviewCard}>
            <div className={s.overviewCardHead}>
              <button data-testid={`sec-btn-${side}`} onClick={() => onSelect(side)} className={s.sectionBtn}>
                {SIDE_ICON[side]} {SIDE_LABELS[side].toUpperCase()} →
              </button>
              <div className={s.overviewStats}>
                <span className={s.statLabel}>DEF: <span className={s.statAmber}>{defLasers.length}</span></span>
                <span className={s.statLabel}>SHD: <span className={s.statAccent}>{shields.length}</span></span>
                <span className={s.statLabel}>HULL: <span style={{ color: healthColor(hullPct) }}>{Math.round(hullPct)}%</span></span>
              </div>
            </div>
            <HealthBar value={hullPct} height={3} />
            <div className={s.sliderWrap}>
              <Slider label="PWR %" value={allPct} accent={ACCENT}
                onChange={v => onSectionAllocChange(side, v)} />
            </div>
            <div className={s.overviewFooter}>
              <span className={s.statLabel}>GW: <span className={s.statAccent}>{secGw.toFixed(1)}</span></span>
              <span className={s.statLabel}>REDUCE: <span className={s.statAccent}>{Math.round(reduction * 100)}%</span></span>
              <span className={s.statLabel}>RANGE: <span className={s.statAmber}>{defInfo?.range_au?.toFixed(2) ?? '0.00'}</span> AU</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export default function ShieldsPanel({ gameState, sendCommand }) {
  const [selectedSection, setSelectedSection] = useState(null)
  const [pendingSectionAlloc, setPendingSectionAlloc] = useState({})

  const ship    = gameState?.ship
  const shipGw  = ship?.shields_gw ?? 0
  const threats = (gameState?.dynamic_objects ?? []).filter(o => o.from_sides)

  // Uninstalled inventory
  const uninstalledLasers     = ship?.rooms?.shields_room?.lasers ?? 0
  const uninstalledBatteries  = ship?.rooms?.shields_room?.shield_batteries ?? 0

  // Total installed count
  const totalInstalled = useMemo(() => {
    if (!ship?.hull_sections) return 0
    let n = 0
    for (const sd of Object.values(ship.hull_sections)) {
      n += (sd.defense_lasers?.length ?? 0) + (sd.shield_batteries?.length ?? 0)
    }
    return n
  }, [ship?.hull_sections])

  function handleSectionAllocChange(side, val) {
    setPendingSectionAlloc(cur => {
      const next = { ...cur, [side]: val }
      // Re-normalize all 6 sides so they sum to 100
      const base = {}
      SIDES.forEach(s => { base[s] = next[s] ?? (ship?.shields_section_alloc?.[s] ?? 16.67) })
      const total = Object.values(base).reduce((a, b) => a + b, 0) || 100
      const normalized = {}
      SIDES.forEach(s => { normalized[s] = Math.round((base[s] / total) * 1000) / 10 })
      return normalized
    })
  }

  function applyAlloc() {
    const base = {}
    SIDES.forEach(s => { base[s] = pendingSectionAlloc[s] ?? (ship?.shields_section_alloc?.[s] ?? 16.67) })
    sendCommand({ type: 'set_shields_section_alloc', alloc: base })
    setPendingSectionAlloc({})
  }

  const hasPending = Object.keys(pendingSectionAlloc).length > 0

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>⬡ SHIELDS</span>
        <span className={s.headerInfo}>
          {totalInstalled} COMPONENTS · {threats.length} THREAT{threats.length !== 1 ? 'S' : ''}
        </span>
        <span className={s.headerGw} style={{ color: shipGw > 0 ? ACCENT : 'var(--text-dim)' }}>
          {shipGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div className={s.body}>
        {/* Left: inventory + back button */}
        <div className={s.sidebar}>
          {selectedSection && (
            <button onClick={() => setSelectedSection(null)} className={s.backBtn}>← ALL SECTIONS</button>
          )}
          <div className={s.sidebarLabel}>SHIELDS ROOM</div>
          <div className={s.inventoryBlock}>
            <div className={s.inventoryTitle} style={{ color: ACCENT }}>Shield Batteries</div>
            <div className={s.inventoryCount} style={{ color: uninstalledBatteries > 0 ? 'var(--status-good)' : MUTED }}>{uninstalledBatteries}</div>
            <div className={s.inventorySubtext}>uninstalled</div>
          </div>
          <div className={s.inventoryBlock}>
            <div className={s.inventoryTitle} style={{ color: 'var(--accent-amber)' }}>Defense Lasers</div>
            <div className={s.inventoryCount} style={{ color: uninstalledLasers > 0 ? 'var(--status-good)' : MUTED }}>{uninstalledLasers}</div>
            <div className={s.inventorySubtext}>uninstalled</div>
          </div>
          {/* Active threats */}
          {threats.length > 0 && (
            <>
              <div className={s.threatsLabel}>THREATS</div>
              <div className={s.threatsList}>
                {threats.map(t => (
                  <div key={t.id} className={s.threatItem}>
                    <div className={s.threatItemLabel}>{t.type.toUpperCase()} {t.size ? `(${t.size})` : ''}</div>
                    <HealthBar value={(t.health / t.max_health) * 100} height={3} />
                    <div className={s.threatItemSides}>
                      {[...(t.from_sides ?? []), t.vert_side].filter(Boolean).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Middle / main area */}
        {selectedSection ? (
          <SectionDetail
            section={selectedSection}
            ship={ship}
            sendCommand={sendCommand}
            shipGw={shipGw}
            threats={threats}
          />
        ) : (
          <div className={s.mainArea}>
            {hasPending && (
              <div className={s.pendingBar}>
                <span className={s.pendingLabel}>Unsaved section allocation changes</span>
                <Btn onClick={applyAlloc}
                  color="var(--status-good)" bg="var(--tint-success)"
                  style={{ padding: '3px 10px', fontSize: 8 }}>APPLY</Btn>
              </div>
            )}
            <SectionOverview
              ship={ship}
              shipGw={shipGw}
              onSelect={setSelectedSection}
              pendingSectionAlloc={pendingSectionAlloc}
              onSectionAllocChange={handleSectionAllocChange}
              onApplySectionAlloc={applyAlloc}
            />
          </div>
        )}
      </div>
    </div>
  )
}
