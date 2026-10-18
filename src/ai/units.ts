import { nextAutoRoadTile } from '../core/systems/transport';
import { unitType, type UnitTypeDef } from '../core/data/units';
import type { UnitActionId } from '../core/game';
import { isPassableLand } from '../core/map/passability';
import type { Settlement, Unit } from '../core/state';
import { MAX_HP } from '../core/systems/combat';
import { campCost, canFoundAt } from '../core/systems/settlements';
import { assaultDamage, bestAttack, executeAttack, visibleTargets, type AttackTarget } from './combat';
import type { AiContext } from './context';
import type { UnitTask } from './memory';
import { MIN_SITE_SCORE } from './strategy';
import { isFounder, isMilitary, isValidSite, landReach, nearest, siteScore, unitPower } from './util';

// ---------------------------------------------------------------------------
// Hilfen

function alive(ctx: AiContext, u: Unit): boolean {
  return ctx.state.units[u.id] === u && u.owner === ctx.pid;
}

function act(ctx: AiContext, u: Unit, action: UnitActionId): boolean {
  return ctx.issue({ type: 'unitAction', unitId: u.id, action });
}

/** Bewegt eine Einheit (mehrrundig über das Ziel); merkt sich gescheiterte Ziele nicht doppelt. */
function moveTo(ctx: AiContext, u: Unit, target: number): boolean {
  if (u.tile === target) return true;
  if (u.movesLeft <= 0) return u.destination === target;
  const key = `${u.id}:${target}`;
  if (ctx.mem.unreachable[key] !== undefined) return false;
  if (unitType(u.type).domain === 'land' && !ctx.view.sameLandArea(u.tile, target)) return false;
  const before = u.tile;
  const movesBefore = u.movesLeft;
  const ok = ctx.issue({ type: 'move', unitId: u.id, target });
  // Kein Fortschritt (z. B. Engpass durch eigene Einheiten): Ziel vorerst meiden
  const stuck = ok && alive(ctx, u) && u.tile === before && u.movesLeft === movesBefore;
  if (!ok || stuck) ctx.mem.unreachable[key] = ctx.state.turn;
  return ok && !stuck;
}

/** Wurde dieses Ziel für die Einheit kürzlich als unerreichbar erkannt? */
export function knownUnreachable(ctx: AiContext, u: Unit, target: number): boolean {
  if (unitType(u.type).domain === 'land' && !ctx.view.sameLandArea(u.tile, target)) return true;
  return ctx.mem.unreachable[`${u.id}:${target}`] !== undefined;
}

function fortifyHere(ctx: AiContext, u: Unit): void {
  if (u.status === 'fortified' || u.status === 'sentry') return;
  if (unitType(u.type).strength > 0) act(ctx, u, 'fortify');
}

