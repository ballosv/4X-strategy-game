import { BUILDINGS } from '../data/buildings';
import { FEATURES } from '../data/terrain';
import { unitType, type UnitTypeDef } from '../data/units';
import { gridOf, playerModifiers } from '../context';
import { isWater } from '../map/passability';
import { Rng } from '../rng';
import { addLog, isAtWar, settlementAt, tileOwnerPlayer, totalPop, type GameState, type Settlement, type Unit } from '../state';
import { hasLineOfSight } from './vision';

export const MAX_HP = 100;
export const SETTLEMENT_MAX_HP = 100;

export function experienceLevel(xp: number): number {
  return Math.min(5, Math.floor(xp / 15));
}

export interface StrengthBreakdown {
  total: number;
  parts: { label: string; value: number }[];
}

function elevationOf(state: GameState, tile: number): number {
  return state.map.tiles[tile].elevation;
}

/** Kampfstärke einer Einheit in einer konkreten Situation (mit Aufschlüsselung für die UI). */
export function unitStrength(
  state: GameState,
  unit: Unit,
  role: 'attack' | 'defend',
  opts: { ranged?: boolean; opponentTile?: number; opponent?: UnitTypeDef } = {},
): StrengthBreakdown {
  const def = unitType(unit.type);
  const parts: { label: string; value: number }[] = [];
  const base = opts.ranged ? (def.rangedStrength ?? def.strength) : def.strength;
  parts.push({ label: 'Grundstärke', value: base });
  const tile = state.map.tiles[unit.tile];
  const mods = playerModifiers(state, unit.owner);
  if (def.domain === 'land' && isWater(tile)) {
    parts.push({ label: 'Eingeschifft', value: -Math.round(base * 0.6) });
  }
  if (def.hillBonus && tile.elevation >= 2 && !isWater(tile)) parts.push({ label: 'Höhenvorteil', value: def.hillBonus });
  if (role === 'attack' && mods.attackBonus) parts.push({ label: 'Mentalität', value: mods.attackBonus });
  if (role === 'defend') {
    if (tile.feature && def.domain === 'land') parts.push({ label: FEATURES[tile.feature].name, value: FEATURES[tile.feature].defense });
    if (unit.status === 'fortified' && unit.fortifyTurns > 0) parts.push({ label: 'Befestigt', value: Math.min(2, unit.fortifyTurns) * 3 });
    if (mods.defenseInTerritory && tileOwnerPlayer(state, unit.tile) === unit.owner) parts.push({ label: 'Heimatgebiet', value: mods.defenseInTerritory });
  }
  if (opts.opponentTile !== undefined && def.domain === 'land' && !opts.ranged) {
    const diff = elevationOf(state, unit.tile) - elevationOf(state, opts.opponentTile);
    if (diff !== 0 && !isWater(state.map.tiles[opts.opponentTile]) && !isWater(tile)) {
      parts.push({ label: diff > 0 ? 'Erhöhte Position' : 'Tiefere Position', value: Math.max(-6, Math.min(6, diff * 3)) });
    }
  }
  if (opts.opponent && def.versus && def.versus.unitClass === opts.opponent.unitClass) parts.push({ label: `gegen ${opts.opponent.typeName}`, value: def.versus.bonus });
  const lvl = experienceLevel(unit.xp);
  if (lvl) parts.push({ label: 'Erfahrung', value: lvl });
  const hpPenalty = -Math.round((MAX_HP - unit.hp) / 10);
  if (hpPenalty) parts.push({ label: 'Verwundet', value: hpPenalty });
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  return { total, parts };
}

export function settlementStrength(state: GameState, s: Settlement): number {
  const player = state.players[s.owner];
  const walls = s.buildings.reduce((sum, b) => sum + (BUILDINGS[b]?.defense ?? 0), 0);
  let garrison = 0;
  for (const u of Object.values(state.units)) {
    if (u.tile === s.tile && u.owner === s.owner) garrison = Math.max(garrison, unitType(u.type).strength);
  }
  const elevationBonus = Math.min(6, (state.map.tiles[s.tile].elevation - 1) * 2);
  return 8 + player.era * 9 + walls + Math.round(garrison * 0.5) + Math.min(8, totalPop(s.pop)) + elevationBonus;
}

function damage(diff: number, rng: Rng): number {
  return Math.round(30 * Math.exp(diff / 25) * (0.8 + rng.next() * 0.4));
}

export interface CombatPreview {
  attackerStrength: number;
  defenderStrength: number;
  attackerDamage: number;
  defenderDamage: number;
  ranged: boolean;
}

