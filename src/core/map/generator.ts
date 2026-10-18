import { IMPASSABLE_ELEVATION, type ResourceId, type TerrainId } from '../data/terrain';
import { HexGrid, oppositeDir } from '../hex';
import { Noise2D } from '../noise';
import { Rng } from '../rng';
import { isWater, landComponents } from './passability';
import { MAP_SIZES, MAP_TYPES, type GameMap, type MapSize, type MapType, type Tile } from './types';

export interface MapGenOptions {
  type: MapType;
  size: MapSize;
  seed: string | number;
}

/** Anteile der Höhenstufen 1..5 an der Landfläche. */
const ELEVATION_SHARES = [
  [0.42, 0.28, 0.16, 0.1, 0.04],
  [0.24, 0.27, 0.25, 0.16, 0.08],
];

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Wert an der Stelle des Quantils q (0..1) in einer unsortierten Liste. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

interface Blob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  weight: number;
}

function makeBlobs(type: MapType, rng: Rng): Blob[] {
  const blobs: Blob[] = [];
  switch (type) {
    case 'continents': {
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i++) {
        const x = (i + 0.5) / count + (rng.next() - 0.5) * 0.08;
        blobs.push({ x, y: 0.5 + (rng.next() - 0.5) * 0.25, rx: 0.42 / count + 0.05, ry: 0.36, weight: 1 });
      }
      break;
    }
    case 'pangaea':
      blobs.push({ x: 0.5, y: 0.5, rx: 0.44, ry: 0.42, weight: 1 });
      break;
    case 'highlands':
      blobs.push({ x: 0.5, y: 0.5, rx: 0.46, ry: 0.42, weight: 1 });
      if (rng.chance(0.5)) blobs.push({ x: rng.chance(0.5) ? 0.2 : 0.8, y: 0.5, rx: 0.16, ry: 0.3, weight: 0.8 });
      break;
    case 'archipelago': {
      const count = rng.int(9, 14);
      for (let i = 0; i < count; i++) {
        blobs.push({
          x: 0.08 + rng.next() * 0.84,
          y: 0.1 + rng.next() * 0.8,
          rx: 0.05 + rng.next() * 0.08,
          ry: 0.06 + rng.next() * 0.1,
          weight: 0.8 + rng.next() * 0.3,
        });
      }
      break;
    }
    case 'inlandSea':
      break;
  }
  return blobs;
}

function shapeValue(type: MapType, blobs: Blob[], nx: number, ny: number): number {
  if (type === 'inlandSea') {
    const dx = (nx - 0.5) / 0.5;
    const dy = (ny - 0.5) / 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    // Land im Ring zwischen Binnenmeer (Mitte) und Außenozean
    return smoothstep(0.22, 0.42, d) * (1 - smoothstep(0.78, 0.98, d));
  }
  let best = 0;
  for (const b of blobs) {
    const dx = (nx - b.x) / b.rx;
    const dy = (ny - b.y) / b.ry;
    const v = (1 - Math.sqrt(dx * dx + dy * dy)) * b.weight;
    if (v > best) best = v;
  }
  return best;
}

