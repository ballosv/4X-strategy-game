import { GOOD_IDS, addStock, stockOf, type GoodId, type Stock } from '../core/data/goods';
import { canTrade, marketPrices } from '../core/game';
import { itemCost } from '../core/systems/economy';
import type { AiContext } from './context';
import { isHeadStalled, missingGoods } from './strategy';

/** Mindestgold, das nach Käufen in der Kasse bleiben soll. */
const GOLD_RESERVE = 20;

/**
 * Handel auf dem Weltmarkt: fehlende Güter für festgefahrene Bauaufträge kaufen,
 * Überschüsse verkaufen (vor allem bei knapper Kasse).
 */
export function manageTrade(ctx: AiContext): void {
  const { state, pid } = ctx;
  if (!canTrade(state, pid)) return;
  const p = ctx.player;
  const settlements = ctx.view.ownSettlements();

  // 1) Fehlende Güter kaufen
  for (const s of settlements) {
    if (!ctx.active) return;
    if (!isHeadStalled(ctx, s.id)) continue;
    const cost = itemCost(state, s, s.queue[0]);
    for (const m of missingGoods(ctx, cost.goods)) {
      const amount = Math.ceil(m.amount - 1e-9);
      const price = marketPrices(state, pid, m.good).buy * amount;
      if (p.gold - price < GOLD_RESERVE) continue;
      ctx.issue({ type: 'trade', good: m.good, amount });
    }
  }

  // 2) Überschüsse verkaufen
  const reserved: Stock = {};
  for (const s of settlements) {
    for (const item of s.queue) {
      for (const [g, v] of Object.entries(itemCost(state, s, item).goods) as [GoodId, number][]) addStock(reserved, g, v);
    }
  }
  const poor = p.gold < 15 && p.lastIncome.gold < 0;
  if (p.gold > 150 && !poor) return;
  for (const g of GOOD_IDS) {
    if (!ctx.active) return;
    // Nahrung im Nationallager stammt aus Überschüssen voller Siedlungen und wird nicht verbraucht
    const have = Math.floor(stockOf(p.stock, g));
    const keep = Math.ceil(stockOf(reserved, g)) + (poor ? 4 : 25);
    const surplus = have - keep;
    if (surplus < (poor ? 1 : 10)) continue;
    const amount = Math.min(surplus, poor ? 6 : 8);
    if (amount > 0) ctx.issue({ type: 'trade', good: g, amount: -amount });
  }
}
