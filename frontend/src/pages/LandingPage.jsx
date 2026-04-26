import { Btn } from '../components/ui'

const W = 1280
const H = 800

export default function LandingPage({ gameState, onNewGame, onJoin, onObserver, onAdmin, onStyle }) {
  const isRunning = gameState?.status === 'running'
  const tick = gameState?.tick ?? 0
  const playerCount = gameState?.player_count ?? null
  const systemName = gameState?.current_system?.name ?? '—'
  const hull = gameState?.ship?.hull_health
  const fuel = gameState?.ship?.fuel

  return (
    <div style={{
      width: W, height: H, background: 'var(--bg-base)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-mono)', color: 'var(--text-body)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'baseline', gap: '24px',
      }}>
        <span style={{ fontSize: '24px', letterSpacing: '6px', color: 'var(--text-primary)' }}>
          ★ TEAM STAR CREW
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)', letterSpacing: '2px' }}>
          MISSION CONTROL
        </span>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28,
      }}>
        {/* Game status block */}
        <div style={{
          minWidth: 540,
          border: `1px solid ${isRunning ? 'var(--accent-green)' : 'var(--border)'}`,
          background: isRunning ? 'var(--tint-success)' : 'var(--bg-card)',
          padding: '24px 32px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{
              fontSize: 13, letterSpacing: 3,
              color: isRunning ? 'var(--accent-green)' : 'var(--text-muted)',
            }}>
              {isRunning ? '● GAME IN PROGRESS' : '○ NO GAME RUNNING'}
            </span>
            {isRunning && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2, marginLeft: 'auto' }}>
                TICK {tick}
              </span>
            )}
          </div>

          {isRunning && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20,
              fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2,
            }}>
              <Stat label="CREW SIZE" value={playerCount ? `${playerCount} PLAYERS` : '—'} />
              <Stat label="SYSTEM" value={systemName} />
              <Stat label="HULL" value={typeof hull === 'number' ? `${hull.toFixed(0)}%` : '—'} />
              <Stat label="FUEL" value={typeof fuel === 'number' ? Math.round(fuel).toLocaleString() : '—'} />
            </div>
          )}

          {!isRunning && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1.5, lineHeight: 1.5 }}>
              No active game. Start a new mission to generate a galaxy and assign crew stations.
            </div>
          )}
        </div>

        {/* Primary actions */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {isRunning && (
            <Btn
              data-testid="join-btn"
              onClick={onJoin}
              color="var(--accent-green)" bg="var(--tint-success)"
              style={{ padding: '14px 32px', fontSize: 14, letterSpacing: 3 }}
            >
              JOIN CURRENT GAME →
            </Btn>
          )}
          <Btn
            data-testid="new-game-btn"
            onClick={onNewGame}
            color="var(--accent)" bg="var(--tint-accent)"
            style={{ padding: '14px 32px', fontSize: 14, letterSpacing: 3 }}
          >
            ✦ {isRunning ? 'START NEW GAME' : 'START NEW GAME →'}
          </Btn>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 32px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
      }}>
        <Btn onClick={onStyle} color="var(--accent-cyan)" borderColor="var(--border)"
             style={{ padding: '6px 14px', letterSpacing: 2, fontSize: 10 }}>
          ✦ STYLE LAB
        </Btn>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <Btn onClick={onObserver} color="var(--text-muted)" borderColor="var(--text-dim)"
             style={{ padding: '6px 14px', letterSpacing: 2, fontSize: 10 }}>
          OBSERVER
        </Btn>
        <Btn data-testid="admin-btn" onClick={onAdmin}
             color="var(--text-muted)" borderColor="var(--text-dim)"
             style={{ padding: '6px 14px', letterSpacing: 2, fontSize: 10 }}>
          ADMIN
        </Btn>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: 2 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', letterSpacing: 1 }}>{value}</span>
    </div>
  )
}
