import { unitType } from '../core/data/units';
import { isPassableLand } from '../core/map/passability';
import type { Unit } from '../core/state';
import { validateItem } from '../core/game';
import { bestAttack, executeAttack, visibleTargets } from './combat';
import type { AiContext } from './context';
import { alive, fortifyHere, knownUnreachable, moveTo, retreatAndHeal } from './units';
import { isMilitary, isMilitaryDef, nearest } from './util';
import { UNIT_TYPES } from '../core/data/units';

/**
 * Stadtstaaten verteidigen sich nur: Einheiten bleiben an ihrer Siedlung, befestigen sich
 * und greifen benachbarte Gegner an, wenn es sich lohnt.
 */
export function runCityStateTurn(ctx: AiContext): void {
  const { view } = ctx;
  const settlements = view.ownSettlements();
  const units = view.ownUnits().filter(isMilitary).sort((a, b) => a.id - b.id);
  let targets = ctx.situation.wars.length ? visibleTargets(ctx) : [];
  for (const u of units) {
    if (!ctx.active) return;
    const home = nearest(ctx, u.tile, settlements, (s) => s.tile);
    if (targets.length && u.movesLeft > 0 && u.hp >= 30) {
      // nur Gegner direkt an der eigenen Siedlung
      const local = home ? targets.filter((t) => view.grid.distance(t.tile, home.tile) <= 2) : targets;
      const plan = bestAttack(ctx, u, local, { allowMove: false, siege: false });
      if (plan) {
        executeAttack(ctx, u, plan);
        targets = targets.filter((t) => t.unit && ctx.state.units[t.unit.id] === t.unit);
      }
    }
    if (!alive(ctx, u)) continue;
    if (home && view.grid.distance(u.tile, home.tile) > 1) {
      moveTo(ctx, u, home.tile);
      if (!alive(ctx, u)) continue;
    }
    if (u.hp < 100 && u.status !== 'fortified') retreatAndHeal(ctx, u);
    else fortifyHere(ctx, u);
  }
  // Mindestens zwei Verteidiger je Stadtstaat, solange die Kasse es trägt
  const military = units.length + settlements.reduce((a, s) => a + s.queue.filter((q) => q.kind === 'unit').length, 0);
  for (const s of settlements) {
    if (!ctx.active) return;
    if (s.queue.length || military >= settlements.length * 2 || ctx.player.lastIncome.gold < 1) continue;
    let best: string | null = null;
    let bestStrength = 0;
    for (const def of Object.values(UNIT_TYPES)) {
      if (def.domain !== 'land' || !isMilitaryDef(def) || def.unitClass === 'recon') continue;
      if (validateItem(ctx.state, s, { kind: 'unit', id: def.id })) continue;
      if (Object.entries(def.goods).some(([g, v]) => (ctx.player.stock[g as keyof typeof ctx.player.stock] ?? 0) < (v ?? 0))) continue;
      if (def.strength > bestStrength) {
        bestStrength = def.strength;
        best = def.id;
      }
    }
    if (best) ctx.issue({ type: 'enqueue', settlementId: s.id, item: { kind: 'unit', id: best } });
  }
}

/** Freies Steh- und Angriffsfeld nahe einer Zielsiedlung (Ring 1, sonst Ring 2). */
function approachTile(ctx: AiContext, u: Unit, target: number, occupied: Set<number>): number {
  const grid = ctx.view.grid;
  for (const radius of [1, 2]) {
    let best = -1;
    let bestScore = -Infinity;
    for (const t of grid.ring(target, radius)) {
      if (t === u.tile) return t;
      const tile = ctx.view.knownTile(t);
      if (!tile || !isPassableLand(tile) || occupied.has(t)) continue;
      if (radius === 1 && Math.abs(tile.elevation - ctx.state.map.tiles[target].elevation) >= 2) continue;
      if (knownUnreachable(ctx, u, t)) continue;
      const score = tile.elevation - grid.distance(u.tile, t) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * Die Maschine (KI-Fraktion) marschiert aggressiv zur nächsten bekannten Siedlung eines
 * Menschen/Volkes und greift an. Sie nutzt ausschließlich ihr eigenes Sichtfeld.
 */
export function runMachineTurn(ctx: AiContext): void {
  const { view, state } = ctx;
  const units = view.ownUnits().filter(isMilitary).sort((a, b) => a.id - b.id);
  let targets = visibleTargets(ctx);
  const goals = view
    .knownForeignSettlements()
    .filter((k) => {
      const kind = state.players[k.info.owner]?.kind;
      return kind === 'ai' || kind === 'human';
    })
    .map((k) => k.tile);
  // Belegte Felder (eigene Einheiten, sichtbare fremde Einheiten und Siedlungen)
  const occupied = new Set<number>();
  for (const o of Object.values(state.units)) if (o.owner === ctx.pid || view.isVisible(o.tile)) occupied.add(o.tile);
  for (const k of view.knownForeignSettlements()) occupied.add(k.tile);
  for (const u of units) {
    if (!ctx.active) return;
    if (u.movesLeft <= 0) continue;
    if (targets.length) {
      const plan = bestAttack(ctx, u, targets, { allowMove: true, siege: true, aggression: 2 });
      if (plan) {
        executeAttack(ctx, u, plan);
        targets = visibleTargets(ctx);
        if (!alive(ctx, u) || u.movesLeft <= 0) continue;
      }
    }
    if (!alive(ctx, u)) continue;
    if (u.hp < 30) {
      retreatAndHeal(ctx, u);
      continue;
    }
    const goal = nearest(ctx, u.tile, goals.filter((t) => !knownUnreachable(ctx, u, t)), (t) => t);
    if (goal !== undefined) {
      const stand = approachTile(ctx, u, goal, occupied);
      if (stand === u.tile) continue;
      if (stand >= 0) {
        occupied.add(stand);
        if (moveTo(ctx, u, stand)) {
          occupied.delete(stand);
          continue;
        }
      }
      // Ziel vorerst nicht erreichbar: andere Ziele bzw. Erkundung
      ctx.mem.unreachable[`${u.id}:${goal}`] = state.turn;
    }
    // Ziel unbekannt: erkunden
    if (u.status !== 'exploring' && unitType(u.type).strength > 0) ctx.issue({ type: 'unitAction', unitId: u.id, action: 'explore' });
  }
}
