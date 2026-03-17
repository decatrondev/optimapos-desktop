import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { StatusBar } from './components/StatusBar';
import { OrderQueue } from './components/OrderQueue';
import { AlertOverlay } from './components/AlertOverlay';
import { LoginScreen } from './components/LoginScreen';
import { PrinterSetup } from './components/PrinterSetup';
import { TicketPreview } from './components/TicketPreview';
import { Order } from './types/order';
import { PrintRule, TicketTemplate } from './types/printer-config';
import { updateOrderStatus, getNextStatus, fetchActiveOrders } from './services/order.service';
import { printTicket } from './services/printer.service';
import {
    fetchRules, fetchTemplate, matchRulesForOrder,
    getStoredPrinterId,
} from './services/printer-config.service';

// Config from env (Vite injects VITE_ vars at build time)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net';
const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Don Carlyn';
const CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || 'S/';

// Dev mode demo order for testing without server
const DEMO_ORDER: Order = {
    id: Date.now(),
    code: 'DEMO',
    status: 'PENDING',
    type: 'DELIVERY',
    guestName: 'Cliente de Prueba',
    guestPhone: '999-888-777',
    guestAddress: 'Av. Test 123, Lima',
    notes: 'Sin mayonesa por favor',
    subtotal: '38.00',
    deliveryFee: '5.00',
    discount: '0.00',
    total: '43.00',
    createdAt: new Date().toISOString(),
    user: null,
    zone: { id: 1, name: 'Centro', surcharge: '0.00' },
    items: [
        {
            id: 1, quantity: 2, unitPrice: '15.00', totalPrice: '30.00', notes: null,
            product: { id: 1, name: 'Hamburguesa Doble', description: null },
            combo: null, variant: null,
            addons: [
                { id: 1, quantity: 1, price: '3.00', addon: { id: 1, name: 'Bacon Extra' } },
                { id: 2, quantity: 1, price: '2.00', addon: { id: 2, name: 'Extra Queso' } },
            ],
        },
        {
            id: 2, quantity: 1, unitPrice: '8.00', totalPrice: '8.00', notes: 'Bien crujientes',
            product: { id: 2, name: 'Papas Fritas Grande', description: null },
            combo: null, variant: null, addons: [],
        },
    ],
};

/**
 * Kitchen Dashboard — the main operational view.
 */
