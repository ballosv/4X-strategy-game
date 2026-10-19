# AI 4X – Grafik-Spezifikation (Version 2)

**Stand:** 19.10.2026 · ersetzt Version 1 vom 30.09.2026
**Zweck:** Verbindliche visuelle Grundlage für Grafikproduktion (KI-gestützt) und Renderer.

**Verbindliches Zielbild:** [`docs/referenz/einheitenpanel.png`](referenz/einheitenpanel.png)
(im Folgenden „Zielbild“). Ergänzend für Siedlungs-/Wirtschaftsansichten:
[`docs/referenz/siedlungsansicht.png`](referenz/siedlungsansicht.png).
Ist-Stand zum Vergleich: [`docs/referenz/ist-stand-v0.2.jpg`](referenz/ist-stand-v0.2.jpg).

---

## 0. Was sich gegenüber Version 1 ändert

Version 1 beschrieb einen vektorartigen Stil mit „Medium-Low“-Detail und Feldern als einzelnen
Kacheln. Das Zielbild zeigt etwas anderes: eine **gemalte, detailreiche Diorama-Landschaft**, über
der das Hexgitter nur als feine Linie liegt. Version 2 richtet die Spezifikation am Zielbild aus.

| Thema | Version 1 | Version 2 (verbindlich) |
|---|---|---|
| Stil | vektorartig, Medium-Low Detail | **handgemalt-stilisiert, mittel-hoher Detailgrad** („painted isometric diorama“) |
| Gelände | eine Grafik je Feld | **durchgehende Landschaft**: Texturen in Weltkoordinaten, weiche Übergänge, Gitter als Overlay |
| Höhen | sichtbare Stufen | **hohe, natürliche Felswände** mit Fels-Textur, Grasüberhang, Wasserfällen |
| Objekte | ein Sprite je Feld | **Einzelobjekte** (Bäume, Felsen, Häuser) werden je Feld variiert verteilt und dürfen über Feldgrenzen ragen |
| Siedlungen | ein Bild je Siedlung | **aus Gebäude-Sprites zusammengesetzt**, wachsen mit der Größe, Epochenstil |
| Einheiten | einfache Pose, wenig Details | **detailliert gemalte Figuren**, leicht überproportional, Fraktionsfarbe auf Wappenrock/Schild/Banner |
| Produktion | SVG von Hand | **KI-Bildgenerierung mit trainierten Stilmodellen** (Scenario), Nachbearbeitung im Repo |

Unverändert bleiben: 2D-Pipeline, isometrische Ansicht, Hexfelder, Licht von oben links, moderne
Flat-UI, kontextabhängiges Panel unten, Lesbarkeit vor Realismus.

---

## 1. Leitprinzip

> **Die Spielwelt soll wie ein handgemaltes Diorama wirken – reich an Details, aber jederzeit
> lesbar: Felder, Höhen, Einheiten, Besitz und mögliche Aktionen müssen auf einen Blick erkennbar sein.**

Wo Detail und Lesbarkeit kollidieren, gewinnt die Lesbarkeit (z. B. Einheiten größer als
maßstabsgetreu, Hexlinien immer sichtbar, Fraktionsfarben kräftig).

---

## 2. Stil

### 2.1 Grundstil

**Stylized hand-painted isometric strategy art** – vergleichbar mit modernen Aufbau- und
Strategiespielen in gemalter 2D/2,5D-Optik:

- gemalte Texturen mit sichtbaren, weichen Pinselstrukturen, aber ohne Fotorealismus,
- kräftige, natürliche Farben mit leicht warmem Licht,
- klare Silhouetten durch Hell-Dunkel-Kontrast (keine schwarzen Konturen),
- weiche Umgebungsverschattung (Ambient Occlusion) an Kontaktstellen,
- Schlagschatten kurz bis mittel, nach rechts unten,
- Wasser mit Tiefenverlauf (flach türkis → tief blau), Schaumkante an Küsten und Felsen,
- Atmosphäre: leichte Wolken-/Nebelschleier am Kartenrand und im Nebel des Krieges.

### 2.2 Nicht angestrebt

- Fotorealismus, realistische 3D-Renderings, starke Spiegelungen,
- Pixelart, Low-Poly-Optik, flache Vektorgrafik (Stand v0.2),
- uneinheitliche Einzelbilder: **Kein Asset darf aus dem Stil fallen** (Kapitel 8),
- komplette Szenen als ein Bild (nur Einzel-Assets, Texturen und Bausteine),
- Text in Grafiken.

### 2.3 Detailgrad

