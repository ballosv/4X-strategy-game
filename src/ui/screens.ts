import { BUILDINGS } from '../core/data/buildings';
import { CIVS, ORIENTATION_NAMES, TRAITS } from '../core/data/civs';
import { ERAS } from '../core/data/eras';
import { GOODS, GOOD_IDS, stockOf, type GoodId } from '../core/data/goods';
import { IMPROVEMENTS } from '../core/data/improvements';
import { POLICIES } from '../core/data/policies';
import { TECHS, techCost, techsOfEra } from '../core/data/techs';
import { UNIT_TYPES } from '../core/data/units';
import { gridOf } from '../core/context';
import { ENVOY_COST, canTrade, currentScores, marketPrices, policyCost, type Command } from '../core/game';
import { ELEVATION_NAMES, TERRAIN } from '../core/data/terrain';
import { isAtWar, playerSettlements, playerUnits, totalPop, type GameState, type Settlement } from '../core/state';
import { canBuildBuilding, canTrainUnit, canUpgradeImprovement, collectJobs, improvementOptions, itemCost, ownedTiles } from '../core/systems/economy';
import { MILESTONES, score } from '../core/systems/legacy';
import { canResearch, eraProgress } from '../core/systems/research';
import { AGREEMENT_GOLD, canProposeAgreement, hasAgreement, maxTradeRoutes, routeYield, routesOf } from '../core/systems/trade';
import { h } from './dom';
import { costText, fmt } from './format';

export interface ScreenHost {
  state: GameState;
  viewer: number;
  command(cmd: Command): boolean;
  close(): void;
  rerender(): void;
  focusTile(tile: number): void;
}

export function modal(title: string, host: ScreenHost, body: HTMLElement, headExtra?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'overlay', onclick: (e: Event) => { if (e.target === e.currentTarget) host.close(); } },
    h('div', { class: 'modal' }, h('div', { class: 'modal-head' }, h('h2', null, title), headExtra ?? null, h('button', { class: 'btn', onclick: () => host.close() }, '✕')), h('div', { class: 'modal-body' }, body)),
  );
}

function tabs(current: string, entries: [string, string][], set: (t: string) => void): HTMLElement {
  return h('div', { class: 'tabs' }, entries.map(([id, label]) => h('button', { class: `btn ${id === current ? 'active' : ''}`, onclick: () => set(id) }, label)));
}

// ---------------------------------------------------------------------------
// Bauen / Rekrutieren