export interface CombatResult extends CombatPreview {
  attackerDied: boolean;
  defenderDied: boolean;
  captured: boolean;
}

export function canAttack(state: GameState, unit: Unit, target: number): string | null {
  const def = unitType(unit.type);
  if (def.strength <= 0) return 'Nicht kampffähig';
  if (unit.hasAttacked) return 'Hat bereits angegriffen';
  if (unit.movesLeft <= 0) return 'Keine Bewegung übrig';
  const grid = gridOf(state);
  const dist = grid.distance(unit.tile, target);
  const ranged = !!def.rangedStrength && !!def.range;
  const defender = defenderAt(state, unit.owner, target);
  if (!defender) return 'Kein Ziel';
  if (!isAtWar(state, unit.owner, defender.owner)) return 'Kein Krieg mit diesem Spieler';
  if (ranged) {
    if (dist > (def.range ?? 1)) return 'Außer Reichweite';
    if (dist > 1 && !hasLineOfSight(state, unit.tile, target)) return 'Keine Sichtlinie';
    return null;
  }
  if (dist !== 1) return 'Nicht benachbart';
  const a = state.map.tiles[unit.tile];
  const b = state.map.tiles[target];
  if (def.domain === 'land') {
    if (isWater(a)) return 'Angriff aus dem Wasser nicht möglich';
    if (isWater(b) && !defender.settlement) return 'Ziel liegt im Wasser';
    if (Math.abs(a.elevation - b.elevation) >= 2 && !isWater(b)) return 'Klippe dazwischen';
  }
  if (def.domain === 'sea' && !isWater(b) && !defender.settlement) return 'Schiffe greifen nur Küstenziele an';
  return null;
}

export interface Defender {
  owner: number;
  unit?: Unit;
  settlement?: Settlement;
}

/** Wer verteidigt ein Feld? Militärische Einheit vor Siedlung vor Zivilist. */
export function defenderAt(state: GameState, attackerOwner: number, tile: number): Defender | null {
  const units = Object.values(state.units).filter((u) => u.tile === tile && u.owner !== attackerOwner);
  const military = units.filter((u) => unitType(u.type).strength > 0).sort((a, b) => unitType(b.type).strength - unitType(a.type).strength);
  const s = settlementAt(state, tile);
  if (s && s.owner !== attackerOwner) {
    // Siedlung mit Garnison: die Siedlung verteidigt (Garnison stärkt sie)
    return { owner: s.owner, settlement: s };
  }
  if (military.length) return { owner: military[0].owner, unit: military[0] };
  if (units.length) return { owner: units[0].owner, unit: units[0] };
  return null;
}

export function previewCombat(state: GameState, unit: Unit, target: number): CombatPreview | null {
  const defender = defenderAt(state, unit.owner, target);
  if (!defender) return null;
  const def = unitType(unit.type);
  const dist = gridOf(state).distance(unit.tile, target);
  const ranged = !!def.rangedStrength && dist >= 1 && !!def.range && (dist > 1 || def.unitClass === 'ranged' || def.unitClass === 'siege');
  const opponent = defender.unit ? unitType(defender.unit.type) : undefined;
  const atk = unitStrength(state, unit, 'attack', { ranged, opponentTile: target, opponent }).total;
  let dfs: number;
  if (defender.settlement) dfs = settlementStrength(state, defender.settlement);
  else if (defender.unit && unitType(defender.unit.type).strength === 0) dfs = 1;
  else dfs = unitStrength(state, defender.unit!, 'defend', { opponentTile: unit.tile, opponent: def }).total;
  const diff = atk - dfs;
  return {
    attackerStrength: atk,
    defenderStrength: dfs,
    defenderDamage: Math.round(30 * Math.exp(diff / 25)),
    attackerDamage: ranged ? 0 : Math.round(30 * Math.exp(-diff / 25)),
    ranged,
  };
}

