/**
 * Computergegner. Erzeugt ausschließlich Befehle über applyCommand und kennt nur das eigene
 * Sichtfeld (Nebel des Krieges). Schwierigkeitsgrade ändern nur die Planungsqualität.
 */
export { runAiTurn, runAiTurnDetailed } from './turn';
export { AiView } from './view';
export { PLANS, type AiTurnReport, type PlanParams } from './context';
export type { AiMemory, Goals, GoalId } from './memory';
