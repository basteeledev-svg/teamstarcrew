import { useState } from 'react'
import { CONSOLES } from '../consoles.js'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
const W = 1280
const H = 800

const MAX_SELECTION = 4

export default function ConsoleSelectPage({ onEnter }) {
  const [selected, setSelected] = useState([])

  function toggle(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, id]
    })
  }

  return (
    <div style={{
      width: W, height: H, background: '#050510',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Courier New', color: '#8899cc', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 32px 12px',
        borderBottom: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'baseline', gap: '24px',
      }}>
        <span style={{ fontSize: '20px', letterSpacing: '4px', color: '#aabbdd' }}>
          ★ TEAM STAR CREW
        </span>
        <span style={{ fontSize: '12px', color: '#334455', letterSpacing: '2px' }}>
          STATION SELECTION
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: selected.length === MAX_SELECTION ? '#ffcc44' : '#445566' }}>
          {selected.length} / {MAX_SELECTION} STATIONS SELECTED
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 32px 16px' }}>
        <p style={{ fontSize: '11px', color: '#334455', marginBottom: '20px', letterSpacing: '1px' }}>
          SELECT 1–{MAX_SELECTION} STATIONS FOR THIS TABLET. TAP TO TOGGLE.
        </p>

        {/* Console grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          flex: 1,
        }}>
          {CONSOLES.map(c => {
            const isSelected = selected.includes(c.id)
            const isDisabled = !isSelected && selected.length >= MAX_SELECTION
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                disabled={isDisabled}
                style={{
                  background: isSelected ? `${c.color}18` : '#08081a',
                  border: `1px solid ${isSelected ? c.color : '#1a1a2e'}`,
                  borderRadius: '4px',
                  padding: '16px 12px',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px',
                  opacity: isDisabled ? 0.35 : 1,
                  transition: 'border-color 0.15s, background 0.15s',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <span style={{ fontSize: '22px', color: isSelected ? c.color : '#334455' }}>
                    {c.icon}
                  </span>
                  {isSelected && (
                    <span style={{
                      marginLeft: 'auto',
                      background: c.color,
                      color: '#050510',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      padding: '2px 5px',
                      borderRadius: '2px',
                      letterSpacing: '1px',
                    }}>
                      #{selected.indexOf(c.id) + 1}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: isSelected ? c.color : '#556677', letterSpacing: '1.5px' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: '9px', color: '#334455', lineHeight: 1.4 }}>
                  {c.desc}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #1a1a2e',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {selected.map(id => {
              const c = CONSOLES.find(x => x.id === id)
              return (
                <span key={id} style={{
                  fontSize: '10px', padding: '3px 10px',
                  border: `1px solid ${c.color}`,
                  color: c.color, borderRadius: '2px', letterSpacing: '1px',
                }}>
                  {c.icon} {c.name}
                </span>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => onEnter({ role: 'observer' })}
              style={ghostBtn}
            >
              OBSERVER
            </button>
            <button
              onClick={() => onEnter({ role: 'admin' })}
              style={ghostBtn}
            >
              ADMIN
            </button>
            <button
              disabled={selected.length === 0}
              onClick={() => onEnter({ role: 'crew', consoles: selected })}
              style={{
                ...primaryBtn,
                opacity: selected.length === 0 ? 0.3 : 1,
                cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ENTER SHIP →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const ghostBtn = {
  background: 'transparent',
  border: '1px solid #334455',
  color: '#445566',
  padding: '8px 20px',
  fontFamily: 'Courier New',
  fontSize: '11px',
  letterSpacing: '2px',
  cursor: 'pointer',
  borderRadius: '2px',
}

const primaryBtn = {
  background: '#003322',
  border: '1px solid #00cc66',
  color: '#00cc66',
  padding: '8px 28px',
  fontFamily: 'Courier New',
  fontSize: '12px',
  letterSpacing: '2px',
  borderRadius: '2px',
}
