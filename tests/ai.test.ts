import { describe, expect, it } from 'vitest';
import { AiView, runAiTurn, runAiTurnDetailed, type AiTurnReport } from '../src/ai';
import { MAX_FAILED_COMMANDS } from '../src/ai/context';
import { gridOf } from '../src/core/context';
import { applyCommand, createGame, createUnit, findSpawnTile } from '../src/core/game';
import { isPassableLand } from '../src/core/map/passability';
import type { MapSize, MapType } from '../src/core/map/types';
import { playerSettlements, playerUnits, totalPop, type Difficulty, type GameState } from '../src/core/state';
import { grantTech } from '../src/core/systems/research';
import { computeVisibility } from '../src/core/systems/vision';
import { testSettings } from './helpers';

const CIVS = ['linden', 'rock', 'ash', 'stars', 'sun', 'mist'];

function aiGame(seed: string, mapSize: MapSize = 'small', players = 3, difficulty: Difficulty = 'normal', mapType: MapType = 'pangaea'): GameState {
  return createGame(
    testSettings({
      seed,
      mapSize,
      mapType,
      difficulty,
      players: CIVS.slice(0, players).map((civId) => ({ kind: 'ai' as const, civId })),
    }),
  );
}

interface RunStats {
  turns: number;
  commands: number;
  failed: number;
  maxFailedInTurn: number;
  failures: Record<string, number>;
}

/** Lässt die KI für den jeweils aktuellen Spieler ziehen, bis die Rundenzahl erreicht ist. */
function play(state: GameState, rounds: number): RunStats {
  const stats: RunStats = { turns: 0, commands: 0, failed: 0, maxFailedInTurn: 0, failures: {} };
  const lastRound = state.turn + rounds;
  let guard = 0;
  while (state.turn < lastRound && !state.gameOver) {
    const before = `${state.turn}/${state.currentPlayer}`;
    const report: AiTurnReport = runAiTurnDetailed(state, state.currentPlayer);
    stats.turns++;
    stats.commands += report.commands;
    stats.failed += report.failed;
    stats.maxFailedInTurn = Math.max(stats.maxFailedInTurn, report.failed);
    for (const f of report.failures) stats.failures[f] = (stats.failures[f] ?? 0) + 1;
    // Jeder KI-Zug muss den Zug beenden
    if (!state.gameOver) expect(`${state.turn}/${state.currentPlayer}`).not.toBe(before);
    if (++guard > rounds * state.players.length + 10) throw new Error('Endlosschleife');
  }
  return stats;
}

describe('Computergegner: komplette KI-Partien', () => {
  const cases: { seed: string; size: MapSize; players: number; difficulty: Difficulty; mapType: MapType }[] = [
    { seed: 'ki-klein-1', size: 'small', players: 3, difficulty: 'normal', mapType: 'pangaea' },
    { seed: 'ki-klein-2', size: 'small', players: 3, difficulty: 'easy', mapType: 'continents' },
    { seed: 'ki-mittel-1', size: 'medium', players: 4, difficulty: 'normal', mapType: 'pangaea' },
    { seed: 'ki-mittel-2', size: 'medium', players: 4, difficulty: 'hard', mapType: 'inlandSea' },
  ];

  for (const c of cases) {
    it(`spielt 120 Runden (${c.size}, ${c.mapType}, ${c.difficulty}, Seed ${c.seed})`, () => {
      const state = aiGame(c.seed, c.size, c.players, c.difficulty, c.mapType);
      const startPop = 3;
      const stats = play(state, 120);
      expect(state.turn).toBeGreaterThanOrEqual(121);

      // Kaum fehlgeschlagene Befehle, nie eine Fehlerschleife innerhalb eines Zuges
      expect(stats.maxFailedInTurn).toBeLessThan(MAX_FAILED_COMMANDS / 4);
      expect(stats.failed / stats.turns).toBeLessThan(0.5);
      expect(stats.failed / Math.max(1, stats.commands)).toBeLessThan(0.05);

      const majors = state.players.filter((p) => p.kind === 'ai' && p.alive);
      expect(majors.length).toBeGreaterThan(0);
      for (const p of majors) {
        const settlements = playerSettlements(state, p.id);
        const pop = settlements.reduce((a, s) => a + totalPop(s.pop), 0);
        const improvements = Object.values(state.improvements).filter((i) => state.settlements[i.settlement]?.owner === p.id).length;
        expect(settlements.length, `${p.name}: Siedlungen`).toBeGreaterThanOrEqual(2);
        expect(pop, `${p.name}: Bevölkerung`).toBeGreaterThan(startPop * settlements.length);
        expect(p.techs.length, `${p.name}: Technologien`).toBeGreaterThanOrEqual(5);
        expect(improvements, `${p.name}: Ausbauten`).toBeGreaterThan(0);
        expect(p.gold, `${p.name}: Gold`).toBeGreaterThanOrEqual(0);
      }
      // Spielstand bleibt serialisierbar (inkl. KI-Gedächtnis)
      const json = JSON.parse(JSON.stringify(state)) as GameState;
      expect(json.aiMemory).toBeDefined();
    }, 60_000);
  }
});

