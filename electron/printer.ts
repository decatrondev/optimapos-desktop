import * as net from 'net';
import * as os from 'os';
import { exec } from 'child_process';
import log from 'electron-log';

// ─── ESC/POS Command Constants ──────────────────────────────────────────────

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

const CMD = {
    INIT: Buffer.from([ESC, 0x40]),                         // Initialize printer
    CUT_PARTIAL: Buffer.from([GS, 0x56, 0x01]),             // Partial cut
    CUT_FULL: Buffer.from([GS, 0x56, 0x00]),                // Full cut
    ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
    ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
    ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
    BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
    BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
    UNDERLINE_ON: Buffer.from([ESC, 0x2D, 0x01]),
    UNDERLINE_OFF: Buffer.from([ESC, 0x2D, 0x00]),
    DOUBLE_WIDTH: Buffer.from([GS, 0x21, 0x10]),            // Double width
    DOUBLE_HEIGHT: Buffer.from([GS, 0x21, 0x01]),           // Double height
    DOUBLE_SIZE: Buffer.from([GS, 0x21, 0x11]),             // Double width + height
    NORMAL_SIZE: Buffer.from([GS, 0x21, 0x00]),             // Normal size
    FONT_A: Buffer.from([ESC, 0x4D, 0x00]),                 // Font A (12x24)
    FONT_B: Buffer.from([ESC, 0x4D, 0x01]),                 // Font B (9x17)
    FEED_LINES: (n: number) => Buffer.from([ESC, 0x64, n]), // Feed n lines
    OPEN_DRAWER: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]),// Open cash drawer pin 2
};

// ─── TCP Printer (Network) ──────────────────────────────────────────────────

export function printViaTCP(
    ip: string,
    port: number,
    data: Buffer,
    timeout = 5000
): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const finish = (result: { success: boolean; error?: string }) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeout);

        socket.on('timeout', () => {
            log.error(`[Printer TCP] Timeout connecting to ${ip}:${port}`);
            finish({ success: false, error: `Timeout: no se pudo conectar a ${ip}:${port}` });
        });

        socket.on('error', (err) => {
            log.error(`[Printer TCP] Error: ${err.message}`);
            finish({ success: false, error: err.message });
        });

        socket.connect(port, ip, () => {
            log.info(`[Printer TCP] Connected to ${ip}:${port}, sending ${data.length} bytes`);
            socket.write(data, () => {
                // Give the printer time to process before closing
                setTimeout(() => {
                    finish({ success: true });
                }, 500);
            });
        });
    });
}

// ─── USB: Resolve printer name from port name ──────────────────────────────

/**
 * On Windows, the address might be a port name (e.g. "USB003") instead of
 * the driver name (e.g. "80mm Series Printer"). This resolves it.
 */
async function resolveWindowsPrinterName(nameOrPort: string): Promise<string> {
    if (process.platform !== 'win32') return nameOrPort;

    // If it looks like a port name (USBnnn, LPTn, COMn), resolve to driver name
    if (/^(USB|LPT|COM)\d+$/i.test(nameOrPort)) {
        const printers = await getSystemPrinters();
        const match = printers.find(p => p.portName?.toUpperCase() === nameOrPort.toUpperCase());
        if (match) {
            log.info(`[Printer USB] Resolved port "${nameOrPort}" → printer "${match.name}"`);
            return match.name;
        }
        log.warn(`[Printer USB] Could not resolve port "${nameOrPort}" to a printer name`);
    }
    return nameOrPort;
}

// ─── USB Printer (via system driver name) ───────────────────────────────────

