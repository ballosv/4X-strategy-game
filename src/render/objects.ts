import type { Tile } from '../core/map/types';
import type { Settlement } from '../core/state';
import { buildingStyle, propKeys, type BuildingStyle, type BuildingType, type PropKind } from './assetKeys';
import { assets, type LoadedSprite } from './assets';
import { pointInHexLocal } from './ground';
import { hash01 } from './painter';
import { FOREST, ROCK, shade } from './palette';
import { EDGE_CORNERS, HEX_CORNERS, HEX_R, HEX_W, SQUASH, type Point } from './projection';

/**
 * Schicht 6: Einzelobjekte (Grafik-Spezifikation v2, Kap. 4). Jedes Objekt wird je Feld deterministisch
 * in Variante, Position, Größe (±15 %) und Spiegelung variiert und darf über die Feldgrenze ragen.
 * Gemalte Sprites (prop/*, building/*) ersetzen die prozeduralen Platzhalter, sobald sie geladen sind.
 */

interface Spot {
  x: number;
  y: number;
  /** Größenfaktor 0,85–1,15 */
  size: number;
  flip: boolean;
  k: number;
}

/** Verteilt bis zu n Punkte im Feld (Abstand mindestens minDist), sortiert von hinten nach vorne. */
export function scatter(i: number, c: Point, n: number, salt: number, area = 0.8, minDist = 7): Spot[] {
  const out: Spot[] = [];
  for (let k = 0; k < n * 4 && out.length < n; k++) {
    const dx = (hash01(i + salt, 100 + k) - 0.5) * HEX_W * area;
    const dy = (hash01(100 + k, i + salt) - 0.5) * HEX_R * 2 * area * SQUASH;
    if (!pointInHexLocal(dx, dy, area)) continue;
    if (out.some((o) => Math.abs(o.x - c.x - dx) < minDist && Math.abs(o.y - c.y - dy) < minDist * 0.55)) continue;
    out.push({ x: c.x + dx, y: c.y + dy, size: 0.85 + hash01(i, 200 + k + salt) * 0.3, flip: hash01(i + salt, 300 + k) < 0.5, k });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** Sprite mit Fußpunkt (anchorX/anchorY) auf (x, y), Breite = HEX_W × scale × size, optional gespiegelt. */
export function drawProp(ctx: CanvasRenderingContext2D, s: LoadedSprite, x: number, y: number, size = 1, flip = false): void {
  const w = HEX_W * s.scale * size;
  const h = (w * s.height) / s.width;
  if (!flip) {
    ctx.drawImage(s.image, x - s.anchorX * w, y - s.anchorY * h, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.drawImage(s.image, -s.anchorX * w, -s.anchorY * h, w, h);
  ctx.restore();
}

/** Gestreuter Sprite mit Kontaktschatten; der Schatten wird nicht gespiegelt (Licht bleibt oben links). */
function spriteWithShadow(ctx: CanvasRenderingContext2D, s: LoadedSprite, p: Spot): void {
  contactShadow(ctx, p.x, p.y, HEX_W * s.scale * p.size * 0.22);
  drawProp(ctx, s, p.x, p.y, p.size, p.flip);
}

/** Geladene Varianten einer Objektart (leer, wenn keine gemalten Sprites vorliegen). */
function variants(kind: PropKind): LoadedSprite[] {
  return propKeys(kind)
    .map((k) => assets.get(k))
    .filter((s): s is LoadedSprite => !!s);
}

function pick<T>(list: T[], i: number, k: number): T {
  return list[Math.floor(hash01(i * 31 + k, k + 5) * list.length) % list.length];
}

// ---------------------------------------------------------------------------
// Vegetation

export type TreeKind = 'tree_broadleaf' | 'tree_conifer' | 'tree_palm' | 'tree_bare' | 'bush';

function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(20,30,10,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.35, y + 0.8, w * 0.75, w * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Prozeduraler Baum (Platzhalter für prop/tree_*): s = Höhe in Welt-Pixeln. */
export function drawTree(ctx: CanvasRenderingContext2D, kind: TreeKind, x: number, y: number, s: number, flip: boolean, tint: number, snowy = false): void {
  const f = flip ? -1 : 1;
  if (kind === 'bush') {
    contactShadow(ctx, x, y, s * 0.45);
    for (const [dx, dy, r, col] of [
      [-0.25, -0.2, 0.32, FOREST.leafDark],
      [0.22, -0.18, 0.3, FOREST.leafDark],
      [0, -0.35, 0.34, FOREST.leaf],
      [-0.12 * f, -0.45, 0.18, FOREST.leafLight],
    ] as [number, number, number, string][]) {
      ctx.fillStyle = shade(col, tint);
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  contactShadow(ctx, x, y, s * 0.42);
  ctx.fillStyle = FOREST.trunk;
  ctx.fillRect(x - s * 0.05, y - s * 0.36, s * 0.1, s * 0.38);
  if (kind === 'tree_conifer') {
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const by = y - s * 0.22 - k * s * 0.19;
      const w = s * (0.36 - k * 0.07);
      const h = s * 0.38;
      ctx.fillStyle = shade(FOREST.conifer, tint - 0.06);
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.lineTo(x, by - h);
      ctx.lineTo(x + w, by + s * 0.02);
      ctx.closePath();
      ctx.fill();
      // Lichtseite links oben
      ctx.fillStyle = shade(FOREST.coniferLight, tint + 0.05);
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.lineTo(x, by - h);
      ctx.lineTo(x - w * 0.05, by + s * 0.01);
      ctx.closePath();
      ctx.fill();
      if (snowy) {
        ctx.fillStyle = 'rgba(245,250,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.55, by - h * 0.45);
        ctx.lineTo(x, by - h);
        ctx.lineTo(x + w * 0.3, by - h * 0.55);
        ctx.closePath();
        ctx.fill();
      }
    }
    return;
  }
  if (kind === 'tree_palm') {
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + f * s * 0.15, y - s * 0.5, x + f * s * 0.05, y - s * 0.9);
    ctx.stroke();
    ctx.strokeStyle = shade(FOREST.leaf, tint);
    ctx.lineWidth = s * 0.09;
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.05 + (k / 5) * 0.9);
      ctx.beginPath();
      ctx.moveTo(x + f * s * 0.05, y - s * 0.9);
      ctx.quadraticCurveTo(x + f * s * 0.05 - Math.cos(a) * s * 0.3, y - s * 1.05, x + f * s * 0.05 - Math.cos(a) * s * 0.45, y - s * 0.75);
      ctx.stroke();
    }
    return;
  }
  if (kind === 'tree_bare') {
    ctx.strokeStyle = FOREST.trunk;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 0.8);
    for (let k = 0; k < 4; k++) {
      const by = y - s * (0.35 + k * 0.12);
      const dir = k % 2 ? 1 : -1;
      ctx.moveTo(x, by);
      ctx.lineTo(x + dir * s * 0.25, by - s * 0.2);
    }
    ctx.stroke();
    return;
  }
  // Laubbaum: Kronenballen dunkel → hell, Licht von oben links
  const cy = y - s * 0.62;
  const r = s * 0.3;
  for (const [dx, dy, rr, col] of [
    [0.55, 0.25, 0.75, FOREST.leafDark],
    [-0.5, 0.2, 0.8, FOREST.leafDark],
    [0.1, -0.15, 0.95, FOREST.leaf],
    [-0.35, -0.3, 0.6, FOREST.leaf],
    [-0.4, -0.45, 0.4, FOREST.leafLight],
    [0.05, -0.6, 0.35, FOREST.leafLight],
  ] as [number, number, number, string][]) {
    ctx.fillStyle = shade(col, tint);
    ctx.beginPath();
    ctx.arc(x + dx * r * f, cy + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function treeKindFor(t: Tile): TreeKind {
  if (t.terrain === 'desert') return 'tree_palm';
  if (t.terrain === 'tundra' || t.terrain === 'snow' || t.elevation >= 3) return 'tree_conifer';
  return 'tree_broadleaf';
}

/** Wald: dichte Gruppe gemischter Bäume; density < 1 lichtet ihn (Holzfäller, Jagd). */
export function paintForest(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point, dense: boolean, density = 1): void {
  const main = treeKindFor(t);
  const n = Math.max(3, Math.round((dense ? 14 : 9) * density));
  const spots = scatter(i, c, n, 17, 0.88, dense ? 7 : 8.5);
  for (const p of spots) {
    // gemischter Wald: einige Nadelbäume im Laubwald und umgekehrt
    const mix = hash01(i, 900 + p.k);
    const kind: TreeKind = main === 'tree_broadleaf' && mix < 0.25 ? 'tree_conifer' : main === 'tree_conifer' && t.terrain === 'tundra' && mix < 0.2 ? 'tree_bare' : main;
    drawVegetation(ctx, kind, p, i, t.terrain === 'snow' || (t.elevation >= 4 && kind === 'tree_conifer'));
  }
}

function drawVegetation(ctx: CanvasRenderingContext2D, kind: TreeKind, p: Spot, i: number, snowy: boolean): void {
  const sprites = variants(kind);
  if (sprites.length) {
    spriteWithShadow(ctx, pick(sprites, i, p.k), p);
    return;
  }
  const base = kind === 'bush' ? 8 : kind === 'tree_conifer' ? 23 : 20;
  drawTree(ctx, kind, p.x, p.y, base * p.size, p.flip, (hash01(i, 300 + p.k) - 0.5) * 0.16, snowy);
}

/** Vereinzelte Büsche/Bäume auf offenem Land (Auflockerung ohne Spielwirkung). */
export function paintLooseVegetation(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point): void {
  if (t.terrain === 'snow' || t.terrain === 'desert') return;
  const n = Math.floor(hash01(i, 77) * 3);
  if (!n) return;
  for (const p of scatter(i, c, n, 41, 0.8, 10)) {
    const kind: TreeKind = t.terrain === 'marsh' || hash01(i, p.k + 3) < 0.6 ? 'bush' : treeKindFor(t);
    drawVegetation(ctx, kind, p, i, false);
  }
}

// ---------------------------------------------------------------------------
// Felsen und Berge

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flip: boolean): void {
  const f = flip ? -1 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.4, y + 1, s * 1.15, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ROCK.dark;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x - s * 0.55 * f, y - s * 0.95);
  ctx.lineTo(x + s * 0.35 * f, y - s * 1.1);
  ctx.lineTo(x + s, y - s * 0.25);
  ctx.lineTo(x + s * 0.85, y + s * 0.2);
  ctx.lineTo(x - s * 0.75, y + s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ROCK.mid;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x - s * 0.55 * f, y - s * 0.95);
  ctx.lineTo(x + s * 0.35 * f, y - s * 1.1);
  ctx.lineTo(x + s * 0.2, y - s * 0.3);
  ctx.lineTo(x - s * 0.2, y + s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ROCK.light;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.9, y - s * 0.1);
  ctx.lineTo(x - s * 0.55 * f, y - s * 0.95);
  ctx.lineTo(x - s * 0.1, y - s * 0.55);
  ctx.closePath();
  ctx.fill();
}

export function paintRocks(ctx: CanvasRenderingContext2D, i: number, c: Point, count = 4): void {
  const sprites = variants('rock');
  for (const p of scatter(i, c, count, 59, 0.7, 9)) {
    if (sprites.length) spriteWithShadow(ctx, pick(sprites, i, p.k), p);
    else drawRock(ctx, p.x, p.y, (3.5 + hash01(i, p.k + 20) * 3) * p.size, p.flip);
  }
}

function drawPeak(ctx: CanvasRenderingContext2D, bx: number, by: number, w: number, h: number, snowLine: number, salt: number): void {
  const tx = bx + (hash01(salt, 1) - 0.5) * w * 0.3;
  const ty = by - h;
  const j = (k: number) => (hash01(salt, k) - 0.5) * w * 0.16;
  // linke (beleuchtete) und rechte (schattige) Flanke mit gezacktem Grat
  const ridge: Point[] = [
    { x: tx, y: ty },
    { x: tx + w * 0.12 + j(2), y: ty + h * 0.3 },
    { x: tx + w * 0.02 + j(3), y: ty + h * 0.62 },
    { x: tx + w * 0.15 + j(4), y: by },
  ];
  ctx.fillStyle = 'rgba(30,30,30,0.2)';
  ctx.beginPath();
  ctx.ellipse(bx + w * 0.25, by + 1.5, w * 1.05, w * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const left = ctx.createLinearGradient(bx - w, ty, tx, by);
  left.addColorStop(0, '#c9c1b4');
  left.addColorStop(1, '#8e867b');
  ctx.fillStyle = left;
  ctx.beginPath();
  ctx.moveTo(bx - w, by);
  ctx.lineTo(bx - w * 0.6 + j(5), by - h * 0.35);
  ctx.lineTo(bx - w * 0.3 + j(6), by - h * 0.55);
  for (const p of ridge) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5f5850';
  ctx.beginPath();
  ctx.moveTo(ridge[0].x, ridge[0].y);
  ctx.lineTo(bx + w * 0.5 + j(7), by - h * 0.45);
  ctx.lineTo(bx + w, by);
  for (let k = ridge.length - 1; k >= 0; k--) ctx.lineTo(ridge[k].x, ridge[k].y);
  ctx.closePath();
  ctx.fill();
  // Rinnen
  ctx.strokeStyle = 'rgba(40,36,32,0.35)';
  ctx.lineWidth = 0.9;
  for (let k = 0; k < 3; k++) {
    const sx = tx - w * (0.15 + k * 0.2);
    const sy = ty + h * (0.25 + k * 0.15);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - w * 0.08, sy + h * 0.3);
    ctx.stroke();
  }
  if (snowLine > 0) {
    const sh = h * snowLine;
    ctx.fillStyle = ROCK.snow;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - w * snowLine * 0.95, ty + sh);
    ctx.lineTo(tx - w * snowLine * 0.55, ty + sh * 0.78);
    ctx.lineTo(tx - w * snowLine * 0.3, ty + sh * 1.05);
    ctx.lineTo(tx + w * 0.02, ty + sh * 0.8);
    ctx.lineTo(tx + w * snowLine * 0.45, ty + sh * 0.95);
    ctx.lineTo(ridge[1].x, ridge[1].y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(150,170,195,0.55)';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ridge[1].x, ridge[1].y);
    ctx.lineTo(tx + w * 0.02, ty + sh * 0.8);
    ctx.closePath();
    ctx.fill();
  }
}

/** Bergmassiv (Stufe 4) bzw. Hochgebirge (Stufe 5); ragt deutlich über die Feldfläche. */
export function paintMountain(ctx: CanvasRenderingContext2D, t: Tile, i: number, c: Point): void {
  const high = t.elevation >= 5;
  const sprites = variants(high ? 'peak' : 'mountain');
  if (sprites.length) {
    drawProp(ctx, pick(sprites, i, 0), c.x, c.y + HEX_R * SQUASH * 0.95, 0.95 + hash01(i, 8) * 0.2, hash01(i, 9) < 0.5);
    return;
  }
  const cold = high || t.terrain === 'snow' || t.terrain === 'tundra';
  const peaks = high
    ? [
        { dx: -0.3, dy: -0.25, w: 0.3, h: 52 },
        { dx: 0.28, dy: -0.15, w: 0.32, h: 58 },
        { dx: 0, dy: 0.3, w: 0.42, h: 80 },
      ]
    : [
        { dx: -0.25, dy: -0.2, w: 0.3, h: 38 },
        { dx: 0.22, dy: 0.05, w: 0.36, h: 50 },
        { dx: -0.1, dy: 0.35, w: 0.3, h: 34 },
      ];
  for (const p of peaks) {
    const bx = c.x + p.dx * HEX_W + (hash01(i, p.h) - 0.5) * 5;
    const by = c.y + p.dy * HEX_R * SQUASH * 1.4;
    const h = p.h * (0.88 + hash01(p.h, i) * 0.24);
    drawPeak(ctx, bx, by, p.w * HEX_W, h, cold ? (high ? 0.45 : 0.32) : h > 45 ? 0.22 : 0, i * 7 + p.h);
  }
}

// ---------------------------------------------------------------------------
// Siedlungen aus Gebäude-Bausteinen

const STYLE: Record<BuildingStyle, { wall: string; roof: string; roofKind: 'cone' | 'flat' | 'gable' }> = {
  stone: { wall: '#a07e56', roof: '#c9a65e', roofKind: 'cone' },
  antiquity: { wall: '#e0cfa8', roof: '#b8573a', roofKind: 'flat' },
  medieval: { wall: '#e6d9bd', roof: '#b4472f', roofKind: 'gable' },
  industrial: { wall: '#a8553e', roof: '#4f5966', roofKind: 'gable' },
  modern: { wall: '#dfe6ec', roof: '#5d7180', roofKind: 'flat' },
};

/** Quader in Schrägansicht: Front (beleuchtet) links, Seite (Schatten) rechts, Dachform nach Stil. */
function block(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wall: string, roof: string, roofKind: 'cone' | 'flat' | 'gable', windows = 0): void {
  const d = w * 0.45;
  const fx = x - w * 0.55;
  const fw = w * 0.75;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.3, y + 1, w * 0.85, w * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wall;
  ctx.fillRect(fx, y - h, fw, h);
  ctx.fillStyle = shade(wall, -0.32);
  ctx.beginPath();
  ctx.moveTo(fx + fw, y);
  ctx.lineTo(fx + fw, y - h);
  ctx.lineTo(fx + fw + d, y - h - d * 0.45);
  ctx.lineTo(fx + fw + d, y - d * 0.45);
  ctx.closePath();
  ctx.fill();
  if (windows) {
    ctx.fillStyle = 'rgba(40,40,55,0.7)';
    const rows = Math.max(1, Math.floor(h / 6));
    for (let r = 0; r < rows; r++) for (let k = 0; k < windows; k++) ctx.fillRect(fx + 1.5 + k * ((fw - 3) / windows), y - h + 2 + r * 6, 1.6, 2.4);
  } else {
    ctx.fillStyle = 'rgba(60,40,25,0.85)';
    ctx.fillRect(fx + fw * 0.4, y - Math.min(h, 5), fw * 0.22, Math.min(h, 5));
  }
  if (roofKind === 'flat') {
    ctx.fillStyle = shade(roof, 0.15);
    ctx.beginPath();
    ctx.moveTo(fx - 0.5, y - h);
    ctx.lineTo(fx + fw, y - h);
    ctx.lineTo(fx + fw + d, y - h - d * 0.45);
    ctx.lineTo(fx + d - 0.5, y - h - d * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (roofKind === 'gable') {
    const rh = w * 0.5;
    ctx.fillStyle = shade(roof, 0.12);
    ctx.beginPath();
    ctx.moveTo(fx - 1, y - h);
    ctx.lineTo(fx + fw / 2, y - h - rh);
    ctx.lineTo(fx + fw + 1, y - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(roof, -0.2);
    ctx.beginPath();
    ctx.moveTo(fx + fw / 2, y - h - rh);
    ctx.lineTo(fx + fw / 2 + d, y - h - rh - d * 0.45);
    ctx.lineTo(fx + fw + d + 1, y - h - d * 0.45);
    ctx.lineTo(fx + fw + 1, y - h);
    ctx.closePath();
    ctx.fill();
  } else {
    // Kegeldach (Hütte, Turm)
    const cx = fx + (fw + d) / 2;
    const rh = w * 0.75;
    ctx.fillStyle = shade(roof, 0.1);
    ctx.beginPath();
    ctx.moveTo(fx - 1.5, y - h + 0.5);
    ctx.lineTo(cx, y - h - rh);
    ctx.lineTo(cx, y - h - d * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(roof, -0.22);
    ctx.beginPath();
    ctx.moveTo(cx, y - h - rh);
    ctx.lineTo(fx + fw + d + 1.5, y - h - d * 0.45 + 0.5);
    ctx.lineTo(cx, y - h - d * 0.2);
    ctx.closePath();
    ctx.fill();
  }
}

function banner(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.strokeStyle = '#4a3a2a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 13);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 13);
  ctx.lineTo(x + 7, y - 11.5);
  ctx.lineTo(x, y - 8.5);
  ctx.closePath();
  ctx.fill();
}

/** Prozeduraler Gebäudebaustein (Platzhalter für building/<stil>_<typ>). s = Grundbreite. */
function drawBuildingProc(ctx: CanvasRenderingContext2D, style: BuildingStyle, type: BuildingType, x: number, y: number, s: number): void {
  const st = STYLE[style];
  switch (type) {
    case 'center':
      if (style === 'stone') block(ctx, x, y, s * 1.5, s * 0.55, st.wall, st.roof, 'cone');
      else if (style === 'antiquity') {
        block(ctx, x, y, s * 1.5, s * 0.8, '#efe6d2', '#d9cfb8', 'flat');
        ctx.fillStyle = 'rgba(120,100,70,0.5)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x - s * 0.75 + 1 + k * s * 0.3, y - s * 0.75, 1, s * 0.72);
      } else block(ctx, x, y, s * 1.4, s * (style === 'modern' ? 2.2 : 1.3), st.wall, st.roof, style === 'modern' ? 'flat' : 'gable', style === 'modern' ? 4 : 0);
      break;
    case 'tower':
      if (style === 'stone') {
        ctx.fillStyle = '#7a5a3a';
        ctx.fillRect(x - 1, y - s * 1.4, 2, s * 1.4);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 2, y - s * 1.3, 4, 2);
      } else block(ctx, x, y, s * 0.7, s * (style === 'modern' ? 3 : 1.9), style === 'medieval' ? '#c9c1b2' : st.wall, st.roof, style === 'medieval' ? 'cone' : 'flat', style === 'modern' ? 2 : 0);
      break;
    case 'workshop':
      block(ctx, x, y, s * 1.2, s * 0.65, st.wall, st.roof, st.roofKind === 'cone' ? 'cone' : 'gable');
      if (style === 'industrial' || style === 'modern') {
        ctx.fillStyle = '#5a4a44';
        ctx.fillRect(x + s * 0.2, y - s * 1.7, s * 0.18, s * 1.1);
      }
      break;
    case 'storage':
      block(ctx, x, y, s * 1.1, s * 0.5, shade(st.wall, -0.12), st.roof, st.roofKind === 'cone' ? 'cone' : 'gable');
      break;
    case 'house_large':
      block(ctx, x, y, s * 1.15, s * (style === 'modern' ? 1.6 : 0.95), st.wall, st.roof, st.roofKind, style === 'modern' || style === 'industrial' ? 3 : 0);
      break;
    case 'wall':
      block(ctx, x, y, s * 0.6, s * 0.9, style === 'stone' ? '#7a5a36' : '#a39c90', '#8f877b', 'flat');
      break;
    default:
      block(ctx, x, y, s, s * (style === 'modern' ? 1.1 : 0.62), st.wall, st.roof, st.roofKind, style === 'modern' ? 2 : 0);
  }
}

export function drawBuilding(ctx: CanvasRenderingContext2D, style: BuildingStyle, type: BuildingType, x: number, y: number, s: number, flip: boolean): void {
  const sprite = assets.get(`building/${style}_${type}`);
  if (sprite) drawProp(ctx, sprite, x, y, s / 9, flip);
  else drawBuildingProc(ctx, style, type, x, y, s);
}

/** Mauerring (Palisade/Steinmauer) entlang der Kanten; front = nur die dem Betrachter zugewandte Hälfte. */
function paintWallRing(ctx: CanvasRenderingContext2D, c: Point, stone: boolean, front: boolean): void {
  const dirs = front ? [3, 4, 5, 0] : [0, 1, 2, 3];
  const sc = 0.8;
  const h = stone ? 5 : 4;
  for (const d of dirs) {
    const [a, b] = EDGE_CORNERS[d];
    const p1 = { x: c.x + HEX_CORNERS[a].x * sc, y: c.y + HEX_CORNERS[a].y * sc };
    const p2 = { x: c.x + HEX_CORNERS[b].x * sc, y: c.y + HEX_CORNERS[b].y * sc };
    ctx.fillStyle = stone ? '#a39c90' : '#7a5a36';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p2.x, p2.y - h);
    ctx.lineTo(p1.x, p1.y - h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stone ? '#cfc8bc' : '#9a7a52';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - h);
    ctx.lineTo(p2.x, p2.y - h);
    ctx.stroke();
    if (!stone) {
      ctx.strokeStyle = 'rgba(50,35,20,0.6)';
      ctx.lineWidth = 0.6;
      for (let k = 1; k < 8; k++) {
        const x = p1.x + ((p2.x - p1.x) * k) / 8;
        const y = p1.y + ((p2.y - p1.y) * k) / 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h - 1.2);
        ctx.stroke();
      }
    }
  }
  if (stone) {
    // Ecktürme
    for (const k of front ? [2, 1, 0] : [3, 4, 5]) {
      const p = { x: c.x + HEX_CORNERS[k].x * sc, y: c.y + HEX_CORNERS[k].y * sc };
      block(ctx, p.x + 1.5, p.y + 1, 4.5, 8, '#b3ab9e', '#8f877b', 'flat');
    }
  }
}

/**
 * Siedlung aus Gebäude-Bausteinen: Anzahl wächst mit Art und Bevölkerung, Stil folgt der Epoche
 * (Steinzeit, Antike, Mittelalter, Industrie, Moderne). Fahne in Spielerfarbe am Zentrum.
 */
export function paintSettlementComposed(ctx: CanvasRenderingContext2D, s: Pick<Settlement, 'kind' | 'buildings'>, pop: number, era: number, color: string, c: Point, i: number): void {
  const style = buildingStyle(era);
  const count = s.kind === 'camp' ? 3 : s.kind === 'settlement' ? 4 + Math.min(3, Math.floor(pop / 3)) : 7 + Math.min(5, Math.floor(pop / 3));
  // Platz: festgetretener Boden
  ctx.fillStyle = 'rgba(150,122,82,0.5)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 1, HEX_W * 0.4, HEX_R * SQUASH * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  const stoneWall = s.buildings.includes('walls');
  const fortified = stoneWall || s.buildings.includes('palisade');
  if (fortified) paintWallRing(ctx, c, stoneWall, false);
  const spots = scatter(i, c, count - 1, 131, 0.86, 13);
  const items: { x: number; y: number; type: BuildingType; size: number; flip: boolean }[] = [{ x: c.x, y: c.y + 1, type: 'center', size: 1, flip: false }];
  spots.forEach((p, k) => {
    if (Math.hypot(p.x - c.x, (p.y - c.y) / SQUASH) < 14) return;
    let type: BuildingType = 'house_small';
    if (s.kind !== 'camp') {
      if (k === 1) type = 'tower';
      else if (k === 3) type = 'workshop';
      else if (k === 5) type = 'storage';
      else if (s.kind === 'city' && hash01(i, k) < 0.5) type = 'house_large';
    }
    items.push({ x: p.x, y: p.y, type, size: p.size, flip: p.flip });
  });
  items.sort((a, b) => a.y - b.y);
  const base = s.kind === 'camp' ? 11 : 12.5;
  for (const it of items) {
    drawBuilding(ctx, style, it.type, it.x, it.y, base * it.size, it.flip);
    if (it.type === 'center') banner(ctx, it.x + base * 0.55, it.y - base * (style === 'modern' ? 2 : 1.1), color);
  }
  if (fortified) paintWallRing(ctx, c, stoneWall, true);
}
