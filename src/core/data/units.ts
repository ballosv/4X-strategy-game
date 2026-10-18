import type { Stock } from './goods';

export type UnitClass = 'civilian' | 'recon' | 'infantry' | 'ranged' | 'cavalry' | 'siege' | 'naval' | 'air' | 'machine';
export type Domain = 'land' | 'sea' | 'air';
export type UnitAbility = 'foundCamp' | 'foundSettlement' | 'gather' | 'trade' | 'capture';

export interface UnitTypeDef {
  id: string;
  name: string;
  /** Typbezeichnung im Einheitenpanel, z. B. "Leichte Infanterie". */
  typeName: string;
  unitClass: UnitClass;
  domain: Domain;
  era: number;
  moves: number;
  /** Nahkampfstärke (0 = nicht kampffähig). */
  strength: number;
  rangedStrength?: number;
  range?: number;
  sight: number;
  /** Goldunterhalt pro Runde. */
  upkeep: number;
  /** Kosten: Arbeitskraft und Güter. */
  labor: number;
  goods: Stock;
  /** Bevölkerung, die beim Ausbilden verbraucht wird. */
  popCost?: number;
  tech?: string;
  abilities: UnitAbility[];
  /** Stärkebonus auf Hügeln und höher (Höhe ≥ 2). */
  hillBonus?: number;
  /** Bonus gegen eine Einheitenklasse. */
  versus?: { unitClass: UnitClass; bonus: number };
  /** Ersetzt veraltete Einheit. */
  upgradesFrom?: string;
  /** Nur für die KI-Fraktion (Maschinen) verfügbar. */
  machineOnly?: boolean;
  icon: string;
}

const u = (def: Omit<UnitTypeDef, 'abilities' | 'goods'> & Partial<Pick<UnitTypeDef, 'abilities' | 'goods'>>): UnitTypeDef => ({
  abilities: [],
  goods: {},
  ...def,
});

