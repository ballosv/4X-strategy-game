# Changelog

## v0.2.0 – Wirtschaft & Infrastruktur (2026-10-18)

### Transportnetz
- Neue Einheit **Arbeiter**: baut Straßen (Rad) und Eisenbahnen (Eisenbahn) oder verbindet Siedlungen
  automatisch mit dem Netz der Hauptstadt
- Transportkapazität ergibt sich aus der Anbindung an die Hauptstadt: Straße +6, Eisenbahn +18
  (mit Bahnhof), Seeweg +5 (Hafen in beiden Siedlungen)
- Schnelle Bewegung auf Straßen (½) und Schienen (¼ Bewegungspunkt), Darstellung als Feldweg und Gleis

### Arbeitskraft
- Manuelle Verteilung der Arbeitskraft je Arbeitsplatz (fest oder automatisch) im neuen Reiter
  „Arbeitskraft“ des Bau-Dialogs

### Handel
- Händler richten Handelsrouten ein (eigene Siedlungen, Stadtstaaten, Völker mit Abkommen)
- Handelsabkommen zwischen Völkern (+2 Gold je Runde für beide); Krieg beendet Routen und Abkommen

### Stadtstaaten & Einfluss
- Fünf Stadtstaat-Typen mit Boni für Freunde und Suzerän, Lieferaufträge, Gunstverfall
- Einfluss-Senke: freie Felder am Gebietsrand beanspruchen

### Grafik
- Asset-Pipeline für KI-generierte Sprites mit Manifest, Farbmasken, Asset-Vorschau und Prüfskript
  (`npm run assets:check`); ohne Assets bleibt die prozedurale Darstellung erhalten

### Computergegner
- Nutzen Arbeiter, Händler, Handelsabkommen, Stadtstaat-Aufträge und Gebietskauf

### Technik
- Spielstand-Version 2 mit automatischer Migration älterer Spielstände
- 76 automatische Tests

## v0.1.0 – Spielbarer Prototyp (2026-10-18)

Erste spielbare Version (Vertical Slice) für Browser und Android.

### Welt
- Hexkarte mit Höhenstufen 0–5; Klippen ab 2 Stufen Unterschied sind unpassierbar (Pässe, Plateaus, Täler)
- 5 Kartentypen (Kontinente, Pangäa, Inselwelt, Hochland, Binnenmeer) und 4 Kartengrößen
- Startpositionen so weit wie möglich auseinander, Mindestabstand einstellbar
- Biome, Wälder, Felsen, Flüsse mit Wasserfällen, Seen, Ressourcen, Kuriositäten, Stadtstaaten

### Spiel
- 8 fiktive Völker mit Mentalität (Eigenschaften) und Ausrichtung
- Stamm → Lager → Siedlung → Stadt; Gebietsanspruch und -wachstum
- Wirtschaft nach Imperialismus-Prinzip: Arbeitskraft, Ausbauten mit Arbeitsplätzen,
  Produktionsketten, Transportkapazität ins Nationallager, Nahrungsversorgung mit drei Kategorien
- Bevölkerungsklassen Arbeiter, Bürger, Gelehrte; Gold, Einfluss, Entwicklungspunkte
- 9 Zeitalter, ~50 Technologien, Politiken, Vermächtnisse (Siegpunkte), Weltmarkt
- Kampf mit Höhenvorteil, Befestigung, Gelände, Erfahrung, Eroberung von Siedlungen
- Diplomatie (Krieg/Frieden), Gesandte an Stadtstaaten
- KI-Phase: Mit der Technologie „Künstliche Intelligenz“ erwacht „Die KI“ als gemeinsamer Gegner
- Spielende: letzter Überlebender oder Sieg über die KI – die höchste Punktzahl gewinnt

### Computergegner
- Nutzenbasierte KI mit Lagebewertung jede Runde, ohne jegliche Boni und mit Nebel des Krieges
- Schwierigkeitsgrade ändern nur Planungstiefe und Neubewertung

### Darstellung & Bedienung
- Isometrische 2D-Darstellung nach Grafik-Spezifikation (prozedural, bereit für KI-Assets)
- Flat-UI mit Ressourcenleiste, kontextabhängigem Panel, Minimap, Meldungen
- Touch, Maus und Tastatur; Hotseat-Mehrspieler; automatische Speicherung

### Technik
- TypeScript, Vite, Vitest (39 Tests), deterministisches Befehlsmodell
- Android-App via Capacitor; die CI baut eine Debug-APK als Artefakt