/** Freies, begehbares Feld neben einem Ziel (bevorzugt erhöht, mit Wald), für Landeinheiten. */
function standingTileNear(ctx: AiContext, u: Unit, center: number, taken: Set<number>): number {
  const grid = ctx.view.grid;
  let best = -1;
  let bestScore = -Infinity;
  for (const t of grid.neighbors(center)) {
    const tile = ctx.view.knownTile(t);
    if (!tile || !isPassableLand(tile) || taken.has(t)) continue;
    if (ctx.view.visibleSettlementAt(t) || knownUnreachable(ctx, u, t)) continue;
    const occupied = Object.values(ctx.state.units).some((o) => o.tile === t && o.id !== u.id && (o.owner !== ctx.pid ? ctx.view.isVisible(t) : isMilitary(o) === isMilitary(u)));
    if (occupied) continue;
    let score = tile.elevation * 2 + (tile.feature === 'forest' || tile.feature === 'denseForest' || tile.feature === 'rocks' ? 2 : 0);
    if (Math.abs(tile.elevation - ctx.state.map.tiles[center].elevation) >= 2) score -= 5; // Klippe zum Zentrum
    score -= grid.distance(u.tile, t) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

function enemyMilitaryNear(ctx: AiContext, tile: number, radius: number): Unit[] {
  const grid = ctx.view.grid;
  return ctx.view.visibleEnemyMilitary().filter((e) => grid.distance(e.tile, tile) <= radius);
}

/** Nächste eigene Siedlung, deren Zentrum für diese Einheit frei ist. */
function safeHaven(ctx: AiContext, u: Unit): Settlement | undefined {
  const mil = isMilitary(u);
  const reachable = ctx.view.ownSettlements().filter((s) => !knownUnreachable(ctx, u, s.tile));
  const free = reachable.filter(
    (s) => !Object.values(ctx.state.units).some((o) => o.tile === s.tile && o.id !== u.id && o.owner === ctx.pid && isMilitary(o) === mil),
  );
  return nearest(ctx, u.tile, free.length ? free : reachable, (s) => s.tile);
}

// ---------------------------------------------------------------------------
// Siedler und Stämme

function foundAction(def: UnitTypeDef): UnitActionId {
  return def.abilities.includes('foundSettlement') ? 'foundSettlement' : 'foundCamp';
}

function tryFound(ctx: AiContext, u: Unit): boolean {
  if (canFoundAt(ctx.state, ctx.pid, u.tile)) return false;
  const ok = act(ctx, u, foundAction(unitType(u.type)));
  if (ok) delete ctx.mem.tasks[u.id];
  return ok;
}

/** Erster Stamm: in den ersten Runden einen guten Lagerplatz in der Nähe wählen und gründen. */
function handleFirstCamp(ctx: AiContext, u: Unit): void {
  const { state, mem } = ctx;
  const task = mem.tasks[u.id];
  if (task && (u.tile === task.target || state.turn >= 4)) {
    if (tryFound(ctx, u)) return;
  }
  if (!task) {
    const here = siteScore(ctx.view, u.tile);
    const reach = landReach(ctx, u, 2);
    let best = u.tile;
    let bestScore = here;
    for (const [t, d] of reach) {
      if (t === u.tile || !isValidSite(ctx, t)) continue;
      if (Object.values(state.units).some((o) => o.tile === t && o.owner !== ctx.pid && ctx.view.isVisible(t))) continue;
      const sc = siteScore(ctx.view, t) - d * 1.2;
      if (sc > bestScore + 1) {
        bestScore = sc;
        best = t;
      }
    }
    if (best === u.tile || state.turn >= 3) {
      if (tryFound(ctx, u)) return;
    }
    mem.tasks[u.id] = { kind: 'firstCamp', target: best, since: state.turn };
  }
  const target = mem.tasks[u.id]?.target ?? u.tile;
  if (target !== u.tile && u.movesLeft > 0) {
    if (!moveTo(ctx, u, target)) {
      mem.tasks[u.id] = { kind: 'firstCamp', target: u.tile, since: state.turn };
    }
  }
  if (alive(ctx, u) && (u.tile === target || state.turn >= 4)) {
    if (tryFound(ctx, u)) return;
    // Platz ungültig (z. B. zu nah an einer unbekannten Siedlung): Nachbarfeld versuchen
    if (state.turn >= 4 && u.movesLeft > 0) {
      ctx.mem.badSites.push(u.tile);
      const alt = ctx.view.grid.neighbors(u.tile).find((t) => isValidSite(ctx, t));
      if (alt !== undefined) {
        mem.tasks[u.id] = { kind: 'firstCamp', target: alt, since: state.turn };
        moveTo(ctx, u, alt);
      }
    }
  }
}

/** Sucht einen erreichbaren, guten Siedlungsplatz für einen Siedler. */
function pickSite(ctx: AiContext, u: Unit): number {
  const { view, mem } = ctx;
  const grid = view.grid;
  const known = view.knownSettlementTiles();
  const own = view.ownSettlements().map((s) => s.tile);
  const otherTargets = Object.entries(mem.tasks)
    .filter(([id, t]) => Number(id) !== u.id && t.kind === 'settle')
    .map(([, t]) => t.target);
  const reach = landReach(ctx, u, ctx.plan.siteSearchSteps);
  const foreignVisible = new Set(view.visibleForeignUnits().map((o) => o.tile));
  // bevorzugt Plätze aus der Strategiebewertung, sonst alle erreichbaren Felder
  const preferred = new Set(mem.sites);
  let best = -1;
  let bestScore = -Infinity;
  for (const [t, d] of reach) {
    if (!isValidSite(ctx, t, known)) continue;
    if (foreignVisible.has(t)) continue;
    if (otherTargets.some((o) => grid.distance(o, t) < 3)) continue;
    let sc = siteScore(view, t);
    if (sc < MIN_SITE_SCORE) continue;
    const nearestOwn = own.length ? Math.min(...own.map((o) => grid.distance(o, t))) : 4;
    sc -= d * 0.45 + Math.max(0, nearestOwn - 5) * 1.0;
    if (preferred.has(t)) sc += 1.5;
    if (enemyMilitaryNear(ctx, t, 3).length) sc -= 8;
    if (sc > bestScore || (sc === bestScore && t < best)) {
      bestScore = sc;
      best = t;
    }
  }
  return best;
}

function handleSettler(ctx: AiContext, u: Unit): void {
  const { mem, state } = ctx;
  // Gefahr: zurück zur nächsten Siedlung
  if (enemyMilitaryNear(ctx, u.tile, 2).length) {
    const haven = safeHaven(ctx, u);
    if (haven && haven.tile !== u.tile && u.movesLeft > 0) {
      delete mem.tasks[u.id];
      moveTo(ctx, u, haven.tile);
      return;
    }
  }
  let task: UnitTask | undefined = mem.tasks[u.id];
  if (task && (task.kind !== 'settle' || !isValidSite(ctx, task.target))) {
    delete mem.tasks[u.id];
    task = undefined;
  }
  if (!task) {
    const target = pickSite(ctx, u);
    if (target < 0) {
      // Kein Platz bekannt: in der Nähe der Hauptstadt warten, das Gebiet wird weiter erkundet
      if (state.turn % 5 === 0) {
        const cap = ctx.view.ownSettlements().find((s) => s.isCapital);
        if (cap && ctx.view.grid.distance(u.tile, cap.tile) > 2) moveTo(ctx, u, cap.tile);
      }
      return;
    }
    task = { kind: 'settle', target, since: state.turn };
    mem.tasks[u.id] = task;
  }
  if (u.tile !== task.target && u.movesLeft > 0 && u.destination !== task.target) {
    if (!moveTo(ctx, u, task.target)) {
      mem.badSites.push(task.target);
      delete mem.tasks[u.id];
      return;
    }
  } else if (u.tile !== task.target && u.movesLeft > 0) {
    // Weg wurde blockiert: erneut versuchen
    if (!moveTo(ctx, u, task.target)) {
      mem.badSites.push(task.target);
      delete mem.tasks[u.id];
      return;
    }
  }
  if (!alive(ctx, u) || u.tile !== task.target) {
    // Zu lange unterwegs: Ziel aufgeben
    if (state.turn - task.since > 25) {
      mem.badSites.push(task.target);
      delete mem.tasks[u.id];
    }
    return;
  }
  if (ctx.player.influence < campCost(state, ctx.pid)) return; // warten, bis der Einfluss reicht
  if (!tryFound(ctx, u)) {
    mem.badSites.push(task.target);
    delete mem.tasks[u.id];
  }
}

function handleFounders(ctx: AiContext): void {
  const settlements = ctx.view.ownSettlements().length;
  for (const u of ctx.view.ownUnits().filter(isFounder).sort((a, b) => a.id - b.id)) {
    if (!ctx.active) return;
    if (settlements === 0 && !ctx.view.ownSettlements().length) handleFirstCamp(ctx, u);
    else handleSettler(ctx, u);
  }
}

// ---------------------------------------------------------------------------
// Militär

type Role = { kind: 'garrison'; settlement: Settlement } | { kind: 'guard'; settlement: Settlement } | { kind: 'campaign' } | { kind: 'idle' };

/** Weist Einheiten Garnisonen, Wachen und Feldzug zu. */
function assignRoles(ctx: AiContext, units: Unit[]): Map<number, Role> {
  const roles = new Map<number, Role>();
  const grid = ctx.view.grid;
  const settlements = ctx.view.ownSettlements().sort((a, b) => (ctx.situation.threat[b.id] ?? 0) - (ctx.situation.threat[a.id] ?? 0) || a.id - b.id);
  const free = new Set(units.map((u) => u.id));
  const byId = new Map(units.map((u) => [u.id, u]));
  // 1) Garnison: Einheit auf dem Zentrum bleibt, sonst nächste freie Einheit
  for (const s of settlements) {
    const onTile = units.find((u) => u.tile === s.tile && free.has(u.id) && unitType(u.type).unitClass !== 'recon');
    let pick = onTile;
    if (!pick) {
      let bestD = Infinity;
      for (const id of free) {
        const u = byId.get(id)!;
        if (unitType(u.type).unitClass === 'recon' || u.hp < 40 || knownUnreachable(ctx, u, s.tile)) continue;
        const d = grid.distance(u.tile, s.tile);
        if (d < bestD && d <= 14) {
          bestD = d;
          pick = u;
        }
      }
    }
    if (pick) {
      roles.set(pick.id, { kind: 'garrison', settlement: s });
      free.delete(pick.id);
    }
  }
  // 2) Wachen für bedrohte Siedlungen
  for (const s of settlements) {
    const threat = ctx.situation.threat[s.id] ?? 0;
    if (threat <= 3) continue;
    const garrison = [...roles.entries()].find(([, r]) => r.kind === 'garrison' && r.settlement.id === s.id);
    const have = garrison ? unitPower(byId.get(garrison[0])!) : 0;
    let need = Math.min(3, Math.ceil((threat * 1.1 - have) / 12));
    while (need > 0) {
      let pick: Unit | undefined;
      let bestD = Infinity;
      for (const id of free) {
        const u = byId.get(id)!;
        if (u.hp < 40 || unitType(u.type).unitClass === 'recon' || knownUnreachable(ctx, u, s.tile)) continue;
        const d = grid.distance(u.tile, s.tile);
        if (d < bestD && d <= 10) {
          bestD = d;
          pick = u;
        }
      }
      if (!pick) break;
      roles.set(pick.id, { kind: 'guard', settlement: s });
      free.delete(pick.id);
      need--;
    }
  }
  // 3) Feldzug
  const campaign = ctx.mem.war && !ctx.mem.war.defensive && ctx.goals.attack > 0;
  const target = campaign ? campaignTarget(ctx) : -1;
  for (const id of free) {
    const u = byId.get(id)!;
    if (campaign && u.hp >= 60 && unitType(u.type).unitClass !== 'recon' && !(target >= 0 && knownUnreachable(ctx, u, target))) roles.set(id, { kind: 'campaign' });
    else roles.set(id, { kind: 'idle' });
  }
  return roles;
}

/** Ziel des Feldzugs: nächste bekannte Siedlung des Kriegsgegners. */
function campaignTarget(ctx: AiContext): number {
  const war = ctx.mem.war;
  if (!war) return -1;
  const home = ctx.view.ownSettlements().find((s) => s.isCapital) ?? ctx.view.ownSettlements()[0];
  if (!home) return -1;
  const known = ctx.view.knownForeignSettlements().filter((k) => k.info.owner === war.target);
  // Ziel beibehalten, solange es bekannt ist – kein Hin und Her während einer Belagerung
  if (war.targetTile !== undefined && known.some((k) => k.tile === war.targetTile)) return war.targetTile;
  const n = nearest(ctx, home.tile, known, (k) => k.tile);
  war.targetTile = n ? n.tile : undefined;
  return n ? n.tile : -1;
}

function retreatAndHeal(ctx: AiContext, u: Unit): void {
  const haven = safeHaven(ctx, u);
  if (haven && haven.tile !== u.tile && u.movesLeft > 0 && ctx.view.grid.distance(haven.tile, u.tile) <= 12) {
    if (moveTo(ctx, u, haven.tile) && !alive(ctx, u)) return;
  }
  if (alive(ctx, u) && u.hp < MAX_HP && u.status !== 'fortified') act(ctx, u, 'heal');
}

function handleCampaignUnit(ctx: AiContext, u: Unit, target: number, groupNear: number, taken: Set<number>): void {
  const grid = ctx.view.grid;
  if (target < 0) {
    fortifyHere(ctx, u);
    return;
  }
  const d = grid.distance(u.tile, target);
  const def = unitType(u.type);
  const range = def.rangedStrength && def.range ? def.range : 1;
  if (d <= range) {
    // in Stellung: halten (Angriffe werden zuvor bewertet)
    fortifyHere(ctx, u);
    return;
  }
  // Sammeln, bis die Gruppe groß genug ist
  if (d <= 4 && groupNear < ctx.plan.minGroup) {
    fortifyHere(ctx, u);
    return;
  }
  const stand = standingTileNear(ctx, u, target, taken);
  if (stand >= 0) {
    taken.add(stand);
    if (!moveTo(ctx, u, stand)) {
      // Ziel für diese Einheit vorerst aufgeben (z. B. Engpass oder versperrter Zugang)
      ctx.mem.unreachable[`${u.id}:${target}`] = ctx.state.turn;
      handleIdle(ctx, u, taken);
    }
  } else if (u.movesLeft > 0 && u.destination === null) {
    // alle Nachbarfelder belegt: in die Nähe ziehen
    const ring = grid.ring(target, 2).find((t) => ctx.view.knownTile(t) && isPassableLand(ctx.state.map.tiles[t]) && !taken.has(t));
    if (ring !== undefined && !knownUnreachable(ctx, u, ring)) {
      taken.add(ring);
      moveTo(ctx, u, ring);
    }
  }
}

function handleMilitary(ctx: AiContext): void {
  // Fernkämpfer zuerst: sie schwächen Ziele, die Nahkämpfer danach erobern können
  const rangedFirst = (u: Unit) => (unitType(u.type).rangedStrength ? 0 : 1);
  const units = ctx.view
    .ownUnits()
    .filter((u) => isMilitary(u))
    .sort((a, b) => rangedFirst(a) - rangedFirst(b) || a.id - b.id);
  if (!units.length) return;
  const roles = assignRoles(ctx, units);
  ctx.lookaheadEnemies = ctx.view.visibleEnemyMilitary();
  const atWar = ctx.situation.wars.length > 0;
  let targets: AttackTarget[] = atWar ? visibleTargets(ctx) : [];
  const campTarget = campaignTarget(ctx);
  const grid = ctx.view.grid;
  const groupNear = campTarget >= 0 ? units.filter((u) => roles.get(u.id)?.kind === 'campaign' && grid.distance(u.tile, campTarget) <= 4).length : 0;
  // Sturm nur, wenn die versammelte Gruppe die Siedlung in wenigen Runden einnehmen kann
  const targetSettlement = campTarget >= 0 ? ctx.view.visibleSettlementAt(campTarget) : undefined;
  const campaignUnits = units.filter((u) => roles.get(u.id)?.kind === 'campaign');
  const assault =
    !!targetSettlement &&
    groupNear >= ctx.plan.minGroup &&
    assaultDamage(ctx, campaignUnits, targetSettlement) >= 25 + Math.min(100, targetSettlement.hp) * 0.1;
  const taken = new Set<number>();
  const aggression = ctx.player.kind === 'machine' ? 2 : 1;

  for (const u of units) {
    if (!ctx.active) return;
    if (!alive(ctx, u)) continue;
    const role = roles.get(u.id) ?? { kind: 'idle' };
    const def = unitType(u.type);
    const recon = def.unitClass === 'recon';
    if (recon && role.kind === 'idle') continue; // Späher separat

    // 1) Angriff, wenn lohnend
    if (atWar && targets.length && u.hp >= 40 && u.movesLeft > 0) {
      const garrison = role.kind === 'garrison';
      const plan = bestAttack(ctx, u, targets, {
        allowMove: !garrison || !!def.rangedStrength,
        siege: role.kind === 'campaign' && assault,
        aggression,
      });
      // Garnisonen im Nahkampf verlassen ihre Siedlung nur für sichere Siege
      if (plan && !(garrison && !def.rangedStrength && (!plan.kill || plan.from !== u.tile))) {
        executeAttack(ctx, u, plan);
        targets = targets.filter((t) => ctx.view.visibleSettlementAt(t.tile) || (t.unit && ctx.state.units[t.unit.id] === t.unit));
        if (!alive(ctx, u) || u.movesLeft <= 0) continue;
      }
    }
    if (!alive(ctx, u)) continue;

    // 2) Rückzug und Heilung
    if (u.hp < 40 && role.kind !== 'garrison') {
      retreatAndHeal(ctx, u);
      continue;
    }

    // 3) Rollen
    switch (role.kind) {
      case 'garrison': {
        const s = role.settlement;
        if (u.tile === s.tile) {
          if (u.hp < MAX_HP && u.status !== 'fortified') act(ctx, u, 'heal');
          else fortifyHere(ctx, u);
        } else if (u.destination !== s.tile || u.movesLeft > 0) {
          if (!moveTo(ctx, u, s.tile)) fortifyHere(ctx, u);
          else if (alive(ctx, u) && u.tile === s.tile) fortifyHere(ctx, u);
        }
        break;
      }
      case 'guard': {
        const s = role.settlement;
        if (grid.distance(u.tile, s.tile) === 1 && !taken.has(u.tile)) {
          taken.add(u.tile);
          fortifyHere(ctx, u);
          break;
        }
        const stand = standingTileNear(ctx, u, s.tile, taken);
        if (stand >= 0) {
          taken.add(stand);
          if (moveTo(ctx, u, stand) && alive(ctx, u) && u.tile === stand) fortifyHere(ctx, u);
        } else fortifyHere(ctx, u);
        break;
      }
      case 'campaign':
        handleCampaignUnit(ctx, u, campTarget, groupNear, taken);
        break;
      case 'idle':
        handleIdle(ctx, u, taken);
        break;
    }
  }
}

/** Freie Einheiten stehen an der Grenze nahe einer Siedlung und befestigen sich. */
function handleIdle(ctx: AiContext, u: Unit, taken: Set<number>): void {
  const grid = ctx.view.grid;
  const own = ctx.view.knownTileOwner(u.tile) === ctx.pid;
  const home = nearest(
    ctx,
    u.tile,
    ctx.view.ownSettlements().filter((s) => !knownUnreachable(ctx, u, s.tile)),
    (s) => s.tile,
  );
  if (own || !home) {
    if (u.hp < MAX_HP && u.status !== 'fortified') act(ctx, u, 'heal');
    else fortifyHere(ctx, u);
    return;
  }
  if (u.destination !== null && u.movesLeft === 0) return;
  const stand = standingTileNear(ctx, u, home.tile, taken);
  if (stand >= 0 && grid.distance(u.tile, stand) > 0) {
    taken.add(stand);
    if (!moveTo(ctx, u, stand)) fortifyHere(ctx, u);
  } else fortifyHere(ctx, u);
}

// ---------------------------------------------------------------------------
// Späher

function handleScouts(ctx: AiContext): void {
  const { state, mem } = ctx;
  const grid = ctx.view.grid;
  for (const u of ctx.view.ownUnits().filter((x) => unitType(x.type).unitClass === 'recon').sort((a, b) => a.id - b.id)) {
    if (!ctx.active) return;
    if (u.status === 'exploring' || u.movesLeft <= 0) continue;
    if (u.hp < 40) {
      retreatAndHeal(ctx, u);
      continue;
    }
    // Bekannte Kuriositäten in der Nähe einsammeln
    const curiosity = state.curiosities.filter((t) => ctx.view.isExplored(t) && grid.distance(t, u.tile) <= 6);
    const c = nearest(ctx, u.tile, curiosity, (t) => t);
    if (c !== undefined && moveTo(ctx, u, c)) continue;
    const task = mem.tasks[u.id];
    if (task?.kind === 'sentry' && state.turn < task.since + 12) continue;
    act(ctx, u, 'explore');
    if (alive(ctx, u) && (u.status as string) !== 'exploring') {
      // Nichts mehr zu erkunden: an der Hauptstadt Wache halten
      mem.tasks[u.id] = { kind: 'sentry', target: u.tile, since: state.turn };
      const home = nearest(ctx, u.tile, ctx.view.ownSettlements(), (s) => s.tile);
      if (home && grid.distance(home.tile, u.tile) > 2 && u.movesLeft > 0) moveTo(ctx, u, home.tile);
      if (alive(ctx, u) && u.status !== 'sentry') act(ctx, u, 'sentry');
    }
  }
}

/** Leere Staatskasse: schwächste Einheit ohne Garnisonsaufgabe auflösen. */
function handleBankruptcy(ctx: AiContext): void {
  const p = ctx.player;
  if (p.gold > 0 || p.lastIncome.gold >= 0) return;
  const settlementTiles = new Set(ctx.view.ownSettlements().map((s) => s.tile));
  const candidates = ctx.view
    .ownUnits()
    .filter((u) => isMilitary(u) && unitType(u.type).upkeep > 0 && !settlementTiles.has(u.tile))
    .sort((a, b) => unitPower(a) - unitPower(b) || a.id - b.id);
  if (candidates.length) act(ctx, candidates[0], 'disband');
}

/** Steuert alle eigenen Einheiten eines KI-Spielers. */
/** Arbeiter verbinden Siedlungen selbstständig mit dem Straßennetz der Hauptstadt. */
function handleWorkers(ctx: AiContext): void {
  for (const u of ctx.view.ownUnits().filter((x) => x.type === 'worker').sort((a, b) => a.id - b.id)) {
    if (!ctx.active || !alive(ctx, u) || u.work || u.status === 'autoRoad') continue;
    if (nextAutoRoadTile(ctx.state, u) >= 0) act(ctx, u, 'autoRoad');
    else if (u.status !== 'sentry') act(ctx, u, 'sentry');
  }
}

export function manageUnits(ctx: AiContext): void {
  handleFounders(ctx);
  ctx.view.refresh();
  handleBankruptcy(ctx);
  handleWorkers(ctx);
  handleMilitary(ctx);
  handleScouts(ctx);
}

export { handleMilitary, retreatAndHeal, fortifyHere, moveTo, alive };
