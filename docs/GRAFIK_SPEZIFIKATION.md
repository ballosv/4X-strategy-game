# AI 4X Game – Grafik-Spezifikation & Handover

**Stand:** 30.09.2026  
**Zweck:** Verbindliche visuelle Grundlage für die weitere Konzeption, KI-gestützte Asset-Erstellung und spätere technische Umsetzung des rundenbasierten 4X-Zivilisationsspiels.

---

## 1. Zielsetzung

Das Spiel soll grafisch hochwertig, klar lesbar und konsistent wirken, ohne auf eine klassische 3D-Art-Pipeline oder einen dedizierten 3D-Artist angewiesen zu sein.

Da die grafischen Assets und UI-Elemente weitgehend mit KI-Unterstützung erzeugt werden sollen, muss der Stil:

- gut durch KI reproduzierbar sein,
- modular aufgebaut werden können,
- über viele Epochen hinweg konsistent funktionieren,
- Gameplay-Informationen klar lesbar darstellen,
- mit überschaubarem technischen Aufwand implementierbar sein,
- ohne komplexe 3D-Modelle und aufwendige Animationen auskommen.

Die wichtigste Designregel lautet:

> **Lesbarkeit und Konsistenz haben Vorrang vor maximalem grafischem Detailgrad.**

---

# 2. Festgelegter Grafikstil

## 2.1 Grundstil

Empfohlener und festgelegter Stil:

> **Stylized Isometric 2D Strategy Art**

Der Stil kombiniert:

- isometrische Darstellung,
- klare vektorartige Grundformen,
- leicht handgemalte Texturen,
- stilisierte statt realistische Proportionen,
- moderate Details,
- klare Silhouetten,
- weiche, aber gut erkennbare Schatten,
- einen leicht modellhaften / dioramaartigen Eindruck,
- eine moderne, reduzierte Strategie-UI.

Der Look soll an eine hochwertige Brettspielwelt bzw. ein stilisiertes digitales Diorama erinnern.

---

## 2.2 Nicht angestrebte Richtungen

Folgende Stile sollen bewusst vermieden werden:

- fotorealistisches 3D,
- komplexes Low-Poly-3D als primäre Produktionspipeline,
- hochrealistische Renderings,
- stark detailreiche Concept-Art als eigentliche Spielgrafik,
- uneinheitliche „KI-Gemälde“ kompletter Spielszenen,
- sehr kleines oder stark abstrahiertes Retro-Pixelart,
- übermäßig verspielte Mobile-Game-Optik,
- UI mit starken Materialsimulationen wie Pergament, Metallrahmen etc.

---

# 3. Spielwelt

## 3.1 Kartenstruktur

Die Weltkarte basiert auf **klar erkennbaren Hexfeldern**.

Anforderungen:

- Jedes Geländefeld ist als Hexkachel eindeutig identifizierbar.
- Die Hexstruktur muss auch bei dicht bebauten oder bewaldeten Feldern erkennbar bleiben.
- Grenzen dürfen dezent sein, aber niemals komplett verschwinden.
- Selektierte Felder können durch einen hellen oder farbigen Rahmen hervorgehoben werden.
- Besitz-, Einfluss- oder Aktionsbereiche können später über zusätzliche Overlays dargestellt werden.

Die Hexfelder sind ein funktionales Gameplay-Element und keine rein dekorative Unterteilung.

---

## 3.2 Höhenunterschiede

Die Karte besitzt klar sichtbare Höhenstufen.

Gelände darf nicht wie eine flache Brettspielkarte wirken.

Höhenunterschiede sollen durch folgende Mittel deutlich werden:

- sichtbare Felskanten,
- Plateaus,
- Terrassen,
- Klippen,
- erhöhte Waldflächen,
- Hügelstufen,
- stark erhöhte Gebirge,
- Wasserfälle zwischen Höhenebenen,
- Schatten an Geländekanten.

Beispielhafte Höhenwirkung:

- **Stufe 0:** Wasser / Küste
- **Stufe 1:** Ebene
- **Stufe 2:** erhöhtes Grasland / Hügel / Waldplateau
- **Stufe 3:** hohe Felsplateaus
- **Stufe 4+:** Gebirge / Hochgebirge

Diese grafische Darstellung unterstützt direkt die bereits konzipierten Spielregeln für Höhenunterschiede, Bewegung und Sicht.

---

## 3.3 Terrain-Typen

Die Art Direction muss unter anderem folgende Geländearten unterstützen:

- Grasland
- Wald
- dichter Wald
- Hügel
- Gebirge
- Hochgebirge
- Flüsse
- Seen
- Küsten
- Meer
- Wüste
- Tundra
- Schnee
- Sumpf
- landwirtschaftliche Flächen

Geländefelder sollen grundsätzlich aus einer Basisfläche plus optionalen Overlays bestehen.

---

# 4. Modularer Asset-Aufbau

KI soll möglichst **einzelne wiederverwendbare Assets** erzeugen, nicht komplette Spielkarten.

Empfohlene Struktur:

```text
Terrain
├── Grasland
├── Wald
├── Wüste
├── Tundra
├── Schnee
├── Sumpf
├── Wasser
└── Küste

Overlays
├── Bäume
├── Felsen
├── Ressourcen
├── Felder
├── Büsche
└── Spezialgelände

Infrastruktur
├── Pfad
├── Straße
├── Brücke
├── Eisenbahn
├── Stromleitung
├── Pipeline
├── Hafen
└── Flugfeld

Gebäude
├── Wohngebäude
├── Werkstatt
├── Bauernhof
├── Mine
├── Fabrik
├── Hafen
├── Flughafen
├── Kraftwerk
└── futuristische / Maschinen-Strukturen

Einheiten
├── Zivil
├── Erkundung
├── Infanterie
├── Kavallerie / Fahrzeuge
├── Schiffe
├── Flugzeuge
└── Maschinen

UI
├── Ressourcen-Icons
├── Aktions-Icons
├── Status-Icons
├── Gebäude-Icons
├── Technologie-Icons
└── Interface-Komponenten
```

---

# 5. Perspektive und Kamera

## 5.1 Kamera

Grundregeln:

- feste isometrische Perspektive,
- orthografischer Eindruck,
- keine dramatische Tiefenperspektive,
- keine wechselnden Kamerawinkel zwischen Assets,
- gleiche Orientierung aller Assets.

Die Perspektive muss so gewählt werden, dass:

- Hexfelder klar lesbar bleiben,
- Gebäude gut erkennbar sind,
- Einheiten nicht in der Umgebung verschwinden,
- Höhenunterschiede sichtbar bleiben.

---

## 5.2 Beleuchtung

Verbindliche Lichtlogik:

- Hauptlicht von **oben links**,
- weiche Schatten,
- kurze bis mittlere Schattenlänge,
- keine extremen Kontraste,
- matte Materialien,
- keine fotorealistischen Reflexionen.

Alle KI-generierten Assets sollen dieselbe Lichtlogik verwenden.

---

# 6. Farb- und Detailstil

## Farbgebung

- kräftig, aber nicht übersättigt,
- Gelände klar voneinander unterscheidbar,
- natürliche Grundfarben,
- UI dunkler und ruhiger als die Spielwelt,
- Akzentfarben gezielt für Interaktion, Auswahl und Zustände.

## Detailgrad

**Medium-Low Detail**

Objekte sollen auf Spielfeldgröße gut funktionieren.

Wichtiger als kleine Details sind:

- Silhouette,
- Form,
- Farbkontrast,
- Wiedererkennbarkeit,
- visuelle Funktion.

---

# 7. Einheiten

Einheiten dürfen bewusst etwas größer dargestellt werden als es dem realistischen Maßstab entsprechen würde.

Ziel:

> Eine Einheit muss auf der Karte sofort erkennbar sein.

Eigenschaften:

- klare Silhouette,
- einfache Pose,
- charakteristische Ausrüstung,
- begrenzte Anzahl kleiner Details,
- deutliche Fraktionsfarbe / Akzentfarbe,
- optional Banner oder Marker,
- Selektionsring auf aktivem Hexfeld.

