import { unitType } from '../core/data/units';
import { isWater } from '../core/map/passability';
import type { Settlement, Unit } from '../core/state';
import { canAttack, defenderAt, previewCombat } from '../core/systems/combat';
import { reachableTiles } from '../core/systems/movement';
import { hasLineOfSight } from '../core/systems/vision';
import type { AiContext } from './context';
import { isMilitary, unitPower } from './util';

/** Mögliches Angriffsziel auf einem sichtbaren Feld. */
export interface AttackTarget {
  tile: number;
  unit?: Unit;
  settlement?: Settlement;
}

export interface AttackPlan {
  target: number;
  from: number;
  score: number;
  kill: boolean;
}

export interface CombatEstimate {
  attackerDamage: number;
  defenderDamage: number;
  ranged: boolean;
}

function elevTerm(ctx: AiContext, a: number, b: number): number {
  const ta = ctx.state.map.tiles[a];
  const tb = ctx.state.map.tiles[b];
  if (isWater(ta) || isWater(tb)) return 0;
  const diff = ta.elevation - tb.elevation;
  return Math.max(-6, Math.min(6, diff * 3));
}

/**
 * Schätzt den Kampf von einem (eventuell anderen) Ausgangsfeld aus, ohne den Zustand zu verändern:
 * Ausgangspunkt ist previewCombat vom aktuellen Feld, korrigiert um Höhenunterschiede.
 */
export function estimateCombat(ctx: AiContext, u: Unit, from: number, target: number): CombatEstimate | null {
  const pv = previewCombat(ctx.state, u, target);
  if (!pv) return null;
  const def = unitType(u.type);
  const grid = ctx.view.grid;
  let atk = pv.attackerStrength;
  let dfs = pv.defenderStrength;
  let ranged = pv.ranged;
  if (from !== u.tile) {
    const dist = grid.distance(from, target);
    const newRanged = !!def.rangedStrength && !!def.range && (dist > 1 || def.unitClass === 'ranged' || def.unitClass === 'siege');
    if (newRanged !== ranged) atk += (newRanged ? (def.rangedStrength ?? def.strength) : def.strength) - (ranged ? (def.rangedStrength ?? def.strength) : def.strength);
    if (def.domain === 'land') {
      const eOld = ranged ? 0 : elevTerm(ctx, u.tile, target);
      const eNew = newRanged ? 0 : elevTerm(ctx, from, target);
      atk += eNew - eOld;
    }
    if (def.hillBonus) {
      const hill = (t: number) => (ctx.state.map.tiles[t].elevation >= 2 && !isWater(ctx.state.map.tiles[t]) ? def.hillBonus! : 0);
      atk += hill(from) - hill(u.tile);
    }
    ranged = newRanged;
    const d = defenderAt(ctx.state, u.owner, target);
    if (d?.unit && !d.settlement && unitType(d.unit.type).strength > 0) dfs += elevTerm(ctx, target, from) - elevTerm(ctx, target, u.tile);
    atk = Math.max(1, atk);
  }
  const diff = atk - dfs;
  return {
    defenderDamage: 30 * Math.exp(diff / 25),
    attackerDamage: ranged ? 0 : 30 * Math.exp(-diff / 25),
    ranged,
  };
}

/** Darf diese Einheit von from aus target angreifen (Regeln von canAttack ohne Zustand)? */
function attackGeometryOk(ctx: AiContext, u: Unit, from: number, target: number, t: AttackTarget): boolean {
  const def = unitType(u.type);
  const grid = ctx.view.grid;
  const dist = grid.distance(from, target);
  const a = ctx.state.map.tiles[from];
  const b = ctx.state.map.tiles[target];
  if (def.rangedStrength && def.range) {
    if (dist > def.range || dist < 1) return false;
    return dist <= 1 || hasLineOfSight(ctx.state, from, target);
  }
  if (dist !== 1) return false;
  if (def.domain === 'land') {
    if (isWater(a)) return false;
    if (isWater(b) && !t.settlement) return false;
    if (Math.abs(a.elevation - b.elevation) >= 2 && !isWater(b)) return false;
  }
  return true;
}

