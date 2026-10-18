import { isCliff, isWater } from '../core/map/passability';
import { EDGE_CORNERS, HEX_CORNERS, type Point } from './projection';
import type { PaintContext } from './painter';

function edgeMid(c: Point, dir: number): Point {
  const [a, b] = EDGE_CORNERS[dir];
  return { x: c.x + (HEX_CORNERS[a].x + HEX_CORNERS[b].x) / 2, y: c.y + (HEX_CORNERS[a].y + HEX_CORNERS[b].y) / 2 };
}

/**
 * Zeichnet Straßen (Feldweg) und Eisenbahnen (Schotterbett mit Schwellen und Schienen)
 * vom Feldmittelpunkt zu allen angebundenen Nachbarn.
 */
export function paintRoads(ctx: CanvasRenderingContext2D, pc: PaintContext, i: number, c: Point): void {
  const { state, grid } = pc;
  const level = (t: number) => (pc.settlementsByTile.has(t) ? 2 : state.roads?.[t] ?? 0);
  const own = level(i);
  const links: { dir: number; rail: boolean }[] = [];
  for (let d = 0; d < 6; d++) {
    const nb = grid.neighbor(i, d);
    if (nb < 0 || !pc.explored(nb) || isWater(state.map.tiles[nb])) continue;
    const l = Math.min(own, level(nb));
    if (l <= 0) continue;
    // zwei Siedlungen direkt nebeneinander ohne Straße nicht verbinden
    if (pc.settlementsByTile.has(i) && pc.settlementsByTile.has(nb)) continue;
    if (isCliff(state.map.tiles[i], state.map.tiles[nb])) continue;
    const rail = l >= 2 && !!(state.roads?.[i] === 2 || state.roads?.[nb] === 2);
    links.push({ dir: d, rail });
  }
  if (!links.length) {
    if (!pc.settlementsByTile.has(i)) {
      // einzelnes Straßenstück
      ctx.fillStyle = 'rgba(150,115,70,0.9)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.lineCap = 'round';
  for (const { dir, rail } of links) {
    const m = edgeMid(c, dir);
    if (rail) {
      ctx.strokeStyle = '#8f8a82';
      ctx.lineWidth = 7;
      line(ctx, c, m);
      // Schwellen
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 1.5;
      const dx = m.x - c.x;
      const dy = m.y - c.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      for (let k = 0.15; k < 1; k += 0.22) {
        const px = c.x + dx * k;
        const py = c.y + dy * k;
        ctx.beginPath();
        ctx.moveTo(px - nx * 4, py - ny * 4);
        ctx.lineTo(px + nx * 4, py + ny * 4);
        ctx.stroke();
      }
      ctx.strokeStyle = '#3d3d40';
      ctx.lineWidth = 1.1;
      for (const off of [-2, 2]) {
        ctx.beginPath();
        ctx.moveTo(c.x + nx * off, c.y + ny * off);
        ctx.lineTo(m.x + nx * off, m.y + ny * off);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(110,82,48,0.9)';
      ctx.lineWidth = 6;
      line(ctx, c, m);
      ctx.strokeStyle = 'rgba(196,160,110,0.95)';
      ctx.lineWidth = 3.5;
      line(ctx, c, m);
    }
  }
  ctx.lineCap = 'butt';
}

function line(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
