import { Order, OrderStatus } from '../types/order';

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net';

/**
 * Fetches active orders from the backend.
 * Endpoint: GET /api/orders?status=...
 * Response: { "orders": [...] }
 */
export async function fetchActiveOrders(token: string): Promise<Order[]> {
    const activeStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'ON_THE_WAY', 'READY_PICKUP'];
    const allOrders: Order[] = [];

    // Fetch each active status in parallel
    const requests = activeStatuses.map(async (status) => {
        try {
            const res = await fetch(`${API_BASE}/api/orders?status=${status}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.orders || []) as Order[];
        } catch (e) {
            console.warn(`[Orders] Failed to fetch ${status} orders:`, e);
            return [];
        }
    });

    const results = await Promise.all(requests);
    for (const orders of results) {
        allOrders.push(...orders);
    }

    // Sort by creation date (newest first)
    return allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Updates an order's status via the backend API.
 * Requires a valid JWT token.
 */
export async function updateOrderStatus(
    orderId: number,
    status: OrderStatus,
    token: string
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Error ${res.status} al actualizar estado`);
    }
}

/**
 * Kitchen status flow:
 * PENDING → CONFIRMED → PREPARING → READY_PICKUP / ON_THE_WAY → DELIVERED
 */
export function getNextStatus(current: OrderStatus, orderType: 'DELIVERY' | 'PICKUP'): OrderStatus | null {
    switch (current) {
        case 'PENDING':
            return 'CONFIRMED';
        case 'CONFIRMED':
            return 'PREPARING';
        case 'PREPARING':
            return orderType === 'DELIVERY' ? 'ON_THE_WAY' : 'READY_PICKUP';
        case 'ON_THE_WAY':
            return 'DELIVERED';
        case 'READY_PICKUP':
            return 'DELIVERED';
        default:
            return null; // DELIVERED or CANCELLED — no next step
    }
}

/**
 * Human-readable status labels in Spanish.
 */
export function getStatusLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
        PENDING: '⏳ Pendiente',
        CONFIRMED: '✅ Confirmado',
        PREPARING: '🔥 Preparando',
        ON_THE_WAY: '🛵 En camino',
        READY_PICKUP: '📦 Listo para recojo',
        DELIVERED: '✔️ Entregado',
        CANCELLED: '❌ Cancelado',
    };
    return labels[status] || status;
}

/**
 * Button label for advancing to the next status.
 */
export function getNextActionLabel(current: OrderStatus, orderType: 'DELIVERY' | 'PICKUP'): string | null {
    switch (current) {
        case 'PENDING':
            return '✅ Confirmar';
        case 'CONFIRMED':
            return '🔥 Empezar a Preparar';
        case 'PREPARING':
            return orderType === 'DELIVERY' ? '🛵 Enviar' : '📦 Listo para Recojo';
        case 'ON_THE_WAY':
            return '✔️ Entregado';
        case 'READY_PICKUP':
            return '✔️ Entregado';
        default:
            return null;
    }
}

/**
 * Status color class for visual feedback.
 */
export function getStatusColorClass(status: OrderStatus): string {
    switch (status) {
        case 'PENDING':
            return 'status--pending';
        case 'CONFIRMED':
            return 'status--confirmed';
        case 'PREPARING':
            return 'status--preparing';
        case 'ON_THE_WAY':
            return 'status--on-the-way';
        case 'READY_PICKUP':
            return 'status--ready';
        case 'DELIVERED':
            return 'status--delivered';
        case 'CANCELLED':
            return 'status--cancelled';
        default:
            return '';
    }
}
