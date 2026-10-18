/** Güter: Rohstoffe und verarbeitete Waren. */

export type GoodId =
  // Nahrung
  | 'grain'
  | 'vegetables'
  | 'meat'
  // Rohstoffe
  | 'wood'
  | 'stone'
  | 'clay'
  | 'wool'
  | 'cotton'
  | 'copper'
  | 'tin'
  | 'iron_ore'
  | 'coal'
  | 'oil'
  | 'precious'
  | 'rare_earth'
  | 'horses'
  // Waren
  | 'planks'
  | 'bricks'
  | 'tools'
  | 'bronze'
  | 'steel'
  | 'cloth'
  | 'clothing'
  | 'weapons'
  | 'machines'
  | 'fuel'
  | 'electronics';

export type GoodCategory = 'food' | 'raw' | 'goods';

export interface GoodDef {
  id: GoodId;
  name: string;
  category: GoodCategory;
  /** Grundpreis auf dem Weltmarkt in Gold. */
  basePrice: number;
  /** Symbol für die UI (Emoji als Platzhalter bis zur Icon-Bibliothek). */
  icon: string;
}

export const GOODS: Record<GoodId, GoodDef> = {
  grain: { id: 'grain', name: 'Getreide', category: 'food', basePrice: 2, icon: '🌾' },
  vegetables: { id: 'vegetables', name: 'Gemüse', category: 'food', basePrice: 2, icon: '🥕' },
  meat: { id: 'meat', name: 'Fisch / Fleisch', category: 'food', basePrice: 3, icon: '🐟' },
  wood: { id: 'wood', name: 'Holz', category: 'raw', basePrice: 2, icon: '🪵' },
  stone: { id: 'stone', name: 'Stein', category: 'raw', basePrice: 2, icon: '🪨' },
  clay: { id: 'clay', name: 'Lehm', category: 'raw', basePrice: 1, icon: '🧱' },
  wool: { id: 'wool', name: 'Wolle', category: 'raw', basePrice: 3, icon: '🐑' },
  cotton: { id: 'cotton', name: 'Baumwolle', category: 'raw', basePrice: 3, icon: '☁️' },
  copper: { id: 'copper', name: 'Kupfer', category: 'raw', basePrice: 4, icon: '🟠' },
  tin: { id: 'tin', name: 'Zinn', category: 'raw', basePrice: 4, icon: '⚪' },
  iron_ore: { id: 'iron_ore', name: 'Eisenerz', category: 'raw', basePrice: 4, icon: '⛏️' },
  coal: { id: 'coal', name: 'Kohle', category: 'raw', basePrice: 4, icon: '⚫' },
  oil: { id: 'oil', name: 'Öl', category: 'raw', basePrice: 6, icon: '🛢️' },
  precious: { id: 'precious', name: 'Edelmetall', category: 'raw', basePrice: 10, icon: '💎' },
  rare_earth: { id: 'rare_earth', name: 'Seltene Erden', category: 'raw', basePrice: 9, icon: '🔷' },
  horses: { id: 'horses', name: 'Pferde', category: 'raw', basePrice: 5, icon: '🐎' },
  planks: { id: 'planks', name: 'Bretter', category: 'goods', basePrice: 5, icon: '🪚' },
  bricks: { id: 'bricks', name: 'Ziegel', category: 'goods', basePrice: 4, icon: '🧱' },
  tools: { id: 'tools', name: 'Werkzeuge', category: 'goods', basePrice: 7, icon: '🔨' },
  bronze: { id: 'bronze', name: 'Bronze', category: 'goods', basePrice: 9, icon: '🥉' },
  steel: { id: 'steel', name: 'Stahl', category: 'goods', basePrice: 11, icon: '🔩' },
  cloth: { id: 'cloth', name: 'Stoffe', category: 'goods', basePrice: 6, icon: '🧵' },
  clothing: { id: 'clothing', name: 'Kleidung', category: 'goods', basePrice: 9, icon: '👕' },
  weapons: { id: 'weapons', name: 'Waffen', category: 'goods', basePrice: 12, icon: '⚔️' },
  machines: { id: 'machines', name: 'Maschinen', category: 'goods', basePrice: 18, icon: '⚙️' },
  fuel: { id: 'fuel', name: 'Treibstoff', category: 'goods', basePrice: 12, icon: '⛽' },
  electronics: { id: 'electronics', name: 'Elektronik', category: 'goods', basePrice: 24, icon: '💡' },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];
export const FOOD_GOODS: GoodId[] = ['grain', 'vegetables', 'meat'];

export type Stock = Partial<Record<GoodId, number>>;

export function addStock(target: Stock, good: GoodId, amount: number): void {
  target[good] = (target[good] ?? 0) + amount;
}

export function stockOf(stock: Stock, good: GoodId): number {
  return stock[good] ?? 0;
}

export function hasStock(stock: Stock, need: Stock): boolean {
  return (Object.keys(need) as GoodId[]).every((g) => stockOf(stock, g) >= (need[g] ?? 0));
}

export function takeStock(stock: Stock, need: Stock): void {
  for (const g of Object.keys(need) as GoodId[]) addStock(stock, g, -(need[g] ?? 0));
}
