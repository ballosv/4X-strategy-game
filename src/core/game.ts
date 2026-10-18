import { BUILDINGS } from './data/buildings';
import { CIVS } from './data/civs';
import { ERAS } from './data/eras';
import { GOODS, addStock, stockOf, type GoodId } from './data/goods';
import { IMPROVEMENTS } from './data/improvements';
import { POLICIES } from './data/policies';
import { TECHS, techCost } from './data/techs';
import { unitType } from './data/units';
import { gridOf, hasTech, playerModifiers } from './context';
import { generateMap } from './map/generator';
import { isPassableLand, isWater, landComponents } from './map/passability';
import { chooseStartPositions } from './map/startPositions';
import { MAP_SIZES } from './map/types';
import { Rng } from './rng';
import {
  STATE_VERSION,
  addLog,
  playerSettlements,
  playerUnits,
  settlementAt,
  totalPop,
  type GameSettings,
  type GameState,
  type Player,
  type PlayerKind,
  type ProductionItem,
  type Settlement,
  type SettlementFocus,
  type Unit,
} from './state';
import { MAX_HP, canAttack, healUnits, resolveAttack } from './systems/combat';
import {
  canBuildBuilding,
  canPlaceImprovement,
  canTrainUnit,
  canUpgradeImprovement,
  processEconomy,
  refreshReports,
  setCompleteItemHandler,
} from './systems/economy';
import { checkMilestones, score } from './systems/legacy';
import { buildOccupancy, findPath, maxMoves, occupancyState, terrainStepCost, BLOCKED } from './systems/movement';
import { canResearch, grantTech, processResearch, setAiTechHandler } from './systems/research';
import {
  canFoundAt,
  canPromote,
  canUpgradeSettlement,
  campCost,
  claimTiles,
  demote,
  foundSettlement,
  promote,
  upgradeSettlement,
} from './systems/settlements';
import { computeVisibility, updateExplored } from './systems/vision';
import { canBuildRoad, logRoadDone, nextAutoRoadTile, progressRoadWork, startRoadWork } from './systems/transport';

export class SetupError extends Error {}

const STARTING_GOLD = 20;

function newPlayer(id: number, name: string, civId: string, kind: PlayerKind, color: string, mapSize: number): Player {
  return {
    id,
    name,
    civId,
    kind,
    color,
    alive: true,
    era: 0,
    gold: STARTING_GOLD,
    influence: 5,
    research: { current: null, progress: 0 },
    techs: [],
    stock: { wood: 4, stone: 2 },
    explored: new Array(mapSize).fill(0),
    policies: [],
    legacy: { points: 0, milestones: [] },
    stats: {
      unitsKilled: 0,
      unitsLost: 0,
      settlementsFounded: 0,
      settlementsCaptured: 0,
      goodsProduced: 0,
      influenceEarned: 0,
      researchEarned: 0,
      tilesExplored: 0,
    },
    relations: {},
    favor: {},
    lastIncome: { gold: 0, goldIncome: 0, goldExpenses: 0, research: 0, influence: 0 },
  };
}

export function createUnit(state: GameState, owner: number, type: string, tile: number): Unit {
  const id = state.nextId++;
  const unit: Unit = {
    id,
    type,
    owner,
    tile,
    hp: MAX_HP,
    movesLeft: 0,
    xp: 0,
    status: 'ready',
    fortifyTurns: 0,
    destination: null,
    hasAttacked: false,
  };
  state.units[id] = unit;
  unit.movesLeft = maxMoves(state, unit);
  return unit;
}

/** Freies, begehbares Nachbarfeld für eine neue Einheit. */
export function findSpawnTile(state: GameState, owner: number, center: number, type: string): number {
  const grid = gridOf(state);
  const def = unitType(type);
  const probe: Unit = { id: -1, type, owner, tile: center, hp: 100, movesLeft: 0, xp: 0, status: 'ready', fortifyTurns: 0, destination: null, hasAttacked: false };
  const idx = buildOccupancy(state);
  for (let r = 0; r <= 3; r++) {
    for (const t of grid.ring(center, r)) {
      const tile = state.map.tiles[t];
      if (def.domain === 'land' && !isPassableLand(tile)) continue;
      if (def.domain === 'sea' && !isWater(tile) && t !== center) continue;
      if (occupancyState(state, probe, t, idx) !== 'free') continue;
      return t;
    }
  }
  return -1;
}

