import { Printer, PrintRule, TicketTemplate } from '../types/printer-config';
import { Order } from '../types/order';

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net';

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function fetchPrinters(token: string): Promise<Printer[]> {
    const res = await fetch(`${API_BASE}/api/printer-config/printers`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al obtener impresoras`);
    return res.json();
}

export async function fetchRules(token: string): Promise<PrintRule[]> {
    const res = await fetch(`${API_BASE}/api/printer-config/rules`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al obtener reglas`);
    return res.json();
}

export async function fetchTemplate(token: string, templateId: number): Promise<TicketTemplate> {
    const res = await fetch(`${API_BASE}/api/printer-config/templates/${templateId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status} al obtener template`);
    return res.json();
}

// ─── Rule Matching ────────────────────────────────────────────────────────────

/**
 * Finds the matching print rules for a given order and printer.
 * Returns the template IDs to use for rendering.
 */
export function matchRulesForOrder(
    rules: PrintRule[],
    printerId: number,
    order: Order
): PrintRule[] {
    return rules.filter((rule) => {
        // Must be active and for our printer
        if (!rule.isActive) return false;
        if (rule.printerId !== printerId) return false;

        // Must include ORDER_CREATED event
        if (!rule.events.includes('ORDER_CREATED')) return false;

        // Evaluate conditions
        if (rule.conditions) {
            // Check order type condition
            if (rule.conditions.type && rule.conditions.type !== order.type) {
                return false;
            }
            // Category conditions can be checked in the future when item categories are available
        }

        return true;
    });
}

// ─── Local PrinterId Storage (via Electron IPC) ──────────────────────────────

export async function getStoredPrinterId(): Promise<number | null> {
    if (window.electronAPI?.getPrinterId) {
        return window.electronAPI.getPrinterId();
    }
    // Fallback to localStorage
    const stored = localStorage.getItem('kds_printer_id');
    return stored ? parseInt(stored, 10) : null;
}

export async function storePrinterId(printerId: number | null): Promise<void> {
    if (window.electronAPI?.storePrinterId) {
        await window.electronAPI.storePrinterId(printerId);
        return;
    }
    // Fallback to localStorage
    if (printerId !== null) {
        localStorage.setItem('kds_printer_id', String(printerId));
    } else {
        localStorage.removeItem('kds_printer_id');
    }
}
