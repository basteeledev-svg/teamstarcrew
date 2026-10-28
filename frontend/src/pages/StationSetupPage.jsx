import { useState, useRef } from 'react'
import { CONSOLES } from '../consoles.js'
import { apiPath } from '../api/paths.js'
import '../hud/hud.css'

const W = 1280
const H = 800

const STATION_COLORS = [
  '#00ffcc', '#00aaff', '#ff6688', '#ffee00',
  '#ff8800', '#aa88ff', '#44ffaa', '#ff4444',
]

function uniqueRandomCodes(n) {
  const used = new Set()
  return Array.from({ length: n }, () => {
    let c
    do { c = String(1000 + Math.floor(Math.random() * 9000)) } while (used.has(c))
    used.add(c)
    return c
  })
}

function makeStations(n) {
  const codes = uniqueRandomCodes(n)
  return Array.from({ length: n }, (_, i) => ({
    id: `station_${i + 1}`,
    name: `STATION ${i + 1}`,
    color: STATION_COLORS[i % STATION_COLORS.length],
    code: codes[i],
    panels: [],
  }))
}

export default function StationSetupPage({ onBack, onAdmin }) {
  const [step, setStep]         = useState('count')
  const [count, setCount]       = useState(4)
  const [stations, setStations] = useState([])
  const [codes, setCodes]       = useState([])
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  const dragPanel               = useRef(null)

  const origin   = window.location.origin
  const basePath = (import.meta.env.VITE_BASE_PATH || '').replace(/\/$/, '')

  function startConfigure() {
    setStations(makeStations(count))
    setStep('configure')
  }

  function updateStation(idx, key, val) {
    setStations(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s))
  }

  function addPanel(stationIdx, panelId) {
    setStations(prev => prev.map((s, i) => {
      if (i !== stationIdx || s.panels.includes(panelId)) return s
      return { ...s, panels: [...s.panels, panelId] }
    }))
  }

  function removePanel(stationIdx, panelId) {
    setStations(prev => prev.map((s, i) =>
      i === stationIdx ? { ...s, panels: s.panels.filter(p => p !== panelId) } : s
    ))
  }

  function onDragStart(panelId) { dragPanel.current = panelId }

  function onDrop(e, stationIdx) {
    e.preventDefault()
    if (dragPanel.current) addPanel(stationIdx, dragPanel.current)
    dragPanel.current = null
  }

  async function submit() {
    setError(null)
    const codeSet = new Set()
    for (const s of stations) {
      if (!/^\d{4}$/.test(s.code)) {
        setError(`"${s.name}" needs a valid 4-digit code.`)
        return
      }
      if (codeSet.has(s.code)) {
        setError(`Code ${s.code} is used twice — each station needs a unique code.`)
        return
      }
      codeSet.add(s.code)
    }
    setBusy(true)
    try {
      const r = await fetch(apiPath('/api/stations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stations: stations.map(s => ({
            station_id: s.id,
            name: s.name,
            icon: '◉',
            color: s.color,
            panels: s.panels,
            code: s.code,
          })),
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setCodes(data.stations)
      setStep('codes')
    } catch (e) {
      setError(String(e.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (step === 'count') {
    return <CountStep count={count} setCount={setCount} onNext={startConfigure} onBack={onBack} />
  }

  if (step === 'codes') {
    return (
      <CodesView
        codes={codes}
        origin={origin}
        basePath={basePath}
        onBack={() => setStep('configure')}
        onAdmin={onAdmin}
      />
    )
  }

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ STATION SETUP</span>
        <span className="hud-pip" />
        <span className="hud-tag">
          <span className="vc">{stations.length}</span> STATIONS — DRAG PANELS FROM LEFT
        </span>
        <span className="hud-sp" />
        <button onClick={() => setStep('count')} className="hud-exit">← BACK</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '10px 12px', gap: 10 }}>
        <div style={{
          width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column',
          border: '1px solid rgba(0,229,255,0.2)', background: 'rgba(0,229,255,0.02)',
        }}>
          <div style={{
            padding: '7px 10px', borderBottom: '1px solid rgba(0,229,255,0.15)',
            fontSize: 9, letterSpacing: 3, color: 'var(--hud-c)',
          }}>
            PANELS — DRAG TO STATION
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {CONSOLES.map(c => {
              const assignedCount = stations.filter(s => s.panels.includes(c.id)).length
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => onDragStart(c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 8px',
                    border: `1px solid ${assignedCount > 0 ? c.color + '88' : c.color + '44'}`,
                    background: assignedCount > 0 ? `${c.color}18` : `${c.color}0d`,
                    color: c.color,
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                    cursor: 'grab', userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{c.icon}</span>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  {assignedCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 'bold', letterSpacing: 0,
                      background: `${c.color}33`, color: c.color,
                      padding: '1px 5px', flexShrink: 0,
                    }}>
                      {assignedCount}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', gap: 8, alignItems: 'stretch', paddingBottom: 2 }}>
          {stations.map((st, idx) => (
            <StationColumn
              key={st.id}
              station={st}
              onNameChange={v => updateStation(idx, 'name', v.toUpperCase().slice(0, 20))}
              onCodeChange={v => updateStation(idx, 'code', v.replace(/\D/g, '').slice(0, 4))}
              onDrop={e => onDrop(e, idx)}
              onRemovePanel={pid => removePanel(idx, pid)}
            />
          ))}
        </div>
      </div>

      <div style={{
        padding: '10px 20px', borderTop: '1px solid rgba(0,229,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16,
      }}>
        {error && (
          <span style={{ color: 'var(--hud-cr)', fontSize: 12, letterSpacing: 2 }}>
            {'⚠'} {error}
          </span>
        )}
        <button
          disabled={busy}
          onClick={submit}
          className="hbtn hbtn-md grn"
          style={{ letterSpacing: 3 }}
        >
          {busy ? 'SAVING…' : `SAVE & GET CODES (${stations.length}) →`}
        </button>
      </div>
    </div>
  )
}

function CountStep({ count, setCount, onNext, onBack }) {
  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ STATION SETUP</span>
        <span className="hud-sp" />
        <button onClick={onBack} className="hud-exit">← BACK</button>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: 'var(--hud-c)' }}>
            HOW MANY STATIONS?
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <button
              onClick={() => setCount(c => Math.max(1, c - 1))}
              style={{
                width: 60, height: 60, fontSize: 30,
                background: 'transparent', border: '1px solid var(--hud-c)',
                color: 'var(--hud-c)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >-</button>
            <div style={{
              minWidth: 130, textAlign: 'center',
              fontSize: 88, fontWeight: 'bold', letterSpacing: 8,
              color: 'var(--hud-c)', fontFamily: 'var(--font-mono)',
              textShadow: '0 0 30px var(--hud-c)',
            }}>
              {count}
            </div>
            <button
              onClick={() => setCount(c => Math.min(8, c + 1))}
              style={{
                width: 60, height: 60, fontSize: 30,
                background: 'transparent', border: '1px solid var(--hud-c)',
                color: 'var(--hud-c)', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              }}
            >+</button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                onClick={() => setCount(n)}
                style={{
                  width: 44, height: 44, fontSize: 17, fontFamily: 'var(--font-mono)',
                  background: count === n ? 'rgba(0,229,255,0.18)' : 'transparent',
                  border: `1px solid ${count === n ? 'var(--hud-c)' : 'rgba(0,229,255,0.28)'}`,
                  color: count === n ? 'var(--hud-c)' : 'var(--hud-txd)',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          <button onClick={onNext} className="hbtn hbtn-md grn" style={{ letterSpacing: 4, marginTop: 8 }}>
            CONFIGURE PANELS -&gt;
          </button>
        </div>
      </div>
    </div>
  )
}

function StationColumn({ station, onNameChange, onCodeChange, onDrop, onRemovePanel }) {
  const [over, setOver] = useState(false)
  const codeValid = /^\d{4}$/.test(station.code)

  return (
    <div style={{
      width: 162, flexShrink: 0, display: 'flex', flexDirection: 'column',
      border: `1px solid ${station.color}55`,
      background: `${station.color}07`,
    }}>
      <div style={{ padding: '7px 8px', background: `${station.color}18`, borderBottom: `1px solid ${station.color}44` }}>
        <input
          value={station.name}
          onChange={e => onNameChange(e.target.value)}
          style={{
            width: '100%', background: 'transparent', border: 'none',
            color: station.color, fontFamily: 'var(--font-mono)',
            fontSize: 11, letterSpacing: 2, fontWeight: 'bold', outline: 'none',
          }}
        />
      </div>

      <div style={{
        padding: '6px 8px', borderBottom: `1px solid ${station.color}28`,
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ fontSize: 9, color: 'var(--hud-txd)', letterSpacing: 2, flexShrink: 0 }}>CODE</span>
        <input
          value={station.code}
          onChange={e => onCodeChange(e.target.value)}
          maxLength={4}
          inputMode="numeric"
          placeholder="1234"
          style={{
            width: 68, textAlign: 'center', background: 'transparent',
            border: `1px solid ${codeValid ? station.color + '88' : '#ff444488'}`,
            color: codeValid ? station.color : '#ff6666',
            fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 7,
            fontWeight: 'bold', padding: '2px 4px', outline: 'none',
          }}
        />
      </div>

      <div
        onDrop={e => { setOver(false); onDrop(e) }}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        style={{
          flex: 1, padding: '5px',
          background: over ? `${station.color}1a` : 'transparent',
          outline: over ? `1px dashed ${station.color}99` : '1px dashed transparent',
          outlineOffset: -3,
          transition: 'background 0.1s, outline-color 0.1s',
          display: 'flex', flexDirection: 'column', gap: 3, minHeight: 60,
        }}
      >
        {station.panels.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: over ? `${station.color}66` : 'rgba(0,229,255,0.15)',
            fontSize: 9, letterSpacing: 2, pointerEvents: 'none', textAlign: 'center',
          }}>
            DROP PANELS HERE
          </div>
        )}
        {station.panels.map(pid => {
          const c = CONSOLES.find(x => x.id === pid)
          if (!c) return null
          return (
            <div key={pid} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 5px',
              border: `1px solid ${c.color}44`, background: `${c.color}10`,
            }}>
              <span style={{ color: c.color, fontSize: 12, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ flex: 1, color: c.color, fontSize: 9, letterSpacing: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <button
                onClick={() => onRemovePanel(pid)}
                title="Remove"
                style={{
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,100,100,0.55)', cursor: 'pointer',
                  fontSize: 15, lineHeight: 1, padding: '0 1px', flexShrink: 0,
                }}
              >x</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CodesView({ codes, origin, basePath, onBack, onAdmin }) {
  const cols = Math.min(codes.length, 4)

  function copyUrl(code) {
    navigator.clipboard?.writeText(`${origin}${basePath}/${code.code}`)
  }

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ CREW CODES</span>
        <span className="hud-pip" />
        <span className="hud-tag">SHARE EACH CODE WITH THE CORRECT PLAYER</span>
        <span className="hud-sp" />
        <button onClick={onBack} className="hud-exit" style={{ marginRight: 8 }}>← RECONFIGURE</button>
        <button onClick={onAdmin} className="hbtn grn" style={{ height: 40, fontSize: 12, letterSpacing: 2 }}>
          ADMIN PANEL →
        </button>
      </div>

      <div className="hud-content" style={{ padding: '16px' }}>
        <div className="po" style={{ flex: 1 }}>
          <span className="corn tl" /><span className="corn tr" />
          <span className="corn bl" /><span className="corn br" />
          <div className="hud-panel">
            <div className="phdr">
              <span className="pico" style={{ color: 'var(--hud-cg)' }}>◈</span>
              <span className="ptitle">STATION CODES</span>
              <span className="pstat"><span className="vc">{codes.length}</span> STATIONS ASSIGNED</span>
            </div>
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
                {codes.map(st => (
                  <CodeCard
                    key={st.code}
                    station={st}
                    url={`${origin}${basePath}/${st.code}`}
                    onCopy={() => copyUrl(st)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CodeCard({ station, url, onCopy }) {
  return (
    <div style={{
      border: `2px solid ${station.color}`,
      background: `${station.color}0e`,
      boxShadow: `0 0 20px ${station.color}33`,
      padding: '20px 16px',
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 52, fontWeight: 'bold', letterSpacing: 10,
        color: station.color, textShadow: `0 0 24px ${station.color}`,
        fontFamily: 'var(--font-mono)', lineHeight: 1,
      }}>
        {station.code}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, color: station.color }}>{station.icon}</span>
        <span style={{ fontSize: 13, color: station.color, letterSpacing: 3, fontWeight: 'bold' }}>
          {station.name}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
        {station.panels.map(pid => {
          const c = CONSOLES.find(x => x.id === pid)
          return c ? (
            <span key={pid} style={{
              fontSize: 9, padding: '2px 7px',
              border: `1px solid ${c.color}55`, color: c.color,
              background: `${c.color}10`, letterSpacing: 1.5,
            }}>
              {c.icon} {c.name}
            </span>
          ) : null
        })}
      </div>

      <div style={{ fontSize: 10, color: 'var(--hud-txd)', letterSpacing: 1, wordBreak: 'break-all' }}>
        {url}
      </div>

      <button onClick={onCopy} className="hud-chip" style={{ width: '100%', height: 34, fontSize: 10, letterSpacing: 2 }}>
        COPY URL
      </button>
    </div>
  )
}