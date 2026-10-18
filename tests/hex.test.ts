import { describe, expect, it } from 'vitest';
import { HexGrid, axialToOffset, offsetToAxial } from '../src/core/hex';

describe('HexGrid', () => {
  const grid = new HexGrid(10, 8);

  it('rechnet Offset <-> Axial verlustfrei um', () => {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 10; col++) {
        const a = offsetToAxial(col, row);
        expect(axialToOffset(a.q, a.r)).toEqual({ col, row });
      }
    }
  });

  it('Nachbarn haben Abstand 1 und sind symmetrisch', () => {
    for (let i = 0; i < grid.size; i++) {
      for (const n of grid.neighbors(i)) {
        expect(grid.distance(i, n)).toBe(1);
        expect(grid.neighbors(n)).toContain(i);
      }
    }
  });

  it('Innenfelder haben 6 Nachbarn', () => {
    expect(grid.neighbors(grid.index(4, 4))).toHaveLength(6);
  });

  it('range liefert 1 + 3r(r+1) Felder im Inneren', () => {
    expect(grid.range(grid.index(5, 4), 2)).toHaveLength(19);
  });
});
