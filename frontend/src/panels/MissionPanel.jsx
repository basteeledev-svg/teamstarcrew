import { voterIdentity, fmtSecs } from '../components/CrewBanner.jsx'

// Mission console — the captain's view of what the crew is deciding and why.
// Situations (vote + commit), objectives with deadlines and travel estimates,
// life-support runway, settlement services and faction standings.

const C = {
  amber: 'var(--hud-ca)', cyan: 'var(--hud-c)', red: 'var(--hud-cr)', green: 'var(--hud-cg)',
  dim: 'var(--text-dim)', text: 'var(--text-bright)',
}

const box = {
  border: '1px solid rgba(0,229,255,0.18)', background: 'rgba(0,20,30,0.45)',
  padding: '8px 10px', marginBottom: 8,
}
const head = { fontSize: 11, letterSpacing: 3, color: C.cyan, marginBottom: 6 }
const btn = (color, filled) => ({
  border: `1px solid ${color}`, color, background: filled ? 'rgba(0,229,255,0.12)' : 'transparent',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '4px 8px', cursor: 'pointer',
})

function standingWord(v) {
  if (v >= 50) return ['ALLIED', C.green]
  if (v >= 15) return ['FRIENDLY', C.green]
  if (v > -15) return ['NEUTRAL', C.dim]
  if (v > -50) return ['WARY', C.amber]
  return ['HOSTILE', C.red]
}

function Situation({ sit, tick, sendCommand, me }) {
  const left = sit.deadline_tick - tick
  const def = sit.options.find(o => o.id === sit.default_option)
  return (
    <div style={{ ...box, borderColor: left < 15 ? C.red : C.amber }} data-testid="situation">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ color: C.amber, fontSize: 14 }}>⚠ {sit.title}</b>
        <span style={{ color: left < 15 ? C.red : C.amber, fontWeight: 'bold' }}>{fmtSecs(left)}</span>
      </div>
      <div style={{ color: C.text, fontSize: 12, margin: '6px 0 8px', lineHeight: 1.45 }}>{sit.body}</div>
      {sit.bluff_chance != null && (
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
          Bluff odds with current weapons + shields power: <b style={{ color: C.text }}>{Math.round(sit.bluff_chance * 100)}%</b>
        </div>
      )}
      {sit.options.map(o => {
        const voters = (sit.votes || []).filter(v => v.option === o.id).map(v => v.label)
        const mine = (sit.votes || []).some(v => v.option === o.id && v.label === me.voter_label)
        return (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                                   borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: o.blocked ? C.dim : C.text, fontSize: 12 }}>{o.label}</div>
              <div style={{ color: o.blocked ? C.red : C.dim, fontSize: 10 }}>
                {o.blocked ? `Not yet: ${o.blocked}` : o.hint}
                {voters.length > 0 && <span style={{ color: C.cyan }}> · {voters.join(', ')}</span>}
              </div>
            </div>
            <button style={btn(C.cyan, mine)}
              onClick={() => sendCommand({ type: 'situation_vote', situation_id: sit.id, option_id: o.id, ...me })}>
              VOTE{o.votes ? ` ${o.votes}` : ''}
            </button>
            <button data-testid={`commit-${o.id}`} style={btn(o.blocked ? C.dim : C.amber)} disabled={!!o.blocked}
              onClick={() => sendCommand({ type: 'situation_commit', situation_id: sit.id, option_id: o.id, ...me })}>
              COMMIT
            </button>
          </div>
        )
      })}
      <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
        If time runs out: the most-voted option, otherwise “{def?.label}”.
      </div>
    </div>
  )
}

function Objective({ o, tick, capacitor }) {
  const left = o.deadline_tick ? o.deadline_tick - tick : null
  const r = o.route
  const color = o.status === 'complete' ? C.green : o.status === 'failed' ? C.red
              : left != null && left < 120 ? C.red : C.text
  return (
    <div style={{ ...box, opacity: o.status === 'active' ? 1 : 0.6 }} data-testid="objective">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ color, fontSize: 13 }}>◆ {o.title}</b>
        <span style={{ color }}>{o.status === 'active' ? (left != null ? fmtSecs(left) : 'open') : o.status.toUpperCase()}</span>
      </div>
      {o.detail && <div style={{ color: C.dim, fontSize: 11, margin: '4px 0' }}>{o.detail}</div>}
      {o.status === 'active' && (
        <div style={{ fontSize: 11, color: C.text }}>
          Destination: <b>{o.planet_name ?? '—'}</b> in {o.system_name ?? '—'}
          {r && (r.same_system
            ? <span style={{ color: C.green }}> · this system</span>
            : <span> · {r.dist_pc} pc · warp {r.warp_cost_tw.toLocaleString()} TW
                <span style={{ color: capacitor >= r.warp_cost_tw ? C.green : C.amber }}>
                  {' '}({capacitor >= r.warp_cost_tw ? 'charged' : `have ${Math.round(capacitor).toLocaleString()}`})
                </span>
                {' '}· transit {fmtSecs(r.transit_ticks)} · est. door-to-door {fmtSecs(r.eta_ticks)}
              </span>)}
        </div>
      )}
    </div>
  )
}

