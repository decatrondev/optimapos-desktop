/**
 * ESC/POS Binary Renderer
 *
 * Converts a TicketTemplate + data directly into raw ESC/POS bytes.
 * No intermediate text — outputs number[] ready for the printer.
 */

import { TicketTemplate, TemplateElement } from '../types/printer-config';
import { Order, OrderItem } from '../types/order';

// ─── ESC/POS Constants ──────────────────────────────────────────────────────

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;
const NUL = 0x00;

// ─── Command Builders ───────────────────────────────────────────────────────

const cmd = {
    init:         [ESC, 0x40],
    cutPartial:   [GS, 0x56, 0x01],
    cutFull:      [GS, 0x56, 0x00],
    alignLeft:    [ESC, 0x61, 0x00],
    alignCenter:  [ESC, 0x61, 0x01],
    alignRight:   [ESC, 0x61, 0x02],
    boldOn:       [ESC, 0x45, 0x01],
    boldOff:      [ESC, 0x45, 0x00],
    underlineOn:  [ESC, 0x2D, 0x01],
    underlineOff: [ESC, 0x2D, 0x00],
    invertOn:     [GS, 0x42, 0x01],
    invertOff:    [GS, 0x42, 0x00],
    fontA:        [ESC, 0x4D, 0x00],
    fontB:        [ESC, 0x4D, 0x01],
    normalSize:   [GS, 0x21, 0x00],
    feedLines:    (n: number) => [ESC, 0x64, n],
    // Size: scaleW (1-4) x scaleH (1-4) → GS ! n
    size:         (w: number, h: number) => [GS, 0x21, ((Math.min(w, 4) - 1) << 4) | (Math.min(h, 4) - 1)],
};

// ─── Text Encoding ──────────────────────────────────────────────────────────

function textBytes(text: string): number[] {
    const buf: number[] = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 128) {
            buf.push(code);
        } else {
            // Basic Latin-1 supplement (accented chars)
            // ESC/POS typically uses CP437 or CP858 — map common Spanish chars
            const map: Record<number, number> = {
                0xE1: 0xA0, // á
                0xE9: 0x82, // é
                0xED: 0xA1, // í
                0xF3: 0xA2, // ó
                0xFA: 0xA3, // ú
                0xF1: 0xA4, // ñ
                0xC1: 0x41, // Á → A
                0xC9: 0x45, // É → E
                0xCD: 0x49, // Í → I
                0xD3: 0x4F, // Ó → O
                0xDA: 0x55, // Ú → U
                0xD1: 0xA5, // Ñ
                0xBF: 0xA8, // ¿
                0xA1: 0xAD, // ¡
                0xFC: 0x81, // ü
                0xDC: 0x9A, // Ü
            };
            buf.push(map[code] || 0x3F); // ? for unknown
        }
    }
    return buf;
}

function line(text: string): number[] {
    return [...textBytes(text), LF];
}

// ─── Layout Helpers ─────────────────────────────────────────────────────────

function getLineWidth(templateWidth: number): number {
    return templateWidth === 80 ? 48 : 32;
}

function padRight(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : text + ' '.repeat(width - text.length);
}

function padCenter(text: string, width: number): string {
    if (text.length >= width) return text.substring(0, width);
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text;
}

function rowText(left: string, right: string, width: number): string {
    const gap = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(gap) + right;
}

function separatorLine(style: string | undefined, width: number): string {
    switch (style) {
        case 'solid': return '_'.repeat(width);
        case 'double': return '='.repeat(width);
        case 'stars': return '*'.repeat(width);
        default: return '-'.repeat(width);
    }
}

// ─── Style Application ──────────────────────────────────────────────────────

