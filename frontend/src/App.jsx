import { useState, useEffect } from 'react'
import { useGameSocket } from './api/useGameSocket.js'
import { BASE_PATH }     from './api/paths.js'
import LandingPage        from './pages/LandingPage.jsx'
import NewGamePage        from './pages/NewGamePage.jsx'
import ConsoleSelectPage  from './pages/ConsoleSelectPage.jsx'
import GamePage           from './pages/GamePage.jsx'
import AdminPage          from './pages/AdminPage.jsx'
import ObserverPage       from './pages/ObserverPage.jsx'
import OnePlayerPage      from './pages/OnePlayerPage.jsx'
import StationSetupPage   from './pages/StationSetupPage.jsx'
import StationJoinPage    from './pages/StationJoinPage.jsx'

// Detect a 4-digit join code in the URL path (e.g. /1234 or /sim/1234)
function _detectCode() {
  const suffix = window.location.pathname.slice(BASE_PATH.length).replace(/^\//, '')
  return /^\d{4}$/.test(suffix) ? suffix : null
}

// App content is authored at 1280×800; a CSS scale fills any screen without reflowing.
export default function App() {
  const { gameState, connected, sendCommand, lastError, lastAck } = useGameSocket()
  // page: 'landing' | 'newGame' | 'select' | 'game' | 'solo' | 'admin' | 'observer' | 'setup' | 'join'
  const [urlCode]               = useState(_detectCode)
  const [page, setPage]         = useState(() => _detectCode() ? 'join' : 'landing')
  const [consoles, setConsoles] = useState([])
  const [stationName, setStationName] = useState(null)
  const [scale, setScale]       = useState(() => Math.min(window.innerWidth / 1280, window.innerHeight / 800))

  useEffect(() => {
    function onResize() { setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 800)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function handleEnter({ role, consoles: selected, stationName: name }) {
    if (role === 'admin') {
      setPage('admin')
    } else if (role === 'observer') {
      setPage('observer')
    } else {
      setConsoles(selected)
      setStationName(name ?? null)
      setPage('game')
    }
  }

  function handleJoin() {
    if (gameState?.status !== 'running') return
    if (gameState?.player_count === 1) {
      setPage('solo')
      return
    }
    setPage('select')
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <div style={{
      width: 1280, height: 800,
      transform: `scale(${scale})`,
      transformOrigin: 'center center',
      overflow: 'hidden',
      position: 'relative',
      background: 'var(--bg-base)',
      flexShrink: 0,
    }}>
      {/* Connection indicator — only on non-HUD pages (HUD pages have their own pip) */}
      {page !== 'game' && (
        <div style={{
          position: 'absolute', top: 6,
          right: (page === 'select' || page === 'landing' || page === 'newGame' || page === 'setup' || page === 'join') ? 16 : 70,
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
        />
      )}
      {page === 'newGame' && (
        <NewGamePage
          onCancel={() => setPage('landing')}
          onStarted={(data) => setPage(data?.player_count === 1 ? 'solo' : 'setup')}
        />
      )}
      {page === 'select' && (
        <ConsoleSelectPage
          gameState={gameState}
          onEnter={handleEnter}
          onNewGame={() => setPage('newGame')}
        />
      )}
      {page === 'game' && (

        <GamePage
          consoles={consoles}
          gameState={gameState}
          sendCommand={sendCommand}
          lastError={lastError}
          lastAck={lastAck}
          connected={connected}
          stationName={stationName}
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
      {page === 'setup' && (
        <StationSetupPage
          onBack={() => setPage('landing')}
          onAdmin={() => setPage('admin')}
        />
      )}
      {page === 'join' && (
        <StationJoinPage
          code={urlCode}
          gameState={gameState}
          onEnter={handleEnter}
        />
      )}
      {page === 'solo' && (
        <OnePlayerPage
          gameState={gameState}
          sendCommand={sendCommand}
          lastError={lastError}
          lastAck={lastAck}
          connected={connected}
          onExit={() => setPage('landing')}
        />
      )}
    </div>
    </div>
  )
}

