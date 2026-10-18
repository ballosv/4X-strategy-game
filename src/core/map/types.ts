import type { FeatureId, ResourceId, TerrainId } from '../data/terrain';

export interface Tile {
  terrain: TerrainId;
  /** 0 = Wasser, 1..5 = Land (siehe ELEVATION_NAMES). */
  elevation: number;
  feature: FeatureId | null;
  resource: ResourceId | null;
  /** Bitmaske der Richtungen, in die ein Fluss dieses Feld mit dem Nachbarn verbindet. */
  river: number;
  /** Nummer der zusammenhängenden Landmasse (−1 für Wasser). */
  landmass: number;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[];
}

export type MapType = 'continents' | 'pangaea' | 'archipelago' | 'highlands' | 'inlandSea';
export type MapSize = 'small' | 'medium' | 'large' | 'huge';

export interface MapTypeDef {
  id: MapType;
  name: string;
  description: string;
  landRatio: number;
  /** Verschiebt die Höhenverteilung nach oben (0 = normal). */
  ruggedness: number;
}

export const MAP_TYPES: Record<MapType, MapTypeDef> = {
  continents: { id: 'continents', name: 'Kontinente', description: '2–3 große Landmassen, getrennt durch Ozean', landRatio: 0.42, ruggedness: 0 },
  pangaea: { id: 'pangaea', name: 'Pangäa', description: 'Eine zusammenhängende Landmasse', landRatio: 0.48, ruggedness: 0 },
  archipelago: { id: 'archipelago', name: 'Inselwelt', description: 'Viele mittlere und kleine Inseln', landRatio: 0.34, ruggedness: 0 },
  highlands: { id: 'highlands', name: 'Hochland', description: 'Plateaus, Klippen und Pässe', landRatio: 0.5, ruggedness: 1 },
  inlandSea: { id: 'inlandSea', name: 'Binnenmeer', description: 'Land rund um ein zentrales Meer', landRatio: 0.55, ruggedness: 0 },
};

export interface MapSizeDef {
  id: MapSize;
  name: string;
  width: number;
  height: number;
  defaultPlayers: number;
  maxPlayers: number;
}

export const MAP_SIZES: Record<MapSize, MapSizeDef> = {
  small: { id: 'small', name: 'Klein', width: 40, height: 26, defaultPlayers: 3, maxPlayers: 4 },
  medium: { id: 'medium', name: 'Mittel', width: 56, height: 36, defaultPlayers: 4, maxPlayers: 6 },
  large: { id: 'large', name: 'Groß', width: 74, height: 46, defaultPlayers: 6, maxPlayers: 8 },
  huge: { id: 'huge', name: 'Sehr groß', width: 96, height: 60, defaultPlayers: 8, maxPlayers: 10 },
};
