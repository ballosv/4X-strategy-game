import type { GoodId } from './goods';

export type TerrainId =
  | 'ocean'
  | 'coast'
  | 'lake'
  | 'grassland'
  | 'plains'
  | 'desert'
  | 'tundra'
  | 'snow'
  | 'marsh';

export type FeatureId = 'forest' | 'denseForest' | 'rocks';

export type ResourceId =
  | 'game'
  | 'fish'
  | 'wheat'
  | 'sheep'
  | 'flint'
  | 'clay'
  | 'copper'
  | 'tin'
  | 'iron'
  | 'coal'
  | 'oil'
  | 'cotton'
  | 'horses'
  | 'precious'
  | 'rare_earth';

export interface TerrainDef {
  id: TerrainId;
  name: string;
  water: boolean;
  /** Bewegungskosten für Landeinheiten (Wasser: für Schiffe). */
  moveCost: number;
  /** Grundertrag des Feldes, wenn es bewirtschaftet wird. */
  yields: Partial<Record<GoodId, number>>;
  /** Grundfarbe für den Renderer. */
  color: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  ocean: { id: 'ocean', name: 'Meer', water: true, moveCost: 1, yields: { meat: 1 }, color: '#2f6fa8' },
  coast: { id: 'coast', name: 'Küste', water: true, moveCost: 1, yields: { meat: 2 }, color: '#3f8fc4' },
  lake: { id: 'lake', name: 'See', water: true, moveCost: 1, yields: { meat: 2 }, color: '#4a9bcc' },
  grassland: { id: 'grassland', name: 'Grasland', water: false, moveCost: 1, yields: { grain: 2, vegetables: 1 }, color: '#8fbf4f' },
  plains: { id: 'plains', name: 'Ebene', water: false, moveCost: 1, yields: { grain: 2 }, color: '#bfb35a' },
  desert: { id: 'desert', name: 'Wüste', water: false, moveCost: 1, yields: {}, color: '#e2c98a' },
  tundra: { id: 'tundra', name: 'Tundra', water: false, moveCost: 1, yields: { meat: 1 }, color: '#9aa88a' },
  snow: { id: 'snow', name: 'Schnee', water: false, moveCost: 2, yields: {}, color: '#e8eef2' },
  marsh: { id: 'marsh', name: 'Sumpf', water: false, moveCost: 2, yields: { vegetables: 1 }, color: '#6f8c5a' },
};

export interface FeatureDef {
  id: FeatureId;
  name: string;
  moveCost: number;
  /** Zusätzlicher Verteidigungsbonus (Stärke). */
  defense: number;
  /** Sichtblockade: Einheiten können nicht hindurchsehen. */
  blocksSight: boolean;
  yields: Partial<Record<GoodId, number>>;
}

export const FEATURES: Record<FeatureId, FeatureDef> = {
  forest: { id: 'forest', name: 'Wald', moveCost: 1, defense: 2, blocksSight: false, yields: { wood: 2, meat: 1 } },
  denseForest: { id: 'denseForest', name: 'Dichter Wald', moveCost: 2, defense: 3, blocksSight: true, yields: { wood: 3 } },
  rocks: { id: 'rocks', name: 'Felsen', moveCost: 1, defense: 2, blocksSight: false, yields: { stone: 2 } },
};

export interface ResourceDef {
  id: ResourceId;
  name: string;
  good: GoodId;
  amount: number;
  /** Zeitalter-Index, ab dem die Ressource sichtbar ist. */
  revealEra: number;
  water: boolean;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  game: { id: 'game', name: 'Wild', good: 'meat', amount: 2, revealEra: 0, water: false },
  fish: { id: 'fish', name: 'Fischgründe', good: 'meat', amount: 3, revealEra: 0, water: true },
  wheat: { id: 'wheat', name: 'Wildgetreide', good: 'grain', amount: 2, revealEra: 0, water: false },
  sheep: { id: 'sheep', name: 'Schafe', good: 'wool', amount: 2, revealEra: 0, water: false },
  flint: { id: 'flint', name: 'Feuerstein', good: 'stone', amount: 2, revealEra: 0, water: false },
  clay: { id: 'clay', name: 'Lehmgrube', good: 'clay', amount: 3, revealEra: 0, water: false },
  copper: { id: 'copper', name: 'Kupfer', good: 'copper', amount: 2, revealEra: 0, water: false },
  tin: { id: 'tin', name: 'Zinn', good: 'tin', amount: 2, revealEra: 1, water: false },
  iron: { id: 'iron', name: 'Eisen', good: 'iron_ore', amount: 2, revealEra: 2, water: false },
  cotton: { id: 'cotton', name: 'Baumwolle', good: 'cotton', amount: 2, revealEra: 1, water: false },
  horses: { id: 'horses', name: 'Pferde', good: 'horses', amount: 1, revealEra: 1, water: false },
  precious: { id: 'precious', name: 'Edelmetalle', good: 'precious', amount: 1, revealEra: 1, water: false },
  coal: { id: 'coal', name: 'Kohle', good: 'coal', amount: 3, revealEra: 5, water: false },
  oil: { id: 'oil', name: 'Öl', good: 'oil', amount: 3, revealEra: 6, water: false },
  rare_earth: { id: 'rare_earth', name: 'Seltene Erden', good: 'rare_earth', amount: 2, revealEra: 7, water: false },
};

export const MAX_ELEVATION = 5;
/** Ab diesem Höhenunterschied entsteht eine unpassierbare Klippe. */
export const CLIFF_DELTA = 2;
export const IMPASSABLE_ELEVATION = 5;

export const ELEVATION_NAMES = ['Wasser', 'Ebene', 'Hügel', 'Hochplateau', 'Gebirge', 'Hochgebirge'];
