#!/usr/bin/env node
/**
 * Prüft public/assets/manifest.json gegen die Dateien in public/assets (ohne Abhängigkeiten, nur node:fs).
 *
 *   npm run assets:check                 Prüfung mit Bericht (Exit-Code 1 bei Fehlern)
 *   node scripts/check-assets.mjs --dir <ordner>   anderes Asset-Verzeichnis prüfen
 *   node scripts/check-assets.mjs --json          Ergebnis als JSON
 *   node scripts/check-assets.mjs --list-keys     alle erwarteten Schlüssel ausgeben
 *
 * Fehler: ungültiges Manifest, fehlende Dateien, unbekannte Schlüssel, ungültige Einträge.
 * Hinweise: nicht referenzierte Bilddateien, fehlende Pflicht-Sprites (Abdeckung).
 * Bildabmessungen werden nicht geprüft.
 *
 * Die erwarteten Schlüssel werden – wie in src/render/assetKeys.ts – aus den Datentabellen in
 * src/core/data abgeleitet (hier per Textanalyse, da das Skript kein TypeScript laden soll).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATEGORIES = ['terrain', 'overlay', 'improvement', 'settlement', 'unit', 'ui'];
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
  const improvements = [...block(read('src/core/data/improvements.ts'), 'export const IMPROVEMENTS').matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
  const units = [...read('src/core/data/units.ts').matchAll(/u\(\{ id: '(\w+)'/g)].map((m) => m[1]);
  const erasSrc = block(read('src/core/data/eras.ts'), 'export const ERAS');
  const eras = [...erasSrc.slice(0, erasSrc.indexOf('];')).matchAll(/index: (\d+)/g)].map((m) => Number(m[1]));
  const out = [];
  const add = (key, optional = false) => out.push({ key, optional });
  for (const t of terrains) add(`terrain/${t}`);
  for (const f of features) add(`overlay/${f}`);
  add('overlay/mountain');
  add('overlay/highMountain');
  add('overlay/forest_conifer', true);
  add('overlay/denseForest_conifer', true);
  for (const id of improvements) add(`improvement/${id}`);
  for (const kind of SETTLEMENT_KINDS) for (const e of eras) add(`settlement/${kind}_${e}`, e > 0);
  add('settlement/machine', true);
  for (const id of units) {
    add(`unit/${id}`);
    add(`unit/${id}_mask`, true);
  }
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
    return { errors, warnings, sprites: 0, coverage: { have: 0, required: expected.filter((e) => !e.optional).length } };
  }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    errors.push(`manifest.json ist kein gültiges JSON: ${e.message}`);
    return { errors, warnings, sprites: 0, coverage: { have: 0, required: expected.filter((e) => !e.optional).length } };
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
  const have = required.filter((e) => valid.has(e.key)).length;
  return { errors, warnings, sprites: Object.keys(sprites ?? {}).length, coverage: { have, required: required.length } };
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
  if (args.includes('--json')) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`Asset-Prüfung: ${relative(ROOT, dir) || dir}`);
    console.log(`  ${result.sprites} Einträge im Manifest, Abdeckung ${result.coverage.have}/${result.coverage.required} Pflicht-Sprites`);
    for (const w of result.warnings) console.log(`  Hinweis: ${w}`);
    for (const e of result.errors) console.log(`  FEHLER: ${e}`);
    console.log(result.errors.length ? `${result.errors.length} Fehler gefunden.` : 'Keine Fehler.');
  }
  process.exitCode = result.errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
