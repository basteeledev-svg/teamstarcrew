// Crew-wide strip shown on every station under the top bar.
// It keeps the whole crew looking at the same decision: the open situation
// (with a countdown and one-tap voting), warp status, autopilot and the most
// urgent objective deadline. Full detail lives on the Mission console.

export function voterIdentity(stationName) {
  let id = null
  try {
    id = localStorage.getItem('tsc_voter_id')
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem('tsc_voter_id', id)
    }
  } catch { id = id || Math.random().toString(36).slice(2, 10) }
  return { voter_id: id, voter_label: stationName || 'Crew' }
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

export default function CrewBanner({ gameState, sendCommand, stationName }) {
  const w = gameState?.world
  if (!w) return null
  const tick = gameState.tick
  const open = (w.situations || []).filter(s => s.status === 'open')
  const sit = open[0]
  const active = (w.objectives || []).filter(o => o.status === 'active' && o.deadline_tick)
  const urgent = active.sort((a, b) => a.deadline_tick - b.deadline_tick)[0]
  const me = voterIdentity(stationName)

  if (!sit && !w.warp && !w.course && !urgent) return null

  const left = sit ? sit.deadline_tick - tick : null
  const hot = left != null && left <= 15

  return (
    <div data-testid="crew-banner" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px', minHeight: 34,
      background: sit ? (hot ? 'rgba(255,40,60,0.18)' : 'rgba(255,170,0,0.12)') : 'rgba(0,229,255,0.05)',
      borderBottom: `1px solid ${sit ? 'var(--hud-ca)' : 'rgba(0,229,255,0.15)'}`,
      fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-bright)', flexShrink: 0,
    }}>
      {sit && <>
        <span style={{ ...chip(hot ? 'var(--hud-cr)' : 'var(--hud-ca)'), fontWeight: 'bold' }}>
          ⚠ {fmtSecs(left)}
        </span>
        <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 330 }}>
          {sit.title}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          {sit.options.map(o => {
            const mine = sit.votes?.some(v => v.option === o.id && v.label === me.voter_label)
            return (
              <button key={o.id} data-testid={`vote-${o.id}`}
                title={o.blocked ? `Not yet: ${o.blocked}` : o.hint}
                onClick={() => sendCommand({ type: 'situation_vote', situation_id: sit.id, option_id: o.id, ...me })}
                style={{
                  ...chip(mine ? 'var(--hud-c)' : 'rgba(255,255,255,0.35)'),
                  background: mine ? 'rgba(0,229,255,0.15)' : 'transparent', cursor: 'pointer',
                  opacity: o.blocked ? 0.55 : 1,
                }}>
                {o.label}{o.votes ? ` · ${o.votes}` : ''}
              </button>
            )
          })}
        </span>
        {open.length > 1 && <span style={{ color: 'var(--text-dim)' }}>+{open.length - 1} more</span>}
      </>}

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
      {urgent && (
        <span style={chip(urgent.deadline_tick - tick < 120 ? 'var(--hud-cr)' : 'var(--hud-cg)')}
          title={urgent.title}>
          ◆ {fmtSecs(urgent.deadline_tick - tick)} · {urgent.planet_name ?? urgent.system_name ?? 'objective'}
        </span>
      )}
    </div>
  )
}
