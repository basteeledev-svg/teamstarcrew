import { useState } from 'react'
import { crewIdentity, fmtSecs } from '../components/CrewBanner.jsx'

// Captain's Log — the crew's own plan board (promises, tasks, who's doing what),
// the ship's factual event log, life-support runway and diplomatic standing.
// Nothing here is generated advice: the crew writes the plan.

const C = {
  amber: 'var(--hud-ca)', cyan: 'var(--hud-c)', red: 'var(--hud-cr)', green: 'var(--hud-cg)',
  dim: 'var(--text-dim)', text: 'var(--text-bright)',
}
const box = {
  border: '1px solid rgba(0,229,255,0.18)', background: 'rgba(0,20,30,0.45)',
  padding: '8px 10px', marginBottom: 8,
}
const head = { fontSize: 11, letterSpacing: 3, color: C.cyan, marginBottom: 6 }
const btn = (color) => ({
  border: `1px solid ${color}`, color, background: 'transparent',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '3px 8px', cursor: 'pointer',
})

function standingWord(v) {
  if (v >= 50) return ['ALLIED', C.green]
  if (v >= 15) return ['FRIENDLY', C.green]
  if (v > -15) return ['NEUTRAL', C.dim]
  if (v > -50) return ['WARY', C.amber]
  return ['HOSTILE', C.red]
}

export default function MissionPanel({ gameState, sendCommand, stationName }) {
  const [draft, setDraft] = useState('')
  const w = gameState?.world
  if (!w) return <div style={{ padding: 20, color: C.dim }}>NO SIGNAL</div>
  const me = crewIdentity(stationName)
  const lowAir = w.o2_ticks_left != null && w.o2_ticks_left < 600

  function addNote() {
    if (!draft.trim()) return
    sendCommand({ type: 'add_note', text: draft.trim(), author: me })
    setDraft('')
  }

  return (
    <div style={{ display: 'flex', gap: 12, height: '100%', overflow: 'hidden', fontFamily: 'var(--font-mono)',
                  color: C.text, padding: '4px 4px 0' }}>
      {/* Left: the crew's plan */}
      <div style={{ flex: 1.1, overflowY: 'auto', minWidth: 0 }}>
        <div style={head}>CREW PLAN</div>
        <div style={{ ...box, display: 'flex', gap: 6 }}>
          <input data-testid="note-input" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNote()}
            placeholder="e.g. Promised the Halcyon oxygen · mine radioactives at the volcanic world"
            style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,229,255,0.25)',
                     color: C.text, fontFamily: 'var(--font-mono)', fontSize: 12, padding: '5px 8px' }} />
          <button style={btn(C.cyan)} onClick={addNote}>ADD</button>
        </div>
        {w.notes.length === 0 && (
          <div style={{ ...box, color: C.dim, fontSize: 12 }}>
            Nothing written down yet. Keep track of what you've promised and who's doing what.
          </div>
        )}
        {w.notes.map(n => (
          <div key={n.id} data-testid="note" style={{ ...box, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
            <button style={btn(n.done ? C.green : C.dim)} onClick={() => sendCommand({ type: 'toggle_note', note_id: n.id })}>
              {n.done ? '✓' : '○'}
            </button>
            <span style={{ flex: 1, fontSize: 12, color: n.done ? C.dim : C.text,
                           textDecoration: n.done ? 'line-through' : 'none' }}>{n.text}</span>
            <span style={{ fontSize: 10, color: C.dim }}>{n.author}</span>
            <button style={btn(C.dim)} onClick={() => sendCommand({ type: 'delete_note', note_id: n.id })}>✕</button>
          </div>
        ))}

        <div style={{ ...head, marginTop: 10 }}>SHIP'S LOG</div>
        <div style={{ ...box, fontSize: 11, lineHeight: 1.5 }}>
          {w.log.length === 0 && <span style={{ color: C.dim }}>—</span>}
          {w.log.slice().reverse().map((l, i) => (
            <div key={i}><span style={{ color: C.dim }}>[{l.tick}]</span> {l.text}</div>
          ))}
        </div>
      </div>

      {/* Right: people, air, standing */}
      <div style={{ flex: 0.9, overflowY: 'auto', minWidth: 0 }}>
        <div style={head}>ABOARD</div>
        <div style={{ ...box, fontSize: 12, lineHeight: 1.7 }}>
          <div>PEOPLE <b>{w.people_aboard}</b>{w.passengers ? <span style={{ color: C.amber }}> ({w.passengers} passengers)</span> : ''}</div>
          <div style={{ color: lowAir ? C.red : C.text }}>AIR AT THIS RATE <b>{fmtSecs(w.o2_ticks_left)}</b></div>
          <div>FOOD AT THIS RATE <b>{fmtSecs(w.food_ticks_left)}</b></div>
        </div>

        <div style={head}>DIPLOMATIC STANDING</div>
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
            {w.gm_active ? 'Game Master online — contacts answer in character.' : 'Game Master offline — contacts send short replies.'}
          </div>
        </div>
      </div>
    </div>
  )
}
