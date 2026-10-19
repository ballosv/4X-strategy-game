import { describe, expect, it } from 'vitest';
// @ts-expect-error – reines JS-Skript ohne Typen
import { checkBacklog, compareVersions } from '../scripts/check-assets.mjs';

const base = { errors: [], warnings: [], sprites: 0, coverage: { have: 1, required: 3 }, delivered: ['unit/scout'], missing: ['unit/worker', 'terrain/grassland'] };

describe('Grafik-Backlog', () => {
  it('vergleicht Versionen', () => {
    expect(compareVersions('0.3.0', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
  });

  it('strict: fehlende Grafik ohne Planung ist ein Fehler', () => {
    const r = checkBacklog(base, { pending: { 'unit/worker': { release: '0.3.0' } } }, '0.2.0', { strict: true });
    expect(r.errors.join()).toContain('terrain/grassland');
    expect(r.errors.join()).not.toContain('unit/worker');
  });

  it('release: fällige Grafiken blockieren das Release', () => {
    const backlog = { pending: { 'unit/worker': { release: '0.3.0' }, 'terrain/grassland': { release: '0.4.0' } } };
    expect(checkBacklog(base, backlog, '0.2.0', { release: true }).errors).toHaveLength(0);
    const r = checkBacklog(base, backlog, '0.3.0', { release: true });
    expect(r.errors.join()).toContain('unit/worker');
    expect(r.errors.join()).not.toContain('terrain/grassland');
  });

  it('meldet unbekannte Schlüssel, fehlende Ziel-Releases und bereits gelieferte Einträge', () => {
    const r = checkBacklog(base, { pending: { 'unit/gibtsnicht': { release: '0.3.0' }, 'unit/worker': {}, 'unit/scout': { release: '0.3.0' } } }, '0.2.0');
    expect(r.errors.join()).toContain('unit/gibtsnicht');
    expect(r.errors.join()).toContain('Ziel-Release');
    expect(r.warnings.join()).toContain('unit/scout');
  });
});
