import { RESOURCES, type ResourceId } from '../core/data/terrain';
import { unitType } from '../core/data/units';
import { gridOf } from '../core/context';
import type { HexGrid } from '../core/hex';
import { isCliff, isPassableLand, isWater } from '../core/map/passability';
import type { Tile } from '../core/map/types';
import { isAtWar, type GameState, type Player, type Settlement, type Unit } from '../core/state';
import type { PathOptions } from '../core/systems/movement';
import { computeVisibility } from '../core/systems/vision';
import type { AiMemory, KnownSettlement } from './memory';

/**
 * Sicht der KI auf die Welt. Erzwingt den Nebel des Krieges:
 * - Gelände nur auf erkundeten Feldern,
 * - fremde Einheiten nur auf aktuell sichtbaren Feldern,
 * - fremde Siedlungen nur, wenn sie gesehen wurden (Gedächtnis mit letztem Stand).
 * Eigene Einheiten und Siedlungen sind vollständig bekannt.
 */
export class AiView {
  readonly grid: HexGrid;
  readonly player: Player;
  visible: Uint8Array;
  private foreignUnitsCache: Unit[] | null = null;

  constructor(
    readonly state: GameState,
    readonly playerId: number,
    private readonly mem: AiMemory | null = null,
  ) {
    this.grid = gridOf(state);
    this.player = state.players[playerId];
    this.visible = computeVisibility(state, playerId);
    this.observe();
  }

  /** Sicht neu berechnen (nach Bewegungen) und Beobachtungen ins Gedächtnis übernehmen. */
  refresh(): void {
    this.areas = null;
    this.visible = computeVisibility(this.state, this.playerId);
    this.foreignUnitsCache = null;
    this.observe();
  }

  private areas: Int32Array | null = null;

  /**
   * Gebiets-Kennung für Landeinheiten nach eigenem Kartenwissen: erkundete Wasserfelder, Hochgebirge
   * und Klippen trennen, unerkundete Felder gelten als begehbar. Mit Segeln verbinden Küstengewässer.
   */
  landArea(tile: number): number {
    if (!this.areas) this.areas = this.computeAreas();
    return this.areas[tile];
  }

  /** Kann eine Landeinheit nach eigenem Wissen von a nach b gelangen? */
  sameLandArea(a: number, b: number): boolean {
    const x = this.landArea(a);
    return x >= 0 && x === this.landArea(b);
  }

