// Shared primitive UI components for the game interface.
// Import these instead of copy-pasting button/slider style objects across panels.

// ── Btn ───────────────────────────────────────────────────────────────────────
// A ghost/outline button. Props:
//   color       – text AND border color  (default: var(--text-body))
//   borderColor – border color override  (default: same as color)
//   bg          – background             (default: transparent)
//   small       – compact padding/font   (default: false)
//   style       – one-off style overrides
// All other props (onClick, disabled, data-testid, …) pass through to <button>.
export function Btn({ children, color = 'var(--text-body)', borderColor, bg = 'transparent',
                      small, style, ...props }) {
  return (
    <button style={{
      background: bg,
      border: `1px solid ${borderColor ?? color}`,
      color,
      padding: small ? 'var(--btn-pad-sm, 3px 8px)' : 'var(--btn-pad, 5px 10px)',
      fontFamily: 'var(--font-mono)',
      fontSize: small ? 'var(--btn-font-size-sm, 9px)' : 'var(--btn-font-size, 11px)',
      letterSpacing: '1px',
      cursor: 'pointer',
      borderRadius: 'var(--btn-radius, 2px)',
      ...style,
    }} {...props}>
      {children}
    </button>
  )
}

// ── IconBtn ───────────────────────────────────────────────────────────────────
// A fixed 22×22 square icon button. Ideal for ✕ close buttons and ±/zoom controls.
export function IconBtn({ children, style, ...props }) {
  return (
    <button style={{
      background: 'none',
      border: '1px solid var(--border-faint)',
      color: 'var(--text-body)',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      width: 22,
      height: 22,
      cursor: 'pointer',
      lineHeight: 1,
      padding: 0,
      ...style,
    }} {...props}>
      {children}
    </button>
  )
}

// ── ChipBtn ───────────────────────────────────────────────────────────────────
// A small pill/tab selector chip. Props:
//   active      – whether this chip is currently selected
//   accentColor – highlight color when active  (default: var(--accent))
//   activeBg    – background when active       (default: transparent)
export function ChipBtn({ children, active, accentColor = 'var(--accent)', activeBg,
                          style, ...props }) {
  return (
    <button style={{
      background: active ? (activeBg ?? 'transparent') : 'transparent',
      border: `1px solid ${active ? accentColor : 'var(--border)'}`,
      color: active ? accentColor : 'var(--text-body)',
      padding: '3px 8px',
      fontFamily: 'var(--font-mono)',
      fontSize: '10px',
      cursor: 'pointer',
      borderRadius: 'var(--btn-radius, 2px)',
      transition: 'all .15s',
      ...style,
    }} {...props}>
      {children}
    </button>
  )
}

// ── Slider ────────────────────────────────────────────────────────────────────
// A label + range input + value readout row. Props:
//   label       – text label on the left
//   value       – current numeric value
//   onChange    – called with the new number
//   min/max     – range limits   (default: 0 / 100)
//   step        – step size      (default: 1)
//   accent      – color for thumb and value text  (default: var(--accent))
//   unit        – string appended to the value    (default: '%')
//   labelWidth  – width of the label column in px (default: 60)
export function Slider({ label, value, onChange, min = 0, max = 100, step = 1,
                         accent = 'var(--accent)', unit = '%', labelWidth = 60 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{
        fontSize: 8, color: 'var(--text-dim)', width: labelWidth,
        flexShrink: 0, fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
      }}>
        {label}
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.round(value ?? 0)}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent, height: 'var(--slider-height, 12px)' }} />
      <span style={{ fontSize: 8, color: accent, width: 32, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {Math.round(value ?? 0)}{unit}
      </span>
    </div>
  )
}
