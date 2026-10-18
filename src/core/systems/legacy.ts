import { addLog, playerSettlements, totalPop, type GameState } from '../state';
import { playerModifiers } from '../context';

/**
 * Vermächtnisse: Meilensteine bringen Vermächtnispunkte – die Siegpunkte des Spiels.
 * Jeder Meilenstein kann je Spieler nur einmal erreicht werden.
 */
export function awardLegacy(state: GameState, playerId: number, milestone: string, points: number, label: string): boolean {
  const p = state.players[playerId];
  if (p.kind === 'cityState' || p.kind === 'machine') return false;
  if (p.legacy.milestones.includes(milestone)) return false;
  p.legacy.milestones.push(milestone);
  p.legacy.points += points;
  addLog(state, { player: playerId, kind: 'info', text: `Vermächtnis: ${label} (+${points})` });
  return true;
}

interface MilestoneDef {
  id: string;
  path: 'Expansion' | 'Wirtschaft' | 'Wissen' | 'Militär' | 'Kultur';
  label: string;
  points: number;
  check: (state: GameState, playerId: number) => boolean;
}

const tiers = [1, 2, 3, 4, 5, 6];

export const MILESTONES: MilestoneDef[] = [
  ...tiers.map((t) => ({
    id: `expansion${t}`, path: 'Expansion' as const, label: `${t * 2} Siedlungen`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => playerSettlements(s, p).length >= t * 2,
  })),
  ...tiers.map((t) => ({
    id: `population${t}`, path: 'Expansion' as const, label: `${t * 15} Einwohner`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => playerSettlements(s, p).reduce((a, x) => a + totalPop(x.pop), 0) >= t * 15,
  })),
  ...tiers.map((t) => ({
    id: `economy${t}`, path: 'Wirtschaft' as const, label: `${t * t * 100} Güter produziert`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => s.players[p].stats.goodsProduced >= t * t * 100,
  })),
  ...tiers.map((t) => ({
    id: `knowledge${t}`, path: 'Wissen' as const, label: `${t * 8} Technologien`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => s.players[p].techs.length >= t * 8,
  })),
  ...tiers.map((t) => ({
    id: `military${t}`, path: 'Militär' as const, label: `${t * t * 3} Einheiten besiegt`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => s.players[p].stats.unitsKilled >= t * t * 3,
  })),
  ...tiers.map((t) => ({
    id: `culture${t}`, path: 'Kultur' as const, label: `${t * t * 60} Einfluss gesammelt`, points: 1 + Math.floor(t / 2),
    check: (s: GameState, p: number) => s.players[p].stats.influenceEarned >= t * t * 60,
  })),
];

export function checkMilestones(state: GameState, playerId: number): void {
  const bonus = playerModifiers(state, playerId).cultureLegacyBonus ?? 0;
  for (const m of MILESTONES) {
    if (state.players[playerId].legacy.milestones.includes(m.id)) continue;
    if (m.check(state, playerId)) awardLegacy(state, playerId, m.id, m.points + (m.path === 'Kultur' ? bonus : 0), `${m.path}: ${m.label}`);
  }
}

/** Gesamtpunktzahl: Vermächtnispunkte plus aktueller Stand des Reiches. */
export function score(state: GameState, playerId: number): number {
  const p = state.players[playerId];
  const settlements = playerSettlements(state, playerId);
  const pop = settlements.reduce((a, s) => a + totalPop(s.pop), 0);
  return p.legacy.points * 10 + settlements.length * 4 + pop + p.techs.length * 2 + p.era * 5;
}