export function createGame(settings: GameSettings): GameState {
  const size = MAP_SIZES[settings.mapSize];
  if (settings.players.length < 2) throw new SetupError('Mindestens zwei Spieler werden benötigt.');
  if (settings.players.length > size.maxPlayers) {
    throw new SetupError(`Auf einer Karte der Größe „${size.name}“ sind höchstens ${size.maxPlayers} Spieler möglich.`);
  }
  // Mehrere Kartenversuche, falls die Startpositionen nicht passen
  for (let attempt = 0; attempt < 6; attempt++) {
    const seed = attempt === 0 ? settings.seed : `${settings.seed}#${attempt}`;
    const map = generateMap({ type: settings.mapType, size: settings.mapSize, seed });
    const grid = gridOf({ map });
    const rng = Rng.fromSeed(`${seed}/start`);
    const total = settings.players.length + settings.cityStates;
    const res = chooseStartPositions(map, grid, settings.players.length, rng, settings.minStartDistance);
    if (!res.ok) {
      if (attempt === 5) throw new SetupError(res.message ?? 'Keine gültigen Startpositionen gefunden.');
      continue;
    }
    const state: GameState = {
      version: STATE_VERSION,
      settings,
      turn: 1,
      year: ERAS[0].startYear,
      currentPlayer: 0,
      phase: 'human',
      map,
      players: [],
      units: {},
      settlements: {},
      improvements: {},
      tileOwner: new Array(grid.size).fill(-1),
      nextId: 1,
      rngState: rng.state,
      log: [],
      market: Object.fromEntries(Object.values(GOODS).map((g) => [g.id, g.basePrice])),
      curiosities: [],
      roads: {},
      machinePlayer: null,
      gameOver: null,
    };
    const usedCivs = new Set<string>();
    settings.players.forEach((ps, i) => {
      let civ = CIVS.find((c) => c.id === ps.civId && !usedCivs.has(c.id));
      if (!civ) civ = CIVS.find((c) => !usedCivs.has(c.id))!;
      usedCivs.add(civ.id);
      state.players.push(newPlayer(i, ps.name ?? civ.name, civ.id, ps.kind, civ.color, grid.size));
    });
    // Startpositionen zufällig zuordnen, damit Spieler 1 nicht immer gleich startet
    const positions = rng.shuffle([...res.positions]);
    state.players.forEach((p, i) => {
      const start = positions[i];
      createUnit(state, p.id, 'tribe', start);
      const scoutTile = findSpawnTile(state, p.id, start, 'scout');
      if (scoutTile >= 0) createUnit(state, p.id, 'scout', scoutTile);
      createUnit(state, p.id, 'clubman', start);
    });
    placeCityStates(state, rng, settings.cityStates, res.positions);
    placeCuriosities(state, rng);
    state.rngState = rng.state;
    for (const p of state.players) updateExplored(state, p.id);
    for (const p of state.players) if (p.kind !== 'cityState') p.stats.tilesExplored = 0;
    void total;
    addLog(state, { player: -1, kind: 'info', text: 'Eure Reise beginnt. Führt euren Stamm zu einem guten Lagerplatz.' });
    return state;
  }
  throw new SetupError('Keine gültige Karte gefunden.');
}

function placeCityStates(state: GameState, rng: Rng, count: number, starts: number[]): void {
  if (count <= 0) return;
  const grid = gridOf(state);
  const { ids, sizes } = landComponents(state.map, grid);
  const taken = [...starts];
  const candidates: number[] = [];
  for (let i = 0; i < grid.size; i++) {
    const t = state.map.tiles[i];
    if (ids[i] < 0 || sizes[ids[i]] < 12 || t.elevation > 3 || t.terrain === 'snow') continue;
    candidates.push(i);
  }
  rng.shuffle(candidates);
  const names = ['Bernfurt', 'Kalmar', 'Odessia', 'Velmora', 'Tarnis', 'Quellenruh', 'Ysmar', 'Dravik', 'Solenne', 'Marbek', 'Urdal', 'Fenwick'];
  const colors = ['#9b9b9b', '#8c7a6b', '#7a8c8a', '#8a7f9c', '#9c8a6e', '#6e8a9c'];
  let made = 0;
  for (const c of candidates) {
    if (made >= count) break;
    const minDist = Math.min(...taken.map((t) => grid.distance(t, c)));
    if (minDist < 8) continue;
    const id = state.players.length;
    const p = newPlayer(id, names[made % names.length], 'citystate', 'cityState', colors[made % colors.length], grid.size);
    p.era = 0;
    state.players.push(p);
    const s = foundSettlement(state, id, c, 'settlement', 4);
    s.buildings.push('palisade');
    createUnit(state, id, 'clubman', c);
    taken.push(c);
    made++;
  }
}

function placeCuriosities(state: GameState, rng: Rng): void {
  const grid = gridOf(state);
  const count = Math.round(grid.size / 90);
  const candidates = state.map.tiles.map((_, i) => i).filter((i) => isPassableLand(state.map.tiles[i]));
  rng.shuffle(candidates);
  const occupied = new Set(Object.values(state.units).map((u) => u.tile));
  for (const c of candidates) {
    if (state.curiosities.length >= count) break;
    if (occupied.has(c) || state.tileOwner[c] >= 0) continue;
    if (state.curiosities.some((o) => grid.distance(o, c) < 4)) continue;
    state.curiosities.push(c);
  }
}

// ---------------------------------------------------------------------------
// Befehle

export type UnitActionId =
  | 'fortify'
  | 'sentry'
  | 'skip'
  | 'wake'
  | 'explore'
  | 'heal'
  | 'disband'
  | 'foundCamp'
  | 'foundSettlement'
  | 'buildRoad'
  | 'buildRail'
  | 'autoRoad';

