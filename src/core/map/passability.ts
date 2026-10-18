import { CLIFF_DELTA, IMPASSABLE_ELEVATION, TERRAIN } from '../data/terrain';
import type { HexGrid } from '../hex';
import type { GameMap, Tile } from './types';

export function isWater(tile: Tile): boolean {
  return TERRAIN[tile.terrain].water;
}

/** Landfeld, das von Landeinheiten betreten werden kann. */
export function isPassableLand(tile: Tile): boolean {
  return !isWater(tile) && tile.elevation < IMPASSABLE_ELEVATION;
}

/** Zwischen zwei benachbarten Landfeldern liegt eine Klippe. */
export function isCliff(a: Tile, b: Tile): boolean {
  if (isWater(a) || isWater(b)) return false;
  return Math.abs(a.elevation - b.elevation) >= CLIFF_DELTA;
}

/** Kann eine Landeinheit direkt von a nach b ziehen? */
export function canStepLand(a: Tile, b: Tile): boolean {
  return isPassableLand(a) && isPassableLand(b) && !isCliff(a, b);
}

/**
 * Zusammenhangskomponenten des Landbewegungsgraphen (Klippen und Hochgebirge trennen).
 * Rückgabe: Komponenten-ID je Feld (−1 für nicht begehbare Felder).
 */
export function landComponents(map: GameMap, grid: HexGrid): { ids: Int32Array; sizes: number[] } {
  const ids = new Int32Array(grid.size).fill(-1);
  const sizes: number[] = [];
  const queue: number[] = [];
  for (let start = 0; start < grid.size; start++) {
    if (ids[start] !== -1 || !isPassableLand(map.tiles[start])) continue;
    const id = sizes.length;
    let size = 0;
    ids[start] = id;
    queue.length = 0;
    queue.push(start);
    while (queue.length) {
      const cur = queue.pop()!;
      size++;
      for (const n of grid.neighbors(cur)) {
        if (ids[n] !== -1) continue;
        if (!canStepLand(map.tiles[cur], map.tiles[n])) continue;
        ids[n] = id;
        queue.push(n);
      }
    }
    sizes.push(size);
  }
  return { ids, sizes };
}
