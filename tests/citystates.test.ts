import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/core/game';
import { gridOf } from '../src/core/context';
import { playerSettlements, playerUnits } from '../src/core/state';
import { FRIEND_FAVOR, SUZERAIN_FAVOR, canClaimTile, claimTileCost, processCityState, relationTo, suzerainOf } from '../src/core/systems/cityStates';
import { newTestGame } from './helpers';

const cityStates = (state: ReturnType<typeof newTestGame>) => state.players.filter((p) => p.kind === 'cityState');

describe('Stadtstaaten', () => {
  it('haben einen Typ und erhalten Aufträge', () => {
    const state = newTestGame();
    const cs = cityStates(state)[0];
    expect(cs.cityStateType).toBeDefined();
    processCityState(state, cs.id);
    expect(cs.quest?.amount).toBeGreaterThan(0);
  });

  it('Freund und Suzerän nach Gunst', () => {
    const state = newTestGame();
    const cs = cityStates(state)[0];
    cs.favor = { 0: FRIEND_FAVOR, 1: 1 };
    expect(relationTo(cs, 0)).toBe('friend');
    expect(suzerainOf(cs)).toBeNull();
    cs.favor[0] = SUZERAIN_FAVOR;
    expect(relationTo(cs, 0)).toBe('suzerain');
    cs.favor[1] = SUZERAIN_FAVOR;
    expect(suzerainOf(cs)).toBeNull(); // Gleichstand: kein Suzerän
  });

  it('Boni je Typ werden ausgezahlt', () => {
    const state = newTestGame();
    const cs = cityStates(state)[0];
    cs.cityStateType = 'trade';
    cs.favor = { 0: SUZERAIN_FAVOR };
    const gold = state.players[0].gold;
    processCityState(state, cs.id);
    expect(state.players[0].gold).toBe(gold + 5);
  });

  it('Auftrag erfüllen kostet Güter und bringt Gunst', () => {
    const state = newTestGame();
    const cs = cityStates(state)[0];
    processCityState(state, cs.id);
    const q = cs.quest!;
    expect(applyCommand(state, 0, { type: 'fulfillQuest', target: cs.id }).ok).toBe(state.players[0].stock[q.good]! >= q.amount);
    state.players[0].stock[q.good] = q.amount + 1;
    expect(applyCommand(state, 0, { type: 'fulfillQuest', target: cs.id }).ok).toBe(true);
    expect(cs.favor[0]).toBe(3);
    expect(state.players[0].stock[q.good]).toBe(1);
  });
});

describe('Feld beanspruchen', () => {
  it('kostet Einfluss und erweitert das Gebiet', () => {
    const state = newTestGame();
    const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
    applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
    const s = playerSettlements(state, 0)[0];
    const grid = gridOf(state);
    const tile = grid.ring(s.tile, 2).find((t) => state.tileOwner[t] === -1 && grid.neighbors(t).some((n) => state.tileOwner[n] === s.id))!;
    state.players[0].influence = 0;
    expect(canClaimTile(state, 0, tile)).toMatch(/Einfluss/);
    state.players[0].influence = 100;
    const cost = claimTileCost(state, 0, tile);
    expect(applyCommand(state, 0, { type: 'claimTile', tile }).ok).toBe(true);
    expect(state.tileOwner[tile]).toBe(s.id);
    expect(state.players[0].influence).toBe(100 - cost);
    const far = grid.ring(s.tile, 5).find((t) => state.tileOwner[t] === -1)!;
    expect(canClaimTile(state, 0, far)).toMatch(/weit|grenzen/);
  });
});
