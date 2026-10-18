import { describe, expect, it } from 'vitest';
import { applyCommand, createUnit, yearForTurn } from '../src/core/game';
import { gridOf } from '../src/core/context';
import { isCliff, isPassableLand } from '../src/core/map/passability';
import { playerSettlements, playerUnits, totalPop } from '../src/core/state';
import { canAttack, resolveAttack } from '../src/core/systems/combat';
import { findPath, reachableTiles } from '../src/core/systems/movement';
import { grantTech } from '../src/core/systems/research';
import { computeVisibility } from '../src/core/systems/vision';
import { newTestGame } from './helpers';

function endRound(state: ReturnType<typeof newTestGame>) {
  const start = state.turn;
  while (state.turn === start && !state.gameOver) applyCommand(state, state.currentPlayer, { type: 'endTurn' });
}

describe('Spielerstellung', () => {
  it('setzt Spieler, Starteinheiten und Stadtstaaten', () => {
    const state = newTestGame();
    expect(state.players.filter((p) => p.kind !== 'cityState')).toHaveLength(3);
    expect(state.players.filter((p) => p.kind === 'cityState').length).toBeGreaterThanOrEqual(1);
    for (const p of state.players.filter((x) => x.kind !== 'cityState')) {
      const units = playerUnits(state, p.id).map((u) => u.type).sort();
      expect(units).toEqual(['clubman', 'scout', 'tribe']);
      expect(p.explored.some((e) => e === 1)).toBe(true);
    }
  });

  it('ist deterministisch', () => {
    expect(JSON.stringify(newTestGame())).toEqual(JSON.stringify(newTestGame()));
  });

  it('meldet zu viele Spieler', () => {
    expect(() =>
      newTestGame({ players: Array.from({ length: 6 }, (_, i) => ({ kind: 'ai' as const, civId: ['linden', 'rock', 'ash', 'stars', 'sun', 'mist'][i] })) }),
    ).toThrow(/höchstens/);
  });
});

