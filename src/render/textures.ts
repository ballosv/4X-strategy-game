import type { TerrainId } from '../core/data/terrain';
import { CATEGORY_DEFAULTS, textureKeys } from './assetKeys';
import { assets } from './assets';
import { HEX_W, SQUASH } from './projection';

/**
 * Nahtlose Texturen in Weltkoordinaten (Grafik-Spezifikation v2, Kap. 4, Schichten 2 und 3).
 * Ist eine gemalte Textur geladen (texture/<gelände>_<n>, wall/<id>), wird sie verwendet,
 * sonst eine prozedural erzeugte, kachelbare Platzhaltertextur.
 */

export type WallTexture = 'cliff_temperate' | 'cliff_desert' | 'cliff_snow' | 'slope' | 'beach';

const SIZE = 256;

/** Grundfarben der Bodentexturen: dunkel, mittel, hell. */
const GROUND: Record<TerrainId, [string, string, string]> = {
  grassland: ['#4f8a2c', '#76ad3c', '#a6cf58'],
  plains: ['#8f9238', '#b5ae52', '#d9cd7a'],
  desert: ['#c49a5a', '#dfbe80', '#f1dca6'],
  tundra: ['#6c7a5a', '#8e9a76', '#b5bd9c'],
  snow: ['#bccbd8', '#e3ebf2', '#ffffff'],
  marsh: ['#46653a', '#5f8049', '#86a066'],
  coast: ['#2a9bb8', '#3fb5c8', '#7fd9de'],
  ocean: ['#14467a', '#1d5c95', '#2b74ad'],
  lake: ['#2d82b0', '#3b9cc4', '#6cc1dc'],
};

