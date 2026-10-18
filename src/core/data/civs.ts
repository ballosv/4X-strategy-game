import type { Modifiers } from '../modifiers';

export type TraitId =
  | 'agrarian'
  | 'peaceful'
  | 'builder'
  | 'steadfast'
  | 'seafaring'
  | 'mercantile'
  | 'curious'
  | 'spiritual'
  | 'warlike'
  | 'disciplined'
  | 'explorer'
  | 'adaptive'
  | 'splendid'
  | 'industrious';

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  modifiers: Modifiers;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  agrarian: { id: 'agrarian', name: 'Agrarisch', description: '+15 % Nahrung', modifiers: { foodPct: 15 } },
  peaceful: { id: 'peaceful', name: 'Friedliebend', description: '+1 Einfluss je Siedlung', modifiers: { influencePerSettlement: 1 } },
  builder: { id: 'builder', name: 'Baumeister', description: '−15 % Arbeitskraftkosten für Gebäude', modifiers: { buildingCostPct: -15 } },
  steadfast: { id: 'steadfast', name: 'Standhaft', description: '+3 Verteidigung in eigenem Gebiet', modifiers: { defenseInTerritory: 3 } },
  seafaring: { id: 'seafaring', name: 'Seefahrend', description: '+1 Bewegung für Schiffe, +1 Fisch je Fischerei', modifiers: { navalMoves: 1, fishBonus: 1 } },
  mercantile: { id: 'mercantile', name: 'Händlerisch', description: '+20 % Gold, bessere Handelspreise', modifiers: { goldPct: 20, tradeSpread: -0.05 } },
  curious: { id: 'curious', name: 'Wissbegierig', description: '+15 % Entwicklungspunkte', modifiers: { researchPct: 15 } },
  spiritual: { id: 'spiritual', name: 'Spirituell', description: '+20 % Einfluss', modifiers: { influencePct: 20 } },
  warlike: { id: 'warlike', name: 'Kriegerisch', description: '+2 Angriffsstärke', modifiers: { attackBonus: 2 } },
  disciplined: { id: 'disciplined', name: 'Diszipliniert', description: '−25 % Unterhalt für Einheiten', modifiers: { upkeepPct: -25 } },
  explorer: { id: 'explorer', name: 'Erkundend', description: '+1 Sicht und +1 Bewegung für Späher', modifiers: { reconMoves: 1, sightBonus: 1 } },
  adaptive: { id: 'adaptive', name: 'Anpassungsfähig', description: 'Keine Abzüge durch Sumpf, Wüste und Tundra', modifiers: { harshTerrainYield: 1 } },
  splendid: { id: 'splendid', name: 'Prachtvoll', description: '+1 Vermächtnispunkt je abgeschlossenem Meilenstein (Kultur)', modifiers: { cultureLegacyBonus: 1 } },
  industrious: { id: 'industrious', name: 'Fleißig', description: '+10 % Arbeitskraft', modifiers: { laborPct: 10 } },
};

export type Orientation = 'growth' | 'production' | 'trade' | 'knowledge' | 'military' | 'expansion' | 'influence';

export const ORIENTATION_NAMES: Record<Orientation, string> = {
  growth: 'Wachstum',
  production: 'Produktion',
  trade: 'Handel',
  knowledge: 'Wissen',
  military: 'Militär',
  expansion: 'Expansion',
  influence: 'Einfluss',
};

export interface CivDef {
  id: string;
  name: string;
  /** Primärfarbe (Banner, Grenzen). */
  color: string;
  /** Sekundärfarbe (Wappen). */
  secondary: string;
  emblem: string;
  traits: [TraitId, TraitId];
  orientation: Orientation;
  /** Beschreibung der Mentalität. */
  mentality: string;
  settlementNames: string[];
}

