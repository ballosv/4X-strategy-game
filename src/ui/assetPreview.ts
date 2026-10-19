import { ASSET_CATEGORIES, MASK_SUFFIX, categoryOf, expectedAssetKeys, isKnownKey, type AssetCategory, type ExpectedKey } from '../render/assetKeys';
import { assets } from '../render/assets';
import { paintPreviewTile } from '../render/painter';
import { drawUnitAsset, drawUnitFigure } from '../render/units';
import { h } from './dom';

/**
 * Entwicklerhilfe „Asset-Vorschau“: listet alle Schlüssel, die das Spiel abfragt, mit Status
 * (geladen / fehlt / Ladefehler) und einem Vorschaubild – Sprite, falls vorhanden, sonst die prozedurale Zeichnung.
 */

const CATEGORY_NAMES: Record<AssetCategory, string> = {
  texture: 'Bodentexturen',
  wall: 'Wände & Kanten',
  path: 'Flüsse & Wege',
  prop: 'Vegetation, Felsen, Ressourcen',
  building: 'Gebäude (Siedlungsbausteine)',
  improvement: 'Ausbauten',
  unit: 'Einheiten',
  portrait: 'Porträts',
  fx: 'Atmosphäre',
  terrain: 'Gelände (v1, Platzhalter)',
  overlay: 'Overlays (v1, Platzhalter)',
  settlement: 'Siedlungen (v1, Platzhalter)',
  ui: 'Oberfläche',
};

/** Neutrale Fraktionsfarbe für die Vorschau (wie in der Prompt-Vorlage). */
const PREVIEW_COLOR = '#2f6fb5';
const THUMB_W = 96;
const THUMB_H = 88;
const ZOOM = 1.1;

function thumbnail(key: string): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = h('canvas', { width: Math.round(THUMB_W * dpr), height: Math.round(THUMB_H * dpr), class: 'asset-thumb' });
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr * ZOOM, dpr * ZOOM);
  const cx = THUMB_W / ZOOM / 2;
  const cat = categoryOf(key);
  if (cat === 'unit') {
    const type = key.slice(5).replace(MASK_SUFFIX, '');
    const footY = THUMB_H / ZOOM - 8;
    if (!drawUnitAsset(ctx, type, PREVIEW_COLOR, cx, footY)) drawUnitFigure(ctx, type, PREVIEW_COLOR, cx, footY);
  } else if (cat === 'ui' || cat === 'portrait' || cat === 'fx' || cat === 'path') {
    const s = assets.get(key);
    if (s) {
      const f = Math.min((THUMB_W / ZOOM - 8) / s.width, (THUMB_H / ZOOM - 8) / s.height);
      ctx.drawImage(s.image, cx - (s.width * f) / 2, THUMB_H / ZOOM / 2 - (s.height * f) / 2, s.width * f, s.height * f);
    }
  } else {
    paintPreviewTile(ctx, key, { x: cx, y: THUMB_H / ZOOM - 25 });
  }
  return c;
}

function status(key: string, optional: boolean): HTMLElement {
  if (assets.has(key)) return h('span', { class: 'asset-status ok' }, 'geladen');
  if (assets.failed.has(key)) return h('span', { class: 'asset-status err' }, 'Ladefehler');
  return h('span', { class: `asset-status ${optional ? 'opt' : 'miss'}` }, optional ? 'optional' : 'fehlt');
}

function card(e: ExpectedKey): HTMLElement {
  const entry = assets.manifest.sprites[e.key];
  return h(
    'div',
    { class: 'asset-card' },
    thumbnail(e.key),
    h('div', { class: 'asset-info' }, h('div', { class: 'o-name' }, e.label), h('code', null, e.key), entry ? h('div', { class: 'o-cost' }, entry.file) : null, status(e.key, e.optional)),
  );
}

export function assetPreviewScreen(): HTMLElement {
  let showOptional = false;
  const root = h('div', { class: 'asset-preview' });
  const expected = expectedAssetKeys();
  const known = new Set(expected.map((e) => e.key));
  // ui/*-Schlüssel sind frei benennbar und erscheinen nur, wenn sie im Manifest stehen
  const extra: ExpectedKey[] = Object.keys(assets.manifest.sprites)
    .filter((k) => !known.has(k) && isKnownKey(k, known))
    .map((k) => ({ key: k, category: categoryOf(k)!, label: k.split('/')[1], optional: true }));
  const unknown = Object.keys(assets.manifest.sprites).filter((k) => !isKnownKey(k, known));
  const all = [...expected, ...extra];

  const render = () => {
    const required = expected.filter((e) => !e.optional);
    const have = required.filter((e) => assets.has(e.key)).length;
    const head = h(
      'div',
      { class: 'asset-summary' },
      h('div', null, h('b', null, `${have} von ${required.length}`), ' Pflicht-Sprites geladen · ', `${assets.size} Sprites insgesamt`, assets.failed.size ? ` · ${assets.failed.size} Ladefehler` : '', assets.isLoaded ? '' : ' · lädt …'),
      h('label', { class: 'hint', style: 'display:flex;gap:6px;align-items:center;margin:0' }, h('input', { type: 'checkbox', checked: showOptional, onchange: (ev: Event) => { showOptional = (ev.target as HTMLInputElement).checked; render(); } }), 'Optionale Varianten & Masken zeigen'),
      h('div', { class: 'hint' }, 'Fehlende Sprites werden prozedural gezeichnet (Vorschau zeigt, was im Spiel erscheint). Sprites eintragen in public/assets/manifest.json, prüfen mit „npm run assets:check“.'),
    );
    const sections = ASSET_CATEGORIES.map((cat) => {
      const items = all.filter((e) => e.category === cat && (showOptional || !e.optional || assets.has(e.key)));
      if (!items.length) return null;
      const loaded = items.filter((e) => assets.has(e.key)).length;
      return h('div', { class: 'asset-section' }, h('h3', null, `${CATEGORY_NAMES[cat]} `, h('span', { class: 'hint' }, `${loaded}/${items.length}`)), h('div', { class: 'asset-grid' }, items.map(card)));
    });
    const unknownBox = unknown.length ? h('div', { class: 'asset-section' }, h('h3', null, 'Unbekannte Schlüssel im Manifest'), h('div', { class: 'hint' }, unknown.join(', '))) : null;
    root.replaceChildren(head, ...sections.filter((s): s is HTMLDivElement => s !== null), ...(unknownBox ? [unknownBox] : []));
  };
  render();
  return root;
}
