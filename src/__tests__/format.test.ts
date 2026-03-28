import { describe, it, expect } from 'vitest';
import { formatMoney, formatPrice, getItemName } from '../utils/format';

describe('formatMoney', () => {
    it('formats numbers to 2 decimals', () => {
        expect(formatMoney(10)).toBe('10.00');
        expect(formatMoney(9.5)).toBe('9.50');
        expect(formatMoney(0.1 + 0.2)).toBe('0.30');
    });

    it('parses string values', () => {
        expect(formatMoney('25.5')).toBe('25.50');
        expect(formatMoney('0')).toBe('0.00');
    });

    it('handles null/undefined', () => {
        expect(formatMoney(null)).toBe('0.00');
        expect(formatMoney(undefined)).toBe('0.00');
    });

    it('handles NaN', () => {
        expect(formatMoney('abc')).toBe('0.00');
        expect(formatMoney(NaN)).toBe('0.00');
    });
});

describe('formatPrice', () => {
    it('formats with default currency symbol', () => {
        expect(formatPrice(10)).toBe('S/10.00');
        expect(formatPrice(0)).toBe('S/0.00');
    });

    it('formats with custom symbol', () => {
        expect(formatPrice(15.5, '$')).toBe('$15.50');
    });

    it('parses string values', () => {
        expect(formatPrice('25')).toBe('S/25.00');
    });

    it('handles null/undefined', () => {
        expect(formatPrice(null)).toBe('S/0.00');
        expect(formatPrice(undefined)).toBe('S/0.00');
    });
});

describe('getItemName', () => {
    it('returns product name', () => {
        expect(getItemName({ product: { name: 'Lomo Saltado' } })).toBe('Lomo Saltado');
    });

    it('returns combo name', () => {
        expect(getItemName({ combo: { name: 'Combo Familiar' } })).toBe('Combo Familiar');
    });

    it('returns combo with emoji when option set', () => {
        expect(getItemName({ combo: { name: 'Combo 1' } }, { comboEmoji: true })).toContain('Combo 1');
    });

    it('returns variant name', () => {
        expect(getItemName({ variant: { name: 'Grande' } })).toBe('Grande');
    });

    it('returns productName fallback', () => {
        expect(getItemName({ productName: 'Item X' })).toBe('Item X');
    });

    it('returns default when no name found', () => {
        expect(getItemName({})).toBe('Producto');
    });

    it('prioritizes product over combo', () => {
        expect(getItemName({ product: { name: 'A' }, combo: { name: 'B' } })).toBe('A');
    });
});