export function buildScreen(host: ScreenHost, s: Settlement, tab: string, setTab: (t: string) => void): HTMLElement {
  const { state } = host;
  const option = (icon: string, name: string, cost: string, why: string | null, onclick: () => void, extra?: string) =>
    h('div', { class: `option ${why ? 'disabled' : ''}`, onclick: why ? undefined : onclick }, h('span', { class: 'icon' }, icon), h('div', null, h('div', { class: 'o-name' }, name), h('div', { class: 'o-cost' }, cost), extra ? h('div', { class: 'o-cost' }, extra) : null, why ? h('div', { class: 'o-why' }, why) : null));

  let body: HTMLElement;
  if (tab === 'units') {
    const list = Object.values(UNIT_TYPES)
      .filter((u) => !u.machineOnly)
      .map((u) => ({ u, why: canTrainUnit(state, s, u.id) }))
      .filter(({ why, u }) => !why || why === 'Technologie fehlt' ? u.era <= state.players[s.owner].era + 1 : !why.startsWith('Ersetzt') && why !== 'Veraltet');
    body = h(
      'div',
      { class: 'list' },
      list.map(({ u, why }) => {
        const c = itemCost(state, s, { kind: 'unit', id: u.id });
        return option(u.icon, u.name, costText(c.labor, c.goods, c.popCost), why === 'Technologie fehlt' ? `Benötigt ${TECHS[u.tech!]?.name}` : why, () => { host.command({ type: 'enqueue', settlementId: s.id, item: { kind: 'unit', id: u.id } }); host.rerender(); }, `${u.typeName} · Stärke ${u.rangedStrength ? `${u.strength}/${u.rangedStrength}` : u.strength} · Bewegung ${u.moves}`);
      }),
    );
  } else if (tab === 'buildings') {
    const list = Object.values(BUILDINGS)
      .map((b) => ({ b, why: canBuildBuilding(state, s, b.id) }))
      .filter(({ b, why }) => why !== 'Bereits vorhanden' && (!b.tech || (TECHS[b.tech]?.era ?? 0) <= state.players[s.owner].era + 1));
    body = h(
      'div',
      null,
      s.buildings.length ? h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'section-title' }, 'Vorhanden'), s.buildings.map((b) => h('span', { class: 'pill' }, `${BUILDINGS[b].icon} ${BUILDINGS[b].name}`))) : null,
      h(
        'div',
        { class: 'list' },
        list.map(({ b, why }) => {
          const c = itemCost(state, s, { kind: 'building', id: b.id });
          return option(b.icon, b.name, costText(c.labor, c.goods), why === 'Technologie fehlt' ? `Benötigt ${TECHS[b.tech!]?.name}` : why, () => { host.command({ type: 'enqueue', settlementId: s.id, item: { kind: 'building', id: b.id } }); host.rerender(); }, `${b.description}${b.upkeep ? ` · Unterhalt ${b.upkeep}` : ''}`);
        }),
      ),
    );
  } else if (tab === 'improvements') {
    const grid = gridOf(state);
    const rows = ownedTiles(state, s.id)
      .filter((t) => t !== s.tile)
      .map((t) => {
        const tile = state.map.tiles[t];
        const imp = state.improvements[t];
        const opts = imp ? [] : improvementOptions(state, s.owner, t);
        const queued = s.queue.some((q) => (q.kind === 'improvement' || q.kind === 'upgrade') && q.tile === t);
        return h(
          'tr',
          null,
          h('td', null, h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); host.focusTile(t); } }, `${TERRAIN[tile.terrain].name}${tile.elevation > 1 ? ` (${ELEVATION_NAMES[tile.elevation]})` : ''}`), h('div', { class: 'hint' }, `${grid.col(t)}/${grid.row(t)}${tile.resource ? ` · ${tile.resource}` : ''}`)),
          h('td', null, imp ? `${IMPROVEMENTS[imp.type].icon} ${IMPROVEMENTS[imp.type].name} ${imp.level}` : '–', imp ? h('div', { class: 'hint' }, `${s.report.jobs[`t${t}`] ?? 0} besetzt`) : null),
          h(
            'td',
            null,
            queued
              ? h('span', { class: 'pill' }, 'in Auftrag')
              : imp
                ? canUpgradeImprovement(state, s.owner, t)
                  ? h('button', { class: 'btn small', onclick: () => { host.command({ type: 'enqueue', settlementId: s.id, item: { kind: 'upgrade', tile: t } }); host.rerender(); } }, '⬆️ Ausbauen')
                  : null
                : opts.map((id) => h('button', { class: 'btn small', style: 'margin:2px', onclick: () => { host.command({ type: 'enqueue', settlementId: s.id, item: { kind: 'improvement', id, tile: t } }); host.rerender(); } }, `${IMPROVEMENTS[id].icon} ${IMPROVEMENTS[id].name}`)),
          ),
        );
      });
    body = h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Feld'), h('th', null, 'Ausbau'), h('th', null, 'Möglich')), rows);
  } else if (tab === 'labor') {
    body = laborTable(host, s);
  } else {
    body = h('div', null);
  }

  const queue = h(
    'div',
    { class: 'card', style: 'margin-bottom:12px' },
    h('div', { class: 'section-title' }, `Bauliste · ${s.report.laborFree} Arbeitskraft frei je Runde`),
    s.queue.length
      ? h(
          'div',
          { class: 'queue' },
          s.queue.map((q, i) => {
            const c = itemCost(state, s, q);
            return h(
              'div',
              { class: 'queue-item' },
              h('span', null, `${i + 1}. ${c.name}`),
              i === 0 ? h('div', { class: 'bar' }, h('div', { style: `width:${Math.min(100, (s.laborProgress / c.labor) * 100)}%` })) : h('div', { style: 'flex:1' }),
              h('span', { class: 'hint', style: 'margin:0' }, costText(c.labor, c.goods, c.popCost)),
              h('button', { class: 'btn small', onclick: () => { host.command({ type: 'dequeue', settlementId: s.id, index: i }); host.rerender(); } }, '✕'),
            );
          }),
        )
      : h('div', { class: 'hint' }, 'Leer'),
  );
  return h('div', null, h('div', { style: 'margin-bottom:12px' }, tabs(tab, [['units', 'Rekrutieren'], ['buildings', 'Gebäude'], ['improvements', 'Felder & Ausbauten'], ['labor', 'Arbeitskraft']], setTab)), queue, body);
}

