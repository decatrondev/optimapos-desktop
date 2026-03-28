/**
 * Shared formatting utilities — formatMoney, formatPrice, getItemName.
 * Replaces 7+ duplicate implementations across the codebase.
 */

import { CURRENCY_SYMBOL } from './constants';

/** Format a number to 2 decimal places (no currency symbol) */
export function formatMoney(value: number | string | null | undefined): string {
    if (value == null) return '0.00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
}

/** Format a number with currency symbol */
export function formatPrice(value: number | string | null | undefined, symbol = CURRENCY_SYMBOL): string {
    const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
    return `${symbol}${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

/** Get display name for an order item */
export function getItemName(item: {
    product?: { name?: string } | null;
    combo?: { name?: string } | null;
    variant?: { name?: string } | null;
    productName?: string;
}, options?: { comboEmoji?: boolean }): string {
    if (item.product?.name) return item.product.name;
    if (item.combo?.name) return options?.comboEmoji ? `🍽️ ${item.combo.name}` : item.combo.name;
    if (item.variant?.name) return item.variant.name;
    return item.productName || 'Producto';
}
