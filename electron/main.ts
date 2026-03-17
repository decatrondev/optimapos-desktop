import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

// ─── Token Storage (simple file-based) ────────────────────────────────────────

const TOKEN_FILE = path.join(app.getPath('userData'), 'auth_token.json');
const PRINTER_FILE = path.join(app.getPath('userData'), 'printer_config.json');

function readStoredToken(): string | null {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
            return data.token || null;
        }
    } catch {
        // ignore
    }
    return null;
}

function writeStoredToken(token: string | null): void {
    try {
        if (token) {
            fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }), 'utf-8');
        } else if (fs.existsSync(TOKEN_FILE)) {
            fs.unlinkSync(TOKEN_FILE);
        }
    } catch (e) {
        console.error('[Auth] Token storage error:', e);
    }
}

function readStoredPrinterId(): number | null {
    try {
        if (fs.existsSync(PRINTER_FILE)) {
            const data = JSON.parse(fs.readFileSync(PRINTER_FILE, 'utf-8'));
            return data.printerId || null;
        }
    } catch {
        // ignore
    }
    return null;
}

function writeStoredPrinterId(printerId: number | null): void {
    try {
        if (printerId !== null) {
            fs.writeFileSync(PRINTER_FILE, JSON.stringify({ printerId }), 'utf-8');
        } else if (fs.existsSync(PRINTER_FILE)) {
            fs.unlinkSync(PRINTER_FILE);
        }
    } catch (e) {
        console.error('[Printer] Config storage error:', e);
    }
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Don Carlyn - Cocina',
        icon: path.join(__dirname, '..', 'src', 'assets', 'icon.png'),
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

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('print-ticket', async (_event, ticketText: string, fileName: string) => {
    try {
        const outputDir = process.env.TICKET_OUTPUT_DIR || 'Desktop';
        const ticketDir = path.join(os.homedir(), outputDir);

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

ipcMain.handle('get-env-config', async () => {
    return {
        socketUrl: process.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net',
        storeName: process.env.VITE_STORE_NAME || 'Don Carlyn',
        currencySymbol: process.env.VITE_CURRENCY_SYMBOL || 'S/',
    };
});

ipcMain.handle('store-token', async (_event, token: string | null) => {
    writeStoredToken(token);
});

ipcMain.handle('get-token', async () => {
    return readStoredToken();
});

ipcMain.handle('store-printer-id', async (_event, printerId: number | null) => {
    writeStoredPrinterId(printerId);
});

ipcMain.handle('get-printer-id', async () => {
    return readStoredPrinterId();
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

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
