import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { StatusBar } from './components/StatusBar';
import { OrderQueue } from './components/OrderQueue';
import { KitchenKanban } from './components/KitchenKanban';
import { ManagerDashboard } from './components/ManagerDashboard';
import { DeliveryView } from './components/DeliveryView';
import { CashManagement } from './components/CashManagement';
import { ViewNavBar, ActiveView, getDefaultView } from './components/ViewNavBar';
import { AlertOverlay } from './components/AlertOverlay';
import { LoginScreen } from './components/LoginScreen';
import { PrinterSetup } from './components/PrinterSetup';
import { TicketPreview, PrintJobPreview } from './components/TicketPreview';
import { ServerSetup } from './components/ServerSetup';
import { LocationPicker } from './components/LocationPicker';
import { Order, Location } from './types/order';
import { PrintRule, TicketTemplate, PrintJob } from './types/printer-config';
import {
    updateOrderStatus, getNextStatus, fetchActiveOrders,
    fetchKitchenOrders, fetchDeliveryOrders,
    updateKitchenStatus as updateKitchenOrderStatus,
    updateDeliveryStatus as updateDeliveryOrderStatus,
} from './services/order.service';
import { printTicket } from './services/printer.service';
import { socketService } from './services/socket.service';
import {
    fetchRules, fetchTemplate, matchRulesForOrder,
    getStoredPrinterId,
} from './services/printer-config.service';

const CURRENCY_SYMBOL = 'S/';

// ─── Main Operational View (role-based) ─────────────────────────────────────