export async function printViaUSB(
    printerName: string,
    data: Buffer
): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform;
    const tmpFile = require('path').join(os.tmpdir(), `optimapos-ticket-${Date.now()}.bin`);

    // Resolve port names (USB003) to driver names (80mm Series Printer)
    let resolvedName: string;
    try {
        resolvedName = await resolveWindowsPrinterName(printerName);
    } catch (err: any) {
        return { success: false, error: `Error resolviendo nombre de impresora: ${err.message}` };
    }

    return new Promise((resolve) => {

        // Write binary data to temp file
        try {
            require('fs').writeFileSync(tmpFile, data);
        } catch (err: any) {
            return resolve({ success: false, error: `Error escribiendo archivo temporal: ${err.message}` });
        }

        log.info(`[Printer USB] Sending raw data to "${resolvedName}" (${data.length} bytes)`);

        if (platform === 'win32') {
            // Windows: Write a temp .ps1 script that uses Spooler API with RAW datatype
            const psScript = require('path').join(os.tmpdir(), `optimapos-rawprint-${Date.now()}.ps1`);
            const escapedPrinter = resolvedName.replace(/'/g, "''");
            const escapedFile = tmpFile.replace(/'/g, "''");

            const csCode = [
                'using System;',
                'using System.Runtime.InteropServices;',
                'public class RawPrint {',
                '  [StructLayout(LayoutKind.Sequential)] public struct DOCINFOA {',
                '    [MarshalAs(UnmanagedType.LPStr)] public string N;',
                '    [MarshalAs(UnmanagedType.LPStr)] public string O;',
                '    [MarshalAs(UnmanagedType.LPStr)] public string D;',
                '  }',
                '  [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string p,out IntPtr h,IntPtr d);',
                '  [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h,int l,ref DOCINFOA di);',
                '  [DllImport("winspool.drv",SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);',
                '  [DllImport("winspool.drv",SetLastError=true)] public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);',
                '  [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);',
                '  [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);',
                '  [DllImport("winspool.drv",SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);',
                '  public static bool Send(string name, byte[] data) {',
                '    IntPtr h; DOCINFOA di = new DOCINFOA(); di.N = "OptimaPOS"; di.D = "RAW";',
                '    if (!OpenPrinter(name, out h, IntPtr.Zero)) return false;',
                '    if (!StartDocPrinter(h, 1, ref di)) { ClosePrinter(h); return false; }',
                '    if (!StartPagePrinter(h)) { EndDocPrinter(h); ClosePrinter(h); return false; }',
                '    IntPtr p = Marshal.AllocCoTaskMem(data.Length); Marshal.Copy(data, 0, p, data.Length); int w;',
                '    bool ok = WritePrinter(h, p, data.Length, out w); Marshal.FreeCoTaskMem(p);',
                '    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h); return ok;',
                '  }',
                '}',
            ].join('\r\n');

            // Write C# code to a temp .cs file, then reference it from the script
            const csFile = require('path').join(os.tmpdir(), `optimapos-rawprint-${Date.now()}.cs`);
            try {
                require('fs').writeFileSync(csFile, csCode, 'utf-8');
            } catch (err: any) {
                return resolve({ success: false, error: `Error writing cs file: ${err.message}` });
            }

            const scriptLines = [
                '$csCode = [System.IO.File]::ReadAllText(\'' + csFile.replace(/'/g, "''") + '\')',
                'Add-Type -TypeDefinition $csCode',
                '$ok = [RawPrint]::Send(\'' + escapedPrinter + '\', [System.IO.File]::ReadAllBytes(\'' + escapedFile + '\'))',
                'if (-not $ok) { exit 1 }',
            ];
            const scriptContent = scriptLines.join('\r\n');
            try {
                require('fs').writeFileSync(psScript, scriptContent, 'utf-8');
            } catch (err: any) {
                return resolve({ success: false, error: `Error writing script: ${err.message}` });
            }

            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`, { timeout: 15000 }, (error, _stdout, stderr) => {
                try { require('fs').unlinkSync(psScript); } catch {}
                try { require('fs').unlinkSync(csFile); } catch {}
                try { require('fs').unlinkSync(tmpFile); } catch {}

                if (error) {
                    log.error(`[Printer USB] Error: ${error.message}`);
                    resolve({ success: false, error: stderr || error.message });
                } else {
                    log.info('[Printer USB] RAW print job sent successfully');
                    resolve({ success: true });
                }
            });
        } else {
            // macOS / Linux: use lp with raw option
            const cmd = `lp -d "${resolvedName}" -o raw "${tmpFile}"`;

            exec(cmd, { timeout: 15000 }, (error, _stdout, stderr) => {
                try { require('fs').unlinkSync(tmpFile); } catch {}

                if (error) {
                    log.error(`[Printer USB] Error: ${error.message}`);
                    resolve({ success: false, error: stderr || error.message });
                } else {
                    log.info('[Printer USB] RAW print job sent successfully');
                    resolve({ success: true });
                }
            });
        }
    });
}

// ─── Network Scanner (detect printers on port 9100) ────────────────────────

function getLocalSubnet(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name];
        if (!iface) continue;
        for (const info of iface) {
            if (info.family === 'IPv4' && !info.internal && info.address.startsWith('192.168.')) {
                // Return the subnet prefix (e.g., "192.168.18")
                const parts = info.address.split('.');
                return `${parts[0]}.${parts[1]}.${parts[2]}`;
            }
        }
    }
    return null;
}

function scanPort(ip: string, port: number, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const done = (open: boolean) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve(open);
        };

        socket.setTimeout(timeout);
        socket.on('connect', () => done(true));
        socket.on('timeout', () => done(false));
        socket.on('error', () => done(false));
        socket.connect(port, ip);
    });
}

export interface DiscoveredPrinter {
    ip: string;
    port: number;
    mac?: string;
    hostname?: string;
}

export async function scanNetworkPrinters(
    port = 9100,
    timeout = 300,
    onProgress?: (current: number, total: number) => void
): Promise<DiscoveredPrinter[]> {
    const subnet = getLocalSubnet();
    if (!subnet) {
        log.warn('[Scanner] Could not determine local subnet');
        return [];
    }

    log.info(`[Scanner] Scanning ${subnet}.1-254 on port ${port}...`);
    const found: DiscoveredPrinter[] = [];
    const total = 254;

    // Scan in batches of 20 for performance
    const batchSize = 20;
    for (let start = 1; start <= 254; start += batchSize) {
        const batch: Promise<void>[] = [];
        for (let i = start; i < start + batchSize && i <= 254; i++) {
            const ip = `${subnet}.${i}`;
            batch.push(
                scanPort(ip, port, timeout).then((open) => {
                    if (open) {
                        log.info(`[Scanner] Found printer at ${ip}:${port}`);
                        found.push({ ip, port });
                    }
                })
            );
        }
        await Promise.all(batch);
        if (onProgress) {
            onProgress(Math.min(start + batchSize - 1, 254), total);
        }
    }

    log.info(`[Scanner] Scan complete. Found ${found.length} printer(s)`);
    return found;
}

// ─── System Printer List (USB/installed printers) ───────────────────────────

export interface SystemPrinter {
    name: string;
    isDefault: boolean;
    portName?: string;
}

export function getSystemPrinters(): Promise<SystemPrinter[]> {
    return new Promise((resolve) => {
        const platform = process.platform;

        if (platform === 'win32') {
            exec(
                'powershell -Command "Get-WmiObject Win32_Printer | Select-Object Name, PortName, Default | ConvertTo-Json"',
                { timeout: 10000 },
                (error, stdout) => {
                    if (error) {
                        log.error('[Printers] Windows list error:', error.message);
                        return resolve([]);
                    }
                    try {
                        let data = JSON.parse(stdout);
                        if (!Array.isArray(data)) data = [data];
                        const printers: SystemPrinter[] = data
                            .filter((p: any) => p.Name)
                            .map((p: any) => ({
                                name: p.Name,
                                isDefault: p.Default === true,
                                portName: p.PortName || undefined,
                            }));
                        resolve(printers);
                    } catch {
                        resolve([]);
                    }
                }
            );
        } else if (platform === 'darwin') {
            exec('lpstat -p -d', { timeout: 5000 }, (error, stdout) => {
                if (error) {
                    log.error('[Printers] macOS list error:', error.message);
                    return resolve([]);
                }
                const printers: SystemPrinter[] = [];
                const defaultMatch = stdout.match(/system default destination: (.+)/);
                const defaultName = defaultMatch ? defaultMatch[1].trim() : '';

                const lines = stdout.split('\n');
                for (const line of lines) {
                    const match = line.match(/^printer\s+(\S+)/);
                    if (match) {
                        printers.push({
                            name: match[1],
                            isDefault: match[1] === defaultName,
                        });
                    }
                }
                resolve(printers);
            });
        } else {
            // Linux
            exec('lpstat -p -d 2>/dev/null', { timeout: 5000 }, (error, stdout) => {
                if (error) {
                    log.error('[Printers] Linux list error:', error.message);
                    return resolve([]);
                }
                const printers: SystemPrinter[] = [];
                const defaultMatch = stdout.match(/system default destination: (.+)/);
                const defaultName = defaultMatch ? defaultMatch[1].trim() : '';

                const lines = stdout.split('\n');
                for (const line of lines) {
                    const match = line.match(/^printer\s+(\S+)/);
                    if (match) {
                        printers.push({
                            name: match[1],
                            isDefault: match[1] === defaultName,
                        });
                    }
                }
                resolve(printers);
            });
        }
    });
}

// ─── Test Print (prints a test ticket) ──────────────────────────────────────

export function buildTestTicket(storeName = 'OptimaPOS'): Buffer {
    const now = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
    const width = 48; // 80mm = 48 chars
    const sep = '─'.repeat(width);

    const lines: Buffer[] = [
        CMD.INIT,
        CMD.ALIGN_CENTER,
        CMD.BOLD_ON,
        CMD.DOUBLE_SIZE,
        Buffer.from(`${storeName}\n`, 'utf-8'),
        CMD.NORMAL_SIZE,
        CMD.BOLD_OFF,
        Buffer.from('\n', 'utf-8'),
        CMD.ALIGN_CENTER,
        CMD.BOLD_ON,
        Buffer.from('TICKET DE PRUEBA\n', 'utf-8'),
        CMD.BOLD_OFF,
        Buffer.from(`${sep}\n`, 'utf-8'),
        CMD.ALIGN_LEFT,
        Buffer.from(`Fecha: ${now}\n`, 'utf-8'),
        Buffer.from(`Impresora: Conectada OK\n`, 'utf-8'),
        Buffer.from(`Ancho: 80mm (${width} chars)\n`, 'utf-8'),
        Buffer.from(`${sep}\n`, 'utf-8'),
        Buffer.from('\n', 'utf-8'),
        CMD.ALIGN_CENTER,
        Buffer.from('Caracteres especiales:\n', 'utf-8'),
        CMD.ALIGN_LEFT,
        Buffer.from('aeiou AEIOU 0123456789\n', 'utf-8'),
        Buffer.from('S/ 100.50  $25.00  @#%&\n', 'utf-8'),
        Buffer.from(`${sep}\n`, 'utf-8'),
        Buffer.from('\n', 'utf-8'),
        CMD.ALIGN_CENTER,
        CMD.BOLD_ON,
        Buffer.from('Impresion correcta!\n', 'utf-8'),
        CMD.BOLD_OFF,
        Buffer.from('www.optimapos.com\n', 'utf-8'),
        CMD.FEED_LINES(4),
        CMD.CUT_PARTIAL,
    ];

    return Buffer.concat(lines);
}

// ─── Build ESC/POS from text ────────────────────────────────────────────────

export function textToEscPos(text: string): Buffer {
    const lines = text.split('\n');
    const buffers: Buffer[] = [CMD.INIT];

    for (const line of lines) {
        // Parse style annotations like [FONT:A STYLE:b SIZE:2x1 ALIGN:CT]
        let cleanLine = line;
        const styleMatch = line.match(/\[FONT:(\w)\s*STYLE:([\w,]*)\s*SIZE:(\d)x(\d)(?:\s*ALIGN:(\w+))?\]/);

        if (styleMatch) {
            cleanLine = line.replace(/\[FONT:\w\s*STYLE:[\w,]*\s*SIZE:\d+x\d+(?:\s*ALIGN:\w+)?\]/, '').trim();
            const font = styleMatch[1];
            const style = styleMatch[2];
            const scaleW = parseInt(styleMatch[3]);
            const scaleH = parseInt(styleMatch[4]);
            const align = styleMatch[5]; // LT, CT, RT

            // Font
            buffers.push(font === 'B' ? CMD.FONT_B : CMD.FONT_A);

            // Bold
            buffers.push(style.includes('b') ? CMD.BOLD_ON : CMD.BOLD_OFF);

            // Underline
            buffers.push(style.includes('u') ? CMD.UNDERLINE_ON : CMD.UNDERLINE_OFF);

            // Size
            const sizeCode = ((scaleW - 1) << 4) | (scaleH - 1);
            buffers.push(Buffer.from([GS, 0x21, sizeCode]));

            // Explicit alignment from tag
            if (align === 'CT') {
                buffers.push(CMD.ALIGN_CENTER);
            } else if (align === 'RT') {
                buffers.push(CMD.ALIGN_RIGHT);
            } else if (align === 'LT') {
                buffers.push(CMD.ALIGN_LEFT);
            }
        }

        // Inline alignment overrides (e.g. [SIZE:2x2] or [STYLE:b] without full tag)
        const inlineSize = cleanLine.match(/\[SIZE:(\d)x(\d)\]/);
        if (inlineSize) {
            cleanLine = cleanLine.replace(/\[SIZE:\d+x\d+\]/, '').trim();
            const sw = parseInt(inlineSize[1]);
            const sh = parseInt(inlineSize[2]);
            buffers.push(Buffer.from([GS, 0x21, ((sw - 1) << 4) | (sh - 1)]));
        }

        const inlineStyle = cleanLine.match(/\[STYLE:(\w+)\]/);
        if (inlineStyle) {
            cleanLine = cleanLine.replace(/\[STYLE:\w+\]/, '').trim();
            buffers.push(inlineStyle[1].includes('b') ? CMD.BOLD_ON : CMD.BOLD_OFF);
        }

        const inlineFont = cleanLine.match(/\[FONT:(\w)\]/);
        if (inlineFont) {
            cleanLine = cleanLine.replace(/\[FONT:\w\]/, '').trim();
            buffers.push(inlineFont[1] === 'B' ? CMD.FONT_B : CMD.FONT_A);
        }

        // Fallback alignment heuristic (only if no explicit align was set)
        if (!styleMatch && cleanLine.trim().length > 0) {
            const trimmed = cleanLine.trimStart();
            const leadingSpaces = cleanLine.length - trimmed.length;
            const totalLen = cleanLine.trim().length;

            if (leadingSpaces > 10 && leadingSpaces > totalLen * 0.3) {
                buffers.push(CMD.ALIGN_CENTER);
            } else if (leadingSpaces > 30) {
                buffers.push(CMD.ALIGN_RIGHT);
            } else {
                buffers.push(CMD.ALIGN_LEFT);
            }
        }

        buffers.push(Buffer.from(cleanLine + '\n', 'utf-8'));
    }

    // Reset and cut
    buffers.push(CMD.NORMAL_SIZE);
    buffers.push(CMD.BOLD_OFF);
    buffers.push(CMD.ALIGN_LEFT);
    buffers.push(CMD.FEED_LINES(3));
    buffers.push(CMD.CUT_PARTIAL);

    return Buffer.concat(buffers);
}

// ─── TCP Connection Test ────────────────────────────────────────────────────

export function testTCPConnection(
    ip: string,
    port: number,
    timeout = 3000
): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const done = (result: { success: boolean; error?: string }) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeout);
        socket.on('connect', () => done({ success: true }));
        socket.on('timeout', () => done({ success: false, error: 'Timeout de conexión' }));
        socket.on('error', (err) => done({ success: false, error: err.message }));
        socket.connect(port, ip);
    });
}
