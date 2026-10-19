#!/usr/bin/env node
/**
 * Prüft public/assets/manifest.json gegen die Dateien in public/assets (ohne Abhängigkeiten, nur node:fs).
 *
 *   npm run assets:check                 Prüfung mit Bericht (Exit-Code 1 bei Fehlern)
 *   node scripts/check-assets.mjs --dir <ordner>   anderes Asset-Verzeichnis prüfen
 *   node scripts/check-assets.mjs --json          Ergebnis als JSON
 *   node scripts/check-assets.mjs --list-keys     alle erwarteten Schlüssel ausgeben
 *   node scripts/check-assets.mjs --strict        zusätzlich: jede fehlende Pflicht-Grafik muss im
 *                                                 Grafik-Backlog (art/backlog.json) eingeplant sein
 *   node scripts/check-assets.mjs --release       zusätzlich: keine Backlog-Grafik darf für die aktuelle
 *                                                 Version (package.json) oder früher eingeplant sein
 *
 * Grafik ist Teil der Entwicklung: Neue Einheiten, Ausbauten usw. bringen ihre Grafik mit. Ist das
 * (noch) nicht möglich, wird die Grafik bewusst mit Ziel-Release in art/backlog.json eingetragen.
 * Ist GITHUB_STEP_SUMMARY gesetzt, wird ein Bericht für die GitHub-Actions-Zusammenfassung geschrieben.
 *
 * Fehler: ungültiges Manifest, fehlende Dateien, unbekannte Schlüssel, ungültige Einträge.
 * Hinweise: nicht referenzierte Bilddateien, fehlende Pflicht-Sprites (Abdeckung).
 * Bildabmessungen werden nicht geprüft.
 *
 * Die erwarteten Schlüssel werden – wie in src/render/assetKeys.ts – aus den Datentabellen in
 * src/core/data abgeleitet (hier per Textanalyse, da das Skript kein TypeScript laden soll).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = ['texture', 'wall', 'path', 'prop', 'building', 'improvement', 'unit', 'portrait', 'fx', 'terrain', 'overlay', 'settlement', 'ui'];
const SETTLEMENT_KINDS = ['camp', 'settlement', 'city'];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function block(src, start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`Datentabelle nicht gefunden: ${start}`);
  return src.slice(i);
}

function quoted(text) {
  return [...text.matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

/** Erwartete Schlüssel (gleiche Reihenfolge und Regeln wie expectedAssetKeys()). */
export function expectedKeys() {
  const terrainSrc = read('src/core/data/terrain.ts');
  const terrains = quoted(/export type TerrainId =([^;]+);/.exec(terrainSrc)[1]);
  const features = quoted(/export type FeatureId =([^;]+);/.exec(terrainSrc)[1]);
  const resourcesSrc = block(terrainSrc, 'export const RESOURCES');
  const resources = [...resourcesSrc.slice(0, resourcesSrc.indexOf('};')).matchAll(/\{ id: '(\w+)'/g)].map((m) => m[1]);
  const C = JSON.parse(read('src/render/catalogV2.json'));
  const improvements = [...block(read('src/core/data/improvements.ts'), 'export const IMPROVEMENTS').matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
  const units = [...read('src/core/data/units.ts').matchAll(/u\(\{ id: '(\w+)'/g)].map((m) => m[1]);
  const erasSrc = block(read('src/core/data/eras.ts'), 'export const ERAS');
  const eras = [...erasSrc.slice(0, erasSrc.indexOf('];')).matchAll(/index: (\d+)/g)].map((m) => Number(m[1]));
  const out = [];
  const add = (key, optional = false) => out.push({ key, optional });
  // Version 2 (Pflicht), Katalog in src/render/catalogV2.json
  for (const t of C.textures.terrains) for (let k = 1; k <= C.textures.variants; k++) add(`texture/${t}_${k}`);
  for (const id of Object.keys(C.walls)) add(`wall/${id}`);
  for (const id of Object.keys(C.paths)) add(`path/${id}`);
  for (const [kind, [, n]] of Object.entries(C.props)) for (let k = 1; k <= n; k++) add(`prop/${kind}_${k}`);
  for (const r of resources) add(`prop/resource_${r}`);
  for (const id of improvements) add(`improvement/${id}`);
  for (const style of Object.keys(C.buildingStyles)) for (const type of Object.keys(C.buildingTypes)) add(`building/${style}_${type}`);
  for (const id of units) {
    add(`unit/${id}`);
    add(`unit/${id}_mask`, true);
  }
  for (const id of units) add(`portrait/${id}`);
  for (const id of Object.keys(C.fx)) add(`fx/${id}`);
  // Version 1 (optional)
  for (const t of terrains) add(`terrain/${t}`, true);
  for (const f of features) add(`overlay/${f}`, true);
  add('overlay/mountain', true);
  add('overlay/highMountain', true);
  add('overlay/forest_conifer', true);
  add('overlay/denseForest_conifer', true);
  for (const kind of SETTLEMENT_KINDS) for (const e of eras) add(`settlement/${kind}_${e}`, true);
  add('settlement/machine', true);
  return out;
}

function isKnownKey(key, known) {
  if (known.has(key)) return true;
  if (/^ui\/[A-Za-z0-9_-]+$/.test(key)) return true;
  const lvl = /^improvement\/(\w+)_(\d)$/.exec(key);
  if (lvl && known.has(`improvement/${lvl[1]}`)) return true;
  const kind = /^settlement\/(\w+)$/.exec(key);
  return !!(kind && SETTLEMENT_KINDS.includes(kind[1]));
}

function listImages(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(png|webp)$/i.test(name)) out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Prüft ein Asset-Verzeichnis. Liefert { errors, warnings, sprites, coverage }. */
export function checkAssets(dir) {
  const errors = [];
  const warnings = [];
  const expected = expectedKeys();
  const known = new Set(expected.map((e) => e.key));
  const manifestPath = join(dir, 'manifest.json');
  let manifest;
  if (!existsSync(manifestPath)) {
    errors.push(`manifest.json fehlt in ${dir}`);
    return { errors, warnings, sprites: 0, coverage: { have: 0, required: expected.filter((e) => !e.optional).length }, delivered: [], missing: expected.filter((e) => !e.optional).map((e) => e.key) };
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    errors.push(`manifest.json ist kein gültiges JSON: ${e.message}`);
    return { errors, warnings, sprites: 0, coverage: { have: 0, required: expected.filter((e) => !e.optional).length }, delivered: [], missing: expected.filter((e) => !e.optional).map((e) => e.key) };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) errors.push('Manifest muss ein JSON-Objekt sein');
  else if (manifest.version !== 1) errors.push(`Unbekannte Manifest-Version ${JSON.stringify(manifest.version)} (erwartet 1)`);
  const sprites = manifest && typeof manifest.sprites === 'object' && !Array.isArray(manifest.sprites) && manifest.sprites ? manifest.sprites : null;
  if (!sprites) errors.push('"sprites" fehlt oder ist kein Objekt');
  const referenced = new Set();
  const valid = new Set();
  for (const [key, e] of Object.entries(sprites ?? {})) {
    const cat = key.split('/')[0];
    if (!CATEGORIES.includes(cat)) {
      errors.push(`${key}: unbekannte Kategorie (erlaubt: ${CATEGORIES.join(', ')})`);
      continue;
    }
    if (!isKnownKey(key, known)) errors.push(`${key}: unbekannter Schlüssel (kein passender Eintrag in den Datentabellen)`);
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`${key}: Eintrag muss ein Objekt sein`);
      continue;
    }
    if (typeof e.file !== 'string' || !e.file.trim()) {
      errors.push(`${key}: "file" fehlt`);
      continue;
    }
    const file = e.file.trim().replace(/^\.?\//, '');
    if (file.includes('..') || /^[a-z]+:/i.test(file) || file.startsWith('/')) {
      errors.push(`${key}: "file" muss ein relativer Pfad innerhalb des Asset-Ordners sein`);
      continue;
    }
    if (!/\.(png|webp)$/i.test(file)) errors.push(`${key}: nur PNG oder WebP erlaubt (${file})`);
    referenced.add(file);
    if (!existsSync(join(dir, file))) errors.push(`${key}: Datei fehlt (${file})`);
    else valid.add(key);
    for (const [field, min, max] of [['anchorX', -1, 2], ['anchorY', -1, 2], ['scale', 0.01, 10]]) {
      const v = e[field];
      if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max)) errors.push(`${key}: "${field}" ungültig (${JSON.stringify(v)})`);
    }
    if (key.endsWith('_mask') && !(sprites[key.slice(0, -5)])) warnings.push(`${key}: Maske ohne zugehörigen Sprite ${key.slice(0, -5)}`);
  }
  for (const f of listImages(dir)) if (!referenced.has(f)) warnings.push(`Datei nicht im Manifest eingetragen: ${f}`);
  const required = expected.filter((e) => !e.optional);
  const delivered = required.filter((e) => valid.has(e.key)).map((e) => e.key);
  const missing = required.filter((e) => !valid.has(e.key)).map((e) => e.key);
  return { errors, warnings, sprites: Object.keys(sprites ?? {}).length, coverage: { have: delivered.length, required: required.length }, delivered, missing };
}

/** Vergleich von Versionen wie 0.3.0 (fehlende Teile = 0). */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Prüft den Grafik-Backlog gegen die fehlenden Pflicht-Grafiken.
 * strict: fehlende, nicht eingeplante Grafiken sind Fehler. release: fällige Backlog-Einträge sind Fehler.
 */
export function checkBacklog(result, backlog, version, { strict = false, release = false } = {}) {
  const errors = [];
  const warnings = [];
  const pending = backlog?.pending ?? {};
  const known = new Set(expectedKeys().map((e) => e.key));
  for (const [key, e] of Object.entries(pending)) {
    if (!known.has(key)) errors.push(`Backlog: unbekannter Schlüssel ${key}`);
    if (!e || typeof e.release !== 'string' || !/^\d+\.\d+\.\d+$/.test(e.release)) errors.push(`Backlog: ${key} braucht ein Ziel-Release wie "0.3.0"`);
    else if (release && compareVersions(e.release, version) <= 0 && !result.delivered.includes(key)) errors.push(`Grafik ${key} ist für Release ${e.release} eingeplant, aber nicht geliefert`);
    if (result.delivered.includes(key)) warnings.push(`Backlog: ${key} ist bereits geliefert und kann aus art/backlog.json entfernt werden`);
  }
  const unplanned = result.missing.filter((k) => !pending[k]);
  if (strict) for (const k of unplanned) errors.push(`Grafik fehlt: ${k} – liefern (art/svg) oder in art/backlog.json einplanen`);
  return { errors, warnings, unplanned };
}

function writeSummary(result, backlog, extra) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const pending = backlog?.pending ?? {};
  const byRelease = {};
  for (const [k, e] of Object.entries(pending)) (byRelease[e.release] ??= []).push(k);
  const lines = [
    '## Grafik-Abdeckung',
    '',
    `**${result.coverage.have} / ${result.coverage.required}** Pflicht-Grafiken geliefert.`,
    '',
    '| Ziel-Release | Offene Grafiken |',
    '|---|---|',
    ...Object.entries(byRelease).sort(([a], [b]) => compareVersions(a, b)).map(([r, ks]) => `| ${r} | ${ks.length}: ${ks.slice(0, 12).join(', ')}${ks.length > 12 ? ', …' : ''} |`),
    '',
    ...(extra.unplanned.length ? ['**Nicht eingeplant (Fehler):** ' + extra.unplanned.join(', '), ''] : []),
    ...[...result.errors, ...extra.errors].map((e) => `- ❌ ${e}`),
  ];
  writeFileSync(file, `${lines.join('\n')}\n`, { flag: 'a' });
}

