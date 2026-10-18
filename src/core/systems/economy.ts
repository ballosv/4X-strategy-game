import { BUILDINGS, type BuildingDef } from '../data/buildings';
import { addStock, FOOD_GOODS, GOODS, stockOf, type GoodId, type Stock } from '../data/goods';
import { IMPROVEMENTS, type ImprovementDef } from '../data/improvements';
import { RESOURCES, TERRAIN } from '../data/terrain';
import { UNIT_TYPES, unitType } from '../data/units';
import { gridOf, hasTech, playerModifiers, settlementModifiers } from '../context';
import { isWater } from '../map/passability';
import { pct } from '../modifiers';
import {
  addLog,
  emptyReport,
  playerSettlements,
  totalPop,
  type GameState,
  type ProductionItem,
  type Settlement,
} from '../state';

export const BASE_HOUSING: Record<Settlement['kind'], number> = { camp: 5, settlement: 10, city: 18 };
export const BASE_TRANSPORT: Record<Settlement['kind'], number> = { camp: 3, settlement: 6, city: 10 };
export const SETTLEMENT_RADIUS: Record<Settlement['kind'], number> = { camp: 1, settlement: 2, city: 3 };

const LEVEL_FACTOR = [0, 1, 1.5, 2, 2.5];

export function ownedTiles(state: GameState, settlementId: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.tileOwner.length; i++) if (state.tileOwner[i] === settlementId) out.push(i);
  return out;
}

export function housingOf(s: Settlement): number {
  return BASE_HOUSING[s.kind] + s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.housing ?? 0), 0);
}

export function scholarSlots(s: Settlement): number {
  return (s.kind === 'city' ? 1 : 0) + s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.scholarSlots ?? 0), 0);
}

export function transportCapacity(state: GameState, s: Settlement): number {
  const mods = playerModifiers(state, s.owner);
  return BASE_TRANSPORT[s.kind] + (mods.transportBonus ?? 0) + s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.transport ?? 0), 0);
}

/** Arbeitskraft einer Siedlung: 1 je Arbeiter, +2 Gemeinschaftsarbeit, Modifikatoren. */
export function laborOf(state: GameState, s: Settlement): number {
  const mods = settlementModifiers(state, s.id);
  return Math.floor(pct(s.pop.workers + 2, mods.laborPct));
}

// ---------------------------------------------------------------------------
// Geländeausbauten

export function improvementJobs(def: ImprovementDef, level: number): number {
  return def.jobs + (level - 1);
}

/** Ertrag je gebundener Arbeitskraft für einen Ausbau auf einem Feld. */
export function improvementYield(state: GameState, tile: number, typeId: string, level: number, owner: number): Partial<Record<GoodId, number>> {
  const def = IMPROVEMENTS[typeId];
  const t = state.map.tiles[tile];
  const out: Partial<Record<GoodId, number>> = {};
  const factor = LEVEL_FACTOR[level] ?? 1;
  for (const [g, v] of Object.entries(def.output) as [GoodId, number][]) out[g] = v * factor;
  if (typeId === 'mine' && t.resource) {
    const res = RESOURCES[t.resource];
    out[res.good] = (out[res.good] ?? 0) + 1 * factor;
  }
  if (t.resource) {
    const res = RESOURCES[t.resource];
    if (out[res.good] !== undefined && typeId !== 'mine') out[res.good]! += res.amount * 0.5;
  }
  if (typeId === 'farm' && t.river) out.grain = (out.grain ?? 0) + 0.5;
  if (typeId === 'farm' && t.terrain === 'grassland') out.grain = (out.grain ?? 0) + 0.5;
  if (typeId === 'fishery') out.meat = (out.meat ?? 0) + (playerModifiers(state, owner).fishBonus ?? 0);
  const harsh = t.terrain === 'desert' || t.terrain === 'tundra' || t.terrain === 'marsh';
  if (harsh && !playerModifiers(state, owner).harshTerrainYield) {
    for (const g of Object.keys(out) as GoodId[]) out[g] = out[g]! * 0.75;
  }
  return out;
}

