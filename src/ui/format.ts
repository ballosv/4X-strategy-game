import { GOODS, type GoodId, type Stock } from '../core/data/goods';

export function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '∞';
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', ',');
}

export function signed(n: number, digits = 0): string {
  const s = fmt(n, digits);
  return n > 0 ? `+${s}` : s;
}

export function stockText(stock: Stock): string {
  const parts = (Object.entries(stock) as [GoodId, number][])
    .filter(([, v]) => v > 0)
    .map(([g, v]) => `${fmt(v, 1)} ${GOODS[g].name}`);
  return parts.join(', ');
}

export function costText(labor: number, goods: Stock, popCost = 0): string {
  const parts = [`${labor} AK`];
  const g = stockText(goods);
  if (g) parts.push(g);
  if (popCost) parts.push(`${popCost} Einw.`);
  return parts.join(' · ');
}
