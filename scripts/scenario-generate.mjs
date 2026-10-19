#!/usr/bin/env node
/**
 * Erzeugt Grafik-Rohbilder mit Scenario (Grafik-Spezifikation v2, Kap. 7) aus den Aufträgen in
 * art/scenario/jobs.json und protokolliert Prompt, Modell und Referenzen in art/sources.json.
 *
 *   node scripts/scenario-generate.mjs --dry-run            Kosten aller Aufträge schätzen (verbraucht nichts)
 *   node scripts/scenario-generate.mjs --only prop/rock_1   nur diesen Schlüssel (mehrfach möglich)
 *   node scripts/scenario-generate.mjs --max-cu 200         Abbruch, wenn die Schätzung das Budget übersteigt
 *   node scripts/scenario-generate.mjs --remove-bg art/scenario/raw/prop/rock_1/1.png …
 *                                                           Hintergrund entfernen (Ergebnis <n>_nobg.png daneben)
 *
 * Zugangsdaten kommen aus SCENARIO_API_KEY / SCENARIO_API_SECRET und werden nie ausgegeben.
 * Vor jeder echten Generierung wird die Gesamtschätzung per dryRun ermittelt und gegen --max-cu
 * (Standard 200) geprüft. Rohbilder landen in art/scenario/raw/<schlüssel>/<n>.<ext>.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JOBS = join(ROOT, 'art/scenario/jobs.json');
const UPLOADS = join(ROOT, 'art/scenario/uploads.json');
const RAW = join(ROOT, 'art/scenario/raw');
const SOURCES = join(ROOT, 'art/sources.json');
const API = 'https://api.cloud.scenario.com/v1';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const only = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]] : []));
const maxCuIdx = args.indexOf('--max-cu');
const maxCu = maxCuIdx >= 0 ? Number(args[maxCuIdx + 1]) : 200;

const { SCENARIO_API_KEY: key, SCENARIO_API_SECRET: secret } = process.env;
if (!key || !secret) {
  console.error('SCENARIO_API_KEY und SCENARIO_API_SECRET müssen gesetzt sein.');
  process.exit(1);
}
const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

const config = readJson(JOBS, null);
if (!config) {
  console.error(`Fehlt: ${JOBS}`);
  process.exit(1);
}
const query = `projectId=${config.projectId}`;

async function call(method, path, body, extraQuery = '') {
  const res = await fetch(`${API}${path}?${query}${extraQuery}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${data.reason ?? data.message ?? ''}`);
  return data;
}

/** Lädt ein Referenzbild einmalig hoch; die Asset-ID wird je Datei-Hash zwischengespeichert. */
async function uploadRef(relPath, uploads) {
  const buf = readFileSync(join(ROOT, relPath));
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  if (uploads[hash]) return uploads[hash].assetId;
  const mime = extname(relPath) === '.jpg' ? 'image/jpeg' : 'image/png';
  const { asset } = await call('POST', '/assets', {
    name: relPath.split('/').pop(),
    image: `data:${mime};base64,${buf.toString('base64')}`,
  });
  uploads[hash] = { file: relPath, assetId: asset.id };
  writeJson(UPLOADS, uploads);
  return asset.id;
}

