import type { Modifiers } from '../modifiers';

export interface PolicyDef {
  id: string;
  name: string;
  description: string;
  tech?: string;
  era: number;
  /** Einflusskosten für die Einführung. */
  cost: number;
  modifiers: Modifiers;
}

const p = (id: string, name: string, era: number, cost: number, description: string, modifiers: Modifiers, tech?: string): PolicyDef => ({
  id, name, era, cost, description, modifiers, tech,
});

export const POLICIES: Record<string, PolicyDef> = Object.fromEntries(
  [
    p('elders', 'Ältestenrat', 0, 10, '+1 Einfluss je Siedlung', { influencePerSettlement: 1 }),
    p('hunters', 'Jagdgemeinschaft', 0, 10, '+10 % Nahrung', { foodPct: 10 }),
    p('warband', 'Kriegerbund', 0, 10, '+2 Angriffsstärke', { attackBonus: 2 }),
    p('craftsmen', 'Handwerkszünfte', 1, 20, '+10 % Arbeitskraft', { laborPct: 10 }, 'bronzeWorking'),
    p('roads', 'Wegebau', 1, 20, '+2 Transportkapazität je Siedlung', { transportBonus: 2 }, 'wheel'),
    p('scribes', 'Schreiberschulen', 1, 20, '+15 % Entwicklung', { researchPct: 15 }, 'writing'),
    p('tribute', 'Tributwesen', 2, 30, '+15 % Gold', { goldPct: 15 }, 'currency'),
    p('legions', 'Stehendes Heer', 2, 30, '−25 % Unterhalt für Einheiten', { upkeepPct: -25 }, 'ironWorking'),
    p('expansion', 'Landnahme', 2, 30, '+1 Bewegung für Landeinheiten', { landMoves: 1 }, 'horsebackRiding'),
    p('serfdom', 'Leibeigenschaft', 3, 40, '+15 % Arbeitskraft', { laborPct: 15 }, 'feudalism'),
    p('scholasticism', 'Scholastik', 3, 40, '+20 % Entwicklung', { researchPct: 20 }, 'education'),
    p('mercantilism', 'Merkantilismus', 4, 50, '+25 % Gold, bessere Handelspreise', { goldPct: 25, tradeSpread: -0.05 }, 'banking'),
    p('enlightenment', 'Aufklärung', 4, 50, '+25 % Entwicklung', { researchPct: 25 }, 'printing'),
    p('assembly', 'Fließband', 5, 60, '+20 % Arbeitskraft', { laborPct: 20 }, 'industrialization'),
    p('welfare', 'Sozialstaat', 6, 70, '+20 % Wachstum, +10 % Nahrung', { growthPct: 20, foodPct: 10 }, 'electricity'),
    p('propaganda', 'Medienmacht', 6, 70, '+30 % Einfluss', { influencePct: 30 }, 'electricity'),
    p('automation', 'Automatisierung', 7, 80, '+25 % Arbeitskraft', { laborPct: 25 }, 'computers'),
    p('opensource', 'Offene Wissenschaft', 7, 80, '+30 % Entwicklung', { researchPct: 30 }, 'networks'),
  ].map((d) => [d.id, d]),
);