const OperationalView: React.FC<{
    printerId: number;
    onResetPrinter: () => void;
    onChangeLocation?: () => void;
    canChangeLocation?: boolean;
}> = ({ printerId, onResetPrinter, onChangeLocation, canChangeLocation }) => {
    const { user, token, logout, hasPermission, appConfig, locations } = useAuth();
    const userRole = user?.role || 'VENDOR';

    // Determine permissions based on role — each role uses different backend endpoints
    const canReadOrders = userRole === 'ADMIN' || userRole === 'MANAGER'
        || hasPermission('orders', 'read')
        || hasPermission('kitchen_view', 'read')
        || hasPermission('delivery_view', 'read');
    const canWriteOrders = userRole === 'ADMIN' || userRole === 'MANAGER'
        || hasPermission('orders', 'write')
        || hasPermission('kitchen_view', 'write')
        || hasPermission('delivery_view', 'write');
    const isAllLocations = appConfig?.locationId === -1;

    const serverUrl = appConfig?.serverUrl || '';
    const storeName = appConfig?.tenantName || 'OptimaPOS';
    const locationName = appConfig?.locationName || null;

    // Default view based on role
    const [activeView, setActiveView] = useState<ActiveView>(() => getDefaultView(userRole));

    const socketLocId = appConfig?.locationId && appConfig.locationId > 0 ? appConfig.locationId : undefined;
    const { orders, isConnected, hasNewAlert, printJobs, dismissAlert, updateOrderLocally, removeOrder, clearPrintJob } = useSocket(serverUrl, token, socketLocId);
    const [initialOrders, setInitialOrders] = useState<Order[]>([]);
    const [rules, setRules] = useState<PrintRule[]>([]);
    const [ticketPreview, setTicketPreview] = useState<{ order: Order; template: TicketTemplate } | null>(null);
    const [activePrintJob, setActivePrintJob] = useState<PrintJob | null>(null);

    // Desktop socket auth (API key based)
    useEffect(() => {
        if (!isConnected || !appConfig?.apiKey || !appConfig?.tenantSlug) return;

        socketService.desktopConnect(
            appConfig.apiKey,
            appConfig.tenantSlug,
            appConfig.locationId || undefined
        ).then(resp => {
            if (resp.success) {
                console.log('[App] Desktop socket authenticated');
                socketService.setPrinterStatuses([{ id: printerId, status: 'online' }]);
            } else {
                console.warn('[App] Desktop socket auth failed:', resp.error);
            }
        });
    }, [isConnected, appConfig?.apiKey, appConfig?.tenantSlug, appConfig?.locationId, printerId]);

    // Load active orders using the correct endpoint for each role
    useEffect(() => {
        if (!token) return;

        const locId = appConfig?.locationId && appConfig.locationId > 0 ? appConfig.locationId : undefined;

        const loadOrders = async () => {
            let fetched: Order[] = [];
            try {
                if (userRole === 'KITCHEN') {
                    // Kitchen uses /api/orders/kitchen/active (requires kitchen_view:read)
                    fetched = await fetchKitchenOrders(token, locId);
                } else if (userRole === 'DELIVERY') {
                    // Delivery uses /api/orders/delivery/active (requires delivery_view:read)
                    fetched = await fetchDeliveryOrders(token, locId);
                } else {
                    // ADMIN, MANAGER, VENDOR use /api/orders (requires orders:read)
                    fetched = await fetchActiveOrders(token, locId);
                }
                console.log(`[Orders] Loaded ${fetched.length} active orders (role: ${userRole}, location: ${locId ?? 'ALL'})`);
            } catch (e) {
                console.error('[Orders] Load failed:', e);
            }
            setInitialOrders(fetched);
        };

        loadOrders();

        // Only fetch print rules for roles that have printer_config access (not KITCHEN/DELIVERY)
        if (userRole !== 'KITCHEN' && userRole !== 'DELIVERY') {
            fetchRules(token).then(r => {
                console.log(`[PrintConfig] Loaded ${r.length} rules`);
                setRules(r);
            }).catch(e => console.error('[PrintConfig] Load failed:', e));
        }
    }, [token, userRole]);

    // Process print jobs
    useEffect(() => {
        for (const job of printJobs) {
            if (job.rule.autoPrint) {
                console.log(`[AutoPrint] Acknowledging: ${job.jobId} | ${job.event} → ${job.printer.name}`);
                clearPrintJob(job.jobId);
            }
        }
        if (!activePrintJob) {
            const manualJob = printJobs.find(j => !j.rule.autoPrint);
            if (manualJob) setActivePrintJob(manualJob);
        }
    }, [printJobs, clearPrintJob, activePrintJob]);

    // Merge socket + initial orders (no dupes)
    const mergedOrders = [...orders];
    for (const io of initialOrders) {
        if (!mergedOrders.some(o => o.id === io.id)) {
            mergedOrders.push(io);
        }
    }

    const handleAdvanceStatus = useCallback(async (orderId: number, orderType: string) => {
        const order = mergedOrders.find(o => o.id === orderId);
        if (!order || !token) return;
        const nextStatus = getNextStatus(order.status, orderType);
        if (!nextStatus) return;

        // Use role-specific endpoint for status updates
        if (userRole === 'KITCHEN') {
            // Kitchen maps order status to kitchen status
            const kitchenStatus = nextStatus === 'CONFIRMED' || nextStatus === 'PREPARING' ? 'PREPARING' : nextStatus === 'READY_PICKUP' || nextStatus === 'ON_THE_WAY' ? 'READY' : null;
            if (kitchenStatus) {
                await updateKitchenOrderStatus(orderId, kitchenStatus, token);
            }
        } else if (userRole === 'DELIVERY') {
            await updateDeliveryOrderStatus(orderId, nextStatus, token);
        } else {
            await updateOrderStatus(orderId, nextStatus, token);
        }

        updateOrderLocally(orderId, nextStatus);
        setInitialOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    }, [mergedOrders, token, updateOrderLocally, userRole]);

    const handleRemove = useCallback((orderId: number) => {
        removeOrder(orderId);
        setInitialOrders(prev => prev.filter(o => o.id !== orderId));
    }, [removeOrder]);

    const handlePrintTicket = useCallback(async (order: Order) => {
        if (!token) return;

        const matchedRules = matchRulesForOrder(rules, printerId, order);
        if (matchedRules.length === 0) {
            await printTicket(order, storeName, CURRENCY_SYMBOL);
            return;
        }

        const rule = matchedRules[0];
        try {
            const template = await fetchTemplate(token, rule.templateId);
            setTicketPreview({ order, template });
        } catch {
            await printTicket(order, storeName, CURRENCY_SYMBOL);
        }
    }, [token, rules, printerId, storeName]);

    const handleTicketPrint = useCallback(async () => {
        if (!ticketPreview) return;
        const { printFromTemplate } = await import('./services/printer.service');
        await printFromTemplate(ticketPreview.order, ticketPreview.template, CURRENCY_SYMBOL);
        setTicketPreview(null);
    }, [ticketPreview]);

    const locationMap = isAllLocations ? Object.fromEntries(locations.map(l => [l.id, l.name])) : undefined;
    const activeCount = mergedOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
    const deliveryCount = mergedOrders.filter(o => o.type === 'DELIVERY' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
    const kitchenCount = mergedOrders.filter(o => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)).length;
    const latestOrder = orders[0];

    // Badges for nav
    const badges: Partial<Record<ActiveView, number>> = {
        kitchen: kitchenCount,
        orders: activeCount,
        delivery: deliveryCount,
    };

    // Render the active view content
    const renderView = () => {
        if (!canReadOrders) {
            return (
                <div className="app__no-permission">
                    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <span style={{ fontSize: '4rem' }}>🔒</span>
                        <h2 style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#fff' }}>Sin permisos</h2>
                        <p style={{ marginTop: '0.5rem', color: '#999', maxWidth: '400px', margin: '0.5rem auto 0' }}>
                            Tu cuenta no tiene permisos para ver pedidos. Contacta al administrador.
                        </p>
                    </div>
                </div>
            );
        }

        switch (activeView) {
            case 'dashboard':
                return (
                    <ManagerDashboard
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                        activeOrders={mergedOrders}
                        onNavigate={setActiveView}
                        currentView={activeView}
                    />
                );
            case 'kitchen':
                return (
                    <KitchenKanban
                        orders={mergedOrders}
                        currencySymbol={CURRENCY_SYMBOL}
                        onAdvanceStatus={canWriteOrders ? handleAdvanceStatus : undefined}
                        onRemove={handleRemove}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                    />
                );
            case 'delivery':
                return (
                    <DeliveryView
                        orders={mergedOrders}
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                    />
                );
            case 'cash':
                return (
                    <CashManagement
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                    />
                );
            case 'orders':
            default:
                return (
                    <OrderQueue
                        orders={mergedOrders}
                        currencySymbol={CURRENCY_SYMBOL}
                        storeName={storeName}
                        onAdvanceStatus={canWriteOrders ? handleAdvanceStatus : undefined}
                        onRemove={handleRemove}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                    />
                );
        }
    };

    return (
        <div className="app">
            <StatusBar
                storeName={storeName}
                locationName={locationName}
                isConnected={isConnected}
                orderCount={activeCount}
                user={user}
                onLogout={logout}
                onSettings={onResetPrinter}
                onChangeLocation={onChangeLocation}
                canChangeLocation={canChangeLocation}
            />

            {user && (
                <ViewNavBar
                    currentView={activeView}
                    onNavigate={setActiveView}
                    userRole={user.role}
                    badges={badges}
                />
            )}

            {renderView()}

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
                    storeName={storeName}
                    serverUrl={serverUrl}
                    onClose={() => setTicketPreview(null)}
                    onPrint={handleTicketPrint}
                />
            )}

            {activePrintJob && (
                <PrintJobPreview
                    job={activePrintJob}
                    serverUrl={serverUrl}
                    onClose={() => {
                        clearPrintJob(activePrintJob.jobId);
                        setActivePrintJob(null);
                    }}
                    onPrint={() => {
                        console.log(`[Print] Manual print for job: ${activePrintJob.jobId}`);
                        clearPrintJob(activePrintJob.jobId);
                        setActivePrintJob(null);
                    }}
                />
            )}
        </div>
    );
};