export function generateMap(options: MapGenOptions): GameMap {
  const sizeDef = MAP_SIZES[options.size];
  const typeDef = MAP_TYPES[options.type];
  const { width, height } = sizeDef;
  const grid = new HexGrid(width, height);
  const rng = Rng.fromSeed(`${options.seed}`);
  const noise = new Noise2D(rng);
  const ridgeNoise = new Noise2D(rng);
  const plateauNoise = new Noise2D(rng);
  const climateNoise = new Noise2D(rng);
  const featureNoise = new Noise2D(rng);
  const blobs = makeBlobs(options.type, rng);

  const n = grid.size;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const col = grid.col(i);
    const row = grid.row(i);
    nx[i] = (col + 0.5 * (row & 1) + 0.5) / (width + 0.5);
    ny[i] = (row + 0.5) / height;
  }

  // 1) Landmaske
  const aspect = width / height;
  const landFreq = options.type === 'archipelago' ? 7 : 4;
  const shapeWeight = options.type === 'archipelago' ? 0.5 : 0.62;
  const height0 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const edgeDist = Math.min(nx[i], 1 - nx[i], ny[i], 1 - ny[i]);
    const edge = smoothstep(0.0, 0.09, edgeDist);
    const shape = shapeValue(options.type, blobs, nx[i], ny[i]);
    const nz = noise.fbm(nx[i] * landFreq * aspect * 0.6, ny[i] * landFreq, 5);
    height0[i] = (shapeWeight * shape + (1 - shapeWeight) * (nz * 0.5 + 0.5)) * edge;
  }
  const seaLevel = quantile(Array.from(height0), 1 - typeDef.landRatio);
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = height0[i] > seaLevel ? 1 : 0;

  // Mini-Inseln aus einem Feld entfernen und Ein-Feld-Seen auffüllen, damit Küsten ruhiger wirken
  for (let i = 0; i < n; i++) {
    const nb = grid.neighbors(i);
    const landNb = nb.filter((j) => land[j]).length;
    if (land[i] && landNb === 0) land[i] = 0;
    else if (!land[i] && landNb === nb.length && nb.length === 6) land[i] = 1;
  }

  // Distanz zur Küste (für Höhen- und Klimawerte)
  const coastDist = bfsDistance(grid, (i) => !land[i]);

  // 2) Höhenstufen
  const ruggedness = typeDef.ruggedness;
  const landIdx: number[] = [];
  const elevScore = new Float64Array(n);
  let maxCoast = 1;
  for (let i = 0; i < n; i++) if (land[i]) maxCoast = Math.max(maxCoast, coastDist[i]);
  for (let i = 0; i < n; i++) {
    if (!land[i]) continue;
    landIdx.push(i);
    const ridge = 1 - Math.abs(ridgeNoise.fbm(nx[i] * 5 * aspect * 0.6, ny[i] * 5, 4));
    const inland = Math.min(1, coastDist[i] / Math.max(3, maxCoast * 0.6));
    const base = (height0[i] - seaLevel) / (1 - seaLevel + 1e-9);
    elevScore[i] = 0.3 * base + 0.45 * ridge * ridge + 0.25 * inland;
  }
  const shares = ELEVATION_SHARES[ruggedness > 0 ? 1 : 0];
  const scores = landIdx.map((i) => elevScore[i]);
  const thresholds: number[] = [];
  let acc = 0;
  for (let k = 0; k < 4; k++) {
    acc += shares[k];
    thresholds.push(quantile(scores, acc));
  }
  const elevation = new Uint8Array(n);
  for (const i of landIdx) {
    let e = 1;
    for (const t of thresholds) if (elevScore[i] > t) e++;
    elevation[i] = e;
  }

  // Plateaus (Tafelberge) mit Klippenrändern
  const plateauThreshold = ruggedness > 0 ? 0.08 : 0.3;
  for (const i of landIdx) {
    const p = plateauNoise.fbm(nx[i] * 6 * aspect * 0.6, ny[i] * 6, 3);
    if (p > plateauThreshold && elevation[i] >= 1 && elevation[i] <= 3 && coastDist[i] >= 2) elevation[i] += 1;
  }

  // Einzelne Spitzen/Gruben glätten (zu viele Klippen um ein einzelnes Feld)
  for (const i of landIdx) {
    const nbs = grid.neighbors(i).filter((j) => land[j]);
    const cliffs = nbs.filter((j) => Math.abs(elevation[j] - elevation[i]) >= 2).length;
    if (cliffs >= 4) {
      const sorted = nbs.map((j) => elevation[j]).sort((a, b) => a - b);
      elevation[i] = sorted[Math.floor(sorted.length / 2)];
    }
  }

  // Hochgebirge nicht direkt an die Küste
  for (const i of landIdx) if (coastDist[i] <= 1 && elevation[i] >= IMPASSABLE_ELEVATION) elevation[i] = 4;

  // Kartenobjekt aufbauen (Klima folgt später)
  const tiles: Tile[] = new Array(n);
  for (let i = 0; i < n; i++) {
    tiles[i] = {
      terrain: land[i] ? 'grassland' : 'ocean',
      elevation: land[i] ? elevation[i] : 0,
      feature: null,
      resource: null,
      river: 0,
      landmass: -1,
    };
  }
  const map: GameMap = { width, height, tiles };

  // 3) Erreichbarkeit: Plateaus ohne Aufgang erhalten eine Rampe
  repairConnectivity(map, grid);

  // 4) Wasser: Ozean, Küste, Seen
  classifyWater(map, grid);

  // 5) Klima & Biome
  const waterDist = bfsDistance(grid, (i) => isWater(tiles[i]));
  const moisture = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (isWater(tiles[i])) continue;
    const m = climateNoise.fbm(nx[i] * 4 * aspect * 0.6, ny[i] * 4, 4) * 0.5 + 0.5;
    moisture[i] = Math.min(1, m + (waterDist[i] <= 2 ? 0.12 : 0) - (waterDist[i] >= 6 ? 0.08 : 0));
  }

  // 6) Flüsse (vor den Biomen, damit sie die Feuchtigkeit erhöhen)
  generateRivers(map, grid, rng, moisture, waterDist);
  for (let i = 0; i < n; i++) if (tiles[i].river) moisture[i] = Math.min(1, moisture[i] + 0.2);

  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (isWater(t)) continue;
    const lat = Math.abs(ny[i] - 0.5) * 2;
    const temp = 1.05 - lat * 1.05 + climateNoise.noise(nx[i] * 9, ny[i] * 9) * 0.12 - (t.elevation - 1) * 0.07;
    t.terrain = biome(temp, moisture[i], t.elevation);
  }

  // 7) Overlays: Wald, dichter Wald, Felsen
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (isWater(t) || t.elevation >= IMPASSABLE_ELEVATION) continue;
    const f = featureNoise.fbm(nx[i] * 8 * aspect * 0.6, ny[i] * 8, 3) * 0.5 + 0.5;
    const forestable = t.terrain === 'grassland' || t.terrain === 'plains' || t.terrain === 'tundra' || t.terrain === 'marsh';
    if (forestable && t.elevation <= 4 && f + moisture[i] * 0.6 > 0.92) {
      t.feature = moisture[i] > 0.66 && f > 0.55 && t.terrain !== 'tundra' ? 'denseForest' : 'forest';
    } else if (t.elevation >= 3 && rng.chance(0.28)) {
      t.feature = 'rocks';
    } else if (t.elevation === 2 && rng.chance(0.07)) {
      t.feature = 'rocks';
    }
  }

  // 8) Ressourcen
  placeResources(map, grid, rng);

  // 9) Landmassen nummerieren
  labelLandmasses(map, grid);

  return map;
}

