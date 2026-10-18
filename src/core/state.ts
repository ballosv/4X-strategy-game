import type { Stock } from './data/goods';
import type { MapSize, MapType, GameMap } from './map/types';

export type PlayerKind = 'human' | 'ai' | 'cityState' | 'machine';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'human' | 'ai';
export type DiplomaticStatus = 'peace' | 'war';

export interface PlayerSetup {
  kind: 'human' | 'ai';
  civId: string;
  name?: string;
}

export interface GameSettings {
  mapType: MapType;
  mapSize: MapSize;
  seed: string;
  players: PlayerSetup[];
  /** 0 = so weit wie möglich auseinander, sonst Mindestabstand in Feldern. */
  minStartDistance: number;
  cityStates: number;
  difficulty: Difficulty;
}

export interface ResearchState {
  current: string | null;
  progress: number;
}

export interface LegacyState {
  points: number;
  /** Abgeschlossene Meilensteine (IDs). */
  milestones: string[];
}

export interface PlayerStats {
  unitsKilled: number;
  unitsLost: number;
  settlementsFounded: number;
  settlementsCaptured: number;
  goodsProduced: number;
  influenceEarned: number;
  researchEarned: number;
  tilesExplored: number;
}

export interface Player {
  id: number;
  name: string;
  civId: string;
  kind: PlayerKind;
  color: string;
  alive: boolean;
  era: number;
  gold: number;
  influence: number;
  research: ResearchState;
  techs: string[];
  /** Nationallager. */
  stock: Stock;
  /** 1 = erkundet, je Feld. */
  explored: number[];
  policies: string[];
  legacy: LegacyState;
  stats: PlayerStats;
  /** Diplomatischer Status gegenüber anderen Spielern (fehlend = Frieden). */
  relations: Record<number, DiplomaticStatus>;
  /** Partner mit Handelsabkommen. */
  agreements?: number[];
  /** Für Stadtstaaten: Gunst je Spieler. */
  favor: Record<number, number>;
  /** Letzte Einnahmen/Ausgaben für die Anzeige. */
  lastIncome: Income;
}

export interface Income {
  gold: number;
  goldIncome: number;
  goldExpenses: number;
  research: number;
  influence: number;
}

export type UnitStatus = 'ready' | 'fortified' | 'sentry' | 'skip' | 'exploring' | 'autoRoad';

export interface Unit {
  id: number;
  type: string;
  owner: number;
  tile: number;
  hp: number;
  movesLeft: number;
  xp: number;
  status: UnitStatus;
  fortifyTurns: number;
  /** Mehrrundiges Bewegungsziel. */
  destination: number | null;
  hasAttacked: boolean;
  /** Laufende Bauarbeit (Straße/Eisenbahn) eines Arbeiters. */
  work?: { kind: 'road' | 'rail'; tile: number; turnsLeft: number } | null;
}

export type SettlementKind = 'camp' | 'settlement' | 'city';
export type SettlementFocus = 'balanced' | 'food' | 'production' | 'construction';

export interface Population {
  workers: number;
  citizens: number;
  scholars: number;
}

export type ProductionItem =
  | { kind: 'unit'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'improvement'; id: string; tile: number }
  | { kind: 'upgrade'; tile: number };

export interface Settlement {
  id: number;
  name: string;
  owner: number;
  tile: number;
  kind: SettlementKind;
  isCapital: boolean;
  pop: Population;
  food: number;
  buildings: string[];
  queue: ProductionItem[];
  laborProgress: number;
  localStock: Stock;
  hp: number;
  founded: number;
  /** Spieler, der die Siedlung gegründet hat. */
  foundedBy?: number;
  focus: SettlementFocus;
  /** Vom Spieler festgelegte Besetzung je Arbeitsplatz (Schlüssel wie in report.jobs). */
  jobOverrides?: Record<string, number>;
  /** Zuletzt berechnete Wirtschaftsdaten für die Anzeige. */
  report: SettlementReport;
}

export interface SettlementReport {
  laborTotal: number;
  laborBound: number;
  laborFree: number;
  foodNeed: Record<'grain' | 'vegetables' | 'meat', number>;
  foodHave: Record<'grain' | 'vegetables' | 'meat', number>;
  foodSurplus: number;
  growthNeeded: number;
  housing: number;
  produced: Stock;
  consumed: Stock;
  gold: number;
  research: number;
  influence: number;
  transport: number;
  /** Anbindung an die Hauptstadt (siehe systems/transport.ts). */
  connection?: 'capital' | 'rail' | 'road' | 'sea' | 'none';
  jobs: Record<string, number>;
  stalled?: string;
}

