import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { StatusBar } from './components/StatusBar';
import { OrderQueue } from './components/OrderQueue';
import { KitchenKanban } from './components/KitchenKanban';
import { ManagerDashboard } from './components/ManagerDashboard';
import { DeliveryView } from './components/DeliveryView';
import { CashManagement } from './components/CashManagement';
import { POSView } from './components/POSView';
import { ViewNavBar, ActiveView, getDefaultView, VIEW_PERMISSIONS } from './components/ViewNavBar';
import { UpdateBanner } from './components/UpdateBanner';
import { AlertOverlay } from './components/AlertOverlay';
import { LoginScreen } from './components/LoginScreen';
import { PrinterSetup } from './components/PrinterSetup';
import { TicketPreview, PrintJobPreview } from './components/TicketPreview';
import { PrintQueue, PrintHistoryEntry } from './components/PrintQueue';
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
    getStoredPrinterId, fetchPrinters,
} from './services/printer-config.service';
import { executePrintJob, quickPrint } from './services/print-executor';
import { useOffline } from './hooks/useOffline';

import { CURRENCY_SYMBOL } from './utils/constants';

// ─── Main Operational View (role-based) ─────────────────────────────────────

const OperationalView: React.FC<{
    printerId: number;
    onResetPrinter: () => void;
    onChangeServer?: () => void;
    onChangeLocation?: () => void;
    canChangeLocation?: boolean;
}> = ({ printerId, onResetPrinter, onChangeServer, onChangeLocation, canChangeLocation }) => {
    const { user, token, logout, hasPermission, appConfig, locations } = useAuth();
    const userRole = user?.role || 'VENDOR';

    // Per-view permission check helper
    const canView = (view: ActiveView): boolean => hasPermission(VIEW_PERMISSIONS[view], 'read');
    const canWrite = (view: ActiveView): boolean => hasPermission(VIEW_PERMISSIONS[view], 'write');
    const isAllLocations = appConfig?.locationId === -1;

    const serverUrl = appConfig?.serverUrl || '';
    const storeName = appConfig?.tenantName || 'OptimaPOS';
    const locationName = appConfig?.locationName || null;

    // Default view based on role
    const [activeView, setActiveView] = useState<ActiveView>(() => getDefaultView(userRole));

    // Keyboard shortcuts: Ctrl+1..6 for view navigation
    useEffect(() => {
        const views: ActiveView[] = ['dashboard', 'pos', 'kitchen', 'orders', 'delivery', 'cash'];
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            const num = parseInt(e.key);
            if (num >= 1 && num <= 6) {
                e.preventDefault();
                const view = views[num - 1];
                if (view) setActiveView(view);
            }
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                window.location.reload();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const socketLocId = appConfig?.locationId && appConfig.locationId > 0 ? appConfig.locationId : undefined;
    const { orders, isConnected, hasNewAlert, printJobs, dismissAlert, updateOrderLocally, removeOrder, clearPrintJob } = useSocket(serverUrl, token, socketLocId, userRole as any, user?.id);
    const offline = useOffline({ serverUrl, token, locationId: socketLocId ?? null });
    const [initialOrders, setInitialOrders] = useState<Order[]>([]);
    const [rules, setRules] = useState<PrintRule[]>([]);
    const [printerConfig, setPrinterConfig] = useState<import('./types/printer-config').Printer | null>(null);
    const [ticketPreview, setTicketPreview] = useState<{ order: Order; template: TicketTemplate } | null>(null);
    const [activePrintJob, setActivePrintJob] = useState<PrintJob | null>(null);
    const [printError, setPrintError] = useState<string | null>(null);
    const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>([]);
    const [showPrintQueue, setShowPrintQueue] = useState(false);

    const addToHistory = useCallback((job: PrintJob, status: 'printed' | 'error', error?: string) => {
        setPrintHistory(prev => [{ job, status, error, timestamp: Date.now() }, ...prev].slice(0, 50));
    }, []);

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

    // Stable reference to load orders (used by poll, refresh button, and initial load)
    const loadOrders = useCallback(async () => {
        if (!token) return;
        const locId = appConfig?.locationId && appConfig.locationId > 0 ? appConfig.locationId : undefined;
        let fetched: Order[] = [];
        try {
            if (userRole === 'KITCHEN') {
                fetched = await fetchKitchenOrders(token, locId);
            } else if (userRole === 'DELIVERY') {
                fetched = await fetchDeliveryOrders(token, locId);
            } else {
                fetched = await fetchActiveOrders(token, locId);
            }
            console.log(`[Orders] Loaded ${fetched.length} active orders (role: ${userRole}, location: ${locId ?? 'ALL'})`);
        } catch (e) {
            console.error('[Orders] Load failed:', e);
        }
        setInitialOrders(fetched);
    }, [token, userRole, appConfig?.locationId]);

    // Load active orders on mount + poll every 30s
    useEffect(() => {
        if (!token) return;

        loadOrders();

        // Poll every 30s as fallback — ensures data stays fresh even if socket misses events
        const pollInterval = setInterval(loadOrders, 30_000);

        // Only fetch print rules for roles that have printer_config access (not KITCHEN/DELIVERY)
        if (userRole !== 'KITCHEN' && userRole !== 'DELIVERY') {
            const locId = appConfig?.locationId && appConfig.locationId > 0 ? appConfig.locationId : undefined;
            fetchRules(token).then(r => {
                console.log(`[PrintConfig] Loaded ${r.length} rules`);
                setRules(r);
            }).catch(e => console.error('[PrintConfig] Load failed:', e));

            fetchPrinters(token, locId).then(printers => {
                const myPrinter = printers.find(p => p.id === printerId) || printers.find(p => p.isDefault) || null;
                if (myPrinter) {
                    console.log(`[PrintConfig] Active printer: "${myPrinter.name}" (${myPrinter.type} ${myPrinter.address})`);
                    setPrinterConfig(myPrinter);
                }
            }).catch(e => console.error('[PrintConfig] Printers load failed:', e));
        }

        return () => clearInterval(pollInterval);
    }, [token, userRole, loadOrders]);

    // Process print jobs — autoPrint sends to hardware, manual shows preview
    useEffect(() => {
        for (const job of printJobs) {
            if (job.rule.autoPrint) {
                console.log(`[AutoPrint] Executing: ${job.jobId} | ${job.event} → ${job.printer.name}`);
                executePrintJob(job).then(result => {
                    if (result.success) {
                        addToHistory(job, 'printed');
                    } else {
                        console.error(`[AutoPrint] Failed: ${result.error}`);
                        addToHistory(job, 'error', result.error);
                        setPrintError(`Error imprimiendo: ${result.error || 'Error desconocido'}`);
                        setTimeout(() => setPrintError(null), 8000);
                    }
                });
                clearPrintJob(job.jobId);
            }
        }
        if (!activePrintJob) {
            const manualJob = printJobs.find(j => !j.rule.autoPrint);
            if (manualJob) setActivePrintJob(manualJob);
        }
    }, [printJobs, clearPrintJob, activePrintJob]);

    // Merge socket + initial orders — socket data takes priority but preserves nested data
    const orderMap = new Map<number, Order>();
    for (const io of initialOrders) {
        orderMap.set(io.id, io);
    }
    for (const so of orders) {
        const existing = orderMap.get(so.id);
        if (existing) {
            // Preserve nested arrays/objects from initial if socket didn't send them
            orderMap.set(so.id, {
                ...existing,
                ...so,
                items: so.items ?? existing.items,
                table: so.table ?? existing.table,
            } as Order);
        } else {
            orderMap.set(so.id, so);
        }
    }
    const mergedOrders = Array.from(orderMap.values());

    const handleAdvanceStatus = useCallback(async (orderId: number, orderType: string) => {
        const order = mergedOrders.find(o => o.id === orderId);
        if (!order) return;
        // Try React state token first, then fall back to persisted Electron token
        let activeToken = token;
        if (!activeToken && window.electronAPI?.getToken) {
            activeToken = await window.electronAPI.getToken();
        }
        if (!activeToken) return;
        const nextStatus = getNextStatus(order.status, orderType, userRole);
        if (!nextStatus) return;

        // Use role-specific endpoint for status updates
        if (userRole === 'KITCHEN') {
            // Kitchen maps order status to kitchen status
            const kitchenStatus = nextStatus === 'PREPARING' ? 'PREPARING' : nextStatus === 'READY_PICKUP' ? 'READY' : null;
            if (kitchenStatus) {
                await updateKitchenOrderStatus(orderId, kitchenStatus, activeToken);
            }
        } else if (userRole === 'DELIVERY') {
            await updateDeliveryOrderStatus(orderId, nextStatus, activeToken);
        } else {
            await updateOrderStatus(orderId, nextStatus, activeToken);
        }

        updateOrderLocally(orderId, nextStatus);
        setInitialOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    }, [mergedOrders, token, updateOrderLocally, userRole]);

    const handleRemove = useCallback((orderId: number) => {
        removeOrder(orderId);
        setInitialOrders(prev => prev.filter(o => o.id !== orderId));
    }, [removeOrder]);

    const handlePrintTicket = useCallback(async (order: Order) => {
        // Try React state token first, then fall back to persisted Electron token
        let activeToken = token;
        if (!activeToken && window.electronAPI?.getToken) {
            activeToken = await window.electronAPI.getToken();
        }

        const matchedRules = matchRulesForOrder(rules, printerId, order);
        if (matchedRules.length === 0) {
            await printTicket(order, storeName, CURRENCY_SYMBOL);
            return;
        }

        const rule = matchedRules[0];
        try {
            if (!activeToken) throw new Error('No token');
            const template = await fetchTemplate(activeToken, rule.templateId);
            setTicketPreview({ order, template });
        } catch {
            // Fallback to plain text ticket (always works, no token needed)
            await printTicket(order, storeName, CURRENCY_SYMBOL);
        }
    }, [token, rules, printerId, storeName]);

    const handleTicketPrint = useCallback(async () => {
        if (!ticketPreview) return;
        // Use hardware printing if printer config is available
        if (printerConfig && window.electronAPI) {
            const result = await quickPrint(
                ticketPreview.template,
                ticketPreview.order,
                { type: printerConfig.type, address: printerConfig.address, port: printerConfig.port }
            );
            if (!result.success) {
                console.error('[Print] Hardware print failed:', result.error);
            }
        } else {
            // Fallback to file output
            const { printFromTemplate } = await import('./services/printer.service');
            await printFromTemplate(ticketPreview.order, ticketPreview.template, CURRENCY_SYMBOL);
        }
        setTicketPreview(null);
    }, [ticketPreview, printerConfig]);

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

    // No-permission fallback
    const noPermissionScreen = (viewLabel: string) => (
        <div className="app__no-permission">
            <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <span style={{ fontSize: '4rem' }}>🔒</span>
                <h2 style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#fff' }}>Sin permisos</h2>
                <p style={{ marginTop: '0.5rem', color: '#999', maxWidth: '400px', margin: '0.5rem auto 0' }}>
                    No tienes acceso a {viewLabel}. Contacta al administrador.
                </p>
            </div>
        </div>
    );

    // Render the active view content with per-view permission checks
    const renderView = () => {
        switch (activeView) {
            case 'dashboard':
                if (!canView('dashboard')) return noPermissionScreen('el dashboard');
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
            case 'pos':
                if (!canView('pos')) return noPermissionScreen('el punto de venta');
                return (
                    <POSView
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                        storeName={storeName}
                        onPrintOrder={handlePrintTicket}
                        isOffline={offline.isOffline}
                        saveOfflineOrder={offline.saveOfflineOrder}
                    />
                );
            case 'kitchen':
                if (!canView('kitchen')) return noPermissionScreen('la cocina');
                return (
                    <KitchenKanban
                        orders={mergedOrders}
                        currencySymbol={CURRENCY_SYMBOL}
                        onAdvanceStatus={canWrite('kitchen') ? handleAdvanceStatus : undefined}
                        onRemove={handleRemove}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                        userRole={userRole}
                    />
                );
            case 'delivery':
                if (!canView('delivery')) return noPermissionScreen('delivery');
                return (
                    <DeliveryView
                        orders={mergedOrders}
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                        userRole={userRole}
                        userId={user?.id}
                    />
                );
            case 'cash':
                if (!canView('cash')) return noPermissionScreen('la caja');
                return (
                    <CashManagement
                        token={token!}
                        serverUrl={serverUrl}
                        locationId={socketLocId}
                    />
                );
            case 'orders':
            default:
                if (!canView('orders')) return noPermissionScreen('los pedidos');
                return (
                    <OrderQueue
                        orders={mergedOrders}
                        currencySymbol={CURRENCY_SYMBOL}
                        storeName={storeName}
                        onAdvanceStatus={canWrite('orders') ? handleAdvanceStatus : undefined}
                        onRemove={handleRemove}
                        onPrint={handlePrintTicket}
                        locationMap={locationMap}
                        userRole={userRole}
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
                onChangeServer={onChangeServer}
                onChangeLocation={onChangeLocation}
                canChangeLocation={canChangeLocation}
                onRefresh={loadOrders}
                offlineStatus={offline.status}
                pendingOrders={offline.pendingCount}
                lastSync={offline.lastSync}
                onPrintQueue={() => setShowPrintQueue(true)}
                printErrorCount={printHistory.filter(e => e.status === 'error').length}
            />

            {user && (
                <ViewNavBar
                    currentView={activeView}
                    onNavigate={setActiveView}
                    userRole={user.role}
                    badges={badges}
                    hasPermission={hasPermission}
                />
            )}

            {renderView()}

            <AlertOverlay
                visible={hasNewAlert}
                onDismiss={dismissAlert}
                orderCode={latestOrder?.code}
                userRole={userRole}
            />

            {printError && (
                <div style={{
                    position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999,
                    background: '#dc2626', color: '#fff', padding: '12px 20px',
                    borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '400px',
                }} onClick={() => setPrintError(null)}>
                    <span>🖨️</span>
                    <span>{printError}</span>
                    <span style={{ opacity: 0.6, fontSize: '11px' }}>✕</span>
                </div>
            )}

            {showPrintQueue && (
                <PrintQueue
                    history={printHistory}
                    pendingCount={printJobs.length}
                    onClose={() => setShowPrintQueue(false)}
                    onReprint={(entry) => addToHistory(entry.job, 'printed')}
                />
            )}

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
                    onPrint={async () => {
                        console.log(`[Print] Manual print for job: ${activePrintJob.jobId}`);
                        const result = await executePrintJob(activePrintJob);
                        addToHistory(activePrintJob, result.success ? 'printed' : 'error', result.error);
                        if (!result.success) {
                            console.error(`[Print] Manual print failed: ${result.error}`);
                        }
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

    // Reset server config — goes back to ServerSetup screen
    const resetServer = useCallback(async () => {
        await logout();
        setPrinterId(null);
        import('./services/printer-config.service').then(m => m.storePrinterId(null));
        await setAppConfig({
            serverUrl: '' as any,
            tenantSlug: '' as any,
            tenantName: '' as any,
            locationId: undefined as any,
            locationName: undefined as any,
            apiKey: undefined as any,
        });
    }, [logout, setAppConfig]);

    // Auto-fix invalid location: clear if not in list, auto-select if only one
    useEffect(() => {
        if (!appConfig?.locationId || locations.length === 0) return;
        const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
        const isAllLocations = appConfig.locationId === -1;
        const savedLocValid = isAllLocations
            ? isAdmin
            : locations.some(l => l.id === appConfig.locationId);
        if (!savedLocValid) {
            setAppConfig({ locationId: undefined as any, locationName: undefined as any });
        }
    }, [appConfig?.locationId, locations, user?.role, setAppConfig]);

    useEffect(() => {
        if (locations.length !== 1 || !appConfig || !isAuthenticated) return;
        const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
        const isAllLocations = appConfig.locationId === -1;
        const savedLocValid = isAllLocations
            ? isAdmin
            : appConfig.locationId && locations.some(l => l.id === appConfig.locationId);
        if (!savedLocValid) {
            setAppConfig({ locationId: locations[0].id, locationName: locations[0].name });
        }
    }, [locations, appConfig, isAuthenticated, user?.role, setAppConfig]);

    // ── Determine which screen to show ──
    const renderContent = () => {
        // Loading
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

        // Step 1: Server Setup
        if (!appConfig?.serverUrl) {
            return (
                <ServerSetup
                    onComplete={async (serverUrl, tenantSlug) => {
                        await setAppConfig({ serverUrl, tenantSlug });
                    }}
                />
            );
        }

        // Step 2: Login
        if (!isAuthenticated) {
            return (
                <LoginScreen
                    onLogin={login}
                    error={error}
                    isLoading={isLoading}
                    storeName={appConfig?.tenantName || 'OptimaPOS'}
                    onChangeServer={resetServer}
                />
            );
        }

        // Block CLIENT and SUPER_ADMIN roles
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

        // Step 3: Validate saved location
        const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
        const isAllLocations = appConfig?.locationId === -1;
        const savedLocValid = isAllLocations
            ? isAdmin
            : appConfig?.locationId && locations.some(l => l.id === appConfig.locationId);

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

        // Step 4: Printer setup
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

        // Step 5: Operational View
        return (
            <OperationalView
                printerId={printerId ?? -1}
                onResetPrinter={() => {
                    setPrinterId(null);
                    import('./services/printer-config.service').then(m => m.storePrinterId(null));
                }}
                onChangeServer={resetServer}
                canChangeLocation={locations.length > 1}
                onChangeLocation={() => {
                    setAppConfig({ locationId: undefined as any, locationName: undefined as any });
                }}
            />
        );
    };

    return (
        <>
            <UpdateBanner />
            {renderContent()}
        </>
    );
};
