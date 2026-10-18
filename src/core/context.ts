import { CIVS, TRAITS } from './data/civs';
import { BUILDINGS } from './data/buildings';
import { HexGrid } from './hex';
import { combineModifiers, type Modifiers } from './modifiers';
import { POLICIES } from './data/policies';
import type { GameState, Player } from './state';

const gridCache = new Map<string, HexGrid>();

/** Hex-Gitter passend zur Karte (gecacht, da der Zustand reines JSON ist). */
export function gridOf(state: Pick<GameState, 'map'>): HexGrid {
  const key = `${state.map.width}x${state.map.height}`;
  let grid = gridCache.get(key);
  if (!grid) {
    grid = new HexGrid(state.map.width, state.map.height);
    gridCache.set(key, grid);
  }
  return grid;
}

export function civOf(player: Player) {
  return CIVS.find((c) => c.id === player.civId);
}

/** Alle Modifikatoren eines Spielers: Eigenschaften, Politiken, nationale Gebäudeeffekte. */
export function playerModifiers(state: GameState, playerId: number): Modifiers {
  const player = state.players[playerId];
  const list: (Modifiers | undefined)[] = [];
  const civ = civOf(player);
  if (civ) for (const t of civ.traits) list.push(TRAITS[t].modifiers);
  for (const p of player.policies) list.push(POLICIES[p]?.modifiers);
  if (player.techs.includes('printing')) list.push({ researchPct: 10 });
  if (player.techs.includes('fusion')) list.push({ laborPct: 20 });
  return combineModifiers(list);
}

export function settlementModifiers(state: GameState, settlementId: number): Modifiers {
  const s = state.settlements[settlementId];
  return combineModifiers([playerModifiers(state, s.owner), ...s.buildings.map((b) => BUILDINGS[b]?.modifiers)]);
}

export function hasTech(state: GameState, playerId: number, tech: string | undefined): boolean {
  if (!tech) return true;
  return state.players[playerId].techs.includes(tech);
}
