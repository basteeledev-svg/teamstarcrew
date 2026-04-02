"""Main game loop — runs as a background asyncio task."""
import asyncio

from .constants import TICK_RATE_SECONDS
from .state import game_state, manager


async def tick_loop() -> None:
    """Runs forever at TICK_RATE_SECONDS intervals.
    Each tick: advance ship, broadcast state to all WebSocket clients."""
    while True:
        await asyncio.sleep(TICK_RATE_SECONDS)
        if game_state.running and game_state.is_started():
            game_state.tick += 1

            # Advance planet orbits in current system first
            current = game_state.galaxy.get_system(game_state.ship.current_system_id)
            if current:
                for planet in current.planets:
                    planet.orbit_tick()

            # Pass the orbited planet's fresh position so the ship tracks it
            ship = game_state.ship
            planet_center = None
            if ship.orbiting_planet_id and current:
                op = current.get_planet(ship.orbiting_planet_id)
                if op:
                    planet_center = op.position

            ship.update_engines()            # compute thrust, consume fuel/power, update warp capacitor
            ship.update_tick(planet_center=planet_center)
            ship.update_reactor_heat()
            ship.consume_reactor_fuel()  # deduct fuel/rad from Power Room, shut off starved reactors
            ship.update_gw_locks()   # recalculate GW-locked station percentages
            ship.update_battery()

            # Mark system visited on arrival
            if current and not current.visited:
                current.visited = True

            # Mining: if orbiting with any bots deployed, accumulate resources
            if ship.orbiting_planet_id and any(v > 0 for v in ship.mining_bots.values()) and current:
                planet = current.get_planet(ship.orbiting_planet_id)
                if planet:
                    planet.mine_tick(ship.mining_bots)

            await manager.broadcast(game_state.to_dict())
