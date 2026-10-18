import { describe, expect, it } from 'vitest';
import { applyCommand, createUnit } from '../src/core/game';
import { gridOf } from '../src/core/context';
import { isCliff, isPassableLand } from '../src/core/map/passability';
import { migrateState } from '../src/core/migrate';
import { playerSettlements, playerUnits } from '../src/core/state';
import { foundSettlement } from '../src/core/systems/settlements';
import { grantTech } from '../src/core/systems/research';
import { terrainStepCost } from '../src/core/systems/movement';
import { unitType } from '../src/core/data/units';
import { computeConnections, nextAutoRoadTile, transportCapacityWith } from '../src/core/systems/transport';
import { newTestGame } from './helpers';

function endRound(state: ReturnType<typeof newTestGame>) {
  const start = state.turn;
  while (state.turn === start && !state.gameOver) applyCommand(state, state.currentPlayer, { type: 'endTurn' });
}

/** Zwei eigene Siedlungen mit begehbarem Weg dazwischen. */
function twoSettlements() {
  const state = newTestGame({ mapType: 'pangaea', mapSize: 'medium', seed: 'roads' });
  const grid = gridOf(state);
  const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
  applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
  const capital = playerSettlements(state, 0)[0];
  // zweite Siedlung 4 Felder entfernt auf erreichbarem Land
  const target = grid.ring(capital.tile, 4).find((t) => isPassableLand(state.map.tiles[t]) && state.tileOwner[t] === -1)!;
  const second = foundSettlement(state, 0, target, 'settlement', 3);
  return { state, grid, capital, second };
}

describe('Transportnetz', () => {
  it('Straßen beschleunigen die Bewegung', () => {
    const state = newTestGame();
    const grid = gridOf(state);
    const def = unitType('clubman');
    let a = -1;
    let b = -1;
    for (let i = 0; i < grid.size && a < 0; i++) {
      for (const n of grid.neighbors(i)) {
        if (isPassableLand(state.map.tiles[i]) && isPassableLand(state.map.tiles[n]) && !isCliff(state.map.tiles[i], state.map.tiles[n])) {
          a = i;
          b = n;
          break;
        }
      }
    }
    const before = terrainStepCost(state, 0, def, a, b);
    state.roads = { [a]: 1, [b]: 1 };
    expect(terrainStepCost(state, 0, def, a, b)).toBe(0.5);
    state.roads = { [a]: 2, [b]: 2 };
    expect(terrainStepCost(state, 0, def, a, b)).toBe(0.25);
    expect(before).toBeGreaterThanOrEqual(1);
  });

  it('Anbindung per Straße erhöht die Transportkapazität', () => {
    const { state, capital, second } = twoSettlements();
    expect(computeConnections(state, 0).get(second.id)).toBe('none');
    expect(computeConnections(state, 0).get(capital.id)).toBe('capital');
    // Straße entlang eines Weges legen
    const worker = createUnit(state, 0, 'worker', capital.tile);
    let guard = 0;
    state.roads = {};
    while (nextAutoRoadTile(state, worker) >= 0 && guard++ < 40) state.roads[nextAutoRoadTile(state, worker)] = 1;
    expect(computeConnections(state, 0).get(second.id)).toBe('road');
    expect(transportCapacityWith(state, second, 'road', 6)).toBeGreaterThan(transportCapacityWith(state, second, 'none', 6));
  });

  it('Arbeiter bauen automatisch Straßen bis zur Anbindung', () => {
    const { state, capital, second } = twoSettlements();
    grantTech(state, 0, 'wheel');
    state.players[0].stock.stone = 50;
    const worker = createUnit(state, 0, 'worker', capital.tile);
    expect(applyCommand(state, 0, { type: 'unitAction', unitId: worker.id, action: 'autoRoad' }).ok).toBe(true);
    for (let i = 0; i < 40 && computeConnections(state, 0).get(second.id) !== 'road'; i++) endRound(state);
    expect(computeConnections(state, 0).get(second.id)).toBe('road');
    expect(Object.keys(state.roads ?? {}).length).toBeGreaterThan(0);
    expect(state.players[0].stock.stone).toBeLessThan(50);
  });

  it('Straßenbau braucht Technologie und Material', () => {
    const { state, capital } = twoSettlements();
    const grid = gridOf(state);
    const tile = grid.neighbors(capital.tile).find((t) => isPassableLand(state.map.tiles[t]))!;
    const worker = createUnit(state, 0, 'worker', tile);
    expect(applyCommand(state, 0, { type: 'unitAction', unitId: worker.id, action: 'buildRoad' }).ok).toBe(false);
    grantTech(state, 0, 'wheel');
    state.players[0].stock.stone = 0;
    expect(applyCommand(state, 0, { type: 'unitAction', unitId: worker.id, action: 'buildRoad' }).error).toMatch(/Material/);
    state.players[0].stock.stone = 1;
    expect(applyCommand(state, 0, { type: 'unitAction', unitId: worker.id, action: 'buildRoad' }).ok).toBe(true);
    endRound(state);
    endRound(state);
    expect(state.roads?.[tile]).toBe(1);
  });

  it('migriert Spielstände von v0.1', () => {
    const state = newTestGame();
    const old = JSON.parse(JSON.stringify(state));
    old.version = 1;
    delete old.roads;
    const s = Object.values(old.settlements)[0] as { buildings: string[] };
    s.buildings.push('road');
    const migrated = migrateState(old)!;
    expect(migrated.version).toBe(2);
    expect(migrated.roads).toEqual({});
    expect((Object.values(migrated.settlements)[0] as { buildings: string[] }).buildings).not.toContain('road');
  });
});
