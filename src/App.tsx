import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { StatusBar } from './components/StatusBar';
import { OrderQueue } from './components/OrderQueue';
import { AlertOverlay } from './components/AlertOverlay';
import { LoginScreen } from './components/LoginScreen';
import { PrinterSetup } from './components/PrinterSetup';
import { TicketPreview, PrintJobPreview } from './components/TicketPreview';
import { ServerSetup } from './components/ServerSetup';
import { LocationPicker } from './components/LocationPicker';
import { Order, Location } from './types/order';
import { PrintRule, TicketTemplate, PrintJob } from './types/printer-config';
import { updateOrderStatus, getNextStatus, fetchActiveOrders } from './services/order.service';
import { printTicket } from './services/printer.service';
import { socketService } from './services/socket.service';
import {
    fetchRules, fetchTemplate, matchRulesForOrder,
    getStoredPrinterId,
} from './services/printer-config.service';

const CURRENCY_SYMBOL = 'S/';

// ─── Kitchen Dashboard (main operational view) ──────────────────────────────

const KitchenDashboard: React.FC<{
    printerId: number;
    onResetPrinter: () => void;
    onChangeLocation?: () => void;
    canChangeLocation?: boolean;
}> = ({ printerId, onResetPrinter, onChangeLocation, canChangeLocation }) => {
    const { user, token, logout, hasPermission, appConfig } = useAuth();
    const canReadOrders = hasPermission('orders', 'read');
    const canWriteOrders = hasPermission('orders', 'write');

    const serverUrl = appConfig?.serverUrl || '';
    const storeName = appConfig?.tenantName || 'OptimaPOS';
    const locationName = appConfig?.locationName || null;

    const { orders, isConnected, hasNewAlert, printJobs, dismissAlert, updateOrderLocally, removeOrder, clearPrintJob } = useSocket(serverUrl, token, appConfig?.locationId || undefined);
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
                // Set printer statuses for heartbeat
                socketService.setPrinterStatuses([{ id: printerId, status: 'online' }]);
            } else {
                console.warn('[App] Desktop socket auth failed:', resp.error);
            }
        });
    }, [isConnected, appConfig?.apiKey, appConfig?.tenantSlug, appConfig?.locationId, printerId]);

    // Load active orders and print rules
    useEffect(() => {
        if (!token || !canReadOrders) return;

        const locId = appConfig?.locationId || undefined;
        fetchActiveOrders(token, locId).then(fetched => {
            console.log(`[Orders] Loaded ${fetched.length} active orders (location: ${locId})`);
            setInitialOrders(fetched);
        }).catch(e => console.error('[Orders] Load failed:', e));

        fetchRules(token).then(r => {
            console.log(`[PrintConfig] Loaded ${r.length} rules`);
            setRules(r);
        }).catch(e => console.error('[PrintConfig] Load failed:', e));
    }, [token, canReadOrders]);

    // Process print jobs: auto-print ones get acknowledged, manual ones show preview
    useEffect(() => {
        for (const job of printJobs) {
            if (job.rule.autoPrint) {
                console.log(`[AutoPrint] Acknowledging: ${job.jobId} | ${job.event} → ${job.printer.name}`);
                clearPrintJob(job.jobId);
            }
        }
        // Show first non-autoPrint job as preview if nothing is showing
        if (!activePrintJob) {
            const manualJob = printJobs.find(j => !j.rule.autoPrint);
            if (manualJob) {
                setActivePrintJob(manualJob);
            }
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

        await updateOrderStatus(orderId, nextStatus, token);
        updateOrderLocally(orderId, nextStatus);
        setInitialOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
    }, [mergedOrders, token, updateOrderLocally]);

    const handleRemove = useCallback((orderId: number) => {
        removeOrder(orderId);
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

    const latestOrder = orders[0];

    return (
        <div className="app">
            <StatusBar
                storeName={storeName}
                locationName={locationName}
                isConnected={isConnected}
                orderCount={mergedOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length}
                user={user}
                onLogout={logout}
                onSettings={onResetPrinter}
                onChangeLocation={onChangeLocation}
                canChangeLocation={canChangeLocation}
            />

            {!canReadOrders ? (
                <div className="app__no-permission">
                    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                        <span style={{ fontSize: '4rem' }}>🔒</span>
                        <h2 style={{ marginTop: '1rem', fontSize: '1.5rem', color: '#fff' }}>Sin permisos</h2>
                        <p style={{ marginTop: '0.5rem', color: '#999', maxWidth: '400px', margin: '0.5rem auto 0' }}>
                            Tu cuenta no tiene permisos para ver pedidos. Contacta al administrador.
                        </p>
                    </div>
                </div>
            ) : (
                <OrderQueue
                    orders={mergedOrders}
                    currencySymbol={CURRENCY_SYMBOL}
                    storeName={storeName}
                    onAdvanceStatus={canWriteOrders ? handleAdvanceStatus : undefined}
                    onRemove={handleRemove}
                    onPrint={handlePrintTicket}
                />
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
                    storeName={storeName}
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
    const { isAuthenticated, isLoading, login, error, token, appConfig, setAppConfig, locations, user } = useAuth();
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

    // ── Step 3: Validate saved location against user's allowed locations ──
    const savedLocValid = appConfig?.locationId && locations.some(l => l.id === appConfig.locationId);

    // If saved locationId is NOT in user's locations, clear it
    if (appConfig?.locationId && locations.length > 0 && !savedLocValid) {
        setAppConfig({ locationId: undefined as any, locationName: undefined as any });
    }

    // Show picker if 2+ locations and none selected (or invalid)
    if (locations.length > 1 && !savedLocValid) {
        return (
            <LocationPicker
                locations={locations}
                storeName={appConfig?.tenantName || user?.name || 'OptimaPOS'}
                onSelect={async (loc: Location) => {
                    await setAppConfig({ locationId: loc.id, locationName: loc.name });
                }}
            />
        );
    }

    // Auto-select if only 1 location
    if (locations.length === 1 && !savedLocValid) {
        setAppConfig({ locationId: locations[0].id, locationName: locations[0].name });
    }

    // ── Step 4: Printer setup ──
    if (printerId === null) {
        return (
            <PrinterSetup
                token={token!}
                storeName={appConfig?.tenantName || 'OptimaPOS'}
                onComplete={id => setPrinterId(id)}
            />
        );
    }

    // ── Step 5: Dashboard ──
    return (
        <KitchenDashboard
            printerId={printerId}
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
