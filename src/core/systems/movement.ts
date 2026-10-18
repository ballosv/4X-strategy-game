import { FEATURES, IMPASSABLE_ELEVATION, TERRAIN } from '../data/terrain';
import { unitType, type UnitTypeDef } from '../data/units';
import { gridOf, hasTech, playerModifiers } from '../context';
import { isCliff, isWater } from '../map/passability';
import { isAtWar, type GameState, type Settlement, type Unit } from '../state';

export const BLOCKED = Infinity;

/** Index der Einheiten und Siedlungen je Feld, damit die Wegsuche nicht ständig alle Objekte durchsucht. */
export interface OccupancyIndex {
  units: Map<number, Unit[]>;
  settlements: Map<number, Settlement>;
}

export function buildOccupancy(state: GameState): OccupancyIndex {
  const units = new Map<number, Unit[]>();
  for (const u of Object.values(state.units)) {
    const list = units.get(u.tile);
    if (list) list.push(u);
    else units.set(u.tile, [u]);
  }
  const settlements = new Map<number, Settlement>();
  for (const st of Object.values(state.settlements)) settlements.set(st.tile, st);
  return { units, settlements };
}

export function isCivilian(def: UnitTypeDef): boolean {
  return def.unitClass === 'civilian';
}

export function maxMoves(state: GameState, unit: Unit): number {
  const def = unitType(unit.type);
  const mods = playerModifiers(state, unit.owner);
  let moves = def.moves;
  if (def.domain === 'sea') moves += mods.navalMoves ?? 0;
  if (def.unitClass === 'recon') moves += mods.reconMoves ?? 0;
  if (def.domain === 'land' && def.unitClass !== 'civilian') moves += mods.landMoves ?? 0;
  if (def.domain === 'land' && isWater(state.map.tiles[unit.tile])) moves = Math.max(moves, embarkedMoves(state, unit.owner));
  return moves;
}

function embarkedMoves(state: GameState, owner: number): number {
  return hasTech(state, owner, 'navigation') ? 4 : 3;
}

/** Darf eine Landeinheit dieses Wasserfeld betreten (Einschiffen)? */
export function canEmbarkTo(state: GameState, owner: number, tile: number): boolean {
  const t = state.map.tiles[tile];
  if (!isWater(t)) return false;
  if (!hasTech(state, owner, 'sailing')) return false;
  if (t.terrain === 'ocean' && !hasTech(state, owner, 'navigation')) return false;
  return true;
}

/** Darf ein Schiff dieses Feld befahren? */
function canSail(state: GameState, owner: number, tile: number, def: UnitTypeDef, idx: OccupancyIndex): boolean {
  const t = state.map.tiles[tile];
  const s = idx.settlements.get(tile);
  if (s) return s.owner === owner && gridOf(state).neighbors(tile).some((n) => isWater(state.map.tiles[n]));
  if (!isWater(t)) return false;
  if (t.terrain === 'ocean' && def.era < 3 && !hasTech(state, owner, 'navigation')) return false;
  return true;
}

/**
 * Reine Geländekosten für einen Schritt (ohne Berücksichtigung anderer Einheiten).
 * Gibt BLOCKED zurück, wenn der Schritt unmöglich ist.
 */
export function terrainStepCost(
  state: GameState,
  owner: number,
  def: UnitTypeDef,
  from: number,
  to: number,
  idx: OccupancyIndex = buildOccupancy(state),
): number {
  const tiles = state.map.tiles;
  const a = tiles[from];
  const b = tiles[to];
  if (def.domain === 'air') return 1;
  if (def.domain === 'sea') return canSail(state, owner, to, def, idx) ? 1 : BLOCKED;
  // Landeinheit
  if (isWater(b)) {
    if (idx.settlements.has(to)) return BLOCKED;
    return canEmbarkTo(state, owner, to) ? (isWater(a) ? 1 : 99) : BLOCKED;
  }
  if (b.elevation >= IMPASSABLE_ELEVATION) return BLOCKED;
  if (isWater(a)) return 99; // Ausschiffen verbraucht alle Bewegungspunkte
  if (isCliff(a, b)) return BLOCKED;
  let cost = TERRAIN[b.terrain].moveCost;
  if (b.feature) cost = Math.max(cost, FEATURES[b.feature].moveCost);
  if (b.elevation >= 4) cost = Math.max(cost, 3);
  if (b.elevation > a.elevation) cost += 1;
  if (b.river && !followsRiver(state, from, to)) cost += 1;
  return cost;
}

/** Bewegung entlang eines Flusses (beide Felder durch den Fluss verbunden) kostet keinen Aufschlag. */
function followsRiver(state: GameState, from: number, to: number): boolean {
  const grid = gridOf(state);
  const dir = grid.directionTo(from, to);
  return dir >= 0 && (state.map.tiles[from].river & (1 << dir)) !== 0;
}

/** Kann die Einheit das Feld wegen anderer Einheiten oder Siedlungen betreten? */
export function occupancyAllows(state: GameState, unit: Unit, to: number, idx: OccupancyIndex = buildOccupancy(state)): boolean {
  const def = unitType(unit.type);
  const civilian = isCivilian(def);
  for (const other of idx.units.get(to) ?? []) {
    if (other.id === unit.id) continue;
    if (other.owner !== unit.owner) return false;
    const otherCivilian = isCivilian(unitType(other.type));
    if (otherCivilian === civilian) return false;
  }
  const s = idx.settlements.get(to);
  if (s && s.owner !== unit.owner) return false;
  return true;
}

