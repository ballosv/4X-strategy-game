import { ENVOY_COST } from '../core/game';
import { isPassableLand } from '../core/map/passability';
import { isAtWar } from '../core/state';
import { findPath } from '../core/systems/movement';
import { campCost } from '../core/systems/settlements';
import type { AiContext } from './context';
import { guessSettlementStrength, siegePotential } from './combat';
import { influenceReserve } from './research';
import { isMilitary } from './util';

/** Mindestrundenzahl, bevor eine KI einen Angriffskrieg beginnt. */
export const EARLIEST_WAR_TURN = 35;
/** Maximale Entfernung (Felder) eines Kriegsziels zum eigenen Reich. */
const MAX_TARGET_DISTANCE = 12;

function isMajor(ctx: AiContext, id: number): boolean {
  const k = ctx.state.players[id]?.kind;
  return k === 'ai' || k === 'human';
}

/** Gleicht das Kriegsgedächtnis mit dem tatsächlichen Status ab (z. B. Kriegserklärung an uns). */
function syncWarMemory(ctx: AiContext): void {
  const { mem, state } = ctx;
  const majorWars = ctx.situation.majorWars;
  if (mem.war && !isAtWar(state, ctx.pid, mem.war.target)) {
    // Die Gegenseite hat Frieden geschlossen: nicht sofort wieder angreifen
    mem.peaceUntil[mem.war.target] = Math.max(mem.peaceUntil[mem.war.target] ?? 0, state.turn + 25);
    mem.war = null;
  }
  if (!mem.war && majorWars.length) {
    mem.war = { target: majorWars[0], since: state.turn, startPower: ctx.situation.myPower, defensive: true };
  }
  // Gegenoffensive, wenn wir im aufgezwungenen Krieg klar überlegen sind
  if (mem.war?.defensive && ctx.player.kind === 'ai' && ctx.situation.myPower >= ctx.plan.warSuperiority * estimatedPower(ctx, mem.war.target)) {
    mem.war.defensive = false;
    mem.goals = { ...mem.goals, attack: Math.max(mem.goals.attack, 0.7) };
    ctx.goals = mem.goals;
  }
}

function estimatedPower(ctx: AiContext, other: number): number {
  const seen = ctx.situation.enemyPower[other] ?? 0;
  const settlements = ctx.view.knownForeignSettlements().filter((k) => k.info.owner === other).length;
  return Math.max(seen, settlements * 7, 6);
}

function considerPeace(ctx: AiContext): void {
  const { mem, state } = ctx;
  for (const other of ctx.situation.majorWars) {
    if (state.players[other].kind === 'machine') continue;
    const tracked = mem.war && mem.war.target === other ? mem.war : null;
    const since = tracked?.since ?? state.turn;
    const dur = state.turn - since;
    if (dur < 8) continue;
    const enemy = estimatedPower(ctx, other);
    const losing = ctx.situation.myPower < enemy * 0.8 || (mem.lostSettlementTurn >= state.turn - 3 && mem.lostSettlementTurn >= since);
    const noTarget = !ctx.view.knownForeignSettlements().some((k) => k.info.owner === other);
    const calm = (tracked?.defensive ?? true) && ctx.situation.maxThreat < 5 && dur >= 10;
    const stale = (noTarget && dur > 20) || dur > 45;
    if (losing || calm || stale) {
      if (ctx.issue({ type: 'makePeace', target: other })) {
        mem.peaceUntil[other] = state.turn + 40;
        if (tracked) mem.war = null;
      }
    }
  }
}