function applyStyle(el: TemplateElement): number[] {
    const bytes: number[] = [];

    // Alignment
    const align = el.align || 'left';
    if (align === 'center') bytes.push(...cmd.alignCenter);
    else if (align === 'right') bytes.push(...cmd.alignRight);
    else bytes.push(...cmd.alignLeft);

    // Font
    bytes.push(...(el.font === 'B' ? cmd.fontB : cmd.fontA));

    // Size
    const w = el.scaleW || 1;
    const h = el.scaleH || 1;
    bytes.push(...cmd.size(w, h));

    // Bold
    bytes.push(...(el.bold ? cmd.boldOn : cmd.boldOff));

    // Underline
    bytes.push(...(el.underline ? cmd.underlineOn : cmd.underlineOff));

    // Invert (reverse print)
    bytes.push(...(el.invert ? cmd.invertOn : cmd.invertOff));

    return bytes;
}

function resetStyle(): number[] {
    return [
        ...cmd.alignLeft,
        ...cmd.fontA,
        ...cmd.normalSize,
        ...cmd.boldOff,
        ...cmd.underlineOff,
        ...cmd.invertOff,
    ];
}

// ─── Variable Resolution ────────────────────────────────────────────────────

function resolveVars(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_m, key) => vars[key.trim()] ?? '');
}

function formatMoney(value: any): string {
    if (value == null) return '0.00';
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
}

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
    } catch { return ''; }
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' });
    } catch { return ''; }
}

function buildVarsFromOrder(order: any, storeName?: string): Record<string, string> {
    const v: Record<string, string> = {};
    v['tienda_nombre'] = storeName || '';
    v['tienda_ruc'] = ''; v['tienda_direccion'] = ''; v['tienda_telefono'] = ''; v['local_nombre'] = '';
    if (order) {
        v['pedido_codigo'] = order.code || '';
        v['pedido_fecha'] = order.createdAt ? formatDate(order.createdAt) : '';
        v['pedido_hora'] = order.createdAt ? formatTime(order.createdAt) : '';
        v['pedido_tipo'] = order.type === 'DELIVERY' ? 'Delivery' : order.type === 'DINE_IN' ? 'Mesa' : 'Recojo';
        v['pedido_mesa'] = order.tableNumber || order.table?.name || '';
        v['pedido_notas'] = order.notes || '';
        v['pedido_notas_staff'] = order.staffNotes || '';
        v['cliente_nombre'] = order.user?.name || order.clientName || order.guestName || 'Cliente';
        v['cliente_telefono'] = order.user?.phone || order.clientPhone || order.guestPhone || '';
        v['cliente_direccion'] = order.clientAddress || order.guestAddress || '';
        v['pago_metodo'] = order.paymentMethod || '';
        v['pago_estado'] = order.paymentStatus || '';
        v['subtotal'] = formatMoney(order.subtotal);
        v['descuento'] = formatMoney(order.discount);
        v['delivery_fee'] = formatMoney(order.deliveryFee);
        v['total'] = formatMoney(order.total);
        v['cajero_nombre'] = order.vendorName || '';
        v['mozo_nombre'] = '';
    }
    if ((order as any)?.cashRegister) {
        const c = (order as any).cashRegister;
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

function buildVarsFromData(data: Record<string, any>): Record<string, string> {
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

function getItemName(item: any): string {
    if (item.product) return item.product.name || item.productName || 'Producto';
    if (item.combo) return item.combo.name || 'Combo';
    if (item.variant) return item.variant.name || 'Variante';
    return item.productName || 'Producto';
}

// ─── Image Rendering (Raster Bitmap) ────────────────────────────────────────

async function loadImageAsMonoBitmap(
    src: string,
    serverUrl: string,
    templateWidth: number,
    imageSize?: number
): Promise<number[] | null> {
    try {
        let url = src;
        if (url.startsWith('/')) url = serverUrl + url;

        // Load image using browser Image + Canvas
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = url;
        });

        const maxDots = templateWidth === 80 ? 576 : 384;
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        // Use imageSize as target height (same as web preview pixel height)
        // Scale proportionally, then cap to paper width
        const targetHeight = imageSize || 64;
        // Convert web px to printer dots: ~3 dots per CSS px gives a good match
        const targetDots = Math.round(targetHeight * 3);

        if (h > 0) {
            const scale = targetDots / h;
            w = Math.round(w * scale);
            h = targetDots;
        }

        // Cap to paper width
        if (w > maxDots) {
            h = Math.round(h * (maxDots / w));
            w = maxDots;
        }

        // Width must be multiple of 8
        w = Math.floor(w / 8) * 8;
        if (w === 0 || h === 0) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // White background, draw image
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const pixels = imageData.data;

        // Convert to 1-bit monochrome (threshold)
        const bytesPerLine = w / 8;
        const bitmapData: number[] = [];

        for (let y = 0; y < h; y++) {
            for (let byteX = 0; byteX < bytesPerLine; byteX++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = byteX * 8 + bit;
                    const idx = (y * w + x) * 4;
                    const r = pixels[idx];
                    const g = pixels[idx + 1];
                    const b = pixels[idx + 2];
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    // 1 = black (print), 0 = white (no print)
                    if (gray < 128) {
                        byte |= (0x80 >> bit);
                    }
                }
                bitmapData.push(byte);
            }
        }

        // GS v 0 — raster bit image
        // Format: GS v 0 m xL xH yL yH d1...dk
        const xL = bytesPerLine & 0xFF;
        const xH = (bytesPerLine >> 8) & 0xFF;
        const yL = h & 0xFF;
        const yH = (h >> 8) & 0xFF;

        return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...bitmapData];
    } catch (e) {
        console.warn('[ESC/POS] Image render failed:', e);
        return null;
    }
}

