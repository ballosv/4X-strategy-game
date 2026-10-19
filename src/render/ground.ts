import { CLIFF_DELTA, TERRAIN, type TerrainId } from '../core/data/terrain';
import type { Tile } from '../core/map/types';
import { hash01, type PaintContext } from './painter';
import { RIVER, shade } from './palette';
import { EDGE_CORNERS, HEX_CORNERS, HEX_R, HEX_W, SQUASH, lift, type Point } from './projection';
import { groundColor, groundPattern, wallPattern, type WallTexture } from './textures';

/**
 * Bodenschichten der Landschaft (Grafik-Spezifikation v2, Kap. 4):
 * 1 Wasser · 2 Bodenflächen mit Übergängen · 3 Wände · 4 Flüsse · 5 Bodendetails · 7 Hexgitter.
 * Objekte (Schicht 6) zeichnet objects.ts.
 */

export function isWaterTile(t: Tile): boolean {
  return TERRAIN[t.terrain].water;
}

export function effElevation(t: Tile): number {
  return isWaterTile(t) ? 0 : t.elevation;
}

export function hexPath(ctx: CanvasRenderingContext2D, c: Point, scale = 1): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const p = HEX_CORNERS[k];
    if (k === 0) ctx.moveTo(c.x + p.x * scale, c.y + p.y * scale);
    else ctx.lineTo(c.x + p.x * scale, c.y + p.y * scale);
  }
  ctx.closePath();
}

/** Rauschwert an einem Weltpunkt: benachbarte Felder sehen an gemeinsamen Kanten denselben Wert. */
function worldNoise(x: number, y: number, salt: number): number {
  return hash01(Math.round(x * 0.5) * 7 + salt, Math.round(y * 0.5) * 13 - salt);
}

/** Reihenfolge für Übergänge: das Gelände mit höherem Rang greift mit einem Saum in das Nachbarfeld. */
const BLEND_RANK: Record<TerrainId, number> = { ocean: 0, lake: 1, coast: 2, marsh: 3, grassland: 4, plains: 5, tundra: 6, desert: 7, snow: 8 };

/**
 * Unregelmäßiger Saum entlang einer Kante (dir) nach innen. depth ist der Anteil des Weges zur Mitte.
 * Der Pfad beginnt auf der Kante, damit der Saum die harte Feldgrenze überdeckt.
 */
function edgeBand(ctx: CanvasRenderingContext2D, c: Point, dir: number, depth: number, salt: number): void {
  const [a, b] = EDGE_CORNERS[dir];
  const p1 = { x: c.x + HEX_CORNERS[a].x * 1.02, y: c.y + HEX_CORNERS[a].y * 1.02 };
  const p2 = { x: c.x + HEX_CORNERS[b].x * 1.02, y: c.y + HEX_CORNERS[b].y * 1.02 };
  const n = 7;
  const inner: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const ex = p1.x + (p2.x - p1.x) * t;
    const ey = p1.y + (p2.y - p1.y) * t;
    const f = depth * (0.45 + 0.75 * worldNoise(ex, ey, salt)) * (0.7 + 0.3 * Math.sin(Math.PI * t));
    inner.push({ x: ex + (c.x - ex) * f, y: ey + (c.y - ey) * f });
  }
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(inner[n].x, inner[n].y);
  for (let k = n - 1; k > 0; k--) {
    const m = { x: (inner[k].x + inner[k - 1].x) / 2, y: (inner[k].y + inner[k - 1].y) / 2 };
    ctx.quadraticCurveTo(inner[k].x, inner[k].y, m.x, m.y);
  }
  ctx.lineTo(inner[0].x, inner[0].y);
  ctx.closePath();
}

