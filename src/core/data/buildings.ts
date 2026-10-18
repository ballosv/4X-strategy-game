import type { Modifiers } from '../modifiers';
import type { GoodId, Stock } from './goods';

/** Rezept einer Produktionskette: Eingangsgüter je Arbeitskraft -> Ausgangsgüter. */
export interface Recipe {
  inputs: Partial<Record<GoodId, number>>;
  outputs: Partial<Record<GoodId, number>>;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  labor: number;
  goods: Stock;
  upkeep: number;
  tech?: string;
  /** Nur in Siedlungen (nicht in Lagern). */
  requiresSettlement?: boolean;
  requiresCoast?: boolean;
  requiresBuilding?: string;
  /** Produktionsgebäude: Arbeitsplätze und Rezept je Arbeitskraft. */
  jobs?: number;
  recipe?: Recipe;
  /** Feste Erträge pro Runde. */
  yields?: { gold?: number; research?: number; influence?: number; food?: number };
  /** Zusätzliche Transportkapazität. */
  transport?: number;
  defense?: number;
  /** Zusätzliche Wohnplätze (max. Bevölkerung). */
  housing?: number;
  /** Ausbildungsplätze für Gelehrte. */
  scholarSlots?: number;
  modifiers?: Modifiers;
  icon: string;
}