function Settlement({ st, sendCommand }) {
  const [word, color] = standingWord(st.standing)
  return (
    <div style={{ ...box, borderColor: C.green }} data-testid="settlement">
      <div style={head}>SETTLEMENT · {st.planet_name}</div>
      <div style={{ fontSize: 11, marginBottom: 6 }}>
        {st.faction} · standing <b style={{ color }}>{word} ({st.standing})</b>
      </div>
      {st.refuses ? <div style={{ color: C.red, fontSize: 12 }}>They refuse to deal with you.</div> : <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <button data-testid="settle-deliver" style={btn(C.green, st.deliverable.length > 0)}
            onClick={() => sendCommand({ type: 'settlement', action: 'deliver' })}>
            DELIVER / DISEMBARK{st.deliverable.length ? ` (${st.deliverable.length})` : ''}
          </button>
          <button style={btn(C.cyan)} onClick={() => sendCommand({ type: 'settlement', action: 'job' })}>
            ASK FOR WORK
          </button>
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginBottom: 3 }}>TRADING POST</div>
        {st.trades.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0' }}>
            <span style={{ flex: 1 }}>{t.give} → <b>{t.get}</b></span>
            <button style={btn(t.can_afford ? C.cyan : C.dim)} disabled={!t.can_afford}
              onClick={() => sendCommand({ type: 'settlement', action: 'trade', trade: t.id })}>TRADE</button>
          </div>
        ))}
      </>}
    </div>
  )
}

export default function MissionPanel({ gameState, sendCommand, stationName }) {
  const w = gameState?.world
  if (!w) return <div style={{ padding: 20, color: C.dim }}>NO SIGNAL</div>
  const tick = gameState.tick
  const me = voterIdentity(stationName)
  const open = w.situations.filter(s => s.status === 'open')
  const recent = w.situations.filter(s => s.status !== 'open').slice(-3).reverse()
  const capacitor = gameState.ship?.warp_capacitor_tw ?? 0
  const lowAir = w.o2_ticks_left != null && w.o2_ticks_left < 600

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', overflow: 'hidden', fontFamily: 'var(--font-mono)',
                  color: C.text, padding: '4px 4px 0' }}>
      {/* Left: decisions */}
      <div style={{ flex: 1.15, overflowY: 'auto', minWidth: 0 }}>
        <div style={head}>DECISIONS {open.length ? `(${open.length})` : ''}</div>
        {open.length === 0 && (
          <div style={{ ...box, color: C.dim, fontSize: 12 }}>
            No open decisions. Scan, explore and hail ships — something will turn up.
          </div>
        )}
        {open.map(s => <Situation key={s.id} sit={s} tick={tick} sendCommand={sendCommand} me={me} />)}
        {recent.length > 0 && <div style={{ ...head, marginTop: 10 }}>RECENT</div>}
        {recent.map(s => (
          <div key={s.id} style={{ ...box, padding: '5px 10px', fontSize: 11 }}>
            <b>{s.title}</b> — <span style={{ color: C.dim }}>{s.outcome}</span>
          </div>
        ))}
        <div style={{ ...head, marginTop: 10 }}>SHIP'S LOG</div>
        <div style={{ ...box, fontSize: 11, lineHeight: 1.5 }}>
          {w.log.slice().reverse().map((l, i) => (
            <div key={i}><span style={{ color: C.dim }}>[{l.tick}]</span> {l.text}</div>
          ))}
        </div>
      </div>

      {/* Right: objectives, runway, settlement, factions */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <div style={head}>OBJECTIVES</div>
        {w.objectives.length === 0 && <div style={{ ...box, color: C.dim, fontSize: 12 }}>None yet.</div>}
        {w.objectives.map(o => <Objective key={o.id} o={o} tick={tick} capacitor={capacitor} />)}

        <div style={{ ...box, display: 'flex', gap: 16, fontSize: 12 }}>
          <span>ABOARD <b>{w.people_aboard}</b>{w.passengers ? <span style={{ color: C.amber }}> ({w.passengers} passengers)</span> : ''}</span>
          <span style={{ color: lowAir ? C.red : C.text }}>AIR <b>{fmtSecs(w.o2_ticks_left)}</b></span>
          <span>FOOD <b>{fmtSecs(w.food_ticks_left)}</b></span>
        </div>

        {w.settlement && <Settlement st={w.settlement} sendCommand={sendCommand} />}

        <div style={head}>FACTIONS</div>
        <div style={{ ...box, fontSize: 11 }}>
          {w.factions.map(f => {
            const [word, color] = standingWord(f.standing)
            return (
              <div key={f.name} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
                <span style={{ color: f.color, width: 100 }}>{f.name}</span>
                <span style={{ color, width: 80 }}>{word}</span>
                <span style={{ color: C.dim, flex: 1 }}>{f.traits.join(', ')}</span>
              </div>
            )
          })}
          <div style={{ color: C.dim, marginTop: 4 }}>
            {w.gm_active ? 'Game Master online — ships answer in character.' : 'Game Master offline — ships send short automatic replies.'}
          </div>
        </div>
      </div>
    </div>
  )
}
