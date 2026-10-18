# Roadmap

## v0.1.0 – Spielbarer Prototyp (Vertical Slice)
- [x] Kartengenerierung: 5 Kartentypen, 4 Größen, Höhenstufen mit Klippen, Flüsse, Ressourcen
- [x] Startpositionen maximal verteilt, einstellbarer Mindestabstand
- [x] Spielkern mit Befehlsmodell, Bewegung, Sicht, Kampf, Wirtschaft, Forschung
- [x] Isometrischer Renderer und Flat-UI nach Grafik-Spezifikation
- [x] Computergegner ohne Boni
- [x] Speichern/Laden, Hotseat
- [x] Android-Build (Capacitor) in der CI

## v0.2.0 – Wirtschaft & Infrastruktur
- [x] Straßen und Eisenbahn als Kartenobjekte (Transportnetz statt Pauschalkapazität)
- [x] Manuelle Verteilung der Arbeitskraft je Arbeitsplatz
- [x] Handelsabkommen zwischen Zivilisationen, Händler-Einheiten mit Handelsrouten
- [x] Ausgebaute Stadtstaaten (Aufträge, Boni je Typ)
- [x] Asset-Pipeline für KI-generierte Sprites (siehe GRAFIK_SPEZIFIKATION.md)

## v0.3.0 – Armeen & Diplomatie
- [ ] Armeen aus mehreren Einheiten (Humankind), taktische Kampfvorschau
- [ ] Diplomatische Abkommen, Bündnisse, Kriegsmüdigkeit
- [ ] Ausbau der KI-Phase (Maschinen-Expansion, Gegenmaßnahmen)

## v0.4.0 – Multiplayer & PC
- [ ] Netzwerk-Multiplayer über das bestehende Befehlsmodell (Server mit derselben Spiellogik)
- [ ] PC-Version (Electron/Tauri), Tastatur-Shortcuts, Fenstermodus
