# OptimaPOS Terminal

Desktop application for restaurant operations — kitchen display, order management, delivery tracking, cash register, and more.

Built with **Electron + React + TypeScript + Socket.io** for real-time synchronization with the OptimaPOS backend.

---

## Features

- **Order Queue** — Live grid of active orders with status management
- **Kitchen Display** — 3-column Kanban (Pendiente / Preparando / Listo) with timers
- **Delivery Board** — 2-column view (Por Recoger / En Camino) with driver assignment
- **Cash Register** — Open/close register, manual movements, closing reconciliation
- **Manager Dashboard** — Daily stats, top products, cash status
- **Ticket Printing** — Template-based rendering with ESC/POS support
- **Real-Time Updates** — Socket.io + 30s polling fallback
- **Multi-Location** — Select active location or view all (admin)
- **Role-Based Access** — Admin, Manager, Vendor, Kitchen, Delivery
- **Auto-Update** — Background download + install on quit via GitHub Releases
- **Dark Theme** — Premium dark UI with orange accents

## Quick Install

Download the latest installer from [Releases](https://github.com/decagraff/optimapos-desktop/releases):

| Platform | File |
|----------|------|
| Windows  | `OptimaPOS-Terminal-Setup-x.x.x.exe` |
| macOS    | `OptimaPOS-Terminal-x.x.x.dmg` |
| Linux    | `OptimaPOS-Terminal-x.x.x.AppImage` or `.deb` |

## Documentation

- [Development Setup](docs/SETUP.md) — Clone, install, run in dev mode
- [Build & Release](docs/BUILD.md) — Compile installers, publish updates
- [Architecture](docs/ARCHITECTURE.md) — App flow, components, services, real-time

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 33 |
| UI | React 18 + TypeScript |
| Bundler | Vite 6 |
| Real-Time | Socket.io Client |
| Updates | electron-updater (GitHub Releases) |
| Packaging | electron-builder |
| CI/CD | GitHub Actions |

## License

Private — Decatron
