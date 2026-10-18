import { unitType } from '../core/data/units';
import { shade } from './palette';
import { drawBoat } from './painter';

/**
 * Prozedurale Einheiten-Sprites. Einheiten sind bewusst etwas größer als maßstabsgetreu
 * (Grafik-Spezifikation Kap. 7) und tragen die Fraktionsfarbe.
 * Die Sprites werden je Typ und Farbe zwischengespeichert.
 */

const cache = new Map<string, HTMLCanvasElement>();
export const SPRITE_SIZE = 64;
const SCALE = 2;

export function unitSprite(type: string, color: string): HTMLCanvasElement {
  const key = `${type}|${color}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SPRITE_SIZE * SCALE;
  c.height = SPRITE_SIZE * SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  drawUnitFigure(ctx, type, color, SPRITE_SIZE / 2, SPRITE_SIZE - 6);
  cache.set(key, c);
  return c;
}

/** Zeichnet eine Einheit mit Fußpunkt (x, y). */
export function drawUnitFigure(ctx: CanvasRenderingContext2D, type: string, color: string, x: number, y: number): void {
  const def = unitType(type);
  const skin = '#e0b48a';
  const dark = shade(color, -0.35);
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 4, y, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (def.domain === 'sea') {
    drawBoat(ctx, x, y - 6, 16);
    flag(ctx, x + 2, y - 30, color);
    return;
  }
  if (def.unitClass === 'machine') {
    drawMachine(ctx, x, y, type === 'drone');
    return;
  }
  if (def.domain === 'air') {
    ctx.fillStyle = shade(color, -0.1);
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 18);
    ctx.lineTo(x + 16, y - 18);
    ctx.lineTo(x + 2, y - 24);
    ctx.lineTo(x - 2, y - 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9ced4';
    ctx.beginPath();
    ctx.ellipse(x, y - 21, 4, 12, Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (def.era >= 6 && def.unitClass === 'cavalry') {
    drawTank(ctx, x, y, color);
    return;
  }
  if (def.unitClass === 'siege') {
    drawSiege(ctx, x, y, def.era);
    drawPerson(ctx, x - 10, y, color, dark, skin, 0.75);
    return;
  }
  if (def.unitClass === 'cavalry') {
    drawHorse(ctx, x, y, def.id === 'chariot');
    drawPerson(ctx, x - 1, y - 12, color, dark, skin, 0.85);
    weapon(ctx, x, y - 12, 'spear');
    return;
  }
  if (type === 'tribe' || type === 'settler') {
    drawPerson(ctx, x - 7, y, shade(color, 0.25), dark, skin, 0.8);
    drawPerson(ctx, x + 6, y + 1, color, dark, skin, 0.9);
    // Bündel
    ctx.fillStyle = '#9a7a52';
    ctx.beginPath();
    ctx.ellipse(x + 11, y - 18, 5, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (type === 'tribe') flag(ctx, x - 12, y - 34, color);
    return;
  }
  drawPerson(ctx, x, y, color, dark, skin, 1);
  switch (def.unitClass) {
    case 'recon':
      weapon(ctx, x, y, 'staff');
      break;
    case 'ranged':
      weapon(ctx, x, y, def.era >= 4 ? 'gun' : def.id === 'slinger' ? 'sling' : 'bow');
      break;
    case 'civilian':
      weapon(ctx, x, y, 'staff');
      break;
    default:
      if (def.era >= 4) weapon(ctx, x, y, 'gun');
      else if (def.id === 'clubman') weapon(ctx, x, y, 'club');
      else if (def.id === 'swordsman') weapon(ctx, x, y, 'sword');
      else weapon(ctx, x, y, 'spear');
      if (def.era <= 3 && def.id !== 'clubman') shield(ctx, x + 6, y - 14, color);
  }
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dark: string, skin: string, s: number): void {
  // Beine
  ctx.fillStyle = '#4a3a2c';
  ctx.fillRect(x - 4 * s, y - 9 * s, 3 * s, 9 * s);
  ctx.fillRect(x + 1 * s, y - 9 * s, 3 * s, 9 * s);
  // Körper (Tunika in Fraktionsfarbe)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y - 8 * s);
  ctx.lineTo(x - 5 * s, y - 22 * s);
  ctx.lineTo(x + 5 * s, y - 22 * s);
  ctx.lineTo(x + 6 * s, y - 8 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x + 1 * s, y - 22 * s);
  ctx.lineTo(x + 5 * s, y - 22 * s);
  ctx.lineTo(x + 6 * s, y - 8 * s);
  ctx.lineTo(x + 1 * s, y - 8 * s);
  ctx.closePath();
  ctx.fill();
  // Gürtel
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x - 5.5 * s, y - 13 * s, 11 * s, 2 * s);
  // Kopf
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, y - 26 * s, 4.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a4030';
  ctx.beginPath();
  ctx.arc(x, y - 27.5 * s, 4.3 * s, Math.PI, Math.PI * 2);
  ctx.fill();
}

function weapon(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'spear' | 'club' | 'sword' | 'bow' | 'sling' | 'gun' | 'staff'): void {
  ctx.lineCap = 'round';
  switch (kind) {
    case 'spear':
    case 'staff':
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 2);
      ctx.lineTo(x - 8, y - 42);
      ctx.stroke();
      if (kind === 'spear') {
        ctx.fillStyle = '#c9ced4';
        ctx.beginPath();
        ctx.moveTo(x - 10.5, y - 40);
        ctx.lineTo(x - 8, y - 48);
        ctx.lineTo(x - 5.5, y - 40);
        ctx.fill();
      }
      break;
    case 'club':
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 12);
      ctx.lineTo(x - 11, y - 30);
      ctx.stroke();
      ctx.fillStyle = '#5a3d22';
      ctx.beginPath();
      ctx.arc(x - 11.5, y - 31, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'sword':
      ctx.strokeStyle = '#d5dbe0';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 14);
      ctx.lineTo(x - 13, y - 34);
      ctx.stroke();
      break;
    case 'bow':
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x - 6, y - 22, 11, -Math.PI / 2.2, Math.PI / 2.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,240,240,0.8)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - 1.5, y - 32);
      ctx.lineTo(x - 1.5, y - 12);
      ctx.stroke();
      break;
    case 'sling':
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 18);
      ctx.lineTo(x - 12, y - 30);
      ctx.stroke();
      ctx.fillStyle = '#9c968c';
      ctx.beginPath();
      ctx.arc(x - 12, y - 31, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'gun':
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 12);
      ctx.lineTo(x - 12, y - 38);
      ctx.stroke();
      break;
  }
  ctx.lineCap = 'butt';
}

function shield(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.ellipse(x, y, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 4.6, 6.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.arc(x, y, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.strokeStyle = '#5a3d22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 26);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 12, y + 3);
  ctx.lineTo(x, y + 8);
  ctx.closePath();
  ctx.fill();
}

function drawHorse(ctx: CanvasRenderingContext2D, x: number, y: number, chariot: boolean): void {
  ctx.fillStyle = '#7a4f2e';
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 10, y - 10, 3, 10);
  ctx.fillRect(x + 7, y - 10, 3, 10);
  ctx.beginPath();
  ctx.moveTo(x + 9, y - 14);
  ctx.lineTo(x + 17, y - 24);
  ctx.lineTo(x + 20, y - 21);
  ctx.lineTo(x + 13, y - 11);
  ctx.fill();
  if (chariot) {
    ctx.strokeStyle = '#5a3d22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 14, y - 6, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSiege(ctx: CanvasRenderingContext2D, x: number, y: number, era: number): void {
  if (era >= 4) {
    ctx.fillStyle = '#3a3a3a';
    ctx.save();
    ctx.translate(x + 4, y - 10);
    ctx.rotate(-0.35);
    ctx.fillRect(-2, -4, 22, 7);
    ctx.restore();
  } else {
    ctx.strokeStyle = '#7a5a36';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 6);
    ctx.lineTo(x + 16, y - 6);
    ctx.moveTo(x + 4, y - 6);
    ctx.lineTo(x + 14, y - 28);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a3d22';
  for (const dx of [0, 14]) {
    ctx.beginPath();
    ctx.arc(x + dx, y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = '#2f3438';
  ctx.fillRect(x - 16, y - 8, 32, 7);
  ctx.fillStyle = shade(color, -0.2);
  ctx.fillRect(x - 13, y - 16, 26, 9);
  ctx.fillStyle = color;
  ctx.fillRect(x - 6, y - 22, 13, 7);
  ctx.fillStyle = '#2f3438';
  ctx.fillRect(x + 6, y - 20, 16, 3);
}

function drawMachine(ctx: CanvasRenderingContext2D, x: number, y: number, drone: boolean): void {
  const glow = '#14d2c8';
  if (drone) {
    for (const [dx, dy] of [[-10, -26], [8, -30], [0, -18], [12, -16]]) {
      ctx.fillStyle = '#1b2430';
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = '#1b2430';
  ctx.fillRect(x - 9, y - 30, 18, 18);
  ctx.fillRect(x - 12, y - 12, 7, 12);
  ctx.fillRect(x + 5, y - 12, 7, 12);
  ctx.fillRect(x - 6, y - 40, 12, 9);
  ctx.fillStyle = glow;
  ctx.fillRect(x - 4, y - 37, 8, 2.5);
  ctx.fillRect(x - 2, y - 26, 4, 10);
}