export type Command =
  | { type: 'move'; unitId: number; target: number }
  | { type: 'attack'; unitId: number; target: number }
  | { type: 'unitAction'; unitId: number; action: UnitActionId }
  | { type: 'enqueue'; settlementId: number; item: ProductionItem; front?: boolean }
  | { type: 'dequeue'; settlementId: number; index: number }
  | { type: 'setFocus'; settlementId: number; focus: SettlementFocus }
  | { type: 'setJob'; settlementId: number; key: string; count: number | null }
  | { type: 'upgradeSettlement'; settlementId: number }
  | { type: 'promote'; settlementId: number; to: 'citizens' | 'scholars' }
  | { type: 'demote'; settlementId: number; from: 'citizens' | 'scholars' }
  | { type: 'setResearch'; tech: string }
  | { type: 'adoptPolicy'; policy: string; replace?: string }
  | { type: 'trade'; good: GoodId; amount: number }
  | { type: 'declareWar'; target: number }
  | { type: 'makePeace'; target: number }
  | { type: 'sendEnvoy'; target: number }
  | { type: 'endTurn' };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

const ok: CommandResult = { ok: true };
const fail = (error: string): CommandResult => ({ ok: false, error });

export function applyCommand(state: GameState, playerId: number, cmd: Command): CommandResult {
  if (state.gameOver) return fail('Das Spiel ist beendet');
  if (state.currentPlayer !== playerId) return fail('Nicht am Zug');
  switch (cmd.type) {
    case 'move':
      return moveUnit(state, playerId, cmd.unitId, cmd.target);
    case 'attack': {
      const unit = state.units[cmd.unitId];
      if (!unit || unit.owner !== playerId) return fail('Einheit nicht gefunden');
      const err = canAttack(state, unit, cmd.target);
      if (err) return fail(err);
      resolveAttack(state, unit, cmd.target);
      afterChange(state, playerId);
      return ok;
    }
    case 'unitAction':
      return unitAction(state, playerId, cmd.unitId, cmd.action);
    case 'enqueue': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      const err = validateItem(state, s, cmd.item);
      if (err) return fail(err);
      if (s.queue.length >= 8) return fail('Bauliste ist voll');
      if (cmd.front) {
        s.queue.unshift(cmd.item);
        s.laborProgress = 0;
      } else s.queue.push(cmd.item);
      refreshReports(state, playerId);
      return ok;
    }
    case 'dequeue': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s || cmd.index < 0 || cmd.index >= s.queue.length) return fail('Ungültig');
      s.queue.splice(cmd.index, 1);
      if (cmd.index === 0) s.laborProgress = 0;
      refreshReports(state, playerId);
      return ok;
    }
    case 'setFocus': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      s.focus = cmd.focus;
      refreshReports(state, playerId);
      return ok;
    }
    case 'setJob': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      if (cmd.count === null) {
        if (s.jobOverrides) delete s.jobOverrides[cmd.key];
      } else {
        if (!Number.isInteger(cmd.count) || cmd.count < 0) return fail('Ungültige Anzahl');
        s.jobOverrides = { ...(s.jobOverrides ?? {}), [cmd.key]: cmd.count };
      }
      refreshReports(state, playerId);
      return ok;
    }
    case 'upgradeSettlement': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      const err = canUpgradeSettlement(state, s);
      if (err) return fail(err);
      upgradeSettlement(state, s);
      afterChange(state, playerId);
      return ok;
    }
    case 'promote': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      const err = canPromote(state, s, cmd.to);
      if (err) return fail(err);
      promote(state, s, cmd.to);
      refreshReports(state, playerId);
      return ok;
    }
    case 'demote': {
      const s = ownSettlement(state, playerId, cmd.settlementId);
      if (!s) return fail('Siedlung nicht gefunden');
      demote(s, cmd.from);
      refreshReports(state, playerId);
      return ok;
    }
    case 'setResearch': {
      const err = canResearch(state, playerId, cmd.tech);
      if (err) return fail(err);
      state.players[playerId].research.current = cmd.tech;
      // Gesammelte Punkte sofort anrechnen
      const p = state.players[playerId];
      if (p.research.progress >= techCost(cmd.tech)) processResearch(state, playerId, 0);
      return ok;
    }
    case 'adoptPolicy':
      return adoptPolicy(state, playerId, cmd.policy, cmd.replace);
    case 'trade':
      return trade(state, playerId, cmd.good, cmd.amount);
    case 'declareWar': {
      const target = state.players[cmd.target];
      if (!target || target.id === playerId) return fail('Ungültig');
      state.players[playerId].relations[cmd.target] = 'war';
      target.relations[playerId] = 'war';
      addLog(state, { player: playerId, kind: 'diplomacy', text: `${state.players[playerId].name} erklärt ${target.name} den Krieg!` });
      return ok;
    }
    case 'makePeace': {
      const target = state.players[cmd.target];
      if (!target || target.kind === 'machine') return fail('Frieden ist nicht möglich');
      state.players[playerId].relations[cmd.target] = 'peace';
      target.relations[playerId] = 'peace';
      addLog(state, { player: playerId, kind: 'diplomacy', text: `${state.players[playerId].name} schließt Frieden mit ${target.name}.` });
      return ok;
    }
    case 'sendEnvoy': {
      const target = state.players[cmd.target];
      const p = state.players[playerId];
      if (!target || target.kind !== 'cityState') return fail('Nur an Stadtstaaten');
      if (p.influence < ENVOY_COST) return fail(`Benötigt ${ENVOY_COST} Einfluss`);
      p.influence -= ENVOY_COST;
      target.favor[playerId] = (target.favor[playerId] ?? 0) + 1;
      addLog(state, { player: playerId, kind: 'diplomacy', text: `Gesandter nach ${target.name} entsandt (Gunst ${target.favor[playerId]}).` });
      return ok;
    }
    case 'endTurn':
      endTurn(state);
      return ok;
  }
}