// ---------------------------------------------------------------------------
// Entwicklung

export function techScreen(host: ScreenHost): HTMLElement {
  const { state } = host;
  const p = state.players[host.viewer];
  const prog = eraProgress(state, host.viewer);
  const current = p.research.current;
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'card', style: 'margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap' },
      h('div', null, h('div', { class: 'section-title' }, 'Zeitalter'), h('b', null, ERAS[p.era].name), h('div', { class: 'hint' }, `Aufstieg: ${prog.done}/${prog.needed} Technologien dieses Zeitalters`)),
      h('div', { style: 'min-width:240px' }, h('div', { class: 'section-title' }, 'Aktuelle Entwicklung'), current ? h('div', null, h('b', null, TECHS[current].name), h('div', { class: 'progress', style: 'margin-top:6px' }, h('div', { style: `width:${Math.min(100, (p.research.progress / techCost(current)) * 100)}%` })), h('div', { class: 'hint' }, `${fmt(p.research.progress)} / ${techCost(current)} · +${fmt(p.lastIncome.research, 1)} je Runde`)) : h('div', { class: 'hint' }, `Keine – ${fmt(p.research.progress)} Punkte gesammelt`)),
    ),
    h(
      'div',
      { class: 'tech-eras' },
      ERAS.map((era) =>
        h(
          'div',
          { class: 'tech-era' },
          h('h3', null, era.name),
          techsOfEra(era.index).map((t) => {
            const done = p.techs.includes(t.id);
            const why = done ? null : canResearch(state, host.viewer, t.id);
            const cls = done ? 'done' : t.id === current ? 'current' : why ? 'locked' : '';
            return h(
              'div',
              { class: `tech ${cls}`, onclick: () => { if (!done && !why) { host.command({ type: 'setResearch', tech: t.id }); host.rerender(); } } },
              h('div', { class: 't-name' }, `${done ? '✓ ' : ''}${t.name}`),
              h('div', { class: 't-desc' }, t.description),
              !done ? h('div', { class: 't-desc' }, why ?? `${techCost(t.id)} Entwicklungspunkte`) : null,
            );
          }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Zivilisation: Übersicht, Politiken, Lager & Handel, Vermächtnisse

export function civScreen(host: ScreenHost, tab: string, setTab: (t: string) => void): HTMLElement {
  const { state } = host;
  const p = state.players[host.viewer];
  const civ = CIVS.find((c) => c.id === p.civId);
  let body: HTMLElement;
  if (tab === 'policies') {
    const slots = ERAS[p.era].policySlots;
    body = h(
      'div',
      null,
      h('div', { class: 'hint', style: 'margin-bottom:10px' }, `Politik-Plätze: ${p.policies.length} / ${slots} · Einfluss: ${fmt(p.influence)}`),
      h(
        'div',
        { class: 'list' },
        Object.values(POLICIES)
          .filter((d) => d.era <= p.era + 1)
          .map((d) => {
            const active = p.policies.includes(d.id);
            const cost = policyCost(d.cost, p.era);
            const locked = (d.tech && !p.techs.includes(d.tech)) || d.era > p.era;
            const why = active ? null : locked ? `Benötigt ${d.tech ? TECHS[d.tech].name : ERAS[d.era].name}` : p.influence < cost ? `Benötigt ${cost} Einfluss` : p.policies.length >= slots ? 'Kein freier Platz (Politik ersetzen)' : null;
            return h(
              'div',
              { class: `option ${why && !active ? 'disabled' : ''}`, style: active ? 'border-color:var(--accent)' : '' },
              h('span', { class: 'icon' }, active ? '✅' : '📜'),
              h(
                'div',
                { style: 'flex:1' },
                h('div', { class: 'o-name' }, d.name),
                h('div', { class: 'o-cost' }, `${d.description} · ${cost} Einfluss`),
                why && !active && why.startsWith('Kein freier') && p.influence >= cost
                  ? h('div', null, p.policies.map((old) => h('button', { class: 'btn small', style: 'margin:3px 3px 0 0', onclick: () => { host.command({ type: 'adoptPolicy', policy: d.id, replace: old }); host.rerender(); } }, `statt ${POLICIES[old].name}`)))
                  : why && !active ? h('div', { class: 'o-why' }, why) : null,
                !why && !active ? h('button', { class: 'btn small primary', style: 'margin-top:4px', onclick: () => { host.command({ type: 'adoptPolicy', policy: d.id }); host.rerender(); } }, 'Einführen') : null,
              ),
            );
          }),
      ),
    );
  } else if (tab === 'stock') {
    const tradeOk = canTrade(state, host.viewer);
    body = h(
      'div',
      null,
      tradeRoutesCard(host),
      h('div', { class: 'hint', style: 'margin-bottom:10px' }, tradeOk ? `Weltmarkt: kaufen und verkaufen. Gold: ${fmt(p.gold)}` : 'Handel mit dem Weltmarkt erfordert die Technologie „Währung“.'),
      h(
        'table',
        { class: 'tbl' },
        h('tr', null, h('th', null, 'Gut'), h('th', null, 'Nationallager'), h('th', null, 'Kaufen'), h('th', null, 'Verkaufen'), h('th', null, '')),
        GOOD_IDS.filter((g) => GOODS[g].category !== 'food' || stockOf(p.stock, g) > 0)
          .filter((g) => stockOf(p.stock, g) > 0 || GOODS[g].basePrice <= 6 + p.era * 3)
          .map((g: GoodId) => {
            const pr = marketPrices(state, host.viewer, g);
            return h(
              'tr',
              null,
              h('td', null, `${GOODS[g].icon} ${GOODS[g].name}`),
              h('td', null, fmt(stockOf(p.stock, g), 1)),
              h('td', null, `${pr.buy} 🪙`),
              h('td', null, `${pr.sell} 🪙`),
              h(
                'td',
                null,
                h('button', { class: 'btn small', disabled: !tradeOk || p.gold < pr.buy, onclick: () => { host.command({ type: 'trade', good: g, amount: 1 }); host.rerender(); } }, '+1'),
                ' ',
                h('button', { class: 'btn small', disabled: !tradeOk || stockOf(p.stock, g) < 1, onclick: () => { host.command({ type: 'trade', good: g, amount: -1 }); host.rerender(); } }, '−1'),
              ),
            );
          }),
      ),
    );
  } else if (tab === 'legacy') {
    const paths = [...new Set(MILESTONES.map((m) => m.path))];
    body = h(
      'div',
      null,
      h('div', { class: 'hint', style: 'margin-bottom:10px' }, `Vermächtnispunkte: ${p.legacy.points} · Gesamtpunktzahl: ${score(state, host.viewer)}`),
      h(
        'div',
        { class: 'list' },
        paths.map((path) =>
          h('div', { class: 'card' }, h('h2', null, path), MILESTONES.filter((m) => m.path === path).map((m) => h('div', { style: `font-size:13px;margin:3px 0;color:${p.legacy.milestones.includes(m.id) ? 'var(--good)' : 'var(--muted)'}` }, `${p.legacy.milestones.includes(m.id) ? '✓' : '○'} ${m.label} (+${m.points})`))),
        ),
      ),
      h('div', { class: 'section-title', style: 'margin-top:14px' }, 'Rangliste'),
      h('table', { class: 'tbl' }, currentScores(state).map(({ player, score: sc }) => h('tr', null, h('td', null, h('span', { class: 'swatch', style: `display:inline-block;width:10px;height:10px;border-radius:3px;background:${player.color};margin-right:6px` }), player.id === host.viewer || knows(state, host.viewer, player.id) ? player.name : 'Unbekannt'), h('td', null, String(sc)), h('td', null, player.alive ? ERAS[player.era].name : 'vernichtet')))),
    );
  } else {
    const settlements = playerSettlements(state, host.viewer);
    body = h(
      'div',
      null,
      civ ? h('div', { class: 'card', style: 'margin-bottom:12px' }, h('h2', null, `${civ.emblem} ${civ.name}`), h('div', null, civ.mentality), h('div', { style: 'margin-top:6px' }, civ.traits.map((t) => h('span', { class: 'pill ok' }, `${TRAITS[t].name}: ${TRAITS[t].description}`)), h('span', { class: 'pill' }, `Ausrichtung: ${ORIENTATION_NAMES[civ.orientation]}`))) : null,
      h(
        'table',
        { class: 'tbl' },
        h('tr', null, h('th', null, 'Siedlung'), h('th', null, 'Einw.'), h('th', null, 'Arbeitskraft'), h('th', null, 'Nahrung'), h('th', null, 'Bauauftrag')),
        settlements.map((s) =>
          h(
            'tr',
            null,
            h('td', null, h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); host.focusTile(s.tile); } }, `${s.isCapital ? '★ ' : ''}${s.name}`)),
            h('td', null, String(totalPop(s.pop))),
            h('td', null, `${s.report.laborFree} frei / ${s.report.laborTotal}`),
            h('td', { style: `color:${s.report.foodSurplus < 0 ? 'var(--danger)' : 'inherit'}` }, fmt(s.report.foodSurplus, 1)),
            h('td', null, s.queue[0] ? itemCost(state, s, s.queue[0]).name : '–', s.report.stalled ? h('div', { class: 'o-why' }, s.report.stalled) : null),
          ),
        ),
      ),
      h('div', { class: 'hint', style: 'margin-top:10px' }, `Einnahmen ${fmt(p.lastIncome.goldIncome, 1)} · Ausgaben ${fmt(p.lastIncome.goldExpenses, 1)} · Einheiten ${playerUnits(state, host.viewer).length}`),
    );
  }
  return h('div', null, h('div', { style: 'margin-bottom:12px' }, tabs(tab, [['overview', 'Übersicht'], ['policies', 'Politiken'], ['stock', 'Lager & Handel'], ['legacy', 'Vermächtnisse']], setTab)), body);
}

