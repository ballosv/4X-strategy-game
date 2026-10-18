export interface EraDef {
  index: number;
  id: string;
  name: string;
  /** Jahreszahl zu Beginn des Zeitalters (negativ = v. Chr.). */
  startYear: number;
  /** Jahre pro Runde innerhalb dieses Zeitalters. */
  yearsPerTurn: number;
  /** Anzahl Armee-Slots (Einheiten pro Armee). */
  armySize: number;
  /** Anzahl Politik-Slots. */
  policySlots: number;
}

export const ERAS: EraDef[] = [
  { index: 0, id: 'stone', name: 'Steinzeit', startYear: -10000, yearsPerTurn: 100, armySize: 2, policySlots: 1 },
  { index: 1, id: 'bronze', name: 'Bronzezeit', startYear: -3500, yearsPerTurn: 50, armySize: 3, policySlots: 1 },
  { index: 2, id: 'iron', name: 'Eisenzeit', startYear: -1200, yearsPerTurn: 40, armySize: 3, policySlots: 2 },
  { index: 3, id: 'medieval', name: 'Mittelalter', startYear: 500, yearsPerTurn: 20, armySize: 4, policySlots: 2 },
  { index: 4, id: 'renaissance', name: 'Renaissance', startYear: 1400, yearsPerTurn: 10, armySize: 4, policySlots: 3 },
  { index: 5, id: 'industrial', name: 'Industriezeitalter', startYear: 1750, yearsPerTurn: 5, armySize: 5, policySlots: 3 },
  { index: 6, id: 'modern', name: 'Moderne', startYear: 1900, yearsPerTurn: 3, armySize: 5, policySlots: 4 },
  { index: 7, id: 'information', name: 'Informationszeitalter', startYear: 1970, yearsPerTurn: 2, armySize: 6, policySlots: 4 },
  { index: 8, id: 'future', name: 'Nahe Zukunft', startYear: 2030, yearsPerTurn: 1, armySize: 6, policySlots: 5 },
];

export function formatYear(year: number): string {
  return year < 0 ? `${-year} v. Chr.` : `${year} n. Chr.`;
}