describe('Computergegner: Nebel des Krieges', () => {
  it('die KI-Sicht zeigt keine Einheiten auf nicht sichtbaren Feldern', () => {
    const state = aiGame('nebel');
    const grid = gridOf(state);
    const vis = computeVisibility(state, 0);
    const own = playerUnits(state, 0)[0];
    // fernes, nicht sichtbares Landfeld und ein sichtbares, freies Landfeld
    let hidden = -1;
    let bestD = -1;
    for (let i = 0; i < grid.size; i++) {
      if (vis[i] || !isPassableLand(state.map.tiles[i]) || Object.values(state.units).some((u) => u.tile === i)) continue;
      const d = grid.distance(i, own.tile);
      if (d > bestD) {
        bestD = d;
        hidden = i;
      }
    }
    const shown = findSpawnTile(state, 1, own.tile, 'clubman');
    expect(hidden).toBeGreaterThanOrEqual(0);
    expect(vis[shown]).toBe(1);
    const spy = createUnit(state, 1, 'clubman', hidden);
    const neighbour = createUnit(state, 2, 'clubman', shown);

    const view = new AiView(state, 0);
    const seen = view.visibleForeignUnits();
    expect(seen.some((u) => u.id === spy.id)).toBe(false);
    expect(seen.some((u) => u.id === neighbour.id)).toBe(true);
    for (const u of seen) expect(view.isVisible(u.tile)).toBe(true);
    // Nicht erkundetes Gelände ist unbekannt
    expect(view.knownTile(hidden)).toBeNull();
    // Fremde Siedlungen nur, wenn gesehen
    for (const k of view.knownForeignSettlements()) expect(view.isVisible(k.tile)).toBe(true);
  });

  it('Entscheidungen hängen nicht von unsichtbaren Einheiten ab', () => {
    const base = aiGame('nebel-2');
    play(base, 5);
    while (base.currentPlayer !== 0) runAiTurn(base, base.currentPlayer);
    const a = JSON.parse(JSON.stringify(base)) as GameState;
    const b = JSON.parse(JSON.stringify(base)) as GameState;
    // In b steht eine fremde Armee weit entfernt im Nebel
    const grid = gridOf(b);
    const vis = computeVisibility(b, 0);
    const home = playerUnits(b, 0)[0].tile;
    const far = [...Array(grid.size).keys()]
      .filter((i) => !vis[i] && isPassableLand(b.map.tiles[i]) && !Object.values(b.units).some((u) => u.tile === i) && grid.distance(i, home) > 10)
      .sort((x, y) => grid.distance(y, home) - grid.distance(x, home))
      .slice(0, 4);
    b.players[0].relations[1] = 'war';
    b.players[1].relations[0] = 'war';
    a.players[0].relations[1] = 'war';
    a.players[1].relations[0] = 'war';
    for (const t of far) createUnit(b, 1, 'clubman', t);
    a.nextId = b.nextId;
    runAiTurn(a, 0);
    runAiTurn(b, 0);
    const summary = (s: GameState) =>
      JSON.stringify({
        units: playerUnits(s, 0).map((u) => [u.id, u.type, u.tile, u.status]),
        settlements: playerSettlements(s, 0).map((x) => [x.id, x.queue, x.focus, x.pop]),
        research: s.players[0].research.current,
      });
    expect(summary(b)).toEqual(summary(a));
  });
});