/** 'free' = betretbar, 'pass' = nur durchziehbar (eigene Einheit gleicher Art), 'blocked' = fremd. */
export function occupancyState(_state: GameState, unit: Unit, to: number, idx: OccupancyIndex): 'free' | 'pass' | 'blocked' {
  const s = idx.settlements.get(to);
  if (s && s.owner !== unit.owner) return 'blocked';
  const civilian = isCivilian(unitType(unit.type));
  let result: 'free' | 'pass' = 'free';
  for (const other of idx.units.get(to) ?? []) {
    if (other.id === unit.id) continue;
    if (other.owner !== unit.owner) return 'blocked';
    if (isCivilian(unitType(other.type)) === civilian) result = 'pass';
  }
  return result;
}

export function stepCost(state: GameState, unit: Unit, from: number, to: number): number {
  const idx = buildOccupancy(state);
  const cost = terrainStepCost(state, unit.owner, unitType(unit.type), from, to, idx);
  if (cost === BLOCKED) return BLOCKED;
  if (!occupancyAllows(state, unit, to, idx)) return BLOCKED;
  return cost;
}

export interface PathOptions {
  /** Nur erkundete Felder kennen (unbekannte Felder gelten als begehbar, Kosten 1). */
  explored?: number[];
  /** Sichtbare Felder: nur dort werden fremde Einheiten berücksichtigt. */
  visible?: Uint8Array;
  /** Zielfeld darf besetzt sein (für Angriffe). */
  allowOccupiedTarget?: boolean;
  maxCost?: number;
}

/**
 * A*-Wegsuche. Liefert die Feldfolge ohne Startfeld oder null.
 * Respektiert Klippen, Gelände und (sichtbare) Einheiten.
 */
export function findPath(state: GameState, unit: Unit, target: number, opts: PathOptions = {}): number[] | null {
  const grid = gridOf(state);
  if (target === unit.tile) return [];
  const def = unitType(unit.type);
  const size = grid.size;
  const g = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  g[unit.tile] = 0;
  heap.push(unit.tile, grid.distance(unit.tile, target));
  const maxCost = opts.maxCost ?? Infinity;
  const idx = buildOccupancy(state);

  while (heap.size) {
    const cur = heap.pop();
    if (cur === target) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const nb of grid.neighbors(cur)) {
      if (closed[nb]) continue;
      let cost: number;
      const known = !opts.explored || opts.explored[nb] === 1;
      if (!known) {
        cost = def.domain === 'sea' ? 1 : 1.5;
      } else {
        cost = terrainStepCost(state, unit.owner, def, cur, nb, idx);
        if (cost === BLOCKED) continue;
        if (cost >= 99) cost = 6; // Einschiffen/Ausschiffen: teuer, aber möglich
        const seesUnits = !opts.visible || opts.visible[nb] === 1;
        if (seesUnits && !(nb === target && opts.allowOccupiedTarget)) {
          const occ = occupancyState(state, unit, nb, idx);
          if (occ === 'blocked' || (occ === 'pass' && nb === target)) continue;
        }
      }
      const ng = g[cur] + cost;
      if (ng >= g[nb] || ng > maxCost) continue;
      g[nb] = ng;
      prev[nb] = cur;
      heap.push(nb, ng + grid.distance(nb, target));
    }
  }
  if (prev[target] === -1) return null;
  const path: number[] = [];
  for (let p = target; p !== unit.tile; p = prev[p]) path.push(p);
  return path.reverse();
}

/** Alle Felder, die die Einheit in dieser Runde noch erreichen kann (inkl. Kosten). */
export function reachableTiles(state: GameState, unit: Unit, visible?: Uint8Array): Map<number, number> {
  const grid = gridOf(state);
  const out = new Map<number, number>();
  if (unit.movesLeft <= 0) return out;
  const full = maxMoves(state, unit);
  const idx = buildOccupancy(state);
  const def = unitType(unit.type);
  const best = new Map<number, number>([[unit.tile, unit.movesLeft]]);
  const queue: number[] = [unit.tile];
  while (queue.length) {
    const cur = queue.shift()!;
    const left = best.get(cur)!;
    if (left <= 0) continue;
    for (const nb of grid.neighbors(cur)) {
      const cost = terrainStepCost(state, unit.owner, def, cur, nb, idx);
      if (cost === BLOCKED) continue;
      const seesUnits = !visible || visible[nb] === 1;
      const occ = seesUnits ? occupancyState(state, unit, nb, idx) : 'free';
      if (occ === 'blocked') continue;
      // Ein Schritt ist immer erlaubt, wenn noch alle Bewegungspunkte vorhanden sind
      const canEnter = cost <= left || left >= full;
      if (!canEnter) continue;
      const remaining = Math.max(0, left - cost);
      if ((best.get(nb) ?? -1) >= remaining) continue;
      best.set(nb, remaining);
      if (occ === 'free') out.set(nb, remaining);
      queue.push(nb);
    }
  }
  out.delete(unit.tile);
  return out;
}

class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, prio: number): void {
    this.items.push(item);
    this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prios.pop()!;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.items.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}

export function isEnemyUnitAt(state: GameState, owner: number, tile: number): boolean {
  return Object.values(state.units).some((u) => u.tile === tile && u.owner !== owner && isAtWar(state, owner, u.owner));
}
