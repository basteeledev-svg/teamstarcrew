import { useState, useMemo } from 'react'

// ── Theme tokens ──────────────────────────────────────────────────────────────
const BG     = '#070714'
const CARD   = '#09091c'
const ACCENT = '#00ffcc'
const MUTED  = '#006655'
const LIST_W = 290

// ── CSS keyframe animations injected once ────────────────────────────────────
const KEYFRAMES = `
  @keyframes commsVideoPulse {
    0%, 100% { opacity: 0.7; }
    50%       { opacity: 1;   }
  }
  @keyframes commsScanBeam {
    0%   { top: -30%; }
    100% { top: 110%; }
  }
`

function fmtTick(tick) {
  const h = Math.floor(tick / 3600)
  const m = Math.floor((tick % 3600) / 60)
  const s = tick % 60
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Video placeholder screen ──────────────────────────────────────────────────
function VideoScreen({ color = '#4488ff' }) {
  const c = color
  return (
    <div style={{
      position: 'relative', width: '100%', overflow: 'hidden',
      background: '#000810', border: `1px solid ${c}44`,
      paddingBottom: '52%',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {/* Colour wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${c}18 0%, transparent 70%)`,
          animation: 'commsVideoPulse 4s ease-in-out infinite',
        }} />
        {/* Scanlines texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 4px)',
        }} />
        {/* Moving scan beam */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: '28%', pointerEvents: 'none',
          background: `linear-gradient(to bottom, transparent, ${c}0b, transparent)`,
          animation: 'commsScanBeam 6s linear infinite',
        }} />
        {/* Centre icon */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '10px', pointerEvents: 'none',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', border: `2px solid ${c}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'commsVideoPulse 2s ease-in-out infinite',
          }}>
            <div style={{ width: 9, height: 9, background: c, borderRadius: '50%', opacity: 0.65 }} />
          </div>
          <div style={{ fontSize: 7, letterSpacing: 4, color: `${c}88`, fontFamily: 'Courier New' }}>
            TRANSMISSION
          </div>
        </div>
        {/* Corner frames */}
        {[
          { top: 7, left:  7, borderTop: `1px solid ${c}33`, borderLeft:  `1px solid ${c}33` },
          { top: 7, right: 7, borderTop: `1px solid ${c}33`, borderRight: `1px solid ${c}33` },
          { bottom: 7, left:  7, borderBottom: `1px solid ${c}33`, borderLeft:  `1px solid ${c}33` },
          { bottom: 7, right: 7, borderBottom: `1px solid ${c}33`, borderRight: `1px solid ${c}33` },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 14, height: 14, ...s }} />
        ))}
      </div>
    </div>
  )
}

