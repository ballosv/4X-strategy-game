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
| Vertikale Stauchung | 0,66 (Kameraneigung) → Oberseite ≈ 62,4 × 47,5 Welt-Pixel |
| Höhe je Höhenstufe | 17 Welt-Pixel |
| Lichtquelle | oben links, Schatten nach rechts unten |
| Sichtbare Wände | nur Südwest- und Südost-Kante eines Feldes (bleiben prozedural) |

Empfohlene Exportgrößen: 4-fache Auflösung der Weltpixel (Hex-Oberseite ca. **250 × 190 px**),
transparenter Hintergrund, PNG oder WebP. Die Karte wird bis Zoom 2,6 dargestellt; 4-fach reicht
auch für hochauflösende Displays.

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
| `terrain` | 0,5 | 0,5 | 1 | Bild = Oberseite, wird auf die Hex-Oberseite zugeschnitten |
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

| Schlüssel | Quelle | Verwendung |
|---|---|---|
| `terrain/<id>` | `TERRAIN` (ocean, coast, lake, grassland, plains, desert, tundra, snow, marsh) | Oberseite, auf das Hex zugeschnitten. Wände, Flüsse, Brandung und Hexgrenzen bleiben prozedural; Gebirgsfelder (Stufe 4/5) werden wie bisher felsig eingefärbt. |
| `overlay/forest`, `overlay/denseForest`, `overlay/rocks` | `FEATURES` | Geländemerkmal |
| `overlay/forest_conifer`, `overlay/denseForest_conifer` | optional | Nadelwald (Tundra, Schnee, ab Höhenstufe 3); Fallback auf die Basis ohne `_conifer` |
| `overlay/mountain`, `overlay/highMountain` | Höhenstufe 4 / 5 | Bergmassiv |
| `improvement/<id>` | `IMPROVEMENTS` (farm, mine, lumber, quarry, …) | Ausbau; Stufenpunkte werden darüber gezeichnet |
| `improvement/<id>_<stufe>` | optional | eigene Grafik je Ausbaustufe (2, 3); Fallback auf `improvement/<id>` |
| `settlement/<camp\|settlement\|city>_<epoche>` | Siedlungsart × `ERAS` (0–8) | Siedlung; Mauern/Palisade werden darüber gezeichnet |
| `settlement/<art>` | optional | epochenunabhängige Grafik (letzter Fallback) |
| `settlement/machine` | optional | Kern der Maschinen-KI |
| `unit/<id>` | `UNIT_TYPES` | Einheit (Karte und Porträt im Einheitenpanel) |
| `unit/<id>_mask` | optional | Farbmaske für die Fraktionsfarbe (siehe unten) |
| `ui/<name>` | frei | für spätere UI-Grafiken; wird geladen und in der Vorschau gezeigt |

**Epochen-Fallback für Siedlungen:** gesucht wird `settlement/<art>_<epoche des Besitzers>`, dann jede
niedrigere Epoche bis `_0`, zuletzt `settlement/<art>`. Beispiel Stadt im Mittelalter (Epoche 3):
`city_3 → city_2 → city_1 → city_0 → city`. Pflicht ist daher nur `_0`; spätere Epochen sind optional.

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
  bei Siedlungen inklusive Epochen-Fallback; Einheiten in neutralem Blau `#2f6fb5`),
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
