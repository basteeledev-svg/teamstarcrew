import { useState, useMemo } from 'react'
import './keyframes.css'
import s from './CommunicationsPanel.module.css'

// ── Theme tokens ────────────────────────────────────────────────────────────────────
const CARD   = 'var(--bg-input)'
const ACCENT = '#00ffcc'
const MUTED  = '#006655'

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
    <div className={s.videoScreen} style={{ border: `1px solid ${c}44` }}>
      <div className={s.videoInner}>
        {/* Colour wash */}
        <div className={s.videoWash} style={{
          background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${c}18 0%, transparent 70%)`,
        }} />
        {/* Scanlines texture */}
        <div className={s.scanlines} />
        {/* Moving scan beam */}
        <div className={s.scanBeam} style={{
          background: `linear-gradient(to bottom, transparent, ${c}0b, transparent)`,
        }} />
        {/* Centre icon */}
        <div className={s.centerIcon}>
          <div className={s.iconCircle} style={{ border: `2px solid ${c}55` }}>
            <div className={s.iconDot} style={{ background: c }} />
          </div>
          <div className={s.transmissionLabel} style={{ color: `${c}88` }}>
            TRANSMISSION
          </div>
        </div>
        {/* Corner frames */}
        {[
          { top: 7, left:  7, borderTop: `1px solid ${c}33`, borderLeft:  `1px solid ${c}33` },
          { top: 7, right: 7, borderTop: `1px solid ${c}33`, borderRight: `1px solid ${c}33` },
          { bottom: 7, left:  7, borderBottom: `1px solid ${c}33`, borderLeft:  `1px solid ${c}33` },
          { bottom: 7, right: 7, borderBottom: `1px solid ${c}33`, borderRight: `1px solid ${c}33` },
        ].map((cs, i) => (
          <div key={i} className={s.cornerFrame} style={cs} />
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
    <div onClick={onClick} className={s.msgItem} style={{
      background: selected ? 'var(--bg-raised)' : 'transparent',
      borderLeft: `2px solid ${selected ? ACCENT : unread ? ACCENT + '55' : 'transparent'}`,
    }}>
      <div className={s.msgItemHeader}>
        <span className={s.msgItemName}>
          {isInbox ? msg.from_name : `→ ${msg.to_name}`}
        </span>
        {unread && (
          <div className={s.unreadDot} />
        )}
      </div>
      <div className={s.msgItemSubject} style={{
        color: selected ? ACCENT : 'var(--text-body)',
      }}>
        {msg.subject}
      </div>
      <div className={s.msgItemTime}>
      </div>
    </div>
  )
}

// ── Left message list ─────────────────────────────────────────────────────────
function MessageList({ msgs, selectedId, onSelect }) {
  if (msgs.length === 0) {
    return (
      <div className={s.emptyList}>
        NO MESSAGES
      </div>
    )
  }
  return (
    <div className={s.msgScroll}>
      {msgs.map(m => (
        <MsgItem key={m.id} msg={m} selected={selectedId === m.id} onClick={() => onSelect(m)} />
      ))}
    </div>
  )
}

// ── Contact browser (left panel when composing) ───────────────────────────────
function ContactItem({ contact, selected, onSelect, disabled }) {
  return (
    <div onClick={disabled ? undefined : onSelect} className={s.contactItem} style={{
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
      background: selected ? 'var(--bg-raised)' : 'transparent',
      borderLeft: `2px solid ${selected ? ACCENT : contact.in_range ? contact.video_color + '66' : 'transparent'}`,
    }}>
      <div className={s.contactInfo}>
        <div className={s.contactDot} style={{
          background: contact.in_range ? contact.video_color : 'var(--text-dim)',
        }} />
        <span className={s.contactName} style={{
          color: contact.in_range ? 'var(--text-primary)' : 'var(--text-dim)',
        }}>
          {contact.name}
        </span>
      </div>
      <div className={s.contactSystem}>
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
    <div className={s.sectionHeader} style={{
      color: label.startsWith('IN') ? '#00aa66' : 'var(--text-dim)',
    }}>
      {label}
    </div>
  )
  return (
    <div className={s.contactBrowserScroll}>
      <div className={s.contactBrowserHeader}>
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
        <div className={s.noContacts}>
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
      <span className={s.rowLabel}>{label}</span>
      <span className={s.rowValue} style={{ color: valueColor ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </>
  )

  return (
    <div className={s.viewerWrap}>
      {/* Header card */}
      <div className={s.viewerHeaderCard}>
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
        <div className={s.videoMargin}>
          <VideoScreen color={vc} />
          <div className={s.videoCaption}>
            {contact?.in_range
              ? `◉ LIVE SIGNAL — ${contact.system_name}`
              : `◎ ARCHIVED TRANSMISSION — ${contact?.system_name ?? 'UNKNOWN'}`}
          </div>
        </div>
      )}

      {/* Body */}
      <div className={s.viewerBody}>
        {msg.body}
      </div>

      {/* Reply button (inbox only) */}
      {msg.direction === 'inbox' && (
        <button onClick={onReply} disabled={!canReply} className={s.replyBtn} style={{
          background: canReply ? '#0a2a1a' : 'transparent',
          border: `1px solid ${canReply ? '#00aa66' : 'var(--border)'}`,
          color: canReply ? '#00dd88' : 'var(--text-ghost)',
          cursor: canReply ? 'pointer' : 'not-allowed',
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
    <div className={s.composeWrap}>
      {/* Recipient preview */}
      {contact ? (
        <div className={s.recipientCard} style={{ border: `1px solid ${vc}22` }}>
          <div className={s.recipientDot} style={{ background: vc }} />
          <div>
            <div className={s.recipientName}>{contact.name}</div>
            <div className={s.recipientSystem}>
              {contact.system_name}
              {contact.same_system ? ' · LOCAL' : ` · ${contact.distance_ly} LY away`}
            </div>
          </div>
        </div>
      ) : (
        <div className={s.noRecipient}>
          ← SELECT A RECIPIENT FROM THE LEFT PANEL
        </div>
      )}

      {/* Subject */}
      <div>
        <div className={s.fieldLabel}>SUBJECT</div>
        <input
          value={subject}
          onChange={e => onSubject(e.target.value)}
          maxLength={200}
          placeholder="Enter message subject..."
          className={s.subjectInput}
        />
      </div>

      {/* Body */}
      <div className={s.bodyField}>
        <div className={s.fieldLabel}>MESSAGE</div>
        <textarea
          value={body}
          onChange={e => onBody(e.target.value)}
          maxLength={2000}
          placeholder="Compose your transmission..."
          className={s.bodyTextarea}
        />
        <div className={s.charCount}>
          {body.length}/2000
        </div>
      </div>

      {/* Actions */}
      <div className={s.composeActions}>
        <button onClick={onCancel} className={s.cancelBtn}>
          CANCEL
        </button>
        <button onClick={onTransmit} disabled={!canSend} className={s.transmitBtn} style={{
          background: canSend ? '#0a2a1a' : CARD,
          border: `1px solid ${canSend ? '#00aa66' : '#0a2a2a'}`,
          color: canSend ? '#00dd88' : 'var(--text-dim)',
          cursor: canSend ? 'pointer' : 'not-allowed',
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
    <div className={s.emptyState}>
      <div className={s.emptyIcon}>◉</div>
      <div className={s.emptyText}>
        SELECT A MESSAGE OR COMPOSE NEW
      </div>
      {unread > 0 && (
        <div className={s.unreadText}>
          {unread} UNREAD MESSAGE{unread > 1 ? 'S' : ''}
        </div>
      )}
      <div className={s.inRangeText}>
        {inRange} CONTACT{inRange !== 1 ? 'S' : ''} IN RANGE
      </div>
      <button onClick={onCompose} className={s.newMsgBtn}>
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
    <div className={s.container}>


      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={s.header}>
        <span className={s.headerTitle}>
          ◉ COMMUNICATIONS
        </span>
        <span className={s.headerStatus}>
          {commsGw.toFixed(0)} GW · RANGE {rangeLy.toFixed(1)} LY · {inRangeContacts.length} IN RANGE
        </span>
        <div className={s.headerTabs}>
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); if (t !== 'compose') setSelectedMsg(null) }} className={s.tabBtn} style={{
              background: tab === t ? '#0a2a2a' : 'none',
              border: `1px solid ${tab === t ? ACCENT : '#0a4a4a'}`,
              color: tab === t ? ACCENT : MUTED,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className={s.body}>

        {/* Left column */}
        <div className={s.leftColumn}>
          {tab === 'compose'
            ? <ContactBrowser contacts={contacts} selected={composeTo} onSelect={setComposeTo} />
            : <MessageList msgs={listMsgs} selectedId={liveSelectedMsg?.id} onSelect={selectMsg} />
          }
        </div>

        {/* Right column */}
        <div className={s.rightColumn}>
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