/** Hat der Spieler den anderen schon getroffen (Gebiet oder Einheit gesehen)? */
export function knows(state: GameState, viewer: number, other: number): boolean {
  if (viewer === other) return true;
  const explored = state.players[viewer].explored;
  for (const s of Object.values(state.settlements)) if (s.owner === other && explored[s.tile]) return true;
  for (const u of Object.values(state.units)) if (u.owner === other && explored[u.tile]) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Diplomatie

export function diplomacyScreen(host: ScreenHost): HTMLElement {
  const { state } = host;
  const me = state.players[host.viewer];
  const others = state.players.filter((p) => p.id !== host.viewer && p.alive);
  return h(
    'div',
    { class: 'list' },
    others.map((p) => {
      const known = knows(state, host.viewer, p.id);
      const war = isAtWar(state, host.viewer, p.id);
      const civ = CIVS.find((c) => c.id === p.civId);
      return h(
        'div',
        { class: 'card' },
        h('div', { style: 'display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600' }, h('span', { style: `width:14px;height:14px;border-radius:4px;background:${p.color}` }), known ? p.name : 'Unbekanntes Volk'),
        known
          ? h(
              'div',
              null,
              h('div', { class: 'hint' }, p.kind === 'cityState' ? `Stadtstaat · Gunst: ${p.favor[host.viewer] ?? 0}` : p.kind === 'machine' ? 'Die erwachte Maschinenintelligenz' : `${civ ? civ.traits.map((t) => TRAITS[t].name).join(', ') : ''} · ${ERAS[p.era].name}`),
              h('div', { style: 'margin:8px 0' }, h('span', { class: `pill ${war ? 'warn' : 'ok'}` }, war ? '⚔️ Krieg' : '🕊️ Frieden')),
              p.kind !== 'machine'
                ? war
                  ? h('button', { class: 'btn small', onclick: () => { host.command({ type: 'makePeace', target: p.id }); host.rerender(); } }, '🕊️ Frieden schließen')
                  : h('button', { class: 'btn small danger', onclick: () => { if (confirm(`${p.name} den Krieg erklären?`)) { host.command({ type: 'declareWar', target: p.id }); host.rerender(); } } }, '⚔️ Krieg erklären')
                : null,
              (p.kind === 'ai' || p.kind === 'human')
                ? hasAgreement(state, host.viewer, p.id)
                  ? h('button', { class: 'btn small', style: 'margin-left:6px', onclick: () => { host.command({ type: 'cancelAgreement', target: p.id }); host.rerender(); } }, '📜 Abkommen kündigen')
                  : h('button', { class: 'btn small', style: 'margin-left:6px', disabled: !!canProposeAgreement(state, host.viewer, p.id), title: canProposeAgreement(state, host.viewer, p.id) ?? `+${AGREEMENT_GOLD} Gold je Runde für beide, erlaubt Handelsrouten`, onclick: () => { host.command({ type: 'proposeAgreement', target: p.id }); host.rerender(); } }, '🤝 Handelsabkommen anbieten')
                : null,
              hasAgreement(state, host.viewer, p.id) ? h('div', null, h('span', { class: 'pill ok' }, '🤝 Handelsabkommen')) : null,
              p.kind === 'cityState' ? h('button', { class: 'btn small', style: 'margin-left:6px', disabled: me.influence < ENVOY_COST, onclick: () => { host.command({ type: 'sendEnvoy', target: p.id }); host.rerender(); } }, `📯 Gesandter (${ENVOY_COST} Einfluss)`) : null,
              p.kind === 'cityState' ? h('div', { class: 'hint' }, 'Ab 3 Gunst und höchster Gunst aller Spieler liefert der Stadtstaat Güter und Einfluss.') : null,
            )
          : h('div', { class: 'hint' }, 'Noch nicht begegnet.'),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Spielende

export function gameOverScreen(host: ScreenHost, onExit: () => void): HTMLElement {
  const { state } = host;
  const go = state.gameOver!;
  const reason = { lastStanding: 'Nur noch eine Zivilisation ist übrig.', aiDefeated: 'Die KI wurde besiegt!', aiVictory: 'Die KI hat die Menschheit ausgelöscht.', turnLimit: 'Das Rundenlimit wurde erreicht.' }[go.reason];
  const winner = go.winner !== null ? state.players[go.winner] : null;
  return h(
    'div',
    null,
    h('div', { style: 'font-size:18px;margin-bottom:6px' }, reason),
    h('div', { style: 'font-size:28px;font-family:var(--serif);margin-bottom:14px' }, winner ? `🏆 ${winner.name} gewinnt!` : 'Niemand gewinnt.'),
    h('table', { class: 'tbl' }, h('tr', null, h('th', null, 'Spieler'), h('th', null, 'Punkte'), h('th', null, 'Vermächtnis')), Object.entries(go.scores).sort((a, b) => b[1] - a[1]).map(([id, sc]) => h('tr', null, h('td', null, state.players[Number(id)].name), h('td', null, String(sc)), h('td', null, String(state.players[Number(id)].legacy.points))))),
    h('div', { style: 'margin-top:16px;display:flex;gap:8px' }, h('button', { class: 'btn primary', onclick: onExit }, 'Zum Hauptmenü'), h('button', { class: 'btn', onclick: () => host.close() }, 'Karte ansehen')),
  );
}

// ---------------------------------------------------------------------------
// Spielhilfe

export function helpScreen(): HTMLElement {
  const sec = (title: string, ...lines: string[]) => h('div', { class: 'card' }, h('h2', null, title), lines.map((l) => h('p', { style: 'margin:4px 0;font-size:14px;line-height:1.45' }, l)));
  return h(
    'div',
    { class: 'list', style: 'grid-template-columns:repeat(auto-fill,minmax(300px,1fr))' },
    sec('Ziel', 'Führe dein Volk von der Steinzeit bis in die nahe Zukunft. Meilensteine bringen Vermächtnispunkte – wer am Ende die meisten Punkte hat, gewinnt.', 'Wird die Künstliche Intelligenz erforscht, erwacht „Die KI“ als gemeinsamer Gegner. Wird sie besiegt oder bleibt nur ein Volk übrig, endet das Spiel.'),
    sec('Erste Schritte', 'Dein Stamm errichtet mit „Lager errichten“ das erste Lager. Der Späher erkundet die Umgebung (Kuriositäten ✨ geben Belohnungen).', 'Wähle unter „Entwicklung“ eine Technologie. Baue im Lager Ausbauten auf den umliegenden Feldern: ohne Sammlerplatz oder Jagdlager wächst das Lager kaum.'),
    sec('Höhen & Bewegung', 'Felder haben Höhenstufen 0–5. Unterscheiden sich Nachbarfelder um 2 oder mehr Stufen, liegt dazwischen eine unpassierbare Klippe – nutze Rampen und Pässe.', 'Bergauf kostet +1 Bewegung, Hochgebirge ist unpassierbar. Erhöhte Positionen geben mehr Sicht und Kampfbonus.'),
    sec('Arbeitskraft & Wirtschaft', 'Jeder Arbeiter liefert 1 Arbeitskraft (AK). Ausbauten bieten Arbeitsplätze und erzeugen je AK Güter. Freie AK fließt in Bauaufträge.', 'Rohstoffe gelangen über die Transportkapazität der Siedlung ins Nationallager. Gebäude wie Werkzeugmacher oder Sägegrube verarbeiten sie zu Waren (Produktionsketten).'),
    sec('Nahrung & Wachstum', 'Jeder Einwohner braucht 1 Nahrung: halb Getreide, je ein Viertel Gemüse und Fisch/Fleisch. Ist alles gedeckt, wächst die Siedlung schneller.', 'Bürger bringen Gold und Einfluss, Gelehrte Entwicklungspunkte – beide brauchen weiterhin Nahrung.'),
    sec('Einfluss', 'Einfluss brauchst du für neue Lager, das Aufwerten Lager → Siedlung → Stadt, Politiken und Gesandte zu Stadtstaaten.'),
    sec('Kampf', 'Rot markierte Felder können angegriffen werden. Stärke, Gelände, Befestigung und Höhenunterschied (±3 je Stufe) entscheiden. Siedlungen werden durch Nahkämpfer erobert.'),
    sec('Steuerung', 'Ziehen: Karte bewegen · Zwei Finger / Mausrad: Zoom · Tippen: Auswahl.', 'Einheit gewählt: Tippen auf blaues Feld = Bewegen, rotes Feld = Angriff, weiter entferntes Feld zweimal tippen = Marschbefehl. Rechtsklick (PC) bewegt direkt.', 'Tasten: Eingabe = Runde beenden, Leertaste = Einheit überspringen, F = befestigen, WASD/Pfeile = Karte, +/− = Zoom.'),
  );
}

/** Verteilung der Arbeitskraft auf Arbeitsplätze: automatisch oder fest vorgegeben. */
function laborTable(host: ScreenHost, s: Settlement): HTMLElement {
  const { state } = host;
  const jobs = collectJobs(state, s);
  const r = s.report;
  const yieldText = (y: Partial<Record<GoodId, number>>) =>
    (Object.entries(y) as [GoodId, number][]).filter(([, v]) => v > 0).map(([g, v]) => `${GOODS[g].icon} ${fmt(v, 1)}`).join(' ');
  const set = (key: string, count: number | null) => {
    host.command({ type: 'setJob', settlementId: s.id, key, count });
    host.rerender();
  };
  return h(
    'div',
    null,
    h(
      'div',
      { class: 'hint', style: 'margin-bottom:10px' },
      `Arbeitskraft: ${r.laborTotal} gesamt · ${r.laborBound} gebunden · ${r.laborFree} frei für Bauaufträge. `,
      'Automatische Plätze verteilt die Verwaltung nach Bedarf (zuerst Nahrung). Feste Plätze haben Vorrang.',
    ),
    jobs.length
      ? h(
          'table',
          { class: 'tbl' },
          h('tr', null, h('th', null, 'Arbeitsplatz'), h('th', null, 'Ertrag je AK'), h('th', null, 'Verbrauch je AK'), h('th', null, 'Besetzt'), h('th', null, 'Steuerung')),
          jobs.map((j) => {
            const fixed = s.jobOverrides?.[j.key];
            const cur = r.jobs[j.key] ?? 0;
            return h(
              'tr',
              null,
              h('td', null, `${j.icon} ${j.label}`, j.tile !== undefined ? h('div', { class: 'hint' }, h('a', { href: '#', onclick: (e: Event) => { e.preventDefault(); host.focusTile(j.tile!); } }, 'auf der Karte zeigen')) : null),
              h('td', null, yieldText(j.outputs)),
              h('td', null, yieldText(j.inputs) || '–'),
              h('td', null, `${cur} / ${j.slots}`),
              h(
                'td',
                { style: 'white-space:nowrap' },
                h('button', { class: 'btn small', disabled: (fixed ?? cur) <= 0, onclick: () => set(j.key, Math.max(0, (fixed ?? cur) - 1)) }, '−'),
                ' ',
                h('button', { class: 'btn small', disabled: (fixed ?? cur) >= j.slots, onclick: () => set(j.key, Math.min(j.slots, (fixed ?? cur) + 1)) }, '+'),
                ' ',
                h('button', { class: `btn small ${fixed === undefined ? 'active' : ''}`, onclick: () => set(j.key, fixed === undefined ? cur : null) }, fixed === undefined ? 'Auto' : 'Fest'),
              ),
            );
          }),
        )
      : h('div', { class: 'hint' }, 'Noch keine Arbeitsplätze – baue Geländeausbauten oder Produktionsgebäude.'),
  );
}

function tradeRoutesCard(host: ScreenHost): HTMLElement {
  const { state } = host;
  const routes = routesOf(state, host.viewer);
  return h(
    'div',
    { class: 'card', style: 'margin-bottom:12px' },
    h('h2', null, `Handelsrouten ${routes.length} / ${maxTradeRoutes(state, host.viewer)}`),
    routes.length
      ? h(
          'table',
          { class: 'tbl' },
          routes.map((r) => {
            const y = routeYield(state, r);
            const from = state.settlements[r.from];
            const to = state.settlements[r.to];
            return h('tr', null, h('td', null, `${from?.name ?? '?'} → ${to?.name ?? '?'}`), h('td', null, to ? state.players[to.owner].name : ''), h('td', null, `+${y.gold} 🪙${y.influence ? ` · +${y.influence} ✴️` : ''}`));
          }),
        )
      : h('div', { class: 'hint' }, 'Bilde Händler aus (Währung) und schicke sie zu einer eigenen Siedlung, einem Stadtstaat oder einem Volk mit Handelsabkommen.'),
  );
}
