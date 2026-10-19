# AI 4X – Zivilisations-Strategiespiel

Rundenbasiertes 4X-Zivilisationsaufbau- und Wirtschaftsstrategiespiel – von der Steinzeit bis in die nahe Zukunft.
Zuerst für Android, später für PC.

- [Game Design Document](docs/GAME_DESIGN.md)
- [Grafik-Spezifikation](docs/GRAFIK_SPEZIFIKATION.md)
- [Übergabe für die nächste Sitzung](docs/UEBERGABE.md)
- [Architektur](docs/ARCHITEKTUR.md)

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server (Browser)
npm test           # Tests der Spiellogik
npm run build      # Produktions-Build nach dist/
```

Android: siehe [Architektur → Android-Build](docs/ARCHITEKTUR.md#android-build).

## Branch-Modell

- `main` – veröffentlichte Releases (getaggt, z. B. `v0.1.0`)
- `develop` – Integrationsbranch
- `feature/*` – Feature-Branches, per Pull Request nach `develop`
