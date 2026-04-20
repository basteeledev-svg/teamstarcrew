import { useState, useEffect } from 'react'
import { Btn, IconBtn, ChipBtn, Slider } from '../components/ui'

// ── Preset themes ──────────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'deep-space', name: 'DEEP SPACE', accent: '#00aaff',
    vars: {
      '--bg-base': '#050510', '--bg-raised': '#0a0a20', '--bg-card': '#08081a',
      '--bg-input': '#09091c', '--bg-label': '#070714',
      '--border': '#1a1a2e', '--border-faint': '#0d0d22',
      '--text-bright': '#d0d8f0', '--text-primary': '#aabbdd', '--text-body': '#8899cc',
      '--text-secondary': '#556677', '--text-muted': '#445566', '--text-dim': '#334455',
      '--text-ghost': '#1a2a3a',
      '--accent': '#00aaff', '--accent-green': '#00cc66', '--accent-amber': '#ffaa00',
      '--accent-red': '#cc3300', '--accent-cyan': '#00ffcc',
      '--status-good': '#00ff88', '--status-warn': '#ffaa00', '--status-bad': '#ff4444',
      '--status-danger': '#ff3333',
      '--tint-success': '#003322', '--tint-accent': '#002244', '--tint-danger': 'rgba(26,0,0,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'nebula', name: 'NEBULA', accent: '#cc66ff',
    vars: {
      '--bg-base': '#06020e', '--bg-raised': '#100820', '--bg-card': '#0c0618',
      '--bg-input': '#0d071a', '--bg-label': '#080412',
      '--border': '#2a1040', '--border-faint': '#150830',
      '--text-bright': '#e8d0ff', '--text-primary': '#c8a0ee', '--text-body': '#9970cc',
      '--text-secondary': '#664488', '--text-muted': '#553377', '--text-dim': '#3d2255',
      '--text-ghost': '#1e0f33',
      '--accent': '#cc66ff', '--accent-green': '#66ff99', '--accent-amber': '#ffaa44',
      '--accent-red': '#ff4466', '--accent-cyan': '#44ddff',
      '--status-good': '#66ff99', '--status-warn': '#ffaa44', '--status-bad': '#ff4466',
      '--status-danger': '#ff2244',
      '--tint-success': '#002211', '--tint-accent': '#180030', '--tint-danger': 'rgba(30,0,10,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'solar', name: 'SOLAR STORM', accent: '#ffaa00',
    vars: {
      '--bg-base': '#0a0500', '--bg-raised': '#120900', '--bg-card': '#0e0600',
      '--bg-input': '#100700', '--bg-label': '#080400',
      '--border': '#2a1500', '--border-faint': '#1a0c00',
      '--text-bright': '#fff0d0', '--text-primary': '#ddcc88', '--text-body': '#aa9955',
      '--text-secondary': '#775533', '--text-muted': '#553322', '--text-dim': '#331a00',
      '--text-ghost': '#1a0d00',
      '--accent': '#ffaa00', '--accent-green': '#88dd00', '--accent-amber': '#ff7700',
      '--accent-red': '#ff2200', '--accent-cyan': '#ffdd55',
      '--status-good': '#88ff44', '--status-warn': '#ffcc00', '--status-bad': '#ff4400',
      '--status-danger': '#ff2200',
      '--tint-success': '#112200', '--tint-accent': '#221000', '--tint-danger': 'rgba(26,5,0,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'emergency', name: 'EMERGENCY', accent: '#ff3333',
    vars: {
      '--bg-base': '#0a0000', '--bg-raised': '#160000', '--bg-card': '#0e0000',
      '--bg-input': '#100000', '--bg-label': '#080000',
      '--border': '#330000', '--border-faint': '#1a0000',
      '--text-bright': '#ffdddd', '--text-primary': '#ff9999', '--text-body': '#cc5555',
      '--text-secondary': '#883333', '--text-muted': '#662222', '--text-dim': '#441111',
      '--text-ghost': '#220000',
      '--accent': '#ff3333', '--accent-green': '#ff8833', '--accent-amber': '#ffcc00',
      '--accent-red': '#ff0000', '--accent-cyan': '#ff6644',
      '--status-good': '#ff8833', '--status-warn': '#ffcc00', '--status-bad': '#ff0000',
      '--status-danger': '#ff0000',
      '--tint-success': '#1a0000', '--tint-accent': '#220000', '--tint-danger': 'rgba(40,0,0,0.9)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'tactical', name: 'TACTICAL', accent: '#00ff44',
    vars: {
      '--bg-base': '#010a01', '--bg-raised': '#041204', '--bg-card': '#020e02',
      '--bg-input': '#030f03', '--bg-label': '#020900',
      '--border': '#0d2a0d', '--border-faint': '#071507',
      '--text-bright': '#ccffcc', '--text-primary': '#88dd88', '--text-body': '#55aa55',
      '--text-secondary': '#336633', '--text-muted': '#225522', '--text-dim': '#113311',
      '--text-ghost': '#061a06',
      '--accent': '#00ff44', '--accent-green': '#44ff66', '--accent-amber': '#aaff00',
      '--accent-red': '#ff4400', '--accent-cyan': '#00ffaa',
      '--status-good': '#44ff66', '--status-warn': '#aaff00', '--status-bad': '#ff4400',
      '--status-danger': '#ff2200',
      '--tint-success': '#002200', '--tint-accent': '#001a00', '--tint-danger': 'rgba(10,0,0,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'arctic', name: 'ARCTIC', accent: '#44ddff',
    vars: {
      '--bg-base': '#010810', '--bg-raised': '#041220', '--bg-card': '#020b18',
      '--bg-input': '#030d1c', '--bg-label': '#020918',
      '--border': '#0d2a40', '--border-faint': '#07162a',
      '--text-bright': '#e0f4ff', '--text-primary': '#99ddff', '--text-body': '#66bbdd',
      '--text-secondary': '#336688', '--text-muted': '#224455', '--text-dim': '#112233',
      '--text-ghost': '#081a22',
      '--accent': '#44ddff', '--accent-green': '#44ffdd', '--accent-amber': '#88ccff',
      '--accent-red': '#ff44aa', '--accent-cyan': '#aaeeff',
      '--status-good': '#44ffdd', '--status-warn': '#88ccff', '--status-bad': '#ff44aa',
      '--status-danger': '#ff2288',
      '--tint-success': '#001a22', '--tint-accent': '#001833', '--tint-danger': 'rgba(0,10,20,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'void', name: 'VOID', accent: '#cccccc',
    vars: {
      '--bg-base': '#000000', '--bg-raised': '#080808', '--bg-card': '#050505',
      '--bg-input': '#070707', '--bg-label': '#030303',
      '--border': '#1c1c1c', '--border-faint': '#0f0f0f',
      '--text-bright': '#ffffff', '--text-primary': '#cccccc', '--text-body': '#888888',
      '--text-secondary': '#555555', '--text-muted': '#444444', '--text-dim': '#333333',
      '--text-ghost': '#1a1a1a',
      '--accent': '#cccccc', '--accent-green': '#aaaaaa', '--accent-amber': '#999999',
      '--accent-red': '#666666', '--accent-cyan': '#dddddd',
      '--status-good': '#aaaaaa', '--status-warn': '#888888', '--status-bad': '#555555',
      '--status-danger': '#333333',
      '--tint-success': '#0a0a0a', '--tint-accent': '#111111', '--tint-danger': 'rgba(5,5,5,0.9)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'neon', name: 'NEON GRID', accent: '#ff00ff',
    vars: {
      '--bg-base': '#000011', '--bg-raised': '#000022', '--bg-card': '#00001a',
      '--bg-input': '#00001e', '--bg-label': '#000014',
      '--border': '#330033', '--border-faint': '#1a001a',
      '--text-bright': '#ffddff', '--text-primary': '#ff88ff', '--text-body': '#cc55cc',
      '--text-secondary': '#883388', '--text-muted': '#552255', '--text-dim': '#440044',
      '--text-ghost': '#220022',
      '--accent': '#ff00ff', '--accent-green': '#00ffff', '--accent-amber': '#ffff00',
      '--accent-red': '#ff0055', '--accent-cyan': '#00ffcc',
      '--status-good': '#00ffcc', '--status-warn': '#ffff00', '--status-bad': '#ff0055',
      '--status-danger': '#ff0033',
      '--tint-success': '#001a11', '--tint-accent': '#220022', '--tint-danger': 'rgba(20,0,10,0.9)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '2px',
    },
  },
  {
    id: 'retro', name: 'RETRO AMBER', accent: '#ffbb00',
    vars: {
      '--bg-base': '#0d0800', '--bg-raised': '#150d00', '--bg-card': '#110a00',
      '--bg-input': '#130c00', '--bg-label': '#0a0600',
      '--border': '#332200', '--border-faint': '#221500',
      '--text-bright': '#ffeeaa', '--text-primary': '#ffcc44', '--text-body': '#cc9922',
      '--text-secondary': '#886611', '--text-muted': '#664400', '--text-dim': '#442c00',
      '--text-ghost': '#221800',
      '--accent': '#ffbb00', '--accent-green': '#aaff00', '--accent-amber': '#ff8800',
      '--accent-red': '#ff3300', '--accent-cyan': '#ffdd88',
      '--status-good': '#aaff00', '--status-warn': '#ff8800', '--status-bad': '#ff3300',
      '--status-danger': '#ff1100',
      '--tint-success': '#112200', '--tint-accent': '#1a1000', '--tint-danger': 'rgba(20,5,0,0.9)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '0px',
    },
  },
  {
    id: 'midnight', name: 'MIDNIGHT', accent: '#6677ff',
    vars: {
      '--bg-base': '#02020a', '--bg-raised': '#060614', '--bg-card': '#040410',
      '--bg-input': '#050512', '--bg-label': '#030308',
      '--border': '#0e0e2a', '--border-faint': '#07071a',
      '--text-bright': '#ccddff', '--text-primary': '#9999ee', '--text-body': '#6666bb',
      '--text-secondary': '#3d3d77', '--text-muted': '#2e2e55', '--text-dim': '#1e1e3a',
      '--text-ghost': '#0d0d1e',
      '--accent': '#6677ff', '--accent-green': '#44eeaa', '--accent-amber': '#cc99ff',
      '--accent-red': '#ff5577', '--accent-cyan': '#44bbff',
      '--status-good': '#44eeaa', '--status-warn': '#cc99ff', '--status-bad': '#ff5577',
      '--status-danger': '#ff2255',
      '--tint-success': '#001a11', '--tint-accent': '#0a0a33', '--tint-danger': 'rgba(15,0,10,0.85)',
      '--font-mono': "'Courier New', monospace", '--btn-radius': '4px',
    },
  },
]

// ── Colorblind-safe presets (Okabe-Ito, IBM, and type-specific palettes) ───────
// Each uses 8px rounded buttons and 20px slider tracks per user preference.
// "accent-green" IS NOT green in deuteranopia/protanopia — it's the "success" slot.
const CB_PRESETS = [
  {
    id: 'cb-deuter', name: 'DEUTERANOPIA', accent: '#5599ff', cbSafe: true,
    info: 'Red/green blind (most common). Blue+gold+yellow+magenta.',
    vars: {
      '--bg-base': '#030510', '--bg-raised': '#0a0a20', '--bg-card': '#08081a',
      '--bg-input': '#09091c', '--bg-label': '#070714',
      '--border': '#1a1a2e', '--border-faint': '#0d0d22',
      '--text-bright': '#d0d8f0', '--text-primary': '#aabbdd', '--text-body': '#8899cc',
      '--text-secondary': '#556677', '--text-muted': '#445566', '--text-dim': '#334455',
      '--text-ghost': '#1a2a3a',
      '--accent':       '#5599ff',  // blue — primary
      '--accent-green': '#ffaa00',  // gold — "success" slot (NOT green; indistinguishable from red for deuteranopes)
      '--accent-amber': '#ffee44',  // yellow — warning
      '--accent-red':   '#dd44cc',  // magenta — danger slot (NOT red)
      '--accent-cyan':  '#44ccff',  // sky blue
      '--status-good':   '#ffaa00', '--status-warn': '#ffee44',
      '--status-bad':    '#dd44cc', '--status-danger': '#cc1199',
      '--tint-success': '#241800', '--tint-accent': '#001133', '--tint-danger': 'rgba(20,2,16,0.85)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
  {
    id: 'cb-protano', name: 'PROTANOPIA', accent: '#0088ee', cbSafe: true,
    info: 'Red-blind. Reds appear very dark. Blue+orange+yellow+purple.',
    vars: {
      '--bg-base': '#030510', '--bg-raised': '#0a0a20', '--bg-card': '#08081a',
      '--bg-input': '#09091c', '--bg-label': '#070714',
      '--border': '#1a1a2e', '--border-faint': '#0d0d22',
      '--text-bright': '#d0d8f0', '--text-primary': '#aabbdd', '--text-body': '#8899cc',
      '--text-secondary': '#556677', '--text-muted': '#445566', '--text-dim': '#334455',
      '--text-ghost': '#1a2a3a',
      '--accent':       '#0088ee',  // blue
      '--accent-green': '#ff8800',  // bright orange — success slot
      '--accent-amber': '#ffcc00',  // yellow
      '--accent-red':   '#bb00cc',  // purple — danger slot
      '--accent-cyan':  '#00aaff',
      '--status-good':   '#ff8800', '--status-warn': '#ffcc00',
      '--status-bad':    '#bb00cc', '--status-danger': '#990099',
      '--tint-success': '#241400', '--tint-accent': '#001122', '--tint-danger': 'rgba(16,0,20,0.85)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
  {
    id: 'cb-trit', name: 'TRITANOPIA', accent: '#ee5500', cbSafe: true,
    info: 'Blue/yellow blind. Red+green+orange+teal are all distinguishable.',
    vars: {
      '--bg-base': '#030510', '--bg-raised': '#0a0a20', '--bg-card': '#08081a',
      '--bg-input': '#09091c', '--bg-label': '#070714',
      '--border': '#1a1a2e', '--border-faint': '#0d0d22',
      '--text-bright': '#f0e8d0', '--text-primary': '#ddccaa', '--text-body': '#aa9966',
      '--text-secondary': '#665533', '--text-muted': '#554422', '--text-dim': '#332200',
      '--text-ghost': '#1a1100',
      '--accent':       '#ee5500',  // orange-red
      '--accent-green': '#00cc55',  // green — SAFE for tritanopia
      '--accent-amber': '#ff3388',  // pink/warm
      '--accent-red':   '#dd0000',  // red — SAFE; tritanopes confuse blue↔yellow, not red↔green
      '--accent-cyan':  '#00bbaa',  // teal
      '--status-good':   '#00cc55', '--status-warn': '#ff8800',
      '--status-bad':    '#dd0000', '--status-danger': '#aa0000',
      '--tint-success': '#002211', '--tint-accent': '#221100', '--tint-danger': 'rgba(20,0,0,0.85)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
  {
    id: 'cb-ibm', name: 'IBM SAFE', accent: '#648FFF', cbSafe: true,
    info: "IBM's verified colorblind palette. Safe for all common deficiency types.",
    vars: {
      '--bg-base': '#030510', '--bg-raised': '#0a0a20', '--bg-card': '#08081a',
      '--bg-input': '#09091c', '--bg-label': '#070714',
      '--border': '#1a1a2e', '--border-faint': '#0d0d22',
      '--text-bright': '#d0d8f0', '--text-primary': '#aabbdd', '--text-body': '#8899cc',
      '--text-secondary': '#556677', '--text-muted': '#445566', '--text-dim': '#334455',
      '--text-ghost': '#1a2a3a',
      '--accent':       '#648FFF',  // periwinkle blue
      '--accent-green': '#FFB000',  // gold
      '--accent-amber': '#FE6100',  // orange
      '--accent-red':   '#DC267F',  // magenta
      '--accent-cyan':  '#785EF0',  // purple
      '--status-good':   '#FFB000', '--status-warn': '#FE6100',
      '--status-bad':    '#DC267F', '--status-danger': '#cc0066',
      '--tint-success': '#241800', '--tint-accent': '#0d0033', '--tint-danger': 'rgba(22,0,12,0.85)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
  {
    id: 'cb-okabe', name: 'OKABE-ITO', accent: '#56B4E9', cbSafe: true,
    info: 'Scientifically designed 8-color palette. Safe for all colorblindness types.',
    vars: {
      '--bg-base': '#01060c', '--bg-raised': '#040d18', '--bg-card': '#020a14',
      '--bg-input': '#030c18', '--bg-label': '#020810',
      '--border': '#0d1e2e', '--border-faint': '#070f1c',
      '--text-bright': '#e0f0ff', '--text-primary': '#99ccee', '--text-body': '#6699bb',
      '--text-secondary': '#3d6688', '--text-muted': '#2a4d66', '--text-dim': '#1a3344',
      '--text-ghost': '#0d1a22',
      '--accent':       '#56B4E9',  // sky blue
      '--accent-green': '#009E73',  // bluish green
      '--accent-amber': '#E69F00',  // orange
      '--accent-red':   '#CC79A7',  // reddish purple
      '--accent-cyan':  '#0072B2',  // deep blue
      '--status-good':   '#009E73', '--status-warn': '#E69F00',
      '--status-bad':    '#D55E00', '--status-danger': '#CC79A7',
      '--tint-success': '#001a11', '--tint-accent': '#001122', '--tint-danger': 'rgba(18,8,0,0.85)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
  {
    id: 'cb-hicon', name: 'HIGH CONTRAST', accent: '#ffff00', cbSafe: true,
    info: 'Maximum luminance contrast. Works for all colorblindness including achromatopsia.',
    vars: {
      '--bg-base': '#000000', '--bg-raised': '#0a0a0a', '--bg-card': '#060606',
      '--bg-input': '#080808', '--bg-label': '#030303',
      '--border': '#333333', '--border-faint': '#1a1a1a',
      '--text-bright': '#ffffff', '--text-primary': '#eeeeee', '--text-body': '#cccccc',
      '--text-secondary': '#999999', '--text-muted': '#666666', '--text-dim': '#444444',
      '--text-ghost': '#222222',
      '--accent':       '#ffff00',  // yellow — max contrast on black
      '--accent-green': '#00ff88',
      '--accent-amber': '#ff9900',
      '--accent-red':   '#ff00cc',  // magenta — distinguishable without color vision
      '--accent-cyan':  '#00ffff',
      '--status-good':   '#00ff88', '--status-warn': '#ffff00',
      '--status-bad':    '#ff9900', '--status-danger': '#ff00cc',
      '--tint-success': '#001a0d', '--tint-accent': '#1a1a00', '--tint-danger': 'rgba(20,0,15,0.9)',
      '--font-mono': "'Courier New', monospace",
      '--btn-radius': '8px', '--slider-height': '20px',
    },
  },
]

// ── Color picker groups (hex-valued vars only) ─────────────────────────────────
const HEX_GROUPS = [
  {
    title: 'ACCENT COLORS',
    vars: [
      { name: '--accent',       label: 'PRIMARY' },
      { name: '--accent-green', label: 'GREEN'   },
      { name: '--accent-amber', label: 'AMBER'   },
      { name: '--accent-red',   label: 'RED'     },
      { name: '--accent-cyan',  label: 'CYAN'    },
    ],
  },
  {
    title: 'STATUS INDICATORS',
    vars: [
      { name: '--status-good',   label: 'GOOD'   },
      { name: '--status-warn',   label: 'WARN'   },
      { name: '--status-bad',    label: 'BAD'    },
      { name: '--status-danger', label: 'DANGER' },
    ],
  },
  {
    title: 'BACKGROUNDS',
    vars: [
      { name: '--bg-base',   label: 'BASE'   },
      { name: '--bg-raised', label: 'RAISED' },
      { name: '--bg-card',   label: 'CARD'   },
      { name: '--bg-input',  label: 'INPUT'  },
      { name: '--bg-label',  label: 'LABEL'  },
    ],
  },
  {
    title: 'BORDERS',
    vars: [
      { name: '--border',       label: 'NORMAL' },
      { name: '--border-faint', label: 'FAINT'  },
    ],
  },
  {
    title: 'TEXT HIERARCHY',
    vars: [
      { name: '--text-bright',    label: 'BRIGHT'    },
      { name: '--text-primary',   label: 'PRIMARY'   },
      { name: '--text-body',      label: 'BODY'      },
      { name: '--text-secondary', label: 'SECONDARY' },
      { name: '--text-muted',     label: 'MUTED'     },
      { name: '--text-dim',       label: 'DIM'       },
      { name: '--text-ghost',     label: 'GHOST'     },
    ],
  },
]

// ── Font and shape options ─────────────────────────────────────────────────────
const FONT_OPTIONS = [
  { label: 'COURIER',  value: "'Courier New', monospace"             },
  { label: 'MENLO',    value: "'Menlo', monospace"                   },
  { label: 'MONACO',   value: "'Monaco', monospace"                  },
  { label: 'SF MONO',  value: "'SF Mono', 'Menlo', monospace"        },
  { label: 'CONSOLAS', value: "'Consolas', 'Courier New', monospace" },
  { label: 'LUCIDA',   value: "'Lucida Console', monospace"          },
  { label: 'SYSTEM',   value: 'monospace'                            },
]

const RADIUS_OPTIONS = [
  { label: '0px  SHARP',   value: '0px'  },
  { label: '2px  DEFAULT', value: '2px'  },
  { label: '4px  SOFT',    value: '4px'  },
  { label: '8px  ROUND',   value: '8px'  },
  { label: '16px PILL',    value: '16px' },
]

const SLIDER_HEIGHT_OPTIONS = [
  { label: '6px   HAIRLINE', value: '6px'  },
  { label: '10px  THIN',     value: '10px' },
  { label: '14px  DEFAULT',  value: '14px' },
  { label: '20px  CHUNKY',   value: '20px' },
  { label: '28px  THICK',    value: '28px' },
]

const BTN_SIZE_OPTIONS = [
  { label: 'XS  MICRO',   key: 'xs', vars: { '--btn-font-size': '7px',  '--btn-font-size-sm': '6px',  '--btn-pad': '1px 5px',   '--btn-pad-sm': '1px 3px'  } },
  { label: 'SM  COMPACT', key: 'sm', vars: { '--btn-font-size': '9px',  '--btn-font-size-sm': '8px',  '--btn-pad': '3px 8px',   '--btn-pad-sm': '2px 5px'  } },
  { label: 'MD  DEFAULT', key: 'md', vars: { '--btn-font-size': '11px', '--btn-font-size-sm': '9px',  '--btn-pad': '5px 10px',  '--btn-pad-sm': '3px 8px'  } },
  { label: 'LG  LARGE',   key: 'lg', vars: { '--btn-font-size': '13px', '--btn-font-size-sm': '11px', '--btn-pad': '7px 14px',  '--btn-pad-sm': '4px 10px' } },
  { label: 'XL  JUMBO',   key: 'xl', vars: { '--btn-font-size': '16px', '--btn-font-size-sm': '13px', '--btn-pad': '10px 20px', '--btn-pad-sm': '6px 14px' } },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function toHex(val) {
  const t = (val || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : '#000000'
}

function initVars() {
  const root    = document.documentElement
  const result  = {
    ...PRESETS[0].vars,
    '--slider-height':  '14px',
    '--btn-font-size':  '11px',
    '--btn-font-size-sm': '9px',
    '--btn-pad':        '5px 10px',
    '--btn-pad-sm':     '3px 8px',
  }
  Object.keys(result).forEach(name => {
    const inline = root.style.getPropertyValue(name).trim()
    if (inline) result[name] = inline
  })
  return result
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function StyleLabPage({ onBack }) {
  const [vars,      setVars]      = useState(initVars)
  const [chipIdx,   setChipIdx]   = useState(0)
  const [sliders,   setSliders]   = useState({ power: 64, shields: 45, weapons: 70, engines: 82 })
  const [mockTab,   setMockTab]   = useState(0)
  const [mockLock,  setMockLock]  = useState(false)
  const [mockPwr,   setMockPwr]   = useState(60)
  const [copied,    setCopied]    = useState(false)
  const [leftTab,   setLeftTab]   = useState('shapes')  // 'shapes' | 'colors'

  // Push every change to :root so the whole app updates in real time
  useEffect(() => {
    const root = document.documentElement
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [vars])

  // Merge so non-preset vars (slider height, radius) are preserved
  function applyPreset(preset) { setVars(prev => ({ ...prev, ...preset.vars })) }
  function setVar(name, value)  { setVars(prev => ({ ...prev, [name]: value })) }

  function copyCss() {
    const lines = Object.entries(vars).map(([k, v]) => `        ${k}: ${v};`).join('\n')
    const out   = `:root {\n${lines}\n      }`
    navigator.clipboard?.writeText(out)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const currentPreset = null  // unused — kept for future

  return (
    <div style={{
      width: 1280, height: 800, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)', color: 'var(--text-body)', overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)',
      }}>
        <Btn small color="var(--text-dim)" onClick={onBack}>← BACK</Btn>
        <span style={{ fontSize: 11, letterSpacing: 3, color: 'var(--text-primary)' }}>✦ STYLE LAB</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1 }}>
          CHANGES ARE LIVE — NAVIGATE TO ANY CONSOLE TO SEE RESULTS
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn small color="var(--text-dim)" onClick={() => applyPreset(PRESETS[0])}>↺ RESET</Btn>
          <Btn small color="var(--accent)" onClick={copyCss}>
            {copied ? '✓ COPIED!' : '⎘ COPY CSS'}
          </Btn>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ──── Left panel — controls ──── */}
        <div style={{
          width: 326, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>

          {/* Presets — themes */}
          <CtrlSection title="THEMES">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p)} style={{
                  background: `${p.accent}18`,
                  border: `1px solid ${p.accent}55`,
                  color: p.accent,
                  padding: '5px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, letterSpacing: 1,
                  cursor: 'pointer',
                  borderRadius: 'var(--btn-radius, 2px)',
                  transition: 'background .15s',
                }}>
                  {p.name}
                </button>
              ))}
            </div>
          </CtrlSection>

          {/* Presets — colorblind safe */}
          <CtrlSection title="COLORBLIND SAFE — 8px ROUND + 20px SLIDER">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {CB_PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p)} style={{
                  background: `${p.accent}14`,
                  border: `1px solid ${p.accent}55`,
                  color: p.accent,
                  padding: '6px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9, letterSpacing: 1,
                  cursor: 'pointer',
                  borderRadius: '8px',
                  transition: 'background .15s',
                  textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 8, opacity: 0.75 }}>{p.info}</div>
                </button>
              ))}
            </div>
          </CtrlSection>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['shapes', '⬡ SHAPES & FONTS'], ['colors', '◈ COLORS']].map(([id, label]) => (
              <button key={id} onClick={() => setLeftTab(id)} style={{
                flex: 1, padding: '6px 4px',
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                background: leftTab === id ? 'var(--tint-accent)' : 'transparent',
                border: `1px solid ${leftTab === id ? 'var(--accent)' : 'var(--border)'}`,
                color: leftTab === id ? 'var(--accent)' : 'var(--text-dim)',
                cursor: 'pointer', transition: 'all .15s',
                borderRadius: 'var(--btn-radius, 2px)',
              }}>{label}</button>
            ))}
          </div>

          {leftTab === 'shapes' && (<>

          {/* Button size */}
          <CtrlSection title="BUTTON SIZE — FONT + PADDING">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {BTN_SIZE_OPTIONS.map(s => {
                const active = vars['--btn-font-size'] === s.vars['--btn-font-size']
                return (
                  <button
                    key={s.key}
                    onClick={() => setVars(prev => ({ ...prev, ...s.vars }))}
                    style={{
                      background:   active ? 'var(--tint-accent)' : 'transparent',
                      border:       `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      color:        active ? 'var(--accent)' : 'var(--text-dim)',
                      padding:      '6px 10px',
                      fontFamily:   'var(--font-mono)',
                      fontSize:     9, letterSpacing: 1,
                      cursor:       'pointer',
                      borderRadius: 'var(--btn-radius, 2px)',
                      textAlign:    'left',
                      transition:   'all .15s',
                      display:      'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{s.label}</span>
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: s.vars['--btn-pad-sm'],
                        border: '1px solid currentColor',
                        borderRadius: 'var(--btn-radius, 2px)',
                        fontSize: s.vars['--btn-font-size-sm'],
                        lineHeight: 1,
                      }}>SM</span>
                      <span style={{
                        display: 'inline-block',
                        padding: s.vars['--btn-pad'],
                        border: '1px solid currentColor',
                        borderRadius: 'var(--btn-radius, 2px)',
                        fontSize: s.vars['--btn-font-size'],
                        lineHeight: 1,
                      }}>NORMAL</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </CtrlSection>

          {/* Button shape */}
          <CtrlSection title="BUTTON SHAPE — BORDER RADIUS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setVar('--btn-radius', r.value)}
                  style={{
                    background:   vars['--btn-radius'] === r.value ? 'var(--tint-accent)' : 'transparent',
                    border:       `1px solid ${vars['--btn-radius'] === r.value ? 'var(--accent)' : 'var(--border)'}`,
                    color:        vars['--btn-radius'] === r.value ? 'var(--accent)' : 'var(--text-dim)',
                    padding:      '6px 10px',
                    fontFamily:   'var(--font-mono)',
                    fontSize:     9, letterSpacing: 1,
                    cursor:       'pointer',
                    borderRadius: r.value,
                    textAlign:    'left',
                    transition:   'all .15s',
                  }}
                >
                  {r.label}
                  <span style={{ float: 'right', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 32, height: 16, border: '1px solid currentColor', borderRadius: r.value }} />
                    <span style={{ display: 'inline-block', width: 48, height: 10, border: '1px solid currentColor', borderRadius: r.value, background: 'currentColor', opacity: 0.25 }} />
                  </span>
                </button>
              ))}
            </div>
          </CtrlSection>

          {/* Slider height */}
          <CtrlSection title="SLIDER TRACK — HEIGHT">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {SLIDER_HEIGHT_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setVar('--slider-height', s.value)}
                  style={{
                    background:   vars['--slider-height'] === s.value ? 'var(--tint-accent)' : 'transparent',
                    border:       `1px solid ${vars['--slider-height'] === s.value ? 'var(--accent)' : 'var(--border)'}`,
                    color:        vars['--slider-height'] === s.value ? 'var(--accent)' : 'var(--text-dim)',
                    padding:      '6px 10px',
                    fontFamily:   'var(--font-mono)',
                    fontSize:     9, letterSpacing: 1,
                    cursor:       'pointer',
                    borderRadius: 'var(--btn-radius, 2px)',
                    textAlign:    'left',
                    transition:   'all .15s',
                    display:      'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span>{s.label}</span>
                  <span style={{
                    display: 'inline-block',
                    width: 64, height: s.value,
                    background: vars['--slider-height'] === s.value ? 'var(--accent)' : 'var(--border)',
                    borderRadius: 'var(--btn-radius, 2px)',
                    flexShrink: 0,
                  }} />
                </button>
              ))}
            </div>
          </CtrlSection>

          {/* Font family */}
          <CtrlSection title="FONT FAMILY">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {FONT_OPTIONS.map(f => (
                <ChipBtn
                  key={f.value}
                  active={vars['--font-mono'] === f.value}
                  accentColor="var(--accent)"
                  style={{ fontFamily: f.value, fontSize: 10 }}
                  onClick={() => setVar('--font-mono', f.value)}
                >
                  {f.label}
                </ChipBtn>
              ))}
            </div>
            <div style={{
              marginTop: 8, padding: '6px 8px',
              background: 'var(--bg-input)', border: '1px solid var(--border-faint)',
              fontSize: 10, color: 'var(--text-body)', fontFamily: vars['--font-mono'],
              letterSpacing: 0.5, lineHeight: 1.7,
            }}>
              ABCDEFabcdef 0123456789<br />
              0 O 1 l I | [] {'{ }'} → ← ↑ ↓ ← ◈ ★ ✦
            </div>
          </CtrlSection>

          </>)}

          {leftTab === 'colors' && (<>

          {/* Color groups */}
          {HEX_GROUPS.map(group => (
            <CtrlSection key={group.title} title={group.title}>
              {group.vars.map(({ name, label }) => (
                <ColorRow
                  key={name}
                  label={label}
                  value={vars[name] ?? '#000000'}
                  onChange={v => setVar(name, v)}
                />
              ))}
            </CtrlSection>
          ))}

          </>)}

        </div>

        {/* ──── Right panel — preview ──── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>

          {/* Buttons */}
          <PrevSection title="BUTTONS — ALL VARIANTS">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Btn>DEFAULT</Btn>
              <Btn color="var(--accent)">PRIMARY</Btn>
              <Btn color="var(--accent-green)" bg="var(--tint-success)">SUCCESS</Btn>
              <Btn color="var(--status-bad)" bg="var(--tint-danger)">DANGER</Btn>
              <Btn color="var(--accent-amber)" bg="#1a0a00">WARNING</Btn>
              <Btn color="var(--accent-cyan)">CYAN</Btn>
              <Btn color="var(--accent-red)">RED</Btn>
              <Btn small>SMALL</Btn>
              <Btn small color="var(--accent)">SMALL PRIMARY</Btn>
              <Btn small color="var(--accent-green)">SMALL GREEN</Btn>
              <Btn small color="var(--text-dim)">SMALL DIM</Btn>
              <Btn style={{ opacity: 0.35, cursor: 'not-allowed' }}>DISABLED</Btn>
              <span style={{ color: 'var(--border)', fontSize: 9, margin: '0 2px' }}>│</span>
              <IconBtn title="close">✕</IconBtn>
              <IconBtn title="add">+</IconBtn>
              <IconBtn title="remove">−</IconBtn>
              <IconBtn title="refresh">⟳</IconBtn>
              <IconBtn title="up">▲</IconBtn>
              <IconBtn title="down">▼</IconBtn>
              <IconBtn title="prev">◀</IconBtn>
              <IconBtn title="next">▶</IconBtn>
              <IconBtn title="zoom in">⊕</IconBtn>
              <IconBtn title="zoom out">⊘</IconBtn>
            </div>
          </PrevSection>

          {/* Chips */}
          <PrevSection title="CHIP SELECTORS — TAB / TOGGLE / FILTER">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['WARP', 'ORBIT', 'MANUAL', 'AUTOPILOT', 'PATROL'].map((label, i) => (
                <ChipBtn key={label} active={chipIdx === i}
                  accentColor="var(--accent)" onClick={() => setChipIdx(i)}>
                  {label}
                </ChipBtn>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {['MINERAL', 'GAS', 'ICE', 'ORE', 'DARK MATTER'].map((label, i) => (
                <ChipBtn key={label} active={i === 0}
                  accentColor="var(--accent-green)" activeBg="var(--tint-success)">
                  {label}
                </ChipBtn>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['ROUND 1', 'ROUND 2', 'ROUND 3', 'OVERTIME'].map((label, i) => (
                <ChipBtn key={label} active={i === 1}
                  accentColor="var(--accent-amber)" activeBg="#1a1000">
                  {label}
                </ChipBtn>
              ))}
            </div>
          </PrevSection>

          {/* Sliders */}
          <PrevSection title="SLIDERS — INTERACTIVE">
            <div style={{ maxWidth: 500 }}>
              <Slider label="POWER"     value={sliders.power}   onChange={v => setSliders(p => ({ ...p, power: v }))}   accent="var(--accent)"       />
              <Slider label="SHIELDS"   value={sliders.shields} onChange={v => setSliders(p => ({ ...p, shields: v }))} accent="var(--accent-cyan)"   />
              <Slider label="WEAPONS"   value={sliders.weapons} onChange={v => setSliders(p => ({ ...p, weapons: v }))} accent="var(--accent-amber)"  />
              <Slider label="ENGINES"   value={sliders.engines} onChange={v => setSliders(p => ({ ...p, engines: v }))} accent="var(--accent-green)"  />
              <Slider label="THRESHOLD" value={35} onChange={() => {}} accent="var(--accent-red)" unit="°C" labelWidth={72} />
            </div>
          </PrevSection>

          {/* Status row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <PrevSection title="STATUS BARS — SYSTEM HEALTH" style={{ flex: 1 }}>
              {[
                { label: 'HULL',         pct: 87, s: 'good' },
                { label: 'REACTOR',      pct: 52, s: 'warn' },
                { label: 'SHIELDS',      pct: 23, s: 'bad'  },
                { label: 'LIFE SUPPORT', pct: 95, s: 'good' },
                { label: 'WARP DRIVE',   pct: 0,  s: 'bad'  },
              ].map(({ label, pct, s }) => (
                <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', width: 86, flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg-label)', overflow: 'hidden', borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: `var(--status-${s})` }} />
                  </div>
                  <span style={{ fontSize: 9, color: `var(--status-${s})`, width: 30, textAlign: 'right' }}>{pct}%</span>
                </div>
              ))}
            </PrevSection>

            <PrevSection title="STATUS INDICATORS" style={{ width: 180 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { label: '● NOMINAL',  color: 'var(--status-good)'   },
                  { label: '◆ CAUTION',  color: 'var(--status-warn)'   },
                  { label: '▲ WARNING',  color: 'var(--status-bad)'    },
                  { label: '✦ CRITICAL', color: 'var(--status-danger)' },
                  { label: '○ OFFLINE',  color: 'var(--text-dim)'      },
                  { label: '◌ STANDBY',  color: 'var(--text-muted)'    },
                ].map(({ label, color }) => (
                  <span key={label} style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</span>
                ))}
              </div>
            </PrevSection>

            <PrevSection title="ACCENT SWATCHES" style={{ width: 200 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'PRIMARY', v: '--accent'       },
                  { label: 'GREEN',   v: '--accent-green' },
                  { label: 'AMBER',   v: '--accent-amber' },
                  { label: 'RED',     v: '--accent-red'   },
                  { label: 'CYAN',    v: '--accent-cyan'  },
                ].map(({ label, v }) => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 48, height: 14, flexShrink: 0,
                      background: `var(${v})`,
                      borderRadius: 'var(--btn-radius, 2px)',
                    }} />
                    <span style={{ fontSize: 9, color: `var(${v})`, letterSpacing: 1 }}>{label}</span>
                  </div>
                ))}
              </div>
            </PrevSection>
          </div>

          {/* Typography */}
          <PrevSection title="TYPOGRAPHY — FULL TEXT HIERARCHY">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { size: 20, color: 'var(--text-bright)',    ls: 4,   text: '★ TEAM STAR CREW' },
                { size: 14, color: 'var(--text-primary)',   ls: 3,   text: 'CONSOLE HEADING — TACTICAL' },
                { size: 11, color: 'var(--text-body)',      ls: 2,   text: 'Normal body text — station data readout' },
                { size: 10, color: 'var(--text-secondary)', ls: 1.5, text: 'Secondary label • system status info • 342 GW available' },
                { size: 9,  color: 'var(--text-muted)',     ls: 1,   text: 'MUTED — SECTION LABEL / CATEGORY HEADER' },
                { size: 8,  color: 'var(--text-dim)',       ls: 0.5, text: 'dim: 0.87 AU  |  3842 km  |  ∆v 1200 m/s  |  ETA 4m 22s  |  warp 4.2' },
                { size: 8,  color: 'var(--text-ghost)',     ls: 0.5, text: 'ghost: — — — — — — — — — — — — — — — — — placeholder / empty state' },
              ].map(({ size, color, ls, text }) => (
                <div key={text} style={{ fontSize: size, color, letterSpacing: ls, fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  {text}
                </div>
              ))}
            </div>
          </PrevSection>

          {/* Live mock panel */}
          <PrevSection title="LIVE PANEL MOCK — TACTICAL (FULLY INTERACTIVE)">
            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: 10 }}>
              {/* Mock header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--border-faint)',
              }}>
                <span style={{ fontSize: 11, color: 'var(--accent-red)', letterSpacing: 2 }}>◈ TACTICAL</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {['WEAPONS', 'MISSILES', 'POWER'].map((t, i) => (
                    <ChipBtn key={t} active={mockTab === i}
                      accentColor="var(--accent-red)" activeBg="var(--tint-danger)"
                      onClick={() => setMockTab(i)}>
                      {t}
                    </ChipBtn>
                  ))}
                </div>
              </div>

              {/* Mock body */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: 1 }}>
                    SECTION INTEGRITY
                  </div>
                  {[
                    { label: 'BOW',       pct: 87, s: 'good' },
                    { label: 'PORT',      pct: 52, s: 'warn' },
                    { label: 'STARBOARD', pct: 94, s: 'good' },
                    { label: 'STERN',     pct: 31, s: 'bad'  },
                  ].map(({ label, pct, s }) => (
                    <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, height: 4, background: 'var(--bg-label)' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: `var(--status-${s})` }} />
                      </div>
                      <span style={{ fontSize: 9, width: 28, textAlign: 'right', color: `var(--status-${s})` }}>{pct}%</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                    <Btn small color="var(--accent-red)" bg="var(--tint-danger)">INSTALL OFFENSE</Btn>
                    <Btn small color="var(--text-dim)">ERASE</Btn>
                    <IconBtn>✕</IconBtn>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: 1 }}>FIRE CONTROL</div>
                  <Slider label="PWR %" value={mockPwr} min={0} max={100} onChange={setMockPwr} accent="var(--accent-red)" />
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Btn
                      color={mockLock ? 'var(--status-good)' : 'var(--accent-amber)'}
                      bg={mockLock ? 'var(--tint-success)' : 'transparent'}
                      onClick={() => setMockLock(l => !l)}
                    >
                      {mockLock ? '🔒 LOCKED ON' : 'LOCK TARGET'}
                    </Btn>
                    <Btn color="var(--status-bad)" bg="var(--tint-danger)">FIRE MISSILE</Btn>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>
                    STATUS:{' '}
                    {mockLock
                      ? <span style={{ color: 'var(--status-good)' }}>● TARGET ACQUIRED</span>
                      : <span style={{ color: 'var(--text-muted)' }}>○ NO LOCK</span>
                    }
                  </div>
                  <div style={{ marginTop: 4, fontSize: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>
                    PWR OUTPUT: <span style={{ color: 'var(--accent-red)' }}>{mockPwr.toFixed(0)} GW</span>
                  </div>
                </div>
              </div>
            </div>
          </PrevSection>

          {/* Spacer so content doesn't cram against bottom */}
          <div style={{ height: 12 }} />
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function CtrlSection({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)',
        marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-faint)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {children}
      </div>
    </div>
  )
}

function PrevSection({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      padding: '10px 12px', ...style,
    }}>
      <div style={{
        fontSize: 7, letterSpacing: 2, color: 'var(--text-dim)',
        marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-faint)',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  const hex = toHex(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }}>
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 26, height: 18, flexShrink: 0,
          border: '1px solid var(--border)', background: 'none',
          cursor: 'pointer', padding: 1,
          borderRadius: 'var(--btn-radius, 2px)',
        }}
      />
      <span style={{ fontSize: 8, color: 'var(--text-dim)', width: 68, flexShrink: 0, letterSpacing: 0.5 }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 14, background: hex,
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--btn-radius, 2px)',
      }} />
      <code style={{ fontSize: 8, color: 'var(--text-muted)', width: 52, textAlign: 'right', fontFamily: 'monospace' }}>
        {hex}
      </code>
    </div>
  )
}