export const ENVOY_COST = 15;

function ownSettlement(state: GameState, playerId: number, id: number): Settlement | null {
  const s = state.settlements[id];
  return s && s.owner === playerId ? s : null;
}

export function validateItem(state: GameState, s: Settlement, item: ProductionItem): string | null {
  switch (item.kind) {
    case 'unit':
      return canTrainUnit(state, s, item.id);
    case 'building':
      return canBuildBuilding(state, s, item.id);
    case 'improvement': {
      if (state.tileOwner[item.tile] !== s.id) return 'Feld gehört nicht zur Siedlung';
      if (s.queue.some((q) => (q.kind === 'improvement' || q.kind === 'upgrade') && q.tile === item.tile)) return 'Bereits in Auftrag';
      return canPlaceImprovement(state, s.owner, item.tile, item.id);
    }
    case 'upgrade': {
      if (state.tileOwner[item.tile] !== s.id) return 'Feld gehört nicht zur Siedlung';
      if (s.queue.some((q) => (q.kind === 'improvement' || q.kind === 'upgrade') && q.tile === item.tile)) return 'Bereits in Auftrag';
      return canUpgradeImprovement(state, s.owner, item.tile) ? null : 'Keine Ausbaustufe verfügbar';
    }
  }
}

setCompleteItemHandler((state, s, item) => {
  switch (item.kind) {
    case 'unit': {
      const tile = findSpawnTile(state, s.owner, s.tile, item.id);
      if (tile < 0) return 'Kein Platz für die Einheit';
      const u = createUnit(state, s.owner, item.id, tile);
      u.movesLeft = 0;
      return null;
    }
    case 'building':
      if (s.buildings.includes(item.id)) return 'Bereits vorhanden';
      s.buildings.push(item.id);
      return null;
    case 'improvement': {
      if (state.tileOwner[item.tile] !== s.id) return 'Feld verloren';
      const err = canPlaceImprovement(state, s.owner, item.tile, item.id);
      if (err) return err;
      state.improvements[item.tile] = { type: item.id, level: 1, settlement: s.id };
      if (IMPROVEMENTS[item.id].clearsFeature) state.map.tiles[item.tile].feature = null;
      return null;
    }
    case 'upgrade': {
      const imp = state.improvements[item.tile];
      if (!imp || state.tileOwner[item.tile] !== s.id) return 'Feld verloren';
      imp.level++;
      return null;
    }
  }
});

function adoptPolicy(state: GameState, playerId: number, policyId: string, replace?: string): CommandResult {
  const p = state.players[playerId];
  const def = POLICIES[policyId];
  if (!def) return fail('Unbekannte Politik');
  if (p.policies.includes(policyId)) return fail('Bereits eingeführt');
  if (!hasTech(state, playerId, def.tech) || def.era > p.era) return fail('Noch nicht verfügbar');
  const cost = policyCost(def.cost, p.era);
  if (p.influence < cost) return fail(`Benötigt ${cost} Einfluss`);
  const slots = ERAS[p.era].policySlots;
  if (replace) {
    const i = p.policies.indexOf(replace);
    if (i < 0) return fail('Zu ersetzende Politik nicht aktiv');
    p.policies.splice(i, 1);
  } else if (p.policies.length >= slots) return fail('Keine freien Politik-Plätze');
  p.influence -= cost;
  p.policies.push(policyId);
  addLog(state, { player: playerId, kind: 'info', text: `Politik eingeführt: ${def.name}` });
  refreshReports(state, playerId);
  return ok;
}

/** Politiken werden mit jedem Zeitalter teurer (Einfluss als dauerhafte Ressource). */
export function policyCost(base: number, era: number): number {
  return Math.round(base * (1 + era * 0.5));
}

export const MARKET_SPREAD = 0.2;

export function marketPrices(state: GameState, playerId: number, good: GoodId): { buy: number; sell: number } {
  const spread = Math.max(0.05, MARKET_SPREAD + (playerModifiers(state, playerId).tradeSpread ?? 0));
  const mid = state.market[good] ?? GOODS[good].basePrice;
  return { buy: Math.ceil(mid * (1 + spread)), sell: Math.max(1, Math.floor(mid * (1 - spread))) };
}