  private computeAreas(): Int32Array {
    const grid = this.grid;
    const tiles = this.state.map.tiles;
    const explored = this.player.explored;
    const areas = new Int32Array(grid.size).fill(-1);
    const sailing = this.player.techs.includes('sailing');
    const navigation = this.player.techs.includes('navigation');
    // Mit Segeln können Landeinheiten sich auf Küstengewässer einschiffen, mit Navigation auch aufs Meer
    const open = (i: number) => {
      if (!explored[i]) return true;
      const t = tiles[i];
      if (isPassableLand(t)) return true;
      if (!isWater(t) || !sailing) return false;
      return t.terrain !== 'ocean' || navigation;
    };
    let next = 0;
    const stack: number[] = [];
    for (let start = 0; start < grid.size; start++) {
      if (areas[start] !== -1 || !open(start)) continue;
      areas[start] = next;
      stack.push(start);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const n of grid.neighbors(cur)) {
          if (areas[n] !== -1 || !open(n)) continue;
          if (explored[cur] && explored[n] && isCliff(tiles[cur], tiles[n])) continue;
          areas[n] = next;
          stack.push(n);
        }
      }
      next++;
    }
    return areas;
  }

  /** Eine eigene Einheit/Siedlung hat sich verändert (z. B. Gegner besiegt): Cache verwerfen. */
  invalidateUnits(): void {
    this.foreignUnitsCache = null;
  }

  get explored(): number[] {
    return this.player.explored;
  }

  isExplored(tile: number): boolean {
    return this.player.explored[tile] === 1;
  }

  isVisible(tile: number): boolean {
    return this.visible[tile] === 1;
  }

  /** Gelände eines erkundeten Feldes, sonst null. */
  knownTile(tile: number): Tile | null {
    return tile >= 0 && this.player.explored[tile] === 1 ? this.state.map.tiles[tile] : null;
  }

  /** Ressource, sofern erkundet und im aktuellen Zeitalter bekannt. */
  knownResource(tile: number): ResourceId | null {
    const t = this.knownTile(tile);
    if (!t || !t.resource) return null;
    return RESOURCES[t.resource].revealEra <= this.player.era ? t.resource : null;
  }

  /** Besitzer (Spieler-ID) eines erkundeten Feldes; −1 = niemand oder unbekannt. */
  knownTileOwner(tile: number): number {
    if (!this.isExplored(tile)) return -1;
    const sid = this.state.tileOwner[tile];
    if (sid < 0) return -1;
    return this.state.settlements[sid]?.owner ?? -1;
  }

  /** Feld liegt in (bekanntem) fremdem Gebiet. */
  isForeignTerritory(tile: number): boolean {
    const o = this.knownTileOwner(tile);
    return o >= 0 && o !== this.playerId;
  }

  pathOptions(extra: Partial<PathOptions> = {}): PathOptions {
    return { explored: this.player.explored, visible: this.visible, ...extra };
  }

  ownUnits(): Unit[] {
    const out: Unit[] = [];
    for (const u of Object.values(this.state.units)) if (u.owner === this.playerId) out.push(u);
    return out;
  }

  ownSettlements(): Settlement[] {
    const out: Settlement[] = [];
    for (const s of Object.values(this.state.settlements)) if (s.owner === this.playerId) out.push(s);
    return out;
  }

  /** Fremde Einheiten auf aktuell sichtbaren Feldern. */
  visibleForeignUnits(): Unit[] {
    if (!this.foreignUnitsCache) {
      const out: Unit[] = [];
      for (const u of Object.values(this.state.units)) {
        if (u.owner !== this.playerId && this.visible[u.tile] === 1) out.push(u);
      }
      this.foreignUnitsCache = out;
    }
    // Inzwischen besiegte Einheiten herausfiltern (das weiß die KI, weil sie selbst gekämpft hat)
    return this.foreignUnitsCache.filter((u) => this.state.units[u.id] === u);
  }

  /** Sichtbare Einheiten von Spielern, mit denen Krieg herrscht. */
  visibleEnemyUnits(): Unit[] {
    return this.visibleForeignUnits().filter((u) => isAtWar(this.state, this.playerId, u.owner));
  }

  /** Sichtbare kampffähige Einheiten von Kriegsgegnern. */
  visibleEnemyMilitary(): Unit[] {
    return this.visibleEnemyUnits().filter((u) => unitType(u.type).strength > 0);
  }

  /** Fremde Siedlung auf einem aktuell sichtbaren Feld. */
  visibleSettlementAt(tile: number): Settlement | undefined {
    if (!this.isVisible(tile)) return undefined;
    for (const s of Object.values(this.state.settlements)) if (s.tile === tile) return s;
    return undefined;
  }

  /** Bekannte fremde Siedlungen (zuletzt gesehener Stand, nur erkundete Felder). */
  knownForeignSettlements(): { tile: number; info: KnownSettlement }[] {
    const out: { tile: number; info: KnownSettlement }[] = [];
    if (this.mem) {
      for (const [k, info] of Object.entries(this.mem.known)) {
        const tile = Number(k);
        if (info.owner !== this.playerId && this.isExplored(tile)) out.push({ tile, info });
      }
    } else {
      for (const s of Object.values(this.state.settlements)) {
        if (s.owner !== this.playerId && this.isVisible(s.tile)) out.push({ tile: s.tile, info: { id: s.id, owner: s.owner, kind: s.kind, turn: this.state.turn } });
      }
    }
    return out;
  }

  /** Alle bekannten Siedlungsfelder (eigene + gesehene fremde). */
  knownSettlementTiles(): number[] {
    const out = this.ownSettlements().map((s) => s.tile);
    for (const k of this.knownForeignSettlements()) out.push(k.tile);
    return out;
  }

  /** Übernimmt sichtbare Siedlungen ins Gedächtnis und entfernt widerlegte Einträge. */
  private observe(): void {
    const mem = this.mem;
    if (!mem) return;
    const seen = new Set<number>();
    for (const s of Object.values(this.state.settlements)) {
      if (s.owner === this.playerId || this.visible[s.tile] !== 1) continue;
      mem.known[s.tile] = { id: s.id, owner: s.owner, kind: s.kind, turn: this.state.turn };
      seen.add(s.tile);
    }
    for (const k of Object.keys(mem.known)) {
      const tile = Number(k);
      if (seen.has(tile)) continue;
      if (this.visible[tile] === 1) {
        // sichtbar, aber keine fremde Siedlung mehr dort (zerstört oder von uns erobert)
        delete mem.known[k];
      }
    }
  }
}