function biome(temp: number, moisture: number, elevation: number): TerrainId {
  if (temp < 0.12 || (elevation >= 5 && temp < 0.7)) return 'snow';
  if (temp < 0.3) return 'tundra';
  if (moisture < 0.3 && temp > 0.6) return 'desert';
  if (moisture > 0.74 && elevation === 1) return 'marsh';
  if (moisture > 0.46) return 'grassland';
  return 'plains';
}

/** Mehrquellen-BFS: Distanz jedes Feldes zum nächsten Feld, für das isSource gilt. */
export function bfsDistance(grid: HexGrid, isSource: (i: number) => boolean): Int32Array {
  const dist = new Int32Array(grid.size).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < grid.size; i++) {
    if (isSource(i)) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const nb of grid.neighbors(cur)) {
      if (dist[nb] !== -1) continue;
      dist[nb] = dist[cur] + 1;
      queue.push(nb);
    }
  }
  for (let i = 0; i < grid.size; i++) if (dist[i] === -1) dist[i] = grid.width + grid.height;
  return dist;
}

/**
 * Verbindet getrennte begehbare Bereiche derselben Landmasse durch Rampen,
 * damit keine Plateaus oder Täler komplett unerreichbar sind.
 */
function repairConnectivity(map: GameMap, grid: HexGrid): void {
  const tiles = map.tiles;
  for (let iter = 0; iter < 80; iter++) {
    const { ids, sizes } = landComponents(map, grid);
    if (sizes.length <= 1) return;
    // kleinste Komponente suchen, die an eine andere Komponente derselben Landmasse grenzt
    const order = sizes.map((s, id) => ({ s, id })).sort((a, b) => a.s - b.s);
    let repaired = false;
    for (const { id } of order) {
      const path = pathToOtherComponent(map, grid, ids, id);
      if (!path) continue;
      const e0 = tiles[path[0]].elevation;
      const ek = tiles[path[path.length - 1]].elevation;
      const k = path.length - 1;
      if (k === 1) {
        // direkt benachbart: höheres Feld absenken
        const [a, b] = path;
        if (tiles[a].elevation > tiles[b].elevation) tiles[a].elevation = Math.min(4, tiles[b].elevation + 1);
        else tiles[b].elevation = Math.min(4, tiles[a].elevation + 1);
      } else {
        for (let s = 1; s < k; s++) {
          tiles[path[s]].elevation = Math.max(1, Math.min(4, Math.round(e0 + ((ek - e0) * s) / k)));
        }
        if (Math.abs(ek - tiles[path[k - 1]].elevation) >= 2) tiles[path[k]].elevation = Math.min(4, tiles[path[k - 1]].elevation + 1);
      }
      repaired = true;
      break;
    }
    if (!repaired) return;
  }
}

