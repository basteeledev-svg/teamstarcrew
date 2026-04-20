// Shared constants and helpers — single source of truth for the frontend.

// ── Health / heat colour helpers ──────────────────────────────────────────
export function healthColor(pct) {
  if (pct >= 70) return 'var(--status-good)'
  if (pct >= 40) return 'var(--status-warn)'
  return 'var(--status-bad)'
}

export function heatColor(pct) {
  if (pct < 50) return 'var(--status-good)'
  if (pct < 80) return 'var(--status-warn)'
  return 'var(--status-bad)'
}

// ── Race colours (used on short-range scan, nav, tactical) ────────────────
export const RACE_COLORS = {
  Human:     '#4488ff',
  Ssysrian:  '#44ff88',
  Unitarian: '#ffcc44',
  Fulborg:   '#ff4455',
  Klackin:   '#cc44ff',
}

// ── Planet type colours (long-range scan) ─────────────────────────────────
export const PLANET_TYPE_COLORS = {
  'Barren/Rocky':    '#886655',
  'Terrestrial':     '#44bb77',
  'Desert/Arid':     '#cc8833',
  'Ice World':       '#88ddff',
  'Gas Giant':       '#9966dd',
  'Ice Giant':       '#66aacc',
  'Ocean World':     '#2288cc',
  'Jungle/Lush':     '#55cc44',
  'Tidally Locked':  '#aaaaaa',
  'Toxic/Corrosive': '#88cc22',
  'Volcanic/Magma':  '#ff6622',
  'Irradiated':      '#ddaa00',
  'Super-Earth':     '#77aa44',
  'Crystalline':     '#cc88ff',
  'Rogue/Dark':      '#334455',
}