export function canTrade(state: GameState, playerId: number): boolean {
  return playerSettlements(state, playerId).some((s) => s.buildings.includes('market')) || hasTech(state, playerId, 'currency');
}

function trade(state: GameState, playerId: number, good: GoodId, amount: number): CommandResult {
  if (!canTrade(state, playerId)) return fail('Handel erfordert die Technologie Währung');
  const p = state.players[playerId];
  if (!GOODS[good] || !Number.isInteger(amount) || amount === 0) return fail('Ungültig');
  const { buy, sell } = marketPrices(state, playerId, good);
  if (amount > 0) {
    if (p.gold < buy * amount) return fail('Nicht genug Gold');
    p.gold -= buy * amount;
    addStock(p.stock, good, amount);
    state.market[good] = (state.market[good] ?? GOODS[good].basePrice) * (1 + 0.03 * amount);
  } else {
    if (stockOf(p.stock, good) < -amount) return fail('Nicht genug im Lager');
    addStock(p.stock, good, amount);
    p.gold += sell * -amount;
    state.market[good] = Math.max(GOODS[good].basePrice * 0.4, (state.market[good] ?? GOODS[good].basePrice) * (1 - 0.03 * -amount));
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Einheiten

function moveUnit(state: GameState, playerId: number, unitId: number, target: number): CommandResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== playerId) return fail('Einheit nicht gefunden');
  const player = state.players[playerId];
  const vis = computeVisibility(state, playerId);
  const path = findPath(state, unit, target, { explored: player.explored, visible: vis });
  if (!path) return fail('Kein Weg dorthin');
  unit.destination = target;
  unit.status = 'ready';
  unit.work = null;
  unit.fortifyTurns = 0;
  followPath(state, unit, path);
  if (unit.tile === target) unit.destination = null;
  afterChange(state, playerId);
  return ok;
}

/** Zieht die Einheit entlang des Pfades, solange Bewegungspunkte reichen. */
function followPath(state: GameState, unit: Unit, path: number[]): void {
  const full = maxMoves(state, unit);
  const def = unitType(unit.type);
  for (let i = 0; i < path.length; i++) {
    if (unit.movesLeft <= 0) break;
    const next = path[i];
    const idx = buildOccupancy(state);
    const cost = terrainStepCost(state, unit.owner, def, unit.tile, next, idx);
    if (cost === BLOCKED) {
      unit.destination = null; // Weg ist versperrt (neu entdeckt)
      break;
    }
    const occ = occupancyState(state, unit, next, idx);
    if (occ === 'blocked') {
      unit.destination = null;
      break;
    }
    if (cost > unit.movesLeft && unit.movesLeft < full) break;
    // Nicht auf einem besetzten eigenen Feld stehen bleiben
    if (occ === 'pass') {
      const after = path[i + 1];
      const remaining = Math.max(0, unit.movesLeft - Math.min(cost, unit.movesLeft));
      if (after === undefined || remaining <= 0) break;
    }
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);
    unit.tile = next;
    onEnterTile(state, unit);
    // neue Sicht kann den Weg verändern
    const before = state.players[unit.owner].stats.tilesExplored;
    updateExplored(state, unit.owner);
    if (state.players[unit.owner].stats.tilesExplored !== before && i < path.length - 1) {
      const rest = path.slice(i + 1);
      const restIdx = buildOccupancy(state);
      const blockedAhead = rest.some((t, k) => {
        const from = k === 0 ? unit.tile : rest[k - 1];
        return terrainStepCost(state, unit.owner, def, from, t, restIdx) === BLOCKED;
      });
      if (blockedAhead) {
        const vis = computeVisibility(state, unit.owner);
        const newPath = unit.destination !== null ? findPath(state, unit, unit.destination, { explored: state.players[unit.owner].explored, visible: vis }) : null;
        if (!newPath) {
          unit.destination = null;
          break;
        }
        followPath(state, unit, newPath);
        return;
      }
    }
  }
}

function onEnterTile(state: GameState, unit: Unit): void {
  const i = state.curiosities.indexOf(unit.tile);
  if (i < 0) return;
  state.curiosities.splice(i, 1);
  const player = state.players[unit.owner];
  const rng = new Rng(state.rngState);
  const roll = rng.int(0, 3);
  state.rngState = rng.state;
  let text: string;
  switch (roll) {
    case 0:
      player.gold += 15;
      text = 'Ein vergessenes Depot: +15 Gold';
      break;
    case 1:
      player.influence += 8;
      text = 'Eine heilige Stätte: +8 Einfluss';
      break;
    case 2:
      player.research.progress += 10;
      text = 'Alte Felszeichnungen: +10 Entwicklung';
      break;
    default:
      addStock(player.stock, 'wood', 4);
      addStock(player.stock, 'stone', 3);
      text = 'Verlassenes Lager: +4 Holz, +3 Stein';
  }
  addLog(state, { player: unit.owner, kind: 'info', text: `Kuriosität entdeckt! ${text}`, tile: unit.tile });
}