// ─── Root App — Full Flow ────────────────────────────────────────────────────

export const App: React.FC = () => {
    const { isAuthenticated, isLoading, login, logout, error, token, appConfig, setAppConfig, locations, user } = useAuth();
    const [printerId, setPrinterId] = useState<number | null>(null);
    const [printerLoading, setPrinterLoading] = useState(true);

    // Check stored printerId
    useEffect(() => {
        getStoredPrinterId().then(id => {
            setPrinterId(id);
            setPrinterLoading(false);
        });
    }, []);

    // ── Loading ──
    if (isLoading || printerLoading) {
        return (
            <div className="app loading-screen">
                <div className="loading-screen__content">
                    <span className="loading-screen__icon">⚡</span>
                    <div className="loading-screen__spinner" />
                    <p className="loading-screen__text">OptimaPOS Terminal</p>
                </div>
            </div>
        );
    }

    // ── Step 1: Server Setup (first time only) ──
    if (!appConfig?.serverUrl) {
        return (
            <ServerSetup
                onComplete={async (serverUrl, tenantSlug) => {
                    await setAppConfig({ serverUrl, tenantSlug });
                }}
            />
        );
    }

    // ── Step 2: Login ──
    if (!isAuthenticated) {
        return (
            <LoginScreen
                onLogin={login}
                error={error}
                isLoading={isLoading}
                storeName={appConfig?.tenantName || 'OptimaPOS'}
            />
        );
    }

    // ── Block CLIENT and SUPER_ADMIN roles ──
    if (user?.role === 'CLIENT') {
        return (
            <div className="app">
                <div className="app__blocked-role">
                    <span className="app__blocked-icon">🚫</span>
                    <h2>Acceso restringido</h2>
                    <p>Esta app es solo para personal del restaurante.</p>
                    <button className="btn btn--advance" onClick={logout}>Cerrar sesión</button>
                </div>
            </div>
        );
    }

    if (user?.role === 'SUPER_ADMIN') {
        return (
            <div className="app">
                <div className="app__blocked-role">
                    <span className="app__blocked-icon">🛡️</span>
                    <h2>Super Admin</h2>
                    <p>Usa el panel web para administración del sistema.</p>
                    <button className="btn btn--advance" onClick={logout}>Cerrar sesión</button>
                </div>
            </div>
        );
    }

    // ── Step 3: Validate saved location against user's allowed locations ──
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
    const isAllLocations = appConfig?.locationId === -1;
    const savedLocValid = isAllLocations
        ? isAdmin
        : appConfig?.locationId && locations.some(l => l.id === appConfig.locationId);

    if (appConfig?.locationId && locations.length > 0 && !savedLocValid) {
        setAppConfig({ locationId: undefined as any, locationName: undefined as any });
    }

    if (locations.length > 1 && !savedLocValid) {
        return (
            <LocationPicker
                locations={locations}
                storeName={appConfig?.tenantName || user?.name || 'OptimaPOS'}
                showAllOption={isAdmin}
                onSelectAll={async () => {
                    await setAppConfig({ locationId: -1 as any, locationName: 'Todos los Locales' });
                }}
                onSelect={async (loc: Location) => {
                    await setAppConfig({ locationId: loc.id, locationName: loc.name });
                }}
            />
        );
    }

    if (locations.length === 1 && !savedLocValid) {
        setAppConfig({ locationId: locations[0].id, locationName: locations[0].name });
    }

    // ── Step 4: Printer setup (skip for KITCHEN and DELIVERY roles) ──
    const needsPrinter = user?.role !== 'KITCHEN' && user?.role !== 'DELIVERY';
    if (needsPrinter && printerId === null) {
        return (
            <PrinterSetup
                token={token!}
                storeName={appConfig?.tenantName || 'OptimaPOS'}
                locationId={appConfig?.locationId || undefined}
                onComplete={id => setPrinterId(id)}
                onSkip={() => setPrinterId(-1)}
                onLogout={logout}
            />
        );
    }

    // ── Step 5: Operational View (role-based) ──
    return (
        <OperationalView
            printerId={printerId ?? -1}
            onResetPrinter={() => {
                setPrinterId(null);
                import('./services/printer-config.service').then(m => m.storePrinterId(null));
            }}
            canChangeLocation={locations.length > 1}
            onChangeLocation={() => {
                setAppConfig({ locationId: undefined as any, locationName: undefined as any });
            }}
        />
    );
};