**Mittel-hoch.** Bei normalem Zoom (Kapitel 3) sind Fenster, Dachziegelreihen, Speere, Schilde,
Tierfiguren und Felsstrukturen erkennbar. Bei herausgezoomter Ansicht (Zoom ≤ 0,6) müssen
Silhouette und Farbe allein genügen.

---

## 3. Kamera, Maßstab und Höhen

Die Werte sind am Zielbild abgeleitet und werden im Renderer (`src/render/projection.ts`) umgesetzt.

| Parameter | Version 1 / v0.2 | Version 2 (Ziel) |
|---|---|---|
| Hex-Ausrichtung | Spitze oben | Spitze oben (unverändert) |
| Vertikale Stauchung (Neigung) | 0,66 | **0,58** (flachere Kamera, mehr Tiefe) |
| Höhe je Höhenstufe | 0,47 × Hex-Radius | **0,85 × Hex-Radius** (Klippen deutlich hoch) |
| Standard-Zoom | ca. 20 Felder Bildbreite | **ca. 9–11 Felder Bildbreite** auf dem Smartphone quer |
| Zoombereich | 0,35 – 2,6 | 0,4 – 2,0 |
| Hexlinien | dunkle Kanten je Kachel | **feines helles Gitter** (Weiß/Gelbgrün, 15–25 % Deckkraft) über der Landschaft |

**Höhenstufen** (unverändert in der Spiellogik): 0 Wasser · 1 Ebene · 2 Hügel/erhöhtes Land ·
3 Hochplateau · 4 Gebirge · 5 Hochgebirge. Stufe 4–5 werden zusätzlich durch Bergmassiv-Objekte
dargestellt, die deutlich über die Feldfläche hinausragen.

**Klippen und Hänge:**
- Unterschied ≥ 2 Stufen (unpassierbar): **senkrechte Felswand** mit Gesteinsschichten,
  Grasüberhang an der Oberkante, Geröll am Fuß.
- Unterschied 1 Stufe (passierbar): **erdiger Hang** bzw. niedrige Felskante mit Grasflecken.
- Land an Wasser: Felsküste (ab Stufe 2) oder Strand/Uferböschung (Stufe 1) mit Schaumkante.
- Flussüberquerung von höheren Feldern: Wasserfall über die Wand.

---

## 4. Aufbau der Spielwelt (Rendering-Schichten)

Damit aus Bausteinen eine durchgehende Landschaft wie im Zielbild entsteht, setzt der Renderer
die Welt in festen Schichten zusammen. Die Grafikproduktion liefert die Bausteine je Schicht.

| # | Schicht | Inhalt | Assets |
|---|---|---|---|
| 1 | Wasser | Tiefenverlauf, Wellen, Schaum an Küsten | Wassertexturen (flach/tief), Schaum-Pinsel |
| 2 | Bodenflächen | Geländetextur in **Weltkoordinaten** (nahtlos), Übergänge zu Nachbarn per Rauschmaske | 1 nahtlose Textur je Geländeart (+ Variante) |
| 3 | Wände | Felswände/Hänge der SW-/SO-Kanten in Fels- bzw. Erdtextur, Grasüberhang | Felswand-Texturen je Biom, Überhang-Kanten |
| 4 | Flüsse, Wege | Flussbänder, Wasserfälle, Straßen, Schienen, Brücken | Fluss-/Weg-Texturen, Brücken-Sprites |
| 5 | Bodendetails | Gras, Blumen, Steine, Felder, Zäune | kleine Streu-Sprites, Feld-Kacheln |
| 6 | Objekte | Bäume, Felsen, Berge, Gebäude, Ausbauten (nach Tiefe sortiert) | Einzel-Sprites mit Varianten |
| 7 | Hexgitter, Grenzen | feines Gitter, Reichsgrenzen in Spielerfarbe | prozedural |
| 8 | Einheiten | Figuren mit Fraktionsring, Banner, Lebensbalken | Einheiten-Sprites + Masken |
| 9 | Nebel | unerkundet: Wolkendecke; erkundet/nicht sichtbar: entsättigter Schleier | Wolken-Textur |

**Variation:** Jedes Objekt existiert in mehreren Varianten; der Renderer wählt anhand des Feldes
(deterministisch) Variante, Position, Größe (±15 %) und Spiegelung. Dadurch entsteht keine sichtbare
Wiederholung.

---

## 5. Asset-Katalog (Version 2)

Alle Assets sind Einzelbilder (transparenter Hintergrund) bzw. nahtlose Texturen. Schlüssel und
Dateiablage folgen [ASSET_PIPELINE.md](ASSET_PIPELINE.md); der Katalog wird in `src/render/assetKeys.ts`
gepflegt, damit Vorschau, CI und Grafik-Backlog ihn kennen.

