import { ERAS } from '../data/eras';
import { AI_TECH, ERA_ADVANCE_SHARE, TECHS, techCost, techsOfEra, type TechDef } from '../data/techs';
import { addLog, type GameState } from '../state';
import { awardLegacy } from './legacy';

export function availableTechs(state: GameState, playerId: number): TechDef[] {
  const p = state.players[playerId];
  return Object.values(TECHS).filter(
    (t) => !p.techs.includes(t.id) && t.era <= p.era && (t.requires ?? []).every((r) => p.techs.includes(r)),
  );
}

export function canResearch(state: GameState, playerId: number, techId: string): string | null {
  const t = TECHS[techId];
  if (!t) return 'Unbekannte Technologie';
  const p = state.players[playerId];
  if (p.techs.includes(techId)) return 'Bereits erforscht';
  if (t.era > p.era) return `Erst im Zeitalter ${ERAS[t.era].name}`;
  const missing = (t.requires ?? []).filter((r) => !p.techs.includes(r));
  if (missing.length) return `Benötigt ${missing.map((m) => TECHS[m].name).join(', ')}`;
  return null;
}

export function eraProgress(state: GameState, playerId: number): { done: number; needed: number } {
  const p = state.players[playerId];
  const techs = techsOfEra(p.era);
  return { done: techs.filter((t) => p.techs.includes(t.id)).length, needed: Math.ceil(techs.length * ERA_ADVANCE_SHARE) };
}

/** Fortschritt pro Runde; gibt die abgeschlossene Technologie zurück. */
export function processResearch(state: GameState, playerId: number, points: number): string | null {
  const p = state.players[playerId];
  if (!p.research.current) {
    // Punkte verfallen nicht: sie werden gesammelt
    p.research.progress += points;
    return null;
  }
  p.research.progress += points;
  const cost = techCost(p.research.current);
  if (p.research.progress < cost) return null;
  const done = p.research.current;
  p.research.progress -= cost;
  p.research.current = null;
  grantTech(state, playerId, done);
  return done;
}

export function grantTech(state: GameState, playerId: number, techId: string): void {
  const p = state.players[playerId];
  if (p.techs.includes(techId)) return;
  p.techs.push(techId);
  addLog(state, { player: playerId, kind: 'research', text: `Entwicklung abgeschlossen: ${TECHS[techId].name}` });
  checkEraAdvance(state, playerId);
  if (techId === AI_TECH) onAiTechResearched?.(state, playerId);
}

export function checkEraAdvance(state: GameState, playerId: number): void {
  const p = state.players[playerId];
  while (p.era < ERAS.length - 1) {
    const { done, needed } = eraProgress(state, playerId);
    if (done < needed) return;
    p.era++;
    const first = state.players.every((o) => o.id === playerId || o.era < p.era || o.kind === 'cityState' || o.kind === 'machine');
    addLog(state, { player: playerId, kind: 'research', text: `${p.name} erreicht das Zeitalter ${ERAS[p.era].name}!` });
    awardLegacy(state, playerId, `era${p.era}`, first ? 3 : 2, `Zeitalter ${ERAS[p.era].name} erreicht${first ? ' (als Erste)' : ''}`);
  }
}

/** Wird von game.ts gesetzt (KI-Phase starten). */
export let onAiTechResearched: ((state: GameState, playerId: number) => void) | null = null;
export function setAiTechHandler(fn: (state: GameState, playerId: number) => void): void {
  onAiTechResearched = fn;
}
