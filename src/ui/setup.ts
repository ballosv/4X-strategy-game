import { CIVS, ORIENTATION_NAMES, TRAITS } from '../core/data/civs';
import { MAP_SIZES, MAP_TYPES, type MapSize, type MapType } from '../core/map/types';
import type { Difficulty, GameSettings, PlayerSetup } from '../core/state';
import { h, replace } from './dom';
import { listSaves, type SaveInfo } from './session';

export interface SetupCallbacks {
  start(settings: GameSettings): string | null;
  load(slot: string): void;
}

const DIFFICULTIES: Record<Difficulty, { name: string; hint: string }> = {
  easy: { name: 'Einfach', hint: 'KI plant kurzfristig und bewertet seltener neu' },
  normal: { name: 'Normal', hint: 'KI bewertet jede Runde neu' },
  hard: { name: 'Schwer', hint: 'KI plant vorausschauend und wägt mehr Optionen ab' },
};

/** Spielstart-Bildschirm: Kartentyp, Größe, Gegner, Mindestabstand, Volk. */
export class SetupScreen {
  readonly el = h('div', { class: 'setup' });
  private mapType: MapType = 'continents';
  private mapSize: MapSize = 'medium';
  private opponents = 3;
  private humans = 1;
  private civId = CIVS[0].id;
  private minDistance = 0;
  private cityStates = 3;
  private difficulty: Difficulty = 'normal';
  private seed = randomSeed();
  private error = '';

  constructor(private readonly cb: SetupCallbacks) {
    this.render();
  }

  private settings(): GameSettings {
    const players: PlayerSetup[] = [];
    const civs = [this.civId, ...CIVS.map((c) => c.id).filter((c) => c !== this.civId)];
    for (let i = 0; i < this.humans; i++) players.push({ kind: 'human', civId: civs[i], name: this.humans > 1 ? `Spieler ${i + 1}` : undefined });
    for (let i = 0; i < this.opponents; i++) players.push({ kind: 'ai', civId: civs[this.humans + i] });
    return {
      mapType: this.mapType,
      mapSize: this.mapSize,
      seed: this.seed,
      players,
      minStartDistance: this.minDistance,
      cityStates: this.cityStates,
      difficulty: this.difficulty,
    };
  }

