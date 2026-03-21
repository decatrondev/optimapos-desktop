/**
 * POS Service — API calls for the Point of Sale view.
 */

import { POSProduct, POSCategory, POSCombo, POSTable, POSZone, POSAddonGroup, OrderType } from '../types/order';

async function getServerUrl(): Promise<string> {
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        return config.serverUrl || '';
    }
    return '';
}

function authHeaders(token: string): HeadersInit {
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export async function fetchProducts(token: string, locationId?: number): Promise<POSProduct[]> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/products${params}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Products: ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.products || []).filter((p: any) => p.isActive);
}

export async function fetchCategories(token: string, locationId?: number): Promise<POSCategory[]> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/categories${params}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Categories: ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.categories || []).filter((c: any) => c.isActive);
}

export async function fetchCombos(token: string, locationId?: number): Promise<POSCombo[]> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/combos${params}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Combos: ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.combos || []).filter((c: any) => c.isActive);
}

export async function fetchAddonGroups(token: string, locationId?: number): Promise<POSAddonGroup[]> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/addons/groups${params}`, { headers: authHeaders(token) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

// ─── Tables ─────────────────────────────────────────────────────────────────

export async function fetchTables(token: string, locationId?: number): Promise<POSTable[]> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/tables${params}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`Tables: ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.tables || []).filter((t: any) => t.isActive);
}

export async function fetchTableOpenOrder(token: string, tableId: number): Promise<any | null> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/table/${tableId}/open`, { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.order || data || null;
}

// ─── Delivery Zones ─────────────────────────────────────────────────────────

export async function fetchZones(token: string, locationId?: number): Promise<{ zones: POSZone[]; basePrice: number }> {
    const serverUrl = await getServerUrl();
    const params = locationId ? `?locationId=${locationId}` : '';
    const res = await fetch(`${serverUrl}/api/zones${params}`, { headers: authHeaders(token) });
    if (!res.ok) return { zones: [], basePrice: 0 };
    const data = await res.json();
    return {
        zones: (data.zones || []).filter((z: any) => z.isActive),
        basePrice: parseFloat(data.basePrice || '0'),
    };
}

// ─── Discount Codes ─────────────────────────────────────────────────────────

export async function validatePromoCode(
    token: string,
    code: string,
    orderAmount: number,
    locationId?: number
): Promise<{ valid: boolean; discountCode?: any; error?: string }> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/discount-codes/validate`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ code, orderAmount, locationId }),
    });
    return res.json();
}

// ─── Order Creation ─────────────────────────────────────────────────────────

export interface CreatePOSOrderPayload {
    type: OrderType;
    tableId?: number;
    locationId?: number;
    guestName?: string;
    guestPhone?: string;
    guestAddress?: string;
    zoneId?: number;
    notes?: string;
    promoCode?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    items: {
        productId?: number;
        comboId?: number;
        variantId?: number;
        quantity: number;
        notes?: string;
        addons?: { addonId: number; quantity: number }[];
    }[];
}

export async function createPOSOrder(token: string, payload: CreatePOSOrderPayload): Promise<any> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/pos`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
    return res.json();
}

export async function addItemsToOrder(token: string, orderId: number, items: CreatePOSOrderPayload['items']): Promise<any> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/${orderId}/items`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ items }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
    return res.json();
}

export async function closeTableOrder(token: string, orderId: number, paymentMethod: string, promoCode?: string): Promise<any> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/${orderId}/close`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ paymentMethod, promoCode }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
    return res.json();
}
