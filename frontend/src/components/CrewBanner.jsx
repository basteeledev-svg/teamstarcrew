// Ship-wide alarm strip shown on every station under the top bar.
// It only reports what the ship's own systems know — incoming transmissions,
// overheating machinery, warp and autopilot status. It never suggests what to do.

export function crewIdentity(stationName) {
  return stationName || 'Crew'
}

export function fmtSecs(s) {
  if (s == null) return '—'
  s = Math.max(0, Math.round(s))
  const m = Math.floor(s / 60)
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}

const chip = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
  border: `1px solid ${color}`, color, fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap',
  fontFamily: 'var(--font-mono)',
})

const ENGINE_NAMES = {
  engine_1_electric: 'ELEC ENG 1', engine_2_electric: 'ELEC ENG 2',
  engine_3_fuel: 'FUEL ENG 1', engine_4_fuel: 'FUEL ENG 2',
  reactor_1_fuel: 'GEN 1', reactor_2_fuel: 'GEN 2', reactor_3_rad: 'REACTOR 3', reactor_4_rad: 'REACTOR 4',
}

export default function CrewBanner({ gameState }) {
  const w = gameState?.world
  const ship = gameState?.ship
  if (!w || !ship) return null
  const tick = gameState.tick

  const unread = (gameState.comms?.messages ?? [])
    .filter(m => m.direction === 'inbox' && !m.read && tick - m.tick <= 90)
  const latest = unread[unread.length - 1]

  const hot = []
  for (const [k, h] of Object.entries({ ...(ship.reactor_heat ?? {}), ...(ship.engine_heat ?? {}) })) {
    if (h >= 60) hot.push([k, h])
  }
  const burned = [...Object.entries(ship.engine_shutdown ?? {}), ...Object.entries(ship.reactor_shutdown ?? {})]
    .filter(([, v]) => v).map(([k]) => k)
  const warpHealth = ship.system_health?.warp_drive ?? 100

  if (!latest && !hot.length && !burned.length && !w.warp && !w.course && warpHealth > 35) return null

  return (
    <div data-testid="crew-banner" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px', minHeight: 34,
      background: burned.length ? 'rgba(255,40,60,0.16)' : 'rgba(0,229,255,0.05)',
      borderBottom: '1px solid rgba(0,229,255,0.15)',
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-bright)', flexShrink: 0,
    }}>
      {latest && (
        <span style={{ ...chip('var(--hud-ca)'), maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          📡 INCOMING · {latest.from_name}: {latest.subject}{unread.length > 1 ? ` (+${unread.length - 1})` : ''}
        </span>
      )}
      {burned.map(k => (
        <span key={k} style={chip('var(--hud-cr)')}>✕ {ENGINE_NAMES[k] ?? k} OFFLINE — COOLING</span>
      ))}
      {hot.filter(([k]) => !burned.includes(k)).map(([k, h]) => (
        <span key={k} style={chip(h >= 85 ? 'var(--hud-cr)' : 'var(--hud-ca)')}>
          🔥 {ENGINE_NAMES[k] ?? k} {Math.round(h)}°
        </span>
      ))}
      {warpHealth <= 35 && <span style={chip('var(--hud-cr)')}>WARP DRIVE {Math.round(warpHealth)}%</span>}

      <span style={{ flex: 1 }} />

      {w.warp && (
        <span style={chip('#aa88ff')}>
          {w.warp.phase === 'spool' ? 'SPOOLING' : 'IN WARP'} → {w.warp.dest_name} · {fmtSecs(w.warp.ticks_left)}
        </span>
      )}
      {!w.warp && w.course && (
        <span style={chip('var(--hud-c)')}>
          AUTOPILOT → {w.course.name?.split(' ').slice(-2).join(' ')} · {w.course.distance_au} AU
          {w.course.eta_ticks != null ? ` · ${fmtSecs(w.course.eta_ticks)}` : ' · engines idle'}
        </span>
      )}
    </div>
  )
}
