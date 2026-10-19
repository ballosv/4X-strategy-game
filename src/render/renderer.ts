import { unitType } from '../core/data/units';
import { gridOf } from '../core/context';
import type { HexGrid } from '../core/hex';
import { isWater } from '../core/map/passability';
import type { GameState, Settlement, Unit } from '../core/state';
import { RESOURCES } from '../core/data/terrain';
import { paintTileGround, paintTileObjects, tracedHex, type PaintContext } from './painter';
import { UI, withAlpha } from './palette';
import { EDGE_CORNERS, ELEV_STEP, HEX_CORNERS, HEX_R, HEX_W, ROW_STEP, SQUASH, ZOOM_MAX, ZOOM_MIN, pointInHex, tileTop, worldSize, type Point } from './projection';
import { clearTextureCache } from './textures';
import { assets } from './assets';
import { SPRITE_SIZE, clearUnitSpriteCache, drawUnitAsset, unitSprite } from './units';

const CHUNK = 8;
/** Platz über der Chunk-Oberkante für angehobene Felder und hohe Objekte (Berge, Türme). */
const PAD_TOP = 5 * ELEV_STEP + 110;
const PAD_BOTTOM = 5 * ELEV_STEP + 30;
const LOD_LEVELS = [0.5, 1, 2];
const MAX_CHUNKS = 48;
/** Zeitbudget je Bild für neu zu zeichnende Chunks (ms); der Rest folgt in den nächsten Bildern. */
const CHUNK_BUDGET_MS = 18;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Highlights {
  selected?: number;
  reachable?: Map<number, number>;
  attackable?: Set<number>;
  path?: number[];
  hover?: number;
  workable?: Set<number>;
}

interface ChunkEntry {
  canvas: HTMLCanvasElement;
  signature: string;
  lod: number;
  lastUsed: number;
}

/**
 * Isometrischer Karten-Renderer.
 * Gelände wird in Chunks vorgerendert (Signatur-basiert invalidiert), Einheiten und
 * Hervorhebungen werden je Frame darüber gezeichnet.
 */
export class MapRenderer {
  readonly camera: Camera = { x: 0, y: 0, zoom: 1 };
  private readonly ctx: CanvasRenderingContext2D;
  private chunks = new Map<string, ChunkEntry>();
  private frame = 0;
  viewer = 0;
  /** Debug/Beobachter: ganze Karte zeigen. */
  revealAll = false;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  /** true, wenn Chunks wegen des Zeitbudgets noch fehlen oder veraltet sind – dann ein weiteres Bild zeichnen. */
  needsFrame = false;

