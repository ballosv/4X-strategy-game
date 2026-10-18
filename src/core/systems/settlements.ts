import { CIVS, CITY_STATE_NAMES } from '../data/civs';
import { addStock, stockOf } from '../data/goods';
import { gridOf, hasTech } from '../context';
import { isPassableLand, isWater } from '../map/passability';
import {
  addLog,
  emptyReport,
  playerSettlements,
  totalPop,
  type GameState,
  type Settlement,
  type SettlementKind,
} from '../state';
import { SETTLEMENT_RADIUS, scholarSlots } from './economy';

/** Mindestabstand zwischen zwei Siedlungszentren. */
export const MIN_SETTLEMENT_DISTANCE = 3;

export function campCost(state: GameState, playerId: number): number {
  const n = playerSettlements(state, playerId).length;
  return n === 0 ? 0 : 10 + n * 10;
}

export const UPGRADE_COST: Record<'settlement' | 'city', { influence: number; minPop: number; tech?: string }> = {
  settlement: { influence: 15, minPop: 3, tech: 'agriculture' },
  city: { influence: 40, minPop: 9, tech: 'writing' },
};

export const KIND_NAMES: Record<SettlementKind, string> = { camp: 'Lager', settlement: 'Siedlung', city: 'Stadt' };

export function canFoundAt(state: GameState, playerId: number, tile: number): string | null {
  const t = state.map.tiles[tile];
  if (!isPassableLand(t)) return 'Hier kann nicht gesiedelt werden';
  const grid = gridOf(state);
  for (const s of Object.values(state.settlements)) {
    if (grid.distance(s.tile, tile) < MIN_SETTLEMENT_DISTANCE) return 'Zu nah an einer anderen Siedlung';
  }
  const owner = state.tileOwner[tile];
  if (owner >= 0 && state.settlements[owner]?.owner !== playerId) return 'Fremdes Gebiet';
  if (state.players[playerId].influence < campCost(state, playerId)) return `Benötigt ${campCost(state, playerId)} Einfluss`;
  return null;
}

function nextSettlementName(state: GameState, playerId: number): string {
  const player = state.players[playerId];
  const used = new Set(Object.values(state.settlements).map((s) => s.name));
  if (player.kind === 'cityState') return player.name;
  const civ = CIVS.find((c) => c.id === player.civId);
  const names = civ?.settlementNames ?? CITY_STATE_NAMES;
  for (const n of names) if (!used.has(n)) return n;
  let i = 2;
  while (used.has(`${names[0]} ${i}`)) i++;
  return `${names[0]} ${i}`;
}

export function foundSettlement(state: GameState, playerId: number, tile: number, kind: SettlementKind, pop: number): Settlement {
  const id = state.nextId++;
  const isCapital = !playerSettlements(state, playerId).some((s) => s.isCapital);
  const s: Settlement = {
    id,
    name: nextSettlementName(state, playerId),
    owner: playerId,
    tile,
    kind,
    isCapital,
    pop: { workers: pop, citizens: 0, scholars: 0 },
    food: 0,
    buildings: [],
    queue: [],
    laborProgress: 0,
    localStock: {},
    hp: 100,
    founded: state.turn,
    foundedBy: playerId,
    focus: 'balanced',
    report: emptyReport(),
  };
  state.settlements[id] = s;
  // Felder unter einer Siedlung werden nicht bewirtschaftet
  delete state.improvements[tile];
  if (state.tileOwner[tile] >= 0 && state.tileOwner[tile] !== id) state.tileOwner[tile] = -1;
  claimTiles(state, s);
  state.players[playerId].stats.settlementsFounded++;
  return s;
}

/** Beansprucht freie Felder im Radius der Siedlung (abhängig von Typ und Größe). */
export function claimTiles(state: GameState, s: Settlement): number {
  const grid = gridOf(state);
  let radius = SETTLEMENT_RADIUS[s.kind];
  if (s.kind !== 'camp' && totalPop(s.pop) < 5) radius = Math.min(radius, 1);
  if (s.kind === 'city' && totalPop(s.pop) < 12) radius = Math.min(radius, 2);
  let claimed = 0;
  for (const t of grid.range(s.tile, radius)) {
    if (state.tileOwner[t] !== -1) continue;
    // Wasserfelder nur direkt an der Küste beanspruchen
    if (isWater(state.map.tiles[t]) && grid.distance(t, s.tile) > 2) continue;
    state.tileOwner[t] = s.id;
    claimed++;
  }
  state.tileOwner[s.tile] = s.id;
  return claimed;
}

export function canUpgradeSettlement(state: GameState, s: Settlement): string | null {
  if (s.kind === 'city') return 'Bereits eine Stadt';
  const target = s.kind === 'camp' ? 'settlement' : 'city';
  const cost = UPGRADE_COST[target];
  if (!hasTech(state, s.owner, cost.tech)) return 'Technologie fehlt';
  if (totalPop(s.pop) < cost.minPop) return `Benötigt ${cost.minPop} Einwohner`;
  if (state.players[s.owner].influence < cost.influence) return `Benötigt ${cost.influence} Einfluss`;
  return null;
}

export function upgradeSettlement(state: GameState, s: Settlement): void {
  const target = s.kind === 'camp' ? 'settlement' : 'city';
  state.players[s.owner].influence -= UPGRADE_COST[target].influence;
  s.kind = target;
  claimTiles(state, s);
  addLog(state, { player: s.owner, kind: 'economy', text: `${s.name} ist jetzt eine ${KIND_NAMES[target]}.`, tile: s.tile });
}

export const PROMOTION_COST = { citizens: { gold: 12 }, scholars: { gold: 20 } };

export function canPromote(state: GameState, s: Settlement, to: 'citizens' | 'scholars'): string | null {
  const player = state.players[s.owner];
  if (s.pop.workers <= 1) return 'Mindestens ein Arbeiter muss bleiben';
  if (to === 'citizens') {
    if (s.kind === 'camp') return 'Erst als Siedlung';
    if (player.gold < PROMOTION_COST.citizens.gold) return `Benötigt ${PROMOTION_COST.citizens.gold} Gold`;
    if (player.era >= 2 && stockOf(player.stock, 'clothing') < 1 && stockOf(player.stock, 'cloth') < 1) return 'Benötigt 1 Stoffe oder Kleidung';
    return null;
  }
  if (!hasTech(state, s.owner, 'writing')) return 'Technologie Schrift fehlt';
  if (s.pop.scholars >= scholarSlots(s)) return 'Keine freien Plätze für Gelehrte (Bibliothek bauen)';
  if (player.gold < PROMOTION_COST.scholars.gold) return `Benötigt ${PROMOTION_COST.scholars.gold} Gold`;
  return null;
}

export function promote(state: GameState, s: Settlement, to: 'citizens' | 'scholars'): void {
  const player = state.players[s.owner];
  player.gold -= PROMOTION_COST[to].gold;
  if (to === 'citizens' && player.era >= 2) {
    if (stockOf(player.stock, 'clothing') >= 1) addStock(player.stock, 'clothing', -1);
    else addStock(player.stock, 'cloth', -1);
  }
  s.pop.workers--;
  s.pop[to]++;
}

export function demote(s: Settlement, from: 'citizens' | 'scholars'): void {
  if (s.pop[from] <= 0) return;
  s.pop[from]--;
  s.pop.workers++;
}

