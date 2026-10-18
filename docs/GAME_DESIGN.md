# AI 4X – Game Design Document

Lebendes Dokument. Beschreibt die verbindlichen Spielregeln und den Umsetzungsstand.
Die visuelle Zielrichtung steht in [GRAFIK_SPEZIFIKATION.md](GRAFIK_SPEZIFIKATION.md).

## 1. Vision

Rundenbasiertes 4X-Zivilisationsaufbau- und Wirtschaftsstrategiespiel von der Steinzeit bis in die nahe
Zukunft. Gespielt wird mit **fiktiven Zivilisationen**, die sich durch Eigenschaften, Mentalität und
Ausrichtung unterscheiden. Plattformen: zuerst Android, danach PC.

Inspirationsquellen:

| Spiel | Übernommene Ideen |
|---|---|
| Civilization 7 | Politiken, Vermächtnisse, Stadtstaaten, Geländefelder |
| Humankind | Einheitenverwaltung (Armeen), Bewegung, Entwicklung, Höhenstufen, Einfluss |
| Imperialismus | Arbeiter/Arbeitskraft, Wirtschaft, Produktionsketten, Ausbauten, Transport, Handel |

Leitprinzipien:

1. **Fairness** – Computergegner erhalten keinerlei Boni. Ihre Stärke entsteht ausschließlich aus
   Bewertung der Lage, Planung und regelmäßiger Neubewertung.
2. **Lesbarkeit** – Jede Regel muss auf der Karte oder im Kontextpanel nachvollziehbar sein.
3. **Determinismus** – Die Spiellogik ist vollständig deterministisch (Seed + Befehle), damit
   Multiplayer, Speicherstände und Wiederholungen zuverlässig funktionieren.

## 2. Spielablauf

1. **Spielstart** – Einstellungen: Kartentyp, Kartengröße, Anzahl Gegner, Mindestabstand zwischen
   Startpositionen, Seed, eigene Zivilisation.
2. **Nomadenphase** – Jeder Spieler beginnt mit einem umherziehenden **Stamm** (plus Späher).
   Der Stamm sammelt Nahrung und kann ein **Lager** errichten.
3. **Sesshaftigkeit** – Aus dem Lager wird die erste **Siedlung**. Weitere Siedlungen entstehen durch
   Siedler. Jede Siedlung beansprucht Geländefelder in ihrem Umkreis.
4. **Zeitalter** – Durch Entwicklung (Forschung) werden Zeitalter durchlaufen:
   Steinzeit → Bronzezeit → Eisenzeit → Mittelalter → Renaissance → Industriezeitalter →
   Moderne → Informationszeitalter → Nahe Zukunft.
5. **KI-Phase** – Wird die Technologie *Künstliche Intelligenz* erforscht, wechselt das Spiel von der
   *Menschenphase* in die *KI-Phase*: Ein zusätzlicher Gegner, **die KI**, erwacht und greift alle an.
6. **Spielende** – wenn nur noch ein Spieler übrig ist oder die KI besiegt wurde. Es gewinnt der Spieler
   mit den meisten **Vermächtnispunkten**. Vernichtet die KI alle Menschen, verlieren alle.

Runden laufen sequenziell: Jeder Spieler führt seinen Zug aus, danach folgt die Rundenauswertung
(Produktion, Wachstum, Forschung, Transport).

## 3. Spielfeld

### 3.1 Hexfelder

