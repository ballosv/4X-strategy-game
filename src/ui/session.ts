import { ERAS, formatYear } from '../core/data/eras';
import { migrateState } from '../core/migrate';
import type { GameState } from '../core/state';

const PREFIX = 'ai4x.save.';

export interface SaveInfo {
  slot: string;
  label: string;
  detail: string;
}

export function saveGame(state: GameState, slot: string): boolean {
  try {
    localStorage.setItem(PREFIX + slot, JSON.stringify(state));
    const human = state.players.find((p) => p.kind === 'human');
    localStorage.setItem(
      `${PREFIX}${slot}.meta`,
      JSON.stringify({
        label: slot === 'auto' ? 'Automatische Speicherung' : `Spielstand ${slot}`,
        detail: `Runde ${state.turn} · ${formatYear(state.year)} · ${human?.name ?? ''} · ${ERAS[human?.era ?? 0].name} · ${new Date().toLocaleString('de-DE')}`,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot: string): GameState | null {
  try {
    const raw = localStorage.getItem(PREFIX + slot);
    if (!raw) return null;
    return migrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function listSaves(): SaveInfo[] {
  const out: SaveInfo[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(PREFIX) || key.endsWith('.meta')) continue;
      const slot = key.slice(PREFIX.length);
      const meta = JSON.parse(localStorage.getItem(`${key}.meta`) ?? '{}');
      out.push({ slot, label: meta.label ?? slot, detail: meta.detail ?? '' });
    }
  } catch {
    // Speicher nicht verfügbar
  }
  return out.sort((a, b) => (a.slot === 'auto' ? -1 : b.slot === 'auto' ? 1 : a.slot.localeCompare(b.slot)));
}
