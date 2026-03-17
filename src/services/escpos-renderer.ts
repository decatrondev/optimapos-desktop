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

// ─── Main Renderer ────────────────────────────────────────────────────────────

export function renderTemplate(
    template: TicketTemplate,
    order: Order,
    currencySymbol: string
): string {
    const lineWidth = getLineWidth(template.width);
    const allLines: string[] = [];

    for (const el of template.content.elements) {
        let lines: string[] = [];

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
                lines = renderOrderInfo(el, order, lineWidth);
                break;
            case 'items_list':
                lines = renderItemsList(el, order, currencySymbol, lineWidth);
                break;
            case 'totals':
                lines = renderTotals(el, order, currencySymbol, lineWidth);
                break;
            case 'barcode':
                lines = renderBarcode(el, order, lineWidth);
                break;
            default:
                break;
        }

        allLines.push(...lines);
        allLines.push('');
    }

    return allLines.join('\n');
}
