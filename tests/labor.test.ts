import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/core/game';
import { gridOf } from '../src/core/context';
import { isPassableLand } from '../src/core/map/passability';
import { playerSettlements, playerUnits } from '../src/core/state';
import { refreshReports } from '../src/core/systems/economy';
import { newTestGame } from './helpers';

function setup() {
  const state = newTestGame();
  const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
  applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
  const s = playerSettlements(state, 0)[0];
  const tiles = gridOf(state).neighbors(s.tile).filter((t) => isPassableLand(state.map.tiles[t]));
  // zwei Ausbauten direkt setzen
  state.improvements[tiles[0]] = { type: 'gatherers', level: 1, settlement: s.id };
  state.map.tiles[tiles[1]].feature = 'forest';
  state.improvements[tiles[1]] = { type: 'lumber', level: 1, settlement: s.id };
  s.pop.workers = 4;
  refreshReports(state, 0);
  return { state, s, gather: `t${tiles[0]}`, lumber: `t${tiles[1]}` };
}

describe('Manuelle Arbeitskraft', () => {
  it('feste Besetzung hat Vorrang vor der Automatik', () => {
    const { state, s, gather, lumber } = setup();
    expect(applyCommand(state, 0, { type: 'setJob', settlementId: s.id, key: lumber, count: 2 }).ok).toBe(true);
    expect(s.report.jobs[lumber]).toBe(2);
    expect(applyCommand(state, 0, { type: 'setJob', settlementId: s.id, key: gather, count: 0 }).ok).toBe(true);
    expect(s.report.jobs[gather] ?? 0).toBe(0);
    // freie Arbeitskraft = gesamt - gebunden
    expect(s.report.laborFree).toBe(s.report.laborTotal - s.report.laborBound);
  });

  it('Auto stellt die automatische Verteilung wieder her', () => {
    const { state, s, lumber } = setup();
    applyCommand(state, 0, { type: 'setJob', settlementId: s.id, key: lumber, count: 0 });
    expect(s.report.jobs[lumber] ?? 0).toBe(0);
    applyCommand(state, 0, { type: 'setJob', settlementId: s.id, key: lumber, count: null });
    expect(s.jobOverrides?.[lumber]).toBeUndefined();
  });

  it('lehnt ungültige Werte ab', () => {
    const { state, s, lumber } = setup();
    expect(applyCommand(state, 0, { type: 'setJob', settlementId: s.id, key: lumber, count: -1 }).ok).toBe(false);
  });
});
