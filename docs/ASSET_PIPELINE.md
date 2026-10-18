# Asset-Pipeline für KI-generierte Grafiken

Der Prototyp zeichnet alle Grafiken prozedural (Canvas), damit das Spiel ohne externe Assets
vollständig spielbar ist. Die Formen, Farben und Lichtlogik folgen bereits der
[Grafik-Spezifikation](GRAFIK_SPEZIFIKATION.md). KI-generierte Sprites ersetzen diese Zeichnungen
schrittweise, ohne dass sich Spiellogik oder UI ändern.

## Technische Eckwerte (aus dem Prototyp abgeleitet)

| Wert | Festlegung im Code (`src/render/projection.ts`) |
|---|---|
| Hex-Ausrichtung | Spitze oben („pointy top“) |
| Hex-Radius | 36 Welt-Pixel (Zoom 1) |
| Vertikale Stauchung | 0,66 (Kameraneigung) |
| Höhe je Höhenstufe | 17 Welt-Pixel |
| Lichtquelle | oben links, Schatten nach rechts unten |
| Sichtbare Wände | nur Südwest- und Südost-Kante eines Feldes |

Empfohlene Exportgrößen: 4-fache Auflösung der Weltpixel (Hex-Oberseite ca. 250 × 165 px),
transparenter Hintergrund, PNG oder WebP.

## Geplante Dateistruktur

```
public/assets/
├── manifest.json            Liste vorhandener Sprites (fehlende → prozedurale Zeichnung)
├── terrain/<terrain>.webp   Oberseite je Geländeart (grassland, plains, desert, …)
├── walls/<cliff|earth>.webp Wandtexturen, kachelbar
├── overlay/<feature>.webp   forest, denseForest, rocks, mountain, highMountain
├── improvement/<id>.webp    farm, mine, lumber, quarry, … (IDs aus data/improvements.ts)
├── settlement/<kind>_<era>.webp  camp_0, settlement_1, city_5, …
└── unit/<id>.webp           IDs aus data/units.ts (Fußpunkt unten mittig)
```

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
  readability, faction accent color as a neutral blue (#2f6fb5) cloth that can be recolored.`
- **Gebäude/Siedlung** – `Small <era> <building> cluster fitting inside one hexagon footprint.`
- **Overlay** – `Group of <trees/rocks/peaks> fitting inside one hexagon footprint, no ground.`

## Konsistenz-Checkliste je Asset

Kategorie · Epoche · Perspektive · Blickrichtung · Größe · Licht · Schatten · Farbpalette ·
Detailgrad · Fraktionszugehörigkeit · Hintergrund · technische Verwendung (Dateiname laut Struktur).
