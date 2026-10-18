import { GOODS, addStock, stockOf, type GoodId } from '../data/goods';
import { unitType } from '../data/units';
import { gridOf, hasTech } from '../context';
import { isPassableLand } from '../map/passability';
import { Rng } from '../rng';
import { addLog, playerSettlements, type CityStateQuest, type CityStateType, type GameState, type Player } from '../state';

/**
 * Stadtstaaten (Civilization-Prinzip): Unabhängige Siedlungen mit eigenem Typ.
 * Völker gewinnen Gunst durch Gesandte und erfüllte Aufträge. Ab 3 Gunst ist man Freund,
 * mit der höchsten Gunst (mind. 6) Suzerän – beides bringt typabhängige Boni.
 */

export const FRIEND_FAVOR = 3;
export const SUZERAIN_FAVOR = 6;
export const QUEST_FAVOR = 3;
export const QUEST_INTERVAL = 12;

export interface CityStateTypeDef {
  id: CityStateType;
  name: string;
  icon: string;
  friend: string;
  suzerain: string;
}

export const CITY_STATE_TYPES: Record<CityStateType, CityStateTypeDef> = {
  trade: { id: 'trade', name: 'Handelsstadt', icon: '⚖️', friend: '+2 Gold je Runde', suzerain: '+5 Gold je Runde' },
  science: { id: 'science', name: 'Gelehrtenstadt', icon: '📖', friend: '+1 Entwicklung je Runde', suzerain: '+3 Entwicklung je Runde' },
  culture: { id: 'culture', name: 'Kulturstadt', icon: '✴️', friend: '+1 Einfluss je Runde', suzerain: '+3 Einfluss je Runde' },
  industry: { id: 'industry', name: 'Handwerksstadt', icon: '🔨', friend: '+1 Werkzeug alle 2 Runden', suzerain: '+1 Werkzeug und +1 Bretter je Runde' },
  military: { id: 'military', name: 'Söldnerstadt', icon: '🛡️', friend: '+1 Gold je Runde', suzerain: 'Alle 10 Runden eine Einheit als Verstärkung' },
};

export const CITY_STATE_TYPE_ORDER: CityStateType[] = ['trade', 'science', 'culture', 'industry', 'military'];

export function suzerainOf(cs: Player): number | null {
  let best: number | null = null;
  let bestFavor = SUZERAIN_FAVOR - 1;
  let tie = false;
  for (const [k, v] of Object.entries(cs.favor)) {
    if (v > bestFavor) {
      best = Number(k);
      bestFavor = v;
      tie = false;
    } else if (v === bestFavor && best !== null) tie = true;
  }
  return tie ? null : best;
}

export function relationTo(cs: Player, playerId: number): 'suzerain' | 'friend' | 'neutral' {
  if (suzerainOf(cs) === playerId) return 'suzerain';
  return (cs.favor[playerId] ?? 0) >= FRIEND_FAVOR ? 'friend' : 'neutral';
}

/** Erzeugt einen neuen Auftrag: Lieferung eines Gutes, das im aktuellen Zeitalter verfügbar ist. */
export function newQuest(state: GameState, cs: Player): CityStateQuest {
  const rng = new Rng(state.turn * 7919 + cs.id * 104729);
  const era = Math.max(...state.players.filter((p) => p.kind === 'ai' || p.kind === 'human').map((p) => p.era), 0);
  const pool: GoodId[] = era >= 5 ? ['steel', 'machines', 'clothing', 'bricks'] : era >= 3 ? ['tools', 'cloth', 'bricks', 'weapons', 'planks'] : era >= 1 ? ['tools', 'planks', 'stone', 'wool', 'bronze'] : ['wood', 'stone', 'tools'];
  const good = rng.pick(pool);
  const amount = Math.max(2, Math.round(12 / GOODS[good].basePrice) + rng.int(0, 2));
  return { good, amount, until: state.turn + QUEST_INTERVAL };
}

export function canFulfillQuest(state: GameState, playerId: number, csId: number): string | null {
  const cs = state.players[csId];
  if (!cs || cs.kind !== 'cityState' || !cs.alive) return 'Kein Stadtstaat';
  const q = cs.quest;
  if (!q) return 'Kein Auftrag offen';
  if (cs.relations[playerId] === 'war' || state.players[playerId].relations[csId] === 'war') return 'Krieg mit dem Stadtstaat';
  if (stockOf(state.players[playerId].stock, q.good) < q.amount) return `Benötigt ${q.amount} ${GOODS[q.good].name}`;
  return null;
}

export function fulfillQuest(state: GameState, playerId: number, csId: number): void {
  const cs = state.players[csId];
  const q = cs.quest!;
  addStock(state.players[playerId].stock, q.good, -q.amount);
  cs.favor[playerId] = (cs.favor[playerId] ?? 0) + QUEST_FAVOR;
  cs.quest = null;
  addLog(state, { player: playerId, kind: 'diplomacy', text: `Auftrag für ${cs.name} erfüllt (+${QUEST_FAVOR} Gunst).` });
}

