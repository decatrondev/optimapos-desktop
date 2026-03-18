import { Order, OrderStatus } from '../types/order';

async function getServerUrl(): Promise<string> {
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        return config.serverUrl || '';
    }
    return import.meta.env.VITE_SOCKET_URL || '';
}

export async function fetchActiveOrders(token: string, locationId?: number): Promise<Order[]> {
    const serverUrl = await getServerUrl();
    const activeStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'ON_THE_WAY', 'READY_PICKUP'];
    const allOrders: Order[] = [];
    const locParam = locationId ? `&locationId=${locationId}` : '';

    const requests = activeStatuses.map(async (status) => {
        try {
            const res = await fetch(`${serverUrl}/api/orders?status=${status}${locParam}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.orders || []) as Order[];
        } catch {
            return [];
        }
    });

    const results = await Promise.all(requests);
    for (const orders of results) {
        allOrders.push(...orders);
    }

    return allOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

export function getNextStatus(current: OrderStatus, orderType: string): OrderStatus | null {
    switch (current) {
        case 'PENDING': return 'CONFIRMED';
        case 'CONFIRMED': return 'PREPARING';
        case 'PREPARING': return orderType === 'DELIVERY' ? 'ON_THE_WAY' : 'READY_PICKUP';
        case 'ON_THE_WAY': return 'DELIVERED';
        case 'READY_PICKUP': return 'DELIVERED';
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

export function getNextActionLabel(current: OrderStatus, orderType: string): string | null {
    switch (current) {
        case 'PENDING': return '✅ Confirmar';
        case 'CONFIRMED': return '🔥 Preparar';
        case 'PREPARING': return orderType === 'DELIVERY' ? '🛵 Enviar' : '📦 Listo';
        case 'ON_THE_WAY': return '✔️ Entregado';
        case 'READY_PICKUP': return '✔️ Entregado';
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
