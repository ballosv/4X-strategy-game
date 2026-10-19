#!/usr/bin/env node
/** Entfernt bereits gelieferte Grafiken aus art/backlog.json (npm run art:prune). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAssets } from './check-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(ROOT, 'art/backlog.json');
const backlog = JSON.parse(readFileSync(file, 'utf8'));
const { delivered } = checkAssets(join(ROOT, 'public/assets'));
const before = Object.keys(backlog.pending).length;
for (const k of delivered) delete backlog.pending[k];
writeFileSync(file, `${JSON.stringify(backlog, null, 2)}\n`);
console.log(`${before - Object.keys(backlog.pending).length} gelieferte Grafiken aus dem Backlog entfernt, ${Object.keys(backlog.pending).length} offen.`);