/** Zug eines Stadtstaates: Aufträge, Gunstverfall und Boni für Freunde und Suzerän. */
export function processCityState(state: GameState, csId: number): void {
  const cs = state.players[csId];
  if (!cs.cityStateType) cs.cityStateType = CITY_STATE_TYPE_ORDER[csId % CITY_STATE_TYPE_ORDER.length];
  if (!cs.quest || state.turn > cs.quest.until) cs.quest = newQuest(state, cs);
  // Gunst verfällt langsam
  if (state.turn % 15 === 0) for (const k of Object.keys(cs.favor)) cs.favor[Number(k)] = Math.max(0, cs.favor[Number(k)] - 1);
  const suz = suzerainOf(cs);
  for (const [k, v] of Object.entries(cs.favor)) {
    const pid = Number(k);
    const p = state.players[pid];
    if (!p?.alive || v < FRIEND_FAVOR) continue;
    const isSuz = pid === suz;
    switch (cs.cityStateType) {
      case 'trade':
        p.gold += isSuz ? 5 : 2;
        break;
      case 'science':
        p.research.progress += isSuz ? 3 : 1;
        break;
      case 'culture':
        p.influence += isSuz ? 3 : 1;
        break;
      case 'industry':
        if (isSuz) {
          addStock(p.stock, 'tools', 1);
          addStock(p.stock, 'planks', 1);
        } else if (state.turn % 2 === 0) addStock(p.stock, 'tools', 1);
        break;
      case 'military':
        if (isSuz && state.turn % 10 === 0) grantLevy(state, cs, pid);
        else if (!isSuz) p.gold += 1;
        break;
    }
  }
}

/** Söldnerstadt: Suzerän erhält eine Einheit seines Zeitalters neben dem Stadtstaat. */
function grantLevy(state: GameState, cs: Player, pid: number): void {
  const home = playerSettlements(state, cs.id)[0];
  if (!home) return;
  const options = ['clubman', 'spearman', 'swordsman', 'pikeman', 'musketeer', 'rifleman', 'infantry', 'mechInfantry', 'exoSoldier'];
  const type = [...options].reverse().find((id) => hasTech(state, pid, unitType(id).tech)) ?? 'clubman';
  const grid = gridOf(state);
  const occupied = new Set(Object.values(state.units).map((u) => u.tile));
  const tile = grid.range(home.tile, 2).find((t) => t !== home.tile && isPassableLand(state.map.tiles[t]) && !occupied.has(t));
  if (tile === undefined) return;
  levyHook?.(state, pid, type, tile);
  addLog(state, { player: pid, kind: 'diplomacy', text: `${cs.name} schickt als Verbündeter eine Einheit: ${unitType(type).name}.`, tile });
}

/** Wird von game.ts gesetzt (Einheit erzeugen ohne zirkulären Import). */
export let levyHook: ((state: GameState, owner: number, type: string, tile: number) => void) | null = null;
export function setLevyHook(fn: typeof levyHook): void {
  levyHook = fn;
}

// ---------------------------------------------------------------------------
// Gebietskauf mit Einfluss

export function claimTileCost(state: GameState, playerId: number, tile: number): number {
  const grid = gridOf(state);
  const nearest = Math.min(...playerSettlements(state, playerId).map((s) => grid.distance(s.tile, tile)));
  return 6 + state.players[playerId].era * 2 + Math.max(0, nearest - 1) * 2;
}

/** Liegt das Feld grundsätzlich für einen Gebietskauf in Reichweite (ohne Kostenprüfung)? */
export function isClaimCandidate(state: GameState, playerId: number, tile: number): boolean {
  const err = canClaimTile(state, playerId, tile);
  return err === null || err.startsWith('Benötigt');
}

export function canClaimTile(state: GameState, playerId: number, tile: number): string | null {
  if (state.tileOwner[tile] !== -1) return 'Feld gehört bereits einer Siedlung';
  const grid = gridOf(state);
  const own = playerSettlements(state, playerId);
  if (!own.length) return 'Keine Siedlung';
  if (Math.min(...own.map((s) => grid.distance(s.tile, tile))) > 3) return 'Zu weit von der nächsten Siedlung (max. 3 Felder)';
  if (!grid.neighbors(tile).some((n) => state.tileOwner[n] >= 0 && state.settlements[state.tileOwner[n]]?.owner === playerId)) return 'Muss an eigenes Gebiet grenzen';
  const cost = claimTileCost(state, playerId, tile);
  if (state.players[playerId].influence < cost) return `Benötigt ${cost} Einfluss`;
  return null;
}

export function claimTile(state: GameState, playerId: number, tile: number): void {
  const grid = gridOf(state);
  state.players[playerId].influence -= claimTileCost(state, playerId, tile);
  const owner = playerSettlements(state, playerId).sort((a, b) => grid.distance(a.tile, tile) - grid.distance(b.tile, tile) || a.id - b.id)[0];
  state.tileOwner[tile] = owner.id;
}
