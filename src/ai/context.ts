import { applyCommand, type Command } from '../core/game';
import { Rng } from '../core/rng';
import type { Difficulty, GameState, Player, Unit } from '../core/state';
import { loadMemory, pruneMemory, type AiMemory, type Goals } from './memory';
import type { Situation } from './strategy';
import { AiView } from './view';

/**
 * Planungsparameter je Schwierigkeitsgrad. Sie verändern ausschließlich die Planungsqualität
 * (Bewertungstiefe, Neubewertungsfrequenz, Risikobereitschaft) – niemals Ressourcen.
 */
export interface PlanParams {
  /** Strategie wird alle n Runden vollständig neu bewertet. */
  evalInterval: number;
  /** Maximal bewertete Kandidaten je Entscheidung (Bauaufträge, Felder). */
  candidateCap: number;
  /** Suchtiefe (Schritte) bei der Platzsuche für Siedler. */
  siteSearchSteps: number;
  /** Mindestverhältnis zugefügter zu erlittenem Schaden für einen Angriff. */
  attackRatio: number;
  /** Benötigte militärische Überlegenheit für eine Kriegserklärung. */
  warSuperiority: number;
  /** Maximale Länge der Bauliste (weitere Aufträge nur für dringende Vorhaben). */
  queueTarget: number;
  /** Mindestgröße einer Angriffsgruppe vor dem Sturm auf eine Siedlung. */
  minGroup: number;
  /** Gegenangriffe des Gegners nach einem eigenen Zug einbeziehen. */
  lookahead: boolean;
}

export const PLANS: Record<Difficulty, PlanParams> = {
  easy: { evalInterval: 3, candidateCap: 6, siteSearchSteps: 8, attackRatio: 1.5, warSuperiority: 2.0, queueTarget: 1, minGroup: 2, lookahead: false },
  normal: { evalInterval: 1, candidateCap: 14, siteSearchSteps: 12, attackRatio: 1.0, warSuperiority: 1.5, queueTarget: 2, minGroup: 3, lookahead: true },
  hard: { evalInterval: 1, candidateCap: 28, siteSearchSteps: 16, attackRatio: 0.85, warSuperiority: 1.3, queueTarget: 2, minGroup: 3, lookahead: true },
};

/** Ergebnis eines KI-Zuges (Diagnose, nicht Teil des Spielstands). */
export interface AiTurnReport {
  playerId: number;
  turn: number;
  commands: number;
  failed: number;
  failures: string[];
}

/** Sicherheitsgrenze: ab so vielen fehlgeschlagenen Befehlen wird der Zug beendet. */
export const MAX_FAILED_COMMANDS = 40;
/** Absolute Obergrenze an Befehlen je Zug (Schutz vor Endlosschleifen). */
export const MAX_COMMANDS = 600;

export class AiContext {
  readonly player: Player;
  readonly mem: AiMemory;
  readonly view: AiView;
  readonly plan: PlanParams;
  /** Deterministischer Zufall, abgeleitet aus dem Zustand (verändert state.rngState nicht). */
  readonly rng: Rng;
  readonly report: AiTurnReport;
  goals: Goals;
  situation!: Situation;
  /** Sichtbare gegnerische Militäreinheiten für die Vorausschau (Gegenangriffe). */
  lookaheadEnemies: Unit[] = [];

  constructor(
    readonly state: GameState,
    readonly pid: number,
  ) {
    this.player = state.players[pid];
    this.mem = loadMemory(state, pid);
    pruneMemory(state, this.mem);
    this.view = new AiView(state, pid, this.mem);
    this.plan = PLANS[state.settings.difficulty] ?? PLANS.normal;
    this.rng = new Rng(state.turn * 7919 + pid);
    this.report = { playerId: pid, turn: state.turn, commands: 0, failed: 0, failures: [] };
    this.goals = this.mem.goals;
  }

  /** Darf die KI noch Befehle geben? */
  get active(): boolean {
    return (
      !this.state.gameOver &&
      this.state.currentPlayer === this.pid &&
      this.report.failed < MAX_FAILED_COMMANDS &&
      this.report.commands < MAX_COMMANDS
    );
  }

  /** Gibt einen Befehl über applyCommand – der einzige Weg, wie die KI den Spielstand verändert. */
  issue(cmd: Command): boolean {
    if (!this.active) return false;
    const res = applyCommand(this.state, this.pid, cmd);
    this.report.commands++;
    if (!res.ok) {
      this.report.failed++;
      if (this.report.failures.length < 20) {
        const unit = 'unitId' in cmd ? this.state.units[cmd.unitId] : undefined;
        this.report.failures.push(`${cmd.type}${unit ? ` (${unit.type}, ${unit.status})` : ''}: ${res.error ?? '?'}`);
      }
    }
    return res.ok;
  }
}
