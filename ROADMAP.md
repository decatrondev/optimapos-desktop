# OptimaPOS Desktop — Roadmap Profesional

**Fecha:** 2026-03-17
**Repositorio:** `decagraff/optimapos-desktop`
**Estado actual:** Terminal de cocina funcional (nombre legacy "don-carlyn-kitchen")
**Objetivo:** App de escritorio profesional multi-rol con impresión térmica, modo offline e instalador auto-actualizable

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────┐
│                  ELECTRON MAIN PROCESS               │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ Updater │  │ SQLite   │  │ USB/Network Print  │ │
│  │ (auto)  │  │ (offline)│  │ (ESC/POS directo)  │ │
│  └─────────┘  └──────────┘  └────────────────────┘ │
│       │            │                │               │
│  ┌────────────────────────────────────────────────┐ │
│  │              IPC Bridge (preload.ts)            │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               REACT RENDERER PROCESS                 │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Login + │  │ Selector │  │ Vista    │          │
│  │ Tenant  │  │ de Local │  │ por Rol  │          │
│  └─────────┘  └──────────┘  └──────────┘          │
│       │                          │                  │
│  ┌────┴──────────────────────────┴───────────────┐ │
│  │          VISTAS SEGÚN ROL                      │ │
│  │                                                │ │
│  │  KITCHEN    → Cola cocina + timers + tickets   │ │
│  │  VENDOR     → POS completo + cobro + ticket    │ │
│  │  DELIVERY   → Mis entregas + confirmar + GPS   │ │
│  │  MANAGER    → Dashboard turno + todas vistas   │ │
│  │  ADMIN      → Todo + config impresoras         │ │
│  └────────────────────────────────────────────────┘ │
│                       │                             │
│  ┌────────────────────▼───────────────────────────┐ │
│  │  Socket.io (real-time) + REST API (HTTP)       │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
            OptimaPOS Backend (API)
            Puerto 3005 / WebSocket
