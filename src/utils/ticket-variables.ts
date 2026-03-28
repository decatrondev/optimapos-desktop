/**
 * Shared ticket variable resolution — used by TicketPreview, escpos-renderer, and escpos-binary.
 * Replaces 3 duplicate resolveVariables + 4 duplicate buildVariables implementations.
 */

import { formatMoney } from './format';

// ─── Date/Time Helpers ─────────────────────────────────────────────────────

export function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
    } catch { return ''; }
}

export function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' });
    } catch { return ''; }
}

// ─── Variable Resolution ───────────────────────────────────────────────────

/** Replace {{variable}} placeholders in text. Unresolved vars return empty string. */
export function resolveVariables(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_m, key) => vars[key.trim()] ?? '');
}

/** Same as resolveVariables but unresolved vars keep their {{placeholder}} */
export function resolveVariablesKeepUnresolved(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => vars[key.trim()] ?? match);
}

// ─── Order Type Label ──────────────────────────────────────────────────────

function orderTypeLabel(type: string): string {
    if (type === 'DELIVERY') return 'Delivery';
    if (type === 'DINE_IN') return 'Mesa';
    return 'Recojo';
}

// ─── Build Variables from Order ────────────────────────────────────────────

export function buildVarsFromOrder(order: any, storeName?: string): Record<string, string> {
    const v: Record<string, string> = {};

    // Store
    v['tienda_nombre'] = storeName || '';
    v['tienda_ruc'] = '';
    v['tienda_direccion'] = '';
    v['tienda_telefono'] = '';
    v['local_nombre'] = '';

    if (order) {
        // Order
        v['pedido_codigo'] = order.code || '';
        v['pedido_fecha'] = order.createdAt ? formatDate(order.createdAt) : '';
        v['pedido_hora'] = order.createdAt ? formatTime(order.createdAt) : '';
        v['pedido_tipo'] = orderTypeLabel(order.type || '');
        v['pedido_mesa'] = order.tableNumber || order.table?.name || '';
        v['pedido_notas'] = order.notes || '';
        v['pedido_notas_staff'] = order.staffNotes || '';

        // Client
        v['cliente_nombre'] = order.user?.name || order.clientName || order.guestName || 'Cliente';
        v['cliente_telefono'] = order.user?.phone || order.clientPhone || order.guestPhone || '';
        v['cliente_direccion'] = order.clientAddress || order.guestAddress || '';

        // Payment
        v['pago_metodo'] = order.paymentMethod || '';
        v['pago_estado'] = order.paymentStatus || '';

        // Amounts
        v['subtotal'] = formatMoney(order.subtotal);
        v['descuento'] = formatMoney(order.discount);
        v['delivery_fee'] = formatMoney(order.deliveryFee);
        v['total'] = formatMoney(order.total);

        // Staff
        v['cajero_nombre'] = order.vendorName || '';
        v['mozo_nombre'] = '';
    }

    // Cash register (if attached to order)
    if (order?.cashRegister) {
        const c = order.cashRegister;
        v['caja_apertura'] = formatMoney(c.openingAmount);
        v['caja_total'] = formatMoney(c.closingAmount);
        v['caja_total_ventas'] = formatMoney(c.totalSales);
        v['caja_num_ordenes'] = String(c.totalOrders || 0);
        v['cajero_nombre'] = c.userName || v['cajero_nombre'] || '';
        v['local_nombre'] = c.locationName || '';
    }

    v['fecha_actual'] = formatDate(new Date().toISOString());
    return v;
}

// ─── Build Variables from Print Data (job payload) ─────────────────────────

export function buildVarsFromData(data: Record<string, any>): Record<string, string> {
    const v = buildVarsFromOrder(data.order, '');

    if (data.cashRegister) {
        const c = data.cashRegister;
        v['caja_apertura'] = formatMoney(c.openingAmount);
        v['caja_total'] = formatMoney(c.closingAmount);
        v['caja_total_ventas'] = formatMoney(c.totalSales);
        v['caja_num_ordenes'] = String(c.totalOrders || 0);
        v['cajero_nombre'] = c.userName || v['cajero_nombre'] || '';
        v['local_nombre'] = c.locationName || '';
    }

    if (data.tableChange) {
        v['mesa_anterior'] = data.tableChange.from || '';
        v['mesa_nueva'] = data.tableChange.to || '';
    }

    return v;
}
