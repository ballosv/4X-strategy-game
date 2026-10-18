import { BUILDINGS } from '../core/data/buildings';
import { ELEVATION_NAMES, FEATURES, RESOURCES, TERRAIN } from '../core/data/terrain';
import { GOODS, type GoodId } from '../core/data/goods';
import { IMPROVEMENTS } from '../core/data/improvements';
import { unitType } from '../core/data/units';
import { gridOf } from '../core/context';
import type { Command, UnitActionId } from '../core/game';
import { isWater } from '../core/map/passability';
import { settlementAt, totalPop, type GameState, type Settlement, type Unit } from '../core/state';
import { experienceLevel, unitStrength } from '../core/systems/combat';
import {
  canUpgradeImprovement,
  growthThreshold,
  housingOf,
  improvementJobs,
  improvementOptions,
  improvementYield,
  itemCost,
} from '../core/systems/economy';
import { maxMoves } from '../core/systems/movement';
import { KIND_NAMES, UPGRADE_COST, campCost, canFoundAt, canPromote, canUpgradeSettlement } from '../core/systems/settlements';
import { drawUnitFigure } from '../render/units';
import { h } from './dom';
import { costText, fmt, signed, stockText } from './format';
import { CONNECTION_NAMES, ROAD_WORK, canBuildRoad } from '../core/systems/transport';

export interface PanelHost {
  state: GameState;
  viewer: number;
  command(cmd: Command): boolean;
  openBuild(settlementId: number, tab?: string): void;
  select(sel: { kind: 'tile'; tile: number } | { kind: 'settlement'; id: number } | { kind: 'unit'; id: number }): void;
  toggleMoveMode(): void;
  moveMode: boolean;
}

const STATUS_NAMES: Record<Unit['status'], string> = {
  ready: 'Bereit',
  fortified: 'Befestigt',
  sentry: 'Wache',
  skip: 'Wartet',
  exploring: 'Erkundet',
  autoRoad: 'Baut Straßen',
};

function portrait(type: string, color: string): HTMLElement {
  const c = h('canvas', { width: 232, height: 232 });
  const ctx = c.getContext('2d')!;
  ctx.scale(3.4, 3.4);
  drawUnitFigure(ctx, type, color, 34, 64);
  return h('div', { class: 'portrait' }, c);
}

function action(icon: string, label: string, onclick: () => void, opts: { disabled?: boolean; active?: boolean; title?: string } = {}): HTMLElement {
  return h('button', { class: `btn action ${opts.active ? 'active' : ''}`, disabled: opts.disabled, title: opts.title, onclick }, h('span', { class: 'icon' }, icon), label);
}

// ---------------------------------------------------------------------------
// Einheit

