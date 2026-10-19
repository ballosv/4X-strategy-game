# Übergabe für die nächste Entwicklungssitzung

Stand: 19.10.2026 (3. Sitzung) · letztes Release: **v0.2.0** · PR #22 (`ccr-87e8aee1-4etlkm` → `develop`)
enthält den **Renderer-Umbau (Phase A)** und den **Vertical Slice (Phase B)**.

## Stand Phase B

- Stil vom Nutzer freigegeben; Entscheidung: **ohne LoRA-Stilmodelle**, Gemini 3.1 Flash
  (`model_google-gemini-3-1-flash`) mit Zielbild-Ausschnitten (`art/scenario/ref/`) als Referenz.
- Geliefert (32 Grafiken): Texturen Gras 1/2, Küste 1, Meer 1; Wände Felswand (gemäßigt), Erdhang, Strand;
  Laubbaum 1–5, Nadelbaum 1–4, Fels 1/2, Berg 1/2, Wild; Gebäude Steinzeit (Hütte, Zentrum) und Mittelalter
  (Haus klein/groß, Zentrum, Turm, Mauer); Porträt Speerträger. Vergleichsbogen:
  [`docs/referenz/vertical-slice-phase-b.jpg`](referenz/vertical-slice-phase-b.jpg).
- Verbraucht: **879 CU** (Probelauf 168, Slice 711). Kosten: 13 CU/Bild bei 1K, 10 CU/Bild bei Auflösung 512
  (Texturen/Wände), Freistellen 3 CU. Einmal hat der Sicherheitsfilter einen harmlosen Prompt („Erdhang … roots“)
  blockiert – umformuliert, das Skript überspringt solche Aufträge jetzt.
- Ablauf und Dateien: [ASSET_PIPELINE.md](ASSET_PIPELINE.md), Abschnitt „KI-Produktion mit Scenario“.

## Nächste Aufgaben (Reihenfolge)

1. **PR #22 nach `develop` mergen** (CI grün), danach neue Feature-Branches.
2. **Renderer erweitern für die 7 offenen 0.4.0-Schlüssel**, die er noch prozedural zeichnet und nicht lädt:
   `wall/overhang`, `wall/foam`, `wall/scree`, `path/river`, `path/waterfall_1`, `path/trail`, `path/bridge_stone`.
   Erst Einbindung (Format festlegen: Kantenstreifen bzw. Bandtextur), dann generieren. Sie blockieren das Release 0.4.0.
3. **Gemischte Siedlungen:** Für Mittelalter fehlen `workshop`/`storage`, für Steinzeit `house_large`, `tower`,
   `workshop`, `storage` – bis dahin stehen gemalte neben prozeduralen Bausteinen. Größenverhältnis in einer
   Mittelalter-Stadt im Spiel prüfen (Turm hat `scale` 0,55).
4. **Einheiten-Sprites mit Fraktionsmaske** (Fraktionsflächen hellgrau generieren, Maske per Farbbereich) –
   Speerträger zuerst; Prompt-Vorlage Kap. 7.2.
5. **Phase C (Bibliothek)** nach gleichem Muster; freigegebene Bilder können später als Trainingsdaten für
   LoRA-Modelle dienen, falls die Konsistenz bei vielen Assets nachlässt.
6. Offen aus Phase A: Wolkendecke für unerkundete Felder (Kap. 4, Schicht 9), Einheiten etwas größer,
   Chunk-Zeichenzeit auf echten Android-Geräten messen.

## Arbeitsweise (vom Nutzer vorgegeben)

- Feature-Branches → PR nach `develop` → mergen (nach grüner CI); Release-PR nach `main`.
  Release-Tag und GitHub-Release erzeugt der Workflow `release.yml` (Tags lassen sich aus der Sitzung nicht pushen).
- Grafik ist Teil jedes Features: fehlende Pflicht-Grafiken liefern oder in `art/backlog.json` einplanen.
- Computergegner ohne Boni, nur mit eigenem Sichtfeld.
- Sprache in Spiel, Doku und Commits: Deutsch.

## Offene Balance-Punkte

- Einfluss sammelt sich bei großen Reichen weiterhin an.
- Computergegner erobern selten Siedlungen.
