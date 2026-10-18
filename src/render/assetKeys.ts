import { ERAS } from '../core/data/eras';
import { IMPROVEMENTS } from '../core/data/improvements';
import { FEATURES, TERRAIN } from '../core/data/terrain';
import { UNIT_TYPES } from '../core/data/units';
import type { SettlementKind } from '../core/state';

/**
 * Reine Logik der Asset-Pipeline (ohne DOM, in Node testbar):
 * Manifest-Format, Schlüsselableitung aus den Datentabellen und Fallback-Regeln.
 * Das Laden der Bilder übernimmt `assets.ts`.
 *
 * Manifest (`public/assets/manifest.json`):
 * ```json
 * { "version": 1, "sprites": { "unit/spearman": { "file": "unit/spearman.webp", "anchorX": 0.5, "anchorY": 0.92, "scale": 1 } } }
 * ```
 * - `file`: Pfad relativ zu `public/assets/`.
 * - `anchorX`/`anchorY`: Ankerpunkt im Bild (0–1, relativ zu Breite/Höhe). Dieser Punkt wird auf den
 *   Mittelpunkt der Feld-Oberseite bzw. den Fußpunkt der Einheit gelegt. Optional, Standard je Kategorie.
 * - `scale`: Bildbreite in Vielfachen der Hex-Breite (HEX_W). Optional, Standard je Kategorie.
 */

export const MANIFEST_VERSION = 1;

export type AssetCategory = 'terrain' | 'overlay' | 'improvement' | 'settlement' | 'unit' | 'ui';

export const ASSET_CATEGORIES: AssetCategory[] = ['terrain', 'overlay', 'improvement', 'settlement', 'unit', 'ui'];

export interface SpriteEntry {
  file: string;
  anchorX: number;
  anchorY: number;
  scale: number;
}

export interface Manifest {
  version: number;
  sprites: Record<string, SpriteEntry>;
}

/** Standardwerte, wenn das Manifest Anker/Skalierung nicht angibt. */
export const CATEGORY_DEFAULTS: Record<AssetCategory, Omit<SpriteEntry, 'file'>> = {
  terrain: { anchorX: 0.5, anchorY: 0.5, scale: 1 },
  overlay: { anchorX: 0.5, anchorY: 0.7, scale: 1 },
  improvement: { anchorX: 0.5, anchorY: 0.7, scale: 1 },
  settlement: { anchorX: 0.5, anchorY: 0.7, scale: 1 },
  unit: { anchorX: 0.5, anchorY: 0.92, scale: 0.8 },
  ui: { anchorX: 0.5, anchorY: 0.5, scale: 1 },
};

export const SETTLEMENT_KINDS: SettlementKind[] = ['camp', 'settlement', 'city'];

/** Overlay-Schlüssel (Geländemerkmale aus FEATURES plus Berge nach Höhenstufe). */
export const OVERLAY_IDS = [...Object.keys(FEATURES), 'mountain', 'highMountain'];

/** Optionale Varianten, die bei Fehlen auf ihren Basisschlüssel zurückfallen. */
export const CONIFER_SUFFIX = '_conifer';
export const MASK_SUFFIX = '_mask';

export function categoryOf(key: string): AssetCategory | null {
  const cat = key.split('/')[0] as AssetCategory;
  return ASSET_CATEGORIES.includes(cat) && key.length > cat.length + 1 ? cat : null;
}

export interface ExpectedKey {
  key: string;
  category: AssetCategory;
  /** Anzeigename (deutsch) für die Asset-Vorschau. */
  label: string;
  /** Optionale Schlüssel (Varianten, Masken) – fehlen ist kein Mangel. */
  optional: boolean;
}

/** Alle Schlüssel, die das Spiel abfragt – abgeleitet aus den Datentabellen. */
export function expectedAssetKeys(): ExpectedKey[] {
  const out: ExpectedKey[] = [];
  const add = (key: string, label: string, optional = false) => out.push({ key, category: categoryOf(key)!, label, optional });
  for (const t of Object.values(TERRAIN)) add(`terrain/${t.id}`, t.name);
  for (const f of Object.values(FEATURES)) add(`overlay/${f.id}`, f.name);
  add('overlay/mountain', 'Gebirge (Stufe 4)');
  add('overlay/highMountain', 'Hochgebirge (Stufe 5)');
  add(`overlay/forest${CONIFER_SUFFIX}`, 'Nadelwald (Variante)', true);
  add(`overlay/denseForest${CONIFER_SUFFIX}`, 'Dichter Nadelwald (Variante)', true);
  for (const imp of Object.values(IMPROVEMENTS)) add(`improvement/${imp.id}`, imp.name);
  const kindNames: Record<SettlementKind, string> = { camp: 'Lager', settlement: 'Siedlung', city: 'Stadt' };
  for (const kind of SETTLEMENT_KINDS) {
    for (const era of ERAS) add(`settlement/${kind}_${era.index}`, `${kindNames[kind]} – ${era.name}`, era.index > 0);
  }
  add('settlement/machine', 'Maschinenkern (Die KI)', true);
  for (const u of Object.values(UNIT_TYPES)) {
    add(`unit/${u.id}`, u.name);
    add(`unit/${u.id}${MASK_SUFFIX}`, `${u.name} – Farbmaske`, true);
  }
  return out;
}