export function canPlaceImprovement(state: GameState, playerId: number, tile: number, typeId: string): string | null {
  const def = IMPROVEMENTS[typeId];
  if (!def) return 'Unbekannter Ausbau';
  const t = state.map.tiles[tile];
  if (!hasTech(state, playerId, def.tech)) return 'Technologie fehlt';
  if (state.improvements[tile]) return 'Feld ist bereits ausgebaut';
  if (Object.values(state.settlements).some((s) => s.tile === tile)) return 'Siedlungszentrum';
  if (def.water ? !isWater(t) : isWater(t)) return def.water ? 'Nur auf Wasser' : 'Nicht auf Wasser';
  if (def.terrains && !def.terrains.includes(t.terrain)) return `Nicht auf ${TERRAIN[t.terrain].name}`;
  if (def.features && !def.features.includes(t.feature)) return 'Passendes Overlay fehlt';
  if (def.requiresResource && (!t.resource || !def.resources?.includes(t.resource))) return 'Passende Ressource fehlt';
  if (def.resources && t.resource && !def.resources.includes(t.resource) && def.requiresResource) return 'Falsche Ressource';
  if (def.minElevation && t.elevation < def.minElevation && t.feature !== 'rocks' && t.resource !== 'flint') return 'Feld zu niedrig';
  if (def.maxElevation && t.elevation > def.maxElevation) return 'Feld zu hoch';
  if (t.elevation >= 5) return 'Hochgebirge';
  if (t.resource && RESOURCES[t.resource].revealEra > state.players[playerId].era && def.requiresResource) return 'Ressource unbekannt';
  return null;
}

export function improvementOptions(state: GameState, playerId: number, tile: number): string[] {
  return Object.keys(IMPROVEMENTS).filter((id) => canPlaceImprovement(state, playerId, tile, id) === null);
}

/** Nächste Ausbaustufe verfügbar? */
export function canUpgradeImprovement(state: GameState, playerId: number, tile: number): boolean {
  const imp = state.improvements[tile];
  if (!imp) return false;
  const def = IMPROVEMENTS[imp.type];
  if (imp.level >= def.maxLevel) return false;
  const tech = def.levelTechs?.[imp.level - 1];
  return hasTech(state, playerId, tech);
}

// ---------------------------------------------------------------------------
// Produktion (Bauaufträge)

export interface ItemCost {
  labor: number;
  goods: Stock;
  popCost: number;
  name: string;
}

export function itemCost(state: GameState, s: Settlement, item: ProductionItem): ItemCost {
  const mods = settlementModifiers(state, s.id);
  switch (item.kind) {
    case 'unit': {
      const def = unitType(item.id);
      return { labor: Math.ceil(pct(def.labor, mods.unitCostPct)), goods: def.goods, popCost: def.popCost ?? 0, name: def.name };
    }
    case 'building': {
      const def = BUILDINGS[item.id];
      return { labor: Math.ceil(pct(def.labor, mods.buildingCostPct)), goods: def.goods, popCost: 0, name: def.name };
    }
    case 'improvement': {
      const def = IMPROVEMENTS[item.id];
      return { labor: def.labor, goods: def.goods, popCost: 0, name: def.name };
    }
    case 'upgrade': {
      const imp = state.improvements[item.tile];
      const def = IMPROVEMENTS[imp?.type ?? 'farm'];
      const level = imp?.level ?? 1;
      const goods: Stock = {};
      for (const [g, v] of Object.entries(def.goods) as [GoodId, number][]) goods[g] = v * (level + 1);
      if (level >= 2) addStock(goods, 'tools', 1);
      return { labor: def.labor * (level + 1), goods, popCost: 0, name: `${def.name} Stufe ${level + 1}` };
    }
  }
}

export function canBuildBuilding(state: GameState, s: Settlement, id: string): string | null {
  const def: BuildingDef | undefined = BUILDINGS[id];
  if (!def) return 'Unbekanntes Gebäude';
  if (s.buildings.includes(id)) return 'Bereits vorhanden';
  if (s.queue.some((q) => q.kind === 'building' && q.id === id)) return 'Bereits in Auftrag';
  if (!hasTech(state, s.owner, def.tech)) return 'Technologie fehlt';
  if (def.requiresSettlement && s.kind === 'camp') return 'Erst als Siedlung';
  if (def.requiresBuilding && !s.buildings.includes(def.requiresBuilding)) return `Benötigt ${BUILDINGS[def.requiresBuilding].name}`;
  if (def.requiresCoast && !gridOf(state).neighbors(s.tile).some((n) => isWater(state.map.tiles[n]))) return 'Nur an der Küste';
  return null;
}

