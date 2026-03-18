# Development Setup

## Requirements

- Node.js 20+
- npm
- Git

## Clone & Install

```bash
git clone https://github.com/decagraff/optimapos-desktop.git
cd optimapos-desktop
npm install
```

## Run in Dev Mode

```bash
npm run dev
```

This starts 3 processes in parallel:
1. **Vite** — React dev server with HMR
2. **TypeScript** — watch mode for type checking
3. **Electron** — desktop window loading from Vite

## Project Structure

```
optimapos-desktop/
├── electron/
│   ├── main.ts            # Main process (window, IPC, auto-updater, config)
│   └── preload.ts         # Context bridge (electronAPI)
├── src/
│   ├── App.tsx            # Root app (auth flow + view routing)
│   ├── main.tsx           # React entry point
│   ├── components/        # 15 React components
│   │   ├── AlertOverlay     # Full-screen new order alert
│   │   ├── CashManagement   # Cash register operations
│   │   ├── DeliveryView     # Delivery board (2 columns)
│   │   ├── KitchenKanban    # Kitchen display (3 columns)
│   │   ├── LocationPicker   # Multi-location selector
│   │   ├── LoginScreen      # Email + password login
│   │   ├── ManagerDashboard # Daily stats + navigation
│   │   ├── OrderCard        # Single order card
│   │   ├── OrderQueue       # Active orders grid
│   │   ├── PrinterSetup     # Printer selection
│   │   ├── ServerSetup      # Server URL configuration
│   │   ├── StatusBar        # Top bar (store, clock, connection)
│   │   ├── TicketPreview    # Ticket preview modal
│   │   ├── UpdateBanner     # Auto-update notification
│   │   └── ViewNavBar       # Navigation tabs
│   ├── context/
│   │   └── AuthContext.tsx  # Auth state, permissions, app config
│   ├── hooks/
│   │   ├── useClock.ts     # Real-time clock (Peru timezone)
│   │   └── useSocket.ts    # Socket.io connection + order state
│   ├── services/
│   │   ├── alert.service.ts         # Audio alerts (Web Audio API)
│   │   ├── auth.service.ts          # Login, token, server validation
│   │   ├── escpos-renderer.ts       # ESC/POS template rendering
│   │   ├── order.service.ts         # Order CRUD + status management
│   │   ├── printer-config.service.ts # Printers, rules, templates
│   │   ├── printer.service.ts       # Ticket formatting + file output
│   │   └── socket.service.ts        # Socket.io singleton
│   ├── types/
│   │   ├── order.ts           # Order, User, AppConfig types
│   │   └── printer-config.ts  # Printer, Rule, Template types
│   └── styles/
│       └── index.css          # Dark theme CSS
├── build/
│   ├── icon.png           # App icon (256x256)
│   ├── icon.ico           # Windows icon
│   └── installer.nsh      # NSIS custom script (icon cache refresh)
├── .github/workflows/
│   └── release.yml        # CI/CD for multi-platform builds
└── package.json           # Dependencies + electron-builder config
```

## Environment

The app doesn't use `.env` files. All configuration is stored in the Electron user data directory:

- **Windows:** `%APPDATA%/OptimaPOS Terminal/config.json`
- **macOS:** `~/Library/Application Support/OptimaPOS Terminal/config.json`
- **Linux:** `~/.config/OptimaPOS Terminal/config.json`

The config includes: `serverUrl`, `tenantSlug`, `tenantName`, `apiKey`, `token`, `printerId`, `locationId`.
