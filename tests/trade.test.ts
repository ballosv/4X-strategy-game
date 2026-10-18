import { describe, expect, it } from 'vitest';
import '../src/ai';
import { applyCommand, createUnit } from '../src/core/game';
import { gridOf } from '../src/core/context';
import { isPassableLand } from '../src/core/map/passability';
import { playerSettlements, playerUnits } from '../src/core/state';
import { grantTech } from '../src/core/systems/research';
import { foundSettlement } from '../src/core/systems/settlements';
import { hasAgreement, routesOf, tradeIncome } from '../src/core/systems/trade';
import { newTestGame } from './helpers';

function setup() {
  const state = newTestGame({ mapSize: 'medium', seed: 'trade' });
  const grid = gridOf(state);
  const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
  applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
  const capital = playerSettlements(state, 0)[0];
  const far = grid.ring(capital.tile, 5).find((t) => isPassableLand(state.map.tiles[t]) && state.tileOwner[t] === -1)!;
  const second = foundSettlement(state, 0, far, 'settlement', 3);
  grantTech(state, 0, 'currency');
  return { state, grid, capital, second };
}

describe('Handel', () => {
  it('Händler richtet eine Binnenroute ein und erzeugt Gold', () => {
    const { state, second } = setup();
    const merchant = createUnit(state, 0, 'merchant', second.tile);
    const before = tradeIncome(state, 0).gold;
    expect(applyCommand(state, 0, { type: 'establishTrade', unitId: merchant.id, settlementId: second.id }).ok).toBe(true);
    expect(routesOf(state, 0)).toHaveLength(1);
    expect(state.units[merchant.id]).toBeUndefined();
    expect(tradeIncome(state, 0).gold).toBeGreaterThan(before);
  });

  it('fremde Ziele erfordern ein Handelsabkommen, Krieg beendet Route und Abkommen', () => {
    const { state, grid, capital } = setup();
    const target = grid.ring(capital.tile, 8).find((t) => isPassableLand(state.map.tiles[t]) && state.tileOwner[t] === -1)!;
    const foreign = foundSettlement(state, 1, target, 'settlement', 3);
    const stand = grid.neighbors(foreign.tile).find((t) => isPassableLand(state.map.tiles[t]))!;
    const merchant = createUnit(state, 0, 'merchant', stand);
    expect(applyCommand(state, 0, { type: 'establishTrade', unitId: merchant.id, settlementId: foreign.id }).error).toMatch(/Handelsabkommen/);
    expect(applyCommand(state, 0, { type: 'proposeAgreement', target: 1 }).ok).toBe(true);
    expect(hasAgreement(state, 0, 1)).toBe(true);
    expect(applyCommand(state, 0, { type: 'establishTrade', unitId: merchant.id, settlementId: foreign.id }).ok).toBe(true);
    expect(tradeIncome(state, 1).gold).toBeGreaterThan(0);
    applyCommand(state, 0, { type: 'declareWar', target: 1 });
    expect(hasAgreement(state, 0, 1)).toBe(false);
    expect(routesOf(state, 0)).toHaveLength(0);
  });

  it('Computergegner lehnen Abkommen mit ihrem Kriegsziel ab', () => {
    const { state } = setup();
    state.aiMemory = { 1: { prepare: { target: 0, since: 1 }, peaceUntil: {} } as never };
    expect(applyCommand(state, 0, { type: 'proposeAgreement', target: 1 }).ok).toBe(false);
  });
});