```

---

## FASE 1 — Actualización Base (Prioridad CRÍTICA)

> Sincronizar con el backend actual. Sin esto, la app no funciona correctamente.

### 1.1 Rebrand completo
- **Qué:** Cambiar todo "Don Carlyn Kitchen" → "OptimaPOS Terminal"
- **Archivos:** `package.json` (name, productName, description), `electron/main.ts` (título ventana), `src/` (textos UI), `electron-builder` config
- **Logo:** Usar logo de OptimaPOS en ventana, splash screen y taskbar
- **Detalle:**
  - `package.json` → `name: "optimapos-desktop"`, `productName: "OptimaPOS Terminal"`
  - Splash screen al abrir (logo + "Conectando..." mientras valida token)
  - Título dinámico: "OptimaPOS — [Nombre del Tenant] — [Nombre del Local]"

### 1.2 Multi-tenant
- **Qué:** La app debe saber a qué tenant (restaurante) conectarse
- **Flujo:**
  1. Primera vez: pantalla de configuración → ingresar URL del tenant (ej: `doncarlyn.decatron.net`)
  2. Guardar en `userData/tenant_config.json` (persistente)
  3. Todas las llamadas API usan esa URL base
  4. El header `X-Tenant-Id` se envía automáticamente (extraído del subdominio)
  5. Opción de "Cambiar restaurante" en menú de configuración
- **Validación:** Al guardar URL, hacer `GET /api/health` para verificar que el servidor responde
- **Validación 2:** Al hacer login, verificar que el tenant está `ACTIVE` o `TRIAL` (el backend ya devuelve 403 si está suspendido)

### 1.3 Multi-sucursal
- **Qué:** Si el usuario tiene acceso a más de un local, elegir cuál operar
- **Flujo:**
  1. Después del login → `GET /api/users/me/locations`
  2. Si tiene 1 local → auto-seleccionar
  3. Si tiene 2+ → pantalla de selección con cards (nombre, dirección)
  4. Guardar `activeLocationId` en sesión
  5. Todas las queries envían `?locationId=X`
  6. Mostrar nombre del local en la barra de estado superior
- **Validación:** Si el usuario no tiene locales asignados y es ADMIN → mostrar todos los locales
- **Validación 2:** Si es VENDOR/KITCHEN/DELIVERY y no tiene local asignado → mostrar error "Contacta al administrador para que te asigne un local"

### 1.4 Roles y permisos actualizados
- **Qué:** Respetar los 5 roles del backend y la tabla Permission
- **Login:** `POST /api/auth/login` → recibir `role` + `GET /api/users/me/permissions`
- **Roles permitidos en la app:**
  - `ADMIN` → acceso total, puede configurar impresoras
  - `MANAGER` → todo operativo del local asignado
  - `VENDOR` → POS, cobrar, imprimir tickets
  - `KITCHEN` → solo pantalla de cocina
  - `DELIVERY` → solo pantalla de entregas
  - `CLIENT` → **BLOQUEADO** — mostrar "Esta app es solo para personal del restaurante"
  - `SUPER_ADMIN` → **BLOQUEADO** — usar panel web
- **Permisos granulares:** Antes de mostrar cada vista, verificar:
  - Cocina: `kitchen_view:read`
  - POS: `pos:read` + `pos:write`
  - Pedidos: `orders:read`
  - Delivery: `delivery_view:read`
  - Caja: `cash_management:read`
  - Reportes: `reports:read`
- **Sin permiso → Pantalla bloqueada:** "No tienes acceso a este módulo. Contacta al administrador."

### 1.5 Pantalla de login mejorada
- **Qué:** Login profesional con validaciones
- **Campos:** Email + Contraseña
- **Validaciones frontend:**
  - Email: formato válido
  - Contraseña: no vacía
  - Mostrar/ocultar contraseña
  - Política de contraseña visible (8+ chars, mayúscula, minúscula, número)
- **Validaciones backend:**
  - 401 → "Email o contraseña incorrectos"
  - 403 (tenant suspendido) → "Tu restaurante está suspendido. Contacta soporte."
  - 403 (CLIENT) → "Esta app es solo para personal del restaurante"
  - 429 (rate limit) → "Demasiados intentos. Espera 15 minutos."
  - Network error → "Sin conexión al servidor. Verifica tu internet."
- **Remember me:** Checkbox para mantener sesión (token en archivo, no solo memoria)
- **Auto-login:** Si hay token guardado, validar con `GET /api/auth/me` al abrir la app

---

## FASE 2 — Impresión Térmica Real (Prioridad ALTA)

> El feature principal que justifica tener una app de escritorio.

### 2.1 Impresión USB directa
- **Qué:** Imprimir directo a impresoras térmicas ESC/POS conectadas por USB
- **Librería:** `node-thermal-printer` (soporta Epson, Star, Bixolon, etc.)
- **Flujo:**
  1. Detectar impresoras USB conectadas al sistema
  2. El admin selecciona cuál usar (menú de configuración)
  3. Al recibir pedido → generar comandos ESC/POS → enviar directo al puerto USB
- **Comandos ESC/POS soportados:**
  - Texto normal, negrita, doble tamaño
  - Alineación (izquierda, centro, derecha)
  - Código de barras y QR
  - Corte de papel (parcial y total)
  - Apertura de cajón de dinero (pin 2 y pin 5)
  - Logo/imagen (bitmap 1-bit)
- **Anchos de papel:** 58mm (32 chars) y 80mm (48 chars) — configurable
- **Validación:** Test print al configurar (imprime ticket de prueba)

### 2.2 Impresión por red
- **Qué:** Imprimir a impresoras térmicas conectadas por red (IP:puerto)
- **Protocolo:** TCP socket directo (la mayoría usa puerto 9100)
- **Flujo:** Mismo que USB pero con dirección IP en vez de puerto USB
- **Validación:** Ping a la IP antes de guardar configuración

### 2.3 Auto-print (impresión automática)
- **Qué:** Cuando llega un pedido nuevo por WebSocket, imprimir automáticamente
- **Configuración por impresora:**
  - Activar/desactivar auto-print
  - Qué tipos de pedido imprime (delivery, pickup, mesa)
  - Qué template usa
  - Cuántas copias (1-3)
- **Reglas desde backend:** Respetar `PrintRule` del backend (ya existe el modelo)
  - Regla: "Si pedido es DINE_IN y tiene categoría Bebidas → imprimir en impresora de barra"
  - Regla: "Si pedido es DELIVERY → imprimir en impresora de cocina + impresora de caja"
- **Sonido:** Alerta audible diferenciada:
  - Nuevo pedido delivery → sonido urgente
  - Nuevo pedido mesa → sonido normal
  - Stock bajo → sonido de alerta

### 2.4 Multi-impresora
- **Qué:** Soportar múltiples impresoras simultáneas con roles distintos
- **Ejemplo de setup en restaurante:**
  - Impresora 1 (Cocina caliente): recibe tickets de platos
  - Impresora 2 (Barra): recibe tickets de bebidas
  - Impresora 3 (Caja): recibe ticket de venta completo
- **Config persistente:** Guardado en `userData/printers.json`

### 2.5 Templates mejorados
- **Qué:** Mejorar el sistema de templates existente (ya tiene V2)
- **Nuevos elementos:**
  - QR code (para link de tracking del pedido)
  - Datos fiscales del tenant (RUC, razón social)
  - Número de mesa (si es DINE_IN)
  - Nombre del vendedor/cajero
  - Descuento aplicado (código, monto)
  - Notas del pedido
  - Pie de página personalizable ("Gracias por su compra", WiFi, redes sociales)

---

## FASE 3 — Vistas por Rol (Prioridad MEDIA-ALTA)

> Cada rol ve una interfaz optimizada para su función.

### 3.1 Vista Cocina (KITCHEN)
- **Layout:** Columnas tipo Kanban → PENDIENTE | EN PREPARACIÓN | LISTO
- **Cada tarjeta muestra:**
  - Número de pedido y tipo (🏠 Mesa 5, 🛵 Delivery, 🏃 Recojo)
  - Timer desde que entró (verde < 10min, amarillo 10-20min, rojo > 20min)
  - Lista de items con cantidades y notas especiales
  - Botón: "Empezar" / "Listo"
- **Filtro por estación:** Si hay múltiples estaciones (cocina caliente, fría, barra), filtrar por categoría de producto
- **Sonido diferenciado:** Urgente si el timer pasa de rojo
- **Auto-print:** Ticket de cocina al recibir pedido (solo items relevantes para esa estación)
- **Pantalla completa:** Modo fullscreen sin distracciones (F11)

### 3.2 Vista POS/Cajero (VENDOR)
- **Layout:** Pantalla dividida → Productos (izquierda 60%) | Carrito (derecha 40%)
- **Productos:**
  - Grid de categorías con iconos/imágenes
  - Búsqueda rápida por nombre
  - Soporte para lector de código de barras (input focus permanente)
  - Variantes (tamaño, presentación)
  - Adicionales (extras, salsas)
  - Combos
- **Carrito:**
  - Items con cantidad (+/-)
  - Notas por item
  - Selección de mesa (si es DINE_IN) → `GET /api/tables`
  - Tipo de pedido: Mesa / Delivery / Recojo
  - Datos del cliente (delivery: nombre, teléfono, dirección, zona)
  - Descuento: código o manual (solo si tiene permiso)
  - Método de pago: Efectivo / Tarjeta / Yape / Plin / Transferencia
  - Monto recibido + vuelto (si es efectivo)
- **Al confirmar:**
  - `POST /api/orders/pos` con todos los datos
  - Imprimir ticket de venta automáticamente
  - Comando de apertura de cajón (si pago en efectivo)
  - Limpiar carrito
- **Atajos de teclado:**
  - `F1` → Nuevo pedido
  - `F2` → Buscar producto
  - `F4` → Cobrar
  - `F5` → Abrir cajón
  - `Esc` → Cancelar
  - `Enter` → Confirmar

### 3.3 Vista Delivery (DELIVERY)
- **Layout:** Lista de entregas asignadas al motorizado logueado
- **Cada entrega muestra:**
  - Código de pedido
  - Dirección + zona + referencia
  - Teléfono del cliente (tap para llamar — no aplica en desktop, pero copiar)
  - Items del pedido
  - Total a cobrar (si es contra-entrega)
  - Timer desde que se asignó
- **Acciones:**
  - "En camino" → `PATCH /api/orders/delivery/:id/status` → `ON_THE_WAY`
  - "Entregado" → marca `DELIVERED`
  - "No entregado" → abre modal con motivo
- **Mapa (futuro):** Mostrar ruta en mapa embebido

### 3.4 Vista Manager/Admin
- **Dashboard de turno:**
  - Pedidos del día: completados, en proceso, cancelados
  - Ventas totales del día
  - Tiempo promedio de preparación
  - Producto más vendido hoy
  - Estado de caja (abierta/cerrada, saldo)
- **Acceso rápido a:**
  - Cola de cocina
  - POS
  - Lista de entregas
  - Abrir/cerrar caja
- **Solo ADMIN adicional:**
  - Configuración de impresoras
  - Configuración de la app (URL del servidor, etc.)

### 3.5 Gestión de Caja
- **Abrir caja:** `POST /api/cash/open` con monto inicial
- **Movimientos:** Ingresos y egresos manuales (ej: "Pago a proveedor", "Propina")
- **Cerrar caja:** `POST /api/cash/close` → resumen impreso automáticamente
- **Ticket de cierre:** Totales por método de pago, movimientos, diferencia vs esperado

---

## FASE 4 — Modo Offline + SQLite (Prioridad MEDIA)

> La app sigue funcionando aunque se caiga internet.

### 4.1 Base de datos local (SQLite)
- **Librería:** `better-sqlite3` (síncrono, rápido, cero config)
- **Tablas locales:**
  - `products` — caché del catálogo completo (se sincroniza al abrir/cada hora)
  - `categories` — caché de categorías
  - `pending_orders` — pedidos creados offline esperando sync
  - `sync_queue` — cola de acciones pendientes (status updates, movimientos de caja)
  - `config` — configuración local (impresoras, tenant URL, etc.)
- **Sincronización:**
  - Al abrir la app: descargar catálogo completo → guardar en SQLite
  - Cada 30 min: re-sync incremental (products updated_at > last_sync)
  - Al recuperar conexión: enviar cola de sync al backend

### 4.2 Pedidos offline
- **Cuándo:** Si se detecta pérdida de conexión (socket disconnect + fetch fail)
- **Flujo:**
  1. Cajero crea pedido normalmente en el POS
  2. Se guarda en `pending_orders` de SQLite con status `OFFLINE_PENDING`
  3. Se imprime ticket con marca "⚠ PEDIDO OFFLINE — PENDIENTE DE SYNC"
  4. Indicador visual: barra naranja "Sin conexión — X pedidos pendientes"
  5. Al recuperar conexión → `POST /api/orders/pos` uno por uno
  6. Si el pedido se sincroniza OK → marcar como synced, reimprimir ticket limpio
  7. Si falla (ej: producto ya no existe) → notificar al usuario
- **Validación:** Los precios se toman del caché local (SQLite), pero el backend valida al sincronizar
- **Límite:** Máximo 50 pedidos offline antes de bloquear (evitar desincronización masiva)

### 4.3 Indicadores de conexión
- **Barra de estado siempre visible:**
  - 🟢 **Conectado** — todo normal
  - 🟡 **Reconectando...** — perdió conexión, intentando reconectar
  - 🔴 **Sin conexión** — modo offline activo, mostrando "X acciones pendientes"
- **Al reconectar:**
  - Sincronizar cola automáticamente
  - Mostrar notificación: "Conexión restaurada. X pedidos sincronizados."
  - Si hay conflictos: modal de resolución

---

## FASE 5 — Instalador + Auto-Update (Prioridad MEDIA)

> Distribuir como app instalable que se actualiza sola.

### 5.1 Empaquetado con electron-builder
- **Plataformas:**
  - Windows: `.exe` instalador (NSIS) + `.msi` para empresas
  - macOS: `.dmg` (firmado con Apple Developer ID si se consigue)
  - Linux: `.AppImage` + `.deb`
- **Configuración en `package.json` → `build`:**
  - `appId: "net.decatron.optimapos"`
  - `productName: "OptimaPOS Terminal"`
  - `icon`: logo en `.ico` (Windows), `.icns` (Mac), `.png` (Linux)
  - `nsis`: instalador con opción "Instalar para todos los usuarios" o "Solo para mí"
  - `win.target`: `["nsis", "portable"]` — instalador + versión portable sin instalar
- **Incluir:**
  - SQLite binario nativo (pre-built para cada plataforma)
  - Certificado de firma de código (Windows: Authenticode, Mac: notarización)

### 5.2 Auto-update con electron-updater
- **Librería:** `electron-updater` (incluido en electron-builder)
- **Servidor de updates:** GitHub Releases (gratis, ya tienes el repo)
- **Flujo:**
  1. Al abrir la app: `autoUpdater.checkForUpdates()`
  2. Si hay nueva versión → descargar en background
  3. Mostrar notificación discreta: "Actualización disponible (v1.2.0)"
  4. Botón: "Actualizar ahora" o "Actualizar al cerrar"
  5. Al reiniciar: instala automáticamente
- **Canales:**
  - `stable` — releases de producción (tag: `v1.0.0`)
  - `beta` — pre-releases para testing (tag: `v1.1.0-beta.1`)
- **Configuración:**
  - `publish.provider: "github"`
  - `publish.owner: "decagraff"`
  - `publish.repo: "optimapos-desktop"`
- **Fallback:** Si auto-update falla → link a la página de descarga manual

### 5.3 Proceso de release
```bash
# 1. Bump version
npm version patch  # o minor, major

