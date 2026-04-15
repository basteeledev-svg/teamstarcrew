import { useState, useMemo } from 'react'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#09091c'
const MUTED  = '#1a2a3a'
const ACCENT = '#00ccff'   // cyan

const SIDES = ['front', 'back', 'port', 'starboard', 'above', 'below']
const SIDE_LABELS = { front: 'Front', back: 'Back', port: 'Port', starboard: 'Starboard', above: 'Above', below: 'Below' }
const SIDE_ICON   = { front: '▲', back: '▼', port: '◄', starboard: '►', above: '△', below: '▽' }

function healthColor(h) {
  if (h >= 80) return '#00ff88'
  if (h >= 50) return '#ffaa00'
  if (h >= 25) return '#ff8800'
  return '#ff3333'
}
function HealthBar({ value, width = '100%', height = 4 }) {
  return (
    <div style={{ width, height, background: '#111', border: '1px solid #223', flexShrink: 0 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, height: '100%', background: healthColor(value ?? 0) }} />
    </div>
  )
}
function PowerBar({ value, width = '100%', height = 4 }) {
  return (
    <div style={{ width, height, background: '#111', border: '1px solid #223', flexShrink: 0 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, height: '100%', background: ACCENT, opacity: 0.7 }} />
    </div>
  )
}

// ── Compact slider ─────────────────────────────────────────────────────────────
function Slider({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 8, color: MUTED, width: 60, flexShrink: 0, fontFamily: 'Courier New', letterSpacing: 0.5 }}>{label}</span>
      <input type="range" min={min} max={max} step={1} value={Math.round(value ?? 0)}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: ACCENT, height: 12 }} />
      <span style={{ fontSize: 8, color: ACCENT, width: 32, textAlign: 'right', fontFamily: 'Courier New' }}>
        {Math.round(value ?? 0)}%
      </span>
    </div>
  )
}

