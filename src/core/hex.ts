/**
 * Hex-Mathematik für Spitze-oben-Hexfelder ("pointy top") in odd-r-Offsetkoordinaten.
 * Kacheln werden über (col, row) adressiert; Distanzen und Nachbarschaft laufen über axiale Koordinaten.
 */

export interface Axial {
  q: number;
  r: number;
}

export interface Offset {
  col: number;
  row: number;
}

/** Richtungen im Uhrzeigersinn, beginnend bei Osten. */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, // 0 O
  { q: 1, r: -1 }, // 1 NO
  { q: 0, r: -1 }, // 2 NW
  { q: -1, r: 0 }, // 3 W
  { q: -1, r: 1 }, // 4 SW
  { q: 0, r: 1 }, // 5 SO
];

export const DIRECTION_NAMES = ['O', 'NO', 'NW', 'W', 'SW', 'SO'] as const;

export function oppositeDir(dir: number): number {
  return (dir + 3) % 6;
}

export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(q: number, r: number): Offset {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Rechteckiges Hex-Gitter ohne Umlauf an den Rändern. */
export class HexGrid {
  readonly size: number;
  private readonly neighborCache: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
    this.neighborCache = new Int32Array(this.size * 6);
    for (let i = 0; i < this.size; i++) {
      const { q, r } = this.axialOf(i);
      for (let d = 0; d < 6; d++) {
        this.neighborCache[i * 6 + d] = this.indexOfAxial(q + DIRECTIONS[d].q, r + DIRECTIONS[d].r);
      }
    }
  }

  index(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return -1;
    return row * this.width + col;
  }

  col(index: number): number {
    return index % this.width;
  }

  row(index: number): number {
    return Math.floor(index / this.width);
  }

  axialOf(index: number): Axial {
    return offsetToAxial(this.col(index), this.row(index));
  }

  indexOfAxial(q: number, r: number): number {
    const { col, row } = axialToOffset(q, r);
    return this.index(col, row);
  }

  /** Nachbar in Richtung dir oder -1 außerhalb der Karte. */
  neighbor(index: number, dir: number): number {
    return this.neighborCache[index * 6 + dir];
  }

  neighbors(index: number): number[] {
    const out: number[] = [];
    for (let d = 0; d < 6; d++) {
      const n = this.neighborCache[index * 6 + d];
      if (n >= 0) out.push(n);
    }
    return out;
  }

  /** Richtung von a zum direkten Nachbarn b oder -1. */
  directionTo(a: number, b: number): number {
    for (let d = 0; d < 6; d++) if (this.neighborCache[a * 6 + d] === b) return d;
    return -1;
  }

  distance(a: number, b: number): number {
    return axialDistance(this.axialOf(a), this.axialOf(b));
  }

  /** Alle Felder im Radius (inklusive Mittelpunkt). */
  range(center: number, radius: number): number[] {
    const c = this.axialOf(center);
    const out: number[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
      const lo = Math.max(-radius, -dq - radius);
      const hi = Math.min(radius, -dq + radius);
      for (let dr = lo; dr <= hi; dr++) {
        const i = this.indexOfAxial(c.q + dq, c.r + dr);
        if (i >= 0) out.push(i);
      }
    }
    return out;
  }

  /** Felder exakt im Abstand radius. */
  ring(center: number, radius: number): number[] {
    if (radius === 0) return [center];
    return this.range(center, radius).filter((i) => this.distance(center, i) === radius);
  }
}
