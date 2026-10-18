import type { GoodId, Stock } from './goods';
import type { FeatureId, ResourceId, TerrainId } from './terrain';

/**
 * Geländeausbauten (Imperialismus-Prinzip): Jeder Ausbau bietet Arbeitsplätze.
 * Jede gebundene Arbeitskraft erzeugt den Ertrag des Feldes für die angegebenen Güter.
 */
export interface ImprovementDef {
  id: string;
  name: string;
  /** Erzeugte Güter je Arbeitskraft und Ausbaustufe. */
  output: Partial<Record<GoodId, number>>;
  /** Arbeitsplätze je Ausbaustufe. */
  jobs: number;
  maxLevel: number;
  labor: number;
  goods: Stock;
  tech?: string;
  /** Technologie je weiterer Ausbaustufe (Index 0 = Stufe 2). */
  levelTechs?: string[];
  terrains?: TerrainId[];
  features?: (FeatureId | null)[];
  resources?: ResourceId[];
  minElevation?: number;
  maxElevation?: number;
  water?: boolean;
  /** Ressource muss vorhanden sein. */
  requiresResource?: boolean;
  /** Entfernt das Overlay beim Bau (z. B. Rodung für Felder). */
  clearsFeature?: boolean;
  icon: string;
}

export const IMPROVEMENTS: Record<string, ImprovementDef> = Object.fromEntries(
  (
    [
      { id: 'hunting', name: 'Jagdlager', output: { meat: 1 }, jobs: 2, maxLevel: 1, labor: 6, goods: {}, features: ['forest', 'denseForest'], icon: '🦌' },
      { id: 'gatherers', name: 'Sammlerplatz', output: { vegetables: 1 }, jobs: 2, maxLevel: 1, labor: 5, goods: {}, terrains: ['grassland', 'plains', 'marsh', 'tundra'], features: [null], icon: '🧺' },
      { id: 'farm', name: 'Farm', output: { grain: 2 }, jobs: 2, maxLevel: 3, labor: 10, goods: { wood: 1 }, tech: 'agriculture', levelTechs: ['irrigation', 'crop_rotation'], terrains: ['grassland', 'plains'], features: [null, 'forest'], clearsFeature: true, maxElevation: 2, icon: '🌾' },
      { id: 'garden', name: 'Gemüsegarten', output: { vegetables: 2 }, jobs: 2, maxLevel: 2, labor: 8, goods: { wood: 1 }, tech: 'agriculture', levelTechs: ['crop_rotation'], terrains: ['grassland', 'marsh', 'plains'], features: [null], maxElevation: 2, icon: '🥕' },
      { id: 'fishery', name: 'Fischerei', output: { meat: 2 }, jobs: 2, maxLevel: 3, labor: 8, goods: { wood: 1 }, tech: 'fishing', levelTechs: ['shipbuilding', 'refrigeration'], water: true, terrains: ['coast', 'lake'], icon: '🎣' },
      { id: 'pasture', name: 'Weide', output: { meat: 1, wool: 1 }, jobs: 2, maxLevel: 2, labor: 8, goods: { wood: 1 }, tech: 'animalHusbandry', levelTechs: ['crop_rotation'], terrains: ['grassland', 'plains', 'tundra'], features: [null], maxElevation: 3, icon: '🐑' },
      { id: 'stable', name: 'Gestüt', output: { horses: 1 }, jobs: 1, maxLevel: 2, labor: 10, goods: { wood: 2 }, tech: 'animalHusbandry', levelTechs: ['chivalry'], resources: ['horses'], requiresResource: true, icon: '🐎' },
      { id: 'plantation', name: 'Plantage', output: { cotton: 1 }, jobs: 2, maxLevel: 2, labor: 10, goods: { wood: 1 }, tech: 'pottery', levelTechs: ['industrialization'], resources: ['cotton'], requiresResource: true, icon: '☁️' },
      { id: 'lumber', name: 'Holzfäller', output: { wood: 1 }, jobs: 2, maxLevel: 3, labor: 6, goods: {}, features: ['forest', 'denseForest'], levelTechs: ['bronzeWorking', 'industrialization'], icon: '🪓' },
      { id: 'quarry', name: 'Steinbruch', output: { stone: 1 }, jobs: 2, maxLevel: 3, labor: 8, goods: {}, minElevation: 2, levelTechs: ['masonry', 'industrialization'], icon: '🪨' },
      { id: 'claypit', name: 'Lehmgrube', output: { clay: 2 }, jobs: 2, maxLevel: 2, labor: 6, goods: {}, tech: 'pottery', levelTechs: ['industrialization'], resources: ['clay'], requiresResource: true, icon: '🏺' },
      { id: 'mine', name: 'Mine', output: {}, jobs: 2, maxLevel: 3, labor: 12, goods: { wood: 2 }, tech: 'mining', levelTechs: ['ironWorking', 'steamPower'], resources: ['copper', 'tin', 'iron', 'coal', 'precious', 'rare_earth', 'flint'], requiresResource: true, icon: '⛏️' },
      { id: 'oilwell', name: 'Ölquelle', output: { oil: 2 }, jobs: 2, maxLevel: 2, labor: 20, goods: { steel: 2 }, tech: 'oilDrilling', levelTechs: ['plastics'], resources: ['oil'], requiresResource: true, icon: '🛢️' },
    ] satisfies ImprovementDef[]
  ).map((d) => [d.id, d]),
);