  /** Wird aufgerufen, wenn sich die Darstellung ohne Spieländerung ändert (z. B. Assets geladen). */
  onInvalidate: (() => void) | null = null;
  private readonly offAssets: () => void;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    // Sobald Sprites geladen sind, Chunk-Cache einmalig verwerfen und neu zeichnen
    this.offAssets = assets.onLoad(() => {
      clearUnitSpriteCache();
      clearTextureCache();
      this.invalidate();
      this.onInvalidate?.();
    });
  }

  dispose(): void {
    this.offAssets();
    this.chunks.clear();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  get viewWidth(): number {
    return this.cssW;
  }

  get viewHeight(): number {
    return this.cssH;
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: this.camera.x + (sx - this.cssW / 2) / this.camera.zoom, y: this.camera.y + (sy - this.cssH / 2) / this.camera.zoom };
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: (wx - this.camera.x) * this.camera.zoom + this.cssW / 2, y: (wy - this.camera.y) * this.camera.zoom + this.cssH / 2 };
  }

  centerOn(state: GameState, tile: number): void {
    const grid = gridOf(state);
    const t = state.map.tiles[tile];
    const p = tileTop(grid.col(tile), grid.row(tile), isWater(t) ? 0 : t.elevation);
    this.camera.x = p.x;
    // etwas nach unten versetzen, damit das Ziel nicht unter dem Kontextpanel liegt
    this.camera.y = p.y + (this.cssH * 0.14) / this.camera.zoom;
  }

  clampCamera(state: GameState): void {
    const size = worldSize(state.map.width, state.map.height);
    this.camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.camera.zoom));
    this.camera.x = Math.max(0, Math.min(size.w, this.camera.x));
    this.camera.y = Math.max(-60, Math.min(size.h, this.camera.y));
  }

  /** Feld unter einem Bildschirmpunkt (berücksichtigt Höhen: vordere Felder zuerst). */
  pick(state: GameState, sx: number, sy: number): number {
    const grid = gridOf(state);
    const w = this.screenToWorld(sx, sy);
    const approxRow = Math.round((w.y - HEX_R * SQUASH) / ROW_STEP);
    for (let row = Math.min(state.map.height - 1, approxRow + 6); row >= Math.max(0, approxRow - 1); row--) {
      const approxCol = Math.round((w.x - HEX_W / 2) / HEX_W - 0.5 * (row & 1));
      for (let col = approxCol - 1; col <= approxCol + 1; col++) {
        const i = grid.index(col, row);
        if (i < 0) continue;
        const t = state.map.tiles[i];
        const explored = this.revealAll || state.players[this.viewer]?.explored[i] === 1;
        const elev = explored && !isWater(t) ? t.elevation : 0;
        const c = tileTop(col, row, elev);
        if (pointInHex(w.x, w.y, c.x, c.y)) return i;
      }
    }
    return -1;
  }

  render(state: GameState, vis: Uint8Array, hl: Highlights): void {
    this.frame++;
    const ctx = this.ctx;
    const grid = gridOf(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1219';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.camera.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.cssW / 2 - this.camera.x * this.camera.zoom) * this.dpr, (this.cssH / 2 - this.camera.y * this.camera.zoom) * this.dpr);

    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.cssW, this.cssH);
    const rowMin = Math.max(0, Math.floor((tl.y - HEX_R) / ROW_STEP) - 1);
    const rowMax = Math.min(state.map.height - 1, Math.ceil((br.y + PAD_TOP) / ROW_STEP) + 1);
    const colMin = Math.max(0, Math.floor(tl.x / HEX_W) - 1);
    const colMax = Math.min(state.map.width - 1, Math.ceil(br.x / HEX_W) + 1);

    // 1) Gelände-Chunks
    const lod = LOD_LEVELS.find((l) => l >= z * 0.9) ?? LOD_LEVELS[LOD_LEVELS.length - 1];
    const settlementsByTile = new Map<number, Settlement>();
    for (const s of Object.values(state.settlements)) settlementsByTile.set(s.tile, s);
    const explored = state.players[this.viewer]?.explored;
    const pc: PaintContext = {
      state,
      grid,
      explored: (i) => this.revealAll || explored?.[i] === 1,
      settlementsByTile,
    };
    // Ohne vorhandene Chunks (Spielstart) alles sofort zeichnen, sonst mit Zeitbudget
    const t0 = this.chunks.size ? performance.now() : Infinity;
    this.needsFrame = false;
    for (let cy = Math.floor(rowMin / CHUNK); cy <= Math.floor(rowMax / CHUNK); cy++) {
      for (let cx = Math.floor(colMin / CHUNK); cx <= Math.floor(colMax / CHUNK); cx++) {
        const entry = this.getChunk(pc, cx, cy, lod, !(performance.now() - t0 >= CHUNK_BUDGET_MS));
        if (!entry) continue;
        const ox = cx * CHUNK * HEX_W - HEX_W;
        const oy = cy * CHUNK * ROW_STEP - PAD_TOP;
        ctx.drawImage(entry.canvas, ox, oy, entry.canvas.width / entry.lod, entry.canvas.height / entry.lod);
      }
    }
    this.evictChunks();

    // 2) Nebel des Krieges: erkundet, aber nicht sichtbar -> entsättigter, abgedunkelter Schleier
    if (!this.revealAll) {
      ctx.beginPath();
      let any = false;
      for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
          const i = grid.index(col, row);
          if (explored?.[i] !== 1 || vis[i]) continue;
          const t = state.map.tiles[i];
          const c = tileTop(col, row, isWater(t) ? 0 : t.elevation);
          // Feld samt darunterliegender Wand abdecken
          const elev = isWater(t) ? 0 : t.elevation;
          let low = elev;
          for (const d of [4, 5]) {
            const nb = grid.neighbor(i, d);
            if (nb >= 0) low = Math.min(low, isWater(state.map.tiles[nb]) ? 0 : state.map.tiles[nb].elevation);
          }
          const drop = (elev - low) * ELEV_STEP;
          for (let k = 0; k < 6; k++) {
            const p = HEX_CORNERS[k];
            const y = c.y + p.y * 1.01 + (k <= 2 ? drop : 0);
            if (k === 0) ctx.moveTo(c.x + p.x * 1.01, y);
            else ctx.lineTo(c.x + p.x * 1.01, y);
          }
          ctx.closePath();
          any = true;
        }
      }
      if (any) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = 'rgba(128,128,128,0.75)';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(16,22,32,0.38)';
        ctx.fill();
        ctx.restore();
      }
    }

    // 3) Handelsrouten des Betrachters und Hervorhebungen
    this.drawTradeRoutes(state, grid);
    this.drawHighlights(state, grid, hl);

    // 4) Einheiten (von hinten nach vorne)
    const visibleUnits = Object.values(state.units)
      .filter((u) => this.revealAll || vis[u.tile] === 1)
      .filter((u) => {
        const r = grid.row(u.tile);
        const c = grid.col(u.tile);
        return r >= rowMin && r <= rowMax && c >= colMin && c <= colMax;
      })
      .sort((a, b) => a.tile - b.tile);
    const stacks = new Map<number, Unit[]>();
    for (const u of visibleUnits) {
      const list = stacks.get(u.tile);
      if (list) list.push(u);
      else stacks.set(u.tile, [u]);
    }
    for (const [tile, units] of stacks) this.drawUnitStack(state, grid, tile, units, hl.selected);

    // 5) Siedlungsbanner
    for (const s of Object.values(state.settlements)) {
      if (!this.revealAll && explored?.[s.tile] !== 1) continue;
      this.drawSettlementBanner(state, grid, s);
    }
  }

  private drawTradeRoutes(state: GameState, grid: HexGrid): void {
    const ctx = this.ctx;
    const routes = (state.tradeRoutes ?? []).filter((r) => r.owner === this.viewer);
    if (!routes.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(242,193,78,0.85)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 7]);
    ctx.lineCap = 'round';
    for (const r of routes) {
      const a = state.settlements[r.from];
      const b = state.settlements[r.to];
      if (!a || !b) continue;
      const pa = tileTop(grid.col(a.tile), grid.row(a.tile), state.map.tiles[a.tile].elevation);
      const pb = tileTop(grid.col(b.tile), grid.row(b.tile), state.map.tiles[b.tile].elevation);
      const mx = (pa.x + pb.x) / 2;
      const my = Math.min(pa.y, pb.y) - 40 - Math.hypot(pa.x - pb.x, pa.y - pb.y) * 0.12;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y - 10);
      ctx.quadraticCurveTo(mx, my, pb.x, pb.y - 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHighlights(state: GameState, grid: HexGrid, hl: Highlights): void {
    const ctx = this.ctx;
    const top = (i: number) => {
      const t = state.map.tiles[i];
      const explored = this.revealAll || state.players[this.viewer]?.explored[i] === 1;
      return tileTop(grid.col(i), grid.row(i), explored && !isWater(t) ? t.elevation : 0);
    };
    if (hl.workable) {
      ctx.strokeStyle = 'rgba(80,230,210,0.9)';
      ctx.lineWidth = 2;
      for (const i of hl.workable) {
        tracedHex(ctx, top(i), 0.92);
        ctx.stroke();
      }
    }
    if (hl.reachable) {
      ctx.fillStyle = UI.move;
      for (const i of hl.reachable.keys()) {
        tracedHex(ctx, top(i), 0.9);
        ctx.fill();
      }
    }
    if (hl.attackable) {
      ctx.fillStyle = UI.attack;
      ctx.strokeStyle = 'rgba(255,80,60,0.95)';
      ctx.lineWidth = 2;
      for (const i of hl.attackable) {
        tracedHex(ctx, top(i), 0.9);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (hl.path && hl.path.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      const start = hl.selected !== undefined ? top(hl.selected) : top(hl.path[0]);
      ctx.moveTo(start.x, start.y);
      for (const i of hl.path) {
        const p = top(i);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const end = top(hl.path[hl.path.length - 1]);
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hl.hover !== undefined && hl.hover >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      tracedHex(ctx, top(hl.hover), 0.97);
      ctx.stroke();
    }
    if (hl.selected !== undefined && hl.selected >= 0) {
      const c = top(hl.selected);
      ctx.save();
      ctx.shadowColor = UI.select;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = UI.select;
      ctx.lineWidth = 3;
      tracedHex(ctx, c, 0.96);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawUnitStack(state: GameState, grid: HexGrid, tile: number, units: Unit[], selectedTile?: number): void {
    const ctx = this.ctx;
    const t = state.map.tiles[tile];
    const c = tileTop(grid.col(tile), grid.row(tile), isWater(t) ? 0 : t.elevation);
    const settlement = Object.values(state.settlements).some((s) => s.tile === tile);
    units.sort((a, b) => unitType(a.type).strength - unitType(b.type).strength);
    units.forEach((u, k) => {
      const owner = state.players[u.owner];
      const offset = units.length > 1 ? (k === 0 ? -9 : 9) : 0;
      const x = c.x + offset + (settlement ? 12 : 0);
      const y = c.y + 6 + (settlement ? 6 : 0);
      // Fraktionsring
      ctx.strokeStyle = owner.color;
      ctx.fillStyle = withAlpha(owner.color, 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!drawUnitAsset(ctx, u.type, owner.color, x, y)) {
        const sprite = unitSprite(u.type, owner.color);
        const s = 0.82;
        ctx.drawImage(sprite, x - (SPRITE_SIZE / 2) * s, y - (SPRITE_SIZE - 6) * s, SPRITE_SIZE * s, SPRITE_SIZE * s);
      }
      // Lebensbalken
      if (u.hp < 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - 10, y - 50, 20, 3.5);
        ctx.fillStyle = u.hp > 60 ? '#5ad16a' : u.hp > 30 ? '#f0c040' : '#e05040';
        ctx.fillRect(x - 10, y - 50, (20 * u.hp) / 100, 3.5);
      }
      // Status
      if (u.owner === this.viewer && state.currentPlayer === this.viewer) {
        let mark = '';
        if (u.status === 'fortified') mark = '🛡';
        else if (u.status === 'sentry') mark = '👁';
        else if (u.status === 'exploring') mark = '🧭';
        else if (u.destination !== null) mark = '➜';
        else if (u.movesLeft > 0 && tile !== selectedTile) mark = '●';
        if (mark) {
          ctx.font = mark === '●' ? '9px sans-serif' : '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = mark === '●' ? '#f6e27a' : 'white';
          ctx.fillText(mark, x + 12, y - 40);
        }
      }
    });
  }

  private drawSettlementBanner(state: GameState, grid: HexGrid, s: Settlement): void {
    const ctx = this.ctx;
    const t = state.map.tiles[s.tile];
    const c = tileTop(grid.col(s.tile), grid.row(s.tile), t.elevation);
    const owner = state.players[s.owner];
    const pop = s.pop.workers + s.pop.citizens + s.pop.scholars;
    const label = `${s.isCapital ? '★ ' : ''}${s.name}`;
    ctx.font = '600 11px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 30;
    const x = c.x - w / 2;
    const y = c.y - HEX_R * SQUASH - 34;
    ctx.fillStyle = 'rgba(15,23,32,0.88)';
    roundRect(ctx, x, y, w, 17, 8);
    ctx.fill();
    ctx.fillStyle = owner.color;
    roundRect(ctx, x, y, 20, 17, 8);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(pop), x + 10, y + 9);
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 25, y + 9);
    // Lebenspunkte der Siedlung
    if (s.hp < 100) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 4, y + 19, w - 8, 3);
      ctx.fillStyle = '#e05040';
      ctx.fillRect(x + 4, y + 19, ((w - 8) * s.hp) / 100, 3);
    }
  }

  // -------------------------------------------------------------------------
  // Chunks

  private chunkSignature(pc: PaintContext, cx: number, cy: number): string {
    const { state, grid } = pc;
    let h = 0;
    let n = 0;
    const r0 = cy * CHUNK;
    const c0 = cx * CHUNK;
    for (let row = r0; row < Math.min(r0 + CHUNK, state.map.height); row++) {
      for (let col = c0; col < Math.min(c0 + CHUNK, state.map.width); col++) {
        const i = grid.index(col, row);
        if (!pc.explored(i)) continue;
        n++;
        const imp = state.improvements[i];
        const t = state.map.tiles[i];
        h = (Math.imul(h, 31) + (state.roads?.[i] ?? 0) * 977) | 0;
        h = (Math.imul(h, 31) + i * 7 + (imp ? imp.level * 13 + imp.type.length : 0) + (t.feature ? t.feature.length : 0) + (state.tileOwner[i] + 2) * 101) | 0;
        const s = pc.settlementsByTile.get(i);
        if (s) h = (Math.imul(h, 31) + s.kind.length * 17 + s.buildings.length * 3 + s.owner * 1009 + (state.players[s.owner]?.era ?? 0)) | 0;
      }
    }
    return `${n}:${h}`;
  }

  private getChunk(pc: PaintContext, cx: number, cy: number, lod: number, build: boolean): ChunkEntry | null {
    const key = `${cx},${cy},${lod}`;
    const sig = this.chunkSignature(pc, cx, cy);
    if (sig.startsWith('0:')) return null;
    let entry = this.chunks.get(key);
    if (entry && entry.signature === sig) {
      entry.lastUsed = this.frame;
      return entry;
    }
    if (!build) {
      // Budget erschöpft: vorerst veralteten Chunk oder eine andere Auflösungsstufe zeigen
      this.needsFrame = true;
      const fallback = entry ?? LOD_LEVELS.map((l) => this.chunks.get(`${cx},${cy},${l}`)).find((e) => e && e.signature === sig);
      if (fallback) fallback.lastUsed = this.frame;
      return fallback ?? null;
    }
    const w = (CHUNK + 1.5) * HEX_W + HEX_W;
    const h = CHUNK * ROW_STEP + PAD_TOP + PAD_BOTTOM + HEX_R;
    const canvas = entry?.canvas ?? document.createElement('canvas');
    canvas.width = Math.ceil(w * lod);
    canvas.height = Math.ceil(h * lod);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ox = cx * CHUNK * HEX_W - HEX_W;
    const oy = cy * CHUNK * ROW_STEP - PAD_TOP;
    ctx.setTransform(lod, 0, 0, lod, -ox * lod, -oy * lod);
    const { state, grid } = pc;
    // Zeilenweise von hinten nach vorne: erst Boden (Wände, Textur, Fluss, Gitter), dann Objekte.
    // Objekte ragen so über die Felder dahinter, werden aber von vorderen, höheren Feldern verdeckt.
    const colEnd = Math.min((cx + 1) * CHUNK, state.map.width);
    for (let row = cy * CHUNK; row < Math.min((cy + 1) * CHUNK, state.map.height); row++) {
      for (let col = cx * CHUNK; col < colEnd; col++) {
        const i = grid.index(col, row);
        if (pc.explored(i)) paintTileGround(ctx, pc, i);
      }
      for (let col = cx * CHUNK; col < colEnd; col++) {
        const i = grid.index(col, row);
        if (pc.explored(i)) paintTileObjects(ctx, pc, i);
      }
    }
    this.paintBorders(ctx, pc, cx, cy);
    entry = { canvas, signature: sig, lod, lastUsed: this.frame };
    this.chunks.set(key, entry);
    return entry;
  }

  /** Reichsgrenzen in Spielerfarbe entlang der Feldkanten. */
  private paintBorders(ctx: CanvasRenderingContext2D, pc: PaintContext, cx: number, cy: number): void {
    const { state, grid } = pc;
    for (let row = cy * CHUNK; row < Math.min((cy + 1) * CHUNK, state.map.height); row++) {
      for (let col = cx * CHUNK; col < Math.min((cx + 1) * CHUNK, state.map.width); col++) {
        const i = grid.index(col, row);
        const sid = state.tileOwner[i];
        if (sid < 0 || !pc.explored(i)) continue;
        const owner = state.settlements[sid]?.owner;
        if (owner === undefined) continue;
        const color = state.players[owner].color;
        const t = state.map.tiles[i];
        const c = tileTop(col, row, isWater(t) ? 0 : t.elevation);
        ctx.fillStyle = withAlpha(color, 0.1);
        tracedHex(ctx, c, 1);
        ctx.fill();
        ctx.strokeStyle = withAlpha(color, 0.95);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        for (let d = 0; d < 6; d++) {
          const nb = grid.neighbor(i, d);
          const nbOwner = nb >= 0 && state.tileOwner[nb] >= 0 ? state.settlements[state.tileOwner[nb]]?.owner : -1;
          if (nbOwner === owner) continue;
          const [a, b] = EDGE_CORNERS[d];
          ctx.beginPath();
          ctx.moveTo(c.x + HEX_CORNERS[a].x * 0.93, c.y + HEX_CORNERS[a].y * 0.93);
          ctx.lineTo(c.x + HEX_CORNERS[b].x * 0.93, c.y + HEX_CORNERS[b].y * 0.93);
          ctx.stroke();
        }
      }
    }
  }

  private evictChunks(): void {
    if (this.chunks.size <= MAX_CHUNKS) return;
    const entries = [...this.chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of entries.slice(0, this.chunks.size - MAX_CHUNKS)) this.chunks.delete(key);
  }

  /** Alle Chunks neu zeichnen; bis dahin bleiben die alten Bilder als Ersatz sichtbar. */
  invalidate(): void {
    for (const entry of this.chunks.values()) entry.signature = '';
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Minimap: ein Pixelblock je Feld, Besitzer eingefärbt, Kamera-Ausschnitt als Rahmen. */
export function renderMinimap(canvas: HTMLCanvasElement, state: GameState, viewer: number, revealAll: boolean, view?: { x0: number; y0: number; x1: number; y1: number }): void {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = state.map;
  const sx = canvas.width / (width + 0.5);
  const sy = canvas.height / height;
  ctx.fillStyle = '#0b1219';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const explored = state.players[viewer]?.explored;
  const grid = gridOf(state);
  for (let i = 0; i < grid.size; i++) {
    if (!revealAll && explored?.[i] !== 1) continue;
    const t = state.map.tiles[i];
    const col = grid.col(i);
    const row = grid.row(i);
    let color: string;
    const sid = state.tileOwner[i];
    if (sid >= 0 && state.settlements[sid]) color = state.players[state.settlements[sid].owner].color;
    else if (isWater(t)) color = t.terrain === 'ocean' ? '#245a88' : '#3b86b8';
    else if (t.elevation >= 4) color = t.elevation >= 5 ? '#e4e8ec' : '#9c968c';
    else if (t.feature === 'forest' || t.feature === 'denseForest') color = '#3f7a35';
    else color = { grassland: '#86b84a', plains: '#b9b45a', desert: '#e0c486', tundra: '#9aa486', snow: '#e9eff3', marsh: '#6b8a57' }[t.terrain as string] ?? '#888';
    ctx.fillStyle = color;
    ctx.fillRect((col + 0.5 * (row & 1)) * sx, row * sy, Math.ceil(sx), Math.ceil(sy));
  }
  if (view) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(view.x0 * sx, view.y0 * sy, (view.x1 - view.x0) * sx, (view.y1 - view.y0) * sy);
  }
}

export function resourceName(id: string | null): string {
  return id ? RESOURCES[id as keyof typeof RESOURCES]?.name ?? '' : '';
}