// ─── QR Code ────────────────────────────────────────────────────────────────

function qrCodeBytes(data: string, sizeLabel: string): number[] {
    const bytes: number[] = [];
    const dataBytes = textBytes(data);
    const len = dataBytes.length + 3; // pL pH includes cn fn m

    // Model: QR Model 2
    bytes.push(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

    // Size (1-16)
    const sizeMap: Record<string, number> = { S: 3, M: 6, L: 10 };
    const moduleSize = sizeMap[sizeLabel] || 6;
    bytes.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize);

    // Error correction: M (49)
    bytes.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);

    // Store data
    const pL = len & 0xFF;
    const pH = (len >> 8) & 0xFF;
    bytes.push(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes);

    // Print
    bytes.push(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);

    return bytes;
}

// ─── Barcode ────────────────────────────────────────────────────────────────

function barcodeBytes(data: string, height?: number): number[] {
    const bytes: number[] = [];

    // Set barcode height (default 50 dots)
    bytes.push(GS, 0x68, Math.min(height || 50, 255));

    // Set barcode width (module size 2)
    bytes.push(GS, 0x77, 0x02);

    // HRI (human readable) below barcode
    bytes.push(GS, 0x48, 0x02);

    // Print CODE128 (type 73)
    const dataBytes = textBytes(data);
    bytes.push(GS, 0x6B, 0x49, dataBytes.length, ...dataBytes);

    return bytes;
}

// ─── Element Renderers ──────────────────────────────────────────────────────

/**
 * Get effective line width when text is scaled.
 * ESC/POS doubles character width per scaleW step, so fewer chars fit per line.
 */
function effectiveWidth(lw: number, scaleW: number): number {
    return Math.floor(lw / (scaleW || 1));
}

function renderHeader(el: TemplateElement, vars: Record<string, string>, lw: number): number[] {
    const content = resolveVars((el as any).content || '', vars);
    const ew = effectiveWidth(lw, el.scaleW || 1);
    const bytes: number[] = [...applyStyle(el)];
    // Wrap long text to effective width
    const wrapped = wrapText(content, ew);
    for (const l of wrapped) {
        bytes.push(...line(l));
    }
    bytes.push(...resetStyle());
    return bytes;
}