const WALL: Record<WallTexture, [string, string, string]> = {
  cliff_temperate: ['#46413d', '#77706a', '#aaa296'],
  cliff_desert: ['#7a5034', '#a8754c', '#d4a878'],
  cliff_snow: ['#5c6470', '#8b95a2', '#cdd5de'],
  slope: ['#5a4430', '#7d6046', '#a3835f'],
  beach: ['#b8955f', '#d8bb83', '#efdcae'],
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Kachelbares Wertrauschen (Gitter mit Umlauf, geglättet interpoliert). */
function periodicNoise(cells: number, rand: () => number): (x: number, y: number) => number {
  const g = Array.from({ length: cells * cells }, rand);
  const at = (cx: number, cy: number) => g[((cy % cells) + cells) % cells * cells + (((cx % cells) + cells) % cells)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / SIZE) * cells;
    const fy = (y / SIZE) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = s(fx - x0);
    const ty = s(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Farbverlauf dunkel → mittel → hell über t ∈ [0, 1]. */
function ramp(cols: [string, string, string], t: number): [number, number, number] {
  const [a, b, c] = cols.map(rgb);
  const u = Math.max(0, Math.min(1, t));
  const [p, q, f] = u < 0.5 ? [a, b, u * 2] : [b, c, (u - 0.5) * 2];
  return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return [c, c.getContext('2d')!];
}

/** Grundschicht aus mehrstufigem Rauschen; stretchY > 1 erzeugt waagerechte Schichtung (Fels). */
function noiseBase(ctx: CanvasRenderingContext2D, cols: [string, string, string], seed: number, contrast: number, stretchY = 1): void {
  const rand = rng(seed);
  const n1 = periodicNoise(4, rand);
  const n2 = periodicNoise(8, rand);
  const n3 = periodicNoise(32, rand);
  const n4 = periodicNoise(stretchY > 1 ? 16 : 64, rand);
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = stretchY > 1 ? x / stretchY : x;
      const v = n1(sx, y) * 0.4 + n2(sx, y) * 0.3 + n3(x, y) * 0.18 + n4(sx, y) * 0.12;
      const [r, g, b] = ramp(cols, 0.5 + (v - 0.5) * contrast);
      const o = (y * SIZE + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Zeichnet eine Form neunmal versetzt, damit sie über den Kachelrand nahtlos fortläuft. */
function wrapped(draw: (ox: number, oy: number) => void): void {
  for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) draw(ox, oy);
}

function rgba([r, g, b]: [number, number, number], a: number): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

function groundTexture(id: TerrainId, variant: number): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const cols = GROUND[id];
  const seed = 1013 * (Object.keys(GROUND).indexOf(id) + 1) + variant * 7919;
  const water = id === 'coast' || id === 'ocean' || id === 'lake';
  noiseBase(ctx, cols, seed, water ? 0.9 : 1.25);
  const rand = rng(seed ^ 0x5bd1e995);
  ctx.lineCap = 'round';
  if (water) {
    // Wellenkämme
    for (let k = 0; k < 70; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const w = 6 + rand() * 12;
      const col = rgba(ramp(cols, 1), 0.18 + rand() * 0.22);
      wrapped((ox, oy) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + ox - w, y + oy);
        ctx.quadraticCurveTo(x + ox, y + oy - 2.5, x + ox + w, y + oy);
        ctx.stroke();
      });
    }
    return c;
  }
  if (id === 'grassland' || id === 'plains' || id === 'marsh' || id === 'tundra') {
    // Grashalme in Büscheln, Licht von oben links
    const blades = id === 'tundra' ? 500 : 1400;
    for (let k = 0; k < blades; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const len = 2.5 + rand() * 4;
      const lean = (rand() - 0.5) * 3;
      const light = rand();
      const col = rgba(ramp(cols, light > 0.55 ? 0.8 + light * 0.2 : 0.1 + light * 0.3), 0.55);
      wrapped((ox, oy) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + lean, y + oy - len);
        ctx.stroke();
      });
    }
  }
  if (id === 'plains') {
    // trockene Flecken
    for (let k = 0; k < 18; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 6 + rand() * 14;
      wrapped((ox, oy) => {
        ctx.fillStyle = 'rgba(214,190,120,0.18)';
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  if (id === 'desert') {
    // Dünenrippel
    for (let k = 0; k < 120; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const w = 8 + rand() * 18;
      wrapped((ox, oy) => {
        ctx.strokeStyle = 'rgba(150,105,55,0.22)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x + ox - w, y + oy);
        ctx.quadraticCurveTo(x + ox, y + oy - 4, x + ox + w, y + oy);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,245,215,0.3)';
        ctx.beginPath();
        ctx.moveTo(x + ox - w, y + oy - 1.5);
        ctx.quadraticCurveTo(x + ox, y + oy - 5.5, x + ox + w, y + oy - 1.5);
        ctx.stroke();
      });
    }
  }
  if (id === 'snow') {
    for (let k = 0; k < 60; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const w = 6 + rand() * 14;
      wrapped((ox, oy) => {
        ctx.strokeStyle = 'rgba(140,165,195,0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + ox - w, y + oy);
        ctx.quadraticCurveTo(x + ox, y + oy + 3, x + ox + w, y + oy);
        ctx.stroke();
      });
    }
  }
  if (id === 'marsh') {
    // Wasserlachen
    for (let k = 0; k < 16; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 5 + rand() * 10;
      wrapped((ox, oy) => {
        ctx.fillStyle = 'rgba(60,100,110,0.75)';
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,210,220,0.35)';
        ctx.beginPath();
        ctx.ellipse(x + ox - r * 0.25, y + oy - r * 0.15, r * 0.45, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  return c;
}

function wallTexture(id: WallTexture): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const cols = WALL[id];
  const seed = 4447 * (Object.keys(WALL).indexOf(id) + 1);
  const rock = id.startsWith('cliff');
  noiseBase(ctx, cols, seed, rock ? 1.5 : 1.1, rock ? 5 : 2);
  const rand = rng(seed ^ 0x27d4eb2f);
  if (rock) {
    // Felsblöcke: unregelmäßige Facetten mit heller Oberkante (Licht oben links) und dunkler Unterkante
    const [dark, , light] = cols.map(rgb);
    for (let k = 0; k < 150; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const w = 10 + rand() * 26;
      const h = 8 + rand() * 18;
      const tone = 0.25 + rand() * 0.6;
      const pts = [
        [-w / 2 + rand() * 4, -h / 2 + rand() * 3],
        [w / 2 - rand() * 4, -h / 2 + rand() * 3],
        [w / 2 + rand() * 3, h / 2 - rand() * 4],
        [-w / 2 + rand() * 5, h / 2],
      ];
      wrapped((ox, oy) => {
        const px = (k2: number) => x + ox + pts[k2][0];
        const py = (k2: number) => y + oy + pts[k2][1];
        ctx.fillStyle = rgba(ramp(cols, tone), 0.8);
        ctx.beginPath();
        pts.forEach((_, k2) => (k2 ? ctx.lineTo(px(k2), py(k2)) : ctx.moveTo(px(k2), py(k2))));
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rgba(light, 0.55);
        ctx.beginPath();
        ctx.moveTo(px(3), py(3));
        ctx.lineTo(px(0), py(0));
        ctx.lineTo(px(1), py(1));
        ctx.stroke();
        ctx.strokeStyle = rgba(dark, 0.75);
        ctx.beginPath();
        ctx.moveTo(px(1), py(1));
        ctx.lineTo(px(2), py(2));
        ctx.lineTo(px(3), py(3));
        ctx.stroke();
      });
    }
    // feine Schichtung
    for (let y = 6; y < SIZE; y += 18 + rand() * 20) {
      ctx.strokeStyle = 'rgba(30,25,22,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y + Math.sin((x / SIZE) * Math.PI * 4 + y) * 2);
      ctx.stroke();
    }
    if (id === 'cliff_temperate') {
      // Moosflecken
      for (let k = 0; k < 30; k++) {
        const x = rand() * SIZE;
        const y = rand() * SIZE;
        const r = 2 + rand() * 5;
        wrapped((ox, oy) => {
          ctx.fillStyle = 'rgba(96,130,60,0.45)';
          ctx.beginPath();
          ctx.ellipse(x + ox, y + oy, r * 1.6, r, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  } else {
    if (id === 'slope') {
      // Grasflecken am Hang
      for (let k = 0; k < 22; k++) {
        const x = rand() * SIZE;
        const y = rand() * SIZE;
        const r = 4 + rand() * 9;
        wrapped((ox, oy) => {
          ctx.fillStyle = 'rgba(92,128,52,0.55)';
          ctx.beginPath();
          ctx.ellipse(x + ox, y + oy, r * 1.5, r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
    // Erde / Sand: Wurzeln, Steinchen
    for (let k = 0; k < 90; k++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 1 + rand() * 2.5;
      wrapped((ox, oy) => {
        ctx.fillStyle = id === 'beach' ? 'rgba(255,245,220,0.35)' : 'rgba(40,28,18,0.35)';
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r * 1.4, r, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  return c;
}

const sources = new Map<string, CanvasImageSource & { width: number; height: number }>();

function source(key: string, make: () => HTMLCanvasElement): { img: CanvasImageSource; width: number; scale: number } {
  const sprite = assets.get(key);
  if (sprite) return { img: sprite.image, width: sprite.width, scale: sprite.scale };
  let c = sources.get(key);
  if (!c) {
    c = make();
    sources.set(key, c);
  }
  return { img: c, width: c.width, scale: CATEGORY_DEFAULTS.texture.scale };
}

/** Musterobjekte hängen am Kontext; je Kontext und Schlüssel einmal erzeugt. */
let patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();

function pattern(ctx: CanvasRenderingContext2D, key: string, make: () => HTMLCanvasElement, squash: number, extraScale = 1): CanvasPattern | null {
  let cache = patterns.get(ctx);
  if (!cache) {
    cache = new Map();
    patterns.set(ctx, cache);
  }
  const ck = `${key}@${extraScale}`;
  if (cache.has(ck)) return cache.get(ck)!;
  const src = source(key, make);
  const p = ctx.createPattern(src.img, 'repeat');
  if (p && typeof DOMMatrix !== 'undefined') {
    // Kachelbreite in Welt-Pixeln = scale × HEX_W
    const f = ((src.scale * HEX_W) / src.width) * extraScale;
    p.setTransform(new DOMMatrix([f, 0, 0, f * squash, 0, 0]));
  }
  cache.set(ck, p);
  return p;
}

/** Bodentextur (Variante 1 oder 2) für die Oberseite, in der Ansicht gestaucht. */
export function groundPattern(ctx: CanvasRenderingContext2D, terrain: TerrainId, variant: 0 | 1 = 0): CanvasPattern | null {
  const key = textureKeys(terrain)[variant];
  // Variante 2 mit anderem Maßstab, damit sich die Wiederholungen beider Lagen nicht decken
  return pattern(ctx, key, () => groundTexture(terrain, variant), SQUASH, variant ? 1.37 : 1);
}

/** Wandtextur (senkrechte Flächen, ungestaucht). */
export function wallPattern(ctx: CanvasRenderingContext2D, id: WallTexture): CanvasPattern | null {
  return pattern(ctx, `wall/${id}`, () => wallTexture(id), 1, 0.5);
}

/** Mittlere Farbe einer Bodenart (für Überhänge, Minimap u. Ä.). */
export function groundColor(terrain: TerrainId, tone: 0 | 1 | 2 = 1): string {
  return GROUND[terrain][tone];
}

/** Nach dem Laden gemalter Texturen: Musterobjekte neu erzeugen. */
export function clearTextureCache(): void {
  sources.clear();
  patterns = new WeakMap();
}
