import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import {
    printViaTCP,
    printViaUSB,
    scanNetworkPrinters,
    cancelNetworkScan,
    getSystemPrinters,
    buildTestTicket,
    textToEscPos,
    testTCPConnection,
} from './printer';
import {
    initDatabase,
    closeDatabase,
    isDbReady,
    hasCachedCatalog,
    getCachedProducts,
    getCachedCategories,
    getCachedCombos,
    getCachedTables,
    getCachedZones,
    getLastSyncTime,
    saveOfflineOrder,
    getPendingOrders,
    getPendingOrderCount,
    removePendingOrder,
} from './database';
import {
    syncCatalog,
    syncPendingOrders,
    checkConnection,
    startSyncScheduler,
    stopSyncScheduler,
} from './offline-sync';

import { exec } from 'child_process';
import { cacheImage, getCachedImage, cleanupCache } from './image-cache';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Linux: disable sandbox to avoid SUID permission issues on VMs and some distros
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// ─── Windows Firewall: ensure TCP 9100 is allowed (out + in) ───────────────
function ensureFirewallRule(): void {
    if (process.platform !== 'win32') return;

    const rules = [
        { name: 'OptimaPOS Printer Out 9100', dir: 'out', port: 'remoteport=9100' },
        { name: 'OptimaPOS Printer In 9100', dir: 'in', port: 'localport=9100' },
    ];

    for (const rule of rules) {
        exec(`netsh advfirewall firewall show rule name="${rule.name}"`, (err, stdout) => {
            if (stdout && stdout.includes(rule.name)) {
                log.info(`[Firewall] "${rule.name}" already exists`);
                return;
            }
            // Try creating the rule directly (works if app runs as admin or user has permission)
            const addCmd = `netsh advfirewall firewall add rule name="${rule.name}" dir=${rule.dir} action=allow protocol=TCP ${rule.port} enable=yes`;
            exec(addCmd, (addErr) => {
                if (addErr) {
                    log.warn(`[Firewall] Direct add failed for "${rule.name}", trying elevated...`);
                    const psCmd = `Start-Process -FilePath 'netsh' -ArgumentList 'advfirewall firewall add rule name="${rule.name}" dir=${rule.dir} action=allow protocol=TCP ${rule.port} enable=yes' -Verb RunAs -WindowStyle Hidden -Wait`;
                    exec(psCmd, { shell: 'powershell.exe' }, (psErr) => {
                        if (psErr) {
                            log.error(`[Firewall] Elevated attempt failed for "${rule.name}":`, psErr.message);
                        } else {
                            log.info(`[Firewall] "${rule.name}" created via elevation`);
                        }
                    });
                } else {
                    log.info(`[Firewall] "${rule.name}" created`);
                }
            });
        });
    }
}

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

// ─── Logging ────────────────────────────────────────────────────────────────

log.transports.file.level = 'info';
autoUpdater.logger = log;
log.info('OptimaPOS Terminal starting...');

// ─── Persistent Storage Paths ────────────────────────────────────────────────

const DATA_DIR = app.getPath('userData');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

interface AppConfig {
    serverUrl: string;      // e.g. "https://doncarlyn.decatron.net"
    tenantSlug: string;     // e.g. "doncarlyn"
    tenantName: string;     // e.g. "Don Carlyn"
    apiKey: string;         // desktop API key from backend
    token: string | null;   // JWT token for user session
    printerId: number | null;
    locationId: number | null;
    locationName: string | null;
    rememberMe: boolean;
    cachedUser: string | null;       // JSON-stringified user for offline login
    cachedPermissions: string | null; // JSON-stringified permissions for offline
    cachedLocations: string | null;   // JSON-stringified locations for offline
}

// Fields that should be encrypted with safeStorage
const SENSITIVE_KEYS: (keyof AppConfig)[] = ['token', 'apiKey', 'cachedUser', 'cachedPermissions', 'cachedLocations'];

function encryptValue(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) return value;
    return safeStorage.encryptString(value).toString('base64');
}

function decryptValue(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) return value;
    try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
    } catch {
        // Value was stored before encryption was enabled — return as-is
        return value;
    }
}

