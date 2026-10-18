import { parseManifest, type Manifest, type SpriteEntry } from './assetKeys';

/**
 * Lädt KI-generierte Sprites aus `public/assets/` laut `assets/manifest.json`.
 * Fehlt das Manifest oder ein Bild, wird still auf die prozedurale Zeichnung zurückgefallen
 * (im Entwicklungsmodus mit genau einer Konsolenwarnung).
 *
 * Die URL ist relativ zum Dokument, damit sie mit Vite `base: './'` und im Android-WebView funktioniert.
 */

export interface LoadedSprite extends SpriteEntry {
  key: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

export const MANIFEST_URL = 'assets/manifest.json';

export class AssetLibrary {
  private sprites = new Map<string, LoadedSprite>();
  private listeners = new Set<() => void>();
  private started: Promise<void> | null = null;
  private loaded = false;
  manifest: Manifest = { version: 1, sprites: {} };
  /** Schlüssel, deren Bild nicht geladen werden konnte. */
  readonly failed = new Set<string>();

  constructor(private readonly baseUrl = 'assets/') {}

  /** Startet das Laden (einmalig). Wird erfüllt, wenn alle Bilder geladen oder fehlgeschlagen sind. */
  load(manifestUrl = MANIFEST_URL): Promise<void> {
    this.started ??= this.doLoad(manifestUrl);
    return this.started;
  }

  get ready(): Promise<void> {
    return this.load();
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Callback, sobald Bilder verfügbar sind (einmal nach Abschluss des Ladens). Gibt eine Abmeldefunktion zurück. */
  onLoad(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get(key: string): LoadedSprite | null {
    return this.sprites.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.sprites.has(key);
  }

  /** Erster geladener Sprite aus einer Kandidatenliste. */
  first(candidates: string[]): LoadedSprite | null {
    for (const k of candidates) {
      const s = this.sprites.get(k);
      if (s) return s;
    }
    return null;
  }

  get size(): number {
    return this.sprites.size;
  }

  private async doLoad(manifestUrl: string): Promise<void> {
    const problems: string[] = [];
    try {
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { manifest, errors } = parseManifest(await res.text());
      this.manifest = manifest;
      problems.push(...errors);
    } catch (e) {
      problems.push(`Manifest ${manifestUrl} nicht ladbar (${(e as Error).message})`);
    }
    await Promise.all(
      Object.entries(this.manifest.sprites).map(async ([key, entry]) => {
        try {
          const image = await loadImage(this.baseUrl + entry.file);
          this.sprites.set(key, { ...entry, key, image, width: image.naturalWidth, height: image.naturalHeight });
        } catch {
          this.failed.add(key);
          problems.push(`${key}: ${entry.file} nicht ladbar`);
        }
      }),
    );
    this.loaded = true;
    if (problems.length && import.meta.env?.DEV) console.warn(`[Assets] ${problems.length} Problem(e), prozedurale Grafik als Ersatz:\n- ${problems.join('\n- ')}`);
    if (this.sprites.size > 0) for (const cb of this.listeners) cb();
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error('leer')));
    img.onerror = () => reject(new Error('Ladefehler'));
    img.src = url;
  });
}

/** Gemeinsame Bibliothek des Spiels. */
export const assets = new AssetLibrary();
