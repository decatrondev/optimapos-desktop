import { Order, OrderItem } from '../types/order';
import { formatPrice, getItemName } from '../utils/format';

const LINE_WIDTH = 40;

function center(text: string): string {
    const pad = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
    return ' '.repeat(pad) + text;
}

function separator(char = '─'): string {
    return char.repeat(LINE_WIDTH);
}

function doubleSeparator(): string {
    return '═'.repeat(LINE_WIDTH);
}

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString('es-PE', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

export function formatTicket(order: Order, storeName: string, currencySymbol: string): string {
    const lines: string[] = [];

    // Header
    lines.push(doubleSeparator());
    lines.push(center(storeName.toUpperCase()));
    lines.push(center('TERMINAL DE COCINA'));
    lines.push(doubleSeparator());
    lines.push('');

    // Order info
    lines.push(`  Pedido:    #${order.code}`);
    lines.push(`  Tipo:      ${order.type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Recojo'}`);
    lines.push(`  Fecha:     ${formatDate(order.createdAt)}`);
    lines.push('');

    // Customer info
    const customerName = order.user?.name || order.guestName || 'Cliente';
    const customerPhone = order.user?.phone || order.guestPhone || '';
    lines.push(separator());
    lines.push('  CLIENTE');
    lines.push(separator());
    lines.push(`  Nombre:    ${customerName}`);
    if (customerPhone) lines.push(`  Teléfono:  ${customerPhone}`);
    if (order.guestAddress) lines.push(`  Dirección: ${order.guestAddress}`);
    if (order.zone) lines.push(`  Zona:      ${order.zone.name}`);
    lines.push('');

    // Items
    lines.push(separator());
    lines.push('  PRODUCTOS');
    lines.push(separator());

    for (const item of order.items) {
        const name = getItemName(item);
        const qty = item.quantity;
        const price = formatPrice(item.totalPrice, currencySymbol);
        lines.push(`  ${qty}x ${name}`);
        lines.push(`${' '.repeat(LINE_WIDTH - price.length - 2)}  ${price}`);

        // Addons
        for (const addon of item.addons) {
            const addonPrice = formatPrice(addon.price, currencySymbol);
            lines.push(`     + ${addon.addon.name} x${addon.quantity}`);
            lines.push(`${' '.repeat(LINE_WIDTH - addonPrice.length - 2)}  ${addonPrice}`);
        }

        // Notes
        if (item.notes) {
            lines.push(`     📝 ${item.notes}`);
        }
        lines.push('');
    }

    // Totals
    lines.push(doubleSeparator());
    const subtotalStr = formatPrice(order.subtotal, currencySymbol);
    const deliveryStr = formatPrice(order.deliveryFee, currencySymbol);
    const discountStr = formatPrice(order.discount, currencySymbol);
    const totalStr = formatPrice(order.total, currencySymbol);

    lines.push(`  Subtotal:${' '.repeat(LINE_WIDTH - 12 - subtotalStr.length)}${subtotalStr}`);

    const deliveryNum = typeof order.deliveryFee === 'string' ? parseFloat(order.deliveryFee) : order.deliveryFee;
    if (deliveryNum > 0) {
        lines.push(`  Delivery:${' '.repeat(LINE_WIDTH - 12 - deliveryStr.length)}${deliveryStr}`);
    }

    const discountNum = typeof order.discount === 'string' ? parseFloat(order.discount) : order.discount;
    if (discountNum > 0) {
        lines.push(`  Descuento:${' '.repeat(LINE_WIDTH - 13 - discountStr.length)}-${discountStr}`);
    }

    lines.push(separator());
    lines.push(`  TOTAL:${' '.repeat(LINE_WIDTH - 9 - totalStr.length)}${totalStr}`);
    lines.push(doubleSeparator());

    // Notes
    if (order.notes) {
        lines.push('');
        lines.push('  NOTAS:');
        lines.push(`  ${order.notes}`);
        lines.push(separator());
    }

    lines.push('');
    lines.push(center('*** NUEVO PEDIDO ***'));
    lines.push('');

    return lines.join('\n');
}

export async function printTicket(order: Order, storeName: string, currencySymbol: string): Promise<{ success: boolean; path?: string; error?: string }> {
    const ticketText = formatTicket(order, storeName, currencySymbol);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `ticket_${order.code}_${timestamp}.txt`;

    // Use Electron IPC if available, otherwise fallback to console
    if (window.electronAPI) {
        return window.electronAPI.printTicket(ticketText, fileName);
    } else {
        console.log('[Printer] Simulated ticket output:\n', ticketText);
        return { success: true, path: `console://${fileName}` };
    }
}

/**
 * Print a ticket using a dynamic template from the server.
 * Uses the ESC/POS renderer to interpret template elements.
 */
export async function printFromTemplate(
    order: Order,
    template: import('../types/printer-config').TicketTemplate,
    currencySymbol: string
): Promise<{ success: boolean; path?: string; error?: string }> {
    const { renderTemplate } = await import('./escpos-renderer');
    const ticketText = renderTemplate(template, order, currencySymbol);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `ticket_${order.code}_${template.name.replace(/\s+/g, '_')}_${timestamp}.txt`;

    if (window.electronAPI) {
        return window.electronAPI.printTicket(ticketText, fileName);
    } else {
        console.log(`[Printer] Template "${template.name}" output:\n`, ticketText);
        return { success: true, path: `console://${fileName}` };
    }
}