# 2. Build para todas las plataformas
npm run build:win    # Windows .exe + .msi
npm run build:mac    # macOS .dmg
npm run build:linux  # Linux .AppImage + .deb

# 3. Publicar en GitHub Releases
npm run publish      # electron-builder --publish always

# 4. Los clientes reciben la actualización automáticamente
```

### 5.4 Primera instalación (onboarding)
- **Flujo del usuario nuevo:**
  1. Descarga `.exe` desde link que le da el admin
  2. Instala (Next → Next → Install → Finish)
  3. Abre la app → Pantalla de bienvenida
  4. Ingresa URL del restaurante: `doncarlyn.decatron.net`
  5. App valida → muestra nombre del restaurante
  6. Login con email/contraseña
  7. Si tiene 2+ locales → elegir local
  8. Si el rol requiere impresora → configurar impresora
  9. Listo — dashboard según rol
- **El admin puede generar link de descarga** con URL pre-configurada:
  `optimapos-terminal://setup?server=doncarlyn.decatron.net`

---

## FASE 6 — Features Pro (Prioridad BAJA)

### 6.1 Atajos de teclado globales
- Toda la app operable sin mouse (importante para cajeros rápidos)
- Configuración de atajos personalizable

### 6.2 Modo kiosko
- Para terminales de auto-pedido (cliente pide solo)
- Sin acceso al sistema operativo (fullscreen forzado, sin Alt+F4)
- UI simplificada: solo menú → carrito → pagar

