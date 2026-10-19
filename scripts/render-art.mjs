#!/usr/bin/env node
/**
 * Rendert die Grafik-Quellen (SVG) aus art/svg zu PNG-Sprites in public/assets und
 * trägt sie ins Manifest ein. Deterministisch (resvg), daher prüfbar in der CI.
 *
 *   npm run art:render            alle SVGs rendern, Manifest aktualisieren
 *   npm run art:render -- unit/   nur Schlüssel mit diesem Präfix
 *   npm run art:check             prüfen, ob PNGs und Manifest zu den SVG-Quellen passen (Exit 1 sonst)
 *
 * Konventionen (siehe art/STYLE.md):
 * - Pfad = Asset-Schlüssel: art/svg/unit/spearman.svg -> Schlüssel unit/spearman -> public/assets/unit/spearman.png
 * - Wurzel-<svg> darf data-anchor-x, data-anchor-y und data-scale tragen (sonst Standard je Kategorie).
 * - Einheiten: Elemente mit class="faction" werden in der Spielerfarbe eingefärbt. Dafür erzeugt das
 *   Skript automatisch die Maske unit/<id>_mask (weiß, Deckkraft = sichtbarer Anteil der Fraktionsflächen).
 * - Gemeinsame Definitionen (Verläufe, Filter) liegen in art/svg/_defs.svg und werden eingefügt,
 *   wenn eine Datei <!-- @defs --> enthält.
 */
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'art/svg');
const OUT = join(ROOT, 'public/assets');
const MANIFEST = join(OUT, 'manifest.json');
const STAMP = join(ROOT, 'art/rendered.json');

function listSvgs(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.svg') && !name.startsWith('_')) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

function withDefs(svg) {
  if (!svg.includes('<!-- @defs -->')) return svg;
  const defsFile = join(SRC, '_defs.svg');
  const defs = existsSync(defsFile) ? readFileSync(defsFile, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<\/?svg[^>]*>/g, '') : '';
  return svg.replace('<!-- @defs -->', defs);
}

function attr(svg, name) {
  const m = new RegExp(`<svg[^>]*\\s${name}="([^"]+)"`).exec(svg);
  return m ? Number(m[1]) : undefined;
}

function render(svg) {
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render();
}

/** Maske: Fraktionsflächen weiß, alles andere schwarz; danach Helligkeit -> Deckkraft. */
function renderMask(svg) {
  const style = '<style>*{fill:#000;stroke:#000}.faction,.faction *{fill:#fff;stroke:#fff}</style>';
  const masked = svg.replace(/(<svg[^>]*>)/, `$1${style}`);
  const img = render(masked);
  const px = Buffer.from(img.pixels);
  let any = false;
  for (let i = 0; i < px.length; i += 4) {
    const lum = px[i] / 255;
    const a = Math.round(px[i + 3] * lum);
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = a;
    if (a > 8) any = true;
  }
  return any ? encodePng(img.width, img.height, px) : null;
}

/** Minimaler PNG-Encoder (RGBA, ohne Filter) – keine zusätzlichen Abhängigkeiten. */
function encodePng(w, h, rgba) {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function hash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function build(prefix) {
  const files = listSvgs(SRC).filter((f) => relative(SRC, f).split(sep).join('/').startsWith(prefix));
  const results = [];
  for (const file of files) {
    const key = relative(SRC, file).split(sep).join('/').replace(/\.svg$/, '');
    const svg = withDefs(readFileSync(file, 'utf8'));
    const entry = { file: `${key}.png` };
    for (const [a, f] of [['data-anchor-x', 'anchorX'], ['data-anchor-y', 'anchorY'], ['data-scale', 'scale']]) {
      const v = attr(svg, a);
      if (v !== undefined) entry[f] = v;
    }
    const png = Buffer.from(render(svg).asPng());
    results.push({ key, entry, png, source: hash(Buffer.from(svg)) });
    if (key.startsWith('unit/') && svg.includes('class="faction"')) {
      const mask = renderMask(svg);
      if (mask) results.push({ key: `${key}_mask`, entry: { file: `${key}_mask.png` }, png: mask, source: hash(Buffer.from(svg)) });
    }
  }
  return results;
}

function readJson(p, fallback) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const prefix = args.find((a) => !a.startsWith('--')) ?? '';
  const results = build(prefix);
  const manifest = readJson(MANIFEST, { version: 1, sprites: {} });
  const stamp = readJson(STAMP, {});
  const problems = [];
  for (const r of results) {
    const target = join(OUT, r.entry.file);
    const wanted = hash(r.png);
    if (check) {
      if (!existsSync(target)) problems.push(`${r.key}: PNG fehlt – npm run art:render ausführen`);
      else if (stamp[r.key] !== `${r.source}:${wanted}` || hash(readFileSync(target)) !== wanted) problems.push(`${r.key}: PNG passt nicht zur SVG-Quelle – npm run art:render ausführen`);
      if (JSON.stringify(manifest.sprites?.[r.key]) !== JSON.stringify(r.entry)) problems.push(`${r.key}: Manifest-Eintrag veraltet – npm run art:render ausführen`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, r.png);
    manifest.sprites[r.key] = r.entry;
    stamp[r.key] = `${r.source}:${wanted}`;
  }
  if (check) {
    for (const p of problems) console.log(`FEHLER: ${p}`);
    console.log(problems.length ? `${problems.length} Abweichungen.` : `${results.length} Sprites aktuell.`);
    process.exitCode = problems.length ? 1 : 0;
    return;
  }
  const sorted = Object.fromEntries(Object.entries(manifest.sprites).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify({ version: 1, sprites: sorted }, null, 2)}\n`);
  writeFileSync(STAMP, `${JSON.stringify(Object.fromEntries(Object.entries(stamp).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
  console.log(`${results.length} Sprites gerendert.`);
}

main();