function pathToOtherComponent(map: GameMap, grid: HexGrid, ids: Int32Array, comp: number): number[] | null {
  const prev = new Int32Array(grid.size).fill(-2);
  const queue: number[] = [];
  for (let i = 0; i < grid.size; i++) {
    if (ids[i] === comp) {
      prev[i] = -1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const nb of grid.neighbors(cur)) {
      if (prev[nb] !== -2 || isWater(map.tiles[nb])) continue;
      prev[nb] = cur;
      if (ids[nb] !== -1 && ids[nb] !== comp) {
        const path = [nb];
        let p = cur;
        while (p !== -1) {
          path.push(p);
          p = prev[p];
        }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return null;
}

function classifyWater(map: GameMap, grid: HexGrid): void {
  const tiles = map.tiles;
  const seen = new Uint8Array(grid.size);
  for (let start = 0; start < grid.size; start++) {
    if (seen[start] || tiles[start].elevation > 0) continue;
    const comp: number[] = [];
    let touchesEdge = false;
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const cur = queue.pop()!;
      comp.push(cur);
      const c = grid.col(cur);
      const r = grid.row(cur);
      if (c === 0 || r === 0 || c === grid.width - 1 || r === grid.height - 1) touchesEdge = true;
      for (const nb of grid.neighbors(cur)) {
        if (seen[nb] || tiles[nb].elevation > 0) continue;
        seen[nb] = 1;
        queue.push(nb);
      }
    }
    const isLake = !touchesEdge && comp.length <= 18;
    for (const i of comp) {
      if (isLake) {
        tiles[i].terrain = 'lake';
        continue;
      }
      const nearLand = grid.neighbors(i).some((nb) => tiles[nb].elevation > 0);
      tiles[i].terrain = nearLand ? 'coast' : 'ocean';
    }
  }
}

function generateRivers(map: GameMap, grid: HexGrid, rng: Rng, moisture: Float64Array, waterDist: Int32Array): void {
  const tiles = map.tiles;
  const landCount = tiles.filter((t) => !isWater(t)).length;
  const target = Math.max(2, Math.round(landCount / 70));
  const sources = rng.shuffle(
    tiles
      .map((_, i) => i)
      .filter((i) => !isWater(tiles[i]) && tiles[i].elevation >= 3 && tiles[i].elevation <= 4 && moisture[i] > 0.35 && waterDist[i] >= 3),
  );
  let made = 0;
  for (const src of sources) {
    if (made >= target) break;
    if (tiles[src].river || grid.neighbors(src).some((nb) => tiles[nb].river)) continue;
    const path = [src];
    const visited = new Set<number>([src]);
    let cur = src;
    let reachedWater = false;
    for (let step = 0; step < 40; step++) {
      let best = -1;
      let bestScore = Infinity;
      for (const nb of grid.neighbors(cur)) {
        if (visited.has(nb)) continue;
        const t = tiles[nb];
        if (t.elevation > tiles[cur].elevation) continue;
        if (t.elevation >= IMPASSABLE_ELEVATION) continue;
        const score = waterDist[nb] * 10 + t.elevation * 3 + rng.next();
        if (score < bestScore) {
          bestScore = score;
          best = nb;
        }
      }
      if (best < 0) break;
      path.push(best);
      visited.add(best);
      if (isWater(tiles[best]) || tiles[best].river) {
        reachedWater = true;
        break;
      }
      cur = best;
    }
    if (!reachedWater || path.length < 4) continue;
    for (let s = 0; s < path.length - 1; s++) {
      const dir = grid.directionTo(path[s], path[s + 1]);
      tiles[path[s]].river |= 1 << dir;
      if (!isWater(tiles[path[s + 1]])) tiles[path[s + 1]].river |= 1 << oppositeDir(dir);
    }
    made++;
  }
}

function placeResources(map: GameMap, grid: HexGrid, rng: Rng): void {
  const tiles = map.tiles;
  for (let i = 0; i < grid.size; i++) {
    const t = tiles[i];
    if (isWater(t)) {
      if (t.terrain !== 'ocean' && rng.chance(0.13)) t.resource = 'fish';
      continue;
    }
    if (t.elevation >= IMPASSABLE_ELEVATION || !rng.chance(0.16)) continue;
    const options: [ResourceId, number][] = [];
    const nearWater = grid.neighbors(i).some((nb) => isWater(tiles[nb])) || t.river > 0;
    if (t.feature === 'forest' || t.feature === 'denseForest') options.push(['game', 4]);
    if (t.elevation >= 2 || t.feature === 'rocks') {
      options.push(['flint', 2], ['copper', 2], ['tin', 1], ['iron', 2], ['coal', 2], ['precious', 0.5]);
      if (t.elevation >= 3) options.push(['rare_earth', 0.6]);
    }
    if (!t.feature && t.elevation <= 2) {
      if (t.terrain === 'grassland' || t.terrain === 'plains') options.push(['wheat', 3], ['horses', t.terrain === 'plains' ? 1.5 : 0.5]);
      if (t.terrain === 'grassland') options.push(['cotton', 1], ['sheep', t.elevation === 2 ? 3 : 1]);
      if (t.terrain === 'plains') options.push(['sheep', 1.5]);
      if (nearWater) options.push(['clay', 1.5]);
    }
    if (t.terrain === 'desert') options.push(['oil', 2], ['precious', 1]);
    if (t.terrain === 'tundra') options.push(['oil', 1], ['game', 2], ['rare_earth', 0.5]);
    if (t.terrain === 'marsh') options.push(['oil', 1], ['clay', 2]);
    if (!options.length) continue;
    const total = options.reduce((s, [, w]) => s + w, 0);
    let roll = rng.next() * total;
    for (const [res, w] of options) {
      roll -= w;
      if (roll <= 0) {
        t.resource = res;
        break;
      }
    }
  }
}

function labelLandmasses(map: GameMap, grid: HexGrid): void {
  const tiles = map.tiles;
  let next = 0;
  for (let start = 0; start < grid.size; start++) {
    if (isWater(tiles[start]) || tiles[start].landmass !== -1) continue;
    const queue = [start];
    tiles[start].landmass = next;
    while (queue.length) {
      const cur = queue.pop()!;
      for (const nb of grid.neighbors(cur)) {
        if (isWater(tiles[nb]) || tiles[nb].landmass !== -1) continue;
        tiles[nb].landmass = next;
        queue.push(nb);
      }
    }
    next++;
  }
}

