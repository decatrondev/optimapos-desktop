# Architecture

## App Flow

The app follows a sequential onboarding flow before reaching the operational view:

```
Start
  │
  ├─ Loading (splash screen)
  │
  ├─ Server Setup (first time only)
  │   └─ User enters restaurant URL → validates via GET /api/health
  │
  ├─ Login
  │   └─ Email + password → JWT token stored in Electron config
  │
  ├─ Role Check
  │   └─ Block CLIENT and SUPER_ADMIN roles
  │
  ├─ Location Selection (if 2+ locations)
  │   └─ Admin can choose "All Locations"
  │
  ├─ Printer Setup (skip for Kitchen/Delivery roles)
  │   └─ Select from available printers or skip
  │
  └─ Operational View (role-based default)
      ├─ Admin/Manager → Dashboard
      ├─ Kitchen → Kitchen Kanban
      ├─ Delivery → Delivery Board
      └─ Vendor → Order Queue
```

All configuration persists in Electron's user data directory, so subsequent launches skip to Login (or auto-login if token is valid).

## Role-Based Views

| Role | Default View | Available Views |
|------|-------------|-----------------|
| ADMIN | Dashboard | Dashboard, Kitchen, Orders, Delivery, Cash |
| MANAGER | Dashboard | Dashboard, Kitchen, Orders, Delivery, Cash |
| VENDOR | Orders | Orders, Cash |
| KITCHEN | Kitchen | Kitchen |
| DELIVERY | Delivery | Delivery |

## Real-Time Architecture

```
Backend (Express + Socket.io)
  │
  ├── emit('new_order', order)
  ├── emit('order_updated', order)
  └── emit('print_job', job)
       │
       ▼
Desktop App (Socket.io Client)
  │
  ├── useSocket hook receives events
  ├── Merges with REST polling (every 30s fallback)
  └── Updates UI immediately
```

**Connection flow:**
1. App connects to Socket.io with JWT token
2. Emits `desktop_connect` with API key + tenant slug + locationId
3. Server registers desktop as connected printer
4. App sends printer heartbeat every 30s

**Merge strategy:** Socket data takes priority over REST data. Orders are deduped by ID using a Map.

## Component Architecture

```
App (root)
├── UpdateBanner (always visible)
└── renderContent()
    ├── ServerSetup
    ├── LoginScreen
    ├── LocationPicker
    ├── PrinterSetup
    └── OperationalView
        ├── StatusBar (store name, clock, connection, user)
        ├── ViewNavBar (navigation tabs with badges)
        └── Active View
            ├── ManagerDashboard (stats + nav cards)
            ├── KitchenKanban (3-column board)
            ├── OrderQueue (order grid)
            │   └── OrderCard (individual order)
            ├── DeliveryView (2-column board)
            └── CashManagement (register + movements)
```

## Services Layer

| Service | Responsibility |
|---------|---------------|
| `auth.service` | Login, token persistence, server validation, locations |
| `order.service` | Fetch orders (by role), update status, status state machine |
| `socket.service` | Socket.io singleton — connect, events, heartbeat |
| `printer-config.service` | Printers, rules, templates from backend |
| `printer.service` | Format tickets, save via Electron IPC |
| `escpos-renderer` | Template → ESC/POS text (12 element types) |
| `alert.service` | Audio alerts via Web Audio API |

## Electron IPC Bridge

```
Renderer (React)                Preload (contextBridge)              Main Process
─────────────────               ─────────────────────               ─────────────
window.electronAPI  ──────────►  ipcRenderer.invoke()  ──────────►  ipcMain.handle()
     .getConfig()                    'get-config'                     reads config.json
     .saveConfig()                   'save-config'                    writes config.json
     .storeToken()                   'store-token'                    updates config
     .getToken()                     'get-token'                      reads config
     .printTicket()                  'print-ticket'                   writes file to disk
     .updaterCheck()                 'updater-check'                  autoUpdater.check()
     .updaterDownload()              'updater-download'               autoUpdater.download()
     .updaterInstall()               'updater-install'                autoUpdater.install()
     .onUpdaterStatus()              ipcRenderer.on()      ◄────────  BrowserWindow.send()
```

## Auto-Update System

```
App starts
  │
  ├─ Wait 5 seconds
  ├─ Check GitHub Releases for newer version
  │   ├─ No update → silent, check again in 30 min
  │   └─ Update found
  │       ├─ Show "New version available" banner
  │       ├─ Auto-download in background
  │       ├─ Show progress bar
  │       └─ When downloaded → "Ready to install" banner
  │           └─ On app quit → install silently + restart
  │
  └─ Repeat check every 30 minutes
```

Provider: GitHub Releases (`decagraff/optimapos-desktop`)

## Data Flow

```
Backend API                          Desktop App
───────────                          ───────────
POST /api/auth/login         ◄────   LoginScreen
GET  /api/auth/me            ◄────   Auto-login (token validation)
GET  /api/locations           ◄────   LocationPicker
GET  /api/printer-config/*    ◄────   PrinterSetup + rules
GET  /api/orders?status=X     ◄────   OrderQueue (REST polling)
GET  /api/orders/kitchen/*    ◄────   KitchenKanban
GET  /api/orders/delivery/*   ◄────   DeliveryView
PATCH /api/orders/:id/status  ◄────   Status advancement
GET  /api/cash/current        ◄────   CashManagement
POST /api/cash/open|close     ◄────   CashManagement
Socket.io (new_order)         ────►   useSocket → merge into state
Socket.io (order_updated)     ────►   useSocket → merge into state
Socket.io (print_job)         ────►   useSocket → TicketPreview
```
