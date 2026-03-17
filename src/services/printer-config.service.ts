import { Printer, PrintRule, TicketTemplate, DesktopConfig } from '../types/printer-config';
import { Order } from '../types/order';

async function getServerUrl(): Promise<string> {
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        return config.serverUrl || '';
    }
    return import.meta.env.VITE_SOCKET_URL || '';
}

// ─── Desktop API (uses API key, no JWT) ──────────────────────────────────────

export async function fetchDesktopConfig(apiKey: string, tenantSlug: string, locationId?: number): Promise<DesktopConfig> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/v1/desktop/config${params}`, {
        headers: {
            'X-Desktop-Key': apiKey,
            'X-Tenant-Id': tenantSlug,
        },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}

// ─── JWT-authenticated API (legacy, used during setup) ───────────────────────

export async function fetchPrinters(token: string): Promise<Printer[]> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/printer-config/printers`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}

export async function fetchRules(token: string): Promise<PrintRule[]> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/printer-config/rules`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}

export async function fetchTemplate(token: string, templateId: number): Promise<TicketTemplate> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/printer-config/templates/${templateId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return res.json();
}

// ─── Rule Matching ───────────────────────────────────────────────────────────

export function matchRulesForEvent(
    rules: PrintRule[],
    event: string,
    orderType?: string
): PrintRule[] {
    return rules.filter(rule => {
        if (!rule.isActive) return false;
        if (!rule.events.includes(event)) return false;
        if (rule.orderTypes.length > 0 && orderType && !rule.orderTypes.includes(orderType)) return false;
        return true;
    });
}

/** Legacy: match rules for a specific printer + ORDER_CREATED */
export function matchRulesForOrder(
    rules: PrintRule[],
    printerId: number,
    order: Order
): PrintRule[] {
    return rules.filter(rule => {
        if (!rule.isActive) return false;
        if (rule.printerId !== printerId) return false;
        if (!rule.events.includes('ORDER_CREATED')) return false;
        if (rule.orderTypes.length > 0 && !rule.orderTypes.includes(order.type)) return false;
        return true;
    });
}

// ─── Local Storage ───────────────────────────────────────────────────────────

export async function getStoredPrinterId(): Promise<number | null> {
    if (window.electronAPI?.getPrinterId) {
        return window.electronAPI.getPrinterId();
    }
    const stored = localStorage.getItem('op_printer_id');
    return stored ? parseInt(stored, 10) : null;
}

export async function storePrinterId(printerId: number | null): Promise<void> {
    if (window.electronAPI?.storePrinterId) {
        await window.electronAPI.storePrinterId(printerId);
        return;
    }
    if (printerId !== null) localStorage.setItem('op_printer_id', String(printerId));
    else localStorage.removeItem('op_printer_id');
}
