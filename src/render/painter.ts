import { CLIFF_DELTA, TERRAIN } from '../core/data/terrain';
import type { HexGrid } from '../core/hex';
import type { Tile } from '../core/map/types';
import type { GameState, Settlement } from '../core/state';
import { CLIFF, EARTH, FOREST, RIVER, ROCK, TERRAIN_COLORS, shade, withAlpha } from './palette';
import { EDGE_CORNERS, ELEV_STEP, HEX_CORNERS, HEX_R, HEX_W, SQUASH, lift, tileTop, type Point } from './projection';

/** Deterministischer Pseudo-Zufall je Feld (für Baumpositionen etc.). */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 100000) / 100000;
}

export interface PaintContext {
  state: GameState;
  grid: HexGrid;
  /** Ist das Feld für den betrachtenden Spieler erkundet? */
  explored: (i: number) => boolean;
  settlementsByTile: Map<number, Settlement>;
}

function isWaterTile(t: Tile): boolean {
  return TERRAIN[t.terrain].water;
}

function effElevation(t: Tile): number {
  return isWaterTile(t) ? 0 : t.elevation;
}

function hexPath(ctx: CanvasRenderingContext2D, c: Point, scale = 1): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const p = HEX_CORNERS[k];
    if (k === 0) ctx.moveTo(c.x + p.x * scale, c.y + p.y * scale);
    else ctx.lineTo(c.x + p.x * scale, c.y + p.y * scale);
  }
  ctx.closePath();
}

export function tracedHex(ctx: CanvasRenderingContext2D, c: Point, scale = 1): void {
  hexPath(ctx, c, scale);
}