function renderText(el: TemplateElement, vars: Record<string, string>, lw: number): number[] {
    const content = resolveVars((el as any).content || '', vars);
    const ew = effectiveWidth(lw, el.scaleW || 1);
    const bytes: number[] = [...applyStyle(el)];
    const lines = content.split('\n');
    for (const l of lines) {
        const wrapped = wrapText(l, ew);
        for (const wl of wrapped) {
            bytes.push(...line(wl));
        }
    }
    bytes.push(...resetStyle());
    return bytes;
}

/** Wrap text to fit within a given character width.
 *  Tries word boundary first; if a single word exceeds maxWidth, cuts by letter. */
function wrapText(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0) return [text];
    if (text.length <= maxWidth) return [text];
    const result: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxWidth) {
            result.push(remaining);
            break;
        }
        let breakAt = remaining.lastIndexOf(' ', maxWidth);
        if (breakAt <= 0) {
            // No space — force cut at maxWidth (letter-level)
            breakAt = maxWidth;
            result.push(remaining.substring(0, breakAt));
            remaining = remaining.substring(breakAt);
        } else {
            result.push(remaining.substring(0, breakAt));
            remaining = remaining.substring(breakAt + 1); // skip the space
        }
    }
    return result;
}

function renderSeparator(el: TemplateElement, lw: number): number[] {
    const style = (el as any).separatorStyle || 'dashed';
    return [...cmd.alignLeft, ...line(separatorLine(style, lw))];
}

function renderSpacer(el: TemplateElement): number[] {
    const height = (el as any).spacerHeight || 1;
    return cmd.feedLines(Math.min(height, 10));
}

function renderCut(el: TemplateElement): number[] {
    const bytes: number[] = [...cmd.feedLines(3)];
    bytes.push(...((el as any).cutMode === 'full' ? cmd.cutFull : cmd.cutPartial));
    return bytes;
}

async function renderImage(
    el: TemplateElement,
    serverUrl: string,
    templateWidth: number
): Promise<number[]> {
    const src = (el as any).content || '';
    if (!src) return [];

    const align = el.align || 'center';
    const imageSize = (el as any).imageSize;
    const bytes: number[] = [];
    if (align === 'center') bytes.push(...cmd.alignCenter);
    else if (align === 'right') bytes.push(...cmd.alignRight);
    else bytes.push(...cmd.alignLeft);

    const imgBytes = await loadImageAsMonoBitmap(src, serverUrl, templateWidth, imageSize);
    if (imgBytes) {
        bytes.push(...imgBytes);
    }
    bytes.push(...cmd.alignLeft);
    return bytes;
}

function renderOrderInfo(el: TemplateElement, order: any, lw: number): number[] {
    if (!order) return [];
    const bytes: number[] = [...applyStyle(el)];

    const customerName = order.user?.name || order.clientName || order.guestName || 'Cliente';

    // Mesa in double size if showTable
    if ((el as any).showTable !== false && (order.tableNumber || order.table?.name)) {
        const mesaText = 'MESA: ' + (order.tableNumber || order.table?.name || '');
        bytes.push(...cmd.alignCenter, ...cmd.size(2, 2), ...cmd.boldOn);
        bytes.push(...line(mesaText));
        bytes.push(...cmd.normalSize, ...cmd.boldOff, LF);
        bytes.push(...applyStyle(el));
    }

    bytes.push(...line(rowText('Pedido:', '#' + (order.code || ''), lw)));
    bytes.push(...line(rowText('Fecha:', (order.createdAt ? formatDate(order.createdAt) + ' ' + formatTime(order.createdAt) : ''), lw)));
    bytes.push(...line(rowText('Cliente:', customerName, lw)));

    if (order.user?.phone || order.clientPhone || order.guestPhone) {
        bytes.push(...line(rowText('Tel:', (order.user?.phone || order.clientPhone || order.guestPhone), lw)));
    }
    if (order.clientAddress || order.guestAddress) {
        bytes.push(...line(rowText('Dir:', (order.clientAddress || order.guestAddress), lw)));
    }
    const tipo = order.type === 'DELIVERY' ? 'Delivery' : order.type === 'DINE_IN' ? 'Mesa' : 'Recojo';
    bytes.push(...line(rowText('Tipo:', tipo, lw)));

    if (order.notes) {
        bytes.push(...line('Nota: ' + order.notes));
    }

    bytes.push(...resetStyle());
    return bytes;
}