describe('Computergegner: Determinismus', () => {
  it('gleicher Seed ergibt nach 30 Runden denselben Spielstand', () => {
    const a = aiGame('determinismus', 'small', 3);
    const b = aiGame('determinismus', 'small', 3);
    play(a, 30);
    play(b, 30);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('handelt nur, wenn der Spieler am Zug ist', () => {
    const state = aiGame('nicht-am-zug');
    const before = JSON.stringify(state);
    const report = runAiTurnDetailed(state, 1);
    expect(report.commands).toBe(0);
    expect(JSON.stringify(state)).toEqual(before);
  });
});

describe('Computergegner: Kampf', () => {
  it('greift im Krieg sichtbare, schwache Ziele an und nimmt eine ungeschützte Siedlung ein', () => {
    const state = aiGame('belagerung', 'small', 3);
    play(state, 3);
    while (state.currentPlayer !== 0) runAiTurn(state, state.currentPlayer);
    const grid = gridOf(state);
    const victim = playerSettlements(state, 1)[0];
    expect(victim).toBeDefined();
    // Garnison des Opfers entfernen, eigene Armee daneben aufstellen
    for (const u of playerUnits(state, 1)) if (grid.distance(u.tile, victim.tile) <= 2) delete state.units[u.id];
    const free = grid
      .range(victim.tile, 2)
      .filter((t) => t !== victim.tile && isPassableLand(state.map.tiles[t]) && Math.abs(state.map.tiles[t].elevation - state.map.tiles[victim.tile].elevation) < 2 && !Object.values(state.units).some((u) => u.tile === t));
    const types = ['archer', 'archer', 'spearman', 'spearman', 'archer'];
    for (let i = 0; i < types.length && i < free.length; i++) createUnit(state, 0, types[i], free[i]);
    applyCommand(state, 0, { type: 'declareWar', target: 1 });
    const kills = state.players[0].stats.unitsKilled;
    for (let i = 0; i < 8 && state.settlements[victim.id].owner === 1; i++) {
      runAiTurn(state, 0);
      while (state.currentPlayer !== 0 && !state.gameOver) runAiTurn(state, state.currentPlayer);
    }
    const s = state.settlements[victim.id];
    expect(s.owner === 0 || s.hp < 100 || state.players[0].stats.unitsKilled > kills).toBe(true);
    expect(s.owner).toBe(0);
  }, 30_000);
});

describe('Computergegner: Stadtstaaten und die Maschine', () => {
  it('Stadtstaaten verteidigen sich und die Maschine greift an', () => {
    const state = aiGame('maschine', 'small', 3);
    play(state, 25);
    while (state.currentPlayer !== 0) runAiTurn(state, state.currentPlayer);
    grantTech(state, 0, 'artificialIntelligence');
    const machine = state.machinePlayer!;
    expect(machine).not.toBeNull();
    const startTiles = playerUnits(state, machine).map((u) => u.tile).join(',');
    play(state, 15);
    const cityStates = state.players.filter((p) => p.kind === 'cityState' && p.alive);
    for (const cs of cityStates) {
      for (const u of playerUnits(state, cs.id)) {
        const home = playerSettlements(state, cs.id)[0];
        if (home) expect(gridOf(state).distance(u.tile, home.tile)).toBeLessThanOrEqual(2);
      }
    }
    const endTiles = playerUnits(state, machine).map((u) => u.tile).join(',');
    expect(endTiles).not.toEqual(startTiles);
  }, 30_000);
});

describe('Computergegner: Leistung', () => {
  it('ein KI-Zug auf einer großen Karte mit ~40 Einheiten bleibt schnell', () => {
    const state = aiGame('leistung', 'large', 6);
    play(state, 30);
    while (state.currentPlayer !== 0) runAiTurn(state, state.currentPlayer);
    const home = playerSettlements(state, 0)[0];
    expect(home).toBeDefined();
    const types = ['clubman', 'slinger', 'scout'];
    for (let i = 0; playerUnits(state, 0).length < 40 && i < 200; i++) {
      const center = playerSettlements(state, 0)[i % playerSettlements(state, 0).length].tile;
      const type = types[i % types.length];
      const tile = findSpawnTile(state, 0, center, type);
      if (tile >= 0) createUnit(state, 0, type, tile);
      else {
        // weiter entfernt platzieren
        const grid = gridOf(state);
        const free = grid.range(center, 6).find((t) => isPassableLand(state.map.tiles[t]) && !Object.values(state.units).some((u) => u.tile === t));
        if (free !== undefined) createUnit(state, 0, type, free);
      }
    }
    expect(playerUnits(state, 0).length).toBeGreaterThanOrEqual(35);
    // Krieg mit einem Nachbarn, dessen Einheiten in Sichtweite stehen (Angriffsbewertung wird teuer)
    state.players[0].relations[1] = 'war';
    state.players[1].relations[0] = 'war';
    for (const s of playerSettlements(state, 0)) {
      for (let k = 0; k < 2; k++) {
        const grid = gridOf(state);
        const free = grid.ring(s.tile, 3).find((t) => isPassableLand(state.map.tiles[t]) && !Object.values(state.units).some((u) => u.tile === t) && !Object.values(state.settlements).some((x) => x.tile === t));
        if (free !== undefined) createUnit(state, 1, k ? 'slinger' : 'clubman', free);
      }
    }
    const t0 = performance.now();
    runAiTurn(state, 0);
    const ms = performance.now() - t0;
    // Ziel: < 300 ms; großzügige Schwelle für langsame CI-Rechner
    expect(ms).toBeLessThan(1500);
  }, 60_000);
});