// ── Message list item ─────────────────────────────────────────────────────────
function MsgItem({ msg, selected, onClick }) {
  const isInbox = msg.direction === 'inbox'
  const unread  = isInbox && !msg.read
  return (
    <div onClick={onClick} style={{
      padding: '9px 12px', cursor: 'pointer',
      borderBottom: '1px solid #080818',
      background: selected ? '#0a1a1a' : 'transparent',
      borderLeft: `2px solid ${selected ? ACCENT : unread ? ACCENT + '55' : 'transparent'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{
          fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New',
          color: unread ? ACCENT : MUTED, fontWeight: unread ? 'bold' : 'normal',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%',
        }}>
          {isInbox ? msg.from_name : `→ ${msg.to_name}`}
        </span>
        {unread && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: 2 }} />
        )}
      </div>
      <div style={{
        fontSize: 10, color: selected ? ACCENT : '#8899aa',
        fontFamily: 'Courier New', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', marginBottom: 3,
      }}>
        {msg.subject}
      </div>
      <div style={{ fontSize: 8, color: '#2a3a3a', letterSpacing: 1, fontFamily: 'Courier New' }}>
        {fmtTick(msg.tick)}
      </div>
    </div>
  )
}

// ── Left message list ─────────────────────────────────────────────────────────
function MessageList({ msgs, selectedId, onSelect }) {
  if (msgs.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: MUTED, fontSize: 10, letterSpacing: 2, fontFamily: 'Courier New',
      }}>
        NO MESSAGES
      </div>
    )
  }
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {msgs.map(m => (
        <MsgItem key={m.id} msg={m} selected={selectedId === m.id} onClick={() => onSelect(m)} />
      ))}
    </div>
  )
}

// ── Contact browser (left panel when composing) ───────────────────────────────
function ContactItem({ contact, selected, onSelect, disabled }) {
  return (
    <div onClick={disabled ? undefined : onSelect} style={{
      padding: '8px 12px', cursor: disabled ? 'default' : 'pointer',
      borderBottom: '1px solid #070710', opacity: disabled ? 0.3 : 1,
      background: selected ? '#0a1a1a' : 'transparent',
      borderLeft: `2px solid ${selected ? ACCENT : contact.in_range ? contact.video_color + '66' : 'transparent'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: contact.in_range ? contact.video_color : '#334444',
        }} />
        <span style={{
          fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New',
          color: contact.in_range ? '#aabbcc' : '#334444',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {contact.name}
        </span>
      </div>
      <div style={{ fontSize: 8, color: '#334444', paddingLeft: 12, fontFamily: 'Courier New', letterSpacing: 1 }}>
        {contact.system_name}
        {contact.same_system ? ' · LOCAL' : ` · ${contact.distance_ly} LY`}
      </div>
    </div>
  )
}

function ContactBrowser({ contacts, selected, onSelect }) {
  const inRange  = contacts.filter(c => c.in_range)
  const outRange = contacts.filter(c => !c.in_range)
  const hdr = (label) => (
    <div style={{
      padding: '5px 12px', fontSize: 7, letterSpacing: 2, fontFamily: 'Courier New',
      color: label.startsWith('IN') ? '#00aa66' : '#334444', background: '#050512',
    }}>
      {label}
    </div>
  )
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{
        padding: '8px 12px', fontSize: 8, letterSpacing: 2, color: MUTED,
        fontFamily: 'Courier New', borderBottom: '1px solid #0a2a2a',
      }}>
        SELECT RECIPIENT
      </div>
      {inRange.length > 0 && (
        <>
          {hdr(`IN RANGE (${inRange.length})`)}
          {inRange.map(c => (
            <ContactItem key={c.id} contact={c} selected={selected === c.id}
              onSelect={() => onSelect(c.id)} />
          ))}
        </>
      )}
      {outRange.length > 0 && (
        <>
          {hdr(`OUT OF RANGE (${outRange.length})`)}
          {outRange.map(c => (
            <ContactItem key={c.id} contact={c} selected={false} onSelect={() => {}} disabled />
          ))}
        </>
      )}
      {contacts.length === 0 && (
        <div style={{
          padding: 24, color: MUTED, fontSize: 9, textAlign: 'center',
          letterSpacing: 2, fontFamily: 'Courier New',
        }}>
          NO CONTACTS
        </div>
      )}
    </div>
  )
}

// ── Message viewer (right panel) ──────────────────────────────────────────────
function MessageViewer({ msg, contact, onReply }) {
  const canReply = msg.direction === 'inbox' && (contact?.in_range ?? false)
  const vc = contact?.video_color ?? '#4488ff'

  const row = (label, value, valueColor) => (
    <>
      <span style={{ color: MUTED, fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New' }}>{label}</span>
      <span style={{ color: valueColor ?? '#aabbcc', fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </span>
    </>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {/* Header card */}
      <div style={{
        padding: '10px 14px', background: CARD, border: '1px solid #0a2a2a',
        marginBottom: 12, display: 'grid', gridTemplateColumns: 'auto 1fr',
        gap: '5px 14px', alignItems: 'start',
      }}>
        {row('FROM', msg.from_name)}
        {row('TO',   msg.to_name)}
        {row('SUBJ', msg.subject)}
        {row('TIME', fmtTick(msg.tick), MUTED)}
        {contact && row(
          'SYS',
          `${contact.system_name}${contact.same_system ? ' (LOCAL)' : ` / ${contact.distance_ly} LY`}`,
          MUTED,
        )}
      </div>

      {/* Video screen */}
      {msg.has_video && (
        <div style={{ marginBottom: 12 }}>
          <VideoScreen color={vc} />
          <div style={{ fontSize: 8, color: '#2a3a3a', letterSpacing: 1, fontFamily: 'Courier New', marginTop: 4, textAlign: 'right' }}>
            {contact?.in_range
              ? `◉ LIVE SIGNAL — ${contact.system_name}`
              : `◎ ARCHIVED TRANSMISSION — ${contact?.system_name ?? 'UNKNOWN'}`}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{
        padding: '12px 14px', background: CARD, border: '1px solid #0a2a2a',
        fontSize: 11, lineHeight: 1.8, color: '#aabbcc', whiteSpace: 'pre-wrap',
        fontFamily: 'Courier New', marginBottom: 12,
      }}>
        {msg.body}
      </div>

      {/* Reply button (inbox only) */}
      {msg.direction === 'inbox' && (
        <button onClick={onReply} disabled={!canReply} style={{
          background: canReply ? '#0a2a1a' : 'transparent',
          border: `1px solid ${canReply ? '#00aa66' : '#1a2a2a'}`,
          color: canReply ? '#00dd88' : '#2a3a3a',
          fontFamily: 'Courier New', fontSize: 9, letterSpacing: 2,
          padding: '7px 16px', cursor: canReply ? 'pointer' : 'not-allowed',
        }}>
          {canReply ? '◉ COMPOSE REPLY' : '✕ OUT OF RANGE — CANNOT REPLY'}
        </button>
      )}
    </div>
  )
}

// ── Compose view (right panel) ────────────────────────────────────────────────
function ComposeView({ contact, subject, body, onSubject, onBody, onTransmit, onCancel }) {
  const canSend = contact && subject.trim().length > 0 && body.trim().length > 0
  const vc = contact?.video_color ?? ACCENT

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Recipient preview */}
      {contact ? (
        <div style={{
          padding: '10px 14px', background: CARD,
          border: `1px solid ${vc}22`, display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: vc, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10, color: ACCENT, fontFamily: 'Courier New' }}>{contact.name}</div>
            <div style={{ fontSize: 8, color: MUTED, fontFamily: 'Courier New', marginTop: 2, letterSpacing: 1 }}>
              {contact.system_name}
              {contact.same_system ? ' · LOCAL' : ` · ${contact.distance_ly} LY away`}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '10px 14px', background: CARD, border: '1px solid #0a2a2a',
          fontSize: 9, color: MUTED, fontFamily: 'Courier New', letterSpacing: 1,
        }}>
          ← SELECT A RECIPIENT FROM THE LEFT PANEL
        </div>
      )}

      {/* Subject */}
      <div>
        <div style={{ fontSize: 8, letterSpacing: 2, color: MUTED, fontFamily: 'Courier New', marginBottom: 5 }}>SUBJECT</div>
        <input
          value={subject}
          onChange={e => onSubject(e.target.value)}
          maxLength={200}
          placeholder="Enter message subject..."
          style={{
            width: '100%', boxSizing: 'border-box', background: CARD,
            border: '1px solid #0a3a3a', color: ACCENT, fontFamily: 'Courier New',
            fontSize: 10, padding: '8px 10px', outline: 'none',
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: MUTED, fontFamily: 'Courier New', marginBottom: 5 }}>MESSAGE</div>
        <textarea
          value={body}
          onChange={e => onBody(e.target.value)}
          maxLength={2000}
          placeholder="Compose your transmission..."
          style={{
            flex: 1, minHeight: 160, boxSizing: 'border-box', background: CARD,
            border: '1px solid #0a3a3a', color: '#aabbcc', fontFamily: 'Courier New',
            fontSize: 10, padding: '8px 10px', outline: 'none', resize: 'vertical',
            lineHeight: 1.7,
          }}
        />
        <div style={{ fontSize: 8, color: '#223333', fontFamily: 'Courier New', textAlign: 'right', marginTop: 3 }}>
          {body.length}/2000
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button onClick={onCancel} style={{
          background: 'none', border: '1px solid #0a2a2a', color: MUTED,
          fontFamily: 'Courier New', fontSize: 9, letterSpacing: 2,
          padding: '8px 16px', cursor: 'pointer',
        }}>
          CANCEL
        </button>
        <button onClick={onTransmit} disabled={!canSend} style={{
          background: canSend ? '#0a2a1a' : CARD,
          border: `1px solid ${canSend ? '#00aa66' : '#0a2a2a'}`,
          color: canSend ? '#00dd88' : '#334444',
          fontFamily: 'Courier New', fontSize: 9, letterSpacing: 2,
          padding: '8px 18px', cursor: canSend ? 'pointer' : 'not-allowed',
        }}>
          ◉ TRANSMIT
        </button>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onCompose, unread, inRange }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: 32,
    }}>
      <div style={{ fontSize: 48, opacity: 0.07, color: ACCENT }}>◉</div>
      <div style={{ color: MUTED, fontSize: 10, letterSpacing: 3, fontFamily: 'Courier New' }}>
        SELECT A MESSAGE OR COMPOSE NEW
      </div>
      {unread > 0 && (
        <div style={{ color: ACCENT, fontSize: 10, letterSpacing: 2, fontFamily: 'Courier New' }}>
          {unread} UNREAD MESSAGE{unread > 1 ? 'S' : ''}
        </div>
      )}
      <div style={{ color: '#334444', fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New' }}>
        {inRange} CONTACT{inRange !== 1 ? 'S' : ''} IN RANGE
      </div>
      <button onClick={onCompose} style={{
        marginTop: 8, background: '#0a2a1a', border: '1px solid #00aa66',
        color: '#00dd88', fontFamily: 'Courier New', fontSize: 9,
        letterSpacing: 2, padding: '8px 20px', cursor: 'pointer',
      }}>
        + NEW MESSAGE
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function CommunicationsPanel({ gameState, sendCommand }) {
  const [tab,            setTab]            = useState('inbox')
  const [selectedMsg,    setSelectedMsg]    = useState(null)
  const [composeTo,      setComposeTo]      = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody,    setComposeBody]    = useState('')

  const comms    = gameState?.comms ?? {}
  const messages = comms.messages  ?? []
  const contacts = comms.contacts  ?? []
  const commsGw  = comms.comms_gw  ?? 0
  const rangeLy  = comms.range_ly  ?? 0

  const inbox  = useMemo(() => [...messages].filter(m => m.direction === 'inbox').sort((a, b) => b.tick - a.tick), [messages])
  const sent   = useMemo(() => [...messages].filter(m => m.direction === 'sent').sort((a, b) => b.tick - a.tick), [messages])
  const unread = useMemo(() => inbox.filter(m => !m.read).length, [inbox])
  const inRangeContacts = useMemo(() => contacts.filter(c => c.in_range), [contacts])

  function selectMsg(msg) {
    // Sync read status with server list; handle stale selectedMsg after tick
    const live = messages.find(m => m.id === msg.id) ?? msg
    setSelectedMsg(live)
    if (!live.read && live.direction === 'inbox') {
      sendCommand({ type: 'mark_read', message_id: live.id })
    }
  }

  function openCompose(toId = '', subject = '', body = '') {
    setTab('compose')
    setSelectedMsg(null)
    setComposeTo(toId)
    setComposeSubject(subject)
    setComposeBody(body)
  }

  function handleTransmit() {
    if (!composeTo || !composeSubject.trim() || !composeBody.trim()) return
    sendCommand({
      type: 'send_message',
      to_id: composeTo,
      subject: composeSubject.trim(),
      body: composeBody.trim(),
    })
    setTab('sent')
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
  }

  // Sync selectedMsg with live data from server on every render
  const liveSelectedMsg = selectedMsg
    ? (messages.find(m => m.id === selectedMsg.id) ?? selectedMsg)
    : null

  const listMsgs = tab === 'inbox' ? inbox : tab === 'sent' ? sent : []

  const contactFor = (msg) =>
    contacts.find(c => c.id === (msg.direction === 'inbox' ? msg.from_id : msg.to_id))

  const TABS = [
    ['inbox',   `INBOX${unread > 0 ? ` [${unread}]` : ''}`],
    ['sent',    'SENT'],
    ['compose', '+ NEW'],
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, color: ACCENT, overflow: 'hidden' }}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid #0a2a2a',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 3, fontFamily: 'Courier New', fontWeight: 'bold' }}>
          ◉ COMMUNICATIONS
        </span>
        <span style={{ color: MUTED, fontSize: 9, letterSpacing: 1, fontFamily: 'Courier New' }}>
          {commsGw.toFixed(0)} GW · RANGE {rangeLy.toFixed(1)} LY · {inRangeContacts.length} IN RANGE
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); if (t !== 'compose') setSelectedMsg(null) }} style={{
              background: tab === t ? '#0a2a2a' : 'none',
              border: `1px solid ${tab === t ? ACCENT : '#0a4a4a'}`,
              color: tab === t ? ACCENT : MUTED,
              fontFamily: 'Courier New', fontSize: 9, letterSpacing: 2,
              padding: '4px 10px', cursor: 'pointer',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left column */}
        <div style={{
          width: LIST_W, flexShrink: 0, borderRight: '1px solid #0a2a2a',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {tab === 'compose'
            ? <ContactBrowser contacts={contacts} selected={composeTo} onSelect={setComposeTo} />
            : <MessageList msgs={listMsgs} selectedId={liveSelectedMsg?.id} onSelect={selectMsg} />
          }
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'compose' ? (
            <ComposeView
              contact={contacts.find(c => c.id === composeTo)}
              subject={composeSubject}
              body={composeBody}
              onSubject={setComposeSubject}
              onBody={setComposeBody}
              onTransmit={handleTransmit}
              onCancel={() => setTab('inbox')}
            />
          ) : liveSelectedMsg ? (
            <MessageViewer
              msg={liveSelectedMsg}
              contact={contactFor(liveSelectedMsg)}
              onReply={() => {
                const c = contactFor(liveSelectedMsg)
                openCompose(c?.id ?? '', `Re: ${liveSelectedMsg.subject}`, '')
              }}
            />
          ) : (
            <EmptyState
              onCompose={() => openCompose()}
              unread={unread}
              inRange={inRangeContacts.length}
            />
          )}
        </div>
      </div>
    </div>
  )
}
