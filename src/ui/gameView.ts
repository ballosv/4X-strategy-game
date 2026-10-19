import { runAiTurn } from '../ai';
import { CIVS } from '../core/data/civs';
import { ERAS, formatYear } from '../core/data/eras';
import { stockOf } from '../core/data/goods';
import { TECHS, techCost } from '../core/data/techs';
import { unitType } from '../core/data/units';
import { gridOf } from '../core/context';
import { applyCommand, unitsNeedingOrders, type Command } from '../core/game';
import { playerSettlements, settlementAt, totalPop, type GameState, type LogEntry, type Unit } from '../core/state';
import { canAttack, previewCombat } from '../core/systems/combat';
import { housingOf } from '../core/systems/economy';
import { findPath, reachableTiles } from '../core/systems/movement';
import { availableTechs } from '../core/systems/research';
import { computeVisibility } from '../core/systems/vision';
import { MapRenderer, renderMinimap, type Highlights } from '../render/renderer';
import { HEX_W, ROW_STEP, ZOOM_MAX, ZOOM_MIN, defaultZoom } from '../render/projection';
import { assetPreviewScreen } from './assetPreview';
import { h, replace } from './dom';
import { fmt, signed } from './format';
import { settlementPanel, tilePanel, unitPanel, type PanelHost } from './panels';
import { buildScreen, civScreen, diplomacyScreen, gameOverScreen, helpScreen, modal, techScreen, type ScreenHost } from './screens';
import { saveGame } from './session';

type Selection = { kind: 'unit'; id: number } | { kind: 'settlement'; id: number } | { kind: 'tile'; tile: number } | null;
type Screen = { kind: 'build'; id: number; tab: string } | { kind: 'tech' } | { kind: 'civ'; tab: string } | { kind: 'diplomacy' } | { kind: 'menu' } | { kind: 'help' } | { kind: 'assets' } | { kind: 'gameOver' } | null;

const LOG_ICONS: Record<LogEntry['kind'], string> = { info: 'ℹ️', combat: '⚔️', economy: '🏗️', research: '📖', diplomacy: '🕊️', warning: '⚠️' };

export interface GameViewCallbacks {
  exit(): void;
}

/** Spielbildschirm: Karte, HUD, Kontextpanel, Eingabe und Rundenablauf. */
export class GameView implements PanelHost, ScreenHost {
  readonly el = h('div', { class: 'game' });
  private readonly canvas = h('canvas', { class: 'map' });
  private readonly renderer: MapRenderer;
  private readonly topbar = h('div', { class: 'topbar' });
  private readonly navtabs = h('div', { class: 'navtabs' });
  private readonly messages = h('div', { class: 'messages' });
  private readonly minimap = h('canvas', { width: 380, height: 256 });
  private readonly context = h('div', { class: 'context empty' });
  private readonly overlayHost = h('div');
  private readonly toastEl = h('div', { class: 'toast', style: 'opacity:0' });
  private readonly thinking = h('div', { class: 'thinking', style: 'display:none' }, h('div', { class: 'spinner' }), h('span', null, 'Die anderen Völker sind am Zug …'));

  viewer: number;
  moveMode = false;
  private selection: Selection = null;
  private screen: Screen = null;
  private vis: Uint8Array;
  private hover = -1;
  private pendingTarget: number | null = null;
  private dirty = true;
  private aiRunning = false;
  private seenLog: number;
  private toastTimer = 0;
  private handover: HTMLElement | null = null;
  private destroyed = false;

