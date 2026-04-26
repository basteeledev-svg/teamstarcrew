import { useState } from 'react'
import { useGameSocket } from './api/useGameSocket.js'
import LandingPage       from './pages/LandingPage.jsx'
import NewGamePage       from './pages/NewGamePage.jsx'
import ConsoleSelectPage from './pages/ConsoleSelectPage.jsx'
import GamePage          from './pages/GamePage.jsx'
import AdminPage         from './pages/AdminPage.jsx'
import ObserverPage      from './pages/ObserverPage.jsx'
import StyleLabPage      from './pages/StyleLabPage.jsx'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
// The outer div pins the viewport to exactly those dimensions.
export default function App() {
  const { gameState, connected, sendCommand, lastError, lastAck } = useGameSocket()
  // page: 'landing' | 'newGame' | 'select' | 'game' | 'admin' | 'observer' | 'styleLab'
  const [page, setPage]         = useState('landing')
  const [consoles, setConsoles] = useState([])

  function handleEnter({ role, consoles: selected }) {
    if (role === 'admin') {
      setPage('admin')
    } else if (role === 'observer') {
      setPage('observer')
    } else {
      setConsoles(selected)
      setPage('game')
    }
  }

  function handleJoin() {
    if (gameState?.status === 'running') setPage('select')
  }

  return (
    <div style={{
      width: 1280, height: 800,
      overflow: 'hidden',
      position: 'relative',
      background: 'var(--bg-base)',
    }}>
      {/* Connection indicator — only on non-HUD pages (HUD pages have their own pip) */}
      {page !== 'game' && (
        <div style={{
          position: 'absolute', top: 6,
          right: (page === 'select' || page === 'landing' || page === 'newGame') ? 16 : 70,
          fontSize: '9px', color: connected ? 'var(--accent-green)' : 'var(--accent-red)',
          fontFamily: 'var(--font-mono)', zIndex: 100, pointerEvents: 'none',
          letterSpacing: '1px',
        }}>
          {connected ? '● LIVE' : '○ OFFLINE'}
        </div>
      )}

      {page === 'landing' && (
        <LandingPage
          gameState={gameState}
          onNewGame={() => setPage('newGame')}
          onJoin={handleJoin}
          onObserver={() => setPage('observer')}
          onAdmin={() => setPage('admin')}
          onStyle={() => setPage('styleLab')}
        />
      )}
      {page === 'newGame' && (
        <NewGamePage
          onCancel={() => setPage('landing')}
          onStarted={() => setPage('select')}
        />
      )}
      {page === 'select' && (
        <ConsoleSelectPage
          gameState={gameState}
          onEnter={handleEnter}
          onNewGame={() => setPage('newGame')}
          onStyle={() => setPage('styleLab')}
        />
      )}
      {page === 'styleLab' && (
        <StyleLabPage onBack={() => setPage('landing')} />
      )}
      {page === 'game' && (
        <GamePage
          consoles={consoles}
          gameState={gameState}
          sendCommand={sendCommand}
          lastError={lastError}
          lastAck={lastAck}
          connected={connected}
          onExit={() => setPage('select')}
        />
      )}
      {page === 'admin' && (
        <AdminPage
          gameState={gameState}
          sendCommand={sendCommand}
          onExit={() => setPage('select')}
          onObserver={() => setPage('observer')}
        />
      )}
      {page === 'observer' && (
        <ObserverPage
          gameState={gameState}
          sendCommand={sendCommand}
          onExit={() => setPage('admin')}
        />
      )}
    </div>
  )
}