export function unitPanel(host: PanelHost, unit: Unit): [HTMLElement, HTMLElement] {
  const { state } = host;
  const def = unitType(unit.type);
  const owner = state.players[unit.owner];
  const own = unit.owner === host.viewer && state.currentPlayer === host.viewer;
  const strength = def.strength > 0 ? unitStrength(state, unit, 'defend') : null;
  const tile = state.map.tiles[unit.tile];
  const level = experienceLevel(unit.xp);
  const status = unit.work ? `Baut ${ROAD_WORK[unit.work.kind].name} (${unit.work.turnsLeft} R.)` : unit.destination !== null ? 'Unterwegs' : unit.movesLeft <= 0 && own ? 'Erschöpft' : STATUS_NAMES[unit.status];
  const bonuses: string[] = [];
  if (def.hillBonus) bonuses.push(`+${def.hillBonus} auf Hügeln`);
  if (def.versus) bonuses.push(`+${def.versus.bonus} gegen ${def.versus.unitClass === 'cavalry' ? 'Kavallerie' : 'Maschinen'}`);
  if (def.domain === 'land' && isWater(tile)) bonuses.push('Eingeschifft');
  for (const p of strength?.parts.slice(1) ?? []) if (!bonuses.some((b) => b.includes(p.label))) bonuses.push(`${p.value > 0 ? '+' : ''}${p.value} ${p.label}`);

  const main = h(
    'div',
    { class: 'ctx-main' },
    portrait(unit.type, owner.color),
    h(
      'div',
      { class: 'col', style: 'min-width:180px' },
      h('h2', { class: 'ctx-title' }, def.name),
      h('div', { class: 'ctx-sub' }, `${def.typeName}${unit.owner !== host.viewer ? ` · ${owner.name}` : ''}`),
      h('div', { style: 'display:flex;align-items:center;gap:8px' }, '❤️', h('div', { class: 'hpbar' }, h('div', { style: `width:${unit.hp}%` })), `${unit.hp}/100`),
      h('div', { style: 'margin-top:6px' }, 'Zustand: ', h('b', { style: `color:${status === 'Bereit' ? 'var(--good)' : 'var(--text)'}` }, status)),
      h('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:8px;font-size:13px' }, `Erfahrung ${level}`, h('div', { class: 'progress', style: 'width:100px' }, h('div', { style: `width:${((unit.xp % 15) / 15) * 100}%` }))),
    ),
    h(
      'div',
      { class: 'stats' },
      h('span', { class: 'k' }, '👢 Bewegung'), h('span', { class: 'v' }, `${fmt(unit.movesLeft, 1)}/${maxMoves(state, unit)}`),
      def.strength > 0 ? [h('span', { class: 'k' }, '⚔️ Stärke'), h('span', { class: 'v' }, String(strength?.total ?? def.strength))] : null,
      def.rangedStrength ? [h('span', { class: 'k' }, '🏹 Fernkampf'), h('span', { class: 'v' }, `${def.rangedStrength} (${def.range})`)] : null,
      h('span', { class: 'k' }, '👁️ Sicht'), h('span', { class: 'v' }, String(def.sight)),
      h('span', { class: 'k' }, '🪙 Unterhalt'), h('span', { class: 'v' }, String(def.upkeep)),
      bonuses.length ? h('div', { style: 'grid-column:1/3;margin-top:4px' }, bonuses.map((b) => h('span', { class: 'pill' }, b))) : null,
    ),
  );

  const actions: HTMLElement[] = [];
  if (own) {
    const act = (id: UnitActionId) => () => host.command({ type: 'unitAction', unitId: unit.id, action: id });
    actions.push(action('👣', 'Bewegen', () => host.toggleMoveMode(), { active: host.moveMode, disabled: unit.movesLeft <= 0 }));
    if (def.abilities.includes('foundCamp') || def.abilities.includes('foundSettlement')) {
      const err = canFoundAt(state, unit.owner, unit.tile);
      const cost = campCost(state, unit.owner);
      const settle = def.abilities.includes('foundSettlement');
      actions.push(action(settle ? '🏘️' : '⛺', settle ? 'Siedlung gründen' : 'Lager errichten', act(settle ? 'foundSettlement' : 'foundCamp'), { disabled: !!err, title: err ?? (cost ? `Kostet ${cost} Einfluss` : 'Kostenlos') }));
    }
    if (def.abilities.includes('buildRoad')) {
      const roadErr = canBuildRoad(state, unit, 'road');
      const railErr = canBuildRoad(state, unit, 'rail');
      actions.push(action('🛤️', 'Straße bauen', act('buildRoad'), { disabled: !!roadErr || unit.movesLeft <= 0, title: roadErr ?? `${ROAD_WORK.road.turns} Runden · ${stockText(ROAD_WORK.road.goods)}` }));
      if (state.players[unit.owner].techs.includes('railroad')) actions.push(action('🚂', 'Eisenbahn bauen', act('buildRail'), { disabled: !!railErr || unit.movesLeft <= 0, title: railErr ?? `${ROAD_WORK.rail.turns} Runden · ${stockText(ROAD_WORK.rail.goods)}` }));
      actions.push(action('🔗', 'Siedlungen verbinden', act('autoRoad'), { active: unit.status === 'autoRoad', title: 'Baut automatisch Straßen zwischen Siedlungen und Hauptstadt' }));
    }
    if (def.strength > 0) actions.push(action('🛡️', 'Befestigen', act('fortify'), { active: unit.status === 'fortified' }));
    actions.push(action('👁️', 'Wachen', act('sentry'), { active: unit.status === 'sentry' }));
    actions.push(action('🧭', 'Erkunden', act('explore'), { active: unit.status === 'exploring' }));
    actions.push(action('➕', 'Heilen', act('heal'), { disabled: unit.hp >= 100 }));
    actions.push(action('⏭️', 'Runde überspringen', act('skip')));
    if (unit.status !== 'ready' || unit.destination !== null) actions.push(action('⏰', 'Aufwecken', act('wake')));
    actions.push(action('✖️', 'Auflösen', () => { if (confirm(`${def.name} wirklich auflösen?`)) host.command({ type: 'unitAction', unitId: unit.id, action: 'disband' }); }));
  }
  const side = h('div', { class: 'ctx-actions' }, h('h3', null, own ? 'Aktionen' : 'Information'), own ? h('div', { class: 'action-grid' }, actions) : h('div', { class: 'hint' }, unit.owner === host.viewer ? 'Nicht am Zug.' : `Gehört zu ${owner.name}.`));
  return [main, side];
}