/** Zeichnet ein komplettes Feld: Wände, Oberseite, Fluss, Overlays, Ausbau, Siedlung. */
export function paintTile(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number): void {
  const { state, grid } = pc;
  const t = state.map.tiles[i];
  const col = grid.col(i);
  const row = grid.row(i);
  const elev = effElevation(t);
  const top = tileTop(col, row, elev);
  const water = isWaterTile(t);

  // 1) Wände zu tiefer liegenden Nachbarn (nur die dem Betrachter zugewandten Kanten SW und SO)
  for (const dir of [4, 5]) {
    const nb = grid.neighbor(i, dir);
    const nbElev = nb >= 0 ? effElevation(state.map.tiles[nb]) : -1;
    const drop = lift(elev) - (nb >= 0 ? lift(nbElev) : -10);
    if (drop <= 0) continue;
    const [a, b] = EDGE_CORNERS[dir];
    const p1 = { x: top.x + HEX_CORNERS[a].x, y: top.y + HEX_CORNERS[a].y };
    const p2 = { x: top.x + HEX_CORNERS[b].x, y: top.y + HEX_CORNERS[b].y };
    const levels = nb >= 0 ? elev - nbElev : elev + 1;
    const cliff = !water && (levels >= CLIFF_DELTA || (nb >= 0 && isWaterTile(state.map.tiles[nb]) && elev >= 2));
    const lit = dir === 4;
    const pal = cliff ? CLIFF : EARTH;
    const grad = ctx.createLinearGradient(0, p1.y, 0, p1.y + drop);
    grad.addColorStop(0, lit ? pal.lit : pal.shade);
    grad.addColorStop(1, shade(lit ? pal.lit : pal.shade, -0.25));
    ctx.fillStyle = water ? shade(TERRAIN_COLORS[t.terrain].dark, -0.2) : grad;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, p2.y + drop);
    ctx.lineTo(p1.x, p1.y + drop);
    ctx.closePath();
    ctx.fill();
    if (cliff) {
      // Gesteinsschichten
      ctx.strokeStyle = CLIFF.strata;
      ctx.lineWidth = 1;
      for (let y = ELEV_STEP * 0.6; y < drop - 2; y += ELEV_STEP * 0.7) {
        const j = (hash01(i, y | 0) - 0.5) * 3;
        ctx.beginPath();
        ctx.moveTo(p1.x + 2, p1.y + y + j);
        ctx.lineTo(p2.x - 2, p2.y + y - j);
        ctx.stroke();
      }
      // senkrechte Risse
      for (let k = 0; k < 3; k++) {
        const f = 0.2 + hash01(i, 40 + k) * 0.6;
        const x = p1.x + (p2.x - p1.x) * f;
        const y = p1.y + (p2.y - p1.y) * f;
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + (hash01(i, k) - 0.5) * 4, y + drop * (0.4 + hash01(k, i) * 0.5));
        ctx.stroke();
      }
    }
    // Grasnarbe an der Oberkante
    if (!water) {
      ctx.strokeStyle = shade(TERRAIN_COLORS[t.terrain].dark, -0.1);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y + 1);
      ctx.lineTo(p2.x, p2.y + 1);
      ctx.stroke();
    }
    // Wasserfall, wenn ein Fluss über diese Kante fließt
    if (!water && t.river & (1 << dir)) {
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const g2 = ctx.createLinearGradient(0, my, 0, my + drop);
      g2.addColorStop(0, RIVER.light);
      g2.addColorStop(1, '#e8f6ff');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(mx - 5, my - 1);
      ctx.lineTo(mx + 5, my - 1);
      ctx.lineTo(mx + 6, my + drop);
      ctx.lineTo(mx - 6, my + drop);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(mx, my + drop, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2) Oberseite
  const pal = TERRAIN_COLORS[t.terrain];
  let faceColor = pal.top;
  if (!water && t.elevation >= 4) faceColor = mixHex(pal.top, ROCK.mid, t.elevation >= 5 ? 0.55 : 0.35);
  const fg = ctx.createLinearGradient(top.x - HEX_W / 2, top.y - HEX_R * SQUASH, top.x + HEX_W / 2, top.y + HEX_R * SQUASH);
  fg.addColorStop(0, shade(faceColor, 0.1));
  fg.addColorStop(1, shade(faceColor, -0.08));
  hexPath(ctx, top);
  ctx.fillStyle = fg;
  ctx.fill();

  // Struktur (leicht handgemalter Eindruck)
  paintTexture(ctx, t, i, top);

  if (water) paintWaterDetails(ctx, pc, i, top);

  // Feine Hexgrenze, Lichtkante oben links
  hexPath(ctx, top);
  ctx.strokeStyle = water ? 'rgba(255,255,255,0.10)' : 'rgba(30,40,20,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!water) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    const c2 = HEX_CORNERS[2];
    const c3 = HEX_CORNERS[3];
    const c4 = HEX_CORNERS[4];
    ctx.moveTo(top.x + c2.x * 0.96, top.y + c2.y * 0.96);
    ctx.lineTo(top.x + c3.x * 0.96, top.y + c3.y * 0.96);
    ctx.lineTo(top.x + c4.x * 0.96, top.y + c4.y * 0.96);
    ctx.stroke();
  }

  // 3) Fluss
  if (!water && t.river) paintRiver(ctx, t, top);

  const settlement = pc.settlementsByTile.get(i);
  const imp = state.improvements[i];

  // 4) Gelände-Overlays
  if (!water && t.elevation >= 4 && !settlement) paintMountain(ctx, t, i, top);
  if (t.feature === 'rocks' && !settlement && !imp) paintRocks(ctx, i, top);
  if ((t.feature === 'forest' || t.feature === 'denseForest') && !settlement) {
    const conifer = t.terrain === 'tundra' || t.terrain === 'snow' || t.elevation >= 3;
    paintForest(ctx, i, top, t.feature === 'denseForest' ? 10 : 6, conifer, imp?.type === 'lumber' || imp?.type === 'hunting' ? 0.55 : 1);
  }

  // 5) Ausbau
  if (imp && !settlement) paintImprovement(ctx, imp.type, imp.level, i, top);

  // 6) Ressource
  if (t.resource && !settlement && !imp) paintResourceMarker(ctx, t, top);

  // 7) Siedlung
  if (settlement) paintSettlement(ctx, state, settlement, top, i);
}

