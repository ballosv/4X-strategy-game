# Übergabe für die nächste Entwicklungssitzung

Stand: 19.10.2026 (2. Sitzung) · letztes Release: **v0.2.0** · `develop` enthält zusätzlich Grafik-Workflow,
67 SVG-Platzhaltergrafiken und die Grafik-Spezifikation Version 2. Branch `ccr-10a868d5-nj0pk0` enthält
zusätzlich den **Renderer-Umbau (Phase A)**.

## Nächste Aufgaben (Reihenfolge)

1. **Scenario-Zugang prüfen** – *in Sitzung 2 weiterhin blockiert*
   - Umgebungsvariablen `SCENARIO_API_KEY` und `SCENARIO_API_SECRET` sind gesetzt (nie ausgeben/loggen).
   - `api.cloud.scenario.com` wird vom Proxy der Cloud-Umgebung abgewiesen (`CONNECT tunnel failed, response 403`).
     Freigabe macht der Nutzer: Umgebung bearbeiten → Network access → Domain unter *Allowed domains* eintragen
     (https://code.claude.com/docs/en/cloud-environments#network-access). Wirkt erst in einer neuen Sitzung.
   - Danach Verbindung mit einer kostenlosen Abfrage bzw. `dryRun=true` testen (zeigt Kosten ohne Verbrauch).
2. **Renderer-Umbau (Phase A)** – ✅ erledigt (Branch `ccr-10a868d5-nj0pk0`, noch kein PR nach `develop`)
   - Kamera 0,58 / 0,85 × Hex-Radius / Zoom 0,4–2,0 / Standardzoom ≈ 10 Felder (`projection.ts`).
   - Schichten: `ground.ts` (Wände, Boden mit Übergängen, Flüsse, Details, Gitter), `textures.ts` (nahtlose
     Platzhaltertexturen, gemalte Texturen ersetzen sie automatisch), `objects.ts` (Streuobjekte, Berge,
     Siedlungen aus Bausteinen), Zeitbudget für Chunks in `renderer.ts`.
   - Katalog v2 in `src/render/catalogV2.json` + `assetKeys.ts`/`check-assets.mjs`; v1-Feldgrafiken optional.
   - Backlog: 166 Grafiken, davon 32 Vertical Slice (Ziel 0.4.0), Rest Bibliothek (0.5.0) – Ziel-Releases ggf. anpassen.
   - Vergleichsbild: [`docs/referenz/ist-stand-phase-a.jpg`](referenz/ist-stand-phase-a.jpg).
   - Offen/Ideen: Wolkendecke für unerkundete Felder (Kap. 4, Schicht 9), Brücken-/Steg-Darstellung,
     Einheiten etwas größer, Chunk-Zeichenzeit auf echten Android-Geräten messen.
3. **Vertical Slice mit Scenario (Phase B)** – Schlüsselliste: Einträge mit Ziel `0.4.0` in `art/backlog.json`
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
