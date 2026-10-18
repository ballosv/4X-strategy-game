import { RESOURCES, TERRAIN } from '../core/data/terrain';
import { unitType, type UnitTypeDef } from '../core/data/units';
import { isPassableLand, isWater } from '../core/map/passability';
import type { Unit } from '../core/state';
import { BLOCKED, buildOccupancy, terrainStepCost } from '../core/systems/movement';
import { MIN_SETTLEMENT_DISTANCE } from '../core/systems/settlements';
import type { AiContext } from './context';
import type { AiView } from './view';

export function isMilitaryDef(def: UnitTypeDef): boolean {
  return def.strength > 0 && def.unitClass !== 'civilian';
}

export function isMilitary(u: Unit): boolean {
  return isMilitaryDef(unitType(u.type));
}

export function isFounder(u: Unit): boolean {
  const ab = unitType(u.type).abilities;
  return ab.includes('foundCamp') || ab.includes('foundSettlement');
}

/** Grobe Kampfkraft einer Einheit (Stärke × Gesundheit); Späher zählen halb. */
export function unitPower(u: Unit): number {
  const def = unitType(u.type);
  if (!isMilitaryDef(def)) return 0;
  const base = Math.max(def.strength, def.rangedStrength ?? 0);
  return base * (def.unitClass === 'recon' ? 0.5 : 1) * (0.3 + 0.7 * (u.hp / 100));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Bewertet ein Feld als Siedlungsplatz – nur mit Wissen über erkundete Felder.
 * Berücksichtigt Nahrung, Wald, Fluss, Küste, bekannte Ressourcen und Höhe (Verteidigung).
 */
export function siteScore(view: AiView, tile: number): number {
  const center = view.knownTile(tile);
  if (!center || !isPassableLand(center) || center.elevation > 3) return -Infinity;
  if (center.terrain === 'snow') return -Infinity;
  const grid = view.grid;
  let score = 0;
  let coast = false;
  for (const i of grid.range(tile, 2)) {
    if (i === tile) continue;
    const w = grid.distance(tile, i) <= 1 ? 1 : 0.6;
    const n = view.knownTile(i);
    if (!n) {
      score += 0.9 * w; // unbekannt: vorsichtiger Durchschnitt
      continue;
    }
    if (view.isForeignTerritory(i)) {
      score -= 1.5 * w;
      continue;
    }
    const res = view.knownResource(i);
    if (isWater(n)) {
      if (grid.distance(tile, i) === 1) coast = true;
      score += (n.terrain === 'ocean' ? 0.5 : 1.4) * w;
      if (res) score += 2 * w;
      continue;
    }
    const y = TERRAIN[n.terrain].yields;
    score += ((y.grain ?? 0) + (y.vegetables ?? 0) + (y.meat ?? 0) * 0.8) * w;
    if (n.feature === 'forest') score += 1.1 * w;
    else if (n.feature === 'denseForest') score += 0.7 * w;
    else if (n.feature === 'rocks') score += 0.9 * w;
    if (n.elevation === 2 || n.elevation === 3) score += 0.4 * w;
    if (n.elevation >= 4) score -= 0.4 * w;
    if (n.river) score += 0.5 * w;
    if (res) score += (RESOURCES[res].good === 'grain' || RESOURCES[res].good === 'meat' ? 2.5 : 2) * w;
    if (n.terrain === 'snow' || n.terrain === 'desert') score -= 0.8 * w;
  }
  if (center.river) score += 2;
  if (center.elevation === 2) score += 1.5;
  else if (center.elevation === 3) score += 0.8;
  if (coast) score += 1;
  if (center.terrain === 'desert' || center.terrain === 'marsh' || center.terrain === 'tundra') score -= 2;
  return score;
}

/** Mindestabstand zu allen bekannten Siedlungen eingehalten? */
export function farFromKnownSettlements(ctx: AiContext, tile: number, known: number[] = ctx.view.knownSettlementTiles()): boolean {
  const grid = ctx.view.grid;
  for (const t of known) if (grid.distance(t, tile) < MIN_SETTLEMENT_DISTANCE) return false;
  return true;
}

/** Gültiger (bekannter) Siedlungsplatz für diesen Spieler? */
export function isValidSite(ctx: AiContext, tile: number, known?: number[]): boolean {
  const t = ctx.view.knownTile(tile);
  if (!t || !isPassableLand(t) || t.elevation > 3 || t.terrain === 'snow') return false;
  if (ctx.view.isForeignTerritory(tile)) return false;
  if (ctx.mem.badSites.includes(tile)) return false;
  return farFromKnownSettlements(ctx, tile, known);
}

/**
 * Breitensuche über erkundete, begehbare Landfelder (Schrittzahl, keine Einheitenblockade).
 * Liefert erreichbare Felder mit Entfernung in Schritten.
 */
export function landReach(ctx: AiContext, unit: Unit, maxSteps: number): Map<number, number> {
  const { state, view } = ctx;
  const grid = view.grid;
  const def = unitType(unit.type);
  const idx = buildOccupancy(state);
  const dist = new Map<number, number>([[unit.tile, 0]]);
  const queue: number[] = [unit.tile];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const d = dist.get(cur)!;
    if (d >= maxSteps) continue;
    for (const nb of grid.neighbors(cur)) {
      if (dist.has(nb) || !view.isExplored(nb)) continue;
      if (isWater(state.map.tiles[nb])) continue;
      if (terrainStepCost(state, unit.owner, def, cur, nb, idx) === BLOCKED) continue;
      dist.set(nb, d + 1);
      queue.push(nb);
    }
  }
  return dist;
}

/** Nächstgelegenes Element nach Hex-Distanz. */
export function nearest<T>(ctx: AiContext, from: number, items: T[], tileOf: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = ctx.view.grid.distance(from, tileOf(it));
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}
