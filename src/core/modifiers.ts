/**
 * Spielregel-Modifikatoren aus Eigenschaften, Politiken und Gebäuden.
 * Alle Werte sind additiv; Prozentwerte werden summiert und dann angewendet.
 */
export interface Modifiers {
  foodPct?: number;
  goldPct?: number;
  researchPct?: number;
  influencePct?: number;
  laborPct?: number;
  buildingCostPct?: number;
  unitCostPct?: number;
  upkeepPct?: number;
  influencePerSettlement?: number;
  goldPerSettlement?: number;
  researchPerSettlement?: number;
  defenseInTerritory?: number;
  attackBonus?: number;
  navalMoves?: number;
  reconMoves?: number;
  landMoves?: number;
  sightBonus?: number;
  fishBonus?: number;
  harshTerrainYield?: number;
  tradeSpread?: number;
  cultureLegacyBonus?: number;
  growthPct?: number;
  transportBonus?: number;
  healBonus?: number;
}

export function combineModifiers(list: (Modifiers | undefined)[]): Modifiers {
  const out: Modifiers = {};
  for (const m of list) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m) as [keyof Modifiers, number][]) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

export function pct(base: number, percent: number | undefined): number {
  return base * (1 + (percent ?? 0) / 100);
}