### 6.3 Integración con balanza electrónica
- Para productos por peso (pollo, ensaladas)
- Leer peso desde puerto serial (RS-232)

### 6.4 Lector de código de barras
- Input nativo — el lector simula teclado
- Mapeo: código de barras → producto en catálogo

### 6.5 Segundo monitor
- Monitor 1 (cajero): POS completo
- Monitor 2 (cliente): muestra lo que se va agregando, total, publicidad

### 6.6 Reportes locales
- Dashboard con gráficos del día/semana (usando datos de SQLite)
- Funciona offline — no necesita backend para el histórico local

### 6.7 Respaldo local automático
- SQLite se respalda cada hora en carpeta configurable
- Útil si el servidor central falla — el local no pierde datos

---

## Resumen de Fases

| Fase | Descripción | Esfuerzo estimado | Prioridad |
|------|-------------|-------------------|-----------|
| **1** | Actualización base (rebrand, multi-tenant, roles, permisos) | 8-12 horas | CRÍTICA |
| **2** | Impresión térmica real (USB, red, auto-print, multi-impresora) | 12-16 horas | ALTA |
| **3** | Vistas por rol (cocina, POS, delivery, manager, caja) | 20-30 horas | MEDIA-ALTA |
| **4** | Modo offline + SQLite (caché, pedidos offline, sync) | 12-16 horas | MEDIA |
| **5** | Instalador + auto-update (electron-builder, GitHub releases) | 6-8 horas | MEDIA |
| **6** | Features pro (kiosko, balanza, segundo monitor, etc.) | 20-30 horas | BAJA |
| **TOTAL** | | **78-112 horas** | |

