import { useState } from 'react'
import { useGameSocket } from './api/useGameSocket.js'
import ConsoleSelectPage from './pages/ConsoleSelectPage.jsx'
import GamePage          from './pages/GamePage.jsx'
import AdminPage         from './pages/AdminPage.jsx'
import ObserverPage      from './pages/ObserverPage.jsx'

// Samsung Galaxy Tab S9 11" landscape: 1280 × 800 CSS px
// The outer div pins the viewport to exactly those dimensions.
export default function App() {
  const { gameState, connected, sendCommand } = useGameSocket()
  // page: 'select' | 'game' | 'admin' | 'observer'
  const [page, setPage]       = useState('select')
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

  return (
    <div style={{
      width: 1280, height: 800,
      overflow: 'hidden',
      position: 'relative',
      background: '#050510',
    }}>
      {/* Connection indicator — top-right corner, always visible */}
      <div style={{
        position: 'absolute', top: 6, right: page === 'select' ? 16 : 70,
        fontSize: '9px', color: connected ? '#00cc66' : '#cc3300',
        fontFamily: 'Courier New', zIndex: 100, pointerEvents: 'none',
        letterSpacing: '1px',
      }}>
        {connected ? '● LIVE' : '○ OFFLINE'}
      </div>

      {page === 'select' && (
        <ConsoleSelectPage onEnter={handleEnter} />
      )}
      {page === 'game' && (
        <GamePage
          consoles={consoles}
          gameState={gameState}
          sendCommand={sendCommand}
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