export const BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  (
    [
      // Steinzeit / Lager
      { id: 'firepit', name: 'Feuerstelle', description: '+1 Einfluss, +2 Wohnraum', labor: 8, goods: { wood: 2 }, upkeep: 0, yields: { influence: 1 }, housing: 2, icon: '🔥' },
      { id: 'storehouse', name: 'Vorratsgrube', description: '+3 Nahrung, verhindert Verderb', labor: 10, goods: { stone: 2 }, upkeep: 0, tech: 'pottery', yields: { food: 3 }, icon: '🏺' },
      { id: 'toolmaker', name: 'Werkzeugmacher', description: 'Holz + Stein → Werkzeuge', labor: 12, goods: { wood: 2, stone: 2 }, upkeep: 0, jobs: 2, recipe: { inputs: { wood: 1, stone: 1 }, outputs: { tools: 1 } }, icon: '🔨' },
      { id: 'palisade', name: 'Palisade', description: '+6 Verteidigung', labor: 12, goods: { wood: 4 }, upkeep: 0, defense: 6, icon: '🪵' },
      // Bronzezeit
      { id: 'sawmill', name: 'Sägegrube', description: 'Holz → Bretter', labor: 14, goods: { wood: 2, tools: 1 }, upkeep: 1, tech: 'bronzeWorking', jobs: 2, recipe: { inputs: { wood: 2 }, outputs: { planks: 1 } }, icon: '🪚' },
      { id: 'brickworks', name: 'Ziegelei', description: 'Lehm → Ziegel', labor: 14, goods: { stone: 2, tools: 1 }, upkeep: 1, tech: 'pottery', jobs: 2, recipe: { inputs: { clay: 2 }, outputs: { bricks: 1 } }, icon: '🧱' },
      { id: 'foundry', name: 'Bronzegießerei', description: 'Kupfer + Zinn → Bronze', labor: 18, goods: { stone: 3, tools: 1 }, upkeep: 1, tech: 'bronzeWorking', requiresSettlement: true, jobs: 2, recipe: { inputs: { copper: 1, tin: 1 }, outputs: { bronze: 1 } }, icon: '🥉' },
      { id: 'weaver', name: 'Weberei', description: 'Wolle oder Baumwolle → Stoffe', labor: 16, goods: { planks: 2 }, upkeep: 1, tech: 'weaving', jobs: 2, recipe: { inputs: { wool: 1 }, outputs: { cloth: 1 } }, icon: '🧵' },
      { id: 'market', name: 'Marktplatz', description: '+3 Gold, Handel mit dem Weltmarkt', labor: 18, goods: { planks: 2, bricks: 2 }, upkeep: 0, tech: 'currency', requiresSettlement: true, yields: { gold: 3 }, icon: '⚖️' },
      { id: 'shrine', name: 'Heiligtum', description: '+2 Einfluss', labor: 14, goods: { stone: 3 }, upkeep: 1, tech: 'mysticism', yields: { influence: 2 }, icon: '🗿' },
      { id: 'granary', name: 'Kornspeicher', description: '+2 Nahrung, +3 Wohnraum', labor: 16, goods: { bricks: 2, planks: 1 }, upkeep: 1, tech: 'agriculture', requiresSettlement: true, yields: { food: 2 }, housing: 3, icon: '🌾' },
      { id: 'harbor', name: 'Hafen', description: 'Seeweg zur Hauptstadt (beide mit Hafen), +2 Transport', labor: 20, goods: { planks: 4 }, upkeep: 1, tech: 'sailing', requiresCoast: true, transport: 2, icon: '⚓' },
      // Eisenzeit
      { id: 'smithy', name: 'Schmiede', description: 'Bronze oder Eisenerz → Waffen', labor: 20, goods: { bricks: 2, tools: 2 }, upkeep: 2, tech: 'ironWorking', requiresSettlement: true, jobs: 2, recipe: { inputs: { iron_ore: 1, wood: 1 }, outputs: { weapons: 1 } }, icon: '⚔️' },
      { id: 'tailor', name: 'Schneiderei', description: 'Stoffe → Kleidung', labor: 18, goods: { planks: 2 }, upkeep: 1, tech: 'weaving', requiresSettlement: true, jobs: 2, recipe: { inputs: { cloth: 2 }, outputs: { clothing: 1 } }, icon: '👕' },
      { id: 'library', name: 'Bibliothek', description: '+2 Entwicklung, 2 Plätze für Gelehrte', labor: 22, goods: { bricks: 3, planks: 1 }, upkeep: 2, tech: 'writing', requiresSettlement: true, yields: { research: 2 }, scholarSlots: 2, icon: '📚' },
      { id: 'walls', name: 'Stadtmauer', description: '+12 Verteidigung', labor: 24, goods: { stone: 6, bricks: 2 }, upkeep: 1, tech: 'masonry', requiresSettlement: true, defense: 12, icon: '🏰' },
      { id: 'barracks', name: 'Kaserne', description: '−20 % Arbeitskraft für Einheiten', labor: 20, goods: { bricks: 2, planks: 2 }, upkeep: 1, tech: 'bronzeWorking', requiresSettlement: true, modifiers: { unitCostPct: -20 }, icon: '🛡️' },
      // Mittelalter
      { id: 'steelworks', name: 'Hochofen', description: 'Eisenerz + Kohle/Holz → Stahl', labor: 30, goods: { bricks: 4, tools: 2 }, upkeep: 2, tech: 'feudalism', requiresSettlement: true, jobs: 3, recipe: { inputs: { iron_ore: 2, wood: 1 }, outputs: { steel: 1 } }, icon: '🔩' },
      { id: 'university', name: 'Universität', description: '+4 Entwicklung, 3 Plätze für Gelehrte', labor: 34, goods: { bricks: 4, planks: 2, cloth: 1 }, upkeep: 3, tech: 'education', requiresSettlement: true, requiresBuilding: 'library', yields: { research: 4 }, scholarSlots: 3, icon: '🎓' },
      { id: 'cathedral', name: 'Kathedrale', description: '+4 Einfluss', labor: 34, goods: { stone: 6, bricks: 2 }, upkeep: 3, tech: 'theology', requiresSettlement: true, yields: { influence: 4 }, icon: '⛪' },
      { id: 'bank', name: 'Bank', description: '+6 Gold', labor: 30, goods: { bricks: 4, precious: 1 }, upkeep: 0, tech: 'banking', requiresSettlement: true, requiresBuilding: 'market', yields: { gold: 6 }, icon: '🏦' },
      // Industrie und später
      { id: 'factory', name: 'Fabrik', description: 'Stahl + Bretter → Maschinen', labor: 40, goods: { steel: 4, bricks: 4 }, upkeep: 4, tech: 'industrialization', requiresSettlement: true, jobs: 4, recipe: { inputs: { steel: 1, planks: 1 }, outputs: { machines: 1 } }, icon: '🏭' },
      { id: 'textileMill', name: 'Textilfabrik', description: 'Baumwolle → Stoffe (effizient)', labor: 36, goods: { steel: 2, bricks: 4 }, upkeep: 3, tech: 'industrialization', requiresSettlement: true, jobs: 4, recipe: { inputs: { cotton: 1 }, outputs: { cloth: 2 } }, icon: '🧶' },
      { id: 'railway', name: 'Bahnhof', description: 'Eisenbahnanbindung an die Hauptstadt (+18 Transport)', labor: 40, goods: { steel: 4, planks: 2 }, upkeep: 2, tech: 'railroad', requiresSettlement: true, icon: '🚂' },
      { id: 'refinery', name: 'Raffinerie', description: 'Öl → Treibstoff', labor: 44, goods: { steel: 4, machines: 1 }, upkeep: 4, tech: 'oilDrilling', requiresSettlement: true, jobs: 3, recipe: { inputs: { oil: 1 }, outputs: { fuel: 1 } }, icon: '⛽' },
      { id: 'powerPlant', name: 'Kraftwerk', description: '+20 % Arbeitskraft', labor: 50, goods: { steel: 4, machines: 2 }, upkeep: 5, tech: 'electricity', requiresSettlement: true, modifiers: { laborPct: 20 }, icon: '⚡' },
      { id: 'electronicsPlant', name: 'Elektronikwerk', description: 'Seltene Erden + Edelmetall → Elektronik', labor: 56, goods: { steel: 4, machines: 2 }, upkeep: 5, tech: 'electronics', requiresSettlement: true, jobs: 3, recipe: { inputs: { rare_earth: 1, precious: 1 }, outputs: { electronics: 2 } }, icon: '💡' },
      { id: 'researchLab', name: 'Forschungslabor', description: '+8 Entwicklung, 3 Plätze für Gelehrte', labor: 56, goods: { machines: 2, electronics: 1 }, upkeep: 6, tech: 'computers', requiresSettlement: true, requiresBuilding: 'university', yields: { research: 8 }, scholarSlots: 3, icon: '🔬' },
      { id: 'dataCenter', name: 'Rechenzentrum', description: '+12 Entwicklung', labor: 70, goods: { electronics: 4, machines: 2 }, upkeep: 8, tech: 'networks', requiresSettlement: true, yields: { research: 12 }, icon: '🖥️' },
    ] satisfies BuildingDef[]
  ).map((d) => [d.id, d]),
);