export interface TradeRoute {
  id: number;
  owner: number;
  /** Eigene Heimatsiedlung. */
  from: number;
  /** Zielsiedlung (eigene, fremde oder Stadtstaat). */
  to: number;
  since: number;
}

export interface Improvement {
  type: string;
  level: number;
  settlement: number;
}

export interface LogEntry {
  turn: number;
  player: number;
  text: string;
  tile?: number;
  kind: 'info' | 'combat' | 'economy' | 'research' | 'diplomacy' | 'warning';
}

export interface GameOver {
  reason: 'lastStanding' | 'aiDefeated' | 'aiVictory' | 'turnLimit';
  winner: number | null;
  scores: Record<number, number>;
}

export interface GameState {
  version: number;
  settings: GameSettings;
  turn: number;
  year: number;
  /** Index in players, der gerade am Zug ist. */
  currentPlayer: number;
  phase: Phase;
  map: GameMap;
  players: Player[];
  units: Record<number, Unit>;
  settlements: Record<number, Settlement>;
  /** Geländeausbauten je Feldindex. */
  improvements: Record<number, Improvement>;
  /** Besitzende Siedlung je Feld (−1 = niemand). */
  tileOwner: number[];
  nextId: number;
  rngState: number;
  log: LogEntry[];
  /** Weltmarktpreise. */
  market: Record<string, number>;
  /** Kuriositäten auf der Karte (Feldindizes), die beim Betreten eine Belohnung geben. */
  curiosities: number[];
  /** Straßen (1) und Eisenbahnen (2) je Feldindex. */
  roads?: Record<number, number>;
  /** Spieler-ID der KI-Fraktion, sobald sie erwacht ist. */
  machinePlayer: number | null;
  /** Handelsrouten aller Spieler. */
  tradeRoutes?: TradeRoute[];
  gameOver: GameOver | null;
  /**
   * Gedächtnis der Computergegner je Spieler-ID (JSON-serialisierbar, Teil des Spielstands).
   * Wird ausschließlich von src/ai gelesen und geschrieben.
   */
  aiMemory?: Record<number, unknown>;
}

export const STATE_VERSION = 2;

export function emptyReport(): SettlementReport {
  return {
    laborTotal: 0,
    laborBound: 0,
    laborFree: 0,
    foodNeed: { grain: 0, vegetables: 0, meat: 0 },
    foodHave: { grain: 0, vegetables: 0, meat: 0 },
    foodSurplus: 0,
    growthNeeded: 0,
    housing: 0,
    produced: {},
    consumed: {},
    gold: 0,
    research: 0,
    influence: 0,
    transport: 0,
    jobs: {},
  };
}

export function totalPop(p: Population): number {
  return p.workers + p.citizens + p.scholars;
}

export function unitsAt(state: GameState, tile: number): Unit[] {
  const out: Unit[] = [];
  for (const u of Object.values(state.units)) if (u.tile === tile) out.push(u);
  return out;
}

export function settlementAt(state: GameState, tile: number): Settlement | undefined {
  for (const s of Object.values(state.settlements)) if (s.tile === tile) return s;
  return undefined;
}

export function playerSettlements(state: GameState, player: number): Settlement[] {
  return Object.values(state.settlements).filter((s) => s.owner === player);
}

export function playerUnits(state: GameState, player: number): Unit[] {
  return Object.values(state.units).filter((u) => u.owner === player);
}

export function tileOwnerPlayer(state: GameState, tile: number): number {
  const sid = state.tileOwner[tile];
  if (sid < 0) return -1;
  return state.settlements[sid]?.owner ?? -1;
}

export function addLog(state: GameState, entry: Omit<LogEntry, 'turn'>): void {
  state.log.push({ turn: state.turn, ...entry });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

export function isAtWar(state: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  const pa = state.players[a];
  const pb = state.players[b];
  if (!pa || !pb) return false;
  if (pa.kind === 'machine' || pb.kind === 'machine') return true;
  return pa.relations[b] === 'war' || pb.relations[a] === 'war';
}
