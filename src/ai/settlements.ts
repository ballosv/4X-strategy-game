import { BUILDINGS } from '../core/data/buildings';
import { FOOD_GOODS, GOODS, addStock, stockOf, type GoodId, type Stock } from '../core/data/goods';
import { IMPROVEMENTS } from '../core/data/improvements';
import { UNIT_TYPES, unitType } from '../core/data/units';
import { canTrade, marketPrices, validateItem } from '../core/game';
import { isWater } from '../core/map/passability';
import { totalPop, type ProductionItem, type Settlement, type SettlementFocus } from '../core/state';
import {
  canUpgradeImprovement,
  housingOf,
  improvementJobs,
  improvementOptions,
  improvementYield,
  itemCost,
  ownedTiles,
} from '../core/systems/economy';
import { campCost, canPromote, canUpgradeSettlement, UPGRADE_COST } from '../core/systems/settlements';
import type { AiContext } from './context';
import { isHeadStalled, missingGoods } from './strategy';
import { isFounder, isMilitary, isMilitaryDef } from './util';

interface Candidate {
  item: ProductionItem;
  utility: number;
  upkeep: number;
}

/** Wirtschaftliche Planungsdaten, einmal je Zug berechnet und beim Einplanen fortgeschrieben. */
interface EconomyPlan {
  /** Nationallager minus bereits verplante Güter aller Baulisten. */
  avail: Stock;
  /** Netto-Fluss je Gut und Runde (alle Siedlungen). */
  flow: Stock;
  /** Spielraum beim Goldunterhalt pro Runde. */
  goldBudget: number;
  /** Bereits vorhandene + eingeplante Militäreinheiten. */
  military: number;
  founders: number;
  scouts: number;
  trade: boolean;
}

const FOUNDER_IDS = ['settler', 'tribe'];

function isFounderItem(item: ProductionItem): boolean {
  return item.kind === 'unit' && FOUNDER_IDS.includes(item.id);
}

function isMilitaryItem(item: ProductionItem): boolean {
  return item.kind === 'unit' && isMilitaryDef(unitType(item.id)) && unitType(item.id).unitClass !== 'recon';
}

function buildPlan(ctx: AiContext): EconomyPlan {
  const { state } = ctx;
  const avail: Stock = { ...ctx.player.stock };
  const flow: Stock = {};
  let military = 0;
  let founders = 0;
  let scouts = 0;
  for (const s of ctx.view.ownSettlements()) {
    for (const item of s.queue) {
      const cost = itemCost(state, s, item);
      for (const [g, v] of Object.entries(cost.goods) as [GoodId, number][]) addStock(avail, g, -v);
      if (isMilitaryItem(item)) military++;
      if (isFounderItem(item)) founders++;
    }
    for (const [g, v] of Object.entries(s.report.produced) as [GoodId, number][]) if (GOODS[g].category !== 'food') addStock(flow, g, v);
    for (const [g, v] of Object.entries(s.report.consumed) as [GoodId, number][]) addStock(flow, g, -v);
  }
  for (const u of ctx.view.ownUnits()) {
    const def = unitType(u.type);
    if (isFounder(u)) founders++;
    else if (def.unitClass === 'recon') scouts++;
    else if (isMilitary(u)) military++;
  }
  return {
    avail,
    flow,
    goldBudget: ctx.player.lastIncome.gold + Math.min(3, ctx.player.gold / 30),
    military,
    founders,
    scouts,
    trade: canTrade(state, ctx.pid),
  };
}

/** Lassen sich die Güter bis zur Fertigstellung beschaffen (Lager, Produktion, Markt)? */
function goodsObtainable(ctx: AiContext, plan: EconomyPlan, goods: Stock, turns: number): boolean {
  let buyCost = 0;
  for (const [g, v] of Object.entries(goods) as [GoodId, number][]) {
    const short = v - stockOf(plan.avail, g);
    if (short <= 1e-9) continue;
    const rate = stockOf(plan.flow, g);
    if (rate > 0.05 && short / rate <= turns + 4) continue;
    if (!plan.trade) return false;
    buyCost += marketPrices(ctx.state, ctx.pid, g).buy * Math.ceil(short);
  }
  return buyCost === 0 || ctx.player.gold - buyCost >= 25;
}

