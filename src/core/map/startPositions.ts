import { RESOURCES, TERRAIN } from '../data/terrain';
import type { HexGrid } from '../hex';
import type { Rng } from '../rng';
import { isPassableLand, isWater, landComponents } from './passability';
import type { GameMap } from './types';

export interface StartPositionResult {
  positions: number[];
  /** Kleinster Abstand zwischen zwei Startpositionen. */
  minDistance: number;
  ok: boolean;
  message?: string;
}

/** Bewertet die Eignung eines Feldes als Startposition (Umgebung im Radius 2). */
export function startScore(map: GameMap, grid: HexGrid, index: number): number {
  const t = map.tiles[index];
  if (!isPassableLand(t) || t.elevation > 3) return -1;
  if (t.terrain === 'snow' || t.terrain === 'desert' || t.terrain === 'marsh') return -1;
  let score = 0;
  for (const i of grid.range(index, 2)) {
    const n = map.tiles[i];
    const y = TERRAIN[n.terrain].yields;
    score += (y.grain ?? 0) + (y.vegetables ?? 0) + (y.meat ?? 0) * 0.6;
    if (n.feature === 'forest') score += 0.8;
    if (n.resource) score += RESOURCES[n.resource].water ? 1.5 : 2;
    if (n.river) score += 0.8;
    if (n.terrain === 'snow' || n.terrain === 'desert') score -= 1;
  }
  if (t.river) score += 2;
  if (grid.neighbors(index).some((n) => isWater(map.tiles[n]))) score += 1.5;
  return score;
}

/**
 * Wählt Startpositionen per Farthest-Point-Sampling mit mehreren Neustarts:
 * Die Positionen liegen standardmäßig so weit wie möglich auseinander.
 * Mit minDistance > 0 muss jeder Abstand mindestens diesen Wert erreichen.
 */
export function chooseStartPositions(
  map: GameMap,
  grid: HexGrid,
  count: number,
  rng: Rng,
  minDistance = 0,
): StartPositionResult {
  const { ids, sizes } = landComponents(map, grid);
  const minComponent = Math.max(30, Math.floor(grid.size * 0.02));
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < grid.size; i++) {
    if (ids[i] < 0 || sizes[ids[i]] < minComponent) continue;
    const s = startScore(map, grid, i);
    if (s > 0) scored.push({ i, s });
  }
  if (scored.length < count) {
    return { positions: [], minDistance: 0, ok: false, message: 'Zu wenige geeignete Startfelder auf dieser Karte.' };
  }
  scored.sort((a, b) => b.s - a.s);
  // nur das beste Drittel (mindestens 4× Spielerzahl) kommt in Frage
  const pool = scored.slice(0, Math.max(count * 4, Math.floor(scored.length / 3)));
  const maxScore = pool[0].s;

  let best: number[] = [];
  let bestMin = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const chosen = [pool[rng.int(0, Math.min(pool.length, 20) - 1)].i];
    while (chosen.length < count) {
      let pick = -1;
      let pickValue = -Infinity;
      for (const c of pool) {
        if (chosen.includes(c.i)) continue;
        let d = Infinity;
        for (const o of chosen) d = Math.min(d, grid.distance(c.i, o));
        // Abstand dominiert, Bodenqualität entscheidet bei ähnlichem Abstand
        const value = d + (c.s / maxScore) * 2;
        if (value > pickValue) {
          pickValue = value;
          pick = c.i;
        }
      }
      if (pick < 0) break;
      chosen.push(pick);
    }
    const m = pairwiseMin(grid, chosen);
    if (chosen.length === count && m > bestMin) {
      bestMin = m;
      best = chosen;
    }
  }

  const ok = best.length === count && bestMin >= minDistance;
  return {
    positions: best,
    minDistance: bestMin,
    ok,
    message: ok
      ? undefined
      : `Der Mindestabstand von ${minDistance} Feldern ist auf dieser Karte nicht erreichbar (maximal ${bestMin}).`,
  };
}

function pairwiseMin(grid: HexGrid, positions: number[]): number {
  let m = Infinity;
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) m = Math.min(m, grid.distance(positions[a], positions[b]));
  }
  return positions.length < 2 ? 0 : m;
}