/** Sichtbare Angriffsziele (Einheiten und Siedlungen von Kriegsgegnern). */
export function visibleTargets(ctx: AiContext): AttackTarget[] {
  const out: AttackTarget[] = [];
  const seen = new Set<number>();
  for (const k of ctx.view.knownForeignSettlements()) {
    const s = ctx.view.visibleSettlementAt(k.tile);
    if (!s || s.owner === ctx.pid) continue;
    const owner = ctx.state.players[s.owner];
    if (!owner || !isAtWarWith(ctx, s.owner)) continue;
    out.push({ tile: s.tile, settlement: s });
    seen.add(s.tile);
  }
  for (const u of ctx.view.visibleEnemyUnits()) {
    if (seen.has(u.tile)) continue;
    seen.add(u.tile);
    out.push({ tile: u.tile, unit: u });
  }
  return out;
}

function isAtWarWith(ctx: AiContext, other: number): boolean {
  return ctx.situation.wars.includes(other);
}

/**
 * Bester Angriff für eine Einheit (inkl. Bewegung auf ein besseres Ausgangsfeld, bevorzugt erhöht).
 * Gibt null zurück, wenn kein Angriff lohnend ist.
 */
export function bestAttack(
  ctx: AiContext,
  u: Unit,
  targets: AttackTarget[],
  opts: { allowMove: boolean; siege: boolean; aggression?: number },
): AttackPlan | null {
  if (u.movesLeft <= 0 || u.hasAttacked || !isMilitary(u)) return null;
  const def = unitType(u.type);
  const grid = ctx.view.grid;
  const range = def.rangedStrength && def.range ? def.range : 1;
  const maxReach = opts.allowMove ? u.movesLeft + range + 1 : range;
  const near = targets.filter((t) => grid.distance(u.tile, t.tile) <= maxReach);
  if (!near.length) return null;
  let reach: Map<number, number> | null = null;
  const enemies = ctx.lookaheadEnemies ?? [];
  let best: AttackPlan | null = null;
  const aggression = opts.aggression ?? 1;
  for (const t of near) {
    const froms: number[] = [];
    if (attackGeometryOk(ctx, u, u.tile, t.tile, t)) froms.push(u.tile);
    if (opts.allowMove) {
      reach ??= reachableTiles(ctx.state, u, ctx.view.visible);
      for (const [tile, left] of reach) {
        if (left <= 0) continue;
        if (grid.distance(tile, t.tile) > range) continue;
        if (!ctx.view.isExplored(tile)) continue;
        if (attackGeometryOk(ctx, u, tile, t.tile, t)) froms.push(tile);
        if (froms.length >= ctx.plan.candidateCap) break;
      }
    }
    for (const from of froms) {
      const est = estimateCombat(ctx, u, from, t.tile);
      if (!est) continue;
      const defHp = t.settlement ? t.settlement.hp : (t.unit?.hp ?? 100);
      const civilian = t.unit ? unitType(t.unit.type).strength === 0 : false;
      const dmgDef = civilian ? 100 : est.defenderDamage;
      const kill = 0.85 * dmgDef >= defHp;
      const dieRisk = 1.2 * est.attackerDamage >= u.hp;
      if (dieRisk) continue;
      const myValue = unitPower(u) + 5;
      const targetValue = t.settlement ? 45 : t.unit ? unitPower(t.unit) + (civilian ? 20 : 5) : 10;
      const capture = !!t.settlement && kill && !est.ranged && def.abilities.includes('capture');
      let score = (Math.min(dmgDef, defHp) / 100) * targetValue + (kill ? targetValue * 0.8 : 0) + (capture ? 120 : 0);
      score -= (est.attackerDamage / 100) * myValue * 1.2;
      // Beschlossener Sturm: Einzelverluste werden für den gemeinsamen Erfolg in Kauf genommen
      if (opts.siege && t.settlement) score += 35 + 30 * (1 - t.settlement.hp / 100);
      score += ctx.state.map.tiles[from].elevation * 0.6;
      if (from !== u.tile) score -= 0.5;
      // Vorausschau: Gegner, die das Ausgangsfeld danach erreichen können
      if (ctx.plan.lookahead && enemies.length) {
        let exposure = 0;
        for (const e of enemies) {
          if (e.id === t.unit?.id && kill) continue;
          if (grid.distance(e.tile, from) <= 2) exposure += unitPower(e);
        }
        const hpAfter = Math.max(1, u.hp - est.attackerDamage);
        score -= (exposure / Math.max(1, unitPower(u))) * (100 - hpAfter) * 0.08;
      }
      // Nadelstiche gegen Siedlungen lohnen nicht (sie heilen 15 LP je Runde)
      if (!kill && dmgDef < (t.settlement ? (opts.siege ? 3 : 14) : 6)) continue;
      const ratioOk = kill || est.ranged || dmgDef * aggression >= ctx.plan.attackRatio * est.attackerDamage ||
        // Sturm auf eine bereits geschwächte Siedlung (Fernkämpfer haben vorgearbeitet)
        (opts.siege && !!t.settlement && u.hp >= 80);
      if (!ratioOk || score <= 0) continue;
      if (!best || score > best.score) best = { target: t.tile, from, score, kill };
    }
  }
  return best;
}