/** Führt einen Angriff aus. Voraussetzung: canAttack(...) === null. */
export function resolveAttack(state: GameState, unit: Unit, target: number): CombatResult {
  const rng = new Rng(state.rngState);
  const preview = previewCombat(state, unit, target)!;
  const defender = defenderAt(state, unit.owner, target)!;
  const diff = preview.attackerStrength - preview.defenderStrength;
  const defenderDamage = damage(diff, rng);
  const attackerDamage = preview.ranged ? 0 : damage(-diff, rng);
  state.rngState = rng.state;
  const attacker = state.players[unit.owner];
  const victim = state.players[defender.owner];
  let defenderDied = false;
  let captured = false;

  unit.hasAttacked = true;
  unit.movesLeft = 0;
  unit.status = 'ready';
  unit.xp += 5;
  unit.hp -= attackerDamage;

  if (defender.settlement) {
    const s = defender.settlement;
    s.hp = Math.max(0, s.hp - defenderDamage);
    // Garnison erleidet einen Teil des Schadens
    for (const g of Object.values(state.units)) if (g.tile === s.tile && g.owner === s.owner) g.hp = Math.max(1, g.hp - Math.round(defenderDamage / 3));
    if (s.hp <= 0 && !preview.ranged && unitType(unit.type).abilities.includes('capture') && unit.hp > 0) {
      captureSettlement(state, s, unit);
      captured = true;
    }
    addLog(state, {
      player: unit.owner,
      kind: 'combat',
      text: captured ? `${s.name} wurde von ${attacker.name} erobert!` : `${unitType(unit.type).name} greift ${s.name} an (−${defenderDamage} LP).`,
      tile: target,
    });
  } else if (defender.unit) {
    const d = defender.unit;
    const civilian = unitType(d.type).strength === 0;
    d.hp -= civilian ? 100 : defenderDamage;
    d.xp += 3;
    if (d.hp <= 0) {
      defenderDied = true;
      delete state.units[d.id];
      attacker.stats.unitsKilled++;
      victim.stats.unitsLost++;
      addLog(state, { player: unit.owner, kind: 'combat', text: `${unitType(unit.type).name} besiegt ${unitType(d.type).name} (${victim.name}).`, tile: target });
      // Nahkämpfer rücken auf das freie Feld vor
      if (!preview.ranged && unit.hp > 0 && !Object.values(state.units).some((o) => o.tile === target) && !settlementAt(state, target)) {
        const t = state.map.tiles[target];
        if (!(unitType(unit.type).domain === 'land' && isWater(t))) unit.tile = target;
      }
    } else {
      addLog(state, { player: unit.owner, kind: 'combat', text: `${unitType(unit.type).name} greift ${unitType(d.type).name} an (−${defenderDamage} LP).`, tile: target });
    }
  }

  const attackerDied = unit.hp <= 0;
  if (attackerDied) {
    delete state.units[unit.id];
    attacker.stats.unitsLost++;
    victim.stats.unitsKilled++;
    addLog(state, { player: unit.owner, kind: 'combat', text: `${unitType(unit.type).name} ist im Kampf gefallen.`, tile: unit.tile });
  }
  return { ...preview, attackerDamage, defenderDamage, attackerDied, defenderDied, captured };
}

/** Übernahme einer Siedlung; fremde Einheiten auf dem Feld werden vernichtet. */
export function captureSettlement(state: GameState, s: Settlement, by: Unit): void {
  const oldOwner = s.owner;
  for (const u of Object.values(state.units)) if (u.tile === s.tile && u.owner !== by.owner) delete state.units[u.id];
  s.owner = by.owner;
  s.isCapital = false;
  s.hp = 50;
  s.queue = [];
  s.laborProgress = 0;
  if (s.pop.workers > 1) s.pop.workers--;
  by.tile = s.tile;
  state.players[by.owner].stats.settlementsCaptured++;
  // Verlust der Hauptstadt: nächstgrößte Siedlung wird Hauptstadt
  const remaining = Object.values(state.settlements).filter((o) => o.owner === oldOwner);
  if (remaining.length && !remaining.some((o) => o.isCapital)) {
    remaining.sort((a, b) => totalPop(b.pop) - totalPop(a.pop))[0].isCapital = true;
  }
  if (!Object.values(state.settlements).some((o) => o.owner === by.owner && o.isCapital)) s.isCapital = true;
}

/** Heilung zu Beginn der Runde eines Spielers. */
export function healUnits(state: GameState, playerId: number): void {
  const mods = playerModifiers(state, playerId);
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId || u.hp >= MAX_HP) continue;
    const s = settlementAt(state, u.tile);
    let heal = 5;
    if (tileOwnerPlayer(state, u.tile) === playerId) heal = 10;
    if (s && s.owner === playerId) heal = 20;
    if (u.status === 'fortified') heal += 5;
    heal += mods.healBonus ?? 0;
    u.hp = Math.min(MAX_HP, u.hp + heal);
  }
  for (const s of Object.values(state.settlements)) {
    if (s.owner === playerId && s.hp < SETTLEMENT_MAX_HP) s.hp = Math.min(SETTLEMENT_MAX_HP, s.hp + 15);
  }
}
