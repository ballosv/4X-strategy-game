import { ERAS } from '../core/data/eras';
import { POLICIES } from '../core/data/policies';
import { RESOURCES, type ResourceId } from '../core/data/terrain';
import { hasTech } from '../core/context';
import { isWater } from '../core/map/passability';
import { campCost } from '../core/systems/settlements';
import { availableTechs } from '../core/systems/research';
import type { AiContext } from './context';
import type { GoalId } from './memory';
import { isFounder } from './util';

type TechTag = Partial<Record<GoalId, number>>;

/** Strategische Zuordnung der Technologien (Gewichte je Ziel). */
const TECH_TAGS: Record<string, TechTag> = {
  agriculture: { economy: 1.2, expand: 1.5 },
  pottery: { economy: 1.1 },
  mining: { economy: 0.7, military: 0.4 },
  animalHusbandry: { economy: 0.6 },
  fishing: { economy: 0.4 },
  mysticism: { expand: 0.5, research: 0.2 },
  bronzeWorking: { military: 1.2, economy: 0.6 },
  archery: { military: 0.9, defend: 0.6 },
  wheel: { economy: 0.4, military: 0.4 },
  sailing: { economy: 0.3 },
  masonry: { defend: 1, economy: 0.4 },
  weaving: { economy: 0.5 },
  writing: { research: 1.6, economy: 0.3 },
  irrigation: { economy: 1, expand: 0.3 },
  ironWorking: { military: 1.2 },
  horsebackRiding: { military: 0.7, attack: 0.5 },
  mathematics: { research: 0.6, attack: 0.6 },
  shipbuilding: { economy: 0.3 },
  currency: { economy: 1.2 },
  feudalism: { military: 1, economy: 0.5 },
  machinery: { military: 0.8, defend: 0.5 },
  chivalry: { military: 0.6, attack: 0.6 },
  navigation: { economy: 0.2 },
  education: { research: 1.5 },
  theology: { expand: 0.5 },
  crop_rotation: { economy: 1 },
  gunpowder: { military: 1.1, defend: 0.5 },
  metallurgy: { attack: 0.8, military: 0.4 },
  navigation2: { economy: 0.2 },
  banking: { economy: 1 },
  printing: { research: 1.4 },
  industrialization: { economy: 1.5 },
  steamPower: { economy: 0.7 },
  railroad: { economy: 0.8 },
  rifling: { military: 1.1, defend: 0.5 },
  conscription: { military: 0.6, attack: 0.5 },
  steelworks: { attack: 0.7 },
  electricity: { economy: 1 },
  replaceableParts: { military: 1, defend: 0.5 },
  combustion: { military: 0.8, attack: 0.5 },
  flight: { military: 0.6 },
  oilDrilling: { economy: 0.6 },
  refrigeration: { economy: 0.5 },
  electronics: { economy: 0.7, research: 0.6 },
  computers: { research: 1.2, military: 0.5 },
  plastics: { economy: 0.4 },
  composites: { military: 0.6 },
  networks: { research: 1.2 },
  robotics: { military: 0.8, defend: 0.6 },
  fusion: { economy: 1 },
  // Künstliche Intelligenz entfesselt die Maschine – nur ganz zum Schluss
  artificialIntelligence: { research: 0.1 },
};

/** Welche bekannten Ressourcen liegen im oder am eigenen Gebiet? */
function nearbyResources(ctx: AiContext): Set<ResourceId> {
  const out = new Set<ResourceId>();
  const grid = ctx.view.grid;
  for (const s of ctx.view.ownSettlements()) {
    for (const t of grid.range(s.tile, 2)) {
      const tile = ctx.view.knownTile(t);
      if (tile?.resource && RESOURCES[tile.resource].revealEra <= ctx.player.era) out.add(tile.resource);
    }
  }
  return out;
}

function coastal(ctx: AiContext): boolean {
  const grid = ctx.view.grid;
  return ctx.view.ownSettlements().some((s) => grid.range(s.tile, 1).some((t) => isWater(ctx.state.map.tiles[t])));
}

