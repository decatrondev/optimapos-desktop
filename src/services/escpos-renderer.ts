/**
 * ESC/POS Template Renderer V2
 *
 * Renders a TicketTemplate + Order into formatted text output.
 * Supports all 8 element types: header, text, image, separator,
 * order_info, items_list, totals, barcode.
 *
 * Style annotations are embedded for future real printer mapping:
 *   [FONT:A/B] [STYLE:b,u,i] [SIZE:WxH] [ALIGN:LT/CT/RT]
 */

import { TicketTemplate, TemplateElement } from '../types/printer-config';
import { Order, OrderItem } from '../types/order';

// ─── Config ───────────────────────────────────────────────────────────────────

function getLineWidth(templateWidth: number): number {
    return templateWidth === 80 ? 48 : 32;
}

// ─── Text Helpers ─────────────────────────────────────────────────────────────

function alignText(text: string, align: string | undefined, lineWidth: number): string {
    if (align === 'center') {
        const pad = Math.max(0, Math.floor((lineWidth - text.length) / 2));
        return ' '.repeat(pad) + text;
    }
    if (align === 'right') {
        const pad = Math.max(0, lineWidth - text.length);
        return ' '.repeat(pad) + text;
    }
    return text;
}

function rowText(left: string, right: string, lineWidth: number): string {
    const gap = Math.max(1, lineWidth - left.length - right.length);
    return left + ' '.repeat(gap) + right;
}

function sep(char: string, lineWidth: number): string {
    return char.repeat(lineWidth);
}