/** Bekannte Schlüssel (für die Manifest-Prüfung). `ui/*` ist frei benennbar. */
export function isKnownKey(key: string, known: Set<string> = new Set(expectedAssetKeys().map((e) => e.key))): boolean {
  if (known.has(key)) return true;
  if (/^ui\/[A-Za-z0-9_-]+$/.test(key)) return true;
  // Ausbaustufen-Varianten improvement/<id>_<stufe> und Siedlung ohne Epoche
  const lvl = /^improvement\/(\w+)_(\d)$/.exec(key);
  if (lvl && known.has(`improvement/${lvl[1]}`)) return true;
  const kind = /^settlement\/(\w+)$/.exec(key);
  if (kind && (SETTLEMENT_KINDS as string[]).includes(kind[1])) return true;
  return false;
}

/**
 * Suchreihenfolge für Siedlungen: gleiche Epoche, dann jede niedrigere Epoche, zuletzt ohne Epoche.
 * Beispiel: city, 3 → city_3, city_2, city_1, city_0, city
 */
export function settlementKeyCandidates(kind: string, era: number): string[] {
  const out: string[] = [];
  for (let e = Math.max(0, Math.floor(era)); e >= 0; e--) out.push(`settlement/${kind}_${e}`);
  out.push(`settlement/${kind}`);
  return out;
}

/** Ausbau: erst stufenspezifisch (improvement/farm_2), dann Basis. Stufe 1 nutzt immer die Basis. */
export function improvementKeyCandidates(id: string, level: number): string[] {
  return level > 1 ? [`improvement/${id}_${level}`, `improvement/${id}`] : [`improvement/${id}`];
}

export function forestKeyCandidates(feature: string, conifer: boolean): string[] {
  return conifer ? [`overlay/${feature}${CONIFER_SUFFIX}`, `overlay/${feature}`] : [`overlay/${feature}`];
}

/** Erster vorhandener Schlüssel aus einer Kandidatenliste oder null. */
export function resolveKey(candidates: string[], has: (key: string) => boolean): string | null {
  for (const k of candidates) if (has(k)) return k;
  return null;
}

export interface ParseResult {
  manifest: Manifest;
  /** Fehler/Warnungen (deutsch). Ungültige Einträge werden übersprungen, gültige bleiben erhalten. */
  errors: string[];
}

function finiteIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/**
 * Prüft und normalisiert ein Manifest. Wirft nie: bei völlig ungültiger Eingabe entsteht ein
 * leeres Manifest (→ überall prozedurale Zeichnung).
 */
export function parseManifest(input: unknown): ParseResult {
  const errors: string[] = [];
  const manifest: Manifest = { version: MANIFEST_VERSION, sprites: {} };
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      errors.push('Manifest ist kein gültiges JSON');
      return { manifest, errors };
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push('Manifest muss ein JSON-Objekt sein');
    return { manifest, errors };
  }
  const obj = input as Record<string, unknown>;
  if (obj.version !== MANIFEST_VERSION) {
    errors.push(`Unbekannte Manifest-Version ${JSON.stringify(obj.version)} (erwartet ${MANIFEST_VERSION})`);
    if (typeof obj.version !== 'number' || obj.version > MANIFEST_VERSION) return { manifest, errors };
  }
  const sprites = obj.sprites;
  if (!sprites || typeof sprites !== 'object' || Array.isArray(sprites)) {
    errors.push('"sprites" fehlt oder ist kein Objekt');
    return { manifest, errors };
  }
  for (const [key, raw] of Object.entries(sprites as Record<string, unknown>)) {
    const cat = categoryOf(key);
    if (!cat) {
      errors.push(`${key}: unbekannte Kategorie (erlaubt: ${ASSET_CATEGORIES.join(', ')})`);
      continue;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`${key}: Eintrag muss ein Objekt sein`);
      continue;
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.file !== 'string' || !e.file.trim()) {
      errors.push(`${key}: "file" fehlt`);
      continue;
    }
    const file = e.file.trim().replace(/^\.?\//, '');
    if (file.includes('..') || /^[a-z]+:/i.test(file) || file.startsWith('/')) {
      errors.push(`${key}: "file" muss ein relativer Pfad innerhalb von public/assets sein`);
      continue;
    }
    if (!/\.(png|webp)$/i.test(file)) {
      errors.push(`${key}: nur PNG oder WebP erlaubt (${file})`);
      continue;
    }
    const def = CATEGORY_DEFAULTS[cat];
    const entry: SpriteEntry = { file, ...def };
    for (const [field, min, max] of [['anchorX', -1, 2], ['anchorY', -1, 2], ['scale', 0.01, 10]] as const) {
      if (e[field] === undefined) continue;
      if (finiteIn(e[field], min, max)) entry[field] = e[field];
      else errors.push(`${key}: "${field}" ungültig (${JSON.stringify(e[field])}), Standardwert ${def[field]} wird verwendet`);
    }
    manifest.sprites[key] = entry;
  }
  return { manifest, errors };
}