function mixHex(a: string, b: string, f: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const mix = (sh: number) => Math.round(((na >> sh) & 255) * (1 - f) + ((nb >> sh) & 255) * f);
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`;
}

function paintTexture(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point): void {
  const pal = TERRAIN_COLORS[t.terrain];
  const water = isWaterTile(t);
  ctx.save();
  hexPath(ctx, c, 0.94);
  ctx.clip();
  const n = water ? 0 : 14;
  for (let k = 0; k < n; k++) {
    const x = c.x + (hash01(i, k) - 0.5) * HEX_W * 0.9;
    const y = c.y + (hash01(k, i) - 0.5) * HEX_R * 1.6 * SQUASH;
    const light = hash01(i * 3, k) > 0.5;
    ctx.strokeStyle = withAlpha(light ? pal.light : pal.dark, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (t.terrain === 'grassland' || t.terrain === 'plains' || t.terrain === 'marsh') {
      // Grasbüschel
      ctx.moveTo(x - 2, y + 1.5);
      ctx.lineTo(x, y - 2);
      ctx.lineTo(x + 2, y + 1.5);
    } else if (t.terrain === 'desert') {
      ctx.ellipse(x, y, 4, 1.2, 0, Math.PI, Math.PI * 2);
    } else {
      ctx.moveTo(x - 2.5, y);
      ctx.lineTo(x + 2.5, y);
    }
    ctx.stroke();
  }
  if (t.terrain === 'marsh') {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = 'rgba(70,120,140,0.55)';
      ctx.beginPath();
      ctx.ellipse(c.x + (hash01(i, 90 + k) - 0.5) * HEX_W * 0.6, c.y + (hash01(90 + k, i) - 0.5) * HEX_R * 0.8 * SQUASH, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintWaterDetails(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number, c: Point): void {
  const t = pc.state.map.tiles[i];
  // Wellenlinien
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 2; k++) {
    const x = c.x + (hash01(i, k) - 0.5) * HEX_W * 0.6;
    const y = c.y + (hash01(k + 7, i) - 0.5) * HEX_R * 0.9 * SQUASH;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.quadraticCurveTo(x - 3, y - 2.5, x, y);
    ctx.quadraticCurveTo(x + 3, y + 2.5, x + 6, y);
    ctx.stroke();
  }
  if (t.terrain === 'ocean') return;
  // Brandung entlang von Landkanten
  for (let dir = 0; dir < 6; dir++) {
    const nb = pc.grid.neighbor(i, dir);
    if (nb < 0 || isWaterTile(pc.state.map.tiles[nb])) continue;
    const [a, b] = EDGE_CORNERS[dir];
    const p1 = HEX_CORNERS[a];
    const p2 = HEX_CORNERS[b];
    ctx.strokeStyle = 'rgba(235,248,255,0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c.x + p1.x * 0.9, c.y + p1.y * 0.9);
    ctx.lineTo(c.x + p2.x * 0.9, c.y + p2.y * 0.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,180,130,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x + p1.x * 0.98, c.y + p1.y * 0.98);
    ctx.lineTo(c.x + p2.x * 0.98, c.y + p2.y * 0.98);
    ctx.stroke();
  }
}

function edgeMid(c: Point, dir: number): Point {
  const [a, b] = EDGE_CORNERS[dir];
  return { x: c.x + (HEX_CORNERS[a].x + HEX_CORNERS[b].x) / 2, y: c.y + (HEX_CORNERS[a].y + HEX_CORNERS[b].y) / 2 };
}

function paintRiver(ctx: CanvasRenderingContext2D, t: Tile, c: Point): void {
  const dirs: number[] = [];
  for (let d = 0; d < 6; d++) if (t.river & (1 << d)) dirs.push(d);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [
    [7, shade(RIVER.deep, -0.15)],
    [5, RIVER.deep],
    [2, RIVER.light],
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

function paintMountain(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point): void {
  const high = t.elevation >= 5;
  const cold = high || t.terrain === 'snow' || t.terrain === 'tundra';
  const peaks = high ? [{ dx: 0, h: 50, w: 30 }, { dx: -15, h: 30, w: 18 }, { dx: 16, h: 34, w: 20 }] : [{ dx: -6, h: 32, w: 22 }, { dx: 12, h: 24, w: 17 }];
  // Schatten nach rechts unten
  ctx.fillStyle = 'rgba(30,30,30,0.18)';
  ctx.beginPath();
  ctx.ellipse(c.x + 6, c.y + 4, HEX_W * 0.38, HEX_R * 0.35 * SQUASH, 0, 0, Math.PI * 2);
  ctx.fill();
  const sorted = [...peaks].sort((a, b) => a.h - b.h);
  for (const p of sorted) {
    const bx = c.x + p.dx + (hash01(i, p.dx) - 0.5) * 4;
    const by = c.y + 6;
    const tx = bx + (hash01(p.dx, i) - 0.5) * 6;
    const ty = by - p.h;
    // Licht von oben links: linke Flanke hell, rechte Flanke dunkel
    ctx.fillStyle = ROCK.light;
    ctx.beginPath();
    ctx.moveTo(bx - p.w, by);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + 2, by);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ROCK.dark;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx + p.w, by);
    ctx.lineTo(tx + 2, by);
    ctx.closePath();
    ctx.fill();
    // Grat
    ctx.strokeStyle = 'rgba(40,35,30,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + 3, ty + p.h * 0.5);
    ctx.lineTo(tx - 1, by);
    ctx.stroke();
    if (cold || p.h > 40) {
      const sh = p.h * (high ? 0.42 : 0.3);
      ctx.fillStyle = ROCK.snow;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - p.w * (sh / p.h), ty + sh);
      ctx.lineTo(tx - p.w * (sh / p.h) * 0.3, ty + sh * 0.8);
      ctx.lineTo(tx + 1, ty + sh);
      ctx.lineTo(tx + p.w * (sh / p.h) * 0.6, ty + sh * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function paintRocks(ctx: CanvasRenderingContext2D, i: number, c: Point): void {
  const count = 2 + Math.floor(hash01(i, 5) * 2);
  for (let k = 0; k < count; k++) {
    const x = c.x + (hash01(i, 10 + k) - 0.5) * HEX_W * 0.55;
    const y = c.y + (hash01(10 + k, i) - 0.5) * HEX_R * 0.7 * SQUASH;
    const s = 4 + hash01(i, 20 + k) * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 1.5, s * 1.1, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ROCK.mid;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.5, y - s * 0.9);
    ctx.lineTo(x + s * 0.4, y - s);
    ctx.lineTo(x + s, y - s * 0.2);
    ctx.lineTo(x + s * 0.8, y + s * 0.2);
    ctx.lineTo(x - s * 0.7, y + s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ROCK.light;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.5, y - s * 0.9);
    ctx.lineTo(x + s * 0.4, y - s);
    ctx.lineTo(x, y - s * 0.3);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, conifer: boolean, tint: number): void {
  // Schatten nach rechts unten
  ctx.fillStyle = 'rgba(20,30,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.5, y + 1, s * 0.75, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FOREST.trunk;
  ctx.fillRect(x - 1, y - s * 0.5, 2, s * 0.55);
  if (conifer) {
    for (let tier = 0; tier < 2; tier++) {
      const ty = y - s * 0.35 - tier * s * 0.55;
      const w = s * (0.62 - tier * 0.16);
      const h = s * 0.85;
      ctx.fillStyle = shade(FOREST.conifer, tint);
      ctx.beginPath();
      ctx.moveTo(x - w, ty);
      ctx.lineTo(x, ty - h);
      ctx.lineTo(x + w, ty);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(FOREST.coniferLight, tint);
      ctx.beginPath();
      ctx.moveTo(x - w, ty);
      ctx.lineTo(x, ty - h);
      ctx.lineTo(x - w * 0.1, ty);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const r = s * 0.55;
    const cy = y - s * 0.8;
    ctx.fillStyle = shade(FOREST.leafDark, tint);
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(FOREST.leaf, tint);
    ctx.beginPath();
    ctx.arc(x - r * 0.15, cy - r * 0.12, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(FOREST.leafLight, tint);
    ctx.beginPath();
    ctx.arc(x - r * 0.35, cy - r * 0.35, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintForest(ctx: CanvasRenderingContext2D, i: number, c: Point, count: number, conifer: boolean, density: number): void {
  const trees: { x: number; y: number; s: number; tint: number }[] = [];
  const n = Math.max(2, Math.round(count * density));
  for (let k = 0; k < n * 3 && trees.length < n; k++) {
    const x = c.x + (hash01(i, 100 + k) - 0.5) * HEX_W * 0.78;
    const y = c.y + (hash01(100 + k, i) - 0.5) * HEX_R * 1.4 * SQUASH;
    if (!pointInHexLocal(x - c.x, y - c.y, 0.8)) continue;
    if (trees.some((o) => Math.abs(o.x - x) < 7 && Math.abs(o.y - y) < 4)) continue;
    trees.push({ x, y, s: 10 + hash01(i, 200 + k) * 5, tint: (hash01(i, 300 + k) - 0.5) * 0.18 });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const tr of trees) drawTree(ctx, tr.x, tr.y, tr.s, conifer, tr.tint);
}

function pointInHexLocal(dx: number, dy: number, scale: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy / SQUASH);
  const hw = (HEX_W / 2) * scale;
  const r = HEX_R * scale;
  return ax <= hw && ay <= r && r * hw - (r / 2) * ax - hw * ay >= 0;
}

// ---------------------------------------------------------------------------
// Ausbauten

function paintImprovement(ctx: CanvasRenderingContext2D, type: string, level: number, i: number, c: Point): void {
  switch (type) {
    case 'farm':
    case 'garden':
    case 'plantation': {
      ctx.save();
      hexPath(ctx, c, 0.82);
      ctx.clip();
      const colors =
        type === 'farm' ? ['#e2c15a', '#c9a947', '#9fbf55', '#e8cf6e'] : type === 'garden' ? ['#5f9a3e', '#7fb24f', '#6a5a3a'] : ['#e8ede8', '#cfd8cf', '#9fbf55'];
      const stripes = 7;
      for (let k = 0; k < stripes; k++) {
        ctx.fillStyle = colors[(k + i) % colors.length];
        const y0 = c.y - HEX_R * SQUASH + (k * 2 * HEX_R * SQUASH) / stripes;
        ctx.beginPath();
        ctx.moveTo(c.x - HEX_W, y0 + 8);
        ctx.lineTo(c.x + HEX_W, y0 - 8);
        ctx.lineTo(c.x + HEX_W, y0 - 8 + (2 * HEX_R * SQUASH) / stripes);
        ctx.lineTo(c.x - HEX_W, y0 + 8 + (2 * HEX_R * SQUASH) / stripes);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      hexPath(ctx, c, 0.82);
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (type === 'farm') drawHouse(ctx, c.x + 12, c.y + 2, 9, '#a5452f', '#d9c7a5');
      break;
    }
    case 'hunting':
      drawTent(ctx, c.x + 4, c.y + 4, 9, '#9a7a52');
      drawAntlers(ctx, c.x - 10, c.y + 2);
      break;
    case 'gatherers':
      drawTent(ctx, c.x + 8, c.y + 2, 7, '#b09060');
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath();
      ctx.ellipse(c.x - 8, c.y + 4, 5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(c.x - 10 + k * 2.5, c.y + 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'fishery':
      ctx.fillStyle = '#7a5a36';
      ctx.fillRect(c.x - 14, c.y - 2, 22, 4);
      for (let k = 0; k < 4; k++) ctx.fillRect(c.x - 13 + k * 6, c.y + 2, 1.5, 4);
      drawBoat(ctx, c.x + 12, c.y + 8, 9);
      break;
    case 'pasture':
    case 'stable': {
      ctx.strokeStyle = '#8a6a44';
      ctx.lineWidth = 1.3;
      hexPath(ctx, c, 0.62);
      ctx.stroke();
      const color = type === 'pasture' ? '#f4f1ea' : '#7a4f2e';
      for (let k = 0; k < 4; k++) {
        const x = c.x + (hash01(i, 400 + k) - 0.5) * 30;
        const y = c.y + (hash01(400 + k, i) - 0.5) * 14;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(x + 1.5, y + 2, 4, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, 4, 2.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(x + 3.5, y - 1, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'lumber':
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = '#8a5a34';
        ctx.fillRect(c.x - 12 + k * 2, c.y + 4 - k * 3, 18, 3);
        ctx.fillStyle = '#d9b07a';
        ctx.beginPath();
        ctx.arc(c.x - 12 + k * 2, c.y + 5.5 - k * 3, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'quarry':
    case 'claypit': {
      const col = type === 'quarry' ? ROCK.light : '#b5704a';
      ctx.fillStyle = 'rgba(60,50,40,0.35)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 2, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 4; k++) {
        const x = c.x - 10 + (k % 2) * 10 + (k > 1 ? 5 : 0);
        const y = c.y - 2 + (k > 1 ? 5 : 0);
        ctx.fillStyle = col;
        ctx.fillRect(x, y - 5, 8, 5);
        ctx.fillStyle = shade(col.startsWith('#') ? col : '#b9b2a8', -0.3);
        ctx.fillRect(x + 8, y - 4, 2, 4);
      }
      break;
    }
    case 'mine':
      ctx.fillStyle = ROCK.dark;
      ctx.beginPath();
      ctx.moveTo(c.x - 16, c.y + 6);
      ctx.quadraticCurveTo(c.x, c.y - 22, c.x + 16, c.y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1d1a17';
      ctx.beginPath();
      ctx.moveTo(c.x - 5, c.y + 6);
      ctx.lineTo(c.x - 5, c.y - 2);
      ctx.quadraticCurveTo(c.x, c.y - 7, c.x + 5, c.y - 2);
      ctx.lineTo(c.x + 5, c.y + 6);
      ctx.fill();
      ctx.strokeStyle = '#8a6238';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y + 6);
      ctx.lineTo(c.x - 6, c.y - 3);
      ctx.lineTo(c.x + 6, c.y - 3);
      ctx.lineTo(c.x + 6, c.y + 6);
      ctx.stroke();
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(c.x + 9, c.y + 3, 7, 4);
      break;
    case 'oilwell':
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - 7, c.y + 6);
      ctx.lineTo(c.x, c.y - 22);
      ctx.lineTo(c.x + 7, c.y + 6);
      ctx.moveTo(c.x - 4, c.y - 6);
      ctx.lineTo(c.x + 4, c.y - 6);
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(c.x + 12, c.y + 5, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  // Ausbaustufe
  if (level > 1) {
    for (let k = 0; k < level; k++) {
      ctx.fillStyle = '#f6e27a';
      ctx.strokeStyle = '#5a4a1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x - 6 + k * 6, c.y + HEX_R * SQUASH * 0.7, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawAntlers(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 4, y - 8);
  ctx.moveTo(x - 2, y - 4);
  ctx.lineTo(x - 6, y - 5);
  ctx.moveTo(x + 2, y);
  ctx.lineTo(x + 6, y - 8);
  ctx.moveTo(x + 4, y - 4);
  ctx.lineTo(x + 8, y - 5);
  ctx.stroke();
}

export function drawTent(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.4, y + 1, s, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.15);
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x, y - s * 1.4);
  ctx.lineTo(x, y + s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.25);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.4);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.25, y + 0.1 * s);
  ctx.lineTo(x, y - s * 0.6);
  ctx.lineTo(x + s * 0.1, y + 0.12 * s);
  ctx.fill();
  ctx.strokeStyle = '#5a3d22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - s * 1.6);
  ctx.lineTo(x, y - s * 1.35);
  ctx.lineTo(x + 2, y - s * 1.6);
  ctx.stroke();
}

export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, roof: string, wall: string, tall = 1): void {
  const w = s;
  const h = s * 0.75 * tall;
  const d = s * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.35, y + 1, w * 0.95, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Front (beleuchtet) und Seite (Schatten)
  ctx.fillStyle = wall;
  ctx.fillRect(x - w * 0.6, y - h, w * 0.85, h);
  ctx.fillStyle = shade(wall.startsWith('#') ? wall : '#d9c7a5', -0.28);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, y);
  ctx.lineTo(x + w * 0.25, y - h);
  ctx.lineTo(x + w * 0.25 + d, y - h - d * 0.45);
  ctx.lineTo(x + w * 0.25 + d, y - d * 0.45);
  ctx.closePath();
  ctx.fill();
  // Dach
  ctx.fillStyle = shade(roof, 0.12);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.7, y - h);
  ctx.lineTo(x - w * 0.18, y - h - s * 0.62);
  ctx.lineTo(x + w * 0.35, y - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(roof, -0.18);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.18, y - h - s * 0.62);
  ctx.lineTo(x - w * 0.18 + d, y - h - s * 0.62 - d * 0.45);
  ctx.lineTo(x + w * 0.35 + d, y - h - d * 0.45);
  ctx.lineTo(x + w * 0.35, y - h);
  ctx.closePath();
  ctx.fill();
  // Tür
  ctx.fillStyle = 'rgba(60,40,25,0.85)';
  ctx.fillRect(x - w * 0.22, y - h * 0.5, w * 0.18, h * 0.5);
}

export function drawBoat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#6b4a2b';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.2);
  ctx.lineTo(x + s, y - s * 0.2);
  ctx.lineTo(x + s * 0.6, y + s * 0.3);
  ctx.lineTo(x - s * 0.6, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#efe6d0';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.25);
  ctx.lineTo(x, y - s * 1.4);
  ctx.lineTo(x + s * 0.7, y - s * 0.35);
  ctx.closePath();
  ctx.fill();
}

function paintResourceMarker(ctx: CanvasRenderingContext2D, t: Tile, c: Point): void {
  // kleine runde Plakette im unteren Bereich des Feldes; das Symbol zeichnet der Renderer als Text
  ctx.fillStyle = 'rgba(20,28,36,0.72)';
  ctx.beginPath();
  ctx.arc(c.x + HEX_W * 0.22, c.y + HEX_R * SQUASH * 0.45, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(246,226,122,0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(RESOURCE_GLYPHS[t.resource!] ?? '•', c.x + HEX_W * 0.22, c.y + HEX_R * SQUASH * 0.45 + 0.5);
}

export const RESOURCE_GLYPHS: Record<string, string> = {
  game: '🦌',
  fish: '🐟',
  wheat: '🌾',
  sheep: '🐑',
  flint: '🪨',
  clay: '🏺',
  copper: '🟠',
  tin: '⚪',
  iron: '⛏',
  coal: '⚫',
  oil: '🛢',
  cotton: '☁',
  horses: '🐎',
  precious: '💎',
  rare_earth: '🔷',
};

// ---------------------------------------------------------------------------
// Siedlungen

const ROOFS = ['#b48a4a', '#b8573a', '#a4472f', '#5d6470', '#6a4b3a', '#7a2f2a', '#4f5966', '#3f6f8a', '#2a8a8a'];
const WALLS = ['#cdb48a', '#d9c7a5', '#e2d5bd', '#d8cfc0', '#e0d6c8', '#b9614a', '#c9c3b8', '#dfe4e8', '#e8eef2'];

function paintSettlement(ctx: CanvasRenderingContext2D, state: GameState, s: Settlement, c: Point, i: number): void {
  const owner = state.players[s.owner];
  const era = owner?.era ?? 0;
  const roof = ROOFS[Math.min(era, ROOFS.length - 1)];
  const wall = WALLS[Math.min(era, WALLS.length - 1)];
  // Platz / Erdboden
  ctx.fillStyle = 'rgba(170,140,95,0.55)';
  hexPath(ctx, c, 0.72);
  ctx.fill();
  if (s.kind === 'camp' || owner?.kind === 'machine') {
    if (owner?.kind === 'machine') {
      paintMachineCore(ctx, c);
      return;
    }
    drawTent(ctx, c.x - 12, c.y - 2, 8, '#a8865a');
    drawTent(ctx, c.x + 10, c.y - 4, 7, '#9a7a52');
    drawTent(ctx, c.x - 2, c.y + 8, 8, '#b49468');
    // Lagerfeuer
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(c.x + 2, c.y + 1, 6, 2);
    ctx.fillStyle = '#ff9a3a';
    ctx.beginPath();
    ctx.moveTo(c.x + 2, c.y + 1);
    ctx.lineTo(c.x + 5, c.y - 6);
    ctx.lineTo(c.x + 8, c.y + 1);
    ctx.fill();
    ctx.fillStyle = '#ffe07a';
    ctx.beginPath();
    ctx.moveTo(c.x + 3.5, c.y + 1);
    ctx.lineTo(c.x + 5, c.y - 3);
    ctx.lineTo(c.x + 6.5, c.y + 1);
    ctx.fill();
  } else {
    const houses = s.kind === 'city' ? 9 : 5;
    const spots: { x: number; y: number }[] = [];
    for (let k = 0; k < houses * 4 && spots.length < houses; k++) {
      const x = c.x + (hash01(i, 500 + k) - 0.5) * HEX_W * 0.72;
      const y = c.y + (hash01(500 + k, i) - 0.5) * HEX_R * 1.25 * SQUASH;
      if (!pointInHexLocal(x - c.x, y - c.y, 0.74)) continue;
      if (spots.some((o) => Math.abs(o.x - x) < 11 && Math.abs(o.y - y) < 6)) continue;
      spots.push({ x, y });
    }
    spots.sort((a, b) => a.y - b.y);
    const centerIdx = Math.floor(spots.length / 2);
    spots.forEach((p, k) => {
      if (k === centerIdx && s.kind === 'city') {
        drawHouse(ctx, p.x, p.y, 12, shade(roof, -0.15), wall, 2);
      } else {
        drawHouse(ctx, p.x, p.y, 8 + hash01(i, k) * 2, roof, wall);
      }
      if (era >= 5 && k % 3 === 0) {
        ctx.fillStyle = '#5a4a44';
        ctx.fillRect(p.x + 2, p.y - 14, 2.5, 7);
      }
    });
  }
  // Befestigung
  if (s.buildings.includes('walls') || s.buildings.includes('palisade')) {
    ctx.strokeStyle = s.buildings.includes('walls') ? '#9c968c' : '#7a5a36';
    ctx.lineWidth = s.buildings.includes('walls') ? 3 : 2;
    hexPath(ctx, c, 0.82);
    ctx.stroke();
  }
}

function paintMachineCore(ctx: CanvasRenderingContext2D, c: Point): void {
  ctx.fillStyle = '#1b2430';
  ctx.beginPath();
  ctx.moveTo(c.x - 14, c.y + 6);
  ctx.lineTo(c.x - 8, c.y - 26);
  ctx.lineTo(c.x + 8, c.y - 26);
  ctx.lineTo(c.x + 14, c.y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#14d2c8';
  ctx.fillRect(c.x - 4, c.y - 22, 8, 24);
  ctx.strokeStyle = 'rgba(20,210,200,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 4, 22, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
}
