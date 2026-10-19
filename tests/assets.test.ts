/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERAS } from '../src/core/data/eras';
import { IMPROVEMENTS } from '../src/core/data/improvements';
import { FEATURES, RESOURCES, TERRAIN } from '../src/core/data/terrain';
import { UNIT_TYPES } from '../src/core/data/units';
import {
  CATEGORY_DEFAULTS,
  buildingStyle,
  propKeys,
  categoryOf,
  expectedAssetKeys,
  forestKeyCandidates,
  improvementKeyCandidates,
  isKnownKey,
  parseManifest,
  resolveKey,
  settlementKeyCandidates,
} from '../src/render/assetKeys';

describe('Asset-Schlüssel', () => {
  const keys = expectedAssetKeys();
  const set = new Set(keys.map((k) => k.key));

  it('decken alle Datentabellen ab', () => {
    for (const id of Object.keys(TERRAIN)) expect(set.has(`terrain/${id}`)).toBe(true);
    for (const id of Object.keys(FEATURES)) expect(set.has(`overlay/${id}`)).toBe(true);
    expect(set.has('overlay/mountain')).toBe(true);
    expect(set.has('overlay/highMountain')).toBe(true);
    for (const id of Object.keys(IMPROVEMENTS)) expect(set.has(`improvement/${id}`)).toBe(true);
    for (const id of Object.keys(UNIT_TYPES)) {
      expect(set.has(`unit/${id}`)).toBe(true);
      expect(set.has(`unit/${id}_mask`)).toBe(true);
    }
    for (const kind of ['camp', 'settlement', 'city']) for (const era of ERAS) expect(set.has(`settlement/${kind}_${era.index}`)).toBe(true);
  });

  it('sind eindeutig, kategorisiert und beschriftet', () => {
    expect(set.size).toBe(keys.length);
    for (const k of keys) {
      expect(categoryOf(k.key)).toBe(k.category);
      expect(k.label.length).toBeGreaterThan(0);
    }
  });

  it('Pflicht: Katalog v2 und Einheiten/Ausbauten; optional: Masken und feldgebundene v1-Grafiken', () => {
    const opt = (key: string) => keys.find((k) => k.key === key)!.optional;
    expect(opt('unit/spearman')).toBe(false);
    expect(opt('unit/spearman_mask')).toBe(true);
    expect(opt('texture/grassland_2')).toBe(false);
    expect(opt('building/medieval_tower')).toBe(false);
    expect(opt('prop/resource_game')).toBe(false);
    expect(opt('settlement/city_0')).toBe(true);
    expect(opt('terrain/grassland')).toBe(true);
    expect(opt('overlay/forest_conifer')).toBe(true);
  });

  it('enthalten den Katalog der Grafik-Spezifikation v2 (Kap. 5)', () => {
    const count = (prefix: string) => keys.filter((k) => k.key.startsWith(prefix)).length;
    expect(count('texture/')).toBe(18);
    expect(count('wall/')).toBe(8);
    expect(count('prop/tree_') + count('prop/bush_')).toBe(24);
    expect(count('prop/rock_') + count('prop/mountain_') + count('prop/peak_')).toBe(13);
    expect(count('prop/resource_')).toBe(Object.keys(RESOURCES).length);
    expect(count('building/')).toBe(35);
    expect(count('portrait/')).toBe(Object.keys(UNIT_TYPES).length);
    expect(propKeys('tree_palm')).toEqual(['prop/tree_palm_1', 'prop/tree_palm_2', 'prop/tree_palm_3']);
  });

  it('ordnet Epochen den fünf Gebäudestilen zu', () => {
    expect(ERAS.map((e) => buildingStyle(e.index))).toEqual(['stone', 'antiquity', 'antiquity', 'medieval', 'medieval', 'industrial', 'industrial', 'modern', 'modern']);
  });

  it('erkennt bekannte und unbekannte Schlüssel', () => {
    expect(isKnownKey('unit/spearman')).toBe(true);
    expect(isKnownKey('ui/endTurn')).toBe(true);
    expect(isKnownKey('improvement/farm_3')).toBe(true);
    expect(isKnownKey('settlement/city')).toBe(true);
    expect(isKnownKey('unit/dragon')).toBe(false);
    expect(isKnownKey('improvement/castle_2')).toBe(false);
    expect(isKnownKey('settlement/castle_1')).toBe(false);
    expect(isKnownKey('walls/cliff')).toBe(false);
    expect(isKnownKey('wall/cliff_temperate')).toBe(true);
    expect(isKnownKey('prop/tree_conifer_7')).toBe(false);
  });

  it('stimmen mit dem Prüfskript überein', () => {
    const out = execFileSync(process.execPath, ['scripts/check-assets.mjs', '--list-keys', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(keys.map((k) => ({ key: k.key, optional: k.optional })));
  });
});

describe('Fallback-Reihenfolge', () => {
  it('Siedlung: gleiche Epoche, dann niedrigere, dann ohne Epoche', () => {
    expect(settlementKeyCandidates('city', 3)).toEqual(['settlement/city_3', 'settlement/city_2', 'settlement/city_1', 'settlement/city_0', 'settlement/city']);
    expect(settlementKeyCandidates('camp', 0)).toEqual(['settlement/camp_0', 'settlement/camp']);
    expect(settlementKeyCandidates('camp', -2)).toEqual(['settlement/camp_0', 'settlement/camp']);
  });

  it('wählt die nächstniedrigere vorhandene Epoche', () => {
    const have = new Set(['settlement/city_1', 'settlement/city_4', 'settlement/city']);
    const pick = (era: number) => resolveKey(settlementKeyCandidates('city', era), (k) => have.has(k));
    expect(pick(6)).toBe('settlement/city_4');
    expect(pick(4)).toBe('settlement/city_4');
    expect(pick(3)).toBe('settlement/city_1');
    expect(pick(0)).toBe('settlement/city');
    expect(resolveKey(settlementKeyCandidates('camp', 5), (k) => have.has(k))).toBeNull();
  });

  it('Ausbaustufen und Nadelwald fallen auf die Basis zurück', () => {
    expect(improvementKeyCandidates('farm', 1)).toEqual(['improvement/farm']);
    expect(improvementKeyCandidates('farm', 3)).toEqual(['improvement/farm_3', 'improvement/farm']);
    expect(forestKeyCandidates('forest', true)).toEqual(['overlay/forest_conifer', 'overlay/forest']);
    expect(forestKeyCandidates('denseForest', false)).toEqual(['overlay/denseForest']);
  });
});

describe('Manifest einlesen', () => {
  it('akzeptiert ein gültiges Manifest und ergänzt Standardwerte', () => {
    const { manifest, errors } = parseManifest({
      version: 1,
      sprites: {
        'unit/spearman': { file: 'unit/spearman.webp', anchorX: 0.5, anchorY: 0.92, scale: 1 },
        'terrain/grassland': { file: './terrain/grassland.png' },
      },
    });
    expect(errors).toEqual([]);
    expect(manifest.sprites['unit/spearman']).toEqual({ file: 'unit/spearman.webp', anchorX: 0.5, anchorY: 0.92, scale: 1 });
    expect(manifest.sprites['terrain/grassland']).toEqual({ file: 'terrain/grassland.png', ...CATEGORY_DEFAULTS.terrain });
  });

  it('liest JSON-Text und toleriert ein leeres Manifest', () => {
    expect(parseManifest('{"version":1,"sprites":{}}')).toEqual({ manifest: { version: 1, sprites: {} }, errors: [] });
  });

  it.each([
    ['kein JSON', '<!doctype html><html>'],
    ['null', null],
    ['Array', []],
    ['Zahl', 42],
    ['ohne sprites', { version: 1 }],
    ['sprites als Array', { version: 1, sprites: [] }],
    ['zukünftige Version', { version: 2, sprites: { 'unit/scout': { file: 'unit/scout.png' } } }],
  ])('wirft nie und liefert ein leeres Manifest bei %s', (_name, input) => {
    const { manifest, errors } = parseManifest(input);
    expect(manifest.sprites).toEqual({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('überspringt ungültige Einträge, behält gültige', () => {
    const { manifest, errors } = parseManifest({
      version: 1,
      sprites: {
        'unit/scout': { file: 'unit/scout.png' },
        'walls/cliff': { file: 'walls/cliff.png' },
        'unit/archer': 'unit/archer.png',
        'unit/slinger': { anchorX: 0.5 },
        'unit/clubman': { file: '../../etc/passwd.png' },
        'unit/tribe': { file: 'https://example.com/x.png' },
        'unit/settler': { file: 'unit/settler.gif' },
        'overlay/rocks': { file: 'overlay/rocks.webp', anchorX: 'mitte', scale: -1 },
      },
    });
    expect(Object.keys(manifest.sprites).sort()).toEqual(['overlay/rocks', 'unit/scout']);
    expect(manifest.sprites['overlay/rocks']).toEqual({ file: 'overlay/rocks.webp', ...CATEGORY_DEFAULTS.overlay });
    expect(errors).toHaveLength(8);
  });
});

describe('Prüfskript check-assets', () => {
  const dirs: string[] = [];
  const makeDir = (manifest: unknown, files: string[] = []): string => {
    const dir = mkdtempSync(join(tmpdir(), 'assets-test-'));
    dirs.push(dir);
    if (manifest !== undefined) writeFileSync(join(dir, 'manifest.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    for (const f of files) {
      mkdirSync(join(dir, f, '..'), { recursive: true });
      writeFileSync(join(dir, f), 'x');
    }
    return dir;
  };
  const run = (dir: string): { code: number; result: { errors: string[]; warnings: string[]; coverage: { have: number; required: number } } } => {
    try {
      const out = execFileSync(process.execPath, ['scripts/check-assets.mjs', '--dir', dir, '--json'], { encoding: 'utf8' });
      return { code: 0, result: JSON.parse(out) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { code: err.status, result: JSON.parse(err.stdout) };
    }
  };
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('das ausgelieferte Manifest ist gültig', () => {
    const out = execFileSync(process.execPath, ['scripts/check-assets.mjs', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(out).errors).toEqual([]);
  });

  it('meldet fehlende Dateien, unbekannte Schlüssel und verwaiste Bilder', () => {
    const dir = makeDir(
      {
        version: 1,
        sprites: {
          'unit/scout': { file: 'unit/scout.png' },
          'unit/archer': { file: 'unit/archer.png' },
          'unit/dragon': { file: 'unit/scout.png' },
        },
      },
      ['unit/scout.png', 'unit/extra.webp'],
    );
    const { code, result } = run(dir);
    expect(code).toBe(1);
    expect(result.errors.some((e) => e.includes('unit/archer') && e.includes('Datei fehlt'))).toBe(true);
    expect(result.errors.some((e) => e.includes('unit/dragon') && e.includes('unbekannter Schlüssel'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('unit/extra.webp'))).toBe(true);
    expect(result.coverage.have).toBe(1);
  });

  it('meldet fehlendes oder kaputtes Manifest', () => {
    expect(run(makeDir(undefined)).code).toBe(1);
    expect(run(makeDir('{ kaputt')).code).toBe(1);
    expect(run(makeDir({ version: 1, sprites: {} })).code).toBe(0);
  });
});
