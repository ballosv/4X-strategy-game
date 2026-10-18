import { createGame } from '../src/core/game';
import type { GameSettings } from '../src/core/state';

export function testSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    mapType: 'pangaea',
    mapSize: 'small',
    seed: 'test',
    players: [
      { kind: 'human', civId: 'linden' },
      { kind: 'ai', civId: 'rock' },
      { kind: 'ai', civId: 'ash' },
    ],
    minStartDistance: 0,
    cityStates: 2,
    difficulty: 'normal',
    ...overrides,
  };
}

export function newTestGame(overrides: Partial<GameSettings> = {}) {
  return createGame(testSettings(overrides));
}
