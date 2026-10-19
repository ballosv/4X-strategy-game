import { TERRAIN } from '../core/data/terrain';
import type { HexGrid } from '../core/hex';
import type { Tile } from '../core/map/types';
import type { GameState, Settlement } from '../core/state';
import { improvementKeyCandidates, type BuildingStyle, type BuildingType } from './assetKeys';
import { assets, type LoadedSprite } from './assets';
import { effElevation, hexPath, isWaterTile, paintFace, paintGridLine, paintGroundDetails, paintRiver, paintWalls } from './ground';
import { drawBuilding, drawProp, drawTree, paintForest, paintLooseVegetation, paintMountain, paintRocks, paintSettlementComposed, type TreeKind } from './objects';
import { ROCK, shade } from './palette';
import { paintRoads } from './roads';
import { HEX_R, HEX_W, SQUASH, tileTop, type Point } from './projection';
import { groundColor, groundPattern, wallPattern, type WallTexture } from './textures';

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

export function tracedHex(ctx: CanvasRenderingContext2D, c: Point, scale = 1): void {
  hexPath(ctx, c, scale);
}

/**
 * Bodenschichten eines Feldes (Grafik-Spezifikation v2, Kap. 4): Wände, Oberseite mit Übergängen,
 * Fluss, Bodendetails, flache Ausbauten, Wege und Gitterlinie. Der Renderer zeichnet zeilenweise
 * erst den Boden, dann die Objekte – so ragen Objekte über die Felder dahinter.
 */
export function paintTileGround(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number): void {
  const { state, grid } = pc;
  const t = state.map.tiles[i];
  const top = tileTop(grid.col(i), grid.row(i), effElevation(t));
  const water = isWaterTile(t);
  paintWalls(ctx, pc, i, t, top);
  paintFace(ctx, pc, i, t, top);
  const settlement = pc.settlementsByTile.get(i);
  const imp = state.improvements[i];
  if (!water && !settlement && !(imp && FLAT_IMPROVEMENTS.has(imp.type)) && t.elevation < 4) paintGroundDetails(ctx, t, i, top, t.feature ? 0.5 : 1);
  if (!water && t.river) paintRiver(ctx, t, top);
  if (!water && (settlement || state.roads?.[i])) paintRoads(ctx, pc, i, top);
  paintGridLine(ctx, t, top);
}

/** Ausbauten, die flach auf dem Boden liegen (vor Objekten der Nachbarfelder). */
const FLAT_IMPROVEMENTS = new Set(['farm', 'garden', 'plantation', 'pasture', 'stable']);

/** Objektschicht eines Feldes: Berge, Felsen, Vegetation, Ausbau, Ressource, Siedlung. */
export function paintTileObjects(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number): void {
  const { state, grid } = pc;
  const t = state.map.tiles[i];
  const top = tileTop(grid.col(i), grid.row(i), effElevation(t));
  const water = isWaterTile(t);
  const settlement = pc.settlementsByTile.get(i);
  const imp = state.improvements[i];
  if (!water && t.elevation >= 4 && !settlement) paintMountain(ctx, t, i, top);
  if (t.feature === 'rocks' && !settlement && !imp) paintRocks(ctx, i, top);
  if ((t.feature === 'forest' || t.feature === 'denseForest') && !settlement) {
    paintForest(ctx, t, i, top, t.feature === 'denseForest', imp?.type === 'lumber' || imp?.type === 'hunting' ? 0.55 : imp ? 0.4 : 1);
  } else if (!water && !t.feature && !settlement && !imp && t.elevation < 4) paintLooseVegetation(ctx, t, i, top);
  if (imp && !settlement) {
    const sprite = assets.first(improvementKeyCandidates(imp.type, imp.level));
    if (sprite) drawTileSprite(ctx, sprite, top);
    else paintImprovement(ctx, imp.type, i, top);
    paintImprovementLevel(ctx, imp.level, top);
  }
  if (t.resource && !settlement && !imp) {
    const sprite = assets.get(`prop/resource_${t.resource}`);
    if (sprite) drawProp(ctx, sprite, top.x + HEX_W * 0.18, top.y + HEX_R * SQUASH * 0.45);
    else paintResourceMarker(ctx, t, top);
  }
  if (settlement) paintSettlement(ctx, state, settlement, top, i);
}

