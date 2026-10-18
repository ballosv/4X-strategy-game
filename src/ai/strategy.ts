import { stockOf, type GoodId, type Stock } from '../core/data/goods';
import { unitType } from '../core/data/units';
import { civOf } from '../core/context';
import { isAtWar, totalPop } from '../core/state';
import { itemCost } from '../core/systems/economy';
import type { AiContext } from './context';
import type { Goals } from './memory';
import { clamp, isFounder, isMilitary, isValidSite, siteScore, unitPower } from './util';

/** Lagebild zu Rundenbeginn (nur aus eigenem Wissen). */
export interface Situation {
  myPower: number;
  militaryUnits: number;
  /** Bedrohung je eigener Siedlung (gewichtete Stärke sichtbarer Gegner in der Nähe). */
  threat: Record<number, number>;
  maxThreat: number;
  /** Spieler, mit denen Krieg herrscht (inkl. Maschine). */
  wars: number[];
  /** Kriege gegen menschliche/KI-Großmächte. */
  majorWars: number[];
  /** Geschätzte Stärke fremder Spieler (zuletzt gesehen, langsam vergessen). */
  enemyPower: Record<number, number>;
  foodDeficit: number;
  stalled: number;
  idleLabor: number;
  settlements: number;
  pop: number;
  netGold: number;
  founders: number;
}

/** Mindestqualität eines Siedlungsplatzes. */
export const MIN_SITE_SCORE = 14;

const TARGET_SETTLEMENTS: Record<string, number> = { small: 5, medium: 7, large: 9, huge: 11 };

export function analyseSituation(ctx: AiContext): Situation {
  const { state, view, pid, mem } = ctx;
  const grid = view.grid;
  const own = view.ownSettlements();
  const units = view.ownUnits();
  const foreign = view.visibleForeignUnits();

  // Gesehene Stärke fremder Spieler fortschreiben
  const seenNow: Record<number, number> = {};
  for (const u of foreign) seenNow[u.owner] = (seenNow[u.owner] ?? 0) + unitPower(u);
  for (const [k, v] of Object.entries(seenNow)) {
    const old = mem.strength[k];
    const decayed = old ? old.value * Math.pow(0.98, state.turn - old.turn) : 0;
    mem.strength[k] = { value: Math.max(v, decayed), turn: state.turn };
  }
  const enemyPower: Record<number, number> = {};
  for (const [k, v] of Object.entries(mem.strength)) enemyPower[Number(k)] = v.value * Math.pow(0.98, state.turn - v.turn);

  const threat: Record<number, number> = {};
  let maxThreat = 0;
  for (const s of own) {
    let t = 0;
    for (const u of foreign) {
      if (!isMilitary(u)) continue;
      const d = grid.distance(u.tile, s.tile);
      if (d > 6) continue;
      const kind = state.players[u.owner]?.kind;
      const w = isAtWar(state, pid, u.owner) ? 1 : kind === 'cityState' ? 0 : 0.15;
      t += w * unitPower(u) * (1 - d / 8);
    }
    threat[s.id] = t;
    maxThreat = Math.max(maxThreat, t);
  }

  const wars: number[] = [];
  const majorWars: number[] = [];
  for (const p of state.players) {
    if (p.id === pid || !p.alive) continue;
    if (!isAtWar(state, pid, p.id)) continue;
    wars.push(p.id);
    if (p.kind === 'ai' || p.kind === 'human') majorWars.push(p.id);
  }

  let foodDeficit = 0;
  let stalled = 0;
  let idleLabor = 0;
  let pop = 0;
  for (const s of own) {
    pop += totalPop(s.pop);
    if (s.report.foodSurplus <= 0) foodDeficit++;
    if (!s.queue.length) idleLabor += s.report.laborFree;
    if (isHeadStalled(ctx, s.id)) stalled++;
  }
  let founders = units.filter(isFounder).length;
  for (const s of own) founders += s.queue.filter((q) => q.kind === 'unit' && unitType(q.id).abilities.some((a) => a === 'foundCamp' || a === 'foundSettlement')).length;

  const military = units.filter(isMilitary);
  return {
    myPower: military.reduce((a, u) => a + unitPower(u), 0),
    militaryUnits: military.length,
    threat,
    maxThreat,
    wars,
    majorWars,
    enemyPower,
    foodDeficit,
    stalled,
    idleLabor,
    settlements: own.length,
    pop,
    netGold: ctx.player.lastIncome.gold,
    founders,
  };
}

/** Steckt der vorderste Bauauftrag fest (Arbeit fertig, aber Güter/Einwohner fehlen)? */
export function isHeadStalled(ctx: AiContext, settlementId: number): boolean {
  const s = ctx.state.settlements[settlementId];
  const item = s?.queue[0];
  if (!item) return false;
  const cost = itemCost(ctx.state, s, item);
  if (s.laborProgress < cost.labor) return false;
  return missingGoods(ctx, cost.goods).length > 0 || (cost.popCost > 0 && totalPop(s.pop) <= cost.popCost);
}

