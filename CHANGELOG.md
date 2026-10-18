# Changelog

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