function reserveGoods(plan: EconomyPlan, goods: Stock): void {
  for (const [g, v] of Object.entries(goods) as [GoodId, number][]) addStock(plan.avail, g, -v);
}

/** Geschätzte Arbeitskraft pro Runde für Bauaufträge. */
function constructionLabor(s: Settlement): number {
  return Math.max(1, s.report.laborFree, Math.round(s.report.laborTotal * 0.35));
}

function foodNeedFactor(s: Settlement): number {
  const surplus = s.report.foodSurplus;
  const pop = totalPop(s.pop);
  let f = surplus <= 0 ? 3 : surplus < 1.5 ? 2 : surplus < 3 ? 1.2 : 0.6;
  if (pop >= housingOf(s)) f *= surplus <= 0 ? 1 : 0.25;
  return f;
}

function goodDemand(plan: EconomyPlan, g: GoodId): number {
  const have = stockOf(plan.avail, g);
  let d: number;
  if (g === 'wood' || g === 'stone') d = have < 6 ? 2 : have < 20 ? 1.2 : 0.5;
  else d = have < 10 ? 1 : have < 30 ? 0.6 : 0.25;
  if (have < 0) d *= 2;
  return d;
}

/** Nutzen je gebundener Arbeitskraft für einen Ertrag. */
function yieldValue(plan: EconomyPlan, s: Settlement, y: Partial<Record<GoodId, number>>): number {
  const foodNeed = foodNeedFactor(s);
  let v = 0;
  for (const [g, n] of Object.entries(y) as [GoodId, number][]) {
    if (FOOD_GOODS.includes(g as (typeof FOOD_GOODS)[number])) v += n * 4 * foodNeed;
    else v += n * GOODS[g].basePrice * 0.8 * goodDemand(plan, g);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Kandidaten

function improvementCandidates(ctx: AiContext, plan: EconomyPlan, s: Settlement): Candidate[] {
  const { state } = ctx;
  const out: Candidate[] = [];
  const grid = ctx.view.grid;
  const tiles = ownedTiles(state, s.id)
    .filter((t) => t !== s.tile)
    .sort((a, b) => grid.distance(s.tile, a) - grid.distance(s.tile, b) || a - b);
  let jobSlots = 0;
  for (const t of tiles) {
    const imp = state.improvements[t];
    if (imp) jobSlots += improvementJobs(IMPROVEMENTS[imp.type], imp.level);
  }
  for (const b of s.buildings) jobSlots += BUILDINGS[b]?.jobs ?? 0;
  for (const q of s.queue) if (q.kind === 'improvement') jobSlots += IMPROVEMENTS[q.id].jobs;
  const spare = s.report.laborTotal * 0.8 - jobSlots;
  const queuedTiles = new Set(s.queue.filter((q) => q.kind === 'improvement' || q.kind === 'upgrade').map((q) => (q as { tile: number }).tile));
  let evaluated = 0;
  for (const t of tiles) {
    if (queuedTiles.has(t)) continue;
    if (evaluated >= ctx.plan.candidateCap * 2) break;
    const imp = state.improvements[t];
    if (imp) {
      if (!canUpgradeImprovement(state, ctx.pid, t)) continue;
      evaluated++;
      const def = IMPROVEMENTS[imp.type];
      const now = improvementYield(state, t, imp.type, imp.level, ctx.pid);
      const next = improvementYield(state, t, imp.type, imp.level + 1, ctx.pid);
      const gain = yieldValue(plan, s, next) * improvementJobs(def, imp.level + 1) - yieldValue(plan, s, now) * improvementJobs(def, imp.level);
      const item: ProductionItem = { kind: 'upgrade', tile: t };
      const cost = itemCost(state, s, item);
      const eff = spare > 0 ? 1 : 0.5;
      out.push({ item, utility: gain * 2.5 * eff - cost.labor / 5, upkeep: 0 });
      continue;
    }
    if (isWater(state.map.tiles[t]) && !ctx.player.techs.includes('fishing')) continue;
    const options = improvementOptions(state, ctx.pid, t);
    if (!options.length) continue;
    evaluated++;
    for (const id of options) {
      const def = IMPROVEMENTS[id];
      const y = improvementYield(state, t, id, 1, ctx.pid);
      const perJob = yieldValue(plan, s, y);
      const effJobs = Math.max(0.4, Math.min(def.jobs, spare));
      out.push({ item: { kind: 'improvement', id, tile: t }, utility: perJob * effJobs * 3 - def.labor / 4, upkeep: 0 });
    }
  }
  return out;
}

function buildingUtility(ctx: AiContext, plan: EconomyPlan, s: Settlement, id: string): number {
  const def = BUILDINGS[id];
  const g = ctx.goals;
  const pop = totalPop(s.pop);
  const housing = housingOf(s);
  const threat = ctx.situation.threat[s.id] ?? 0;
  const atWar = ctx.situation.majorWars.length > 0 || ctx.situation.wars.length > 0;
  let u = 0;
  if (def.yields) {
    u += (def.yields.gold ?? 0) * 6 * (0.5 + g.economy);
    u += (def.yields.research ?? 0) * 7 * (0.5 + g.research);
    u += (def.yields.influence ?? 0) * 8 * (0.5 + g.expand);
    u += (def.yields.food ?? 0) * 5 * foodNeedFactor(s);
  }
  if (def.housing) u += def.housing * (pop >= housing - 1 ? 9 : pop >= housing - 3 ? 4 : 1.5);
  if (def.defense) u += def.defense * (0.4 + g.defend * 1.5 + (threat > 5 ? 3 : 0) + (atWar ? 1 : 0));
  if (def.recipe) {
    const inputs = Object.entries(def.recipe.inputs) as [GoodId, number][];
    const supplied = inputs.every(([gd]) => stockOf(plan.flow, gd) > 0.4 || stockOf(plan.avail, gd) >= 8);
    if (!supplied) return -Infinity;
    let profit = 0;
    for (const [gd, v] of Object.entries(def.recipe.outputs) as [GoodId, number][]) profit += v * GOODS[gd].basePrice * goodDemand(plan, gd);
    for (const [gd, v] of inputs) profit -= v * GOODS[gd].basePrice * 0.6;
    u += 8 + profit * (def.jobs ?? 1) * 1.5;
    if (id === 'toolmaker' && stockOf(plan.avail, 'tools') < 2) u += 15 + 20 * g.expand;
  }
  if (def.transport) {
    const local = Object.values(s.localStock).reduce((a, v) => a + (v ?? 0), 0);
    u += !s.isCapital && local > 4 ? def.transport * 4 : 0;
  }
  if (def.scholarSlots) u += def.scholarSlots * 4 * g.research;
  if (def.modifiers?.unitCostPct) u += g.military * 12;
  if (def.modifiers?.laborPct) u += def.modifiers.laborPct * 0.8;
  if (id === 'firepit') u += 30;
  u -= def.upkeep * 4;
  u -= def.labor / 6;
  return u;
}

function buildingCandidates(ctx: AiContext, plan: EconomyPlan, s: Settlement): Candidate[] {
  const out: Candidate[] = [];
  for (const id of Object.keys(BUILDINGS)) {
    const item: ProductionItem = { kind: 'building', id };
    if (validateItem(ctx.state, s, item)) continue;
    const u = buildingUtility(ctx, plan, s, id);
    if (!Number.isFinite(u)) continue;
    out.push({ item, utility: u, upkeep: BUILDINGS[id].upkeep });
  }
  return out;
}

/** Stärkste ausbildbare Landeinheit, deren Güter beschaffbar sind. */
export function bestMilitaryUnit(ctx: AiContext, plan: EconomyPlan, s: Settlement, preferRanged: boolean): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const def of Object.values(UNIT_TYPES)) {
    if (def.domain !== 'land' || !isMilitaryDef(def) || def.unitClass === 'recon') continue;
    if (validateItem(ctx.state, s, { kind: 'unit', id: def.id })) continue;
    const cost = itemCost(ctx.state, s, { kind: 'unit', id: def.id });
    if (!goodsObtainable(ctx, plan, cost.goods, cost.labor / constructionLabor(s))) continue;
    const ranged = !!def.rangedStrength;
    let score = Math.max(def.strength, def.rangedStrength ?? 0) - cost.labor * 0.15 - def.upkeep * 2;
    if (ranged === preferRanged) score += 4;
    if (def.unitClass === 'siege' && !ctx.goals.attack) score -= 8;
    if (score > bestScore) {
      bestScore = score;
      best = def.id;
    }
  }
  return best;
}