function formatPrice(value: string | number, symbol: string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${symbol}${num.toFixed(2)}`;
}

function getItemName(item: OrderItem): string {
    if (item.product) return item.product.name;
    if (item.combo) return item.combo.name;
    if (item.variant) return item.variant.name;
    return 'Producto';
}

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

// ─── Style Annotation ─────────────────────────────────────────────────────────

function styleTag(el: TemplateElement): string {
    const font = el.font || 'A';
    const styles: string[] = [];
    if (el.bold) styles.push('b');
    if (el.underline) styles.push('u');
    if (el.invert) styles.push('i');
    const w = el.scaleW || 1;
    const h = el.scaleH || 1;
    const alignMap: Record<string, string> = { left: 'LT', center: 'CT', right: 'RT' };
    return `[FONT:${font} STYLE:${styles.length ? styles.join(',') : 'normal'} SIZE:${w}x${h} ALIGN:${alignMap[el.align || 'left'] || 'LT'}]`;
}

const RESET = '[FONT:A STYLE:normal SIZE:1x1]';

// ─── Element Renderers ────────────────────────────────────────────────────────

function renderImage(el: TemplateElement, lineWidth: number): string[] {
    if (el.type !== 'image') return [];
    return [
        styleTag(el),
        `[IMAGE: ${el.content}]`,
        RESET,
    ];
}

function renderHeader(el: TemplateElement, lineWidth: number): string[] {
    if (el.type !== 'header') return [];
    const lines: string[] = [styleTag(el)];
    const text = el.content.toUpperCase();
    lines.push(alignText(text, el.align || 'center', lineWidth));
    lines.push(RESET);
    return lines;
}

function renderText(el: TemplateElement, lineWidth: number): string[] {
    if (el.type !== 'text') return [];
    const lines: string[] = [styleTag(el)];
    // Support \n for multiline
    const textLines = el.content.split('\n');
    for (const line of textLines) {
        lines.push(alignText(line, el.align, lineWidth));
    }
    lines.push(RESET);
    return lines;
}

function renderSeparator(el: TemplateElement, lineWidth: number): string[] {
    if (el.type !== 'separator') return [];
    const char = el.content || el.char || '-';
    return [sep(char, lineWidth)];
}

function renderOrderInfo(el: TemplateElement, order: Order, lineWidth: number): string[] {
    if (el.type !== 'order_info') return [];
    const lines: string[] = [styleTag(el)];

    const customerName = order.user?.name || order.guestName || 'Cliente';

    if (el.showTable) {
        lines.push('[SIZE:2x2]');
        lines.push(alignText('MESA: --', 'center', lineWidth));
        lines.push('[SIZE:1x1]');
    }

    lines.push(rowText('Pedido:', `#${order.code}`, lineWidth));
    lines.push(rowText('Fecha:', formatDate(order.createdAt), lineWidth));
    lines.push(rowText('Cliente:', customerName, lineWidth));

    if (order.user?.phone || order.guestPhone) {
        lines.push(rowText('Tel:', (order.user?.phone || order.guestPhone)!, lineWidth));
    }
    if (order.guestAddress) {
        lines.push(rowText('Dir:', order.guestAddress, lineWidth));
    }
    lines.push(rowText('Tipo:', order.type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Recojo', lineWidth));

    if (order.notes) {
        lines.push(`Nota: ${order.notes}`);
    }

    lines.push(RESET);
    return lines;
}

function renderItemsList(
    el: TemplateElement,
    order: Order,
    currencySymbol: string,
    lineWidth: number
): string[] {
    if (el.type !== 'items_list') return [];
    const lines: string[] = [styleTag(el)];

    const showPrices = el.showPrices !== false;
    const showAddons = el.showAddons !== false;

    if (el.font === 'B') lines.push('[FONT:B]');

    // Column headers
    lines.push('[STYLE:b]');
    if (showPrices) {
        lines.push(rowText('CANT. PRODUCTO', 'P.UNIT', lineWidth));
    } else {
        lines.push('CANT. PRODUCTO');
    }
    lines.push(sep('─', lineWidth));
    lines.push('[STYLE:normal]');

    for (const item of order.items) {
        const name = getItemName(item);
        const qtyStr = `${item.quantity} x ${name}`;

        if (showPrices) {
            const price = formatPrice(item.totalPrice, currencySymbol);
            lines.push(rowText(qtyStr, price, lineWidth));
        } else {
            lines.push(qtyStr);
        }

        if (showAddons && item.addons.length > 0) {
            for (const addon of item.addons) {
                let addonText = `  + ${addon.addon.name}`;
                if (addon.quantity > 1) addonText += ` x${addon.quantity}`;
                if (showPrices) {
                    addonText += ` ${formatPrice(addon.price, currencySymbol)}`;
                }
                lines.push(addonText);
            }
        }

        if (item.notes) {
            lines.push(`  >> ${item.notes}`);
        }
    }

    lines.push(RESET);
    return lines;
}

function renderTotals(
    el: TemplateElement,
    order: Order,
    currencySymbol: string,
    lineWidth: number
): string[] {
    if (el.type !== 'totals') return [];
    const lines: string[] = [styleTag(el)];

    const showSubtotal = !('showSubtotal' in el) || el.showSubtotal !== false;
    const showDeliveryFee = !('showDeliveryFee' in el) || el.showDeliveryFee !== false;
    const showDiscount = !('showDiscount' in el) || el.showDiscount !== false;

    if (showSubtotal) {
        lines.push(rowText('Subtotal:', formatPrice(order.subtotal, currencySymbol), lineWidth));
    }

    if (showDeliveryFee && order.type === 'DELIVERY' && parseFloat(String(order.deliveryFee)) > 0) {
        lines.push(rowText('Delivery:', formatPrice(order.deliveryFee, currencySymbol), lineWidth));
    }

    if (showDiscount && parseFloat(String(order.discount)) > 0) {
        lines.push(rowText('Descuento:', `-${formatPrice(order.discount, currencySymbol)}`, lineWidth));
    }

    lines.push(sep('─', lineWidth));
    lines.push('[SIZE:2x1 STYLE:b]');
    lines.push(rowText('TOTAL:', formatPrice(order.total, currencySymbol), lineWidth));
    lines.push(RESET);

    return lines;
}

function renderBarcode(el: TemplateElement, order: Order, lineWidth: number): string[] {
    if (el.type !== 'barcode') return [];
    const code = (el.content || '{code}').replace('{code}', order.code);
    const height = el.height || 50;
    return [
        styleTag(el),
        `[BARCODE: ${code} HEIGHT:${height}]`,
        RESET,
    ];
}

// ─── Variable Resolution ─────────────────────────────────────────────────────

function resolveVariables(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
        return vars[key.trim()] ?? '';
    });
}

