import type { GameState } from '../core/state';

/** Strategische Ziele der KI; Gewichte etwa im Bereich 0..1. */
export type GoalId = 'expand' | 'defend' | 'military' | 'economy' | 'research' | 'attack';
export type Goals = Record<GoalId, number>;

/** Zuletzt gesehene fremde Siedlung (Schlüssel: Feldindex). */
export interface KnownSettlement {
  id: number;
  owner: number;
  kind: string;
  turn: number;
}

export type UnitTaskKind = 'settle' | 'firstCamp' | 'campaign' | 'sentry';

export interface UnitTask {
  kind: UnitTaskKind;
  target: number;
  since: number;
}

export interface WarMemory {
  target: number;
  since: number;
  /** Eigene Militärstärke bei Kriegsbeginn. */
  startPower: number;
  /** Krieg wurde uns erklärt (nicht selbst begonnen). */
  defensive: boolean;
  /** Aktuelles Ziel des Feldzugs (Feld einer bekannten gegnerischen Siedlung). */
  targetTile?: number;
}

/**
 * Persistentes Gedächtnis eines Computergegners. Liegt in state.aiMemory und muss
 * JSON-serialisierbar bleiben (Speicherstände, Determinismus).
 */
export interface AiMemory {
  version: 1;
  /** Runde der letzten vollständigen Strategie-Bewertung. */
  lastEval: number;
  goals: Goals;
  /** Bewertete Siedlungsplätze aus der letzten Strategie-Bewertung (beste zuerst). */
  sites: number[];
  known: Record<string, KnownSettlement>;
  /** Zuletzt gesehene Militärstärke je fremdem Spieler. */
  strength: Record<string, { value: number; turn: number }>;
  tasks: Record<string, UnitTask>;
  /** Plätze, an denen eine Gründung gescheitert ist. */
  badSites: number[];
  war: WarMemory | null;
  /** Aufrüstung gegen ein mögliches Kriegsziel. */
  prepare?: { target: number; since: number } | null;
  /** Kein neuer Krieg gegen diesen Spieler vor dieser Runde. */
  peaceUntil: Record<string, number>;
  /** Anzahl eigener Siedlungen in der Vorrunde (erkennt Verluste). */
  settlementCount: number;
  lostSettlementTurn: number;
  /** Gescheiterte Bewegungsziele je Einheit („Einheit:Feld“ → Runde). */
  unreachable: Record<string, number>;
}

/** So viele Runden merkt sich die KI ein unerreichbares Ziel. */
export const UNREACHABLE_MEMORY = 20;

export function defaultGoals(): Goals {
  return { expand: 0.8, defend: 0.2, military: 0.3, economy: 0.6, research: 0.4, attack: 0 };
}

function freshMemory(): AiMemory {
  return {
    version: 1,
    lastEval: -999,
    goals: defaultGoals(),
    sites: [],
    known: {},
    strength: {},
    tasks: {},
    badSites: [],
    war: null,
    peaceUntil: {},
    settlementCount: 0,
    lostSettlementTurn: -999,
    unreachable: {},
  };
}

/** Lädt (oder erzeugt) das Gedächtnis eines Spielers im Spielstand. */
export function loadMemory(state: GameState, playerId: number): AiMemory {
  if (!state.aiMemory) state.aiMemory = {};
  let mem = state.aiMemory[playerId] as AiMemory | undefined;
  if (!mem || mem.version !== 1) {
    mem = freshMemory();
    state.aiMemory[playerId] = mem;
  }
  return mem;
}

/** Entfernt Aufgaben verschwundener Einheiten und begrenzt Listen. */
export function pruneMemory(state: GameState, mem: AiMemory): void {
  for (const key of Object.keys(mem.tasks)) {
    const u = state.units[Number(key)];
    if (!u) delete mem.tasks[key];
  }
  mem.unreachable ??= {};
  for (const [key, turn] of Object.entries(mem.unreachable)) {
    if (state.turn - turn > UNREACHABLE_MEMORY || !state.units[Number(key.split(':')[0])]) delete mem.unreachable[key];
  }
  if (mem.badSites.length > 60) mem.badSites.splice(0, mem.badSites.length - 60);
}