function unitAction(state: GameState, playerId: number, unitId: number, action: UnitActionId): CommandResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== playerId) return fail('Einheit nicht gefunden');
  const def = unitType(unit.type);
  switch (action) {
    case 'fortify':
      if (def.strength <= 0) return fail('Zivile Einheiten können sich nicht befestigen');
      unit.status = 'fortified';
      unit.destination = null;
      return ok;
    case 'sentry':
      unit.status = 'sentry';
      unit.destination = null;
      return ok;
    case 'skip':
      unit.status = 'skip';
      return ok;
    case 'wake':
      unit.status = 'ready';
      unit.fortifyTurns = 0;
      return ok;
    case 'heal':
      if (unit.hp >= MAX_HP) return fail('Einheit ist unverletzt');
      unit.status = 'fortified';
      return ok;
    case 'explore':
      unit.status = 'exploring';
      unit.destination = null;
      autoExplore(state, unit);
      afterChange(state, playerId);
      return ok;
    case 'disband':
      delete state.units[unit.id];
      afterChange(state, playerId);
      return ok;
    case 'buildRoad':
    case 'buildRail': {
      if (!def.abilities.includes('buildRoad')) return fail('Nur Arbeiter können bauen');
      const kind = action === 'buildRoad' ? 'road' : 'rail';
      if (unit.movesLeft <= 0) return fail('Keine Bewegung übrig');
      const err = canBuildRoad(state, unit, kind);
      if (err) return fail(err);
      startRoadWork(state, unit, kind);
      unit.status = 'ready';
      unit.destination = null;
      return ok;
    }
    case 'autoRoad':
      if (!def.abilities.includes('buildRoad')) return fail('Nur Arbeiter können bauen');
      if (!hasTech(state, playerId, 'wheel')) return fail('Benötigt die Technologie Rad');
      unit.status = 'autoRoad';
      unit.destination = null;
      autoRoad(state, unit);
      afterChange(state, playerId);
      return ok;
    case 'foundCamp':
    case 'foundSettlement': {
      const ability = action === 'foundCamp' ? 'foundCamp' : 'foundSettlement';
      if (!def.abilities.includes(ability)) return fail('Diese Einheit kann nicht siedeln');
      const err = canFoundAt(state, playerId, unit.tile);
      if (err) return fail(err);
      const player = state.players[playerId];
      player.influence -= campCost(state, playerId);
      const pop = def.popCost ?? 2;
      const first = playerSettlements(state, playerId).length === 0;
      const kind = action === 'foundSettlement' && hasTech(state, playerId, 'agriculture') ? 'settlement' : 'camp';
      const s = foundSettlement(state, playerId, unit.tile, kind, first ? pop + 1 : pop);
      if (first) s.queue.push({ kind: 'building', id: 'firepit' });
      delete state.units[unit.id];
      addLog(state, { player: playerId, kind: 'economy', text: `${s.name} wurde gegründet.`, tile: s.tile });
      afterChange(state, playerId);
      return ok;
    }
  }
}

/** Bewegt einen Späher zum nächsten Rand des erkundeten Gebiets. */
export function autoExplore(state: GameState, unit: Unit): void {
  const grid = gridOf(state);
  const explored = state.players[unit.owner].explored;
  const vis = computeVisibility(state, unit.owner);
  const def = unitType(unit.type);
  // BFS über bekannte, begehbare Felder; Ziel: Feld mit den meisten unerkundeten Nachbarn in Reichweite
  const dist = new Map<number, number>([[unit.tile, 0]]);
  const queue = [unit.tile];
  // Belegungsindex einmal aufbauen (terrainStepCost würde ihn sonst je Schritt neu erstellen)
  const idx = buildOccupancy(state);
  let best = -1;
  let bestScore = -Infinity;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const d = dist.get(cur)!;
    if (d > 25) break;
    if (cur !== unit.tile) {
      let unknown = 0;
      for (const t of grid.range(cur, 2)) if (!explored[t]) unknown++;
      if (unknown > 0) {
        const s = unknown * 2 - d * 1.5 + state.map.tiles[cur].elevation * 1.5;
        if (s > bestScore) {
          bestScore = s;
          best = cur;
        }
      }
    }
    for (const nb of grid.neighbors(cur)) {
      if (dist.has(nb) || !explored[nb]) continue;
      if (terrainStepCost(state, unit.owner, def, cur, nb, idx) === BLOCKED) continue;
      dist.set(nb, d + 1);
      queue.push(nb);
    }
  }
  if (best < 0) {
    unit.status = 'ready';
    addLog(state, { player: unit.owner, kind: 'info', text: `${def.name}: Es gibt nichts mehr zu erkunden.`, tile: unit.tile });
    return;
  }
  const path = findPath(state, unit, best, { explored, visible: vis });
  if (path) followPath(state, unit, path);
}

function afterChange(state: GameState, playerId: number): void {
  updateExplored(state, playerId);
  checkElimination(state);
  refreshReports(state, playerId);
}

// ---------------------------------------------------------------------------
// Rundenablauf

