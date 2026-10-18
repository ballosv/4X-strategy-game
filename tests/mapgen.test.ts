import { describe, expect, it } from 'vitest';
import { HexGrid } from '../src/core/hex';
import { generateMap } from '../src/core/map/generator';
import { isPassableLand, isWater, landComponents } from '../src/core/map/passability';
import { chooseStartPositions } from '../src/core/map/startPositions';
import { MAP_SIZES, MAP_TYPES, type MapType } from '../src/core/map/types';
import { Rng } from '../src/core/rng';

const types = Object.keys(MAP_TYPES) as MapType[];

describe('Kartengenerierung', () => {
  it('ist deterministisch für denselben Seed', () => {
    const a = generateMap({ type: 'continents', size: 'small', seed: 'abc' });
    const b = generateMap({ type: 'continents', size: 'small', seed: 'abc' });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  for (const type of types) {
    it(`erzeugt sinnvolle Karten: ${MAP_TYPES[type].name}`, () => {
      for (const seed of ['s1', 's2', 's3']) {
        const map = generateMap({ type, size: 'medium', seed });
        const grid = new HexGrid(map.width, map.height);
        expect(map.tiles).toHaveLength(MAP_SIZES.medium.width * MAP_SIZES.medium.height);
        const land = map.tiles.filter((t) => !isWater(t)).length / map.tiles.length;
        expect(land).toBeGreaterThan(MAP_TYPES[type].landRatio - 0.12);
        expect(land).toBeLessThan(MAP_TYPES[type].landRatio + 0.12);
        // alle Höhenstufen vorhanden
        const elevations = new Set(map.tiles.map((t) => t.elevation));
        for (const e of [0, 1, 2, 3, 4]) expect(elevations.has(e)).toBe(true);
        // Ränder sind Wasser
        for (let c = 0; c < map.width; c++) expect(isWater(map.tiles[c])).toBe(true);
        // Klippen existieren, aber die begehbare Landfläche ist überwiegend zusammenhängend je Landmasse
        const { ids, sizes } = landComponents(map, grid);
        const passable = map.tiles.filter(isPassableLand).length;
        const big = sizes.filter((s) => s >= 10).reduce((a, b) => a + b, 0);
        expect(big / passable).toBeGreaterThan(0.85);
        expect(ids.length).toBe(map.tiles.length);
      }
    });
  }

  it('Höhenstufen 4/5 grenzen nie als Hochgebirge an Wasser', () => {
    const map = generateMap({ type: 'highlands', size: 'medium', seed: 'x' });
    const grid = new HexGrid(map.width, map.height);
    map.tiles.forEach((t, i) => {
      if (t.elevation === 5) expect(grid.neighbors(i).some((n) => isWater(map.tiles[n]))).toBe(false);
    });
  });

  it('erzeugt Flüsse mit symmetrischen Verbindungen', () => {
    const map = generateMap({ type: 'pangaea', size: 'large', seed: 'rivers' });
    const grid = new HexGrid(map.width, map.height);
    let riverTiles = 0;
    map.tiles.forEach((t, i) => {
      if (!t.river) return;
      riverTiles++;
      for (let d = 0; d < 6; d++) {
        if (!(t.river & (1 << d))) continue;
        const n = grid.neighbor(i, d);
        expect(n).toBeGreaterThanOrEqual(0);
        if (!isWater(map.tiles[n])) expect(map.tiles[n].river & (1 << ((d + 3) % 6))).toBeTruthy();
      }
    });
    expect(riverTiles).toBeGreaterThan(10);
  });
});

describe('Startpositionen', () => {
  it('liegen weit auseinander und auf begehbarem Land', () => {
    const map = generateMap({ type: 'pangaea', size: 'medium', seed: 'start' });
    const grid = new HexGrid(map.width, map.height);
    const res = chooseStartPositions(map, grid, 4, Rng.fromSeed('p'));
    expect(res.ok).toBe(true);
    expect(res.positions).toHaveLength(4);
    expect(res.minDistance).toBeGreaterThanOrEqual(10);
    for (const p of res.positions) expect(isPassableLand(map.tiles[p])).toBe(true);
  });

  it('meldet einen nicht erreichbaren Mindestabstand', () => {
    const map = generateMap({ type: 'continents', size: 'small', seed: 'start' });
    const grid = new HexGrid(map.width, map.height);
    const res = chooseStartPositions(map, grid, 4, Rng.fromSeed('p'), 60);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Mindestabstand');
  });
});
