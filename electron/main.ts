import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
};

function readConfig(): AppConfig {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            return { ...DEFAULT_CONFIG, ...data };
        }
    } catch {
        // corrupted config, reset
    }
    return { ...DEFAULT_CONFIG };
}

function writeConfig(updates: Partial<AppConfig>): AppConfig {
    const current = readConfig();
    const updated = { ...current, ...updates };
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (e) {
        console.error('[Config] Write error:', e);
    }
    return updated;
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
    const config = readConfig();
    const titleParts = ['OptimaPOS Terminal'];
    if (config.tenantName) titleParts.push(config.tenantName);
    if (config.locationName) titleParts.push(config.locationName);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: titleParts.join(' — '),
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

function setupAutoUpdater(): void {
    if (isDev) {
        log.info('[Updater] Skipping auto-update in dev mode');
        return;
    }

    // Auto-download and install on quit — seamless for the user
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        log.info('[Updater] Checking for updates...');
        sendToRenderer('updater-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`[Updater] Update available: v${info.version}`);
        sendToRenderer('updater-status', {
            status: 'available',
            version: info.version,
            releaseNotes: info.releaseNotes,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on('update-not-available', () => {
        log.info('[Updater] Already up to date');
        sendToRenderer('updater-status', { status: 'up-to-date' });
    });

    autoUpdater.on('download-progress', (progress) => {
        sendToRenderer('updater-status', {
            status: 'downloading',
            percent: Math.round(progress.percent),
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info(`[Updater] Update downloaded: v${info.version}`);
        sendToRenderer('updater-status', {
            status: 'ready',
            version: info.version,
        });
    });

    autoUpdater.on('error', (error) => {
        log.error('[Updater] Error:', error);
        sendToRenderer('updater-status', {
            status: 'error',
            message: error.message,
        });
    });

    // Check for updates 5 seconds after app starts
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
            log.error('[Updater] Check failed:', err);
        });
    }, 5000);

    // Then check every 30 minutes
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
        mainWindow.setTitle(parts.join(' — '));
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

app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();

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