export function canTrainUnit(state: GameState, s: Settlement, id: string): string | null {
  const def = unitType(id);
  if (def.machineOnly) return 'Nicht verfügbar';
  if (!hasTech(state, s.owner, def.tech)) return 'Technologie fehlt';
  if (def.domain === 'sea' && !gridOf(state).neighbors(s.tile).some((n) => isWater(state.map.tiles[n]))) return 'Nur an der Küste';
  if (def.era < state.players[s.owner].era - 2 && def.unitClass !== 'civilian' && def.unitClass !== 'recon') return 'Veraltet';
  // Veraltete Einheiten ausblenden, wenn ein Nachfolger verfügbar ist
  const successor = Object.values(UNIT_TYPES).find((u) => u.upgradesFrom === id && hasTech(state, s.owner, u.tech) && !u.machineOnly);
  if (successor) return `Ersetzt durch ${successor.name}`;
  return null;
}

// ---------------------------------------------------------------------------
// Arbeitsplätze

interface Job {
  key: string;
  slots: number;
  outputs: Partial<Record<GoodId, number>>;
  inputs: Partial<Record<GoodId, number>>;
  food: boolean;
}

function collectJobs(state: GameState, s: Settlement): Job[] {
  const jobs: Job[] = [];
  for (const tile of ownedTiles(state, s.id)) {
    const imp = state.improvements[tile];
    if (!imp) continue;
    const def = IMPROVEMENTS[imp.type];
    const outputs = improvementYield(state, tile, imp.type, imp.level, s.owner);
    jobs.push({
      key: `t${tile}`,
      slots: improvementJobs(def, imp.level),
      outputs,
      inputs: {},
      food: FOOD_GOODS.some((g) => (outputs[g] ?? 0) > 0),
    });
  }
  for (const b of s.buildings) {
    const def = BUILDINGS[b];
    if (!def?.jobs || !def.recipe) continue;
    jobs.push({ key: `b${b}`, slots: def.jobs, outputs: def.recipe.outputs, inputs: def.recipe.inputs, food: false });
  }
  return jobs;
}

function value(goods: Partial<Record<GoodId, number>>, wanted: Set<GoodId>): number {
  let v = 0;
  for (const [g, n] of Object.entries(goods) as [GoodId, number][]) v += n * GOODS[g].basePrice * (wanted.has(g) ? 3 : 1);
  return v;
}

function foodOf(goods: Partial<Record<GoodId, number>>): number {
  return FOOD_GOODS.reduce((sum, g) => sum + (goods[g] ?? 0), 0);
}

/** Ertrag des Siedlungszentrums (ohne Arbeitskraft). */
export function centerYield(state: GameState, s: Settlement): Partial<Record<GoodId, number>> {
  const t = state.map.tiles[s.tile];
  const out: Partial<Record<GoodId, number>> = { grain: 2, meat: 1, vegetables: 1, wood: 1 };
  if (t.elevation >= 2) out.stone = 1;
  if (t.river) out.grain! += 1;
  if (s.kind === 'settlement') out.grain! += 1;
  if (s.kind === 'city') {
    out.grain! += 2;
    out.vegetables! += 1;
  }
  return out;
}

const CONSTRUCTION_SHARE: Record<Settlement['focus'], number> = { balanced: 0.4, food: 0.25, production: 0.2, construction: 0.7 };

export function foodNeeds(pop: number): Record<'grain' | 'vegetables' | 'meat', number> {
  const grain = Math.ceil(pop * 0.5);
  const meat = Math.ceil(pop * 0.25);
  return { grain, meat, vegetables: Math.max(0, pop - grain - meat) };
}

/**
 * Verteilt die Arbeitskraft und berechnet Erträge einer Siedlung für eine Runde.
 * apply = true verändert den Spielzustand (Lager, Nahrung, Bauaufträge).
 */
