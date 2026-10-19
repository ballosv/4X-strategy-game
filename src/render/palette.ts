/** Farbpalette der Spielwelt (Grafik-Spezifikation Kap. 2). Bodenfarben stehen in textures.ts. */
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
