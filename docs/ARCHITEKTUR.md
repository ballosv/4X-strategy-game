# Architektur

## Technologie-Entscheidung

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) | Eine Codebasis für Spiellogik, Client und späteren Multiplayer-Server |
| Rendering | HTML5 Canvas 2D, isometrisch | 2D-Pipeline laut Grafik-Spezifikation, KI-generierte Sprites lassen sich direkt einbinden |
| UI | DOM/CSS-Overlay | Moderne Flat-UI, gute Lesbarkeit, einfache Skalierung für Touch und Maus |
| Build | Vite | schneller Dev-Server, statischer Build |
| Tests | Vitest | Spiellogik ist reines TypeScript ohne DOM |
| Android | Capacitor | verpackt den Web-Build als native Android-App |
| PC (später) | Electron oder Tauri | gleicher Web-Build |

## Schichten

```
src/
├── core/        Reine, deterministische Spiellogik (keine DOM-Abhängigkeit)
│   ├── hex.ts         Hex-Mathematik (axial / offset)
│   ├── rng.ts         Seedbarer Zufallsgenerator (Zustand im Spielstand)
│   ├── data/          Regeldaten: Gelände, Ressourcen, Einheiten, Gebäude, Technologien, Völker
│   ├── map/           Kartengenerierung, Startpositionen
│   ├── state.ts       Spielzustand (serialisierbar, JSON)
│   ├── commands.ts    Befehle der Spieler – einzige Möglichkeit, den Zustand zu verändern
│   └── systems/       Bewegung, Sicht, Wirtschaft, Forschung, Kampf, Rundenauswertung
├── ai/          Computergegner – erzeugen ausschließlich Befehle, sehen nur ihr Sichtfeld
├── render/      Isometrischer Karten-Renderer, Kamera, Minimap
├── ui/          HUD, Kontextpanel, Dialoge, Spielstart-Bildschirm
└── main.ts      Einstiegspunkt
```

### Befehlsmodell

Alle Zustandsänderungen laufen über `applyCommand(state, command)`. Menschliche Spieler, KI und
(später) Netzwerkspieler erzeugen dieselben Befehle. Damit sind Multiplayer (Befehle übertragen),
Speicherstände (Zustand als JSON) und Replays (Seed + Befehlsliste) direkt möglich.

### Determinismus

Kein `Math.random()` in `core/` und `ai/`. Zufall nur über `rng.ts`, dessen Zustand Teil des
Spielstands ist.

## Android-Build

```bash
npm install
npm run build
npx cap add android      # einmalig
npx cap sync android
npx cap open android     # Android Studio → APK / AAB
```

Der CI-Workflow baut zusätzlich automatisch eine Debug-APK.

## Releases

Branch-Modell: `feature/*` → PR nach `develop` → Release-PR nach `main`.
Bei jedem Push auf `main` prüft der Workflow `release.yml`, ob die Version aus `package.json`
bereits getaggt ist. Falls nicht, legt er den Tag `v<version>` an und erstellt ein GitHub-Release
mit Debug-APK und Web-Build; die Release-Notizen stammen aus `CHANGELOG.md`.
