import { addStock, stockOf, type Stock } from '../data/goods';
import { BUILDINGS } from '../data/buildings';
import { gridOf, hasTech, playerModifiers } from '../context';
import { isPassableLand, isCliff, isWater } from '../map/passability';
import { addLog, playerSettlements, type GameState, type Settlement, type Unit } from '../state';

/**
 * Transportnetz (Imperialismus-Prinzip): Straßen und Eisenbahnen verbinden Siedlungen mit der
 * Hauptstadt. Nur angebundene Siedlungen liefern größere Gütermengen ins Nationallager.
 */

export type RoadKind = 'road' | 'rail';
export const ROAD = 1;
export const RAIL = 2;

export type Connection = 'capital' | 'rail' | 'road' | 'sea' | 'none';

export const CONNECTION_NAMES: Record<Connection, string> = {
  capital: 'Hauptstadt',
  rail: 'Eisenbahn',
  road: 'Straße',
  sea: 'Seeweg',
  none: 'keine Anbindung',
};

/** Zusätzliche Transportkapazität je Anbindungsart. */
export const CONNECTION_BONUS: Record<Connection, number> = { capital: 0, rail: 18, road: 6, sea: 5, none: 0 };

export interface RoadWorkDef {
  name: string;
  tech: string;
  turns: number;
  goods: Stock;
  level: number;
}

export const ROAD_WORK: Record<RoadKind, RoadWorkDef> = {
  road: { name: 'Straße', tech: 'wheel', turns: 2, goods: { stone: 1 }, level: ROAD },
  rail: { name: 'Eisenbahn', tech: 'railroad', turns: 3, goods: { steel: 1, planks: 1 }, level: RAIL },
};

/** Straßenstufe eines Feldes; Siedlungszentren sind Knotenpunkte beider Netze. */
export function roadLevel(state: GameState, tile: number): number {
  for (const s of Object.values(state.settlements)) if (s.tile === tile) return RAIL;
  return state.roads?.[tile] ?? 0;
}

function settlementTiles(state: GameState): Map<number, Settlement> {
  const m = new Map<number, Settlement>();
  for (const s of Object.values(state.settlements)) m.set(s.tile, s);
  return m;
}

/** Bewegungskosten entlang einer Straße/Schiene oder null, wenn keine durchgehende Verbindung besteht. */
export function roadStepCost(state: GameState, from: number, to: number, hubs?: Map<number, Settlement>): number | null {
  const h = hubs ?? settlementTiles(state);
  const a = h.has(from) ? RAIL : state.roads?.[from] ?? 0;
  const b = h.has(to) ? RAIL : state.roads?.[to] ?? 0;
  const level = Math.min(a, b);
  if (level <= 0) return null;
  if (isCliff(state.map.tiles[from], state.map.tiles[to])) return null;
  return level >= RAIL ? 0.25 : 0.5;
}

/** Alle Felder, die über Straßen (bzw. Schienen) mit der Hauptstadt verbunden sind. */
export function capitalNetwork(state: GameState, playerId: number, minLevel = ROAD): Set<number> {
  const capital = playerSettlements(state, playerId).find((s) => s.isCapital);
  if (!capital) return new Set();
  const grid = gridOf(state);
  const hubs = settlementTiles(state);
  {
    const seen = new Set<number>([capital.tile]);
    const queue = [capital.tile];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const nb of grid.neighbors(cur)) {
        if (seen.has(nb)) continue;
        const hub = hubs.get(nb);
        if (hub && hub.owner !== playerId) continue;
        const level = hub ? RAIL : state.roads?.[nb] ?? 0;
        if (level < minLevel) continue;
        if (isCliff(state.map.tiles[cur], state.map.tiles[nb])) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
    return seen;
  }
}

/** Anbindung aller Siedlungen eines Spielers an seine Hauptstadt. */
export function computeConnections(state: GameState, playerId: number): Map<number, Connection> {
  const out = new Map<number, Connection>();
  const settlements = playerSettlements(state, playerId);
  const capital = settlements.find((s) => s.isCapital);
  for (const s of settlements) out.set(s.id, 'none');
  if (!capital) return out;
  out.set(capital.id, 'capital');
  const railNet = capitalNetwork(state, playerId, RAIL);
  const roadNet = capitalNetwork(state, playerId, ROAD);
  const capitalHarbor = capital.buildings.includes('harbor');
  for (const s of settlements) {
    if (s.isCapital) continue;
    if (railNet.has(s.tile) && s.buildings.includes('railway')) out.set(s.id, 'rail');
    else if (roadNet.has(s.tile)) out.set(s.id, 'road');
    else if (capitalHarbor && s.buildings.includes('harbor')) out.set(s.id, 'sea');
  }
  return out;
}