const DEFAULT_CONFIG: AppConfig = {
    serverUrl: '',
    tenantSlug: '',
    tenantName: '',
    apiKey: '',
    token: null,
    printerId: null,
    locationId: null,
    locationName: null,
    rememberMe: false,
    cachedUser: null,
    cachedPermissions: null,
    cachedLocations: null,
};

function readConfig(): AppConfig {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            const merged = { ...DEFAULT_CONFIG, ...data };
            // Decrypt sensitive fields
            for (const key of SENSITIVE_KEYS) {
                const val = merged[key];
                if (typeof val === 'string' && val.length > 0) {
                    (merged as any)[key] = decryptValue(val);
                }
            }
            return merged;
        }
    } catch (e: any) {
        log.warn('[Config] Read/parse error, resetting to defaults:', e.message);
    }
    return { ...DEFAULT_CONFIG };
}

function writeConfig(updates: Partial<AppConfig>): AppConfig {
    const current = readConfig();
    const updated = { ...current, ...updates };
    // Encrypt sensitive fields before writing
    const toWrite = { ...updated };
    for (const key of SENSITIVE_KEYS) {
        const val = toWrite[key];
        if (typeof val === 'string' && val.length > 0) {
            (toWrite as any)[key] = encryptValue(val);
        }
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(toWrite, null, 2), 'utf-8');
    } catch (e: any) {
        log.error('[Config] Write error:', e.message);
    }
    return updated;
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
    const config = readConfig();
    const titleParts = ['OptimaPOS Terminal'];
    if (config.tenantName) titleParts.push(config.tenantName);
    if (config.locationName) titleParts.push(config.locationName);

    // Content-Security-Policy — restrict what the renderer can load
    const serverOrigin = config.serverUrl ? new URL(config.serverUrl).origin : '';
    const wsOrigin = serverOrigin.replace(/^https?:/, 'wss:');
    const connectSrc = ['\'self\'', serverOrigin, wsOrigin, 'https://*.decatron.net', 'wss://*.decatron.net'].filter(Boolean).join(' ');

    require('electron').session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.decatron.net ${serverOrigin}; connect-src ${connectSrc}; font-src 'self' data:; object-src 'none'; base-uri 'self'`,
                ],
            },
        });
    });

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: titleParts.join(' - '),
        autoHideMenuBar: true,
        backgroundColor: '#0a0c10',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── Auto-Updater ───────────────────────────────────────────────────────────

async function checkForUpdateOnStartup(): Promise<void> {
    if (isDev) {
        log.info('[Updater] Skipping auto-update in dev mode');
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    log.info('[Updater] Checking for updates before showing app...');

    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
            log.info('[Updater] Already up to date');
            return;
        }

        const newVersion = result.updateInfo.version;
        log.info(`[Updater] Update available: v${newVersion}`);

        // Show dialog asking user to update
        const response = await dialog.showMessageBox({
            type: 'info',
            title: 'Actualizacion disponible',
            message: `Nueva version v${newVersion} disponible`,
            detail: `Version actual: v${app.getVersion()}\n\nSe descargara e instalara automaticamente.`,
            buttons: ['Actualizar ahora', 'Omitir'],
            defaultId: 0,
            cancelId: 1,
        });

        if (response.response === 0) {
            // User chose to update — download with progress dialog
            log.info('[Updater] User accepted update, downloading...');

            const progressWin = new BrowserWindow({
                width: 400,
                height: 160,
                resizable: false,
                frame: false,
                alwaysOnTop: true,
                backgroundColor: '#0a0c10',
                webPreferences: { contextIsolation: true },
            });

            progressWin.loadURL(`data:text/html;charset=utf-8,
                <html>
                <body style="margin:0;background:#0a0c10;color:#f1f5f9;font-family:system-ui;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;gap:12px">
                    <div style="font-size:16px;font-weight:600">Descargando actualizacion...</div>
                    <div id="pct" style="font-size:24px;color:#f97316">0%</div>
                    <div style="width:300px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                        <div id="bar" style="height:100%;width:0%;background:#f97316;border-radius:3px;transition:width 0.3s"></div>
                    </div>
                </body>
                </html>
            `);

            autoUpdater.on('download-progress', (progress) => {
                const pct = Math.round(progress.percent);
                if (progressWin && !progressWin.isDestroyed()) {
                    progressWin.webContents.executeJavaScript(
                        `document.getElementById('pct').textContent='${pct}%';document.getElementById('bar').style.width='${pct}%';`
                    ).catch(() => {});
                }
            });

            autoUpdater.on('update-downloaded', () => {
                log.info('[Updater] Download complete, installing...');
                if (progressWin && !progressWin.isDestroyed()) {
                    progressWin.close();
                }
                autoUpdater.quitAndInstall(false, true);
            });

            autoUpdater.on('error', (error) => {
                log.error('[Updater] Download error:', error);
                if (progressWin && !progressWin.isDestroyed()) {
                    progressWin.close();
                }
                dialog.showErrorBox('Error de actualizacion', 'No se pudo descargar la actualizacion. La app se abrira normalmente.');
            });

            await autoUpdater.downloadUpdate();
            return;
        }

        log.info('[Updater] User skipped update');
    } catch (err) {
        log.error('[Updater] Startup check failed:', err);
        // Silently continue — don't block the app from opening
    }
}

function setupBackgroundUpdater(): void {
    if (isDev) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        sendToRenderer('updater-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info: any) => {
        sendToRenderer('updater-status', { status: 'available', version: info.version });
    });

    autoUpdater.on('update-not-available', () => {
        sendToRenderer('updater-status', { status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progress: any) => {
        sendToRenderer('updater-status', {
            status: 'downloading',
            percent: Math.round(progress.percent),
        });
    });

    autoUpdater.on('update-downloaded', (info: any) => {
        sendToRenderer('updater-status', { status: 'ready', version: info.version });
    });

    autoUpdater.on('error', (error: any) => {
        sendToRenderer('updater-status', { status: 'error', message: error.message });
    });

    // Check every 30 minutes in background
    setInterval(() => {
        autoUpdater.checkForUpdates().catch(err => {
            log.error('[Updater] Periodic check failed:', err);
        });
    }, 30 * 60 * 1000);
}

function sendToRenderer(channel: string, data: any): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Config management
ipcMain.handle('get-config', async () => readConfig());

ipcMain.handle('save-config', async (_event, updates: Partial<AppConfig>) => {
    const config = writeConfig(updates);
    // Update window title
    if (mainWindow) {
        const parts = ['OptimaPOS Terminal'];
        if (config.tenantName) parts.push(config.tenantName);
        if (config.locationName) parts.push(config.locationName);
        mainWindow.setTitle(parts.join(' - '));
    }
    return config;
});

// Token persistence (convenience shortcuts)
ipcMain.handle('store-token', async (_event, token: string | null) => {
    writeConfig({ token });
});

ipcMain.handle('get-token', async () => {
    return readConfig().token;
});

// Printer ID persistence
ipcMain.handle('store-printer-id', async (_event, printerId: number | null) => {
    writeConfig({ printerId });
});

ipcMain.handle('get-printer-id', async () => {
    return readConfig().printerId;
});

// Legacy env config (used by Vite env fallback)
ipcMain.handle('get-env-config', async () => {
    const config = readConfig();
    return {
        socketUrl: config.serverUrl || process.env.VITE_SOCKET_URL || '',
        storeName: config.tenantName || process.env.VITE_STORE_NAME || 'OptimaPOS',
        currencySymbol: process.env.VITE_CURRENCY_SYMBOL || 'S/',
    };
});

// Ticket file output (legacy — kept for text file export)
ipcMain.handle('print-ticket', async (_event, ticketText: string, fileName: string) => {
    try {
        const outputDir = process.env.TICKET_OUTPUT_DIR || 'Desktop';
        const ticketDir = path.join(require('os').homedir(), outputDir);
        if (!fs.existsSync(ticketDir)) {
            fs.mkdirSync(ticketDir, { recursive: true });
        }
        const filePath = path.join(ticketDir, fileName);
        fs.writeFileSync(filePath, ticketText, 'utf-8');
        console.log(`[Printer] Ticket saved: ${filePath}`);
        return { success: true, path: filePath };
    } catch (error: any) {
        console.error('[Printer] Error writing ticket:', error);
        return { success: false, error: error.message };
    }
});

// ─── IPC Timeout Helper ──────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
}

// ─── Printer IPC ─────────────────────────────────────────────────────────────

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAX_PRINT_DATA_SIZE = 1024 * 512; // 512KB max

function validateIP(ip: unknown): ip is string {
    return typeof ip === 'string' && IP_REGEX.test(ip) && ip.split('.').every(n => parseInt(n) <= 255);
}

function validatePort(port: unknown): port is number {
    return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validatePrintData(data: unknown): data is number[] {
    return Array.isArray(data) && data.length > 0 && data.length <= MAX_PRINT_DATA_SIZE;
}

// Print raw ESC/POS data via TCP (network)
ipcMain.handle('printer-print-tcp', async (_event, ip: string, port: number, data: number[]) => {
    if (!validateIP(ip) || !validatePort(port)) return { success: false, error: 'IP o puerto invalido' };
    if (!validatePrintData(data)) return { success: false, error: 'Datos de impresion invalidos o muy grandes' };
    return printViaTCP(ip, port, Buffer.from(data));
});

// Print raw ESC/POS data via USB (system driver)
ipcMain.handle('printer-print-usb', async (_event, printerName: string, data: number[]) => {
    if (typeof printerName !== 'string' || !printerName.trim()) return { success: false, error: 'Nombre de impresora invalido' };
    if (!validatePrintData(data)) return { success: false, error: 'Datos de impresion invalidos o muy grandes' };
    return printViaUSB(printerName, Buffer.from(data));
});

// Print text via TCP (auto-converts to ESC/POS)
ipcMain.handle('printer-print-text-tcp', async (_event, ip: string, port: number, text: string) => {
    if (!validateIP(ip) || !validatePort(port)) return { success: false, error: 'IP o puerto invalido' };
    if (typeof text !== 'string' || !text.trim()) return { success: false, error: 'Texto vacio' };
    const data = textToEscPos(text);
    return printViaTCP(ip, port, data);
});

// Print text via USB (auto-converts to ESC/POS)
ipcMain.handle('printer-print-text-usb', async (_event, printerName: string, text: string) => {
    if (typeof printerName !== 'string' || !printerName.trim()) return { success: false, error: 'Nombre de impresora invalido' };
    if (typeof text !== 'string' || !text.trim()) return { success: false, error: 'Texto vacio' };
    const data = textToEscPos(text);
    return printViaUSB(printerName, data);
});

// Print test ticket via TCP
ipcMain.handle('printer-test-tcp', async (_event, ip: string, port: number, storeName: string) => {
    if (!validateIP(ip) || !validatePort(port)) return { success: false, error: 'IP o puerto invalido' };
    const data = buildTestTicket(typeof storeName === 'string' ? storeName : 'OptimaPOS');
    return printViaTCP(ip, port, data);
});

// Print test ticket via USB
ipcMain.handle('printer-test-usb', async (_event, printerName: string, storeName: string) => {
    if (typeof printerName !== 'string' || !printerName.trim()) return { success: false, error: 'Nombre de impresora invalido' };
    const data = buildTestTicket(typeof storeName === 'string' ? storeName : 'OptimaPOS');
    return printViaUSB(printerName, data);
});

// Test TCP connection (no print)
ipcMain.handle('printer-test-connection', async (_event, ip: string, port: number) => {
    if (!validateIP(ip) || !validatePort(port)) return { success: false, error: 'IP o puerto invalido' };
    return testTCPConnection(ip, port);
});

// Scan network for printers (port 9100) — 90s timeout
ipcMain.handle('printer-scan-network', async () => {
    return withTimeout(
        scanNetworkPrinters(9100, 300, (current, total) => {
            sendToRenderer('printer-scan-progress', { current, total });
        }),
        90000,
        [],
    );
});

// Image cache
ipcMain.handle('image-cache-get', async (_event, url: string) => {
    return getCachedImage(url);
});

ipcMain.handle('image-cache-store', async (_event, url: string) => {
    return cacheImage(url);
});

// Window: always-on-top toggle
ipcMain.handle('set-always-on-top', async (_event, value: boolean) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(value);
        log.info(`[Window] Always on top: ${value}`);
    }
});

// Cancel network scan
ipcMain.handle('printer-scan-cancel', async () => {
    cancelNetworkScan();
});

// List system printers (USB/installed)
ipcMain.handle('printer-list-system', async () => {
    return getSystemPrinters();
});

// ─── Offline / SQLite IPC ────────────────────────────────────────────────────
// All SQLite handlers are safe — return empty/false if DB failed to init

ipcMain.handle('offline-check-connection', async (_event, serverUrl: string) => {
    return checkConnection(serverUrl);
});

ipcMain.handle('offline-sync-catalog', async (_event, serverUrl: string, token: string, locationId: number) => {
    if (!isDbReady()) return { success: false, error: 'SQLite not available' };
    return withTimeout(syncCatalog({ serverUrl, token, locationId }), 30000, { success: false, error: 'Timeout sincronizando catalogo' });
});

ipcMain.handle('offline-sync-pending', async (_event, serverUrl: string, token: string, locationId: number) => {
    if (!isDbReady()) return { synced: 0, failed: 0 };
    return withTimeout(syncPendingOrders({ serverUrl, token, locationId }), 30000, { synced: 0, failed: 0 });
});

ipcMain.handle('offline-has-catalog', async () => {
    if (!isDbReady()) return false;
    return hasCachedCatalog();
});

ipcMain.handle('offline-get-products', async () => {
    if (!isDbReady()) return [];
    return getCachedProducts();
});

ipcMain.handle('offline-get-categories', async () => {
    if (!isDbReady()) return [];
    return getCachedCategories();
});

ipcMain.handle('offline-get-combos', async () => {
    if (!isDbReady()) return [];
    return getCachedCombos();
});

ipcMain.handle('offline-get-tables', async () => {
    if (!isDbReady()) return [];
    return getCachedTables();
});

ipcMain.handle('offline-get-zones', async () => {
    if (!isDbReady()) return { zones: [], basePrice: 0 };
    return getCachedZones();
});

ipcMain.handle('offline-get-last-sync', async () => {
    if (!isDbReady()) return null;
    return getLastSyncTime();
});

ipcMain.handle('offline-save-order', async (_event, id: string, payload: any) => {
    if (!isDbReady()) return { success: false, error: 'SQLite not available' };
    return saveOfflineOrder(id, payload);
});

ipcMain.handle('offline-get-pending-orders', async () => {
    if (!isDbReady()) return [];
    return getPendingOrders();
});

ipcMain.handle('offline-get-pending-count', async () => {
    if (!isDbReady()) return 0;
    return getPendingOrderCount();
});

ipcMain.handle('offline-remove-pending', async (_event, id: string) => {
    if (isDbReady()) removePendingOrder(id);
});

// ─── Updater IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('updater-download', async () => {
    log.info('[Updater] User requested download');
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (err: any) {
        log.error('[Updater] Download failed:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('updater-install', async () => {
    log.info('[Updater] User requested install — quitting and installing');
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('updater-check', async () => {
    log.info('[Updater] Manual check requested');
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, version: result?.updateInfo?.version };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
});

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    // Initialize offline database (non-fatal if it fails)
    try {
        initDatabase();
    } catch (e: any) {
        log.error('[DB] Failed to initialize SQLite:', e.message);
    }

    // Ensure Windows firewall allows TCP 9100 for network printers
    ensureFirewallRule();

    // Clean up old cached images
    cleanupCache();

    // Show the app immediately, then check for updates in background
    createWindow();
    setupBackgroundUpdater();

    // Check for updates after window is visible (non-blocking)
    checkForUpdateOnStartup().catch(err => {
        log.error('[Updater] Startup check failed:', err);
    });

    // Start sync scheduler — provides connection status to renderer
    startSyncScheduler(
        () => {
            const config = readConfig();
            if (!config.token || !config.serverUrl || !config.locationId) return null;
            return { serverUrl: config.serverUrl, token: config.token, locationId: config.locationId };
        },
        (status) => {
            sendToRenderer('offline-status', { status });
        },
    );

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    stopSyncScheduler();
    closeDatabase();
});