function renderItemsList(
    el: TemplateElement,
    order: any,
    currencySymbol: string,
    lw: number
): number[] {
    if (!order?.items) return [];
    const bytes: number[] = [...applyStyle(el)];
    const showPrices = (el as any).showPrices !== false;
    const showAddons = (el as any).showAddons !== false;

    // Header row
    bytes.push(...cmd.boldOn);
    if (showPrices) {
        bytes.push(...line(rowText('CANT. PRODUCTO', 'PRECIO', lw)));
    } else {
        bytes.push(...line('CANT. PRODUCTO'));
    }
    bytes.push(...line('-'.repeat(lw)));
    bytes.push(...cmd.boldOff);

    for (const item of order.items) {
        const name = getItemName(item);
        const qtyStr = item.quantity + ' x ' + name;

        if (showPrices) {
            const price = currencySymbol + formatMoney(item.totalPrice || item.unitPrice);
            // Truncate name if needed to fit price
            const maxNameLen = lw - price.length - 1;
            const truncated = qtyStr.length > maxNameLen ? qtyStr.substring(0, maxNameLen) : qtyStr;
            bytes.push(...line(rowText(truncated, price, lw)));
        } else {
            bytes.push(...line(qtyStr));
        }

        if (showAddons && item.addons?.length > 0) {
            for (const addon of item.addons) {
                const aName = addon.name || addon.addon?.name || '';
                let addonText = '  + ' + aName;
                if (addon.quantity > 1) addonText += ' x' + addon.quantity;
                if (showPrices && addon.price) {
                    addonText += ' ' + currencySymbol + formatMoney(addon.price);
                }
                bytes.push(...line(addonText));
            }
        }

        if (item.notes) {
            bytes.push(...line('  >> ' + item.notes));
        }
    }

    bytes.push(...resetStyle());
    return bytes;
}

function renderTotals(
    el: TemplateElement,
    order: any,
    currencySymbol: string,
    lw: number
): number[] {
    if (!order) return [];
    const bytes: number[] = [...applyStyle(el)];
    const showSubtotal = (el as any).showSubtotal !== false;
    const showDeliveryFee = (el as any).showDeliveryFee !== false;
    const showDiscount = (el as any).showDiscount !== false;

    bytes.push(...line('-'.repeat(lw)));

    if (showSubtotal) {
        bytes.push(...line(rowText('Subtotal:', currencySymbol + formatMoney(order.subtotal), lw)));
    }

    const deliveryFee = parseFloat(String(order.deliveryFee || 0));
    if (showDeliveryFee && deliveryFee > 0) {
        bytes.push(...line(rowText('Delivery:', currencySymbol + formatMoney(order.deliveryFee), lw)));
    }

    const discount = parseFloat(String(order.discount || 0));
    if (showDiscount && discount > 0) {
        bytes.push(...line(rowText('Descuento:', '-' + currencySymbol + formatMoney(order.discount), lw)));
    }

    bytes.push(...line('-'.repeat(lw)));
    bytes.push(...cmd.boldOn, ...cmd.size(2, 1));
    const totalLw = effectiveWidth(lw, 2);
    bytes.push(...line(rowText('TOTAL:', currencySymbol + formatMoney(order.total), totalLw)));
    bytes.push(...cmd.normalSize, ...cmd.boldOff);

    bytes.push(...resetStyle());
    return bytes;
}