| Gruppe | Inhalt | Anzahl (ca.) |
|---|---|---|
| Bodentexturen | Grasland, Ebene, Wüste, Tundra, Schnee, Sumpf, Küste/flaches Wasser, Meer, See; je 2 Varianten, nahtlos 512 × 512 | 18 |
| Wände & Kanten | Felswand (gemäßigt, Wüste, Schnee), Erdhang, Grasüberhang, Strandkante, Schaumkante | 8 |
| Flüsse & Wege | Flussband, Wasserfall (2), Feldweg, Straße, Schiene, Brücken (Holz, Stein, Stahl) | 10 |
| Vegetation | Laubbäume (6), Nadelbäume (6), Palmen (3), Tundra-/kahle Bäume (3), Büsche & Schilf (6) | 24 |
| Felsen & Berge | Felsbrocken (6), Bergmassive (4), Hochgebirge mit Schnee (3) | 13 |
| Ressourcen | 15 Rohstoffe als kleine Feld-Objekte (z. B. Hirsche, Schafe, Erzader, Ölfleck) | 15 |
| Ausbauten | 13 Ausbauten, teils mit Stufen 2/3 (Farm, Mine, Fischerei …) | 30 |
| Gebäude | Siedlungsbausteine je Epochenstil (5 Stile: Steinzeit, Antike, Mittelalter, Industrie, Moderne/Zukunft) × 7 Gebäude (Wohnhaus klein/groß, Zentrum, Turm/Tempel, Werkstatt, Lager, Mauerstück) | 35 |
| Einheiten | 38 Einheiten (Karte) | 38 |
| Porträts | 38 Einheitenporträts (Brustbild/Ganzkörper mit Hintergrund, 512 × 512) | 38 |
| Atmosphäre | Wolken/Nebel (3), Vögel/Tiere als Deko (4) | 7 |
| **Summe** | | **≈ 236** |

UI-Icons bleiben vorerst Emoji/Vektor und sind nicht Teil dieses Katalogs.

---

## 6. Technische Vorgaben je Asset-Gruppe

| Gruppe | Format | Größe (Export) | Hintergrund | Bezugspunkt |
|---|---|---|---|---|
| Bodentexturen | PNG/WebP | 512 × 512, nahtlos kachelbar | deckend | – (Weltkoordinaten) |
| Wand-Texturen | PNG/WebP | 512 × 256, horizontal kachelbar | deckend / Oberkante transparent | Oberkante = Feldkante |
| Objekte (Bäume, Felsen, Ressourcen) | WebP mit Alpha | 256 × 256 (große Bäume/Berge 512 × 512) | transparent | Fußpunkt unten mittig |
| Gebäude, Ausbauten | WebP mit Alpha | 512 × 512 | transparent | Bodenmitte |
| Einheiten (Karte) | WebP mit Alpha | 384 × 384 | transparent | Fußpunkt unten mittig |
| Einheiten-Fraktionsmaske | PNG | wie Einheit | transparent | – |
| Porträts | WebP | 512 × 512 | gemalter Hintergrund | – |

- Alle Objekte in **derselben Kameraperspektive** (Kapitel 3) und mit **Licht von oben links**.
- Objekte enthalten **keinen** Boden-Untergrund, nur einen weichen Kontaktschatten.
- **Fraktionsfarbe:** Flächen, die die Spielerfarbe tragen (Wappenrock, Schildfläche, Banner, Segel),
  werden in der Generierung **in neutralem Hellgrau** angelegt. Die Maske entsteht in der
  Nachbearbeitung (Farbbereichsauswahl) und wird im Spiel per Multiplikation eingefärbt.
- Dateigröße: Einheiten/Objekte ≤ 80 KB, Texturen ≤ 300 KB (WebP), damit die Android-App klein bleibt.

---

## 7. Produktion mit KI (Scenario)

### 7.1 Stilmodelle

Für gleichbleibende Qualität werden in Scenario **eigene Stilmodelle (LoRA)** trainiert, je ein
Modell pro Asset-Familie, weil Gelände, Gebäude und Figuren unterschiedliche Bildkompositionen haben:

| Modell | Trainingsbilder (15–30) |
|---|---|
| `ai4x-terrain` | Ausschnitte aus Zielbild und gleich gestalteten Vorlagen: Gras, Fels, Wasser, Wege |
| `ai4x-props` | freigestellte Bäume, Felsen, Berge, Ressourcen-Objekte |
| `ai4x-buildings` | freigestellte Gebäude/Ausbauten (Mine, Turm, Häuser, Farm, Steg) |
| `ai4x-units` | freigestellte Figuren in der Zielperspektive (Speerträger u. a.) |