// ---------------------------------------------------------------------------
// Siedlung

export function settlementPanel(host: PanelHost, s: Settlement): [HTMLElement, HTMLElement] {
  const { state } = host;
  const own = s.owner === host.viewer;
  const owner = state.players[s.owner];
  const r = s.report;
  const pop = totalPop(s.pop);
  const item = s.queue[0];
  const cost = item ? itemCost(state, s, item) : null;
  const turnsLeft = cost && r.laborFree > 0 ? Math.ceil(Math.max(0, cost.labor - s.laborProgress) / r.laborFree) : null;

  const foodBox = (g: 'grain' | 'vegetables' | 'meat', icon: string, label: string) =>
    h('div', { class: `food ${r.foodHave[g] < r.foodNeed[g] ? 'short' : ''}` }, `${icon} ${label} `, h('b', null, `${fmt(r.foodHave[g], 1)} / ${r.foodNeed[g]}`));

  const main = h(
    'div',
    { class: 'ctx-main' },
    h(
      'div',
      { class: 'col', style: 'min-width:200px' },
      h('h2', { class: 'ctx-title' }, `${s.isCapital ? '★ ' : ''}${s.name}`),
      h('div', { class: 'ctx-sub' }, `${KIND_NAMES[s.kind]}${own ? '' : ` · ${owner.name}`} · ❤️ ${s.hp}/100`),
      h('div', { class: 'stats', style: 'min-width:0' },
        h('span', { class: 'k' }, '👥 Bevölkerung'), h('span', { class: 'v' }, `${pop} / ${housingOf(s)}`),
        h('span', { class: 'k' }, 'Arbeiter · Bürger · Gelehrte'), h('span', { class: 'v' }, `${s.pop.workers} · ${s.pop.citizens} · ${s.pop.scholars}`),
        own ? [h('span', { class: 'k' }, '🔨 Arbeitskraft'), h('span', { class: 'v' }, `${r.laborFree} frei / ${r.laborTotal}`)] : null,
        own ? [h('span', { class: 'k' }, '🌱 Wachstum'), h('span', { class: 'v' }, `${fmt(s.food)} / ${growthThreshold(pop)} (${signed(r.foodSurplus, 1)})`)] : null,
        own ? [h('span', { class: 'k' }, '🚚 Transport'), h('span', { class: 'v' }, s.isCapital ? 'Hauptstadt' : `${r.transport} / Runde`)] : null,
        own && !s.isCapital ? [h('span', { class: 'k' }, '🛤️ Anbindung'), h('span', { class: 'v', style: r.connection === 'none' ? 'color:var(--danger)' : '' }, CONNECTION_NAMES[r.connection ?? 'none'])] : null,
      ),
    ),
    own
      ? h(
          'div',
          { class: 'col', style: 'min-width:240px;flex:1' },
          h('div', { class: 'section-title' }, 'Nahrungsversorgung'),
          h('div', { class: 'food-row' }, foodBox('grain', '🌾', 'Getreide'), foodBox('vegetables', '🥕', 'Gemüse'), foodBox('meat', '🐟', 'Fisch/Fleisch')),
          h('div', { class: 'section-title' }, 'Bauauftrag'),
          item && cost
            ? h(
                'div',
                { class: 'queue' },
                h('div', { class: 'queue-item' }, h('span', null, cost.name), h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, (s.laborProgress / cost.labor) * 100)}%` })), h('span', { style: 'color:var(--muted)' }, turnsLeft !== null ? `${turnsLeft} R.` : '–')),
                r.stalled ? h('span', { class: 'pill warn' }, `⚠ ${r.stalled}`) : null,
                s.queue.length > 1 ? h('div', { class: 'hint' }, `Danach: ${s.queue.slice(1).map((q) => itemCost(state, s, q).name).join(', ')}`) : null,
              )
            : h('div', { class: 'hint' }, 'Kein Bauauftrag – Arbeitskraft wird nur für Felder genutzt.'),
          s.buildings.length ? h('div', { style: 'margin-top:6px' }, s.buildings.map((b) => h('span', { class: 'pill' }, `${BUILDINGS[b].icon} ${BUILDINGS[b].name}`))) : null,
        )
      : null,
  );

  const side = h('div', { class: 'ctx-actions' }, h('h3', null, own ? 'Verwaltung' : 'Information'));
  if (own && state.currentPlayer === host.viewer) {
    const upErr = canUpgradeSettlement(state, s);
    const target = s.kind === 'camp' ? 'settlement' : 'city';
    const promoteErr = canPromote(state, s, 'citizens');
    const scholarErr = canPromote(state, s, 'scholars');
    side.append(
      h(
        'div',
        { class: 'action-grid' },
        action('🏗️', 'Bauen / Rekrutieren', () => host.openBuild(s.id)),
        action('🗺️', 'Felder', () => host.openBuild(s.id, 'improvements')),
        action('👷', 'Arbeitskraft', () => host.openBuild(s.id, 'labor')),
        s.kind !== 'city' ? action('⬆️', `Zur ${KIND_NAMES[target]}`, () => host.command({ type: 'upgradeSettlement', settlementId: s.id }), { disabled: !!upErr, title: upErr ?? `${UPGRADE_COST[target].influence} Einfluss` }) : null,
        action('🎩', 'Bürger ausbilden', () => host.command({ type: 'promote', settlementId: s.id, to: 'citizens' }), { disabled: !!promoteErr, title: promoteErr ?? '+1,5 Gold, +0,5 Einfluss je Bürger' }),
        action('📜', 'Gelehrte ausbilden', () => host.command({ type: 'promote', settlementId: s.id, to: 'scholars' }), { disabled: !!scholarErr, title: scholarErr ?? '+2 Entwicklung je Gelehrtem' }),
        action('⚖️', 'Fokus', () => {
          const order: Settlement['focus'][] = ['balanced', 'food', 'production', 'construction'];
          host.command({ type: 'setFocus', settlementId: s.id, focus: order[(order.indexOf(s.focus) + 1) % order.length] });
        }, { title: 'Arbeitskraft-Schwerpunkt wechseln' }),
      ),
      h('div', { class: 'hint', style: 'margin-top:8px' }, `Fokus: ${FOCUS_NAMES[s.focus]}`),
    );
  } else if (!own) {
    side.append(h('div', { class: 'hint' }, `Siedlung von ${owner.name}.`));
  }
  return [main, side];
}

export const FOCUS_NAMES: Record<Settlement['focus'], string> = {
  balanced: 'Ausgewogen',
  food: 'Nahrung & Wachstum',
  production: 'Rohstoffe & Waren',
  construction: 'Bauaufträge',
};

// ---------------------------------------------------------------------------
// Geländefeld

export function tilePanel(host: PanelHost, tileIdx: number): [HTMLElement, HTMLElement] {
  const { state } = host;
  const t = state.map.tiles[tileIdx];
  const grid = gridOf(state);
  const imp = state.improvements[tileIdx];
  const ownerSid = state.tileOwner[tileIdx];
  const ownerSettlement = ownerSid >= 0 ? state.settlements[ownerSid] : undefined;
  const own = ownerSettlement?.owner === host.viewer;
  const water = isWater(t);
  const res = t.resource && RESOURCES[t.resource].revealEra <= state.players[host.viewer].era ? RESOURCES[t.resource] : null;
  const riverText = t.river ? 'Fluss' : null;
  const nearbySettlement = settlementAt(state, tileIdx);

  const yieldText = (y: Partial<Record<GoodId, number>>) =>
    (Object.entries(y) as [GoodId, number][]).filter(([, v]) => v > 0).map(([g, v]) => `${GOODS[g].icon} ${fmt(v, 1)}`).join('  ');

  const main = h(
    'div',
    { class: 'ctx-main' },
    h(
      'div',
      { class: 'col', style: 'min-width:220px' },
      h('h2', { class: 'ctx-title' }, `${TERRAIN[t.terrain].name}${t.feature ? ` · ${FEATURES[t.feature].name}` : ''}`),
      h('div', { class: 'ctx-sub' }, water ? 'Wasserfeld' : `Höhe ${t.elevation}: ${ELEVATION_NAMES[t.elevation]}`),
      h('div', null,
        res ? h('span', { class: 'pill ok' }, `Ressource: ${res.name}`) : null,
        riverText ? h('span', { class: 'pill' }, '💧 Fluss') : null,
        state.roads?.[tileIdx] ? h('span', { class: 'pill' }, state.roads[tileIdx] >= 2 ? '🚂 Eisenbahn' : '🛤️ Straße') : null,
        ownerSettlement ? h('span', { class: 'pill' }, `Gebiet: ${ownerSettlement.name}`) : h('span', { class: 'pill' }, 'Niemandsland'),
        state.curiosities.includes(tileIdx) ? h('span', { class: 'pill ok' }, '✨ Kuriosität') : null,
      ),
      h('div', { class: 'hint', style: 'margin-top:6px' }, `Feld ${grid.col(tileIdx)}/${grid.row(tileIdx)}`),
    ),
    imp
      ? h(
          'div',
          { class: 'col' },
          h('div', { class: 'section-title' }, 'Ausbau'),
          h('div', { style: 'font-size:16px' }, `${IMPROVEMENTS[imp.type].icon} ${IMPROVEMENTS[imp.type].name} (Stufe ${imp.level})`),
          h('div', { class: 'hint' }, `Ertrag je Arbeitskraft: ${yieldText(improvementYield(state, tileIdx, imp.type, imp.level, ownerSettlement?.owner ?? host.viewer))}`),
          ownerSettlement && own ? h('div', { class: 'hint' }, `Arbeitsplätze: ${ownerSettlement.report.jobs[`t${tileIdx}`] ?? 0} / ${improvementJobs(IMPROVEMENTS[imp.type], imp.level)} besetzt`) : null,
        )
      : null,
  );

  const side = h('div', { class: 'ctx-actions' }, h('h3', null, 'Mögliche Ausbauten'));
  if (own && ownerSettlement && state.currentPlayer === host.viewer && !nearbySettlement) {
    const queued = ownerSettlement.queue.some((q) => (q.kind === 'improvement' || q.kind === 'upgrade') && q.tile === tileIdx);
    if (queued) side.append(h('div', { class: 'hint' }, 'Ausbau ist bereits in Auftrag.'));
    else if (imp) {
      const can = canUpgradeImprovement(state, host.viewer, tileIdx);
      const c = can ? itemCost(state, ownerSettlement, { kind: 'upgrade', tile: tileIdx }) : null;
      side.append(
        can && c
          ? h('button', { class: 'option', onclick: () => host.command({ type: 'enqueue', settlementId: ownerSettlement.id, item: { kind: 'upgrade', tile: tileIdx } }) }, h('span', { class: 'icon' }, '⬆️'), h('div', null, h('div', { class: 'o-name' }, c.name), h('div', { class: 'o-cost' }, costText(c.labor, c.goods))))
          : h('div', { class: 'hint' }, 'Keine weitere Ausbaustufe verfügbar.'),
      );
    } else {
      const opts = improvementOptions(state, host.viewer, tileIdx);
      if (!opts.length) side.append(h('div', { class: 'hint' }, 'Auf diesem Feld ist derzeit kein Ausbau möglich.'));
      side.append(
        h(
          'div',
          { class: 'queue' },
          opts.map((id) => {
            const def = IMPROVEMENTS[id];
            const c = itemCost(state, ownerSettlement, { kind: 'improvement', id, tile: tileIdx });
            return h(
              'button',
              { class: 'option', onclick: () => host.command({ type: 'enqueue', settlementId: ownerSettlement.id, item: { kind: 'improvement', id, tile: tileIdx } }) },
              h('span', { class: 'icon' }, def.icon),
              h('div', null, h('div', { class: 'o-name' }, def.name), h('div', { class: 'o-cost' }, `${yieldText(improvementYield(state, tileIdx, id, 1, host.viewer))} je AK · ${def.jobs} Plätze`), h('div', { class: 'o-cost' }, costText(c.labor, c.goods))),
            );
          }),
        ),
      );
    }
  } else if (nearbySettlement) {
    side.append(h('button', { class: 'btn', onclick: () => host.select({ kind: 'settlement', id: nearbySettlement.id }) }, 'Siedlung anzeigen'));
  } else {
    side.append(h('div', { class: 'hint' }, ownerSettlement ? 'Fremdes Gebiet.' : 'Nur Felder im Gebiet eigener Siedlungen können ausgebaut werden.'));
  }
  return [main, side];
}
