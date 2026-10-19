# Grafik-Stilleitfaden für SVG-Quellen

Alle Spielgrafiken entstehen als **SVG-Vektorquellen** in `art/svg/` und werden mit
`npm run art:render` deterministisch zu PNG gerendert (`public/assets/`, Manifest wird automatisch
gepflegt). Grundlage ist die [Grafik-Spezifikation](../docs/GRAFIK_SPEZIFIKATION.md):
*Stylized Isometric 2D Strategy Art* – klare, vektorartige Formen, moderate Details, klare Silhouetten.

## Workflow (Grafik ist Teil jedes Features)

1. Neues Spielobjekt in `src/core/data` anlegen (Einheit, Ausbau, Gelände …).
2. `npm run assets:check` zeigt die fehlende Grafik als Fehler.
3. SVG unter `art/svg/<schlüssel>.svg` erstellen (Vorlagen unten), `npm run art:render` ausführen.
4. Im Spiel prüfen: ☰ → Asset-Vorschau sowie auf der Karte (verschiedene Zoomstufen, Fraktionsfarben).
5. Ist die Grafik ausnahmsweise nicht im selben Feature machbar: Eintrag in `art/backlog.json` mit
   Ziel-Release. Das Release scheitert, solange eingeplante Grafiken fehlen.

Die CI prüft bei jedem PR: Manifest gültig, keine ungeplant fehlende Pflicht-Grafik, PNGs passen zu
den SVG-Quellen (`npm run art:check`). PRs nach `main` und der Release-Workflow prüfen zusätzlich,
dass keine Grafik des aktuellen Releases mehr offen ist (`npm run assets:release-check`).

## Leinwände und Anker

Maßstab: 4 Bildpixel = 1 Welt-Pixel. Ein Hexfeld ist oben 250 × 190 px groß (Spitze oben, um 0,66 gestaucht).

| Kategorie | Leinwand (px) | Anker (Wurzel-Attribute) | Bezugspunkt |
|---|---|---|---|
| `terrain/*` | 250 × 190 | Standard (0,5 / 0,5) | Bild = Oberseite, wird auf das Hex zugeschnitten; ganze Fläche füllen |
| `overlay/*`, `improvement/*`, `settlement/*` | 256 × 320 | `data-anchor-y="0.7"` (Standard) | Feldmitte bei (128, 224); Hex-Oberseite reicht von y ≈ 129 bis 319, x ≈ 3 bis 253 |
| `unit/*` | 200 × 200 | `data-anchor-y="0.92" data-scale="0.8"` (Standard) | Fußpunkt bei (100, 184) |

Objekte auf Feldern bleiben innerhalb der Hex-Ellipse (Mitte 128/224, Halbachsen ≈ 110 × 80);
Höhe darüber ist frei (Bäume, Gipfel, Türme).

## Perspektive, Licht, Schatten

- Feste isometrische Ansicht von schräg oben; Bodenflächen sind horizontal um **0,66** gestaucht
  (Kreise auf dem Boden → Ellipsen mit Verhältnis 1 : 0,66).
- **Licht von oben links.** Linke/obere Flächen heller, rechte/untere dunkler (3 Tonstufen je Material:
  Licht, Grundton, Schatten).
- **Schlagschatten nach rechts unten:** halbtransparente dunkle Ellipse (`#1a2410`, Deckkraft 0,25),
  um (+6, +3) px versetzt, unter dem Objekt.
- Keine Konturlinien in Schwarz; Kanten entstehen durch Tonwertunterschiede. Dezente dunklere
  Umrisslinie (Grundton −40 %, 1,5 px) ist erlaubt, um Silhouetten zu stärken.
- Matte Materialien, keine Glanzlichter, keine Fotorealistik, **kein Text**.

## Palette

| Material | Licht | Grundton | Schatten |
|---|---|---|---|
| Grasland | `#a8d06a` | `#86b84a` | `#5f8f33` |
| Ebene | `#d4cf7c` | `#b9b45a` | `#918c3d` |
| Wüste | `#f0dba6` | `#e0c486` | `#bfa064` |
| Tundra | `#b8c2a6` | `#9aa486` | `#748062` |
| Schnee | `#ffffff` | `#e9eff3` | `#c3cfd8` |
| Sumpf | `#87a672` | `#6b8a57` | `#4f6a3f` |
| Wasser (Küste) | `#5aa9d6` | `#3c93c6` | `#2a6f9c` |
| Meer | `#3a7fb8` | `#2b6ca3` | `#1f5383` |
| Laub | `#6aa84f` | `#3f7a35` | `#2c5a26` |
| Nadelbaum | `#4f8a55` | `#2f5f3a` | `#1f4228` |
| Fels | `#cfc8be` | `#9c958b` | `#6b645c` |
| Holz | `#b08559` | `#7a5a36` | `#553c22` |
| Stroh/Reet | `#e2c27a` | `#b48a4a` | `#86622e` |
| Ziegeldach | `#d07a5a` | `#b8573a` | `#843a25` |
| Putz/Wand | `#f2e7d2` | `#d9c7a5` | `#a8946f` |
| Haut | `#f0c9a0` | `#e0b48a` | `#b88a62` |
| Metall | `#e3e7ea` | `#aab3ba` | `#6d767d` |

## Fraktionsfarbe (nur Einheiten)

Flächen, die die Spielerfarbe tragen (Tunika, Fahne, Schildfläche, Wimpel), erhalten
`class="faction"` und werden **hell und neutral** gemalt: Licht `#f4f4f4`, Grundton `#d6d6d6`,
Schatten `#a8a8a8`. Das Render-Skript erzeugt daraus die Maske `unit/<id>_mask`; das Spiel färbt
diese Flächen per Multiplikation in der Spielerfarbe ein – die Schattierung bleibt erhalten.
Jede Einheit braucht mindestens eine deutlich sichtbare Fraktionsfläche.

## Einheiten

- Etwas überproportional (Lesbarkeit vor Maßstab), Figur ca. 120–150 px hoch, Fußpunkt (100, 184).
- Klare Silhouette mit charakteristischer Ausrüstung je Epoche; Blickrichtung leicht nach links unten.
- Zivile Einheiten ohne Waffen; Militär trägt epochentypische Waffen (Keule, Speer, Bogen, Schwert,
  Muskete, Gewehr, Panzer …). Fahrzeuge und Schiffe passen in die 200er-Leinwand.
- Maschinen der KI-Fraktion: dunkles Graphit (`#1b2430`) mit türkisen Leuchtakzenten (`#14d2c8`),
  keine Fraktionsfläche nötig.

## Dateien

- `art/svg/_defs.svg`: gemeinsame Verläufe/Filter; in eine Datei einbinden mit `<!-- @defs -->`
  innerhalb von `<defs>`.
- Dateiname = Schlüssel: `art/svg/unit/spearman.svg` → `unit/spearman`.
- Für resvg geeignetes SVG 1.1 verwenden (Pfade, Formen, Verläufe, `opacity`, `<g transform>`,
  `<clipPath>`, einfache CSS-Klassen). Keine Schriften, keine externen Bilder.
