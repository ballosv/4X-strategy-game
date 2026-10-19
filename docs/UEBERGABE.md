# Übergabe für die nächste Entwicklungssitzung

Stand: 19.10.2026 · letztes Release: **v0.2.0** · `develop` enthält zusätzlich Grafik-Workflow, 67 SVG-Platzhaltergrafiken
und die Grafik-Spezifikation Version 2.

## Nächste Aufgaben (Reihenfolge)

1. **Scenario-Zugang prüfen**
   - Umgebungsvariablen `SCENARIO_API_KEY` und `SCENARIO_API_SECRET` sind angelegt (nie ausgeben/loggen).
   - Netzwerkfreigabe für `api.cloud.scenario.com` prüfen (in der alten Sitzung noch blockiert, HTTP 403 vom Proxy).
   - Verbindung mit einer kostenlosen Abfrage bzw. `dryRun=true` testen (zeigt Kosten ohne Verbrauch).
2. **Renderer-Umbau (Phase A der [Grafik-Spezifikation](GRAFIK_SPEZIFIKATION.md), Kapitel 3, 4, 10)**
   - Kamera: Stauchung 0,58, Höhe je Stufe 0,85 × Hex-Radius, Standardzoom ≈ 10 Felder Bildbreite.
   - Schichtmodell: Bodentexturen in Weltkoordinaten mit Übergängen, Felswände mit Textur und Grasüberhang,
     feines Gitter-Overlay, gestreute Einzelobjekte (Bäume, Felsen) mit Varianten, Siedlungen aus Gebäude-Sprites.
   - Asset-Schlüssel (`src/render/assetKeys.ts`) und `scripts/check-assets.mjs` an den neuen Katalog (Kapitel 5) anpassen,
     Grafik-Backlog (`art/backlog.json`) mit Ziel-Release füllen.
   - Bis gemalte Assets vorliegen, bleiben prozedurale/SVG-Grafiken als Platzhalter.
3. **Vertical Slice mit Scenario (Phase B)**
   - Stilmodelle `ai4x-terrain`, `ai4x-units` (zuerst) trainieren; Trainingsbilder aus dem Zielbild `docs/referenz/einheitenpanel.png`.
   - ~30 Assets erzeugen, Skript für Nachbearbeitung (Freistellen, Zuschnitt, Anker, Fraktionsmaske, WebP) und
     `art/sources.json` (Prompt, Modell, Seed) anlegen.
   - Vergleichsscreenshot neben das Zielbild legen und dem Nutzer zur Freigabe zeigen.
   - Budget: Pro-Abo (5.000 CU/Monat); Vertical Slice geschätzt 2.000–2.500 CU – Kosten vorher per `dryRun` prüfen.

## Arbeitsweise (vom Nutzer vorgegeben)

- Feature-Branches → PR nach `develop` → mergen (nach grüner CI); Release-PR nach `main`.
  Release-Tag und GitHub-Release erzeugt der Workflow `release.yml` (Tags lassen sich aus der Sitzung nicht pushen).
- Grafik ist Teil jedes Features: fehlende Pflicht-Grafiken liefern oder in `art/backlog.json` einplanen.
- Computergegner ohne Boni, nur mit eigenem Sichtfeld.
- Sprache in Spiel, Doku und Commits: Deutsch.

## Offene Balance-Punkte

- Einfluss sammelt sich bei großen Reichen weiterhin an.
- Computergegner erobern selten Siedlungen.
