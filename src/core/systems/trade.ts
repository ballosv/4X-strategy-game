import { unitType } from '../data/units';
import { gridOf, hasTech } from '../context';
import { addLog, isAtWar, playerSettlements, type GameState, type Settlement, type TradeRoute, type Unit } from '../state';

/**
 * Handel (Imperialismus-Prinzip): Händler richten Handelsrouten zwischen einer eigenen Siedlung
 * und einem Ziel ein. Fremde Ziele erfordern ein Handelsabkommen (Stadtstaaten immer möglich).
 */

export const AGREEMENT_GOLD = 2;

export function hasAgreement(state: GameState, a: number, b: number): boolean {
  return !!state.players[a]?.agreements?.includes(b) && !!state.players[b]?.agreements?.includes(a);
}

export function maxTradeRoutes(state: GameState, playerId: number): number {
  const markets = playerSettlements(state, playerId).filter((s) => s.buildings.includes('market')).length;
  return 1 + markets + (hasTech(state, playerId, 'banking') ? 1 : 0);
}

export function routesOf(state: GameState, playerId: number): TradeRoute[] {
  return (state.tradeRoutes ?? []).filter((r) => r.owner === playerId);
}

/** Nächste eigene Siedlung als Heimathafen der Route (nicht das Ziel selbst). */
export function homeSettlement(state: GameState, playerId: number, target: Settlement, from: number): Settlement | undefined {
  const grid = gridOf(state);
  return playerSettlements(state, playerId)
    .filter((s) => s.id !== target.id)
    .sort((a, b) => grid.distance(a.tile, from) - grid.distance(b.tile, from) || a.id - b.id)[0];
}

/** Siedlungen, mit denen der Händler auf seinem Feld eine Route einrichten kann. */
export function tradeTargetsFor(state: GameState, unit: Unit): Settlement[] {
  const grid = gridOf(state);
  return Object.values(state.settlements).filter((s) => grid.distance(s.tile, unit.tile) <= 1 && canEstablishRoute(state, unit, s) === null);
}

export function canEstablishRoute(state: GameState, unit: Unit, target: Settlement): string | null {
  if (!unitType(unit.type).abilities.includes('trade')) return 'Nur Händler können Handelsrouten einrichten';
  const grid = gridOf(state);
  if (grid.distance(unit.tile, target.tile) > 1) return 'Der Händler muss in oder neben der Zielsiedlung stehen';
  const owner = unit.owner;
  const targetOwner = state.players[target.owner];
  if (isAtWar(state, owner, target.owner)) return 'Krieg mit dem Besitzer';
  if (targetOwner.kind === 'machine') return 'Kein Handel mit der KI';
  if (target.owner !== owner && targetOwner.kind !== 'cityState' && !hasAgreement(state, owner, target.owner)) return 'Benötigt ein Handelsabkommen';
  if (routesOf(state, owner).length >= maxTradeRoutes(state, owner)) return 'Keine freien Handelsrouten (Marktplatz bauen)';
  const home = homeSettlement(state, owner, target, unit.tile);
  if (!home) return 'Benötigt eine weitere eigene Siedlung';
  if ((state.tradeRoutes ?? []).some((r) => r.owner === owner && r.from === home.id && r.to === target.id)) return 'Route besteht bereits';
  return null;
}

export function establishRoute(state: GameState, unit: Unit, target: Settlement): TradeRoute {
  const home = homeSettlement(state, unit.owner, target, unit.tile)!;
  const route: TradeRoute = { id: state.nextId++, owner: unit.owner, from: home.id, to: target.id, since: state.turn };
  state.tradeRoutes = [...(state.tradeRoutes ?? []), route];
  delete state.units[unit.id];
  addLog(state, { player: unit.owner, kind: 'economy', text: `Handelsroute ${home.name} – ${target.name} eingerichtet.`, tile: target.tile });
  return route;
}

export interface RouteYield {
  gold: number;
  influence: number;
  /** Gold für den Besitzer der Zielsiedlung (fremde Routen). */
  partnerGold: number;
}