Trainingsbilder werden im ersten Schritt aus dem Zielbild ausgeschnitten und mit einem
Basismodell plus Referenzbild ergänzt, bis je Familie genug stilgleiche Vorlagen vorliegen.

### 7.2 Prompt-Grundgerüst

```
[Stilmodell] isometric strategy game asset, hand-painted stylized, soft painterly texture,
light from upper left, soft short shadow to lower right, view from above at 30 degrees,
consistent with reference, isolated on transparent background, no text, no ground plane,
<Motiv mit Epoche, Material, Farben>, <Fraktionsflächen in neutral light grey>
```

Für Texturen: `seamless tileable top-down painted texture, <Material>, no objects, even lighting`.

### 7.3 Ablauf je Asset

1. Generieren (3–6 Varianten), beste auswählen.
2. Freistellen (Hintergrundentfernung), ggf. hochskalieren.
3. Nachbearbeitung im Repo per Skript: Zuschnitt, Größe, Ankerpunkt, Fraktionsmaske, WebP-Export.
4. Prüfung im Spiel (Asset-Vorschau, Karte, Zoomstufen, zwei Spielerfarben) – siehe Kapitel 8.
5. Commit mit Quelldaten (Prompt, Modell, Seed in `art/sources.json`) für Reproduzierbarkeit.

Der bestehende Workflow bleibt: fehlende Grafiken erkennt die CI, offene Grafiken werden im
Grafik-Backlog mit Ziel-Release geführt und blockieren das Release.

---

## 8. Abnahmekriterien (Konsistenz)

Ein Asset ist abgenommen, wenn alle Punkte erfüllt sind:

- [ ] Perspektive, Lichtrichtung und Schattenlänge stimmen mit dem Zielbild überein.
- [ ] Farbpalette und Sättigung passen zu den Nachbar-Assets (Vergleichsbogen mit 5 abgenommenen Assets).
- [ ] Silhouette bei Zoom 0,5 eindeutig erkennbar.
- [ ] Keine Artefakte (Ränder vom Freistellen, verschwommene Details, Text, Wasserzeichen).
- [ ] Größe und Ankerpunkt korrekt (steht sauber im Feld, ragt nicht ungewollt in Nachbarfelder).
- [ ] Einheiten: Fraktionsfläche in zwei Spielerfarben deutlich erkennbar.
- [ ] Texturen: nahtlos, keine sichtbaren Wiederholungsmuster bei 3 × 3 Kachelung.

Für jeden Meilenstein wird ein **Vergleichsscreenshot** (gleicher Kartenausschnitt wie das Zielbild)
erstellt und neben das Zielbild gelegt.

---

## 9. UI-Stil (unverändert aus Version 1)

Moderne Flat-/Vector-Strategie-UI: dunkle, ruhige Panels, klare Typografie, abgerundete Container,
klare Icon-Sprache, kontextabhängiges Panel am unteren Rand (Einheit, Siedlung, Feld) mit Porträt
links, Werten in der Mitte und großen Aktionsbuttons rechts; Ressourcenleiste oben, Runde/Jahr und
„Nächste Runde“ oben rechts, Minimap unten links. Das Zielbild ist auch hier die Referenz
(Abstände, Schriftgrößen, Porträt mit goldenem Rahmen, gemalte Porträts).

---

## 10. Umsetzungsplan

| Phase | Inhalt | Ergebnis |
|---|---|---|
| A – Renderer | Kamera/Höhen nach Kapitel 3, Schichtmodell nach Kapitel 4 (Weltkoordinaten-Texturen, Übergänge, Fels-Wände, Gitter-Overlay, Objekt-Streuung, zusammengesetzte Siedlungen) – mit Platzhaltern | Landschaft wirkt durchgehend |
| B – Vertical Slice | Stilmodelle trainieren; ~30 Assets: Gras, Wald, Fels/Klippe, Wasser/Küste, Fluss/Wasserfall, Speerträger (+ Porträt), Steinzeit-/Mittelalterdorf, Mine, Farm, Steg | Vergleich mit dem Zielbild, Freigabe des Stils |
| C – Bibliothek | restliche ≈ 200 Assets in Familien, laufende Abnahme | vollständiger Katalog |
| D – Feinschliff | Atmosphäre, Animationen (Wasser, Rauch, Fahnen – optional), Porträts | Release |

**Offene Punkte, die im Vertical Slice festgelegt werden:** exakte Neigung und Höhe je Stufe,
Pixel pro Hex auf Referenzgeräten, Übergangsbreite zwischen Geländearten, Darstellung des Nebels.
