import type { TerrainId } from '../core/data/terrain';

/** Farbpalette der Spielwelt: kräftig, aber nicht übersättigt (Grafik-Spezifikation Kap. 6). */
export const TERRAIN_COLORS: Record<TerrainId, { top: string; dark: string; light: string }> = {
  ocean: { top: '#2b6ca3', dark: '#1f5383', light: '#3a7fb8' },
  coast: { top: '#3c93c6', dark: '#2d78a8', light: '#5aa9d6' },
  lake: { top: '#4a9fcf', dark: '#3684b3', light: '#69b5de' },
  grassland: { top: '#86b84a', dark: '#6a9a37', light: '#a2cc63' },
  plains: { top: '#b9b45a', dark: '#9b9644', light: '#cfca72' },
  desert: { top: '#e0c486', dark: '#c8a965', light: '#eed6a0' },
  tundra: { top: '#9aa486', dark: '#7f8a6c', light: '#b3bca0' },
  snow: { top: '#e9eff3', dark: '#c9d4dc', light: '#ffffff' },
  marsh: { top: '#6b8a57', dark: '#566f45', light: '#83a26d' },
};

export const CLIFF = { lit: '#9c8f7e', shade: '#6e6458', strata: 'rgba(60,50,40,0.35)', top: '#b3a693' };
export const EARTH = { lit: '#8a6e4e', shade: '#64503a' };
export const RIVER = { deep: '#2f7fbd', light: '#79c2ee' };
export const FOREST = { leaf: '#3f7a35', leafLight: '#5c9a45', leafDark: '#2c5a26', conifer: '#2f5f3a', coniferLight: '#43794b', trunk: '#5b4130' };
export const ROCK = { light: '#b9b2a8', mid: '#948c82', dark: '#6b645c', snow: '#f4f8fb' };

export const UI = {
  bg: '#0f1720',
  panel: 'rgba(17, 26, 36, 0.94)',
  accent: '#2fb39a',
  select: '#f6e27a',
  move: 'rgba(120, 220, 255, 0.28)',
  attack: 'rgba(255, 90, 70, 0.35)',
};

/** Hellt eine Hex-Farbe auf (f > 0) oder dunkelt sie ab (f < 0). */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f >= 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