/** Führt einen Angriffsplan aus (Bewegung + Angriff). */
export function executeAttack(ctx: AiContext, u: Unit, plan: AttackPlan): boolean {
  if (plan.from !== u.tile) {
    if (!ctx.issue({ type: 'move', unitId: u.id, target: plan.from })) return false;
    if (!ctx.state.units[u.id] || u.tile !== plan.from || u.movesLeft <= 0) return false;
  }
  if (!ctx.state.units[u.id] || canAttack(ctx.state, u, plan.target)) return false;
  const ok = ctx.issue({ type: 'attack', unitId: u.id, target: plan.target });
  ctx.view.invalidateUnits();
  return ok;
}

/**
 * Erwarteter Gesamtschaden einer Gruppe gegen eine sichtbare Siedlung in dieser Runde.
 * Ein Sturm lohnt nur, wenn die Gruppe die Heilung (15 LP/Runde) deutlich übertrifft.
 */
export function assaultDamage(ctx: AiContext, group: Unit[], s: Settlement): number {
  const grid = ctx.view.grid;
  let total = 0;
  for (const u of group) {
    const def = unitType(u.type);
    const range = def.rangedStrength && def.range ? def.range : 1;
    if (grid.distance(u.tile, s.tile) > range + 1 || u.hp < 40) continue;
    const est = estimateCombat(ctx, u, u.tile, s.tile);
    if (est) total += est.defenderDamage * 0.9;
  }
  return total;
}

/** Grobe Schätzung der Verteidigungsstärke einer fremden Siedlung (nur öffentliches Wissen: Zeitalter). */
export function guessSettlementStrength(ctx: AiContext, owner: number): number {
  const era = ctx.state.players[owner]?.era ?? 0;
  // grobe Schätzung analog settlementStrength: Basis, Zeitalter, typische Befestigung, Garnison, Größe
  return 6 + era * 6 + 6 + 4 * era + 4 + 3;
}

/** Erwarteter Schaden der stärksten eigenen Einheiten gegen eine Siedlung dieser Stärke (je Runde). */
export function siegePotential(units: Unit[], strength: number, count = 8): number {
  const powers = units
    .map((u) => Math.max(unitType(u.type).strength, unitType(u.type).rangedStrength ?? 0) * (0.5 + 0.5 * (u.hp / 100)))
    .sort((a, b) => b - a)
    .slice(0, count);
  return powers.reduce((a, p) => a + 30 * Math.exp((p - strength) / 25), 0);
}
