import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '../src/core/version';

describe('version', () => {
  it('folgt SemVer', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
