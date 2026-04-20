import { useState, useEffect, useCallback, useRef } from 'react'

const _proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${_proto}//${window.location.host}/ws`
const RECONNECT_MS = 2000

export function useGameSocket() {
  const [gameState, setGameState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [lastAck, setLastAck] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      clearTimeout(reconnectTimer.current)
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, RECONNECT_MS)
    }

    ws.onerror = () => ws.close()

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'state') setGameState(data)
        else if (data.type === 'error') setLastError(data)
        else if (data.type === 'ack') setLastAck(data)
      } catch (_) { /* ignore malformed messages */ }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendCommand = useCallback((cmd) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd))
    }
  }, [])

  return { gameState, connected, sendCommand, lastError, lastAck }
}