Einheiten werden nicht primär für realistischen Größenvergleich mit Gebäuden skaliert, sondern für Gameplay-Lesbarkeit.

---

# 8. Gebäude und Siedlungen

Gebäude werden als modulare isometrische Assets gedacht.

Grundregeln:

- klar erkennbare Gebäudefunktion,
- konsistente Grundfläche,
- gleiche Perspektive,
- keine unnötigen Kleinstteile,
- unterschiedliche Epochen müssen klar unterscheidbar bleiben,
- Gebäude dürfen über mehrere Hexfelder bzw. Teilbereiche eines Hexfeldes organisiert werden.

Beispiele:

- Bauernhof → Felder, Scheune, einfache Gebäude
- Mine → Felsbereich, Eingang, Gerüst, Lore
- Werkstatt → Produktionscharakter
- spätere Fabrik → industrielle Formen, Schornsteine
- futuristische Anlagen → klare technologische Weiterentwicklung, aber weiterhin gleicher Grundstil

---

# 9. UI-Stil

Die UI soll sich bewusst etwas von der Spielwelt unterscheiden.

## Stil

> **Modern Flat / Vector Strategy UI**

Eigenschaften:

- dunkle, ruhige Panels,
- klare Typografie,
- wenige dekorative Elemente,
- runde oder leicht abgerundete Container,
- klare Icon-Sprache,
- gute Informationshierarchie,
- keine unnötige visuelle Überladung.

Icons und UI-Elemente unterstützen die Verständlichkeit.

---

# 10. Grundprinzip der Benutzerführung

Die Benutzerführung soll:

- einfach,
- leicht verständlich,
- kontextbezogen,
- konsistent
sein.

Statt viele dauerhafte Spezialmenüs zu zeigen, werden Informationen und Aktionen dort eingeblendet, wo sie benötigt werden.

---

# 11. Kontextpanel am unteren Bildschirmrand

Ein zentrales UI-Prinzip ist das **kontextabhängige Interaktionspanel im unteren Bereich**.

Je nach ausgewähltem Objekt ändert sich der Inhalt.

Beispiele:

- Einheit ausgewählt → Einheitenpanel
- Siedlung ausgewählt → Siedlungsinformationen
- Gebäude ausgewählt → Gebäude-/Produktionsmenü
- Geländefeld ausgewählt → Geländeinformationen / mögliche Aktionen

---

# 12. Interaktionspanel für Einheiten

Bei Auswahl einer Einheit wird unten ein Einheitenpanel angezeigt.

## Beispielstruktur

### Linker Bereich

- Einheitenportrait / Thumbnail
- Name
- Einheitentyp
- Lebenspunkte / Zustand

Beispiel:

```text
Speerträger
Leichte Infanterie

♥ 100 / 100
Zustand: Bereit
```

### Mittlerer Bereich – Werte

Beispiele:

- Bewegung
- Stärke
- Sicht
- Unterhalt
- Erfahrung
- aktive Boni / Mali

Beispiel:

```text
Bewegung   2 / 2
Stärke     14
Sicht       2
Unterhalt   1

Erfahrung 1
Bonus: +3 auf Hügeln
```

### Rechter Bereich – Aktionen

Aktionen werden als große, verständliche Buttons mit Icons dargestellt.

Beispiele:

- Bewegen
- Wachen
- Befestigen
- Erkunden
- Heilen
- Runde überspringen

Nur für die Einheit relevante Aktionen sollen angezeigt oder aktiviert werden.

---

# 13. Interaktion mit Siedlungen und Gebäuden

Für die spätere UI gilt:

1. Spieler öffnet den Siedlungsbildschirm.
2. Klick auf ein bebautes Geländefeld.
3. Die zentrale Ansicht wechselt in die Detailansicht dieses Geländefeldes.
4. Gebäude und Strukturen dieses Feldes werden dargestellt.
5. Interaktive Gebäude können angeklickt werden.
6. Klick auf ein Gebäude öffnet das entsprechende Einstell- oder Produktionsmenü.