function desiredMilitary(ctx: AiContext): number {
  const sit = ctx.situation;
  let want = sit.settlements;
  for (const t of Object.values(sit.threat)) want += Math.min(3, Math.floor(t / 12));
  if (sit.wars.length) want += Math.ceil(sit.settlements / 2);
  want += Math.round(ctx.goals.attack * (sit.settlements + 2));
  want += Math.round(ctx.goals.military * 2);
  // Unterhalt begrenzen: höchstens so viele Einheiten, wie die Wirtschaft trägt
  return Math.min(want, 2 + sit.settlements * 3);
}

function unitCandidates(ctx: AiContext, plan: EconomyPlan, s: Settlement): Candidate[] {
  const out: Candidate[] = [];
  const sit = ctx.situation;
  const g = ctx.goals;
  const pop = totalPop(s.pop);
  const threat = sit.threat[s.id] ?? 0;
  const hasGarrison = ctx.view.ownUnits().some((u) => u.tile === s.tile && isMilitary(u));

  // Verteidiger / Militär
  const want = desiredMilitary(ctx);
  if (plan.military < want || (!hasGarrison && threat > 0)) {
    // Für Feldzüge mehr Fernkämpfer (Belagerung), sonst etwa jede dritte Einheit
    const preferRanged = ctx.goals.attack > 0 ? plan.military % 2 === 1 : plan.military % 3 === 2;
    const id = bestMilitaryUnit(ctx, plan, s, preferRanged);
    if (id) {
      const deficit = want - plan.military;
      let u = 22 + 30 * g.military + 25 * g.defend + Math.min(3, deficit) * 6;
      if (!hasGarrison && plan.military < sit.settlements) u += 25;
      if (threat > 5) u += 25;
      out.push({ item: { kind: 'unit', id }, utility: u, upkeep: unitType(id).upkeep });
    }
  }

  // Siedler / Stamm für die Expansion
  const maxFounders = 1 + Math.floor(sit.settlements / 4) + (ctx.plan.queueTarget >= 3 ? 1 : 0);
  if (
    ctx.mem.sites.length > 0 &&
    g.expand >= 0.2 &&
    plan.founders < maxFounders &&
    pop >= 4 &&
    s.report.foodSurplus > 0 &&
    threat < 5 &&
    sit.settlements < 16
  ) {
    let id: string | null = null;
    for (const fid of FOUNDER_IDS) {
      if (validateItem(ctx.state, s, { kind: 'unit', id: fid })) continue;
      const cost = itemCost(ctx.state, s, { kind: 'unit', id: fid });
      if (!goodsObtainable(ctx, plan, cost.goods, cost.labor / constructionLabor(s))) continue;
      id = fid;
      break;
    }
    if (id) {
      let u = 28 + 55 * g.expand + (pop >= housingOf(s) - 1 ? 15 : 0);
      // Einfluss muss für die Gründung reichen (bis zur Ankunft wächst er weiter)
      if (ctx.player.influence + 12 * Math.max(0.5, ctx.player.lastIncome.influence) < campCost(ctx.state, ctx.pid)) u -= 30;
      out.push({ item: { kind: 'unit', id }, utility: u, upkeep: unitType(id).upkeep });
    }
  }

  // Späher, solange keiner unterwegs ist und viel Unbekanntes bleibt
  if (plan.scouts === 0 && ctx.state.turn < 120 && sit.settlements >= 2) {
    const explored = ctx.player.explored.reduce((a, v) => a + v, 0) / ctx.player.explored.length;
    if (explored < 0.45 && !validateItem(ctx.state, s, { kind: 'unit', id: 'scout' })) {
      out.push({ item: { kind: 'unit', id: 'scout' }, utility: 18, upkeep: 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verwaltung

function manageUpgrade(ctx: AiContext, s: Settlement): void {
  if (canUpgradeSettlement(ctx.state, s)) return;
  const target = s.kind === 'camp' ? 'settlement' : 'city';
  const founders = ctx.view.ownUnits().filter(isFounder).length;
  const reserve = founders > 0 ? campCost(ctx.state, ctx.pid) : 0;
  if (ctx.player.influence - UPGRADE_COST[target].influence < reserve && target === 'city') return;
  if (ctx.player.influence - UPGRADE_COST[target].influence < reserve * 0.5) return;
  ctx.issue({ type: 'upgradeSettlement', settlementId: s.id });
}

function managePromotions(ctx: AiContext, s: Settlement): void {
  const pop = totalPop(s.pop);
  if (s.pop.workers < 4 || s.report.foodSurplus < 0.5) return;
  const p = ctx.player;
  const poor = p.lastIncome.gold < 1;
  const citizenTarget = Math.floor(pop / 4) + (poor ? 1 : 0);
  if (s.pop.citizens < citizenTarget && p.gold >= 12 + (poor ? 0 : 10) && !canPromote(ctx.state, s, 'citizens')) {
    ctx.issue({ type: 'promote', settlementId: s.id, to: 'citizens' });
    return;
  }
  if (ctx.goals.research >= 0.3 && p.gold >= 30 && !poor && !canPromote(ctx.state, s, 'scholars')) {
    ctx.issue({ type: 'promote', settlementId: s.id, to: 'scholars' });
  }
}

function manageFocus(ctx: AiContext, s: Settlement): void {
  const surplus = s.report.foodSurplus;
  const pop = totalPop(s.pop);
  const housing = housingOf(s);
  const threat = ctx.situation.threat[s.id] ?? 0;
  let focus: SettlementFocus = 'balanced';
  if (pop < housing && (surplus <= 0.3 || (s.focus === 'food' && surplus < 2.5))) focus = 'food';
  else if (threat > 5 && s.queue.length && (isMilitaryItem(s.queue[0]) || s.queue[0].kind === 'building')) focus = 'construction';
  else if (pop >= housing && surplus > 0 && s.queue.length) focus = 'construction';
  if (surplus < -0.5) focus = 'food';
  if (focus !== s.focus) ctx.issue({ type: 'setFocus', settlementId: s.id, focus });
}

/** Entfernt festgefahrene Aufträge, deren Güter oder Einwohner nicht zu beschaffen sind. */
function cleanQueue(ctx: AiContext, plan: EconomyPlan, s: Settlement): void {
  if (!isHeadStalled(ctx, s.id)) return;
  const item = s.queue[0];
  const cost = itemCost(ctx.state, s, item);
  const missing = missingGoods(ctx, cost.goods);
  let hopeless = false;
  if (cost.popCost && totalPop(s.pop) <= cost.popCost && s.report.foodSurplus <= 0) hopeless = true;
  for (const m of missing) {
    const rate = stockOf(plan.flow, m.good);
    const buyable = plan.trade && ctx.player.gold >= marketPrices(ctx.state, ctx.pid, m.good).buy * Math.ceil(m.amount) + 10;
    if (!buyable && (rate <= 0.05 || m.amount / rate > 12)) hopeless = true;
  }
  if (hopeless) {
    // Güter freigeben
    for (const [g, v] of Object.entries(cost.goods) as [GoodId, number][]) addStock(plan.avail, g, v);
    if (isMilitaryItem(item)) plan.military--;
    if (isFounderItem(item)) plan.founders--;
    ctx.issue({ type: 'dequeue', settlementId: s.id, index: 0 });
  }
}

function fillQueue(ctx: AiContext, plan: EconomyPlan, s: Settlement): void {
  const target = Math.max(1, ctx.plan.queueTarget);
  for (let round = 0; round < 3 && s.queue.length < target && ctx.active; round++) {
    const candidates = [...unitCandidates(ctx, plan, s), ...buildingCandidates(ctx, plan, s), ...improvementCandidates(ctx, plan, s)];
    const labor = constructionLabor(s);
    let best: Candidate | null = null;
    // Leere Bauliste: auch geringen Nutzen annehmen, damit keine Arbeitskraft verfällt
    const minUtility = s.queue.length ? 2 : 0;
    for (const c of candidates) {
      if (c.utility <= minUtility) continue;
      if (c.upkeep > 0 && plan.goldBudget - c.upkeep < 0 && !(isMilitaryItem(c.item) && (ctx.situation.threat[s.id] ?? 0) > 5)) continue;
      const cost = itemCost(ctx.state, s, c.item);
      if (!goodsObtainable(ctx, plan, cost.goods, cost.labor / labor)) continue;
      // lange Bauzeiten abwerten
      const turns = cost.labor / labor;
      const score = c.utility - Math.max(0, turns - 6) * 1.5;
      if (!best || score > best.utility) best = { ...c, utility: score };
    }
    if (!best) return;
    // Weitere Aufträge nur für dringende Vorhaben – lange Listen blockieren bessere Gelegenheiten
    if (s.queue.length >= 1 && best.utility < 45) return;
    if (validateItem(ctx.state, s, best.item)) return;
    const threat = ctx.situation.threat[s.id] ?? 0;
    const hasGarrison = ctx.view.ownUnits().some((u) => u.tile === s.tile && isMilitary(u));
    const front = isMilitaryItem(best.item) && threat > 8 && !hasGarrison && s.queue.length > 0 && !isMilitaryItem(s.queue[0]);
    if (!ctx.issue({ type: 'enqueue', settlementId: s.id, item: best.item, front })) return;
    const cost = itemCost(ctx.state, s, best.item);
    reserveGoods(plan, cost.goods);
    plan.goldBudget -= best.upkeep;
    if (isMilitaryItem(best.item)) plan.military++;
    if (isFounderItem(best.item)) plan.founders++;
    if (best.item.kind === 'unit' && unitType(best.item.id).unitClass === 'recon') plan.scouts++;
  }
}

/** Verwaltet alle eigenen Siedlungen: Aufwertung, Bevölkerung, Schwerpunkt, Bauliste. */
export function manageSettlements(ctx: AiContext): void {
  const plan = buildPlan(ctx);
  const settlements = ctx.view.ownSettlements().sort((a, b) => (ctx.situation.threat[b.id] ?? 0) - (ctx.situation.threat[a.id] ?? 0) || a.id - b.id);
  for (const s of settlements) {
    if (!ctx.active) return;
    if (!ctx.state.settlements[s.id] || ctx.state.settlements[s.id].owner !== ctx.pid) continue;
    manageUpgrade(ctx, s);
    managePromotions(ctx, s);
    manageFocus(ctx, s);
    cleanQueue(ctx, plan, s);
    fillQueue(ctx, plan, s);
  }
}