export function routeYield(state: GameState, route: TradeRoute): RouteYield {
  const from = state.settlements[route.from];
  const to = state.settlements[route.to];
  if (!from || !to) return { gold: 0, influence: 0, partnerGold: 0 };
  const dist = gridOf(state).distance(from.tile, to.tile);
  const foreign = to.owner !== route.owner;
  const cityState = state.players[to.owner].kind === 'cityState';
  const gold = (foreign ? 3 : 1) + Math.floor(dist / (foreign ? 4 : 6)) + (to.buildings.includes('market') ? 1 : 0);
  return { gold, influence: foreign ? 1 : 0, partnerGold: foreign && !cityState ? 1 + Math.floor(dist / 8) : 0 };
}

/** Einnahmen eines Spielers aus Routen und Abkommen in dieser Runde. */
export function tradeIncome(state: GameState, playerId: number): { gold: number; influence: number } {
  let gold = 0;
  let influence = 0;
  for (const r of state.tradeRoutes ?? []) {
    const y = routeYield(state, r);
    if (r.owner === playerId) {
      gold += y.gold;
      influence += y.influence;
    } else if (state.settlements[r.to]?.owner === playerId) {
      gold += y.partnerGold;
    }
  }
  for (const partner of state.players[playerId].agreements ?? []) if (hasAgreement(state, playerId, partner)) gold += AGREEMENT_GOLD;
  return { gold, influence };
}

/** Entfernt ungültige Routen (Krieg, Eroberung) und Abkommen bei Krieg. */
export function validateTrade(state: GameState): void {
  const routes = state.tradeRoutes ?? [];
  const kept = routes.filter((r) => {
    const from = state.settlements[r.from];
    const to = state.settlements[r.to];
    const ok = !!from && !!to && from.owner === r.owner && !isAtWar(state, r.owner, to.owner) &&
      (to.owner === r.owner || state.players[to.owner].kind === 'cityState' || hasAgreement(state, r.owner, to.owner));
    if (!ok) addLog(state, { player: r.owner, kind: 'warning', text: 'Eine Handelsroute wurde unterbrochen.', tile: to?.tile ?? from?.tile });
    return ok;
  });
  if (kept.length !== routes.length) state.tradeRoutes = kept;
  for (const p of state.players) {
    if (!p.agreements?.length) continue;
    p.agreements = p.agreements.filter((o) => !isAtWar(state, p.id, o) && state.players[o]?.alive);
  }
}

/** Wird von der KI gesetzt: Entscheidet, ob ein Computergegner ein Abkommen annimmt. */
export let agreementEvaluator: (state: GameState, receiver: number, proposer: number) => boolean = (state, receiver, proposer) =>
  !isAtWar(state, receiver, proposer);
export function setAgreementEvaluator(fn: typeof agreementEvaluator): void {
  agreementEvaluator = fn;
}

export function canProposeAgreement(state: GameState, from: number, to: number): string | null {
  const target = state.players[to];
  if (!target || to === from || !target.alive) return 'Ungültig';
  if (target.kind !== 'ai' && target.kind !== 'human') return 'Nur mit anderen Völkern';
  if (!hasTech(state, from, 'currency')) return 'Benötigt die Technologie Währung';
  if (isAtWar(state, from, to)) return 'Nicht im Krieg';
  if (hasAgreement(state, from, to)) return 'Abkommen besteht bereits';
  return null;
}

export function signAgreement(state: GameState, a: number, b: number): void {
  for (const [x, y] of [[a, b], [b, a]]) {
    const p = state.players[x];
    p.agreements = [...new Set([...(p.agreements ?? []), y])];
  }
  addLog(state, { player: a, kind: 'diplomacy', text: `Handelsabkommen mit ${state.players[b].name} geschlossen.` });
  addLog(state, { player: b, kind: 'diplomacy', text: `Handelsabkommen mit ${state.players[a].name} geschlossen.` });
}

export function cancelAgreement(state: GameState, a: number, b: number): void {
  for (const [x, y] of [[a, b], [b, a]]) {
    const p = state.players[x];
    p.agreements = (p.agreements ?? []).filter((o) => o !== y);
  }
  addLog(state, { player: b, kind: 'diplomacy', text: `${state.players[a].name} hat das Handelsabkommen gekündigt.` });
  validateTrade(state);
}