Beispiele:

- Produktionskette,
- Arbeitskräfte,
- Lager,
- Gebäudeinformationen,
- Ausbauoptionen.

---

# 14. Beispielhafte Bildschirmstruktur

```text
┌─────────────────────────────────────────────────────────────┐
│ Ressourcen                    Runde / Zeit   Nächste Runde │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                      SPIELWELT                              │
│                                                             │
│              Hexkarte mit Höhenstufen                       │
│                                                             │
│                                                             │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│   Minimap    │       Kontextinformationen   │    Aktionen   │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

---

# 15. Empfohlene Asset-Größen

Die endgültigen Werte müssen während der technischen Umsetzung getestet werden.

Als Ausgangspunkt:

```text
Terrain-Hex             512 × 512 px
kleines Gebäude         256 × 256 px
großes Gebäude          512 × 512 px
Landeinheit             256 × 256 px
große Einheit           384 × 384 px
Ressourcen-Icon          64 × 64 px
UI-Icon                  48 × 48 px
Technologie-Icon        128 × 128 px
```

Assets möglichst mit ausreichend Reserve generieren und anschließend für die Engine skalieren.

Für freistehende Assets sollte nach Möglichkeit ein transparenter Hintergrund verwendet werden.

---

# 16. KI-Art-Bible / Prompt-Grundlage

Folgende Angaben sollten künftig in KI-Prompts für Welt-Assets möglichst konstant bleiben:

```text
Stylized isometric 2D strategy game asset.
Clean vector-like shapes with subtle hand-painted textures.
Medium-low detail.
Clear readable silhouette.
Fixed orthographic isometric perspective.
Consistent orientation.
Soft lighting from upper left.
Soft short shadows.
Matte materials.
Moderate saturation.
No photorealism.
No dramatic perspective.
No text.
No UI elements.
Transparent background when generating isolated assets.
Designed for a hex-based turn-based 4X strategy game.
```

Für Kartenansichten zusätzlich:

```text
Clearly readable hexagonal tiles.
Visible hex boundaries.
Strongly readable terrain elevation.
Raised plateaus, cliffs and terraces.
Clear height differences between neighboring hex tiles.
Gameplay readability has priority over realism.
```

---

# 17. Regeln für KI-generierte Assets

## DO

- einzelne wiederverwendbare Assets generieren,
- gleiche Perspektive verwenden,
- gleiche Lichtquelle verwenden,
- klare Silhouetten verlangen,
- transparente Hintergründe bei Einzelassets nutzen,
- mehrere Varianten erzeugen und kuratieren,
- Assets anschließend vereinheitlichen,
- feste Referenzbilder verwenden,
- klare Epochenmerkmale definieren.

## DON'T

- komplette Weltkarten als einzelne Grafik erzeugen,
- Perspektiven zwischen Assets ändern,
- unterschiedliche Lichtquellen verwenden,
- extrem detailreiche Einzelbilder erzeugen,
- Texte durch Bildgeneratoren fest in Spielassets rendern,
- UI und Weltgrafik untrennbar miteinander generieren,
- Gameplay-Informationen nur über kleine grafische Details kommunizieren.

---

# 18. Konsistenz als wichtigstes Produktionsproblem

Das größte Risiko bei einer KI-basierten Grafikpipeline ist nicht die Qualität eines einzelnen Assets.

Das größte Risiko ist:

> **Die Konsistenz von hunderten oder tausenden Assets.**

Daher muss für jedes Asset mindestens festgelegt werden:

- Asset-Kategorie
- Epoche
- Perspektive
- Blickrichtung
- Größe
- Licht
- Schatten
- Farbpalette
- Detailgrad
- Fraktionszugehörigkeit
- Hintergrund
- technische Verwendung

---

# 19. Empfohlener Workflow

## Phase 1 – Vertical Slice

Zuerst einen kleinen repräsentativen Kartenausschnitt erstellen:

- ca. 15–30 Hexfelder,
- mehrere Höhenstufen,
- Fluss / Wasser,
- Wald,
- Gebirge,
- Siedlung,
- Mine,
- Bauernhof,
- Straße,
- mehrere Einheiten,
- vollständiges HUD,
- Einheitenpanel,
- Siedlungs-/Gebäudepanel.

Ziel:

> Prüfen, ob der Grafikstil im tatsächlichen Spielkontext funktioniert.

## Phase 2 – Art Bible finalisieren

Nach dem Vertical Slice festlegen:

- exakte Hex-Proportionen,
- Kamera,
- Höhe pro Terrainstufe,
- maximale Objektgröße,
- Farbpalette,
- UI-Abstände,
- Icon-Stil,
- Schatten,
- Asset-Auflösung,
- Epochenvarianten.

## Phase 3 – Asset-Bibliothek

Danach systematisch einzelne Asset-Sets erstellen.

---

# 20. Bisher erzeugte Referenzmotive

Im bisherigen Konzeptprozess wurden drei zentrale visuelle Richtungen getestet:

1. **Allgemeine Spielansicht**
   - isometrische Welt
   - Siedlung
   - Ressourcen
   - UI

2. **Hexkarte mit deutlich sichtbaren Höhenstufen**
   - klare Hexfeld-Kacheln
   - Klippen
   - Plateaus
   - Wasserfälle
   - unterschiedliche Geländehöhen

3. **Aktive Einheit mit Interaktionspanel**
   - selektierte Einheit auf der Karte
   - Einheitenportrait
   - Einheitenwerte
   - Aktionsbuttons
   - Kontextpanel statt Siedlungsmenü

Diese drei Punkte bilden die aktuelle visuelle Zielrichtung.

---

# 21. Verbindliche Kernentscheidungen

Für die weitere Entwicklung gelten aktuell folgende Entscheidungen:

- **2D statt klassischer 3D-Pipeline**
- **isometrische Darstellung**
- **Hexfelder**
- **Hexgrenzen müssen klar erkennbar sein**
- **Geländehöhen werden deutlich dargestellt**
- **stilisiert statt realistisch**
- **modulare KI-generierte Assets**
- **klare, moderne Flat-/Vector-UI**
- **kontextabhängiges Panel am unteren Bildschirmrand**
- **Einheiten werden zur besseren Lesbarkeit leicht überproportional dargestellt**
- **UI-Icons unterstützen die Verständlichkeit**
- **Gameplay-Lesbarkeit hat Vorrang vor grafischem Realismus**
- **komplexe Animationen und aufwendige 3D-Produktion werden vermieden**

---

# 22. Offene Punkte für die spätere Umsetzung

Noch nicht final festgelegt:

- exakter isometrischer Kamerawinkel,
- genaue Hexgröße in der Engine,
- Pixel-per-Hex-Verhältnis,
- genaue Höhe einer einzelnen Höhenstufe,
- Übergangsregeln zwischen Terrainarten,
- Animationstiefe der Einheiten,
- maximale Gebäudegröße,
- Fraktionsfarb-System,
- Fog-of-War-Darstellung,
- genaue UI-Farbpalette,
- Schriftfamilie,
- Icon-Bibliothek,
- Asset-Dateiformate,
- technische Layer-Struktur in der Engine.

Diese Punkte sollten nicht rein theoretisch festgelegt werden, sondern während eines ersten spielbaren Prototyps getestet werden.

---

# 23. Leitprinzip für die weitere Gestaltung

> **Die Grafik muss nicht möglichst komplex aussehen. Sie muss dafür sorgen, dass der Spieler die Spielwelt, Höhen, Einheiten, Zustände und mögliche Aktionen sofort versteht.**

Die visuelle Identität entsteht durch:

- konsistente Perspektive,
- klare Hexwelt,
- erkennbare Höhenstufen,
- starke Silhouetten,
- kohärente Farbgestaltung,
- modulare Assets,
- moderne UI,
- wiederkehrende Icon-Sprache.

Damit bleibt der Stil sowohl für KI-gestützte Produktion als auch für ein umfangreiches 4X-Spiel realistisch umsetzbar.