function renderQrCode(el: TemplateElement, vars: Record<string, string>): number[] {
    const data = resolveVars((el as any).content || '', vars);
    if (!data) return [];

    const align = el.align || 'center';
    const bytes: number[] = [];
    if (align === 'center') bytes.push(...cmd.alignCenter);
    else if (align === 'right') bytes.push(...cmd.alignRight);
    else bytes.push(...cmd.alignLeft);

    bytes.push(...qrCodeBytes(data, (el as any).qrSize || 'M'));
    bytes.push(LF);
    bytes.push(...cmd.alignLeft);
    return bytes;
}

function renderBarcode(el: TemplateElement, vars: Record<string, string>): number[] {
    let data = resolveVars((el as any).content || '', vars);
    if (!data) return [];

    const align = el.align || 'center';
    const bytes: number[] = [];
    if (align === 'center') bytes.push(...cmd.alignCenter);
    else if (align === 'right') bytes.push(...cmd.alignRight);
    else bytes.push(...cmd.alignLeft);

    bytes.push(...barcodeBytes(data, (el as any).height));
    bytes.push(LF);
    bytes.push(...cmd.alignLeft);
    return bytes;
}

// ─── Main Renderer ──────────────────────────────────────────────────────────

export async function renderTemplateBinary(
    template: { width: number; content: any },
    order: any,
    vars: Record<string, string>,
    currencySymbol: string,
    serverUrl: string
): Promise<number[]> {
    const lw = getLineWidth(template.width);
    const elements: TemplateElement[] = template.content?.elements || [];
    const bytes: number[] = [...cmd.init];

    for (const el of elements) {
        switch (el.type) {
            case 'header':
                bytes.push(...renderHeader(el, vars, lw));
                break;
            case 'text':
                bytes.push(...renderText(el, vars, lw));
                break;
            case 'separator':
                bytes.push(...renderSeparator(el, lw));
                break;
            case 'spacer':
                bytes.push(...renderSpacer(el));
                break;
            case 'cut':
                bytes.push(...renderCut(el));
                break;
            case 'image':
            case 'logo':
                bytes.push(...await renderImage(el, serverUrl, template.width));
                break;
            case 'order_info':
                bytes.push(...renderOrderInfo(el, order, lw));
                break;
            case 'items_list':
                bytes.push(...renderItemsList(el, order, currencySymbol, lw));
                break;
            case 'totals':
                bytes.push(...renderTotals(el, order, currencySymbol, lw));
                break;
            case 'qr_code':
                bytes.push(...renderQrCode(el, vars));
                break;
            case 'barcode':
                bytes.push(...renderBarcode(el, vars));
                break;
            default:
                break;
        }
    }

    // If no cut element was included, add default feed + partial cut
    const hasCut = elements.some(e => e.type === 'cut');
    if (!hasCut) {
        bytes.push(...cmd.feedLines(4), ...cmd.cutPartial);
    }

    return bytes;
}

/**
 * Render a print job (from WebSocket) to raw ESC/POS bytes.
 */
export async function renderPrintJobBinary(
    job: { template: { width: number; content: any }; data: Record<string, any> },
    currencySymbol: string,
    serverUrl: string
): Promise<number[]> {
    const vars = buildVarsFromData(job.data);
    const order = job.data.order || null;
    return renderTemplateBinary(job.template, order, vars, currencySymbol, serverUrl);
}

/**
 * Render an order with a template to raw ESC/POS bytes.
 */
export async function renderOrderBinary(
    template: { width: number; content: any },
    order: any,
    currencySymbol: string,
    serverUrl: string,
    storeName?: string
): Promise<number[]> {
    const vars = buildVarsFromOrder(order, storeName);
    return renderTemplateBinary(template, order, vars, currencySymbol, serverUrl);
}