const KitchenDashboard: React.FC<{ printerId: number; onResetPrinter: () => void }> = ({ printerId, onResetPrinter }) => {
    const { user, token, logout, hasPermission } = useAuth();
    const canReadOrders = hasPermission('orders', 'read');
    const canWriteOrders = hasPermission('orders', 'write');
    const { orders, isConnected, hasNewAlert, dismissAlert, updateOrderLocally, removeOrder } = useSocket(SOCKET_URL, token);
    const [demoOrders, setDemoOrders] = useState<Order[]>([]);
    const [initialOrders, setInitialOrders] = useState<Order[]>([]);
    const [rules, setRules] = useState<PrintRule[]>([]);
    const [ticketPreview, setTicketPreview] = useState<{ order: Order; template: TicketTemplate } | null>(null);

    // Load existing active orders and print rules on mount
    useEffect(() => {
        if (!token) return;
        if (!canReadOrders) return;
        fetchActiveOrders(token).then((fetched) => {
            console.log(`[Orders] Loaded ${fetched.length} active orders from API`);
            setInitialOrders(fetched);
        }).catch((e) => {
            console.error('[Orders] Failed to load initial orders:', e);
            // Don't crash on 403 — user may not have permission
        });

        fetchRules(token).then((r) => {
            console.log(`[PrintConfig] Loaded ${r.length} rules`);
            setRules(r);
        }).catch((e) => console.error('[PrintConfig] Failed to load rules:', e));
    }, [token, canReadOrders]);

    // Merge: socket orders + initial orders (no duplicates) + demo orders
    const mergedOrders = [...orders];
    for (const io of initialOrders) {
        if (!mergedOrders.some((o) => o.id === io.id)) {
            mergedOrders.push(io);
        }
    }
    const allOrders = [...mergedOrders, ...demoOrders];

    const handleAddDemo = useCallback(() => {
        const codes = ['A1B2', 'X7Z9', 'K3M5', 'P9Q1', 'W2E4'];
        setDemoOrders((prev) => [
            {
                ...DEMO_ORDER,
                id: Date.now(),
                code: codes[Math.floor(Math.random() * codes.length)],
                createdAt: new Date().toISOString(),
            },
            ...prev,
        ]);
    }, []);

    const handleAdvanceStatus = useCallback(async (orderId: number, orderType: 'DELIVERY' | 'PICKUP') => {
        const order = allOrders.find((o) => o.id === orderId);
        if (!order) return;
        const nextStatus = getNextStatus(order.status, orderType);
        if (!nextStatus) return;

        const isDemo = demoOrders.some((o) => o.id === orderId);
        if (isDemo) {
            setDemoOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
            return;
        }

        if (!token) throw new Error('No autenticado');
        await updateOrderStatus(orderId, nextStatus, token);
        updateOrderLocally(orderId, nextStatus);
        setInitialOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    }, [allOrders, demoOrders, token, updateOrderLocally, canWriteOrders]);

    const handleRemove = useCallback((orderId: number) => {
        removeOrder(orderId);
        setDemoOrders((prev) => prev.filter((o) => o.id !== orderId));
    }, [removeOrder]);

    /**
     * Handles the print button: matches rules, fetches template, shows preview.
     */
    const handlePrintTicket = useCallback(async (order: Order) => {
        if (!token) return;

        // Match rules for this printer and order
        const matchedRules = matchRulesForOrder(rules, printerId, order);

        if (matchedRules.length === 0) {
            // No rule matched — use a fallback: show the order as plain text
            console.warn('[Print] No matching rules for this printer/order, using fallback');
            await printTicket(order, STORE_NAME, CURRENCY_SYMBOL);
            return;
        }

        // Use the first matching rule's template
        const rule = matchedRules[0];
        try {
            const template = await fetchTemplate(token, rule.templateId);

            // Log the full rendered ticket to DevTools console
            const { renderTemplate } = await import('./services/escpos-renderer');
            const ticketText = renderTemplate(template, order, CURRENCY_SYMBOL);
            console.log(`\n🧾 ═══ TICKET PREVIEW: ${template.name} (${template.width}mm) ═══`);
            console.log(`📋 Template ID: ${template.id} | Default: ${template.isDefault}`);
            console.log(`📐 Elementos del template:`);
            template.content.elements.forEach((el, i) => {
                console.log(`  [${i}] type: ${el.type} | align: ${el.align || 'left'} | bold: ${!!el.bold} | scaleW: ${el.scaleW || 1} | scaleH: ${el.scaleH || 1} | invert: ${!!el.invert} | font: ${el.font || 'A'}`,
                    el.type === 'items_list' ? `| showPrices: ${(el as any).showPrices !== false} | showAddons: ${(el as any).showAddons !== false}` : '',
                    el.type === 'header' || el.type === 'text' ? `| content: "${(el as any).content}"` : ''
                );
            });
            console.log(`\n📜 Texto renderizado ESC/POS:\n${ticketText}`);
            console.log(`🧾 ═══ FIN ═══\n`);

            setTicketPreview({ order, template });
        } catch (e) {
            console.error('[Print] Failed to fetch template:', e);
            // Fallback to text ticket
            await printTicket(order, STORE_NAME, CURRENCY_SYMBOL);
        }
    }, [token, rules, printerId]);

    const handleTicketPrint = useCallback(async () => {
        if (!ticketPreview) return;
        // Use template-based renderer for the text file output
        const { printFromTemplate } = await import('./services/printer.service');
        await printFromTemplate(ticketPreview.order, ticketPreview.template, CURRENCY_SYMBOL);
        setTicketPreview(null);
    }, [ticketPreview]);

    const latestOrder = orders[0];

    return (
        <div className="app">
            <StatusBar
                storeName={STORE_NAME}
                isConnected={isConnected}
                orderCount={allOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length}
                user={user}
                onLogout={logout}
            />

            {!canReadOrders ? (
                <div className="app__no-permission">
                    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <span style={{ fontSize: '4rem' }}>🔒</span>
                        <h2 style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#fff' }}>Sin permisos</h2>
                        <p style={{ marginTop: '0.5rem', color: '#999', maxWidth: '400px', margin: '0.5rem auto 0' }}>
                            Tu cuenta no tiene permisos para ver pedidos. Contacta al administrador para obtener acceso.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="app__toolbar">
                        <button className="btn btn--demo" onClick={handleAddDemo}>
                            🧪 Simular Pedido
                        </button>
                        <button className="btn btn--demo" onClick={onResetPrinter} title="Cambiar impresora">
                            🖨️ Puesto: #{printerId}
                        </button>
                    </div>

                    <OrderQueue
                        orders={allOrders}
                        currencySymbol={CURRENCY_SYMBOL}
                        storeName={STORE_NAME}
                        onAdvanceStatus={canWriteOrders ? handleAdvanceStatus : undefined}
                        onRemove={handleRemove}
                        onPrint={handlePrintTicket}
                    />
                </>
            )}

            <AlertOverlay
                visible={hasNewAlert}
                onDismiss={dismissAlert}
                orderCode={latestOrder?.code}
            />

            {ticketPreview && (
                <TicketPreview
                    template={ticketPreview.template}
                    order={ticketPreview.order}
                    currencySymbol={CURRENCY_SYMBOL}
                    storeName={STORE_NAME}
                    onClose={() => setTicketPreview(null)}
                    onPrint={handleTicketPrint}
                />
            )}
        </div>
    );
};

/**
 * Root App component — handles: Loading → Login → Printer Setup → Dashboard
 */
export const App: React.FC = () => {
    const { isAuthenticated, isLoading, login, error, token } = useAuth();
    const [printerId, setPrinterId] = useState<number | null>(null);
    const [printerLoading, setPrinterLoading] = useState(true);

    // Check for stored printerId on mount
    useEffect(() => {
        getStoredPrinterId().then((id) => {
            setPrinterId(id);
            setPrinterLoading(false);
        });
    }, []);

    // Loading screen
    if (isLoading || printerLoading) {
        return (
            <div className="app loading-screen">
                <div className="loading-screen__content">
                    <span className="loading-screen__icon">🍔</span>
                    <div className="loading-screen__spinner" />
                    <p className="loading-screen__text">Cargando...</p>
                </div>
            </div>
        );
    }

    // Not authenticated — login
    if (!isAuthenticated) {
        return (
            <LoginScreen onLogin={login} error={error} isLoading={isLoading} storeName={STORE_NAME} />
        );
    }

    // No printer selected — setup
    if (printerId === null) {
        return (
            <PrinterSetup
                token={token!}
                storeName={STORE_NAME}
                onComplete={(id) => setPrinterId(id)}
            />
        );
    }

    // All good — dashboard
    return (
        <KitchenDashboard
            printerId={printerId}
            onResetPrinter={() => {
                setPrinterId(null);
                import('./services/printer-config.service').then((m) => m.storePrinterId(null));
            }}
        />
    );
};