function fillGround(ctx: CanvasRenderingContext2D, terrain: TerrainId, layered = true): void {
  ctx.fillStyle = groundPattern(ctx, terrain, 0) ?? groundColor(terrain);
  ctx.fill();
  const second = layered ? groundPattern(ctx, terrain, 1) : null;
  if (second) {
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = second;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Schicht 1/2: Oberseite mit Textur in Weltkoordinaten und weichen Übergängen zu Nachbarn. */
export function paintFace(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number, t: Tile, top: Point): void {
  const water = isWaterTile(t);
  const elev = effElevation(t);
  hexPath(ctx, top, 1.012);
  fillGround(ctx, t.terrain);
  ctx.save();
  hexPath(ctx, top, 1.012);
  ctx.clip();
  // Hochlagen felsiger und etwas heller (Licht)
  if (!water && elev >= 4) {
    // Gebirge: deckender Felsboden, kein Gras (das Bergmassiv steht darauf)
    ctx.fillStyle = wallPattern(ctx, t.terrain === 'snow' || elev >= 5 ? 'cliff_snow' : 'cliff_temperate') ?? '#8d857b';
    ctx.fill();
    ctx.fillStyle = 'rgba(40,36,30,0.18)';
    ctx.fill();
  } else if (!water && elev >= 2) {
    ctx.fillStyle = `rgba(255,250,225,${0.025 * (elev - 1)})`;
    ctx.fill();
  }
  // Übergänge: Nachbarn gleicher Höhe mit höherem Rang greifen herein
  for (let d = 0; d < 6; d++) {
    const nb = pc.grid.neighbor(i, d);
    if (nb < 0) continue;
    const n = pc.state.map.tiles[nb];
    if (n.terrain === t.terrain || isWaterTile(n) !== water || effElevation(n) !== elev) continue;
    if (BLEND_RANK[n.terrain] < BLEND_RANK[t.terrain]) continue;
    ctx.globalAlpha = 0.5;
    edgeBand(ctx, top, d, water ? 0.55 : 0.42, 11);
    fillGround(ctx, n.terrain, false);
    ctx.globalAlpha = 1;
    edgeBand(ctx, top, d, water ? 0.3 : 0.2, 29);
    fillGround(ctx, n.terrain, false);
  }
  if (water) paintShore(ctx, pc, i, top);
  ctx.restore();
}

/** Wasser an Land: hellerer Flachwasserstreifen und Schaumkante. */
function paintShore(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number, top: Point): void {
  for (let d = 0; d < 6; d++) {
    const nb = pc.grid.neighbor(i, d);
    if (nb < 0 || isWaterTile(pc.state.map.tiles[nb])) continue;
    edgeBand(ctx, top, d, 0.5, 41);
    ctx.fillStyle = 'rgba(120,225,220,0.28)';
    ctx.fill();
    edgeBand(ctx, top, d, 0.2, 53);
    ctx.fillStyle = 'rgba(160,240,235,0.3)';
    ctx.fill();
    edgeBand(ctx, top, d, 0.09, 67);
    ctx.fillStyle = 'rgba(245,252,255,0.75)';
    ctx.fill();
  }
}

function wallKind(t: Tile, nb: Tile | null, levels: number): { tex: WallTexture; cliff: boolean } {
  const nbWater = !!nb && isWaterTile(nb);
  const cliff = levels >= CLIFF_DELTA || (nbWater && t.elevation >= 2) || !nb;
  // Gebirge (Stufe 4+) hat auch an flachen Hängen Fels statt Erde
  if (!cliff && t.elevation < 4) return { tex: nbWater ? 'beach' : 'slope', cliff };
  const tex: WallTexture = t.terrain === 'snow' || t.terrain === 'tundra' || t.elevation >= 5 ? 'cliff_snow' : t.terrain === 'desert' ? 'cliff_desert' : 'cliff_temperate';
  return { tex, cliff };
}

/** Schicht 3: Wände der dem Betrachter zugewandten Kanten (SW, SO) zu tiefer liegenden Nachbarn. */
export function paintWalls(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number, t: Tile, top: Point): void {
  const { state, grid } = pc;
  const elev = effElevation(t);
  const water = isWaterTile(t);
  for (const dir of [4, 5]) {
    const nbi = grid.neighbor(i, dir);
    const nb = nbi >= 0 ? state.map.tiles[nbi] : null;
    const nbElev = nb ? effElevation(nb) : -0.6;
    const drop = lift(elev) - lift(nbElev);
    if (drop <= 0) continue;
    const [a, b] = EDGE_CORNERS[dir];
    const p1 = { x: top.x + HEX_CORNERS[a].x, y: top.y + HEX_CORNERS[a].y };
    const p2 = { x: top.x + HEX_CORNERS[b].x, y: top.y + HEX_CORNERS[b].y };
    const quad = () => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y - 0.5);
      ctx.lineTo(p2.x, p2.y - 0.5);
      ctx.lineTo(p2.x, p2.y + drop + 0.5);
      ctx.lineTo(p1.x, p1.y + drop + 0.5);
      ctx.closePath();
    };
    quad();
    if (water) {
      ctx.fillStyle = shade(groundColor(t.terrain, 0), -0.35);
      ctx.fill();
      continue;
    }
    const { tex, cliff } = wallKind(t, nb, elev - nbElev);
    ctx.fillStyle = wallPattern(ctx, tex) ?? '#8d857b';
    ctx.fill();
    // Licht von oben links: SW-Wand beleuchtet, SO-Wand im Schatten; Umgebungsverschattung am Fuß
    ctx.fillStyle = dir === 5 ? 'rgba(28,22,40,0.34)' : 'rgba(255,240,210,0.05)';
    ctx.fill();
    const yTop = Math.min(p1.y, p2.y);
    const ao = ctx.createLinearGradient(0, yTop, 0, yTop + drop + Math.abs(p1.y - p2.y));
    ao.addColorStop(0, 'rgba(0,0,0,0.22)');
    ao.addColorStop(0.12, 'rgba(0,0,0,0)');
    ao.addColorStop(0.6, 'rgba(0,0,0,0)');
    ao.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = ao;
    ctx.fill();
    if (cliff && nb && !isWaterTile(nb)) paintScree(ctx, p1, p2, drop, i * 6 + dir);
    if (t.river & (1 << dir)) paintWaterfall(ctx, p1, p2, drop, nb ? isWaterTile(nb) : true);
    paintOverhang(ctx, t, p1, p2, cliff, i * 6 + dir);
  }
}

