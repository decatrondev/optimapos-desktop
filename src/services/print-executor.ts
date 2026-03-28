/**
 * Print Executor — Bridges template rendering with hardware printing.
 *
 * Flow: PrintJob → renderPrintJobBinary (ESC/POS bytes) → printerPrintTCP/USB → ack
 */

import { PrintJob } from '../types/printer-config';
import { renderPrintJobBinary, renderOrderBinary } from './escpos-binary';
import { socketService } from './socket.service';
import { getServerUrl } from './api';
import { CURRENCY_SYMBOL } from '../utils/constants';

export interface PrintResult {
    success: boolean;
    error?: string;
    jobId: string;
}

/**
 * Send raw bytes to a printer via TCP or USB.
 */
async function sendToPrinter(
    api: NonNullable<typeof window.electronAPI>,
    printer: { type: string; address: string; port?: number },
    data: number[]
): Promise<{ success: boolean; error?: string }> {
    if (printer.type === 'NETWORK') {
        return api.printerPrintTCP(printer.address, printer.port || 9100, data);
    } else if (printer.type === 'USB') {
        return api.printerPrintUSB(printer.address, data);
    }
    return { success: false, error: `Tipo no soportado: ${printer.type}` };
}

/**
 * Execute a print job: render template → raw bytes → send to printer → ack.
 */
export async function executePrintJob(job: PrintJob): Promise<PrintResult> {
    const { jobId, printer, rule } = job;
    const api = window.electronAPI;

    if (!api) {
        return { success: false, error: 'Electron API not available', jobId };
    }

    try {
        const serverUrl = await getServerUrl();

        // 1. Render template to raw ESC/POS bytes
        const data = await renderPrintJobBinary(job, CURRENCY_SYMBOL, serverUrl);
        console.log(`[PrintExecutor] Rendered job ${jobId} → ${data.length} bytes for "${printer.name}"`);

        // 2. Send to physical printer (N copies)
        const copies = Math.max(1, Math.min(rule.copies || 1, 5));

        for (let i = 0; i < copies; i++) {
            const result = await sendToPrinter(api, printer, data);

            if (!result.success) {
                console.error(`[PrintExecutor] Print failed (copy ${i + 1}/${copies}):`, result.error);
                socketService.ackPrintJob(jobId, 'error', result.error);
                return { success: false, error: result.error, jobId };
            }

            console.log(`[PrintExecutor] Printed copy ${i + 1}/${copies} on "${printer.name}"`);
        }

        // 3. Ack success to server
        socketService.ackPrintJob(jobId, 'printed');
        console.log(`[PrintExecutor] Job ${jobId} completed (${copies} copies)`);
        return { success: true, jobId };

    } catch (err: any) {
        console.error(`[PrintExecutor] Unexpected error for job ${jobId}:`, err);
        socketService.ackPrintJob(jobId, 'error', err.message);
        return { success: false, error: err.message, jobId };
    }
}

/**
 * Quick print: render an order with a template → raw bytes → send to printer.
 */
export async function quickPrint(
    template: { width: number; content: any },
    order: any,
    printer: { type: string; address: string; port?: number },
    copies = 1,
    storeName?: string
): Promise<{ success: boolean; error?: string }> {
    const api = window.electronAPI;
    if (!api) return { success: false, error: 'Electron API not available' };

    try {
        const serverUrl = await getServerUrl();
        const data = await renderOrderBinary(template, order, CURRENCY_SYMBOL, serverUrl, storeName);

        for (let i = 0; i < Math.min(copies, 5); i++) {
            const result = await sendToPrinter(api, printer, data);
            if (!result.success) return result;
        }

        return { success: true };
    } catch (err: any) {
        console.error('[PrintExecutor] Quick print failed:', err);
        return { success: false, error: err.message };
    }
}