function buildVariables(order: Order, storeName?: string): Record<string, string> {
    const vars: Record<string, string> = {};
    vars['tienda_nombre'] = storeName || '';
    vars['tienda_ruc'] = '';
    vars['tienda_direccion'] = '';
    vars['tienda_telefono'] = '';
    vars['local_nombre'] = '';

    if (order) {
        vars['pedido_codigo'] = order.code || '';
        vars['pedido_fecha'] = order.createdAt ? formatDate(order.createdAt) : '';
        vars['pedido_hora'] = order.createdAt ? new Date(order.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
        vars['pedido_tipo'] = order.type === 'DELIVERY' ? 'Delivery' : order.type === 'DINE_IN' ? 'Mesa' : 'Recojo';
        vars['pedido_mesa'] = (order as any).tableNumber || (order as any).table?.name || '';
        vars['pedido_notas'] = order.notes || '';
        vars['cliente_nombre'] = order.user?.name || order.guestName || 'Cliente';
        vars['cliente_telefono'] = order.user?.phone || order.guestPhone || '';
        vars['cliente_direccion'] = order.guestAddress || '';
        vars['pago_metodo'] = (order as any).paymentMethod || '';
        vars['subtotal'] = formatMoney(order.subtotal);
        vars['descuento'] = formatMoney(order.discount);
        vars['delivery_fee'] = formatMoney(order.deliveryFee);
        vars['total'] = formatMoney(order.total);
        vars['cajero_nombre'] = (order as any).vendorName || '';
    }

    vars['fecha_actual'] = formatDate(new Date().toISOString());
    return vars;
}

function buildVariablesFromData(data: Record<string, any>): Record<string, string> {
    const vars: Record<string, string> = {};
    vars['tienda_nombre'] = '';
    vars['tienda_ruc'] = '';
    vars['tienda_direccion'] = '';
    vars['tienda_telefono'] = '';
    vars['local_nombre'] = '';

    if (data.order) {
        const o = data.order;
        vars['pedido_codigo'] = o.code || '';
        vars['pedido_fecha'] = o.createdAt ? formatDate(o.createdAt) : '';
        vars['pedido_hora'] = o.createdAt ? new Date(o.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
        vars['pedido_tipo'] = o.type === 'DELIVERY' ? 'Delivery' : o.type === 'DINE_IN' ? 'Mesa' : 'Recojo';
        vars['pedido_mesa'] = o.tableNumber || '';
        vars['pedido_notas'] = o.notes || '';
        vars['cliente_nombre'] = o.clientName || o.guestName || '';
        vars['cliente_telefono'] = o.clientPhone || o.guestPhone || '';
        vars['cliente_direccion'] = o.clientAddress || o.guestAddress || '';
        vars['pago_metodo'] = o.paymentMethod || '';
        vars['subtotal'] = formatMoney(o.subtotal);
        vars['descuento'] = formatMoney(o.discount);
        vars['delivery_fee'] = formatMoney(o.deliveryFee);
        vars['total'] = formatMoney(o.total);
        vars['cajero_nombre'] = o.vendorName || '';
    }

    if (data.cashRegister) {
        const c = data.cashRegister;
        vars['caja_apertura'] = formatMoney(c.openingAmount);
        vars['caja_total'] = formatMoney(c.closingAmount);
        vars['caja_total_ventas'] = formatMoney(c.totalSales);
        vars['caja_num_ordenes'] = String(c.totalOrders || 0);
        vars['cajero_nombre'] = c.userName || vars['cajero_nombre'] || '';
        vars['local_nombre'] = c.locationName || '';
    }

    vars['fecha_actual'] = formatDate(new Date().toISOString());
    return vars;
}

function formatMoney(value: any): string {
    if (value == null) return '0.00';
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
}

// ─── Main Renderer ────────────────────────────────────────────────────────────

function renderElements(
    elements: TemplateElement[],
    order: Order | null,
    currencySymbol: string,
    lineWidth: number,
    vars: Record<string, string>
): string[] {
    const allLines: string[] = [];

    for (const rawEl of elements) {
        // Resolve variables in text/header content
        const el = { ...rawEl } as any;
        if (el.content && typeof el.content === 'string') {
            el.content = resolveVariables(el.content, vars);
        }

        let lines: string[] = [];
        const fakeOrder = order || ({} as Order);

        switch (el.type) {
            case 'image':
            case 'logo':
                lines = renderImage(el, lineWidth);
                break;
            case 'header':
                lines = renderHeader(el, lineWidth);
                break;
            case 'text':
                lines = renderText(el, lineWidth);
                break;
            case 'separator':
                lines = renderSeparator(el, lineWidth);
                break;
            case 'order_info':
                lines = renderOrderInfo(el, fakeOrder, lineWidth);
                break;
            case 'items_list':
                lines = renderItemsList(el, fakeOrder, currencySymbol, lineWidth);
                break;
            case 'totals':
                lines = renderTotals(el, fakeOrder, currencySymbol, lineWidth);
                break;
            case 'barcode':
                lines = renderBarcode(el, fakeOrder, lineWidth);
                break;
            case 'spacer':
                lines = ['\n'.repeat((el.spacerHeight || 1) - 1)];
                break;
            case 'cut':
                lines = ['[CUT]'];
                break;
            default:
                break;
        }

        allLines.push(...lines);
        allLines.push('');
    }

    return allLines;
}

export function renderTemplate(
    template: TicketTemplate,
    order: Order,
    currencySymbol: string
): string {
    const lineWidth = getLineWidth(template.width);
    const vars = buildVariables(order, '');
    const lines = renderElements(template.content.elements, order, currencySymbol, lineWidth, vars);
    return lines.join('\n');
}

/**
 * Render a print job (from WebSocket) to formatted ESC/POS text.
 * Uses job.data for variable resolution and job.template for layout.
 */
export function renderPrintJob(
    job: { template: { width: number; content: any }; data: Record<string, any> },
    currencySymbol: string
): string {
    const lineWidth = getLineWidth(job.template.width);
    const vars = buildVariablesFromData(job.data);
    const order = job.data.order || null;
    const elements = job.template.content?.elements || [];
    const lines = renderElements(elements, order, currencySymbol, lineWidth, vars);
    return lines.join('\n');
}