function buildBody(job, refIds) {
  const preset = config.presets[job.preset] ?? {};
  const prompt = [config.basePrompt[job.kind], job.prompt].filter(Boolean).join(', ');
  return { prompt, referenceImages: refIds, ...preset.params, ...job.params };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJob(jobId) {
  for (let i = 0; i < 120; i++) {
    const { job } = await call('GET', `/jobs/${jobId}`);
    if (job.status === 'success') return job;
    if (job.status === 'failure' || job.status === 'canceled') {
      throw new Error(`Job ${jobId}: ${job.status} ${job.metadata?.error ?? ''}`);
    }
    await sleep(5000);
  }
  throw new Error(`Job ${jobId}: Zeitüberschreitung`);
}

async function download(assetId, dir, n) {
  const { asset } = await call('GET', `/assets/${assetId}`);
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Download ${assetId}: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png';
  const file = join(dir, `${n}.${ext}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file.slice(ROOT.length + 1);
}

/** Lädt ein Bild hoch, schätzt die Kosten, führt das Modell aus und gibt die erste Ausgabe zurück. */
async function runOnImage(model, relPath, params, uploads) {
  const image = await uploadRef(relPath, uploads);
  const body = { image, ...params };
  return { body, est: await call('POST', `/generate/custom/${model}`, body, '&dryRun=true') };
}

if (args.includes('--remove-bg')) {
  const files = args.slice(args.indexOf('--remove-bg') + 1).filter((a) => !a.startsWith('--') && a !== String(maxCu));
  const model = config.backgroundRemoval.model;
  const uploads = readJson(UPLOADS, {});
  const runs = [];
  let sum = 0;
  for (const f of files) {
    const run = await runOnImage(model, f, config.backgroundRemoval.params, uploads);
    sum += run.est.creativeUnitsCost;
    runs.push({ f, ...run });
  }
  console.log(`Freistellen: ${files.length} Bild(er), ${sum} CU (Budget ${maxCu} CU)`);
  if (dryRun) process.exit(0);
  if (sum > maxCu) {
    console.error('Schätzung übersteigt das Budget – abgebrochen.');
    process.exit(1);
  }
  const sources = readJson(SOURCES, { assets: {} });
  for (const { f, body } of runs) {
    const { job: started } = await call('POST', `/generate/custom/${model}`, body);
    const done = await waitForJob(started.jobId);
    const out = f.replace(/\.[a-z]+$/, '_nobg');
    const dir = dirname(join(ROOT, out));
    const saved = await download(done.metadata.assetIds[0], dir, out.split('/').pop());
    const key = dirname(f).replace('art/scenario/raw/', '');
    (sources.assets[key] ??= []).push({ date: new Date().toISOString().slice(0, 10), model, input: f, jobId: started.jobId, cu: done.billing?.cuCost, files: [saved] });
    writeJson(SOURCES, sources);
    console.log(`${f} → ${saved}`);
  }
  process.exit(0);
}

const jobs = config.jobs.filter((j) => only.length === 0 || only.includes(j.key));
if (jobs.length === 0) {
  console.error('Keine passenden Aufträge.');
  process.exit(1);
}

const uploads = readJson(UPLOADS, {});
const prepared = [];
let total = 0;
for (const job of jobs) {
  const refIds = [];
  for (const ref of job.refs ?? []) refIds.push(await uploadRef(ref, uploads));
  const model = job.model ?? config.presets[job.preset]?.model;
  const body = buildBody(job, refIds);
  const est = await call('POST', `/generate/custom/${model}`, body, '&dryRun=true');
  total += est.creativeUnitsCost;
  console.log(`${job.key.padEnd(32)} ${String(est.creativeUnitsCost).padStart(4)} CU  (${model})`);
  prepared.push({ job, model, body });
}
console.log(`Summe: ${total} CU (Budget ${maxCu} CU)`);
if (dryRun) process.exit(0);
if (total > maxCu) {
  console.error('Schätzung übersteigt das Budget – abgebrochen. Mit --max-cu anpassen.');
  process.exit(1);
}

const sources = readJson(SOURCES, { description: 'Herkunft der KI-generierten Grafiken (Grafik-Spezifikation v2, Kap. 7.3)', assets: {} });
const failed = [];
for (const { job, model, body } of prepared) {
  const { job: started } = await call('POST', `/generate/custom/${model}`, body);
  let done;
  try {
    done = await waitForJob(started.jobId);
  } catch (e) {
    // z. B. Sicherheitsfilter: Auftrag überspringen, die übrigen laufen weiter
    console.error(`${job.key}: ${e.message}`);
    failed.push(job.key);
    continue;
  }
  const dir = join(RAW, job.key);
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [i, assetId] of (done.metadata.assetIds ?? []).entries()) files.push(await download(assetId, dir, i + 1));
  (sources.assets[job.key] ??= []).push({
    date: new Date().toISOString().slice(0, 10),
    model,
    prompt: body.prompt,
    params: Object.fromEntries(Object.entries(body).filter(([k]) => !['prompt', 'referenceImages'].includes(k))),
    references: job.refs ?? [],
    jobId: started.jobId,
    cu: done.billing?.cuCost,
    files,
  });
  writeJson(SOURCES, sources);
  console.log(`${job.key}: ${files.length} Bild(er) → art/scenario/raw/${job.key}/`);
}
if (failed.length) {
  console.error(`Fehlgeschlagen: ${failed.join(', ')}`);
  process.exit(1);
}