  render(): void {
    const size = MAP_SIZES[this.mapSize];
    const maxOpp = size.maxPlayers - this.humans;
    if (this.opponents > maxOpp) this.opponents = maxOpp;
    const seg = <T extends string>(entries: [T, string][], current: T, set: (v: T) => void) =>
      h('div', { class: 'seg' }, entries.map(([v, label]) => h('button', { class: `btn ${v === current ? 'active' : ''}`, onclick: () => { set(v); this.render(); } }, label)));
    const saves = listSaves();

    replace(
      this.el,
      h(
        'div',
        { class: 'setup-card' },
        h('h1', null, 'AI 4X'),
        h('div', { class: 'subtitle' }, 'Von der Steinzeit bis zur Künstlichen Intelligenz – ein rundenbasiertes Zivilisations- und Wirtschaftsstrategiespiel.'),
        h(
          'div',
          { class: 'setup-grid' },
          h(
            'div',
            { class: 'card' },
            h('h2', null, 'Welt'),
            h('div', { class: 'field' }, h('label', null, 'Kartentyp'), seg(Object.values(MAP_TYPES).map((t) => [t.id, t.name]), this.mapType, (v) => (this.mapType = v)), h('div', { class: 'hint' }, MAP_TYPES[this.mapType].description)),
            h('div', { class: 'field' }, h('label', null, 'Kartengröße'), seg(Object.values(MAP_SIZES).map((s) => [s.id, s.name]), this.mapSize, (v) => (this.mapSize = v)), h('div', { class: 'hint' }, `${size.width} × ${size.height} Felder · bis zu ${size.maxPlayers} Spieler`)),
            h(
              'div',
              { class: 'field' },
              h('label', null, `Mindestabstand der Startpositionen: ${this.minDistance === 0 ? 'so weit wie möglich' : `${this.minDistance} Felder`}`),
              h('input', { type: 'range', min: 0, max: Math.round(size.width / 2), value: this.minDistance, oninput: (e: Event) => { this.minDistance = Number((e.target as HTMLInputElement).value); this.render(); } }),
              h('div', { class: 'hint' }, 'Standard: Startpositionen liegen möglichst weit auseinander.'),
            ),
            h('div', { class: 'field' }, h('label', null, `Stadtstaaten: ${this.cityStates}`), h('input', { type: 'range', min: 0, max: 8, value: this.cityStates, oninput: (e: Event) => { this.cityStates = Number((e.target as HTMLInputElement).value); this.render(); } })),
            h('div', { class: 'field' }, h('label', null, 'Seed'), h('div', { style: 'display:flex;gap:6px' }, h('input', { type: 'text', value: this.seed, onchange: (e: Event) => (this.seed = (e.target as HTMLInputElement).value || randomSeed()) }), h('button', { class: 'btn', onclick: () => { this.seed = randomSeed(); this.render(); } }, '🎲'))),
          ),
          h(
            'div',
            { class: 'card' },
            h('h2', null, 'Spieler'),
            h('div', { class: 'field' }, h('label', null, `Menschliche Spieler (Hotseat): ${this.humans}`), h('input', { type: 'range', min: 1, max: 4, value: this.humans, oninput: (e: Event) => { this.humans = Number((e.target as HTMLInputElement).value); this.render(); } })),
            h('div', { class: 'field' }, h('label', null, `Computergegner: ${this.opponents}`), h('input', { type: 'range', min: this.humans > 1 ? 0 : 1, max: maxOpp, value: this.opponents, oninput: (e: Event) => { this.opponents = Number((e.target as HTMLInputElement).value); this.render(); } })),
            h('div', { class: 'field' }, h('label', null, 'Schwierigkeit der Computergegner'), seg(Object.entries(DIFFICULTIES).map(([k, v]) => [k as Difficulty, v.name]), this.difficulty, (v) => (this.difficulty = v)), h('div', { class: 'hint' }, `${DIFFICULTIES[this.difficulty].hint}. Computergegner erhalten nie Boni.`)),
          ),
        ),
        h(
          'div',
          { class: 'card', style: 'margin-top:16px' },
          h('h2', null, 'Dein Volk'),
          h(
            'div',
            { class: 'civ-list' },
            CIVS.map((c) =>
              h(
                'div',
                { class: `civ ${c.id === this.civId ? 'active' : ''}`, onclick: () => { this.civId = c.id; this.render(); } },
                h('div', { class: 'name' }, h('span', { class: 'swatch', style: `background:${c.color}` }), `${c.emblem} ${c.name}`),
                h('div', { class: 'traits' }, `${c.traits.map((t) => TRAITS[t].name).join(' · ')} — ${ORIENTATION_NAMES[c.orientation]}`),
                h('div', { class: 'traits' }, c.traits.map((t) => TRAITS[t].description).join('; ')),
              ),
            ),
          ),
        ),
        saves.length ? this.renderSaves(saves) : null,
        this.error ? h('div', { class: 'error' }, this.error) : null,
        h('div', { class: 'setup-actions' }, h('button', { class: 'btn primary', style: 'font-size:17px;padding:12px 26px', onclick: () => this.start() }, 'Spiel starten ›')),
      ),
    );
  }

  private renderSaves(saves: SaveInfo[]): HTMLElement {
    return h(
      'div',
      { class: 'card', style: 'margin-top:16px' },
      h('h2', null, 'Spielstände'),
      h(
        'div',
        { class: 'list' },
        saves.map((s) => h('div', { class: 'option', onclick: () => this.cb.load(s.slot) }, h('span', { class: 'icon' }, '💾'), h('div', null, h('div', { class: 'o-name' }, s.label), h('div', { class: 'o-cost' }, s.detail)))),
      ),
    );
  }

  private start(): void {
    this.error = '';
    const err = this.cb.start(this.settings());
    if (err) {
      this.error = err;
      this.render();
    }
  }
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}