export const UNIT_TYPES: Record<string, UnitTypeDef> = Object.fromEntries(
  [
    // Steinzeit
    u({ id: 'tribe', name: 'Stamm', typeName: 'Umherziehender Stamm', unitClass: 'civilian', domain: 'land', era: 0, moves: 2, strength: 0, sight: 2, upkeep: 0, labor: 16, popCost: 2, abilities: ['foundCamp', 'gather'], icon: '⛺' }),
    u({ id: 'scout', name: 'Späher', typeName: 'Erkundung', unitClass: 'recon', domain: 'land', era: 0, moves: 3, strength: 6, sight: 3, upkeep: 0, labor: 8, abilities: ['gather'], icon: '🔭' }),
    u({ id: 'clubman', name: 'Keulenträger', typeName: 'Leichte Infanterie', unitClass: 'infantry', domain: 'land', era: 0, moves: 2, strength: 9, sight: 2, upkeep: 1, labor: 10, goods: { wood: 1 }, abilities: ['capture'], icon: '🪓' }),
    u({ id: 'slinger', name: 'Schleuderer', typeName: 'Fernkampf', unitClass: 'ranged', domain: 'land', era: 0, moves: 2, strength: 5, rangedStrength: 9, range: 2, sight: 2, upkeep: 1, labor: 10, goods: { stone: 1 }, icon: '🪨' }),
    // Bronzezeit
    u({ id: 'settler', name: 'Siedler', typeName: 'Zivil', unitClass: 'civilian', domain: 'land', era: 1, moves: 2, strength: 0, sight: 2, upkeep: 1, labor: 20, popCost: 2, goods: { tools: 1 }, tech: 'agriculture', abilities: ['foundSettlement', 'foundCamp'], icon: '🏘️' }),
    u({ id: 'spearman', name: 'Speerträger', typeName: 'Leichte Infanterie', unitClass: 'infantry', domain: 'land', era: 1, moves: 2, strength: 14, sight: 2, upkeep: 1, labor: 14, goods: { wood: 2, stone: 1 }, tech: 'bronzeWorking', abilities: ['capture'], hillBonus: 3, versus: { unitClass: 'cavalry', bonus: 6 }, upgradesFrom: 'clubman', icon: '🔱' }),
    u({ id: 'archer', name: 'Bogenschütze', typeName: 'Fernkampf', unitClass: 'ranged', domain: 'land', era: 1, moves: 2, strength: 8, rangedStrength: 15, range: 2, sight: 2, upkeep: 1, labor: 14, goods: { wood: 2 }, tech: 'archery', upgradesFrom: 'slinger', icon: '🏹' }),
    u({ id: 'chariot', name: 'Streitwagen', typeName: 'Kavallerie', unitClass: 'cavalry', domain: 'land', era: 1, moves: 4, strength: 17, sight: 2, upkeep: 2, labor: 18, goods: { wood: 2, horses: 1 }, tech: 'wheel', abilities: ['capture'], icon: '🐎' }),
    u({ id: 'galley', name: 'Galeere', typeName: 'Schiff', unitClass: 'naval', domain: 'sea', era: 1, moves: 3, strength: 13, sight: 2, upkeep: 1, labor: 16, goods: { planks: 2 }, tech: 'sailing', icon: '⛵' }),
    u({ id: 'merchant', name: 'Händler', typeName: 'Zivil', unitClass: 'civilian', domain: 'land', era: 2, moves: 3, strength: 0, sight: 2, upkeep: 0, labor: 14, goods: { cloth: 1 }, tech: 'currency', abilities: ['trade'], icon: '🐪' }),
    // Eisenzeit
    u({ id: 'swordsman', name: 'Schwertkämpfer', typeName: 'Schwere Infanterie', unitClass: 'infantry', domain: 'land', era: 2, moves: 2, strength: 22, sight: 2, upkeep: 2, labor: 20, goods: { weapons: 1 }, tech: 'ironWorking', abilities: ['capture'], upgradesFrom: 'spearman', icon: '🗡️' }),
    u({ id: 'horseman', name: 'Reiter', typeName: 'Kavallerie', unitClass: 'cavalry', domain: 'land', era: 2, moves: 4, strength: 23, sight: 2, upkeep: 2, labor: 20, goods: { horses: 1, bronze: 1 }, tech: 'horsebackRiding', abilities: ['capture'], upgradesFrom: 'chariot', icon: '🏇' }),
    u({ id: 'catapult', name: 'Katapult', typeName: 'Belagerung', unitClass: 'siege', domain: 'land', era: 2, moves: 2, strength: 10, rangedStrength: 26, range: 2, sight: 2, upkeep: 2, labor: 24, goods: { planks: 2, bronze: 1 }, tech: 'mathematics', icon: '🪃' }),
    u({ id: 'trireme', name: 'Trireme', typeName: 'Schiff', unitClass: 'naval', domain: 'sea', era: 2, moves: 4, strength: 20, sight: 2, upkeep: 2, labor: 22, goods: { planks: 3, bronze: 1 }, tech: 'shipbuilding', upgradesFrom: 'galley', icon: '🚣' }),
    // Mittelalter
    u({ id: 'pikeman', name: 'Pikenier', typeName: 'Schwere Infanterie', unitClass: 'infantry', domain: 'land', era: 3, moves: 2, strength: 30, sight: 2, upkeep: 2, labor: 26, goods: { weapons: 1, planks: 1 }, tech: 'feudalism', abilities: ['capture'], versus: { unitClass: 'cavalry', bonus: 8 }, upgradesFrom: 'swordsman', icon: '🔱' }),
    u({ id: 'crossbow', name: 'Armbrustschütze', typeName: 'Fernkampf', unitClass: 'ranged', domain: 'land', era: 3, moves: 2, strength: 18, rangedStrength: 32, range: 2, sight: 2, upkeep: 2, labor: 26, goods: { weapons: 1, planks: 1 }, tech: 'machinery', upgradesFrom: 'archer', icon: '🎯' }),
    u({ id: 'knight', name: 'Ritter', typeName: 'Schwere Kavallerie', unitClass: 'cavalry', domain: 'land', era: 3, moves: 4, strength: 36, sight: 2, upkeep: 3, labor: 30, goods: { horses: 1, steel: 1 }, tech: 'chivalry', abilities: ['capture'], upgradesFrom: 'horseman', icon: '🛡️' }),
    u({ id: 'cog', name: 'Kogge', typeName: 'Schiff', unitClass: 'naval', domain: 'sea', era: 3, moves: 4, strength: 30, sight: 3, upkeep: 2, labor: 28, goods: { planks: 4, cloth: 1 }, tech: 'navigation', upgradesFrom: 'trireme', icon: '⛵' }),
    // Renaissance
    u({ id: 'musketeer', name: 'Musketier', typeName: 'Linieninfanterie', unitClass: 'infantry', domain: 'land', era: 4, moves: 2, strength: 42, sight: 2, upkeep: 3, labor: 32, goods: { weapons: 2 }, tech: 'gunpowder', abilities: ['capture'], upgradesFrom: 'pikeman', icon: '🎖️' }),
    u({ id: 'cannon', name: 'Kanone', typeName: 'Belagerung', unitClass: 'siege', domain: 'land', era: 4, moves: 2, strength: 20, rangedStrength: 46, range: 2, sight: 2, upkeep: 3, labor: 34, goods: { steel: 2 }, tech: 'metallurgy', upgradesFrom: 'catapult', icon: '💣' }),
    u({ id: 'frigate', name: 'Fregatte', typeName: 'Kriegsschiff', unitClass: 'naval', domain: 'sea', era: 4, moves: 5, strength: 40, rangedStrength: 44, range: 2, sight: 3, upkeep: 3, labor: 36, goods: { planks: 4, cloth: 2, steel: 1 }, tech: 'navigation2', upgradesFrom: 'cog', icon: '🚢' }),
    // Industrie
    u({ id: 'rifleman', name: 'Schütze', typeName: 'Infanterie', unitClass: 'infantry', domain: 'land', era: 5, moves: 2, strength: 54, sight: 2, upkeep: 3, labor: 36, goods: { weapons: 2, clothing: 1 }, tech: 'rifling', abilities: ['capture'], upgradesFrom: 'musketeer', icon: '🪖' }),
    u({ id: 'cavalry', name: 'Kavallerie', typeName: 'Kavallerie', unitClass: 'cavalry', domain: 'land', era: 5, moves: 5, strength: 56, sight: 2, upkeep: 3, labor: 36, goods: { horses: 1, weapons: 1 }, tech: 'conscription', abilities: ['capture'], upgradesFrom: 'knight', icon: '🐴' }),
    u({ id: 'artillery', name: 'Artillerie', typeName: 'Belagerung', unitClass: 'siege', domain: 'land', era: 5, moves: 2, strength: 30, rangedStrength: 62, range: 3, sight: 2, upkeep: 4, labor: 40, goods: { steel: 3 }, tech: 'steelworks', upgradesFrom: 'cannon', icon: '🎇' }),
    u({ id: 'ironclad', name: 'Panzerschiff', typeName: 'Kriegsschiff', unitClass: 'naval', domain: 'sea', era: 5, moves: 5, strength: 58, rangedStrength: 60, range: 2, sight: 3, upkeep: 4, labor: 44, goods: { steel: 4, coal: 2 }, tech: 'steamPower', upgradesFrom: 'frigate', icon: '⚓' }),
    // Moderne
    u({ id: 'infantry', name: 'Infanterie', typeName: 'Infanterie', unitClass: 'infantry', domain: 'land', era: 6, moves: 2, strength: 68, sight: 2, upkeep: 4, labor: 42, goods: { weapons: 2, clothing: 1 }, tech: 'replaceableParts', abilities: ['capture'], upgradesFrom: 'rifleman', icon: '🪖' }),
    u({ id: 'tank', name: 'Panzer', typeName: 'Panzerfahrzeug', unitClass: 'cavalry', domain: 'land', era: 6, moves: 4, strength: 78, sight: 2, upkeep: 5, labor: 50, goods: { steel: 3, fuel: 2, machines: 1 }, tech: 'combustion', abilities: ['capture'], upgradesFrom: 'cavalry', icon: '🛞' }),
    u({ id: 'fighter', name: 'Jagdflugzeug', typeName: 'Flugzeug', unitClass: 'air', domain: 'air', era: 6, moves: 6, strength: 60, rangedStrength: 72, range: 4, sight: 4, upkeep: 5, labor: 50, goods: { machines: 2, fuel: 2 }, tech: 'flight', icon: '✈️' }),
    u({ id: 'destroyer', name: 'Zerstörer', typeName: 'Kriegsschiff', unitClass: 'naval', domain: 'sea', era: 6, moves: 6, strength: 72, rangedStrength: 74, range: 2, sight: 3, upkeep: 5, labor: 50, goods: { steel: 4, fuel: 2 }, tech: 'combustion', upgradesFrom: 'ironclad', icon: '🛳️' }),
    // Informationszeitalter
    u({ id: 'mechInfantry', name: 'Mech. Infanterie', typeName: 'Mechanisierte Infanterie', unitClass: 'infantry', domain: 'land', era: 7, moves: 3, strength: 84, sight: 2, upkeep: 5, labor: 54, goods: { weapons: 2, machines: 1, fuel: 1 }, tech: 'computers', abilities: ['capture'], upgradesFrom: 'infantry', icon: '🚙' }),
    u({ id: 'modernArmor', name: 'Kampfpanzer', typeName: 'Panzerfahrzeug', unitClass: 'cavalry', domain: 'land', era: 7, moves: 4, strength: 92, sight: 2, upkeep: 6, labor: 60, goods: { steel: 3, electronics: 1, fuel: 2 }, tech: 'composites', abilities: ['capture'], upgradesFrom: 'tank', icon: '🛡️' }),
    u({ id: 'jet', name: 'Kampfjet', typeName: 'Flugzeug', unitClass: 'air', domain: 'air', era: 7, moves: 8, strength: 75, rangedStrength: 90, range: 5, sight: 4, upkeep: 6, labor: 60, goods: { electronics: 1, machines: 1, fuel: 2 }, tech: 'computers', upgradesFrom: 'fighter', icon: '🛩️' }),
    // Nahe Zukunft
    u({ id: 'exoSoldier', name: 'Exo-Soldat', typeName: 'Infanterie der Zukunft', unitClass: 'infantry', domain: 'land', era: 8, moves: 3, strength: 102, sight: 3, upkeep: 6, labor: 64, goods: { electronics: 2, steel: 1 }, tech: 'robotics', abilities: ['capture'], upgradesFrom: 'mechInfantry', icon: '🦾' }),
    u({ id: 'empCannon', name: 'EMP-Geschütz', typeName: 'Anti-Maschinen-Artillerie', unitClass: 'siege', domain: 'land', era: 8, moves: 2, strength: 50, rangedStrength: 100, range: 3, sight: 2, upkeep: 6, labor: 64, goods: { electronics: 2, machines: 1 }, tech: 'robotics', versus: { unitClass: 'machine', bonus: 20 }, upgradesFrom: 'artillery', icon: '⚡' }),
    // KI-Fraktion
    u({ id: 'drone', name: 'Drohnenschwarm', typeName: 'Maschine', unitClass: 'machine', domain: 'land', era: 8, moves: 4, strength: 70, sight: 4, upkeep: 0, labor: 30, tech: 'never', abilities: ['capture'], machineOnly: true, icon: '🛸' }),
    u({ id: 'warMachine', name: 'Kampfmaschine', typeName: 'Maschine', unitClass: 'machine', domain: 'land', era: 8, moves: 3, strength: 105, sight: 3, upkeep: 0, labor: 50, tech: 'never', abilities: ['capture'], machineOnly: true, icon: '🤖' }),
  ].map((d) => [d.id, d]),
);

export function unitType(id: string): UnitTypeDef {
  const t = UNIT_TYPES[id];
  if (!t) throw new Error(`Unbekannter Einheitentyp: ${id}`);
  return t;
}
