import { FEATURES } from '../data/terrain';
import { unitType } from '../data/units';
import { gridOf, playerModifiers } from '../context';
import type { Axial } from '../hex';
import { isWater } from '../map/passability';
import type { GameState } from '../state';

/** Sichtbonus durch erhöhte Position. */
export function elevationSightBonus(elevation: number): number {
  if (elevation >= 4) return 2;
  if (elevation >= 2) return 1;
  return 0;
}

/** Effektive Höhe eines Feldes für die Sichtlinie (Wald zählt als halbe/ganze Stufe). */
function sightHeight(state: GameState, tile: number): number {
  const t = state.map.tiles[tile];
  if (isWater(t)) return 0;
  let h = t.elevation;
  if (t.feature && FEATURES[t.feature].blocksSight) h += 1;
  else if (t.feature === 'forest') h += 0.5;
  return h;
}

function cubeRound(x: number, z: number): Axial {
  const y = -x - z;
  let rx = Math.round(x);
  let rz = Math.round(z);
  const ry = Math.round(y);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (!(dy > dz)) rz = -rx - ry;
  return { q: rx, r: rz };
}

/** Sichtlinie: Zwischenfelder dürfen nicht höher sein als Beobachter und Ziel. */
export function hasLineOfSight(state: GameState, from: number, to: number): boolean {
  const grid = gridOf(state);
  const a = grid.axialOf(from);
  const b = grid.axialOf(to);
  const n = grid.distance(from, to);
  if (n <= 1) return true;
  const viewer = state.map.tiles[from].elevation;
  const limit = Math.max(viewer, state.map.tiles[to].elevation);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    // kleiner Versatz verhindert Mehrdeutigkeit auf Kanten
    const p = cubeRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6);
    const idx = grid.indexOfAxial(p.q, p.r);
    if (idx < 0) continue;
    if (sightHeight(state, idx) > limit) return false;
  }
  return true;
}

export function visionSources(state: GameState, playerId: number): { tile: number; radius: number }[] {
  const mods = playerModifiers(state, playerId);
  const out: { tile: number; radius: number }[] = [];
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId) continue;
    const def = unitType(u.type);
    out.push({ tile: u.tile, radius: def.sight + elevationSightBonus(state.map.tiles[u.tile].elevation) + (mods.sightBonus ?? 0) });
  }
  for (const s of Object.values(state.settlements)) {
    if (s.owner !== playerId) continue;
    out.push({ tile: s.tile, radius: 2 + elevationSightBonus(state.map.tiles[s.tile].elevation) });
  }
  return out;
}

/** Aktuell sichtbare Felder eines Spielers (1 = sichtbar). */
export function computeVisibility(state: GameState, playerId: number): Uint8Array {
  const grid = gridOf(state);
  const vis = new Uint8Array(grid.size);
  for (const src of visionSources(state, playerId)) {
    for (const t of grid.range(src.tile, src.radius)) {
      if (vis[t]) continue;
      if (hasLineOfSight(state, src.tile, t)) vis[t] = 1;
    }
  }
  // Eigenes Gebiet ist immer sichtbar
  for (let i = 0; i < grid.size; i++) {
    const sid = state.tileOwner[i];
    if (sid >= 0 && state.settlements[sid]?.owner === playerId) vis[i] = 1;
  }
  return vis;
}

/** Aktualisiert die erkundeten Felder; gibt die Anzahl neu erkundeter Felder zurück. */
export function updateExplored(state: GameState, playerId: number, vis = computeVisibility(state, playerId)): number {
  const explored = state.players[playerId].explored;
  let added = 0;
  for (let i = 0; i < vis.length; i++) {
    if (vis[i] && !explored[i]) {
      explored[i] = 1;
      added++;
    }
  }
  state.players[playerId].stats.tilesExplored += added;
  return added;
}