export function transportCapacityWith(state: GameState, s: Settlement, connection: Connection, base: number): number {
  const mods = playerModifiers(state, s.owner);
  return base + CONNECTION_BONUS[connection] + (mods.transportBonus ?? 0) + s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.transport ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Bauarbeiten durch Arbeiter

export function canBuildRoad(state: GameState, unit: Unit, kind: RoadKind, tile = unit.tile): string | null {
  const def = ROAD_WORK[kind];
  const t = state.map.tiles[tile];
  if (!hasTech(state, unit.owner, def.tech)) return `Benötigt Technologie für ${def.name}`;
  if (isWater(t) || !isPassableLand(t)) return 'Nur auf begehbarem Land';
  if (Object.values(state.settlements).some((s) => s.tile === tile)) return 'Siedlungen sind bereits angebunden';
  if ((state.roads?.[tile] ?? 0) >= def.level) return `Hier liegt bereits eine ${def.name}`;
  if (kind === 'rail' && (state.roads?.[tile] ?? 0) < ROAD) return 'Benötigt zuerst eine Straße';
  const ownerSid = state.tileOwner[tile];
  if (ownerSid >= 0 && state.settlements[ownerSid]?.owner !== unit.owner) return 'Fremdes Gebiet';
  const stock = state.players[unit.owner].stock;
  for (const [g, v] of Object.entries(def.goods)) if (stockOf(stock, g as keyof Stock) < (v ?? 0)) return 'Material fehlt im Nationallager';
  return null;
}

/** Beginnt den Bau; das Material wird sofort aus dem Nationallager genommen. */
export function startRoadWork(state: GameState, unit: Unit, kind: RoadKind): void {
  const def = ROAD_WORK[kind];
  for (const [g, v] of Object.entries(def.goods)) addStock(state.players[unit.owner].stock, g as keyof Stock, -(v ?? 0));
  unit.work = { kind, tile: unit.tile, turnsLeft: def.turns };
  unit.movesLeft = 0;
}

/** Fortschritt der Bauarbeiten zu Beginn des Zuges. Gibt true zurück, wenn ein Abschnitt fertig wurde. */
export function progressRoadWork(state: GameState, unit: Unit): boolean {
  const work = unit.work;
  if (!work) return false;
  if (unit.tile !== work.tile) {
    unit.work = null;
    return false;
  }
  work.turnsLeft--;
  if (work.turnsLeft > 0) {
    unit.movesLeft = 0;
    return false;
  }
  state.roads = state.roads ?? {};
  state.roads[work.tile] = ROAD_WORK[work.kind].level;
  unit.work = null;
  return true;
}

/**
 * Automatischer Straßenbau: nächstes Feld, auf dem eine Straße fehlt, um eine nicht angebundene
 * Siedlung mit dem Netz der Hauptstadt zu verbinden. Liefert -1, wenn nichts zu tun ist.
 */
export function nextAutoRoadTile(state: GameState, unit: Unit): number {
  const conns = computeConnections(state, unit.owner);
  const settlements = playerSettlements(state, unit.owner);
  const capital = settlements.find((s) => s.isCapital);
  if (!capital) return -1;
  const grid = gridOf(state);
  const unconnected = settlements.filter((s) => conns.get(s.id) === 'none' || conns.get(s.id) === 'sea');
  if (!unconnected.length) return -1;
  const net = capitalNetwork(state, unit.owner, ROAD);
  // vom Netz der Hauptstadt aus per Breitensuche (kürzester Weg über Land, Straßen bevorzugt)
  const hubs = settlementTiles(state);
  let best = -1;
  let bestDist = Infinity;
  for (const target of unconnected) {
    // Dijkstra light: Straßenfelder kosten 0, sonst 1
    const dist = new Map<number, number>([[target.tile, 0]]);
    const prev = new Map<number, number>();
    const queue: number[] = [target.tile];
    let reached = -1;
    while (queue.length) {
      queue.sort((x, y) => dist.get(x)! - dist.get(y)!);
      const cur = queue.shift()!;
      const d = dist.get(cur)!;
      if (d > 30) break;
      if (cur !== target.tile && net.has(cur)) {
        reached = cur;
        break;
      }
      for (const nb of grid.neighbors(cur)) {
        const t = state.map.tiles[nb];
        if (!isPassableLand(t) || isCliff(state.map.tiles[cur], t)) continue;
        const ownerSid = state.tileOwner[nb];
        if (ownerSid >= 0 && state.settlements[ownerSid]?.owner !== unit.owner) continue;
        const otherHub = hubs.get(nb);
        if (otherHub && otherHub.owner !== unit.owner) continue;
        const nd = d + ((state.roads?.[nb] ?? 0) > 0 || otherHub ? 0.1 : 1);
        if (nd >= (dist.get(nb) ?? Infinity)) continue;
        dist.set(nb, nd);
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
    if (reached < 0) continue;
    // Weg zurückverfolgen: erstes Feld ohne Straße, das dem Arbeiter am nächsten liegt
    for (let p = prev.get(reached); p !== undefined && p !== target.tile; p = prev.get(p)) {
      if ((state.roads?.[p] ?? 0) > 0 || hubs.has(p)) continue;
      const d = grid.distance(unit.tile, p);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best;
}

export function logRoadDone(state: GameState, unit: Unit, kind: RoadKind): void {
  addLog(state, { player: unit.owner, kind: 'economy', text: `${ROAD_WORK[kind].name} fertiggestellt.`, tile: unit.tile });
}
