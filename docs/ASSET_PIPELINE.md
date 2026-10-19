# Asset-Pipeline für KI-generierte Grafiken

Der Prototyp zeichnet alle Grafiken prozedural (Canvas), damit das Spiel ohne externe Assets
vollständig spielbar ist. Die Formen, Farben und Lichtlogik folgen bereits der
[Grafik-Spezifikation](GRAFIK_SPEZIFIKATION.md). KI-generierte Sprites ersetzen diese Zeichnungen
schrittweise, ohne dass sich Spiellogik oder UI ändern: **Für jeden Schlüssel, zu dem ein Sprite
geladen ist, wird der Sprite gezeichnet – sonst unverändert die prozedurale Grafik.** Ohne Assets
sieht das Spiel pixelgenau so aus wie vorher.

## Technische Eckwerte (aus dem Prototyp abgeleitet)

| Wert | Festlegung im Code (`src/render/projection.ts`) |
|---|---|
| Hex-Ausrichtung | Spitze oben („pointy top“) |
| Hex-Radius | 36 Welt-Pixel (Zoom 1) |
| Hex-Breite (`HEX_W`) | √3 × 36 ≈ 62,4 Welt-Pixel |
| Vertikale Stauchung | 0,58 (Kameraneigung) → Oberseite ≈ 62,4 × 41,8 Welt-Pixel |
| Höhe je Höhenstufe | 0,85 × Hex-Radius ≈ 30,6 Welt-Pixel |
| Zoom | 0,4 – 2,0; Standard ≈ 10 Felder Bildbreite (Smartphone quer), auf breiten Bildschirmen mehr |
| Lichtquelle | oben links, Schatten nach rechts unten |
| Sichtbare Wände | nur Südwest- und Südost-Kante eines Feldes, mit Wandtextur (`wall/*`) |

Exportgrößen je Asset-Gruppe: siehe [Grafik-Spezifikation](GRAFIK_SPEZIFIKATION.md), Kapitel 6.
Die Karte wird bis Zoom 2,0 dargestellt.

## Schichtmodell des Renderers (Grafik-Spezifikation v2, Kap. 4)

Die Landschaft wird in vorgerenderten Chunks **zeilenweise von hinten nach vorne** aufgebaut; je Zeile
erst alle Bodenschichten, dann alle Objekte. Objekte ragen so über die Felder dahinter und werden von
vorderen, höheren Feldern verdeckt.

| Schicht | Datei | Inhalt | Gemalte Assets (sonst prozeduraler Platzhalter) |
|---|---|---|---|
| Wände | `src/render/ground.ts` | Felswand (≥ 2 Stufen, Felsküste), Erdhang (1 Stufe), Strandkante; Grasüberhang, Geröll, Wasserfall | `wall/*`, `path/waterfall_*` |
| Boden | `src/render/ground.ts`, `textures.ts` | Textur in **Weltkoordinaten** (zwei Lagen gegen Wiederholung), unregelmäßige Übergänge zu Nachbarn gleicher Höhe, Flachwasser und Schaum an Küsten | `texture/<gelände>_1/_2` |
| Flüsse, Wege | `ground.ts`, `roads.ts` | Flussband mit Uferkante, Feldweg, Schiene | `path/*` |
| Bodendetails | `ground.ts` | Blumen, Steinchen, Grasbüschel | – |
| Hexgitter | `ground.ts` | feine helle Linie je Feld | – (prozedural) |
| Objekte | `src/render/objects.ts`, `painter.ts` | Bäume/Büsche/Felsen gestreut mit Variante, Position, Größe ±15 %, Spiegelung; Bergmassive; Ausbauten; Ressourcen; Siedlungen aus Gebäudebausteinen | `prop/*`, `building/*`, `improvement/*` |
| Grenzen, Einheiten, Nebel | `src/render/renderer.ts` | Reichsgrenzen, Einheiten, entsättigter Schleier für erkundete, nicht sichtbare Felder | `unit/*` |

