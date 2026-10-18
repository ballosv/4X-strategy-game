# Grafik-Assets

Sprites (PNG/WebP) für die Asset-Pipeline. Nur Dateien, die in `manifest.json` eingetragen sind,
werden geladen; alles andere zeichnet das Spiel weiterhin prozedural.

```json
{ "version": 1, "sprites": { "unit/spearman": { "file": "unit/spearman.webp", "anchorX": 0.5, "anchorY": 0.92, "scale": 0.8 } } }
```

Schlüssel, Anker, Masken und Exportgrößen: siehe `docs/ASSET_PIPELINE.md`.
Prüfen: `npm run assets:check` · Abdeckung im Spiel: Menü ☰ → „Asset-Vorschau“.