  constructor(
    public state: GameState,
    private readonly cb: GameViewCallbacks,
  ) {
    this.viewer = this.firstHuman();
    this.vis = computeVisibility(state, this.viewer);
    this.seenLog = Math.max(0, state.log.length - 6);
    this.renderer = new MapRenderer(this.canvas);
    this.renderer.viewer = this.viewer;
    this.renderer.onInvalidate = () => this.refresh();
    const minimapBox = h(
      'div',
      { class: 'minimap-box' },
      this.minimap,
      h(
        'div',
        { class: 'map-tools' },
        h('button', { class: 'btn', title: 'Hineinzoomen', onclick: () => this.zoomBy(1.25) }, '＋'),
        h('button', { class: 'btn', title: 'Herauszoomen', onclick: () => this.zoomBy(0.8) }, '－'),
        h('button', { class: 'btn', title: 'Hauptstadt', onclick: () => this.centerOnCapital() }, '🏠'),
        h('button', { class: 'btn', title: 'Nächste Einheit', onclick: () => this.selectNextUnit() }, '👤'),
      ),
    );
    this.el.append(this.canvas, this.topbar, this.navtabs, this.messages, h('div', { class: 'bottom' }, minimapBox, this.context), this.thinking, this.toastEl, this.overlayHost);
    this.attachInput();
    this.minimap.addEventListener('pointerdown', (e) => this.onMinimap(e));
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKey);
  }

  mount(): void {
    this.renderer.resize();
    const start = this.ownUnits()[0]?.tile ?? playerSettlements(this.state, this.viewer)[0]?.tile ?? 0;
    this.renderer.camera.zoom = defaultZoom(this.renderer.viewWidth);
    this.renderer.centerOn(this.state, start);
    this.refresh();
    this.loop();
    this.continueTurns();
  }

  destroy(): void {
    this.destroyed = true;
    this.renderer.dispose();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
  }

  private firstHuman(): number {
    const cur = this.state.players[this.state.currentPlayer];
    if (cur?.kind === 'human') return cur.id;
    return this.state.players.find((p) => p.kind === 'human')?.id ?? 0;
  }

  // -------------------------------------------------------------------------
  // Befehle

  command(cmd: Command): boolean {
    if (this.state.currentPlayer !== this.viewer || this.aiRunning) return false;
    const res = applyCommand(this.state, this.viewer, cmd);
    if (!res.ok) {
      this.toast(res.error ?? 'Nicht möglich');
      return false;
    }
    if (cmd.type === 'endTurn') {
      this.selection = null;
      this.moveMode = false;
      this.continueTurns();
    }
    // Auswahl gültig halten
    if (this.selection?.kind === 'unit' && !this.state.units[this.selection.id]) {
      const sid = cmd.type === 'unitAction' && (cmd.action === 'foundCamp' || cmd.action === 'foundSettlement') ? settlementAt(this.state, this.lastUnitTile)?.id : undefined;
      this.selection = sid !== undefined ? { kind: 'settlement', id: sid } : null;
    }
    if (this.selection?.kind === 'settlement' && this.state.settlements[this.selection.id]?.owner !== this.viewer && !this.state.settlements[this.selection.id]) this.selection = null;
    this.pendingTarget = null;
    if (cmd.type === 'move' || cmd.type === 'attack' || (cmd.type === 'unitAction' && ['fortify', 'sentry', 'skip', 'explore', 'heal'].includes(cmd.action))) {
      const unit = this.selection?.kind === 'unit' ? this.state.units[this.selection.id] : undefined;
      if (!unit || unit.movesLeft <= 0 || cmd.type === 'unitAction') {
        this.moveMode = false;
        if (cmd.type !== 'move') this.selectNextUnit(false);
      }
    }
    this.refresh();
    return true;
  }

  private lastUnitTile = -1;

  /** Lässt Computergegner ziehen, bis wieder ein Mensch am Zug ist. */
  private continueTurns(): void {
    if (this.aiRunning || this.destroyed) return;
    const step = () => {
      if (this.destroyed) return;
      const st = this.state;
      if (st.gameOver) {
        this.aiRunning = false;
        this.thinking.style.display = 'none';
        this.openScreen({ kind: 'gameOver' });
        return;
      }
      const cur = st.players[st.currentPlayer];
      if (cur.kind === 'human') {
        this.aiRunning = false;
        this.thinking.style.display = 'none';
        this.beginHumanTurn(cur.id);
        return;
      }
      this.aiRunning = true;
      this.thinking.style.display = 'flex';
      try {
        runAiTurn(st, cur.id);
      } catch (e) {
        console.error('KI-Fehler', e);
        if (st.currentPlayer === cur.id) applyCommand(st, cur.id, { type: 'endTurn' });
      }
      this.dirty = true;
      setTimeout(step, 15);
    };
    step();
  }

  private beginHumanTurn(pid: number): void {
    const humans = this.state.players.filter((p) => p.kind === 'human' && p.alive);
    const changed = pid !== this.viewer;
    this.viewer = pid;
    this.renderer.viewer = pid;
    if (humans.length > 1 && changed) this.showHandover();
    saveGame(this.state, 'auto');
    this.selection = null;
    this.refresh();
    if (changed || this.state.turn <= 1) this.centerOnFirst();
    if (!this.state.players[pid].research.current && availableTechs(this.state, pid).length && this.state.turn > 1) {
      this.toast('Wähle eine neue Entwicklung', 'info');
    }
    this.selectNextUnit(false);
  }

  private showHandover(): void {
    const p = this.state.players[this.viewer];
    this.handover?.remove();
    this.handover = h('div', { class: 'handover' }, h('div', { style: `font-size:48px` }, CIVS.find((c) => c.id === p.civId)?.emblem ?? ''), h('h2', null, `${p.name} ist am Zug`), h('button', { class: 'btn primary', onclick: () => { this.handover?.remove(); this.handover = null; } }, 'Zug beginnen'));
    this.el.append(this.handover);
  }

  // -------------------------------------------------------------------------
  // Darstellung

  private loop = (): void => {
    if (this.destroyed) return;
    if (this.dirty || this.renderer.needsFrame) {
      this.dirty = false;
      this.draw();
    }
    requestAnimationFrame(this.loop);
  };

  private draw(): void {
    this.renderer.clampCamera(this.state);
    this.renderer.render(this.state, this.vis, this.highlights());
    const tl = this.renderer.screenToWorld(0, 0);
    const br = this.renderer.screenToWorld(this.renderer.viewWidth, this.renderer.viewHeight);
    renderMinimap(this.minimap, this.state, this.viewer, this.renderer.revealAll, {
      x0: tl.x / HEX_W - 0.5,
      y0: tl.y / ROW_STEP,
      x1: br.x / HEX_W - 0.5,
      y1: br.y / ROW_STEP,
    });
  }

  private highlights(): Highlights {
    const hl: Highlights = { hover: this.hover };
    const sel = this.selection;
    if (sel?.kind === 'tile') hl.selected = sel.tile;
    if (sel?.kind === 'settlement') {
      const s = this.state.settlements[sel.id];
      if (s) hl.selected = s.tile;
    }
    if (sel?.kind === 'unit') {
      const u = this.state.units[sel.id];
      if (u) {
        hl.selected = u.tile;
        if (u.owner === this.viewer && this.state.currentPlayer === this.viewer && !this.aiRunning) {
          hl.reachable = reachableTiles(this.state, u, this.vis);
          hl.attackable = this.attackableTiles(u);
          const target = this.pendingTarget ?? (this.moveMode || window.matchMedia('(hover: hover)').matches ? this.hover : -1);
          if (target >= 0 && target !== u.tile && !hl.attackable.has(target)) {
            const path = findPath(this.state, u, target, { explored: this.state.players[this.viewer].explored, visible: this.vis });
            if (path) hl.path = path;
          }
        }
      }
    }
    return hl;
  }

  private attackableTiles(u: Unit): Set<number> {
    const out = new Set<number>();
    const def = unitType(u.type);
    if (def.strength <= 0 || u.hasAttacked || u.movesLeft <= 0) return out;
    const grid = gridOf(this.state);
    for (const t of grid.range(u.tile, Math.max(1, def.range ?? 1))) {
      if (t === u.tile || !this.vis[t]) continue;
      if (canAttack(this.state, u, t) === null) out.add(t);
    }
    return out;
  }

  refresh(): void {
    this.vis = computeVisibility(this.state, this.viewer);
    this.renderTopbar();
    this.renderContext();
    this.renderMessages();
    this.renderScreen();
    this.dirty = true;
  }

  rerender(): void {
    this.refresh();
  }

  private renderTopbar(): void {
    const st = this.state;
    const p = st.players[this.viewer];
    const civ = CIVS.find((c) => c.id === p.civId);
    const settlements = playerSettlements(st, this.viewer);
    const pop = settlements.reduce((a, s) => a + totalPop(s.pop), 0);
    const housing = settlements.reduce((a, s) => a + housingOf(s), 0);
    const food = settlements.reduce((a, s) => a + s.report.foodSurplus, 0);
    const produced = (g: 'wood' | 'stone' | 'tools') => settlements.reduce((a, s) => a + (s.report.produced[g] ?? 0) - (s.report.consumed[g] ?? 0), 0);
    const res = (icon: string, value: string, delta: number | null, title: string, onclick?: () => void) =>
      h('div', { class: 'res', title, onclick, style: onclick ? 'cursor:pointer' : '' }, h('span', { class: 'icon' }, icon), value, delta !== null ? h('span', { class: `delta ${delta < 0 ? 'neg' : ''}` }, signed(delta, 1)) : null);
    const research = p.research.current;
    const needOrders = unitsNeedingOrders(st, this.viewer).length;
    const myTurn = st.currentPlayer === this.viewer && !this.aiRunning;
    replace(
      this.topbar,
      h('div', { class: 'emblem', title: p.name, style: `background:linear-gradient(180deg, ${p.color}, ${p.color}cc)` }, civ?.emblem ?? '🏳️'),
      h(
        'div',
        { class: 'resbar' },
        res('🌾', fmt(food, 1), null, 'Nahrungsüberschuss aller Siedlungen'),
        res('🪵', fmt(stockOf(p.stock, 'wood')), produced('wood'), 'Holz im Nationallager'),
        res('🪨', fmt(stockOf(p.stock, 'stone')), produced('stone'), 'Stein im Nationallager'),
        stockOf(p.stock, 'tools') > 0 || produced('tools') ? res('🔨', fmt(stockOf(p.stock, 'tools')), produced('tools'), 'Werkzeuge') : null,
        res('🪙', fmt(p.gold), p.lastIncome.gold, 'Gold', () => this.openScreen({ kind: 'civ', tab: 'overview' })),
        res('✴️', fmt(p.influence), p.lastIncome.influence, 'Einfluss', () => this.openScreen({ kind: 'civ', tab: 'policies' })),
        res('📖', research ? `${TECHS[research].name} ${Math.min(100, Math.round((p.research.progress / techCost(research)) * 100))}%` : 'Entwicklung wählen!', p.lastIncome.research, 'Entwicklung', () => this.openScreen({ kind: 'tech' })),
        res('👥', `${pop}/${housing}`, null, 'Bevölkerung / Wohnraum'),
      ),
      h(
        'div',
        { class: 'turnbox' },
        h('div', { class: 'info' }, h('span', null, `Runde ${st.turn} | ${formatYear(st.year)}`), h('small', null, `${ERAS[p.era].name} · ${st.phase === 'ai' ? 'KI-Phase' : 'Menschenphase'}`)),
        h('button', { class: 'btn primary next', disabled: !myTurn, onclick: () => (needOrders ? this.selectNextUnit() : this.command({ type: 'endTurn' })) }, needOrders ? `Einheit (${needOrders}) ›` : 'Nächste Runde ›'),
        h('button', { class: 'btn primary force', disabled: !myTurn, title: 'Runde sofort beenden', onclick: () => this.command({ type: 'endTurn' }) }, '»'),
      ),
    );
    const researchMissing = !research && availableTechs(st, this.viewer).length > 0;
    replace(
      this.navtabs,
      h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'tech' }) }, researchMissing ? h('span', { class: 'badge-dot' }) : null, 'Entwicklung'),
      h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'civ', tab: 'overview' }) }, 'Zivilisation'),
      h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'diplomacy' }) }, 'Diplomatie'),
      h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'menu' }) }, '☰'),
    );
  }

  private renderContext(): void {
    const sel = this.selection;
    let parts: [HTMLElement, HTMLElement] | null = null;
    if (sel?.kind === 'unit' && this.state.units[sel.id]) {
      const u = this.state.units[sel.id];
      if (u.owner === this.viewer || this.vis[u.tile]) parts = unitPanel(this, u);
    } else if (sel?.kind === 'settlement' && this.state.settlements[sel.id]) parts = settlementPanel(this, this.state.settlements[sel.id]);
    else if (sel?.kind === 'tile') parts = tilePanel(this, sel.tile);
    if (!parts) {
      this.context.className = 'context empty';
      replace(this.context);
      return;
    }
    this.context.className = 'context';
    replace(this.context, ...parts);
  }

  private renderMessages(): void {
    const mine = this.state.log.filter((e, i) => i >= this.seenLog && e.turn >= this.state.turn - 1 && (e.player === this.viewer || e.player === -1)).slice(-5);
    replace(
      this.messages,
      mine.map((e) =>
        h(
          'div',
          { class: `msg ${e.kind}`, onclick: () => { if (e.tile !== undefined) this.focusTile(e.tile); } },
          h('span', { class: 'icon' }, LOG_ICONS[e.kind]),
          h('span', null, e.text),
        ),
      ),
    );
  }

  private toast(text: string, kind: 'error' | 'info' = 'error'): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `toast ${kind === 'info' ? 'info' : ''}`;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), 2200);
  }

  // -------------------------------------------------------------------------
  // Dialoge

  openBuild(settlementId: number, tab = 'units'): void {
    this.openScreen({ kind: 'build', id: settlementId, tab });
  }

  private openScreen(screen: Screen): void {
    this.screen = screen;
    this.renderScreen();
  }

  close(): void {
    this.screen = null;
    this.renderScreen();
    this.refresh();
  }

  focusTile(tile: number): void {
    this.screen = null;
    this.renderScreen();
    this.renderer.centerOn(this.state, tile);
    const s = settlementAt(this.state, tile);
    this.select(s ? { kind: 'settlement', id: s.id } : { kind: 'tile', tile });
  }

  private renderScreen(): void {
    const sc = this.screen;
    if (!sc) {
      replace(this.overlayHost);
      return;
    }
    let el: HTMLElement;
    switch (sc.kind) {
      case 'build': {
        const s = this.state.settlements[sc.id];
        if (!s) return this.close();
        el = modal(`${s.name} – Bauen & Rekrutieren`, this, buildScreen(this, s, sc.tab, (t) => this.openScreen({ ...sc, tab: t })));
        break;
      }
      case 'tech':
        el = modal('Entwicklung', this, techScreen(this));
        break;
      case 'civ':
        el = modal('Zivilisation', this, civScreen(this, sc.tab, (t) => this.openScreen({ kind: 'civ', tab: t })));
        break;
      case 'diplomacy':
        el = modal('Diplomatie', this, diplomacyScreen(this));
        break;
      case 'help':
        el = modal('Spielhilfe', this, helpScreen());
        break;
      case 'assets':
        el = modal('Asset-Vorschau', this, assetPreviewScreen());
        break;
      case 'gameOver':
        el = modal('Spielende', this, gameOverScreen(this, () => this.cb.exit()));
        break;
      case 'menu':
        el = modal(
          'Menü',
          this,
          h(
            'div',
            { style: 'display:flex;flex-direction:column;gap:8px;max-width:360px' },
            h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'help' }) }, '❓ Spielhilfe'),
            h('button', { class: 'btn', onclick: () => { this.toast(saveGame(this.state, '1') ? 'Gespeichert (Spielstand 1)' : 'Speichern fehlgeschlagen', 'info'); this.close(); } }, '💾 Spiel speichern (Platz 1)'),
            h('button', { class: 'btn', onclick: () => { this.toast(saveGame(this.state, '2') ? 'Gespeichert (Spielstand 2)' : 'Speichern fehlgeschlagen', 'info'); this.close(); } }, '💾 Spiel speichern (Platz 2)'),
            h('button', { class: 'btn', onclick: () => { this.renderer.revealAll = !this.renderer.revealAll; this.close(); } }, this.renderer.revealAll ? '🌫️ Nebel des Krieges einblenden' : '🗺️ Ganze Karte zeigen (Beobachter)'),
            h('button', { class: 'btn', onclick: () => this.openScreen({ kind: 'assets' }) }, '🖼️ Asset-Vorschau (Grafik-Abdeckung)'),
            h('button', { class: 'btn danger', onclick: () => { saveGame(this.state, 'auto'); this.cb.exit(); } }, '⏏️ Zum Hauptmenü'),
            h('div', { class: 'hint' }, 'Steuerung: Ziehen = Karte bewegen, Zwei Finger / Mausrad = Zoom, Tippen = Auswahl. Tasten: Eingabe = nächste Runde, Leertaste = Einheit überspringen, F = befestigen, Esc = Auswahl aufheben.'),
          ),
        );
        break;
    }
    replace(this.overlayHost, el);
  }

  // -------------------------------------------------------------------------
  // Auswahl & Eingabe

  select(sel: Selection): void {
    this.selection = sel;
    this.pendingTarget = null;
    this.moveMode = false;
    if (sel?.kind === 'unit') this.lastUnitTile = this.state.units[sel.id]?.tile ?? -1;
    this.refresh();
  }

  toggleMoveMode(): void {
    this.moveMode = !this.moveMode;
    this.refresh();
  }

  private ownUnits(): Unit[] {
    return Object.values(this.state.units).filter((u) => u.owner === this.viewer);
  }

  private selectNextUnit(center = true): void {
    const list = unitsNeedingOrders(this.state, this.viewer);
    if (!list.length) {
      if (this.selection?.kind === 'unit' && !this.state.units[this.selection.id]) this.selection = null;
      this.refresh();
      return;
    }
    const cur = this.selection?.kind === 'unit' ? list.findIndex((u) => u.id === (this.selection as { id: number }).id) : -1;
    const next = list[(cur + 1) % list.length];
    this.select({ kind: 'unit', id: next.id });
    if (center || this.state.turn <= 2) this.renderer.centerOn(this.state, next.tile);
  }

  private centerOnFirst(): void {
    const target = playerSettlements(this.state, this.viewer).find((s) => s.isCapital)?.tile ?? this.ownUnits()[0]?.tile;
    if (target !== undefined) this.renderer.centerOn(this.state, target);
  }

  private centerOnCapital(): void {
    this.centerOnFirst();
    this.dirty = true;
  }

  private zoomBy(f: number, sx = this.renderer.viewWidth / 2, sy = this.renderer.viewHeight / 2): void {
    const cam = this.renderer.camera;
    const before = this.renderer.screenToWorld(sx, sy);
    cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * f));
    const after = this.renderer.screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    this.dirty = true;
  }

  private onTap(tile: number): void {
    if (tile < 0 || this.aiRunning) return;
    const st = this.state;
    const sel = this.selection;
    const explored = st.players[this.viewer].explored[tile] === 1 || this.renderer.revealAll;
    if (sel?.kind === 'unit') {
      const u = st.units[sel.id];
      if (u && u.owner === this.viewer && st.currentPlayer === this.viewer) {
        if (tile === u.tile) {
          // erneutes Tippen: Stapel durchschalten bzw. Siedlung zeigen
          const others = this.ownUnits().filter((o) => o.tile === tile && o.id !== u.id);
          if (others.length) return this.select({ kind: 'unit', id: others[0].id });
          const s = settlementAt(st, tile);
          if (s) return this.select({ kind: 'settlement', id: s.id });
          return this.select({ kind: 'tile', tile });
        }
        if (this.attackableTiles(u).has(tile)) {
          const pv = previewCombat(st, u, tile);
          if (pv && pv.attackerDamage >= u.hp && !confirm(`Riskanter Angriff: Stärke ${pv.attackerStrength} gegen ${pv.defenderStrength}. Die Einheit wird voraussichtlich fallen. Trotzdem angreifen?`)) return;
          this.command({ type: 'attack', unitId: u.id, target: tile });
          return;
        }
        const ownThere = this.ownUnits().find((o) => o.tile === tile);
        const ownSettlement = settlementAt(st, tile);
        const reach = reachableTiles(st, u, this.vis);
        if (reach.has(tile) && !(ownThere && !this.moveMode && !reach.has(tile))) {
          this.command({ type: 'move', unitId: u.id, target: tile });
          return;
        }
        if (!this.moveMode && ownThere) return this.select({ kind: 'unit', id: ownThere.id });
        if (!this.moveMode && ownSettlement?.owner === this.viewer) return this.select({ kind: 'settlement', id: ownSettlement.id });
        if (explored || this.moveMode) {
          // Ziel außerhalb der Reichweite: erst Vorschau, dann bestätigen
          if (this.pendingTarget === tile) {
            this.command({ type: 'move', unitId: u.id, target: tile });
            return;
          }
          const path = findPath(st, u, tile, { explored: st.players[this.viewer].explored, visible: this.vis });
          if (path) {
            this.pendingTarget = tile;
            this.toast('Erneut tippen, um den Marschbefehl zu bestätigen', 'info');
            this.dirty = true;
            return;
          }
        }
      }
    }
    // normale Auswahl
    const units = Object.values(st.units).filter((o) => o.tile === tile && (o.owner === this.viewer || this.vis[tile]));
    const own = units.filter((o) => o.owner === this.viewer).sort((a, b) => b.movesLeft - a.movesLeft);
    const s = settlementAt(st, tile);
    if (own.length && !(sel?.kind === 'unit' && own.some((o) => o.id === sel.id))) return this.select({ kind: 'unit', id: own[0].id });
    if (s && explored && !(sel?.kind === 'settlement' && sel.id === s.id)) return this.select({ kind: 'settlement', id: s.id });
    if (units.length && !own.length) return this.select({ kind: 'unit', id: units[0].id });
    if (explored) return this.select({ kind: 'tile', tile });
    this.select(null);
  }

  private onResize = (): void => {
    this.renderer.resize();
    this.dirty = true;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (this.screen || this.handover) {
      if (e.key === 'Escape') this.close();
      return;
    }
    const pan = 60 / this.renderer.camera.zoom;
    const u = this.selection?.kind === 'unit' ? this.state.units[this.selection.id] : undefined;
    switch (e.key) {
      case 'Enter':
        this.command({ type: 'endTurn' });
        break;
      case ' ':
        if (u) this.command({ type: 'unitAction', unitId: u.id, action: 'skip' });
        else this.selectNextUnit();
        e.preventDefault();
        break;
      case 'f':
      case 'F':
        if (u) this.command({ type: 'unitAction', unitId: u.id, action: 'fortify' });
        break;
      case 'Escape':
        this.select(null);
        break;
      case 'ArrowLeft':
      case 'a':
        this.renderer.camera.x -= pan;
        break;
      case 'ArrowRight':
      case 'd':
        this.renderer.camera.x += pan;
        break;
      case 'ArrowUp':
      case 'w':
        this.renderer.camera.y -= pan;
        break;
      case 'ArrowDown':
      case 's':
        this.renderer.camera.y += pan;
        break;
      case '+':
        this.zoomBy(1.2);
        break;
      case '-':
        this.zoomBy(0.83);
        break;
      default:
        return;
    }
    this.dirty = true;
  };

  private onMinimap(e: PointerEvent): void {
    const rect = this.minimap.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    this.renderer.camera.x = fx * (this.state.map.width + 0.5) * HEX_W;
    this.renderer.camera.y = fy * this.state.map.height * ROW_STEP;
    this.dirty = true;
  }

  private attachInput(): void {
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; camX: number; camY: number } | null = null;
    let dragged = false;
    let pinchDist = 0;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, camX: this.renderer.camera.x, camY: this.renderer.camera.y };
        dragged = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        dragged = true;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') {
          const t = this.renderer.pick(this.state, e.clientX - rect.left, e.clientY - rect.top);
          if (t !== this.hover) {
            this.hover = t;
            this.dirty = true;
          }
        }
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoomBy(d / pinchDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        pinchDist = d;
        return;
      }
      if (start && pointers.size === 1) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) dragged = true;
        if (dragged) {
          this.renderer.camera.x = start.camX - dx / this.renderer.camera.zoom;
          this.renderer.camera.y = start.camY - dy / this.renderer.camera.zoom;
          this.dirty = true;
        }
      }
    });
    const end = (e: PointerEvent) => {
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) pinchDist = 0;
      if (wasSingle && !dragged && e.type === 'pointerup') {
        const rect = c.getBoundingClientRect();
        const t = this.renderer.pick(this.state, e.clientX - rect.left, e.clientY - rect.top);
        if (e.button === 2) {
          // Rechtsklick (PC): direkt bewegen
          const u = this.selection?.kind === 'unit' ? this.state.units[this.selection.id] : undefined;
          if (u && t >= 0) this.command(this.attackableTiles(u).has(t) ? { type: 'attack', unitId: u.id, target: t } : { type: 'move', unitId: u.id, target: t });
        } else this.onTap(t);
      }
      if (pointers.size === 0) start = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }
}