Spitze-oben-Hexfelder („pointy top") in Offset-Koordinaten (odd-r); intern werden axiale Koordinaten
für Distanzen und Nachbarschaft verwendet. Die Karte bricht an den Rändern ab (kein Umlauf).

### 3.2 Höhenstufen

| Stufe | Landform | Wirkung |
|---|---|---|
| 0 | Wasser (Meer, Küste, See) | nur für Schiffe |
| 1 | Ebene | Standard |
| 2 | Hügel / erhöhtes Grasland | +1 Sicht, Verteidigungsbonus |
| 3 | Hochplateau | +2 Sicht, höherer Verteidigungsbonus |
| 4 | Gebirge | +3 Sicht, Bewegung teuer |
| 5 | Hochgebirge | unpassierbar |

**Klippen:** Unterscheiden sich zwei benachbarte Landfelder um **2 oder mehr** Stufen, liegt zwischen
ihnen eine Klippe. Klippen sind für Landeinheiten unpassierbar. Dadurch entstehen Pässe,
Gebirgszugänge, Plateaus mit wenigen Aufgängen und Täler mit Steilwänden.

Bewegungskosten: Grundkosten des Geländes, +1 bei Bergauf-Bewegung. Flüsse ohne Brücke kosten
die gesamte restliche Bewegung (Fluss überqueren beendet die Bewegung).

Kampf: Angriff von höher gelegenem Feld +3 Stärke je Stufe Unterschied, Angriff bergauf −3 je Stufe.

### 3.3 Geländearten

Basis: Grasland, Ebene, Wüste, Tundra, Schnee, Sumpf, Küste, Meer, See.
Overlays: Wald, dichter Wald, Felsen, Fluss, Ressourcen, Felder (Ausbau).
Ressourcen: Wild, Fisch, Weizen, Schafe, Feuerstein, Kupfer, Zinn, Eisen, Kohle, Öl, Lehm, Baumwolle,
Pferde, Edelmetalle, seltene Erden.

### 3.4 Kartentypen

| Typ | Beschreibung |
|---|---|
| Kontinente | 2–3 große Landmassen, getrennt durch Ozean |
| Pangäa | eine zusammenhängende Landmasse |
| Inselwelt | viele mittlere und kleine Inseln |
| Hochland | große Landmasse mit vielen Plateaus, Klippen und Pässen |
| Binnenmeer | Land rund um ein zentrales Meer |

### 3.5 Kartengrößen

| Größe | Felder | Empfohlene Spieler |
|---|---|---|
| Klein | 40 × 26 | 2–3 |
| Mittel | 56 × 36 | 3–5 |
| Groß | 74 × 46 | 4–7 |
| Sehr groß | 96 × 60 | 6–8 |

### 3.6 Startpositionen

Standard: Startpositionen werden durch *Farthest-Point-Sampling* auf geeigneten, erreichbaren Landfeldern
so weit wie möglich voneinander entfernt platziert. Einstellbar ist ein **Mindestabstand** (in Feldern).
Kann er nicht eingehalten werden, meldet das Spiel dies vor Spielbeginn.

## 4. Zivilisationen

Fiktive Völker mit je einer **Mentalität** (zwei Eigenschaften) und einer **Ausrichtung**.
Alle Boni sind symmetrisch ausbalanciert – kein Volk ist grundsätzlich stärker.

| Volk | Mentalität | Ausrichtung |
|---|---|---|
| Lindenvolk | Agrarisch, Friedliebend | Wachstum |
| Felsenclan | Baumeister, Standhaft | Produktion |
| Wellenreiter | Seefahrend, Händlerisch | Handel |
| Sternenseher | Wissbegierig, Spirituell | Wissen |
| Aschenbund | Kriegerisch, Diszipliniert | Militär |
| Nebelwanderer | Erkundend, Anpassungsfähig | Expansion |
| Sonnenkinder | Händlerisch, Prachtvoll | Einfluss |
| Eisenhand | Fleißig, Industriell | Produktion |

## 5. Wirtschaft (Imperialismus-Prinzip)

* **Bevölkerung** besteht aus *Arbeitern*, *Bürgern* und *Gelehrten*.
  Arbeiter liefern **Arbeitskraft**, Bürger **Gold** und **Einfluss**, Gelehrte **Entwicklungspunkte**.
* **Arbeitskraft** wird an Geländeausbauten (Jagdlager, Farm, Holzfäller, Steinbruch, Mine, Fischerei)
  und an Produktionsgebäude (Werkstatt, Schmiede, Weberei, Sägewerk, Fabrik …) gebunden.
* **Produktionsketten**: Rohstoffe → Waren → höherwertige Waren. Beispiele:
  Holz → Bretter; Wolle → Stoffe → Kleidung; Kupfer + Zinn → Bronze; Eisenerz + Kohle → Stahl;
  Stahl + Bretter → Werkzeuge / Maschinen.
* **Nahrungsversorgung**: Jede Siedlung benötigt Getreide, Fisch/Fleisch und (ab Bronzezeit) Gemüse.
  Vollständige Versorgung → Wachstum; Unterversorgung → Stagnation bzw. Schrumpfen.
* **Transport**: Überschüsse fließen ins Nationallager – begrenzt durch die **Transportkapazität**
  der Siedlung. Sie hängt von der **Anbindung an die Hauptstadt** ab: keine (Träger), Straße (+6),
  Eisenbahn (+18, Bahnhof nötig) oder Seeweg (+5, beide mit Hafen). Straßen und Schienen werden von
  **Arbeitern** gebaut (Straße: Rad, 2 Runden, 1 Stein; Eisenbahn: Eisenbahn, 3 Runden, 1 Stahl + 1 Bretter),
  auf Wunsch automatisch („Siedlungen verbinden“). Einheiten bewegen sich auf Straßen für ½, auf
  Schienen für ¼ Bewegungspunkt je Feld; Klippen bleiben unpassierbar. Nicht abtransportierte
  Güter verbleiben im lokalen Lager.
* **Handel**: Güter können auf dem Weltmarkt gekauft und verkauft werden; Preise folgen Angebot und
  Nachfrage. Handelsabkommen mit anderen Zivilisationen und Stadtstaaten.
* **Produktionserweiterungen**: Ausbaustufen erhöhen Ertrag je Arbeitskraft.

## 6. Entwicklung, Politiken, Einfluss, Vermächtnisse

* **Entwicklung**: Technologiebaum über alle Zeitalter. Ein Zeitalter wechselt, sobald die
  Schlüsseltechnologien erforscht sind.
* **Einfluss**: Wird für Gebietsansprüche (Lager → Siedlung), Politiken und Stadtstaaten verwendet.
* **Politiken**: Karten in begrenzten Slots; Slotanzahl steigt mit dem Zeitalter.
* **Vermächtnisse**: Pro Zeitalter gibt es Pfade (Wirtschaft, Wissen, Militär, Expansion, Kultur) mit
  Meilensteinen. Meilensteine bringen **Vermächtnispunkte** – die Siegpunkte.
* **Stadtstaaten**: Unabhängige Siedlungen; durch Einfluss befreundbar (Bonus) oder eroberbar.

## 7. Einheiten

Zivil (Stamm, Siedler, Arbeiter, Händler), Erkundung (Späher), Infanterie, Fernkampf, Kavallerie /
Fahrzeuge, Schiffe, Flugzeuge, Maschinen. Werte: Bewegung, Stärke, Sicht, Unterhalt, Lebenspunkte,
Erfahrung. Aktionen: Bewegen, Wachen, Befestigen, Erkunden, Heilen, Runde überspringen.

Einheiten können zu **Armeen** zusammengeschlossen werden (Humankind) und bewegen sich gemeinsam.

## 8. Computergegner

Utility-basierte KI mit Zielsystem:

1. Lagebewertung zu Rundenbeginn (Bedrohungen, Chancen, Wirtschaftsengpässe).
2. Strategische Ziele (expandieren, verteidigen, aufrüsten, forschen, handeln) erhalten Gewichte.
3. Jede Einheit / Siedlung wählt die Aktion mit dem höchsten Nutzen.
4. **Keine Boni, keine Kartenkenntnis außerhalb des eigenen Sichtfelds** (Fog of War gilt auch für die KI).

Schwierigkeitsgrade verändern ausschließlich Planungstiefe und Neubewertungsfrequenz.

**Umsetzungsstand** (`src/ai/`): `runAiTurn(state, spieler)` spielt einen kompletten Zug nur über
`applyCommand`. `AiView` erzwingt den Nebel des Krieges (Gelände nur erkundet, fremde Einheiten nur
sichtbar, fremde Siedlungen nur gesehen – mit Gedächtnis). Das KI-Gedächtnis liegt JSON-serialisierbar in
`state.aiMemory`. Ziele: expandieren, verteidigen, aufrüsten, Wirtschaft, Forschung, Angriff.
Leicht bewertet die Strategie nur alle 3 Runden neu und prüft weniger Kandidaten; Normal/Schwer jede Runde
mit Vorausschau auf Gegenangriffe. Stadtstaaten verteidigen sich nur, die Maschine greift die nächste
bekannte Siedlung an.

## 9. Technik

Siehe [ARCHITEKTUR.md](ARCHITEKTUR.md).
