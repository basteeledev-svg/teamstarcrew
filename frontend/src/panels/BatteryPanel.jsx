import { useState, useEffect } from 'react'
import s from './BatteryPanel.module.css'

const ACCENT  = 'var(--accent-cyan)'
const AMBER   = 'var(--accent-amber)'
const DANGER  = 'var(--status-danger)'

function pctColor(pct) {
  if (pct >= 50) return ACCENT
  if (pct >= 20) return AMBER
  return DANGER
}

export default function BatteryPanel({ gameState, sendCommand }) {
  const ship = gameState?.ship
  const [slider, setSlider] = useState(null)   // local optimistic value

  const serverSlider = ship?.battery_slider ?? 0
  const curSlider    = slider ?? serverSlider

  // Sync on first load
  useEffect(() => {
    if (slider === null && ship?.battery_slider !== undefined)
      setSlider(ship.battery_slider)
  }, [ship?.battery_slider])

  function commit(val) {
    const clamped = Math.max(-100, Math.min(100, val))
    setSlider(clamped)
    sendCommand({ type: 'set_battery_slider', value: clamped })
  }

  const energyTW  = ship?.battery_energy_tw  ?? 0
  const capTW     = ship?.battery_capacity_tw ?? 500
  const pct       = capTW > 0 ? Math.min(100, (energyTW / capTW) * 100) : 0
  const count     = ship?.battery_count ?? 0
  const isRunning = gameState?.status === 'running'

  const sliderColor = curSlider > 0 ? DANGER : curSlider < 0 ? ACCENT : 'var(--text-dim)'
  const sliderLabel = curSlider > 0
    ? `DISCHARGE ${curSlider.toFixed(0)}%`
    : curSlider < 0
    ? `CHARGE ${Math.abs(curSlider).toFixed(0)}%`
    : 'IDLE'

  if (!ship) return <div className={s.noSignal}>NO SIGNAL</div>

  return (
    <div className={s.container}>
      <div className={s.header}>BATTERY MANAGEMENT</div>

      {/* Charge level */}
      <div className={s.card}>
        <div className={s.cardTitle}>CHARGE LEVEL</div>
        <div className={s.bigPct} style={{ color: pctColor(pct) }}>
          {pct.toFixed(1)}%
        </div>
        <div className={s.barTrack}>
          <div className={s.barFill} style={{ width: `${pct}%`, background: pctColor(pct) }} />
        </div>
        <div className={s.statsRow}>
          <span>{energyTW.toFixed(0)} TW stored</span>
          <span>{capTW.toFixed(0)} TW capacity</span>
          <span>{count} unit{count !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Charge / Discharge slider */}
      <div className={s.card}>
        <div className={s.cardTitle}>CHARGE CONTROL</div>
        <div className={s.sliderLabel} style={{ color: sliderColor }}>
          {sliderLabel}
        </div>
        <div className={s.sliderWrap}>
          <span className={s.sliderEnd}>◄ DISCHARGE</span>
          <input
            type="range" min={-100} max={100} step={1}
            value={curSlider}
            onChange={e => setSlider(parseFloat(e.target.value))}
            onMouseUp={e  => commit(parseFloat(e.target.value))}
            onTouchEnd={e => commit(parseFloat(e.target.value))}
            disabled={!isRunning}
            className={s.slider}
            style={{ accentColor: sliderColor }}
          />
          <span className={s.sliderEnd}>CHARGE ►</span>
        </div>
        <div className={s.presetRow}>
          <button onClick={() => commit(-100)} disabled={!isRunning || pct >= 99.9} className={s.presetBtn}>
            MAX CHARGE
          </button>
          <button onClick={() => commit(0)} disabled={!isRunning} className={s.presetBtn}>
            IDLE
          </button>
          <button onClick={() => commit(100)} disabled={!isRunning || pct <= 0.1} className={s.presetBtn}>
            MAX DISCHARGE
          </button>
        </div>
        <div className={s.note}>
          Negative = charging (draws from reactor). Positive = discharging (adds to available TW).
        </div>
      </div>
    </div>
  )
}