/** Grasüberhang an der Oberkante (unregelmäßig, hängt ein paar Pixel über die Wand). */
function paintOverhang(ctx: CanvasRenderingContext2D, t: Tile, p1: Point, p2: Point, cliff: boolean, salt: number): void {
  const n = 9;
  // Gebirge mit Felskante statt Grasüberhang
  const rocky = !isWaterTile(t) && effElevation(t) >= 4;
  const dark = rocky ? '#6f6a62' : groundColor(t.terrain, 0);
  const mid = rocky ? '#a39d93' : groundColor(t.terrain, 1);
  const pts: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = p1.x + (p2.x - p1.x) * f;
    const y = p1.y + (p2.y - p1.y) * f;
    const hang = (cliff ? 2.5 : 1.5) + worldNoise(x, y, salt) * (cliff ? 5 : 3);
    pts.push({ x, y: y + hang });
  }
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y - 1);
  ctx.lineTo(p2.x, p2.y - 1);
  for (let k = n; k >= 0; k--) {
    const p = pts[k];
    const q = pts[Math.max(0, k - 1)];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // heller Saum oben (Licht)
  ctx.strokeStyle = mid;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y + 0.6);
  ctx.lineTo(p2.x, p2.y + 0.6);
  ctx.stroke();
}

/** Geröll am Fuß einer Felswand. */
function paintScree(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, drop: number, salt: number): void {
  for (let k = 0; k < 6; k++) {
    const f = 0.08 + hash01(salt, k) * 0.84;
    const x = p1.x + (p2.x - p1.x) * f;
    const y = p1.y + (p2.y - p1.y) * f + drop - 1 - hash01(k, salt) * 3;
    const r = 1.4 + hash01(salt + k, 3) * 2.2;
    ctx.fillStyle = 'rgba(70,64,58,0.9)';
    ctx.beginPath();
    ctx.ellipse(x + 0.6, y + 0.4, r * 1.3, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(176,168,156,0.95)';
    ctx.beginPath();
    ctx.ellipse(x - 0.3, y - 0.3, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintWaterfall(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, drop: number, intoWater: boolean): void {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const g = ctx.createLinearGradient(0, my, 0, my + drop);
  g.addColorStop(0, RIVER.light);
  g.addColorStop(0.5, '#bfe6fa');
  g.addColorStop(1, '#f2fbff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(mx - 5, my - 1);
  ctx.lineTo(mx + 5, my - 1);
  ctx.quadraticCurveTo(mx + 7, my + drop * 0.5, mx + 8, my + drop);
  ctx.lineTo(mx - 8, my + drop);
  ctx.quadraticCurveTo(mx - 7, my + drop * 0.5, mx - 5, my - 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 0.9;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(mx + k * 2, my + 2);
    ctx.lineTo(mx + k * 2.8, my + drop - 2);
    ctx.stroke();
  }
  ctx.fillStyle = intoWater ? 'rgba(255,255,255,0.85)' : 'rgba(240,250,255,0.75)';
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(mx + (k - 1.5) * 4.5, my + drop - 1 + (k % 2), 4.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function edgeMid(c: Point, dir: number): Point {
  const [a, b] = EDGE_CORNERS[dir];
  return { x: c.x + (HEX_CORNERS[a].x + HEX_CORNERS[b].x) / 2, y: c.y + (HEX_CORNERS[a].y + HEX_CORNERS[b].y) / 2 };
}

/** Schicht 4: Flussband mit Uferkante. */
export function paintRiver(ctx: CanvasRenderingContext2D, t: Tile, c: Point): void {
  const dirs: number[] = [];
  for (let d = 0; d < 6; d++) if (t.river & (1 << d)) dirs.push(d);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [
    [11, 'rgba(70,60,35,0.35)'],
    [8.5, shade(RIVER.deep, -0.2)],
    [6.5, RIVER.deep],
    [2.2, 'rgba(190,232,250,0.75)'],
  ] as [number, string][]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const d of dirs) {
      const m = edgeMid(c, d);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.quadraticCurveTo((c.x + m.x) / 2 + (d % 2 ? 4 : -4), (c.y + m.y) / 2, m.x, m.y);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

export function pointInHexLocal(dx: number, dy: number, scale: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy / SQUASH);
  const hw = (HEX_W / 2) * scale;
  const r = HEX_R * scale;
  return ax <= hw && ay <= r && r * hw - (r / 2) * ax - hw * ay >= 0;
}

/** Schicht 5: Bodendetails – Blumen, Steinchen, Grasbüschel. */
export function paintGroundDetails(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point, density = 1): void {
  if (isWaterTile(t) || t.terrain === 'snow') return;
  const n = Math.round((t.terrain === 'desert' ? 3 : 7) * density);
  const flowers = t.terrain === 'grassland' ? ['#f4e27a', '#ffffff', '#c88ad8'] : t.terrain === 'plains' ? ['#f2c94c', '#e8e0c8'] : [];
  for (let k = 0; k < n; k++) {
    const dx = (hash01(i, 700 + k) - 0.5) * HEX_W * 0.85;
    const dy = (hash01(700 + k, i) - 0.5) * HEX_R * 1.6 * SQUASH;
    if (!pointInHexLocal(dx, dy, 0.88)) continue;
    const x = c.x + dx;
    const y = c.y + dy;
    const r = hash01(i * 7, k);
    if (flowers.length && r < 0.45) {
      ctx.fillStyle = flowers[k % flowers.length];
      for (let f = 0; f < 3; f++) {
        ctx.beginPath();
        ctx.arc(x + (f - 1) * 1.8, y + (f % 2) * 1.1, 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (r < 0.7) {
      ctx.fillStyle = 'rgba(60,55,50,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + 0.5, y + 0.4, 1.8, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(205,200,190,0.9)';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.4, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.terrain !== 'desert') {
      ctx.strokeStyle = shade(groundColor(t.terrain, 0), -0.15);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let b = -1; b <= 1; b++) {
        ctx.moveTo(x + b, y);
        ctx.lineTo(x + b * 2.2, y - 3.2 - Math.abs(b) * -0.6);
      }
      ctx.stroke();
    }
  }
}

/** Schicht 7: feines helles Hexgitter über der Landschaft. */
export function paintGridLine(ctx: CanvasRenderingContext2D, t: Tile, c: Point): void {
  hexPath(ctx, c);
  ctx.strokeStyle = isWaterTile(t) ? 'rgba(220,245,255,0.16)' : 'rgba(240,255,200,0.22)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