---

## Dependencias Nuevas (a instalar)

| Paquete | Para qué | Fase |
|---------|----------|------|
| `node-thermal-printer` | Impresión ESC/POS directa USB/red | 2 |
| `usb` o `serialport` | Detección de impresoras USB | 2 |
| `better-sqlite3` | Base de datos offline | 4 |
| `electron-updater` | Auto-actualización | 5 |
| `electron-log` | Logs persistentes en la app | 1 |

---

## Stack Final

```
Electron 33+ (Chromium + Node.js)
├── Main Process (Node.js)
│   ├── better-sqlite3 (offline DB)
│   ├── node-thermal-printer (ESC/POS)
│   ├── electron-updater (auto-update)
│   ├── electron-log (logging)
│   └── IPC handlers
│
├── Renderer Process (Chromium)
│   ├── React 18 + TypeScript
│   ├── Vite (build)
│   ├── TailwindCSS (UI)
│   ├── Socket.io-client (real-time)
│   └── Axios (REST API)
│
└── Build/Distribution
    ├── electron-builder (packaging)
    ├── GitHub Releases (hosting)
    └── NSIS / DMG / AppImage (installers)
```

---

## Orden de Implementación Recomendado

```
SEMANA 1-2:  Fase 1 completa (base funcional actualizada)
SEMANA 3-4:  Fase 2 (impresión real — el core value de la app)
SEMANA 5-7:  Fase 3 (vistas por rol — funcionalidad completa)
SEMANA 8-9:  Fase 5 (instalador — para poder distribuir)
SEMANA 10-11: Fase 4 (offline — robustez)
SEMANA 12+:  Fase 6 (pro features según demanda)
```

> **Nota:** La Fase 5 (instalador) se mueve antes de la 4 (offline) porque es más importante poder distribuir la app que tener modo offline. El offline es un nice-to-have, el instalador es necesario para que los clientes la usen.
