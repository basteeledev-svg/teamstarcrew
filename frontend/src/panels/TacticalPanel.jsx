import { useState, useMemo } from 'react'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#090918'
const MUTED  = '#1a2a3a'
const ACCENT = '#ff4444'  // red — weapons

const SIDES = ['front', 'back', 'port', 'starboard', 'above', 'below']
const SIDE_LABELS = { front: 'Front', back: 'Back', port: 'Port', starboard: 'Starboard', above: 'Above', below: 'Below' }
const SIDE_ICON   = { front: '▲', back: '▼', port: '◄', starboard: '►', above: '△', below: '▽' }
const RACE_COLORS = { Human: '#4488ff', Ssysrian: '#44ffaa', Unitarian: '#ffdd44', Fulborg: '#ff8844', Klackin: '#cc44ff' }

function healthColor(h) {
  if (h >= 80) return '#00ff88'
  if (h >= 50) return '#ffaa00'
  if (h >= 25) return '#ff8800'
  return '#ff3333'
}
function HealthBar({ value, height = 4, color }) {
  return (
    <div style={{ flex: 1, height, background: '#111', border: '1px solid #223' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, height: '100%', background: color ?? healthColor(value ?? 0) }} />
    </div>
  )
}

function Slider({ label, value, onChange, min = 0, max = 100, accent = ACCENT }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 8, color: MUTED, width: 64, flexShrink: 0, fontFamily: 'Courier New', letterSpacing: 0.5 }}>{label}</span>
      <input type="range" min={min} max={max} step={1} value={Math.round(value ?? 0)}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent, height: 12 }} />
      <span style={{ fontSize: 8, color: accent, width: 32, textAlign: 'right', fontFamily: 'Courier New' }}>
        {Math.round(value ?? 0)}%
      </span>
    </div>
  )
}