Neue Chunks werden mit einem Zeitbudget je Bild gezeichnet (`CHUNK_BUDGET_MS`); fehlende Chunks folgen
in den nächsten Bildern, bis dahin wird eine andere Auflösungsstufe gezeigt.

## Grafik als Teil der Entwicklung

Es gibt kein separates Grafik-Team: Grafiken entstehen im Repository als **SVG-Vektorquellen**
(`art/svg/`) und werden mit `npm run art:render` deterministisch zu PNG gerendert. Stil und
Vorlagen: [art/STYLE.md](../art/STYLE.md).

- **Neue Spielobjekte bringen ihre Grafik mit.** Jede Einheit, jeder Ausbau, jede Geländeart usw.
  erzeugt automatisch einen erwarteten Asset-Schlüssel. Fehlt die Grafik, schlägt `npm run assets:check`
  (und damit die CI) fehl.
- **Ausnahme mit Planung:** Ist die Grafik nicht im selben Feature machbar, wird sie mit Ziel-Release
  in `art/backlog.json` eingetragen. Die CI akzeptiert das, aber **ein Release schlägt fehl**, solange
  Grafiken für dieses (oder ein früheres) Release offen sind (`npm run assets:release-check`, läuft in
  PRs nach `main` und im Release-Workflow).
- **Quellen und Ergebnis bleiben synchron:** `npm run art:check` (CI) prüft, dass PNGs und Manifest
  zu den SVG-Quellen passen.
- Die GitHub-Actions-Zusammenfassung zeigt bei jedem Lauf die Grafik-Abdeckung und den Backlog je Release.

**Werkzeugwahl (ab Grafik-Spezifikation Version 2):** Die Zielgrafik ist handgemalt-detailliert
(siehe [GRAFIK_SPEZIFIKATION.md](GRAFIK_SPEZIFIKATION.md)). Sie wird mit KI-Bildgenerierung
(Scenario, trainierte Stilmodelle) erzeugt und im Repository nachbearbeitet. Die SVG-Grafiken aus
`art/svg/` sind ein **Zwischenstand** und dienen als Platzhalter, bis die gemalten Assets abgenommen sind.

## Überblick

| Teil | Datei |
|---|---|
| Manifest (Liste vorhandener Sprites) | `public/assets/manifest.json` |
| Sprite-Dateien | `public/assets/<kategorie>/<name>.png\|webp` |
| Schlüssel, Fallbacks, Manifest-Prüfung (ohne DOM, getestet) | `src/render/assetKeys.ts` |
| Laden der Bilder (`AssetLibrary`, Singleton `assets`) | `src/render/assets.ts` |
| Zeichnen: Felder / Einheiten | `src/render/painter.ts`, `src/render/units.ts` |
| Asset-Vorschau (Menü ☰) | `src/ui/assetPreview.ts` |
| Prüfskript | `scripts/check-assets.mjs` (`npm run assets:check`) |
| Tests | `tests/assets.test.ts` |

Ablauf: `main.ts` startet `assets.load()` im Hintergrund. Das Manifest wird über die **relative**
URL `assets/manifest.json` geladen (funktioniert mit Vite `base: './'` und im Android-WebView;
Vite kopiert `public/assets/` unverändert nach `dist/assets/`). Bis alle Bilder geladen sind, zeichnet
das Spiel prozedural. Danach verwirft der Renderer **einmal** seinen Chunk-Cache und den
Einheiten-Cache und zeichnet neu – Sprites landen wie bisher in den vorgerenderten Gelände-Chunks,
die Bildrate bleibt gleich.

Fehlt das Manifest, ist es ungültig oder lässt sich ein Bild nicht laden, wird still auf die
prozedurale Grafik zurückgefallen. Nur im Entwicklungsmodus (`npm run dev`) erscheint genau eine
Konsolenwarnung mit allen Problemen.

