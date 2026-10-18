import { BUILDINGS } from './data/buildings';
import { STATE_VERSION, type GameState } from './state';

/**
 * Hebt ältere Spielstände auf die aktuelle Version an.
 * Gibt null zurück, wenn der Spielstand nicht migriert werden kann.
 */
export function migrateState(raw: unknown): GameState | null {
  const state = raw as GameState & { version: number };
  if (!state || typeof state !== 'object' || typeof state.version !== 'number') return null;
  if (state.version > STATE_VERSION) return null;
  if (state.version < 2) {
    // v0.1 -> v0.2: Transportnetz, entfernte Gebäude (Straßenanbindung)
    state.roads = {};
    for (const s of Object.values(state.settlements)) s.buildings = s.buildings.filter((b) => BUILDINGS[b]);
    for (const s of Object.values(state.settlements)) s.queue = s.queue.filter((q) => q.kind !== 'building' || BUILDINGS[q.id]);
    state.version = 2;
  }
  return state;
}
