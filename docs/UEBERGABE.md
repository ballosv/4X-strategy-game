# Übergabe für die nächste Entwicklungssitzung

Stand: 19.10.2026 (3. Sitzung) · letztes Release: **v0.2.0** · `develop` enthält zusätzlich Grafik-Workflow,
67 SVG-Platzhaltergrafiken und die Grafik-Spezifikation Version 2. Branch `ccr-87e8aee1-4etlkm` enthält
zusätzlich den **Renderer-Umbau (Phase A)** und den **Probelauf von Phase B** (noch kein PR nach `develop`).

## Nächste Aufgaben (Reihenfolge)

1. **Probelauf Phase B vom Nutzer freigeben lassen** – Vergleichsbogen
   [`docs/referenz/probelauf-phase-b.jpg`](referenz/probelauf-phase-b.jpg)
   - Scenario-Zugang funktioniert (Sitzung 3). Projekt `proj_tgX9ZV1YKNGpBZnkZwRNYxJj`.
   - Probelauf: 4 Aufträge × 3 Varianten mit **Gemini 3.1 Flash + Zielbild-Ausschnitten als Referenz, ohne
     LoRA-Training** (156 CU) + 4 × Freistellen (12 CU) = **168 CU verbraucht**.
   - Eingebunden: `texture/grassland_1/2`, `prop/tree_conifer_1/2`, `prop/rock_1/2` (scale 0,2),
     `portrait/spearman`. Einheitenpanel nutzt gemalte Porträts; Renderer zeichnet Kontaktschatten für Bäume/Felsen.
   - Ergebnis: Stil, Perspektive und Licht treffen das Zielbild gut; Porträt fast identisch zur Vorlage.
     Textur-Variante 1 von Gemini zeigte sichtbare Wiederholung → `art-postprocess.py` macht Texturen nahtlos.
2. **Entscheidung des Nutzers zum Rest des Vertical Slice** (25 offene 0.4.0-Schlüssel in `art/backlog.json`)
   - Option A: weiter ohne LoRA mit Gemini + Referenzen (≈ 40 CU je Schlüssel bei 3 Varianten, gesamt ≈ 1.000 CU);
     freigegebene Bilder später als Trainingsdaten für die LoRA-Modelle in Phase C.
   - Option B: wie Spezifikation Kap. 7.1 zuerst LoRA-Stilmodelle trainieren (92–156 CU je Modell).
   - Vorgehen: Aufträge in `art/scenario/jobs.json` ergänzen → `--dry-run` → generieren → freistellen →
     `selection.json` → `art-postprocess.py` (siehe [ASSET_PIPELINE.md](ASSET_PIPELINE.md), Abschnitt Scenario).
   - Offen: Fraktionsmaske für Einheiten-Sprites (Fraktionsflächen hellgrau generieren, Maske per Farbbereich),
     Wände/Kanten als horizontal kachelbare Texturen, Gebäudebausteine (Anker Bodenmitte).
3. **PR nach `develop`** für Phase A + Probelauf, sobald der Nutzer zustimmt.
4. Offen aus Phase A: Wolkendecke für unerkundete Felder (Kap. 4, Schicht 9), Brücken-/Steg-Darstellung,
   Einheiten etwas größer, Chunk-Zeichenzeit auf echten Android-Geräten messen.

## Arbeitsweise (vom Nutzer vorgegeben)

- Feature-Branches → PR nach `develop` → mergen (nach grüner CI); Release-PR nach `main`.
  Release-Tag und GitHub-Release erzeugt der Workflow `release.yml` (Tags lassen sich aus der Sitzung nicht pushen).
- Grafik ist Teil jedes Features: fehlende Pflicht-Grafiken liefern oder in `art/backlog.json` einplanen.
- Computergegner ohne Boni, nur mit eigenem Sichtfeld.
- Sprache in Spiel, Doku und Commits: Deutsch.

## Offene Balance-Punkte

- Einfluss sammelt sich bei großen Reichen weiterhin an.
- Computergegner erobern selten Siedlungen.
