import { useMemo, useState } from 'react'
import '../hud/hud.css'

const W = 1280
const H = 800

export default function OnePlayerPage({ gameState, sendCommand, lastError, lastAck, connected = true, onExit }) {
  const ship = gameState?.ship
  const system = gameState?.current_system
  const planets = system?.planets ?? []

  const [selectedPlanetId, setSelectedPlanetId] = useState(null)

  const selectedPlanet = useMemo(
    () => planets.find((p) => p.id === selectedPlanetId) ?? null,
    [planets, selectedPlanetId]
  )

  const generationTarget = useMemo(() => {
    const constants = gameState?.constants ?? {}
    const fuelMax    = constants.FUEL_GENERATOR_MAX_TW    ?? 100
    const nuclearMax = constants.NUCLEAR_REACTOR_MAX_TW   ?? 400
    const count      = constants.REACTOR_COUNT ?? 4
    return (fuelMax * 2) + (nuclearMax * 2)   // 2 fuel gens + 2 nuclear
  }, [gameState?.constants])

  if (!ship || !system) {
    return (
      <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--hud-txd)', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>WAITING FOR GAME STATE...</div>
      </div>
    )
  }

  const fuel = Math.round(ship.rooms?.reactor_room?.fuel ?? 0)
  const radioactive = Math.round(ship.rooms?.reactor_room?.radioactive ?? 0)
  const metals = Math.round(ship.rooms?.cargo_bay?.metals ?? 0)
  const rareEarth = Math.round(ship.rooms?.cargo_bay?.rare_earth ?? 0)
  const hydrocarbons = Math.round(ship.rooms?.cargo_bay?.hydrocarbons ?? 0)
  const battery = `${Math.round(ship.battery_energy_tw ?? 0)} / ${Math.round(ship.battery_capacity_tw ?? 0)} TW`

  return (
    <div className="hud-wrap" style={{ width: W, height: H, display: 'flex', flexDirection: 'column' }}>
      <div className="hud-top">
        <span className="hud-logo">★ ONE-PLAYER COCKPIT</span>
        <span className={`hud-pip${connected ? '' : ' offline'}`} />
        <span className="hud-tag">SYSTEM <b>{system.name}</b></span>
        <span className="hud-tag">TICK <b>{gameState?.tick ?? '—'}</b></span>
        <span className="hud-tag">HULL <b>{Math.round(ship.hull_health ?? 0)}%</b></span>
        <span className="hud-tag">THRUST <b>{Math.round((ship.thrust ?? 0) * 100)}%</b></span>
        <span className="hud-sp" />
        <button className="hud-exit" onClick={onExit}>✕ EXIT</button>
      </div>

      <div className="hud-content" style={{ gap: 10, padding: 10 }}>
        <Panel title="SHIP CONTROLS" style={{ flex: 1 }}>
          <ControlRow label="Generation Target (TW)">
            <input
              type="range"
              min={0}
              max={generationTarget}
              step={10}
              value={Math.round(ship.effective_power_tw ?? 0)}
              onChange={(e) => sendCommand({ type: 'set_generation_target_gw', value: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <Value>{Math.round(ship.effective_power_tw ?? 0)} / {generationTarget}</Value>
          </ControlRow>

          <ControlRow label="Thrust">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round((ship.thrust ?? 0) * 100)}
              onChange={(e) => sendCommand({ type: 'set_thrust', value: Number(e.target.value) / 100 })}
              style={{ width: '100%' }}
            />
            <Value>{Math.round((ship.thrust ?? 0) * 100)}%</Value>
          </ControlRow>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="hbtn hbtn-sm" onClick={() => sendCommand({ type: 'scan' })}>SCAN</button>
            <button className="hbtn hbtn-sm amb" onClick={() => sendCommand({ type: 'stop' })}>STOP</button>
            <button className="hbtn hbtn-sm" onClick={() => sendCommand({ type: 'leave_orbit' })}>LEAVE ORBIT</button>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--hud-txd)', fontFamily: 'var(--font-mono)' }}>
            <div>Auto-Repair: {ship.auto_repair_enabled ? 'ON' : 'OFF'} (materials available: {Math.round(ship.repair_material_available ?? 0)})</div>
            <div>Engine Thrust Output: {(ship.engine_thrust_au ?? 0).toFixed(4)} AU/tick</div>
          </div>
        </Panel>

        <Panel title="PLANETS" style={{ flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
            {planets.map((planet) => (
              <button
                key={planet.id}
                onClick={() => setSelectedPlanetId(planet.id)}
                className="hud-chip"
                style={{
                  textAlign: 'left',
                  height: 64,
                  justifyContent: 'flex-start',
                  borderColor: selectedPlanetId === planet.id ? 'var(--hud-c)' : 'rgba(0,229,255,0.25)',
                  background: selectedPlanetId === planet.id ? 'rgba(0,229,255,0.12)' : 'rgba(0,229,255,0.03)',
                }}
              >
                {planet.name} ({planet.type})
              </button>
            ))}
          </div>

          {selectedPlanet && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--hud-tx)', fontFamily: 'var(--font-mono)' }}>
              <div>Selected: {selectedPlanet.name}</div>
              <div>Resources M/R/Rad/HC: {Math.round(selectedPlanet.metals)} / {Math.round(selectedPlanet.rare_earth)} / {Math.round(selectedPlanet.radioactive)} / {Math.round(selectedPlanet.hydrocarbons)}</div>
              <div>Hostility: {Math.round(selectedPlanet.total_hostility ?? 0)}%</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="hbtn hbtn-sm" onClick={() => sendCommand({ type: 'orbit', planet_id: selectedPlanet.id })}>ORBIT</button>
                <button className="hbtn hbtn-sm" onClick={() => sendCommand({ type: 'interact_planet', action: 'survey' })}>SURVEY</button>
                <button className="hbtn hbtn-sm grn" onClick={() => sendCommand({ type: 'interact_planet', action: 'extract_basic' })}>EXTRACT</button>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="RESOURCES + FEEDBACK" style={{ flex: 1 }}>
          <Stat label="Power Fuel" value={fuel.toLocaleString()} />
          <Stat label="Radioactive" value={radioactive.toLocaleString()} />
          <Stat label="Battery" value={battery} />
          <Stat label="Cargo Metals" value={metals.toLocaleString()} />
          <Stat label="Cargo Rare Earth" value={rareEarth.toLocaleString()} />
          <Stat label="Cargo Hydrocarbons" value={hydrocarbons.toLocaleString()} />

          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(0,229,255,0.2)', fontFamily: 'var(--font-mono)' }}>
            <div style={{ color: 'var(--hud-txd)', marginBottom: 4 }}>LAST ACK</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--hud-tx)' }}>
              {lastAck ? JSON.stringify(lastAck, null, 2) : 'No acknowledgement yet.'}
            </pre>
          </div>

          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>
            <div style={{ color: 'var(--hud-cr)', marginBottom: 4 }}>LAST ERROR</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, color: 'var(--hud-cr)' }}>
              {lastError ? JSON.stringify(lastError, null, 2) : 'No errors.'}
            </pre>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, children, style }) {
  return (
    <div className="po" style={style}>
      <span className="corn tl" /><span className="corn tr" />
      <span className="corn bl" /><span className="corn br" />
      <div className="hud-panel" style={{ padding: 10 }}>
        <div className="phdr" style={{ marginBottom: 8 }}>
          <span className="ptitle">{title}</span>
        </div>
        <div style={{ overflowY: 'auto', height: 'calc(100% - 34px)' }}>{children}</div>
      </div>
    </div>
  )
}

function ControlRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--hud-txd)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <span style={{ color: 'var(--hud-txd)' }}>{label}</span>
      <span style={{ color: 'var(--hud-tx)' }}>{value}</span>
    </div>
  )
}

function Value({ children }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--hud-tx)', marginTop: 4 }}>{children}</div>
}