## Manifest-Format

```json
{
  "version": 1,
  "sprites": {
    "terrain/grassland": { "file": "terrain/grassland.webp" },
    "overlay/forest":    { "file": "overlay/forest.webp", "anchorY": 0.75 },
    "unit/spearman":     { "file": "unit/spearman.webp", "anchorX": 0.5, "anchorY": 0.92, "scale": 0.8 },
    "unit/spearman_mask":{ "file": "unit/spearman_mask.png" }
  }
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `version` | ja | Immer `1`. Andere Versionen werden ignoriert (→ prozedural). |
| `sprites` | ja | Objekt: Schlüssel → Eintrag. Leeres Objekt = keine Sprites. |
| `file` | ja | Pfad relativ zu `public/assets/`, nur `.png` oder `.webp`, kein `..`, keine URL. |
| `anchorX`, `anchorY` | nein | Ankerpunkt im Bild, relativ (0 = links/oben, 1 = rechts/unten). |
| `scale` | nein | Bildbreite in Vielfachen der Hex-Breite `HEX_W` (Höhe proportional). |

Ungültige Einträge werden einzeln übersprungen, gültige bleiben aktiv. Ungültige Anker-/Skalenwerte
werden durch den Standardwert ersetzt.

### Anker und Skalierung

Jeder Sprite wird so skaliert, dass seine Breite `HEX_W × scale` Welt-Pixel beträgt. Der Ankerpunkt
wird gelegt auf

- **Feld-Sprites** (Gelände, Overlay, Ausbau, Siedlung): den Mittelpunkt der sichtbaren
  Feld-Oberseite (bereits um die Höhenstufe angehoben),
- **Einheiten**: den Fußpunkt der Einheit (Mitte des Fraktionsrings).

Standardwerte, wenn das Manifest nichts angibt:

| Kategorie | anchorX | anchorY | scale | Hinweis |
|---|---|---|---|---|
| `texture`, `wall` | – | – | 2 | nahtlose Textur; `scale` = Weltbreite einer Kachel in `HEX_W` (Boden wird in der Ansicht um 0,58 gestaucht) |
| `prop` | 0,5 | 0,95 | 0,45 | Einzelobjekt mit Fußpunkt unten mittig; Größe je Platzierung ±15 % |
| `building` | 0,5 | 0,85 | 0,42 | Gebäudebaustein, Bodenmitte |
| `path`, `portrait`, `fx` | 0,5 | 0,5 | 1 | |
| `terrain` | 0,5 | 0,5 | 1 | v1, wird auf der Karte nicht mehr verwendet |
| `overlay` | 0,5 | 0,7 | 1 | Feldmitte liegt bei 70 % der Bildhöhe (Platz für Bäume/Gipfel) |
| `improvement` | 0,5 | 0,7 | 1 | wie Overlay |
| `settlement` | 0,5 | 0,7 | 1 | wie Overlay |
| `unit` | 0,5 | 0,92 | 0,8 | Fußpunkt unten mittig |
| `ui` | 0,5 | 0,5 | 1 | frei verwendbar |

Beispiel: Ein Wald-Overlay mit 250 × 250 px und `anchorY: 0.7` – die Hex-Oberseite (250 × 190 px)
liegt dann im unteren Bildteil, darüber ist Platz für Baumkronen.

## Schlüssel

Alle Schlüssel werden aus den Datentabellen abgeleitet (`expectedAssetKeys()` in
`src/render/assetKeys.ts`). Kommt ein neuer Einheitentyp oder Ausbau hinzu, erscheint sein Schlüssel
automatisch in Vorschau und Prüfskript.

Der feste Teil des Katalogs v2 (Texturen, Wände, Wege, Objektvarianten, Gebäudestile, Atmosphäre)
steht in `src/render/catalogV2.json` – Spiel und Prüfskript lesen dieselbe Datei.

| Schlüssel | Quelle | Verwendung |
|---|---|---|
| `texture/<gelände>_<1\|2>` | Katalog (9 Geländearten × 2) | nahtlose Bodentextur 512 × 512; Variante 2 liegt in anderem Maßstab halbtransparent darüber |
| `wall/<id>` | Katalog: `cliff_temperate`, `cliff_desert`, `cliff_snow`, `slope`, `beach`, `overhang`, `foam`, `scree` | Wandtexturen (horizontal kachelbar) und Kanten |
| `path/<id>` | Katalog: Flussband, Wasserfälle, Wege, Brücken | Flüsse und Wege |
| `prop/<art>_<n>` | Katalog: `tree_broadleaf` (6), `tree_conifer` (6), `tree_palm` (3), `tree_bare` (3), `bush` (6), `rock` (6), `mountain` (4), `peak` (3) | gestreute Einzelobjekte, Variante je Platzierung |
| `prop/resource_<id>` | `RESOURCES` | Rohstoff als Feld-Objekt (sonst Plakette mit Symbol) |
| `improvement/<id>` | `IMPROVEMENTS` (farm, mine, lumber, quarry, …) | Ausbau; Stufenpunkte werden darüber gezeichnet |
| `improvement/<id>_<stufe>` | optional | eigene Grafik je Ausbaustufe (2, 3); Fallback auf `improvement/<id>` |
| `building/<stil>_<typ>` | Katalog: Stile `stone`, `antiquity`, `medieval`, `industrial`, `modern` × Typen `house_small`, `house_large`, `center`, `tower`, `workshop`, `storage`, `wall` | Siedlungsbausteine; die Siedlung wird daraus zusammengesetzt und wächst mit Art und Bevölkerung |
| `unit/<id>` | `UNIT_TYPES` | Einheit auf der Karte |
| `unit/<id>_mask` | optional | Farbmaske für die Fraktionsfarbe (siehe unten) |
| `portrait/<id>` | `UNIT_TYPES` | gemaltes Porträt 512 × 512 für das Einheitenpanel |
| `fx/<id>` | Katalog: Wolken, Nebel, Deko-Tiere | Atmosphäre |
| `terrain/*`, `overlay/*`, `settlement/*` | optional (v1) | feldgebundene Platzhalter aus Version 1; die Karte nutzt sie nicht mehr (Ausnahme `settlement/machine`), die Asset-Vorschau zeigt sie weiter |
| `ui/<name>` | frei | für spätere UI-Grafiken; wird geladen und in der Vorschau gezeigt |

**Epochenstil der Gebäude:** Steinzeit → `stone`, Bronze-/Eisenzeit → `antiquity`, Mittelalter/Renaissance
→ `medieval`, Industrie/Moderne → `industrial`, Information/Zukunft → `modern` (`buildingStyle()` in
`assetKeys.ts`).

Die Fraktionsringe, Lebensbalken, Statussymbole, Siedlungsbanner, Ressourcen-Plaketten,
Reichsgrenzen und Hervorhebungen zeichnet weiterhin der Renderer.

## Einheiten und Farbmasken

Einheiten-Sprites sollten neutral gemalt sein. Damit die Fraktionsfarbe sichtbar wird, gibt es zwei Wege:

1. **Ohne Maske:** Der Sprite wird unverändert gezeichnet; die Fraktion erkennt man am farbigen Ring.
2. **Mit Maske `unit/<id>_mask`:** ein Bild in **gleicher Größe** wie der Sprite, **weiß auf
   transparent** an den Stellen, die eingefärbt werden sollen (Kleidung, Fahne, Schild). Das Spiel
   färbt die Maske in der Spielerfarbe, beschneidet sie auf die Deckkraft des Sprites und legt sie per
   `multiply` darüber. Unter der Maske sollte der Sprite daher **hell und neutral (hellgrau bis weiß)**
   gemalt sein – Licht und Schatten des Sprites bleiben so erhalten. Halbtransparente Maskenpixel
   färben entsprechend schwächer ein. Das Ergebnis wird je Typ und Farbe zwischengespeichert.

## Sprite hinzufügen (Kurzanleitung)

1. Bild exportieren (PNG/WebP, transparent, 4-fache Auflösung) und ablegen, z. B.
   `public/assets/unit/spearman.webp`.
2. Eintrag in `public/assets/manifest.json` ergänzen:
   `"unit/spearman": { "file": "unit/spearman.webp", "anchorY": 0.92, "scale": 0.8 }`.
3. `npm run assets:check` ausführen (fehlende Dateien, unbekannte Schlüssel, ungültige Werte).
4. `npm run dev`, Spiel starten, Menü ☰ → **„Asset-Vorschau“**: Status „geladen“ und Vorschaubild
   prüfen, anschließend auf der Karte kontrollieren. Anker/Skalierung bei Bedarf im Manifest
   nachjustieren (Seite neu laden).

## Asset-Vorschau

Im Spiel über Menü ☰ → „Asset-Vorschau (Grafik-Abdeckung)“. Die Ansicht listet alle erwarteten
Schlüssel nach Kategorie mit

- Status **geladen**, **fehlt** (Pflicht-Sprite fehlt), **optional** (Variante/Maske) oder
  **Ladefehler** (im Manifest eingetragen, Bild nicht ladbar),
- Vorschaubild auf einem Musterfeld – genau so, wie das Spiel zeichnen würde (Sprite oder prozedural,
  bei Gebäuden als Beispielsiedlung; Einheiten in neutralem Blau `#2f6fb5`),
- Abdeckung „x von y Pflicht-Sprites“ sowie unbekannte Schlüssel aus dem Manifest.

Optionale Varianten und Masken lassen sich per Häkchen einblenden.

## Prüfskript

```
npm run assets:check                                # prüft public/assets
node scripts/check-assets.mjs --dir <ordner>        # anderes Verzeichnis
node scripts/check-assets.mjs --json                # Ergebnis maschinenlesbar
node scripts/check-assets.mjs --list-keys           # alle erwarteten Schlüssel
```

Ohne Abhängigkeiten (nur `node:fs`). **Fehler** (Exit-Code 1): fehlendes/ungültiges Manifest, falsche
Version, Datei fehlt, unbekannter Schlüssel, ungültige Einträge oder Werte. **Hinweise**: Bilddateien
ohne Manifest-Eintrag, Masken ohne Sprite, Abdeckung der Pflicht-Sprites. Bildabmessungen werden
nicht geprüft. Die erwarteten Schlüssel liest das Skript per Textanalyse aus `src/core/data`; ein
Test stellt sicher, dass sie mit `expectedAssetKeys()` übereinstimmen.

## Dateistruktur

```
public/assets/
├── manifest.json                 Liste vorhandener Sprites (fehlende → prozedurale Zeichnung)
├── terrain/<terrain>.webp        Oberseite je Geländeart (grassland, plains, desert, …)
├── overlay/<overlay>.webp        forest, denseForest, rocks, mountain, highMountain (+ _conifer)
├── improvement/<id>.webp         farm, mine, lumber, quarry, … (IDs aus data/improvements.ts)
├── settlement/<art>_<epoche>.webp  camp_0, settlement_1, city_5, …
├── unit/<id>.webp                IDs aus data/units.ts (Fußpunkt unten mittig)
├── unit/<id>_mask.png            optionale Farbmaske
└── ui/<name>.webp                spätere UI-Grafiken
```

Die Ordnerstruktur ist eine Empfehlung – maßgeblich ist der Pfad in `file`. Wandtexturen
(`walls/<cliff|earth>`) sind noch nicht angebunden; Wände bleiben prozedural.

## KI-Produktion mit Scenario (Grafik-Spezifikation v2, Kap. 7)

| Datei | Inhalt |
|---|---|
| `art/scenario/jobs.json` | Aufträge: Schlüssel, Art (`texture`, `object`, `portrait`), Prompt-Zusatz, Referenzbilder, Modell-Preset |
| `art/scenario/ref/` | Referenzausschnitte aus dem Zielbild |
| `art/scenario/uploads.json` | Scenario-Asset-IDs der hochgeladenen Referenzen (Zwischenspeicher) |
| `art/scenario/raw/` | Rohbilder (nicht im Repository, über die Job-IDs in `art/sources.json` abrufbar) |
| `art/scenario/selection.json` | gewählte Variante je Schlüssel, Typ, Zielgröße, optional `anchorX`/`anchorY`/`scale` |
| `art/sources.json` | Herkunft: Modell, Prompt, Parameter, Referenzen, Job-ID, verbrauchte CU, Dateien |

Ablauf (Zugangsdaten in `SCENARIO_API_KEY`/`SCENARIO_API_SECRET`, werden nie ausgegeben):

1. `node scripts/scenario-generate.mjs --dry-run [--only <schlüssel>]` – Kosten schätzen (verbraucht nichts).
2. `node scripts/scenario-generate.mjs --only <schlüssel> --max-cu <n>` – generieren; bricht ab, wenn die
   Schätzung das Budget übersteigt (Standard 200 CU).
3. Objekte freistellen: `node scripts/scenario-generate.mjs --remove-bg art/scenario/raw/<schlüssel>/<n>.png`
   (Photoroom, 3 CU je Bild; der Schatten wird entfernt, den Kontaktschatten zeichnet der Renderer).
4. Variante in `art/scenario/selection.json` eintragen, dann `python3 scripts/art-postprocess.py [<schlüssel>]`
   (Pillow mit WebP): Texturen 512 × 512 nahtlos, Objekte mit Fußpunkt bei 95 % der Höhe, Porträts 512 × 512;
   schreibt `public/assets/<schlüssel>.webp` und das Manifest.
5. `npm run assets:check`, `npm run art:prune`, im Spiel prüfen (Kapitel 8 der Spezifikation).

Kosten (Stand 10/2026, per dryRun): Gemini 3.1 Flash 12 CU je Bild (mit Referenzen 13), FLUX.2 Dev 16,
FLUX.2 Klein 9B 11, Freistellen 3; LoRA-Training 92–156 CU je Modell.

## Prompt-Vorlage

Basis (immer gleich):

```
Stylized isometric 2D strategy game asset. Clean vector-like shapes with subtle hand-painted
textures. Medium-low detail. Clear readable silhouette. Fixed orthographic isometric perspective,
camera tilt matching a hex tile squashed to 66 % height. Soft lighting from upper left. Soft short
shadows towards lower right. Matte materials. Moderate saturation. No photorealism. No text.
No UI elements. Transparent background. Designed for a hex-based turn-based 4X strategy game.
```

Zusätze je Kategorie:

- **Einheit** – `Single <unit description>, full body, standing pose, slightly oversized for
  readability, faction cloth parts painted in neutral light grey so they can be recolored.`
  (Dazu eine Maske der grauen Stoffteile als `unit/<id>_mask` erstellen.)
- **Gebäude/Siedlung** – `Small <era> <building> cluster fitting inside one hexagon footprint.`
- **Overlay** – `Group of <trees/rocks/peaks> fitting inside one hexagon footprint, no ground.`
- **Gelände** – `Seamless top-down ground texture of <terrain>, flat, no objects, fills the whole image.`

## Konsistenz-Checkliste je Asset

Kategorie · Epoche · Perspektive · Blickrichtung · Größe · Licht · Schatten · Farbpalette ·
Detailgrad · Fraktionszugehörigkeit · Hintergrund · technische Verwendung (Schlüssel und Dateiname
laut Manifest) · Anker/Skalierung in der Asset-Vorschau geprüft.