export const CIVS: CivDef[] = [
  {
    id: 'linden', name: 'Lindenvolk', color: '#2f6fb5', secondary: '#e8eef5', emblem: '🌿',
    traits: ['agrarian', 'peaceful'], orientation: 'growth',
    mentality: 'Geduldige Bauern, die ihre Wälder und Felder pflegen.',
    settlementNames: ['Lindenhain', 'Grünau', 'Birkenfeld', 'Erlengrund', 'Moosbach', 'Ährental', 'Weidenhof', 'Hollerbrunn', 'Sonnenwiese', 'Tauried', 'Kleefurt', 'Waldesruh'],
  },
  {
    id: 'rock', name: 'Felsenclan', color: '#8a5a3c', secondary: '#f1e2cf', emblem: '⛰️',
    traits: ['builder', 'steadfast'], orientation: 'production',
    mentality: 'Stoische Baumeister, die in und auf dem Fels leben.',
    settlementNames: ['Steinwacht', 'Grauturm', 'Felsenheim', 'Klippenstedt', 'Erzgrund', 'Basaltburg', 'Hohenstein', 'Schieferau', 'Granitfeste', 'Mauerbrück'],
  },
  {
    id: 'waves', name: 'Wellenreiter', color: '#1b9aa0', secondary: '#e3f6f6', emblem: '🌊',
    traits: ['seafaring', 'mercantile'], orientation: 'trade',
    mentality: 'Kühne Seefahrer, die vom Handel über das Meer leben.',
    settlementNames: ['Gischthafen', 'Muschelbucht', 'Salzwiek', 'Brandungsend', 'Möwenkap', 'Perlstrand', 'Tangholm', 'Fluthafen', 'Korallriff', 'Dünenhafen'],
  },
  {
    id: 'stars', name: 'Sternenseher', color: '#6a4fb3', secondary: '#efe9fb', emblem: '✨',
    traits: ['curious', 'spiritual'], orientation: 'knowledge',
    mentality: 'Grübler und Gelehrte, die in den Himmel blicken.',
    settlementNames: ['Sternwarte', 'Mondquell', 'Lichtenhöh', 'Orakelfels', 'Nachtau', 'Himmelsrand', 'Kometenruh', 'Zenitheim', 'Polarstadt', 'Aurorae'],
  },
  {
    id: 'ash', name: 'Aschenbund', color: '#b23a32', secondary: '#f7e3e1', emblem: '🔥',
    traits: ['warlike', 'disciplined'], orientation: 'military',
    mentality: 'Ein strenges Kriegervolk, das in Glut geschmiedet wurde.',
    settlementNames: ['Glutfeste', 'Aschenhall', 'Funkenberg', 'Schmiedeglut', 'Rußtal', 'Brandmark', 'Eisenwall', 'Feuerhorst', 'Schlackenburg', 'Zunderheim'],
  },
  {
    id: 'mist', name: 'Nebelwanderer', color: '#5c7d6a', secondary: '#e6efe9', emblem: '🌫️',
    traits: ['explorer', 'adaptive'], orientation: 'expansion',
    mentality: 'Rastlose Wanderer, die jeden Winkel der Welt sehen wollen.',
    settlementNames: ['Nebelfurt', 'Pfadesend', 'Wanderruh', 'Fernsicht', 'Dämmerhain', 'Taupfad', 'Weitblick', 'Grenzwacht', 'Wolkenrast', 'Moorlicht'],
  },
  {
    id: 'sun', name: 'Sonnenkinder', color: '#d4a017', secondary: '#fff6dc', emblem: '☀️',
    traits: ['mercantile', 'splendid'], orientation: 'influence',
    mentality: 'Ein prachtliebendes Volk von Händlern und Festen.',
    settlementNames: ['Goldglanz', 'Sonnhalde', 'Mittagsstadt', 'Lichterhof', 'Glanzfurt', 'Bernsteinau', 'Strahlenfeld', 'Safranhof', 'Honigtal', 'Festwiese'],
  },
  {
    id: 'iron', name: 'Eisenhand', color: '#4a5563', secondary: '#e5e8ec', emblem: '⚙️',
    traits: ['industrious', 'builder'], orientation: 'production',
    mentality: 'Unermüdliche Handwerker, die jedes Problem mit Werkzeug lösen.',
    settlementNames: ['Hammerstatt', 'Ambossgrund', 'Zahnradhof', 'Schmelzhütte', 'Kesselbrück', 'Nietenau', 'Werkheim', 'Ölmühle', 'Kolbenfeld', 'Schraubstock'],
  },
];

export const CITY_STATE_NAMES = [
  'Bernfurt', 'Kalmar', 'Odessia', 'Velmora', 'Tarnis', 'Quellenruh', 'Ysmar', 'Dravik', 'Solenne', 'Marbek', 'Urdal', 'Fenwick',
];