function considerWar(ctx: AiContext): void {
  const { mem, state, view } = ctx;
  if (ctx.player.kind !== 'ai') return;
  if (mem.war || ctx.situation.majorWars.length || state.phase === 'ai' || ctx.situation.maxThreat > 5) {
    mem.prepare = null;
    return;
  }
  // Vorbereitung beginnt etwas früher als der früheste Kriegsbeginn
  if (state.turn < EARLIEST_WAR_TURN - 10) return;
  const own = view.ownSettlements();
  if (own.length < 2) return;
  const military = view.ownUnits().filter((u) => isMilitary(u) && u.hp >= 60);
  // Für den Feldzug verfügbar: Einheiten außerhalb der Siedlungszentren (Garnisonen bleiben)
  const centers = new Set(own.map((s) => s.tile));
  const field = military.filter((u) => !centers.has(u.tile));
  const grid = view.grid;
  const aggressive = ctx.goals.military < 0.2 ? 0.9 : 1;
  let best: { target: number; tile: number; score: number } | null = null;
  for (const k of view.knownForeignSettlements()) {
    const other = k.info.owner;
    if (!isMajor(ctx, other) || !state.players[other].alive) continue;
    if ((mem.peaceUntil[other] ?? 0) > state.turn) continue;
    const dist = Math.min(...own.map((s) => grid.distance(s.tile, k.tile)));
    if (dist > MAX_TARGET_DISTANCE) continue;
    const ratio = Math.max(ctx.situation.myPower, 1) / estimatedPower(ctx, other);
    // Vorbereitung lohnt nur gegen klar schwächere Nachbarn
    if (ratio < ctx.plan.warSuperiority * aggressive * 0.75) continue;
    const score = ratio - dist * 0.08 + (k.info.kind === 'camp' ? 0.3 : 0);
    if (!best || score > best.score) best = { target: other, tile: k.tile, score };
  }
  if (!best) {
    mem.prepare = null;
    return;
  }
  const target = best;
  const ratio = Math.max(ctx.situation.myPower, 1) / estimatedPower(ctx, target.target);
  const potential = siegePotential(field, guessSettlementStrength(ctx, target.target));
  const ready = state.turn >= EARLIEST_WAR_TURN && ratio >= ctx.plan.warSuperiority * aggressive && potential >= 50 && military.length >= ctx.plan.minGroup + own.length;
  if (!ready) {
    // Aufrüsten (Ziel „Angriff“ vorbereiten); nach zu langer Vorbereitung aufgeben
    if (!mem.prepare || mem.prepare.target !== target.target) mem.prepare = { target: target.target, since: state.turn };
    else if (state.turn - mem.prepare.since > 40) {
      mem.peaceUntil[target.target] = state.turn + 30;
      mem.prepare = null;
    }
    return;
  }
  // Erreichbarkeit prüfen: Weg einer eigenen Einheit zu einem Nachbarfeld des Ziels
  const unit = (field.length ? field : military).sort((a, b) => grid.distance(a.tile, target.tile) - grid.distance(b.tile, target.tile) || a.id - b.id)[0];
  const stand = grid.neighbors(target.tile).find((t) => {
    const tile = view.knownTile(t);
    return !!tile && isPassableLand(tile) && Math.abs(tile.elevation - state.map.tiles[target.tile].elevation) < 2;
  });
  if (!unit || stand === undefined || !findPath(state, unit, stand, view.pathOptions({ maxCost: 40 }))) {
    mem.peaceUntil[target.target] = state.turn + 10;
    mem.prepare = null;
    return;
  }
  if (ctx.issue({ type: 'declareWar', target: target.target })) {
    mem.war = { target: target.target, since: state.turn, startPower: ctx.situation.myPower, defensive: false, targetTile: target.tile };
    mem.prepare = null;
    ctx.situation.wars.push(target.target);
    ctx.situation.majorWars.push(target.target);
    mem.goals = { ...mem.goals, attack: Math.max(mem.goals.attack, 0.7) };
    ctx.goals = mem.goals;
  }
}

/** Gesandte an bekannte Stadtstaaten, wenn Einfluss übrig ist. */
function sendEnvoys(ctx: AiContext): void {
  if (ctx.player.kind !== 'ai') return;
  // Erst Expansion und Aufwertungen sichern, dann überschüssigen Einfluss für Gesandte nutzen
  const reserve = influenceReserve(ctx) + campCost(ctx.state, ctx.pid) + 20;
  if (ctx.player.influence < ENVOY_COST + reserve) return;
  const known = new Set<number>();
  for (const k of ctx.view.knownForeignSettlements()) if (ctx.state.players[k.info.owner]?.kind === 'cityState') known.add(k.info.owner);
  let best = -1;
  let bestFavor = -1;
  for (const id of [...known].sort((a, b) => a - b)) {
    const cs = ctx.state.players[id];
    if (!cs.alive || isAtWar(ctx.state, ctx.pid, id)) continue;
    const favor = cs.favor[ctx.pid] ?? 0;
    const rival = Math.max(0, ...Object.entries(cs.favor).filter(([k]) => Number(k) !== ctx.pid).map(([, v]) => v));
    // Bereits sicherer Suzerän: keine weiteren Gesandten nötig
    if (favor >= 3 && (favor > rival + 2 || favor >= 25)) continue;
    if (favor > bestFavor) {
      bestFavor = favor;
      best = id;
    }
  }
  if (best >= 0) ctx.issue({ type: 'sendEnvoy', target: best });
}

export function manageDiplomacy(ctx: AiContext): void {
  if (ctx.player.kind !== 'ai' && ctx.player.kind !== 'human') return;
  syncWarMemory(ctx);
  considerPeace(ctx);
  considerWar(ctx);
  sendEnvoys(ctx);
}