// ── Component row ─────────────────────────────────────────────────────────────
function CompRow({ comp, role, section, weight, totalWeight, onWeightChange, onUninstall }) {
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : Math.round(100 / 1)
  const roleLabel = { defense_laser: 'DEF LASER', shield_battery: 'SHIELD BAT' }[role] ?? role
  const roleColor = role === 'defense_laser' ? '#ffaa00' : ACCENT
  return (
    <div style={{ padding: '6px 8px', borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: roleColor }}>{roleLabel} #{comp.id}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: healthColor(comp.health) }}>{Math.round(comp.health)}% HP</span>
          <button onClick={() => onUninstall(section, role, comp.id)}
            style={{ padding: '1px 5px', fontSize: 7, background: '#1a0505', border: '1px solid #440000', color: '#ff4444', cursor: 'pointer', fontFamily: 'Courier New' }}>
            ✕
          </button>
        </div>
      </div>
      <HealthBar value={comp.health} height={3} />
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 7, color: MUTED, width: 36 }}>PWR</span>
          <input type="range" min={0} max={100} step={1} value={weight ?? 50}
            onChange={e => onWeightChange(comp.id, parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: roleColor, height: 10 }} />
          <span style={{ fontSize: 7, color: roleColor, width: 24, textAlign: 'right' }}>{pct}%</span>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Section header */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #0a1020', flexShrink: 0, background: '#040a10' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: ACCENT, letterSpacing: 2, fontFamily: 'Courier New' }}>
            {SIDE_ICON[section]} {SIDE_LABELS[section].toUpperCase()}
          </span>
          <div style={{ textAlign: 'right', fontFamily: 'Courier New' }}>
            <div style={{ fontSize: 9, color: MUTED }}>HULL</div>
            <div style={{ fontSize: 11, color: healthColor(hullH) }}>{Math.round(hullH)}%</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <div style={{ fontFamily: 'Courier New', fontSize: 8 }}>
            <span style={{ color: MUTED }}>SECTION GW </span>
            <span style={{ color: ACCENT }}>{sectionGw.toFixed(1)}</span>
          </div>
          <div style={{ fontFamily: 'Courier New', fontSize: 8 }}>
            <span style={{ color: MUTED }}>REDUCTION </span>
            <span style={{ color: '#00ccff' }}>{Math.round(reduction * 100)}%</span>
          </div>
          <div style={{ fontFamily: 'Courier New', fontSize: 8 }}>
            <span style={{ color: MUTED }}>DEF RANGE </span>
            <span style={{ color: '#ffaa00' }}>{defInfo?.range_au?.toFixed(2) ?? '0.00'} AU</span>
          </div>
        </div>
      </div>

      {/* Active threats */}
      {threatHere.length > 0 && (
        <div style={{ padding: '4px 12px', background: '#1a0505', borderBottom: '1px solid #440000', flexShrink: 0 }}>
          {threatHere.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Courier New', fontSize: 8 }}>
              <span style={{ color: '#ff4444' }}>⚠ {t.type.toUpperCase()} {t.size ? `(${t.size})` : ''}</span>
              <span style={{ color: '#ff8800' }}>{t.health?.toFixed(0)}/{t.max_health?.toFixed(0)} HP</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Defense lasers */}
        <div style={{ padding: '4px 10px', fontSize: 7, color: '#ffaa00', letterSpacing: 2, borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New' }}>
          DEFENSE LASERS ({defLasers.length} / 5)
        </div>
        {defLasers.length === 0 && (
          <div style={{ padding: '8px 12px', color: MUTED, fontSize: 9, fontFamily: 'Courier New' }}>None installed</div>
        )}
        {defLasers.map(c => (
          <CompRow key={c.id} comp={c} role="defense_laser" section={section}
            weight={compAlloc[String(c.id)] ?? 50} totalWeight={totalWeight}
            onWeightChange={setCompWeight} onUninstall={uninstallComp} />
        ))}
        {defLasers.length < 5 && uninstalled_lasers > 0 && (
          <div style={{ padding: '4px 10px' }}>
            <button data-testid="install-def-laser-btn" onClick={() => installComp('defense_laser')} style={{
              padding: '4px 10px', fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1,
              background: '#0a1000', border: '1px solid #ffaa00', color: '#ffaa00', cursor: 'pointer',
            }}>+ INSTALL DEF LASER ({uninstalled_lasers} avail)</button>
          </div>
        )}

        {/* Shield batteries */}
        <div style={{ padding: '4px 10px', fontSize: 7, color: ACCENT, letterSpacing: 2, borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New' }}>
          SHIELD BATTERIES ({shields.length} / 5)
        </div>
        {shields.length === 0 && (
          <div style={{ padding: '8px 12px', color: MUTED, fontSize: 9, fontFamily: 'Courier New' }}>None installed</div>
        )}
        {shields.map(c => (
          <CompRow key={c.id} comp={c} role="shield_battery" section={section}
            weight={compAlloc[String(c.id)] ?? 50} totalWeight={totalWeight}
            onWeightChange={setCompWeight} onUninstall={uninstallComp} />
        ))}
        {shields.length < 5 && uninstalled_batteries > 0 && (
          <div style={{ padding: '4px 10px' }}>
            <button data-testid="install-shield-bat-btn" onClick={() => installComp('shield_battery')} style={{
              padding: '4px 10px', fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1,
              background: '#000a1a', border: `1px solid ${ACCENT}`, color: ACCENT, cursor: 'pointer',
            }}>+ INSTALL SHIELD BAT ({uninstalled_batteries} avail)</button>
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
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
          <div key={side} style={{
            background: CARD, border: '1px solid #0a1828', marginBottom: 6, padding: '8px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
              <button data-testid={`sec-btn-${side}`} onClick={() => onSelect(side)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: ACCENT, fontSize: 11, fontFamily: 'Courier New', letterSpacing: 2,
              }}>
                {SIDE_ICON[side]} {SIDE_LABELS[side].toUpperCase()} →
              </button>
              <div style={{ display: 'flex', gap: 10, fontFamily: 'Courier New', fontSize: 8 }}>
                <span style={{ color: MUTED }}>DEF: <span style={{ color: '#ffaa00' }}>{defLasers.length}</span></span>
                <span style={{ color: MUTED }}>SHD: <span style={{ color: ACCENT }}>{shields.length}</span></span>
                <span style={{ color: MUTED }}>HULL: <span style={{ color: healthColor(hullPct) }}>{Math.round(hullPct)}%</span></span>
              </div>
            </div>
            <HealthBar value={hullPct} height={3} />
            <div style={{ marginTop: 6 }}>
              <Slider label="PWR %" value={allPct}
                onChange={v => onSectionAllocChange(side, v)} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontFamily: 'Courier New', fontSize: 8 }}>
              <span style={{ color: MUTED }}>GW: <span style={{ color: ACCENT }}>{secGw.toFixed(1)}</span></span>
              <span style={{ color: MUTED }}>REDUCE: <span style={{ color: ACCENT }}>{Math.round(reduction * 100)}%</span></span>
              <span style={{ color: MUTED }}>RANGE: <span style={{ color: '#ffaa00' }}>{defInfo?.range_au?.toFixed(2) ?? '0.00'}</span> AU</span>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden', fontFamily: 'Courier New' }}>
      {/* Header */}
      <div style={{ padding: '7px 14px', borderBottom: '1px solid #001a2a', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: ACCENT, letterSpacing: 3, fontWeight: 'bold' }}>⬡ SHIELDS</span>
        <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>
          {totalInstalled} COMPONENTS · {threats.length} THREAT{threats.length !== 1 ? 'S' : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: shipGw > 0 ? ACCENT : '#334455' }}>
          {shipGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: inventory + back button */}
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0a0a18', flexShrink: 0 }}>
          {selectedSection && (
            <button onClick={() => setSelectedSection(null)} style={{
              padding: '6px 8px', background: '#040a10', border: 'none', borderBottom: '1px solid #0a1020',
              color: ACCENT, fontFamily: 'Courier New', fontSize: 8, cursor: 'pointer', letterSpacing: 1, textAlign: 'left',
            }}>← ALL SECTIONS</button>
          )}
          <div style={{ padding: '5px 8px', fontSize: 7, color: MUTED, letterSpacing: 2, borderBottom: '1px solid #0a0a18' }}>SHIELDS ROOM</div>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #0a0a18' }}>
            <div style={{ fontSize: 9, color: ACCENT, marginBottom: 4 }}>Shield Batteries</div>
            <div style={{ fontSize: 13, color: uninstalledBatteries > 0 ? '#00ff88' : MUTED }}>{uninstalledBatteries}</div>
            <div style={{ fontSize: 8, color: MUTED }}>uninstalled</div>
          </div>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #0a0a18' }}>
            <div style={{ fontSize: 9, color: '#ffaa00', marginBottom: 4 }}>Defense Lasers</div>
            <div style={{ fontSize: 13, color: uninstalledLasers > 0 ? '#00ff88' : MUTED }}>{uninstalledLasers}</div>
            <div style={{ fontSize: 8, color: MUTED }}>uninstalled</div>
          </div>
          {/* Active threats */}
          {threats.length > 0 && (
            <>
              <div style={{ padding: '4px 8px', fontSize: 7, color: '#ff4444', letterSpacing: 2, borderBottom: '1px solid #0a0a18' }}>THREATS</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {threats.map(t => (
                  <div key={t.id} style={{ padding: '5px 8px', borderBottom: '1px solid #0a0a18' }}>
                    <div style={{ fontSize: 8, color: '#ff6666' }}>{t.type.toUpperCase()} {t.size ? `(${t.size})` : ''}</div>
                    <HealthBar value={(t.health / t.max_health) * 100} height={3} />
                    <div style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>
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
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {hasPending && (
              <div style={{ padding: '4px 12px', borderBottom: '1px solid #0a1828', background: '#001a08', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: '#44ff88', fontFamily: 'Courier New' }}>Unsaved section allocation changes</span>
                <button onClick={applyAlloc} style={{
                  padding: '3px 10px', fontFamily: 'Courier New', fontSize: 8,
                  background: '#002211', border: '1px solid #44ff88', color: '#44ff88', cursor: 'pointer',
                }}>APPLY</button>
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
