import { Order, OrderStatus } from '../types/order';
import { getServerUrl } from './api';

/** Get today's date string in Lima timezone (YYYY-MM-DD) */
function todayLima(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

export async function fetchActiveOrders(token: string, locationId?: number): Promise<Order[]> {
    const serverUrl = await getServerUrl();
    const activeStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'ON_THE_WAY', 'READY_PICKUP'];
    const allOrders: Order[] = [];
    const today = todayLima();
    const locParam = locationId ? `&locationId=${locationId}` : '';

    const requests = activeStatuses.map(async (status) => {
        try {
            const res = await fetch(`${serverUrl}/api/orders?status=${status}&from=${today}&to=${today}${locParam}&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.data || data.orders || []) as Order[];
        } catch (err) {
            console.warn(`[Orders] Fetch status=${status} failed:`, err);
            return [];
        }
    });

    const results = await Promise.all(requests);
    for (const orders of results) {
        allOrders.push(...orders);
    }

    return allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Fetch active kitchen orders — uses /api/orders/kitchen/active (requires kitchen_view:read) */
export async function fetchKitchenOrders(token: string, locationId?: number): Promise<Order[]> {
    const serverUrl = await getServerUrl();
    const locParam = locationId ? `?locationId=${locationId}` : '';
    try {
        const res = await fetch(`${serverUrl}/api/orders/kitchen/active${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (Array.isArray(data) ? data : []) as Order[];
    } catch (err) {
        console.warn('[Orders] Kitchen fetch failed:', err);
        return [];
    }
}

/** Fetch active delivery orders — uses /api/orders/delivery/active (requires delivery_view:read) */
export async function fetchDeliveryOrders(token: string, locationId?: number): Promise<Order[]> {
    const serverUrl = await getServerUrl();
    const locParam = locationId ? `?locationId=${locationId}` : '';
    try {
        const res = await fetch(`${serverUrl}/api/orders/delivery/active${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (Array.isArray(data) ? data : []) as Order[];
    } catch (err) {
        console.warn('[Orders] Delivery fetch failed:', err);
        return [];
    }
}

/** Update kitchen order status — uses /api/orders/kitchen/:id/status (requires kitchen_view:write) */
export async function updateKitchenStatus(orderId: number, status: string, token: string): Promise<void> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/kitchen/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
}

/** Update delivery order status — uses /api/orders/delivery/:id/status (requires delivery_view:write) */
export async function updateDeliveryStatus(orderId: number, status: string, token: string): Promise<void> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/delivery/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
}

/** Claim a delivery order (driver self-assigns) */
export async function claimDeliveryOrder(orderId: number, token: string): Promise<void> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/delivery/${orderId}/claim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
}

export async function updateOrderStatus(orderId: number, status: OrderStatus, token: string): Promise<void> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
    }
}

export function getNextStatus(current: OrderStatus, orderType: string, userRole?: string): OrderStatus | null {
    // KITCHEN: only PREPARING and READY transitions (never confirm, never deliver)
    if (userRole === 'KITCHEN') {
        if (current === 'CONFIRMED') return 'PREPARING';
        if (current === 'PREPARING') return 'READY_PICKUP';
        return null; // Kitchen can't confirm PENDING or deliver
    }

    // DELIVERY: only delivery-related transitions
    if (userRole === 'DELIVERY') {
        if (current === 'READY_PICKUP' && orderType === 'DELIVERY') return 'ON_THE_WAY';
        if (current === 'ON_THE_WAY') return 'DELIVERED';
        return null;
    }

    // VENDOR: only confirm orders (kitchen handles the rest)
    if (userRole === 'VENDOR') {
        if (current === 'PENDING') return 'CONFIRMED';
        return null;
    }

    // ADMIN/MANAGER: full transitions
    switch (current) {
        case 'PENDING': return 'CONFIRMED';
        case 'CONFIRMED': return 'PREPARING';
        case 'PREPARING': return 'READY_PICKUP'; // Always goes to READY first (cocina terminó)
        case 'READY_PICKUP':
            if (orderType === 'DINE_IN') return null; // DINE_IN must pay via close-table
            if (orderType === 'DELIVERY') return 'ON_THE_WAY'; // Motorizado sale
            return 'DELIVERED'; // PICKUP can deliver directly
        case 'ON_THE_WAY': return 'DELIVERED';
        default: return null;
    }
}

export function getStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
        PENDING: '⏳ Pendiente',
        CONFIRMED: '✅ Confirmado',
        PREPARING: '🔥 Preparando',
        ON_THE_WAY: '🛵 En camino',
        READY_PICKUP: '📦 Listo',
        DELIVERED: '✔️ Entregado',
        CANCELLED: '❌ Cancelado',
    };
    return labels[status] || status;
}

export function getNextActionLabel(current: OrderStatus, orderType: string, userRole?: string): string | null {
    // Use getNextStatus to determine if transition is allowed
    const next = getNextStatus(current, orderType, userRole);
    if (!next) {
        // Special case: DINE_IN at READY_PICKUP for ADMIN/MANAGER shows "Cobrar Mesa"
        if (current === 'READY_PICKUP' && orderType === 'DINE_IN' && (!userRole || ['ADMIN', 'MANAGER', 'VENDOR'].includes(userRole))) {
            return '💰 Cobrar Mesa';
        }
        return null;
    }

    switch (current) {
        case 'PENDING': return '✅ Confirmar';
        case 'CONFIRMED': return '🔥 Preparar';
        case 'PREPARING': return '📦 Listo';
        case 'READY_PICKUP':
            if (orderType === 'DELIVERY') return '🛵 En camino';
            return '✔️ Entregado';
        case 'ON_THE_WAY': return '✔️ Entregado';
        default: return null;
    }
}

export function getStatusColorClass(status: OrderStatus): string {
    switch (status) {
        case 'PENDING': return 'status--pending';
        case 'CONFIRMED': return 'status--confirmed';
        case 'PREPARING': return 'status--preparing';
        case 'ON_THE_WAY': return 'status--on-the-way';
        case 'READY_PICKUP': return 'status--ready';
        case 'DELIVERED': return 'status--delivered';
        case 'CANCELLED': return 'status--cancelled';
        default: return '';
    }
}