function main() {
  const args = process.argv.slice(2);
  const dirArg = args.indexOf('--dir');
  const dir = resolve(dirArg >= 0 ? args[dirArg + 1] : join(ROOT, 'public/assets'));
  if (args.includes('--list-keys')) {
    const keys = expectedKeys();
    if (args.includes('--json')) console.log(JSON.stringify(keys));
    else for (const k of keys) console.log(k.optional ? `${k.key} (optional)` : k.key);
    return;
  }
  const result = checkAssets(dir);
  const backlogPath = join(ROOT, 'art/backlog.json');
  let backlog = { pending: {} };
  if (existsSync(backlogPath)) {
    try {
      backlog = JSON.parse(readFileSync(backlogPath, 'utf8'));
    } catch (e) {
      result.errors.push(`art/backlog.json ist kein gültiges JSON: ${e.message}`);
    }
  }
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const bl = checkBacklog(result, backlog, version, { strict: args.includes('--strict') || args.includes('--release'), release: args.includes('--release') });
  result.errors.push(...bl.errors);
  result.warnings.push(...bl.warnings);
  writeSummary(result, backlog, bl);
  if (args.includes('--json')) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Asset-Prüfung: ${relative(ROOT, dir) || dir}`);
    console.log(`  ${result.sprites} Einträge im Manifest, Abdeckung ${result.coverage.have}/${result.coverage.required} Pflicht-Sprites`);
    const open = Object.keys(backlog.pending ?? {}).length;
    if (open) console.log(`  Grafik-Backlog: ${open} eingeplante Grafiken (art/backlog.json)`);
    for (const w of result.warnings) console.log(`  Hinweis: ${w}`);
    for (const e of result.errors) console.log(`  FEHLER: ${e}`);
    console.log(result.errors.length ? `${result.errors.length} Fehler gefunden.` : 'Keine Fehler.');
  }
  process.exitCode = result.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