/** Situative Zusatzbewertung einer Technologie. */
function situational(ctx: AiContext, tech: string, res: Set<ResourceId>, isCoastal: boolean): number {
  switch (tech) {
    case 'agriculture':
      return 2;
    case 'pottery':
      return 0.8 + (res.has('clay') || res.has('cotton') ? 0.5 : 0);
    case 'fishing':
      return isCoastal ? 0.9 : -0.6;
    case 'sailing':
    case 'shipbuilding':
    case 'navigation':
    case 'navigation2':
      return isCoastal ? 0 : -0.5;
    case 'mining':
      return res.has('copper') || res.has('flint') ? 0.8 : 0.2;
    case 'animalHusbandry':
      return res.has('sheep') || res.has('horses') ? 0.6 : 0;
    case 'writing':
      return ctx.view.ownSettlements().length >= 2 ? 0.5 : 0;
    case 'artificialIntelligence':
      return -5;
    default:
      return 0;
  }
}

/** Wählt die nächste Technologie nach den aktuellen Zielgewichten. */
export function chooseResearch(ctx: AiContext): string | null {
  const options = availableTechs(ctx.state, ctx.pid);
  if (!options.length) return null;
  const res = nearbyResources(ctx);
  const isCoastal = coastal(ctx);
  const g = ctx.goals;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const t of options) {
    const tags = TECH_TAGS[t.id] ?? { economy: 0.5, research: 0.3 };
    let score = 0;
    for (const [goal, w] of Object.entries(tags) as [GoalId, number][]) score += (g[goal] ?? 0) * w;
    score += situational(ctx, t.id, res, isCoastal);
    // Technologien des aktuellen Zeitalters bringen den Aufstieg näher; ältere sind günstiger
    score += (ctx.player.era - t.era) * 0.4;
    if (score > bestScore || (score === bestScore && best !== null && t.id < best)) {
      bestScore = score;
      best = t.id;
    }
  }
  return best;
}

export function manageResearch(ctx: AiContext): void {
  if (ctx.player.research.current) return;
  // Mehrere Technologien können in einem Zug abgeschlossen werden (gesammelte Punkte)
  for (let i = 0; i < 4 && !ctx.player.research.current; i++) {
    const tech = chooseResearch(ctx);
    if (!tech || !ctx.issue({ type: 'setResearch', tech })) break;
  }
}

/** Einfluss, der für Gründungen und Aufwertungen zurückgehalten wird. */
export function influenceReserve(ctx: AiContext): number {
  const founders = ctx.view.ownUnits().filter(isFounder).length;
  const settlements = ctx.view.ownSettlements();
  let reserve = founders > 0 && settlements.length > 0 ? campCost(ctx.state, ctx.pid) : 0;
  if (settlements.some((s) => s.kind === 'camp') && hasTech(ctx.state, ctx.pid, 'agriculture')) reserve = Math.max(reserve, 15);
  return reserve;
}

const POLICY_TAGS: Record<string, TechTag> = {
  elders: { expand: 1, research: 0.3 },
  hunters: { economy: 1, expand: 0.3 },
  warband: { attack: 1, military: 0.5 },
  craftsmen: { economy: 1.1 },
  roads: { economy: 0.5 },
  scribes: { research: 1.2 },
  tribute: { economy: 0.9 },
  legions: { military: 1 },
  expansion: { attack: 0.8 },
  serfdom: { economy: 1.1 },
  scholasticism: { research: 1.2 },
  mercantilism: { economy: 1.1 },
  enlightenment: { research: 1.2 },
  assembly: { economy: 1.2 },
  welfare: { economy: 1, expand: 0.5 },
  propaganda: { expand: 0.8 },
  automation: { economy: 1.2 },
  opensource: { research: 1.3 },
};

/** Führt Politiken ein, wenn Einfluss und freie Plätze vorhanden sind. */
export function managePolicies(ctx: AiContext): void {
  const p = ctx.player;
  const slots = ERAS[p.era].policySlots;
  if (p.policies.length >= slots) return;
  const reserve = influenceReserve(ctx);
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const def of Object.values(POLICIES)) {
    if (p.policies.includes(def.id) || def.era > p.era || !hasTech(ctx.state, ctx.pid, def.tech)) continue;
    if (p.influence - def.cost < reserve) continue;
    const tags = POLICY_TAGS[def.id] ?? { economy: 0.5 };
    let score = def.era * 0.3;
    for (const [goal, w] of Object.entries(tags) as [GoalId, number][]) score += (ctx.goals[goal] ?? 0) * w;
    if (score > bestScore) {
      bestScore = score;
      best = def.id;
    }
  }
  if (best) ctx.issue({ type: 'adoptPolicy', policy: best });
}