/** Güter, die im Nationallager für diese Kosten fehlen. */
export function missingGoods(ctx: AiContext, goods: Stock): { good: GoodId; amount: number }[] {
  const out: { good: GoodId; amount: number }[] = [];
  for (const [g, v] of Object.entries(goods) as [GoodId, number][]) {
    const have = stockOf(ctx.player.stock, g);
    if (have + 1e-9 < v) out.push({ good: g, amount: v - have });
  }
  return out;
}

/** Sucht gute Siedlungsplätze im Umkreis des eigenen Reiches (nur erkundete Felder). */
export function findSites(ctx: AiContext): number[] {
  const { view } = ctx;
  const grid = view.grid;
  const own = view.ownSettlements();
  const centers = own.length ? own.map((s) => s.tile) : view.ownUnits().filter(isFounder).map((u) => u.tile);
  const known = view.knownSettlementTiles();
  const seen = new Set<number>();
  const scored: { tile: number; score: number }[] = [];
  for (const c of centers) {
    for (const t of grid.range(c, 7)) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (grid.distance(c, t) < 3) continue;
      if (!isValidSite(ctx, t, known)) continue;
      const nearestOwn = Math.min(...centers.map((o) => grid.distance(o, t)));
      const score = siteScore(view, t) - Math.max(0, nearestOwn - 4) * 1.2;
      if (score >= MIN_SITE_SCORE) scored.push({ tile: t, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.tile - b.tile);
  // Gierig auswählen, damit sich die Plätze nicht überlappen
  const out: number[] = [];
  for (const c of scored) {
    if (out.some((o) => grid.distance(o, c.tile) < 3)) continue;
    out.push(c.tile);
    if (out.length >= Math.max(4, ctx.plan.candidateCap)) break;
  }
  return out;
}

/** Leitet aus dem Lagebild die strategischen Zielgewichte ab. */
export function computeGoals(ctx: AiContext, sit: Situation): Goals {
  const { state, mem } = ctx;
  const era = ctx.player.era;
  const orient = civOf(ctx.player)?.orientation;
  const target = TARGET_SETTLEMENTS[state.settings.mapSize] ?? 7;

  let expand = mem.sites.length ? clamp(1.15 - sit.settlements / target, 0.1, 1) : 0;
  if (sit.maxThreat > 10) expand *= 0.6;

  const defenseAtHome = sit.myPower / Math.max(1, sit.settlements);
  let defend = clamp(sit.maxThreat / (defenseAtHome + 6), 0, 1.5);
  if (sit.majorWars.length) defend += 0.3;

  const desired = sit.settlements * (7 + era * 7) + Object.entries(sit.enemyPower)
    .filter(([p]) => state.players[Number(p)]?.kind !== 'cityState')
    .reduce((a, [, v]) => Math.max(a, v), 0) * 0.6;
  let military = clamp((desired - sit.myPower) / Math.max(1, desired), 0, 1);
  if (sit.majorWars.length) military += 0.3;

  let economy = 0.55 + 0.15 * sit.foodDeficit + 0.1 * sit.stalled + (sit.netGold < 0 ? 0.3 : 0);
  let research = 0.45;
  let attack = mem.war && !mem.war.defensive ? 0.7 : mem.prepare ? 0.45 : 0;

  switch (orient) {
    case 'growth':
      economy += 0.1;
      expand += 0.1;
      break;
    case 'production':
    case 'trade':
      economy += 0.15;
      break;
    case 'knowledge':
      research += 0.3;
      break;
    case 'military':
      military += 0.15;
      attack += 0.15;
      break;
    case 'expansion':
      expand += 0.2;
      break;
    case 'influence':
      expand += 0.1;
      research += 0.1;
      break;
  }
  return {
    expand: clamp(expand, 0, 1.2),
    defend: clamp(defend, 0, 1.8),
    military: clamp(military, 0, 1.5),
    economy: clamp(economy, 0, 1.5),
    research: clamp(research, 0, 1.2),
    attack: clamp(attack, 0, 1),
  };
}

/**
 * Lagebewertung zu Rundenbeginn. Das Lagebild wird jede Runde erstellt; die strategischen Ziele
 * werden gemäß Schwierigkeitsgrad neu gewichtet (leicht: alle 3 Runden). Auf höheren Stufen
 * löst eine neue, deutliche Bedrohung sofort eine Neubewertung aus.
 */
export function evaluateStrategy(ctx: AiContext): void {
  const sit = analyseSituation(ctx);
  ctx.situation = sit;
  const { mem, state } = ctx;
  const due = state.turn - mem.lastEval >= ctx.plan.evalInterval;
  const alarm = ctx.plan.evalInterval === 1 && sit.maxThreat > 0 && mem.goals.defend < 0.3;
  if (due || alarm || mem.lastEval < 0) {
    mem.sites = findSites(ctx);
    mem.goals = computeGoals(ctx, sit);
    mem.lastEval = state.turn;
  }
  ctx.goals = mem.goals;
}
