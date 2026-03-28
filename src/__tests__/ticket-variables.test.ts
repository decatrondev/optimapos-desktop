import { describe, it, expect } from 'vitest';
import { resolveVariables, resolveVariablesKeepUnresolved, buildVarsFromOrder, buildVarsFromData } from '../utils/ticket-variables';

describe('resolveVariables', () => {
    it('replaces known variables', () => {
        expect(resolveVariables('Hola {{nombre}}', { nombre: 'Juan' })).toBe('Hola Juan');
    });

    it('replaces multiple variables', () => {
        expect(resolveVariables('{{a}} y {{b}}', { a: '1', b: '2' })).toBe('1 y 2');
    });

    it('returns empty string for unknown variables', () => {
        expect(resolveVariables('Hola {{unknown}}', {})).toBe('Hola ');
    });

    it('trims whitespace in key', () => {
        expect(resolveVariables('{{ nombre }}', { nombre: 'Ana' })).toBe('Ana');
    });
});

describe('resolveVariablesKeepUnresolved', () => {
    it('keeps unresolved placeholders', () => {
        expect(resolveVariablesKeepUnresolved('{{known}} {{unknown}}', { known: 'OK' })).toBe('OK {{unknown}}');
    });
});

describe('buildVarsFromOrder', () => {
    it('builds vars with store name', () => {
        const vars = buildVarsFromOrder(null, 'Mi Tienda');
        expect(vars['tienda_nombre']).toBe('Mi Tienda');
        expect(vars['fecha_actual']).toBeTruthy();
    });

    it('builds vars from order data', () => {
        const order = {
            code: 'ORD-001',
            type: 'DELIVERY',
            total: 45.50,
            subtotal: 40,
            discount: 0,
            deliveryFee: 5.50,
            notes: 'Sin cebolla',
            guestName: 'Pedro',
            createdAt: '2026-03-27T12:00:00Z',
        };
        const vars = buildVarsFromOrder(order, 'Test');
        expect(vars['pedido_codigo']).toBe('ORD-001');
        expect(vars['pedido_tipo']).toBe('Delivery');
        expect(vars['total']).toBe('45.50');
        expect(vars['cliente_nombre']).toBe('Pedro');
        expect(vars['pedido_notas']).toBe('Sin cebolla');
    });

    it('maps DINE_IN type', () => {
        const vars = buildVarsFromOrder({ type: 'DINE_IN' });
        expect(vars['pedido_tipo']).toBe('Mesa');
    });

    it('maps PICKUP type', () => {
        const vars = buildVarsFromOrder({ type: 'PICKUP' });
        expect(vars['pedido_tipo']).toBe('Recojo');
    });
});

describe('buildVarsFromData', () => {
    it('handles cash register data', () => {
        const data = {
            order: { code: 'X', type: 'PICKUP', total: 10 },
            cashRegister: {
                openingAmount: 100,
                closingAmount: 250,
                totalSales: 150,
                totalOrders: 12,
                userName: 'Carlos',
                locationName: 'Local 1',
            },
        };
        const vars = buildVarsFromData(data);
        expect(vars['caja_apertura']).toBe('100.00');
        expect(vars['caja_total']).toBe('250.00');
        expect(vars['caja_num_ordenes']).toBe('12');
        expect(vars['cajero_nombre']).toBe('Carlos');
        expect(vars['local_nombre']).toBe('Local 1');
    });

    it('handles table change data', () => {
        const data = {
            order: { code: 'Y', type: 'DINE_IN' },
            tableChange: { from: 'Mesa 1', to: 'Mesa 5' },
        };
        const vars = buildVarsFromData(data);
        expect(vars['mesa_anterior']).toBe('Mesa 1');
        expect(vars['mesa_nueva']).toBe('Mesa 5');
    });
});