/** Zeichnet ein komplettes Feld (Boden und Objekte) – für Einzeldarstellungen. */
export function paintTile(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number): void {
  paintTileGround(ctx, pc, i);
  paintTileObjects(ctx, pc, i);
}

/**
 * Zeichnet einen feldgebundenen Sprite: Breite = HEX_W × scale, Höhe proportional,
 * Ankerpunkt (anchorX/anchorY) liegt auf dem Mittelpunkt der Feld-Oberseite.
 */
export function drawTileSprite(ctx: CanvasRenderingContext2D, s: LoadedSprite, c: Point, zoom = 1): void {
  const w = HEX_W * s.scale * zoom;
  const h = (w * s.height) / s.width;
  ctx.drawImage(s.image, c.x - s.anchorX * w, c.y - s.anchorY * h, w, h);
}

// ---------------------------------------------------------------------------
// Ausbauten

function paintImprovement(ctx: CanvasRenderingContext2D, type: string, i: number, c: Point): void {
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
}

/** Ausbaustufe als Punkte (auch über Sprites). */
function paintImprovementLevel(ctx: CanvasRenderingContext2D, level: number, c: Point): void {
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

function paintSettlement(ctx: CanvasRenderingContext2D, state: GameState, s: Settlement, c: Point, i: number): void {
  const owner = state.players[s.owner];
  const pop = s.pop.workers + s.pop.citizens + s.pop.scholars;
  paintSettlementBody(ctx, s.kind, owner?.era ?? 0, owner?.kind === 'machine', s.buildings, pop, owner?.color ?? '#888888', c, i);
}

function paintSettlementBody(ctx: CanvasRenderingContext2D, kind: Settlement['kind'], era: number, machine: boolean, buildings: string[], pop: number, color: string, c: Point, i: number): void {
  if (machine) {
    const sprite = assets.get('settlement/machine');
    if (sprite) drawTileSprite(ctx, sprite, c);
    else paintMachineCore(ctx, c);
    return;
  }
  paintSettlementComposed(ctx, { kind, buildings }, pop, era, color, c, i);
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

// ---------------------------------------------------------------------------
// Asset-Vorschau

/**
 * Zeichnet für die Asset-Vorschau den Inhalt eines Schlüssels auf ein Musterfeld mit Mittelpunkt c –
 * so, wie das Spiel ihn zeichnen würde (Sprite, falls geladen, sonst prozedural; bei Siedlungen inkl.
 * Epochen-Fallback). Gibt false zurück, wenn der Schlüssel kein Feld-Asset ist (z. B. Einheiten).
 */
const WALL_TEXTURES = ['cliff_temperate', 'cliff_desert', 'cliff_snow', 'slope', 'beach'];

export function paintPreviewTile(ctx: CanvasRenderingContext2D, key: string, c: Point): boolean {
  const [cat, rest = ''] = key.split('/');
  const i = 7;
  const tile = (terrain: Tile['terrain'], elevation = 1): Tile => ({ terrain, elevation, feature: null, resource: null, river: 0, landmass: 0 });
  const face = (t: Tile) => {
    hexPath(ctx, c);
    ctx.fillStyle = groundPattern(ctx, t.terrain) ?? groundColor(t.terrain);
    ctx.fill();
  };
  switch (cat) {
    case 'texture':
    case 'terrain': {
      const terrain = rest.replace(/_\d$/, '') as Tile['terrain'];
      if (!(terrain in TERRAIN)) return false;
      const sprite = cat === 'terrain' ? assets.get(key) : null;
      if (sprite) drawTileSprite(ctx, sprite, c);
      else if (cat === 'texture' && rest.endsWith('_2')) {
        hexPath(ctx, c);
        ctx.fillStyle = groundPattern(ctx, terrain, 1) ?? groundColor(terrain);
        ctx.fill();
      } else face(tile(terrain, TERRAIN[terrain].water ? 0 : 1));
      return true;
    }
    case 'wall': {
      const w = HEX_W * 0.9;
      ctx.beginPath();
      ctx.rect(c.x - w / 2, c.y - 40, w, 44);
      if (WALL_TEXTURES.includes(rest)) ctx.fillStyle = wallPattern(ctx, rest as WallTexture) ?? '#8d857b';
      else ctx.fillStyle = rest === 'foam' ? '#3fb5c8' : '#76ad3c';
      ctx.fill();
      return true;
    }
    case 'prop': {
      face(tile(rest.startsWith('tree_palm') ? 'desert' : 'grassland'));
      const sprite = assets.get(key);
      const kind = rest.replace(/_\d$/, '');
      if (sprite) drawProp(ctx, sprite, c.x, c.y + 6);
      else if (kind === 'rock') paintRocks(ctx, i, c, 3);
      else if (kind === 'mountain' || kind === 'peak') paintMountain(ctx, tile('grassland', kind === 'peak' ? 5 : 4), i, c);
      else if (kind.startsWith('resource_')) paintResourceMarker(ctx, { ...tile('grassland'), resource: kind.slice(9) as Tile['resource'] }, { x: c.x - HEX_W * 0.22, y: c.y - 6 });
      else drawTree(ctx, kind as TreeKind, c.x, c.y + 6, kind === 'bush' ? 14 : 30, false, 0, false);
      return true;
    }
    case 'building': {
      face(tile('grassland'));
      // Schlüssel building/<stil>_<typ>; der Stil enthält keinen Unterstrich
      const sep = rest.indexOf('_');
      drawBuilding(ctx, rest.slice(0, sep) as BuildingStyle, rest.slice(sep + 1) as BuildingType, c.x, c.y + 6, 16, false);
      return true;
    }
    case 'overlay': {
      const conifer = rest.endsWith('_conifer');
      const id = rest.replace('_conifer', '');
      const elevation = id === 'highMountain' ? 5 : id === 'mountain' ? 4 : conifer ? 3 : 1;
      const t = tile(conifer ? 'tundra' : 'grassland', elevation);
      face(t);
      const sprite = assets.get(key);
      if (sprite) drawTileSprite(ctx, sprite, c);
      else if (id === 'mountain' || id === 'highMountain') paintMountain(ctx, t, i, c);
      else if (id === 'rocks') paintRocks(ctx, i, c);
      else paintForest(ctx, t, i, c, id === 'denseForest');
      return true;
    }
    case 'improvement': {
      const m = /^(\w+?)(?:_(\d))?$/.exec(rest);
      const id = m?.[1] ?? rest;
      const level = Number(m?.[2] ?? 1);
      const water = id === 'fishery';
      face(tile(water ? 'coast' : 'grassland', water ? 0 : 1));
      const sprite = assets.first(improvementKeyCandidates(id, level));
      if (sprite) drawTileSprite(ctx, sprite, c);
      else paintImprovement(ctx, id, i, c);
      paintImprovementLevel(ctx, level, c);
      return true;
    }
    case 'settlement': {
      face(tile('grassland'));
      const [kind, era] = rest.split('_');
      const sprite = assets.get(key);
      if (sprite) {
        drawTileSprite(ctx, sprite, c);
        return true;
      }
      const k = (['camp', 'settlement', 'city'].includes(kind) ? kind : 'settlement') as Settlement['kind'];
      paintSettlementBody(ctx, k, Number(era ?? 0) || 0, kind === 'machine', [], k === 'city' ? 8 : 3, '#2f6fb5', c, i);
      return true;
    }
  }
  return false;
}
