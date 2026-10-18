import { isPassableLand } from '../core/map/passability';
import { isAtWar, type GameState, type Settlement, type Unit } from '../core/state';
import { canEstablishRoute, canProposeAgreement, hasAgreement, routeYield, homeSettlement, setAgreementEvaluator } from '../core/systems/trade';
import type { AiContext } from './context';
import type { AiMemory } from './memory';
import { moveTo } from './units';

/**
 * Handel der Computergegner: Handelsabkommen anbieten/annehmen und Händler auf lohnende
 * Routen schicken. Ziele werden nur aus dem eigenen Kartenwissen gewählt.
 */

/** Annahme eines Abkommens: nicht mit Kriegs- oder Angriffszielen. */
export function evaluateAgreement(state: GameState, receiver: number, proposer: number): boolean {
  if (isAtWar(state, receiver, proposer)) return false;
  const mem = state.aiMemory?.[receiver] as AiMemory | undefined;
  if (mem?.prepare?.target === proposer || mem?.war?.target === proposer) return false;
  // Ein Volk, das gerade erst Frieden schließen musste, handelt noch nicht
  if ((mem?.peaceUntil?.[proposer] ?? 0) > state.turn + 20) return false;
  return true;
}

setAgreementEvaluator(evaluateAgreement);

export function proposeAgreements(ctx: AiContext): void {
  if (ctx.state.turn % 5 !== ctx.pid % 5) return;
  const majors = new Set(ctx.view.knownForeignSettlements().map((k) => k.info.owner));
  for (const other of [...majors].sort((a, b) => a - b)) {
    const kind = ctx.state.players[other]?.kind;
    if (kind !== 'ai' && kind !== 'human') continue;
    if (ctx.mem.prepare?.target === other || ctx.mem.war?.target === other) continue;
    if (hasAgreement(ctx.state, ctx.pid, other) || canProposeAgreement(ctx.state, ctx.pid, other)) continue;
    // Menschen werden nicht überrumpelt: Angebote gehen nur an Computergegner
    if (kind === 'human') continue;
    ctx.issue({ type: 'proposeAgreement', target: other });
  }
}

/** Bewertung einer möglichen Route für einen Händler (ohne Nachbarschaftsprüfung). */
function routeScore(ctx: AiContext, u: Unit, target: Settlement): number {
  const probe: Unit = { ...u, tile: target.tile };
  if (canEstablishRoute(ctx.state, probe, target) !== null) return -1;
  const home = homeSettlement(ctx.state, u.owner, target, target.tile);
  if (!home) return -1;
  const y = routeYield(ctx.state, { id: 0, owner: u.owner, from: home.id, to: target.id, since: 0 });
  return y.gold + y.influence * 1.5 - ctx.view.grid.distance(u.tile, target.tile) * 0.15;
}

/** Gibt es ein bekanntes Ziel, für das ein neuer Händler eine Route einrichten könnte? */
export function hasRouteTarget(ctx: AiContext, fromTile: number): boolean {
  const probe: Unit = { id: -1, type: 'merchant', owner: ctx.pid, tile: fromTile, hp: 100, movesLeft: 0, xp: 0, status: 'ready', fortifyTurns: 0, destination: null, hasAttacked: false };
  const candidates: Settlement[] = [...ctx.view.ownSettlements()];
  for (const k of ctx.view.knownForeignSettlements()) {
    const s = ctx.state.settlements[k.info.id];
    if (s && s.tile === k.tile) candidates.push(s);
  }
  const taken = ctx.view.ownUnits().filter((u) => u.type === 'merchant').length;
  return candidates.filter((s) => routeScore(ctx, probe, s) > 0).length > taken;
}

export function handleMerchants(ctx: AiContext): void {
  const merchants = ctx.view.ownUnits().filter((u) => u.type === 'merchant').sort((a, b) => a.id - b.id);
  if (!merchants.length) return;
  const known = new Map<number, Settlement>();
  for (const s of ctx.view.ownSettlements()) known.set(s.id, s);
  for (const k of ctx.view.knownForeignSettlements()) {
    const s = ctx.state.settlements[k.info.id];
    if (s && s.tile === k.tile) known.set(s.id, s);
  }
  for (const u of merchants) {
    if (!ctx.active || !ctx.state.units[u.id]) continue;
    const ranked = [...known.values()]
      .map((s) => ({ s, score: routeScore(ctx, u, s) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.s.id - b.s.id)
      .slice(0, ctx.plan.candidateCap);
    let progressed = false;
    for (const { s: target } of ranked) {
      if (!ctx.state.units[u.id]) break;
      if (ctx.view.grid.distance(u.tile, target.tile) <= 1 && canEstablishRoute(ctx.state, u, target) === null) {
        progressed = ctx.issue({ type: 'establishTrade', unitId: u.id, settlementId: target.id });
        break;
      }
      const stand = target.owner === u.owner ? target.tile : ctx.view.grid
        .neighbors(target.tile)
        .filter((t) => {
          const tile = ctx.view.knownTile(t);
          return !!tile && isPassableLand(tile);
        })
        .sort((a, b) => ctx.view.grid.distance(u.tile, a) - ctx.view.grid.distance(u.tile, b))[0];
      if (stand === undefined || !moveTo(ctx, u, stand)) continue;
      progressed = true;
      if (ctx.state.units[u.id] && ctx.view.grid.distance(u.tile, target.tile) <= 1 && canEstablishRoute(ctx.state, u, target) === null) {
        ctx.issue({ type: 'establishTrade', unitId: u.id, settlementId: target.id });
      }
      break;
    }
    // Kein erreichbares, lohnendes Ziel: Händler auflösen statt ihn ewig warten zu lassen
    if (!progressed && ctx.state.units[u.id] && u.movesLeft > 0) ctx.issue({ type: 'unitAction', unitId: u.id, action: 'disband' });
  }
}