export function simulateSettlement(state: GameState, s: Settlement, apply: boolean): void {
  const player = state.players[s.owner];
  const mods = settlementModifiers(state, s.id);
  const report = emptyReport();
  const pop = totalPop(s.pop);
  const labor = laborOf(state, s);
  report.laborTotal = labor;
  report.housing = housingOf(s);

  const produced: Stock = {};
  const consumed: Stock = {};
  for (const [g, v] of Object.entries(centerYield(state, s)) as [GoodId, number][]) addStock(produced, g, v);

  const jobs = collectJobs(state, s);
  const need = foodNeeds(pop);
  report.foodNeed = need;
  const needTotal = pop;
  let laborLeft = labor;
  const assigned = new Map<string, number>();
  const assign = (job: Job, n: number) => {
    assigned.set(job.key, (assigned.get(job.key) ?? 0) + n);
    laborLeft -= n;
    for (const [g, v] of Object.entries(job.outputs) as [GoodId, number][]) addStock(produced, g, v * n);
    for (const [g, v] of Object.entries(job.inputs) as [GoodId, number][]) addStock(consumed, g, v * n);
  };
  const free = (job: Job) => job.slots - (assigned.get(job.key) ?? 0);

  // 1) Nahrung sichern (fehlende Kategorien bevorzugt)
  const foodTarget = s.focus === 'food' ? needTotal + 4 : needTotal + 1;
  const foodJobs = jobs.filter((j) => j.food);
  while (laborLeft > 0 && foodOf(produced) * (1 + (mods.foodPct ?? 0) / 100) < foodTarget) {
    let best: Job | null = null;
    let bestScore = 0;
    for (const j of foodJobs) {
      if (free(j) <= 0) continue;
      let score = foodOf(j.outputs);
      for (const g of FOOD_GOODS) if ((j.outputs[g] ?? 0) > 0 && stockOf(produced, g) < need[g]) score += 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (!best) break;
    assign(best, 1);
  }

  // 2) Reserve für Bauaufträge
  const reserve = s.queue.length ? Math.round(laborLeft * CONSTRUCTION_SHARE[s.focus]) : 0;
  let jobLabor = laborLeft - reserve;

  // 3) Rohstoffe und Industrie nach Wert, fehlende Güter für den Bauauftrag bevorzugt
  const wanted = new Set<GoodId>();
  const current = s.queue[0];
  if (current) {
    const cost = itemCost(state, s, current);
    for (const g of Object.keys(cost.goods) as GoodId[]) if (stockOf(player.stock, g) < (cost.goods[g] ?? 0)) wanted.add(g);
  }
  const available = (g: GoodId) => stockOf(player.stock, g) + stockOf(s.localStock, g) + stockOf(produced, g) - stockOf(consumed, g);
  while (jobLabor > 0) {
    let best: Job | null = null;
    let bestScore = 0;
    for (const j of jobs) {
      if (free(j) <= 0) continue;
      const inputsOk = (Object.entries(j.inputs) as [GoodId, number][]).every(([g, v]) => available(g) >= v);
      if (!inputsOk) continue;
      const score = value(j.outputs, wanted) - value(j.inputs, new Set()) * 0.8 + (j.food && s.focus === 'food' ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (!best) break;
    assign(best, 1);
    jobLabor--;
  }

  report.laborBound = labor - laborLeft;
  report.laborFree = laborLeft;
  for (const [k, v] of assigned) report.jobs[k] = v;

  // Nahrung
  const foodBonus = 1 + (mods.foodPct ?? 0) / 100;
  for (const g of FOOD_GOODS) report.foodHave[g] = Math.round(stockOf(produced, g) * foodBonus * 10) / 10;
  const foodTotal = foodOf(produced) * foodBonus + s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.yields?.food ?? 0), 0);
  const variety = FOOD_GOODS.every((g) => report.foodHave[g] >= need[g]);
  let surplus = foodTotal - needTotal;
  if (surplus > 0 && variety) surplus *= 1.25;
  surplus = pct(surplus, surplus > 0 ? mods.growthPct : 0);
  report.foodSurplus = Math.round(surplus * 10) / 10;
  report.growthNeeded = growthThreshold(pop);

  // Gold / Entwicklung / Einfluss
  const yields = s.buildings.map((b) => BUILDINGS[b]?.yields ?? {});
  report.gold = pct(1 + s.pop.citizens * 1.5 + (mods.goldPerSettlement ?? 0) + yields.reduce((a, y) => a + (y.gold ?? 0), 0), mods.goldPct);
  report.research = pct(1 + s.pop.scholars * 2 + (mods.researchPerSettlement ?? 0) + yields.reduce((a, y) => a + (y.research ?? 0), 0), mods.researchPct);
  report.influence = pct((s.isCapital ? 2 : 0.5) + s.pop.citizens * 0.3 + (mods.influencePerSettlement ?? 0) + yields.reduce((a, y) => a + (y.influence ?? 0), 0), mods.influencePct);
  report.transport = s.isCapital ? Infinity : transportCapacity(state, s);
  report.produced = { ...produced };
  report.consumed = { ...consumed };

  if (!apply) {
    s.report = report;
    return;
  }

  // Güter: Nahrung bleibt lokal, Rest ins lokale Lager
  for (const [g, v] of Object.entries(produced) as [GoodId, number][]) {
    if (GOODS[g].category === 'food') continue;
    addStock(s.localStock, g, v);
    player.stats.goodsProduced += v;
  }
  // Verbrauch der Industrie: erst lokal, dann national
  for (const [g, v] of Object.entries(consumed) as [GoodId, number][]) {
    const local = Math.min(stockOf(s.localStock, g), v);
    addStock(s.localStock, g, -local);
    addStock(player.stock, g, -(v - local));
  }
  // Transport ins Nationallager
  let capacity = s.isCapital ? Infinity : report.transport;
  for (const g of Object.keys(s.localStock) as GoodId[]) {
    const amount = Math.min(stockOf(s.localStock, g), capacity);
    if (amount <= 0) continue;
    addStock(s.localStock, g, -amount);
    addStock(player.stock, g, amount);
    capacity -= amount;
    if (capacity <= 0) break;
  }
  for (const g of Object.keys(s.localStock) as GoodId[]) if (stockOf(s.localStock, g) <= 1e-6) delete s.localStock[g];

  // Wachstum
  applyGrowth(state, s, surplus, report);

  // Bauauftrag
  applyConstruction(state, s, laborLeft, report);

  s.report = report;
}

export function growthThreshold(pop: number): number {
  return 8 + pop * 4;
}

function applyGrowth(state: GameState, s: Settlement, surplus: number, report: ReturnType<typeof emptyReport>): void {
  const pop = totalPop(s.pop);
  const cap = housingOf(s);
  if (surplus >= 0) {
    if (pop >= cap) {
      // Überschuss geht als Getreide ins Lager
      addStock(s.localStock, 'grain', Math.floor(surplus));
      s.food = Math.min(s.food, growthThreshold(pop));
      report.stalled = report.stalled ?? 'Wohnraum voll';
      return;
    }
    s.food += surplus;
    if (s.food >= growthThreshold(pop)) {
      s.food -= growthThreshold(pop);
      s.pop.workers += 1;
      addLog(state, { player: s.owner, kind: 'economy', text: `${s.name} wächst auf ${pop + 1} Einwohner.`, tile: s.tile });
    }
  } else {
    s.food += surplus;
    if (s.food < 0) {
      s.food = 0;
      if (pop > 1) {
        if (s.pop.workers > 0) s.pop.workers--;
        else if (s.pop.citizens > 0) s.pop.citizens--;
        else s.pop.scholars--;
        addLog(state, { player: s.owner, kind: 'warning', text: `Hungersnot in ${s.name}: Ein Einwohner ist verloren.`, tile: s.tile });
      }
    }
  }
}

function applyConstruction(state: GameState, s: Settlement, freeLabor: number, report: ReturnType<typeof emptyReport>): void {
  const item = s.queue[0];
  if (!item) return;
  const player = state.players[s.owner];
  s.laborProgress += freeLabor;
  const cost = itemCost(state, s, item);
  if (s.laborProgress < cost.labor) return;
  s.laborProgress = cost.labor;
  for (const [g, v] of Object.entries(cost.goods) as [GoodId, number][]) {
    if (stockOf(player.stock, g) + 1e-9 < v) {
      report.stalled = `Es fehlt: ${GOODS[g].name}`;
      return;
    }
  }
  if (cost.popCost && totalPop(s.pop) <= cost.popCost) {
    report.stalled = 'Zu wenig Einwohner';
    return;
  }
  const error = completeItem(state, s, item);
  if (error) {
    // Auftrag ist ungültig geworden (z. B. Feld verloren) – verwerfen
    addLog(state, { player: s.owner, kind: 'warning', text: `${s.name}: ${cost.name} abgebrochen (${error}).`, tile: s.tile });
    s.queue.shift();
    s.laborProgress = 0;
    return;
  }
  for (const [g, v] of Object.entries(cost.goods) as [GoodId, number][]) addStock(player.stock, g, -v);
  for (let i = 0; i < cost.popCost; i++) {
    if (s.pop.workers > 0) s.pop.workers--;
    else if (s.pop.citizens > 0) s.pop.citizens--;
  }
  s.queue.shift();
  s.laborProgress = 0;
  addLog(state, { player: s.owner, kind: 'economy', text: `${s.name}: ${cost.name} fertiggestellt.`, tile: s.tile });
}

/** Hook für die Fertigstellung; wird von game.ts gesetzt, um zirkuläre Importe zu vermeiden. */
export let completeItem: (state: GameState, s: Settlement, item: ProductionItem) => string | null = () => 'nicht initialisiert';
export function setCompleteItemHandler(fn: typeof completeItem): void {
  completeItem = fn;
}

/** Rundenwirtschaft eines Spielers: Siedlungen, Gold, Entwicklung, Einfluss. */
export function processEconomy(state: GameState, playerId: number): { gold: number; research: number; influence: number; goldIncome: number; goldExpenses: number } {
  const player = state.players[playerId];
  const mods = playerModifiers(state, playerId);
  let goldIncome = 0;
  let research = 0;
  let influence = 0;
  let buildingUpkeep = 0;
  for (const s of playerSettlements(state, playerId)) {
    simulateSettlement(state, s, true);
    goldIncome += s.report.gold;
    research += s.report.research;
    influence += s.report.influence;
    buildingUpkeep += s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.upkeep ?? 0), 0);
  }
  let unitUpkeep = 0;
  for (const u of Object.values(state.units)) if (u.owner === playerId) unitUpkeep += unitType(u.type).upkeep;
  unitUpkeep = pct(unitUpkeep, mods.upkeepPct);
  // Die ersten zwei Einheiten-Unterhaltspunkte sind frei (Stammesgefolge)
  unitUpkeep = Math.max(0, unitUpkeep - 2);
  const goldExpenses = unitUpkeep + buildingUpkeep;
  const net = goldIncome - goldExpenses;
  player.gold += net;
  player.influence += influence;
  player.stats.influenceEarned += influence;
  player.stats.researchEarned += research;
  if (player.gold < 0) {
    addLog(state, { player: playerId, kind: 'warning', text: 'Die Staatskasse ist leer! Einheiten verlieren Moral (−10 LP).' });
    for (const u of Object.values(state.units)) if (u.owner === playerId) u.hp = Math.max(10, u.hp - 10);
    player.gold = 0;
  }
  player.lastIncome = { gold: net, goldIncome, goldExpenses, research, influence };
  return { gold: net, research, influence, goldIncome, goldExpenses };
}

/** Vorschau der Wirtschaft ohne Zustandsänderung (für die UI). */
export function refreshReports(state: GameState, playerId: number): void {
  let goldIncome = 0;
  let research = 0;
  let influence = 0;
  let buildingUpkeep = 0;
  for (const s of playerSettlements(state, playerId)) {
    simulateSettlement(state, s, false);
    goldIncome += s.report.gold;
    research += s.report.research;
    influence += s.report.influence;
    buildingUpkeep += s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.upkeep ?? 0), 0);
  }
  const mods = playerModifiers(state, playerId);
  let unitUpkeep = 0;
  for (const u of Object.values(state.units)) if (u.owner === playerId) unitUpkeep += unitType(u.type).upkeep;
  unitUpkeep = Math.max(0, pct(unitUpkeep, mods.upkeepPct) - 2);
  const goldExpenses = unitUpkeep + buildingUpkeep;
  state.players[playerId].lastIncome = { gold: goldIncome - goldExpenses, goldIncome, goldExpenses, research, influence };
}