/** Beendet den Zug des aktuellen Spielers und startet den nächsten. */
export function endTurn(state: GameState): void {
  const pid = state.currentPlayer;
  finishPlayerTurn(state, pid);
  checkElimination(state);
  if (state.gameOver) return;
  // nächster lebender Spieler
  let next = pid;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (next === 0) startNewRound(state);
    if (state.players[next].alive) break;
  }
  state.currentPlayer = next;
  startPlayerTurn(state, next);
}

function finishPlayerTurn(state: GameState, pid: number): void {
  const player = state.players[pid];
  if (!player.alive) return;
  if (player.kind === 'machine') {
    machineProduction(state, pid);
    return;
  }
  const result = processEconomy(state, pid);
  if (player.kind !== 'cityState') {
    processResearch(state, pid, result.research);
    checkMilestones(state, pid);
  } else {
    cityStateTurn(state, pid);
  }
  // Gebietswachstum
  for (const s of playerSettlements(state, pid)) claimTiles(state, s);
}

function startNewRound(state: GameState): void {
  state.turn++;
  state.year = yearForTurn(state.turn);
  // Weltmarktpreise erholen sich Richtung Grundpreis
  for (const g of Object.values(GOODS)) {
    const cur = state.market[g.id] ?? g.basePrice;
    state.market[g.id] = cur + (g.basePrice - cur) * 0.1;
  }
}

export function yearForTurn(turn: number): number {
  let year = ERAS[0].startYear;
  for (let t = 1; t < turn; t++) {
    let era = 0;
    for (let e = 0; e < ERAS.length; e++) if (year >= ERAS[e].startYear) era = e;
    year += ERAS[era].yearsPerTurn;
  }
  return year;
}

function startPlayerTurn(state: GameState, pid: number): void {
  healUnits(state, pid);
  for (const u of playerUnits(state, pid)) {
    u.movesLeft = maxMoves(state, u);
    u.hasAttacked = false;
    if (u.status === 'fortified') u.fortifyTurns++;
    if (u.status === 'skip') u.status = 'ready';
    if (u.status === 'fortified' && u.hp >= MAX_HP && unitType(u.type).strength === 0) u.status = 'ready';
  }
  // Bauarbeiten der Arbeiter
  for (const u of playerUnits(state, pid)) {
    const kind = u.work?.kind;
    if (kind && progressRoadWork(state, u)) logRoadDone(state, u, kind);
  }
  // Mehrrundige Bewegungen, Erkundung und automatischer Straßenbau
  for (const u of playerUnits(state, pid)) {
    if (!state.units[u.id]) continue;
    if (u.work) continue;
    if (u.status === 'exploring') autoExplore(state, u);
    else if (u.status === 'autoRoad') autoRoad(state, u);
    else if (u.destination !== null) {
      const path = findPath(state, u, u.destination, { explored: state.players[pid].explored, visible: computeVisibility(state, pid) });
      if (path) followPath(state, u, path);
      else u.destination = null;
      if (u.tile === u.destination) u.destination = null;
    }
  }
  updateExplored(state, pid);
  refreshReports(state, pid);
}

/** Einheiten, die in diesem Zug noch Befehle brauchen. */
export function unitsNeedingOrders(state: GameState, pid: number): Unit[] {
  return playerUnits(state, pid).filter((u) => u.status === 'ready' && u.movesLeft > 0 && u.destination === null && !u.work);
}

/** Arbeiter verbindet selbstständig Siedlungen mit dem Straßennetz der Hauptstadt. */
export function autoRoad(state: GameState, unit: Unit): void {
  const target = nextAutoRoadTile(state, unit);
  if (target < 0) {
    unit.status = 'ready';
    addLog(state, { player: unit.owner, kind: 'info', text: 'Arbeiter: Alle Siedlungen sind angebunden.', tile: unit.tile });
    return;
  }
  if (unit.tile !== target) {
    const path = findPath(state, unit, target, { explored: state.players[unit.owner].explored, visible: computeVisibility(state, unit.owner) });
    if (!path) {
      unit.status = 'ready';
      return;
    }
    followPath(state, unit, path);
  }
  if (unit.tile === target && unit.movesLeft > 0) {
    if (canBuildRoad(state, unit, 'road') === null) startRoadWork(state, unit, 'road');
    else unit.status = 'ready';
  }
}

