/**
 * Isometrische Projektion der Hexkarte.
 * Spitze-oben-Hexfelder werden vertikal gestaucht (Kippwinkel) und je Höhenstufe angehoben.
 * Weltkoordinaten sind in "Welt-Pixeln" bei Zoom 1.
 */

export const HEX_R = 36;
export const HEX_W = Math.sqrt(3) * HEX_R;
/** Vertikale Stauchung (Neigung der Kamera). */
export const SQUASH = 0.66;
export const ROW_STEP = 1.5 * HEX_R * SQUASH;
/** Höhe einer Höhenstufe in Welt-Pixeln. */
export const ELEV_STEP = 17;

export interface Point {
  x: number;
  y: number;
}

/** Eckpunkte relativ zum Mittelpunkt (gestaucht), beginnend bei 30° (rechts unten), im Uhrzeigersinn. */
export const HEX_CORNERS: Point[] = Array.from({ length: 6 }, (_, k) => {
  const a = ((30 + 60 * k) * Math.PI) / 180;
  return { x: HEX_R * Math.cos(a), y: HEX_R * Math.sin(a) * SQUASH };
});

/**
 * Kante je Hex-Richtung (siehe DIRECTIONS in hex.ts: 0 O, 1 NO, 2 NW, 3 W, 4 SW, 5 SO)
 * als Paar von Eckindizes in HEX_CORNERS.
 * Ecken: 0=30° (rechts unten), 1=90° (unten), 2=150° (links unten), 3=210° (links oben), 4=270° (oben), 5=330° (rechts oben)
 */
export const EDGE_CORNERS: [number, number][] = [
  [5, 0], // O
  [4, 5], // NO
  [3, 4], // NW
  [2, 3], // W
  [1, 2], // SW
  [0, 1], // SO
];

export function lift(elevation: number): number {
  return elevation * ELEV_STEP;
}

/** Mittelpunkt der (ungehobenen) Grundfläche eines Feldes. */
export function tileBase(col: number, row: number): Point {
  return { x: HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2, y: row * ROW_STEP + HEX_R * SQUASH };
}

/** Mittelpunkt der sichtbaren Oberseite (angehoben). */
export function tileTop(col: number, row: number, elevation: number): Point {
  const b = tileBase(col, row);
  return { x: b.x, y: b.y - lift(elevation) };
}

export function worldSize(width: number, height: number): { w: number; h: number } {
  return { w: HEX_W * (width + 0.5) + HEX_W, h: height * ROW_STEP + HEX_R * SQUASH * 2 + 40 };
}

export function pointInHex(px: number, py: number, cx: number, cy: number): boolean {
  // Hex in ungestauchte Koordinaten zurückrechnen
  const dx = Math.abs(px - cx);
  const dy = Math.abs((py - cy) / SQUASH);
  if (dx > HEX_W / 2 || dy > HEX_R) return false;
  return HEX_R * HEX_W / 2 - (HEX_R / 2) * dx - (HEX_W / 2) * dy >= 0;
}