// ── Offense laser row ────────────────────────────────────────────────────────
function LaserRow({ comp, section, weight, totalWeight, onWeightChange, onUninstall }) {
  const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 100
  return (
    <div style={{ padding: '6px 8px', borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: ACCENT }}>OFF LASER #{comp.id}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: healthColor(comp.health) }}>{Math.round(comp.health)}% HP</span>
          <button onClick={() => onUninstall(section, comp.id)} style={{
            padding: '1px 5px', fontSize: 7, background: '#1a0505', border: '1px solid #440000', color: '#ff4444', cursor: 'pointer', fontFamily: 'Courier New',
          }}>✕</button>
        </div>
      </div>
      <HealthBar value={comp.health} height={3} />
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 7, color: MUTED, width: 36 }}>PWR</span>
          <input type="range" min={0} max={100} step={1} value={weight ?? 50}
            onChange={e => onWeightChange(comp.id, parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: ACCENT, height: 10 }} />
          <span style={{ fontSize: 7, color: ACCENT, width: 24, textAlign: 'right' }}>{pct}%</span>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #1a0a0a', flexShrink: 0, background: '#100404' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: ACCENT, letterSpacing: 2, fontFamily: 'Courier New' }}>
            {SIDE_ICON[section]} {SIDE_LABELS[section].toUpperCase()}
          </span>
          <div style={{ fontFamily: 'Courier New', fontSize: 9 }}>
            <span style={{ color: MUTED }}>SECTION GW </span>
            <span style={{ color: ACCENT }}>{sectionGw.toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '4px 10px', fontSize: 7, color: ACCENT, letterSpacing: 2, borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New' }}>
          OFFENSE LASERS ({lasers.length} / 5)
        </div>
        {lasers.length === 0 && (
          <div style={{ padding: '8px 12px', color: MUTED, fontSize: 9, fontFamily: 'Courier New' }}>None installed</div>
        )}
        {lasers.map(l => (
          <LaserRow key={l.id} comp={l} section={section}
            weight={compAlloc[String(l.id)] ?? 50} totalWeight={totalW}
            onWeightChange={setCompWeight} onUninstall={uninstall} />
        ))}
        {lasers.length < 5 && uninstalled > 0 && (
          <div style={{ padding: '4px 10px' }}>
            <button onClick={() => sendCommand({ type: 'install_component', section, role: 'offense_laser', station: 'weapons' })}
              style={{ padding: '4px 10px', fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1, background: '#1a0000', border: `1px solid ${ACCENT}`, color: ACCENT, cursor: 'pointer' }}>
              + INSTALL OFFENSE LASER ({uninstalled} avail)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section overview ──────────────────────────────────────────────────────────
function SectionOverviewTac({ ship, laserGw, onSelect, pendingAlloc, onAllocChange }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
      {SIDES.map(side => {
        const secData = ship?.hull_sections?.[side] ?? {}
        const lasers = secData.offense_lasers ?? []
        const allPct = pendingAlloc[side] ?? (ship?.weapons_section_alloc?.[side] ?? 16.67)
        const secGw  = laserGw * allPct / 100

        return (
          <div key={side} style={{ background: CARD, border: '1px solid #1a0a0a', marginBottom: 6, padding: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
              <button onClick={() => onSelect(side)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: ACCENT,
                fontSize: 11, fontFamily: 'Courier New', letterSpacing: 2,
              }}>
                {SIDE_ICON[side]} {SIDE_LABELS[side].toUpperCase()} →
              </button>
              <div style={{ fontFamily: 'Courier New', fontSize: 8 }}>
                <span style={{ color: MUTED }}>LASERS: <span style={{ color: ACCENT }}>{lasers.length}</span></span>
              </div>
            </div>
            <Slider label="PWR %" value={allPct} onChange={v => onAllocChange(side, v)} />
            <div style={{ fontFamily: 'Courier New', fontSize: 8 }}>
              <span style={{ color: MUTED }}>GW: <span style={{ color: ACCENT }}>{secGw.toFixed(1)}</span></span>
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
  const raceColor = RACE_COLORS[target.race] ?? '#aaaaaa'
  const canFire = missileCount > 0 && isRunning
  return (
    <div style={{
      padding: '8px 10px', borderBottom: '1px solid #0a0a18', fontFamily: 'Courier New',
      background: isLocked ? '#1a0000' : 'transparent',
      borderLeft: `3px solid ${isLocked ? ACCENT : 'transparent'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: raceColor }}>{target.name ?? target.id}</span>
        <span style={{ fontSize: 8, color: MUTED }}>{target.distance_au?.toFixed(2)} AU</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: MUTED, width: 28 }}>HULL</span>
        <HealthBar value={target.hull_health} height={3} />
        <span style={{ fontSize: 7, color: healthColor(target.hull_health), width: 28, textAlign: 'right' }}>{Math.round(target.hull_health)}%</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {isLocked ? (
          <button onClick={onUnlock} style={{
            padding: '3px 8px', fontSize: 7, fontFamily: 'Courier New', cursor: 'pointer',
            background: '#1a0505', border: `1px solid ${ACCENT}`, color: ACCENT, letterSpacing: 1,
          }}>UNLOCK</button>
        ) : (
          <button onClick={() => onLock(target.id)} style={{
            padding: '3px 8px', fontSize: 7, fontFamily: 'Courier New', cursor: 'pointer',
            background: '#0a0000', border: '1px solid #444', color: '#aaa', letterSpacing: 1,
          }}>LOCK</button>
        )}
        <button disabled={!canFire} onClick={() => onFireMissile(target.id)} style={{
          padding: '3px 8px', fontSize: 7, fontFamily: 'Courier New', letterSpacing: 1,
          cursor: canFire ? 'pointer' : 'not-allowed',
          background: canFire ? '#330000' : '#0a0a0a',
          border: `1px solid ${canFire ? '#ff8800' : '#222'}`,
          color: canFire ? '#ff8800' : '#333',
        }}>🚀 FIRE MISSILE</button>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden', fontFamily: 'Courier New' }}>
      {/* Header */}
      <div style={{ padding: '7px 14px', borderBottom: '1px solid #1a0a0a', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 11, color: ACCENT, letterSpacing: 3, fontWeight: 'bold' }}>⊕ WEAPONS</span>
        <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>
          {totalLasers} LASERS · {contacts.length} TARGET{contacts.length !== 1 ? 'S' : ''} · {missiles} MISSILES ARMED
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: weaponsGw > 0 ? ACCENT : '#334455' }}>
          {weaponsGw.toFixed(1)} GW
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left column: controls + power */}
        <div style={{ width: 170, display: 'flex', flexDirection: 'column', borderRight: '1px solid #0a0a18', flexShrink: 0, overflowY: 'auto' }}>
          {selectedSection && tab === 'SECTIONS' && (
            <button onClick={() => setSelectedSection(null)} style={{
              padding: '6px 8px', background: '#100404', border: 'none', borderBottom: '1px solid #1a0a0a',
              color: ACCENT, fontFamily: 'Courier New', fontSize: 8, cursor: 'pointer', letterSpacing: 1, textAlign: 'left',
            }}>← ALL SECTIONS</button>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #0a0a18', flexShrink: 0 }}>
            {['TARGETING', 'SECTIONS'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSelectedSection(null) }} style={{
                flex: 1, padding: '5px 2px', background: tab === t ? '#100404' : 'transparent',
                color: tab === t ? ACCENT : MUTED,
                border: 'none', borderBottom: tab === t ? `2px solid ${ACCENT}` : '2px solid transparent',
                fontFamily: 'Courier New', fontSize: 7, letterSpacing: 1, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>

          <div style={{ padding: '8px', flexShrink: 0 }}>
            {/* Targeting power slider */}
            <div style={{ fontSize: 7, color: MUTED, letterSpacing: 2, marginBottom: 4 }}>TARGETING SYSTEM</div>
            <Slider label="PWR %" value={tgtPct}
              onChange={v => sendCommand({ type: 'set_weapons_alloc', targeting_pct: v })} />
            <div style={{ fontSize: 8, marginTop: 2 }}>
              <span style={{ color: MUTED }}>T-GW </span>
              <span style={{ color: ACCENT }}>{targetingGw.toFixed(1)}</span>
              <span style={{ color: MUTED }}> · RANGE </span>
              <span style={{ color: '#ffaa00' }}>{tgtRange.toFixed(2)} AU</span>
            </div>
          </div>

          <div style={{ padding: '4px 8px 8px', flexShrink: 0, borderTop: '1px solid #0a0a18' }}>
            <div style={{ fontSize: 7, color: MUTED, letterSpacing: 2, marginBottom: 4 }}>MISSILES</div>
            <div style={{ fontSize: 11, color: missiles > 0 ? '#ff8800' : MUTED }}>{missiles}</div>
            <div style={{ fontSize: 8, color: MUTED }}>armed · {missiles_cargo} in cargo</div>
          </div>

          {/* In-flight missiles */}
          {playerMissiles.length > 0 && (
            <div style={{ padding: '4px 8px', borderTop: '1px solid #0a0a18' }}>
              <div style={{ fontSize: 7, color: '#ff8800', letterSpacing: 2, marginBottom: 4 }}>IN FLIGHT</div>
              {playerMissiles.map(m => (
                <div key={m.id} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 7, color: MUTED }}>🚀 → {m.target_npc_id}</div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <HealthBar value={(m.health / m.max_health) * 100} height={3} color="#ff8800" />
                    <span style={{ fontSize: 7, color: '#ff8800' }}>{Math.round(m.health)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: targeting contacts OR section view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'TARGETING' ? (
            <>
              <div style={{ padding: '4px 10px', fontSize: 7, color: MUTED, letterSpacing: 2, borderBottom: '1px solid #0a0a18', flexShrink: 0 }}>
                CONTACTS IN RANGE ({contacts.length})
              </div>
              {contacts.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', fontFamily: 'Courier New' }}>
                      <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>NO CONTACTS</div>
                    <div style={{ fontSize: 8, color: MUTED }}>targeting range: {tgtRange.toFixed(2)} AU</div>
                    {tgtRange < 0.1 && <div style={{ fontSize: 8, color: '#664400', marginTop: 4 }}>Allocate more power to targeting system</div>}
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
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
                <div style={{ padding: '4px 12px', background: '#1a0000', borderBottom: '1px solid #440000', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 8, color: ACCENT, fontFamily: 'Courier New' }}>Unsaved section changes</span>
                  <button onClick={applyAlloc} style={{
                    padding: '3px 10px', fontFamily: 'Courier New', fontSize: 8,
                    background: '#220000', border: `1px solid ${ACCENT}`, color: ACCENT, cursor: 'pointer',
                  }}>APPLY</button>
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