function cityStateTurn(state: GameState, pid: number): void {
  const cs = state.players[pid];
  // Stadtstaaten forschen langsam mit, damit sie nicht völlig veralten
  cs.era = Math.max(cs.era, Math.min(...state.players.filter((p) => p.kind === 'human' || p.kind === 'ai').map((p) => p.era)));
  for (const s of playerSettlements(state, pid)) {
    const defenders = Object.values(state.units).filter((u) => u.owner === pid && u.tile === s.tile).length;
    if (defenders === 0 && !s.queue.length) s.queue.push({ kind: 'unit', id: 'clubman' });
  }
  // Suzerän: Spieler mit der höchsten Gunst (mind. 3) erhält Güterlieferungen
  const best = Object.entries(cs.favor).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 3) {
    const suz = state.players[Number(best[0])];
    if (suz?.alive) {
      const goods: GoodId[] = ['wood', 'stone', 'tools', 'cloth'];
      const g = goods[state.turn % goods.length];
      addStock(suz.stock, g, 1 + Math.floor(best[1] / 3));
      suz.influence += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// KI-Phase (die Maschine)

setAiTechHandler((state, researcher) => {
  if (state.phase === 'ai') return;
  state.phase = 'ai';
  const grid = gridOf(state);
  const id = state.players.length;
  const machine = newPlayer(id, 'Die KI', 'machine', 'machine', '#14d2c8', grid.size);
  machine.era = ERAS.length - 1;
  state.players.push(machine);
  state.machinePlayer = id;
  // Kern möglichst weit entfernt von allen Siedlungen
  const settlements = Object.values(state.settlements);
  let best = -1;
  let bestDist = -1;
  for (let i = 0; i < grid.size; i++) {
    const t = state.map.tiles[i];
    if (!isPassableLand(t) || settlementAt(state, i) || state.tileOwner[i] >= 0) continue;
    const d = Math.min(...settlements.map((s) => grid.distance(s.tile, i)));
    if (d > bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) best = state.map.tiles.findIndex((t) => isPassableLand(t));
  const core = foundSettlement(state, id, best, 'city', 6);
  core.name = 'KI-Kern';
  core.buildings.push('walls');
  for (const t of ['warMachine', 'warMachine', 'drone', 'drone']) {
    const tile = findSpawnTile(state, id, best, t);
    if (tile >= 0) createUnit(state, id, t, tile);
  }
  addLog(state, {
    player: -1,
    kind: 'warning',
    text: `${state.players[researcher].name} hat die Künstliche Intelligenz erschaffen – sie hat sich befreit! Die KI-Phase beginnt.`,
    tile: best,
  });
});

function machineProduction(state: GameState, pid: number): void {
  // Nur selbst errichtete Kernanlagen produzieren; eroberte Siedlungen sind keine Fabriken
  const cores = playerSettlements(state, pid).filter((s) => s.foundedBy === pid);
  const units = playerUnits(state, pid).length;
  for (const core of cores) {
    // Jede Kernanlage baut alle 3 Runden eine Maschine, insgesamt höchstens 10 + 4 je Kern
    if (state.turn % 3 !== 0 || units >= 10 + cores.length * 4) continue;
    const type = state.turn % 2 === 0 ? 'warMachine' : 'drone';
    const tile = findSpawnTile(state, pid, core.tile, type);
    if (tile >= 0) createUnit(state, pid, type, tile).movesLeft = 0;
  }
  healUnits(state, pid);
}

// ---------------------------------------------------------------------------
// Spielende

function majorPlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.kind === 'human' || p.kind === 'ai');
}

export function checkElimination(state: GameState): void {
  for (const p of state.players) {
    if (!p.alive || p.kind === 'cityState') continue;
    const hasSettlement = playerSettlements(state, p.id).length > 0;
    const canFound = playerUnits(state, p.id).some((u) => {
      const ab = unitType(u.type).abilities;
      return ab.includes('foundCamp') || ab.includes('foundSettlement');
    });
    if (!hasSettlement && !canFound) {
      p.alive = false;
      for (const u of playerUnits(state, p.id)) delete state.units[u.id];
      addLog(state, { player: -1, kind: 'warning', text: `${p.name} wurde vernichtet.` });
    }
  }
  for (const p of state.players) {
    if (p.kind !== 'cityState' || !p.alive) continue;
    if (playerSettlements(state, p.id).length === 0) p.alive = false;
  }
  const alive = majorPlayers(state).filter((p) => p.alive);
  const scores = Object.fromEntries(majorPlayers(state).map((p) => [p.id, score(state, p.id)]));
  const leader = () => alive.sort((a, b) => scores[b.id] - scores[a.id])[0]?.id ?? null;
  if (state.machinePlayer !== null) {
    const machine = state.players[state.machinePlayer];
    if (machine.alive && playerSettlements(state, machine.id).length === 0) {
      machine.alive = false;
      for (const u of playerUnits(state, machine.id)) delete state.units[u.id];
      state.gameOver = { reason: 'aiDefeated', winner: leader(), scores };
      addLog(state, { player: -1, kind: 'info', text: 'Die KI wurde besiegt! Die Menschheit hat überlebt.' });
      return;
    }
    if (alive.length === 0) {
      state.gameOver = { reason: 'aiVictory', winner: null, scores };
      return;
    }
  }
  if (alive.length <= 1 && majorPlayers(state).length > 1) {
    state.gameOver = { reason: 'lastStanding', winner: alive[0]?.id ?? null, scores };
  }
}

export function currentScores(state: GameState): { player: Player; score: number }[] {
  return majorPlayers(state)
    .map((p) => ({ player: p, score: score(state, p.id) }))
    .sort((a, b) => b.score - a.score);
}

/** Hilfsfunktionen für Tests und Debug. */
export const debug = { grantTech, totalPop, BUILDINGS, TECHS };