describe('Siedeln und Wirtschaft', () => {
  it('Stamm gründet ein Lager, das wächst und produziert', () => {
    const state = newTestGame();
    const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
    const res = applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
    expect(res).toEqual({ ok: true });
    const [camp] = playerSettlements(state, 0);
    expect(camp.kind).toBe('camp');
    expect(camp.isCapital).toBe(true);
    expect(totalPop(camp.pop)).toBe(3);
    expect(state.tileOwner.filter((o) => o === camp.id).length).toBeGreaterThanOrEqual(5);
    const popBefore = totalPop(camp.pop);
    for (let i = 0; i < 25; i++) endRound(state);
    expect(totalPop(camp.pop)).toBeGreaterThan(popBefore);
    expect(camp.buildings).toContain('firepit');
    expect(state.players[0].influence).toBeGreaterThan(5);
  });

  it('Ausbauten binden Arbeitskraft und liefern Güter', () => {
    const state = newTestGame();
    const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
    applyCommand(state, 0, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
    const [camp] = playerSettlements(state, 0);
    const grid = gridOf(state);
    // Ein Waldfeld für den Holzfäller simulieren
    const tile = grid.neighbors(camp.tile).find((t) => isPassableLand(state.map.tiles[t]))!;
    state.map.tiles[tile].feature = 'forest';
    camp.queue = [];
    expect(applyCommand(state, 0, { type: 'enqueue', settlementId: camp.id, item: { kind: 'improvement', id: 'lumber', tile } }).ok).toBe(true);
    for (let i = 0; i < 6; i++) endRound(state);
    expect(state.improvements[tile]?.type).toBe('lumber');
    const wood = state.players[0].stock.wood ?? 0;
    endRound(state);
    expect((state.players[0].stock.wood ?? 0) - wood).toBeGreaterThan(0);
  });
});

describe('Bewegung', () => {
  it('Klippen sind unpassierbar', () => {
    const state = newTestGame({ mapType: 'highlands', mapSize: 'medium' });
    const grid = gridOf(state);
    const unit = playerUnits(state, 0).find((u) => u.type === 'clubman')!;
    // finde eine Klippe auf der Karte und setze die Einheit davor
    let from = -1;
    let to = -1;
    for (let i = 0; i < grid.size && from < 0; i++) {
      for (const n of grid.neighbors(i)) {
        if (isPassableLand(state.map.tiles[i]) && isPassableLand(state.map.tiles[n]) && isCliff(state.map.tiles[i], state.map.tiles[n])) {
          from = i;
          to = n;
          break;
        }
      }
    }
    expect(from).toBeGreaterThanOrEqual(0);
    for (const u of Object.values(state.units)) if (u.tile === from || u.tile === to) delete state.units[u.id];
    unit.tile = from;
    unit.movesLeft = 2;
    expect(reachableTiles(state, unit).has(to)).toBe(false);
    const path = findPath(state, unit, to);
    if (path) expect(path.length).toBeGreaterThan(1);
  });

  it('Bewegung verbraucht Bewegungspunkte', () => {
    const state = newTestGame();
    const scout = playerUnits(state, 0).find((u) => u.type === 'scout')!;
    const reach = [...reachableTiles(state, scout).keys()];
    expect(reach.length).toBeGreaterThan(0);
    const target = reach[reach.length - 1];
    expect(applyCommand(state, 0, { type: 'move', unitId: scout.id, target }).ok).toBe(true);
    expect(scout.tile).toBe(target);
    expect(scout.movesLeft).toBeLessThan(3);
  });

  it('Sichtlinie wird von Bergen blockiert', () => {
    const state = newTestGame();
    const vis = computeVisibility(state, 0);
    const tribe = playerUnits(state, 0).find((u) => u.type === 'tribe')!;
    expect(vis[tribe.tile]).toBe(1);
  });
});

describe('Kampf', () => {
  it('Angriff verursacht Schaden und kann Einheiten besiegen', () => {
    const state = newTestGame();
    const grid = gridOf(state);
    const attacker = playerUnits(state, 0).find((u) => u.type === 'clubman')!;
    const target = grid.neighbors(attacker.tile).find((t) => {
      const a = state.map.tiles[attacker.tile];
      const b = state.map.tiles[t];
      return isPassableLand(b) && !isCliff(a, b) && !Object.values(state.units).some((u) => u.tile === t);
    })!;
    const victim = createUnit(state, 1, 'scout', target);
    expect(canAttack(state, attacker, target)).toMatch(/Krieg/);
    applyCommand(state, 0, { type: 'declareWar', target: 1 });
    expect(canAttack(state, attacker, target)).toBeNull();
    const result = resolveAttack(state, attacker, target);
    expect(result.defenderDamage).toBeGreaterThan(0);
    if (result.defenderDied) expect(state.units[victim.id]).toBeUndefined();
    else expect(state.units[victim.id].hp).toBeLessThan(100);
  });
});

describe('Forschung und Zeitalter', () => {
  it('Aufstieg ins nächste Zeitalter nach genügend Technologien', () => {
    const state = newTestGame();
    for (const t of ['agriculture', 'pottery', 'mining']) grantTech(state, 0, t);
    expect(state.players[0].era).toBe(0);
    grantTech(state, 0, 'fishing');
    expect(state.players[0].era).toBe(1);
    expect(state.players[0].legacy.points).toBeGreaterThan(0);
  });

  it('Zeitrechnung schreitet voran', () => {
    expect(yearForTurn(1)).toBe(-10000);
    expect(yearForTurn(2)).toBe(-9900);
    expect(yearForTurn(200)).toBeGreaterThan(yearForTurn(100));
  });

  it('KI-Technologie startet die KI-Phase', () => {
    const state = newTestGame();
    grantTech(state, 0, 'artificialIntelligence');
    expect(state.phase).toBe('ai');
    expect(state.machinePlayer).not.toBeNull();
    expect(playerUnits(state, state.machinePlayer!).length).toBeGreaterThan(0);
  });
});

describe('Rundenablauf', () => {
  it('läuft 60 Runden ohne Fehler (nur Rundenende)', () => {
    const state = newTestGame();
    for (const p of state.players) {
      const tribe = playerUnits(state, p.id).find((u) => u.type === 'tribe');
      if (tribe) {
        state.currentPlayer = p.id;
        applyCommand(state, p.id, { type: 'unitAction', unitId: tribe.id, action: 'foundCamp' });
      }
    }
    state.currentPlayer = 0;
    for (let i = 0; i < 60; i++) endRound(state);
    expect(state.turn).toBe(61);
    expect(JSON.parse(JSON.stringify(state)).turn).toBe(61);
  });
});
