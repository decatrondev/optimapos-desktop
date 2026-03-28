/**
 * Offline Sync Engine — Handles catalog caching and pending order synchronization.
 * Runs in Electron main process.
 */

import log from 'electron-log';
import {
    replaceCatalog,
    getPendingOrders,
    removePendingOrder,
    updatePendingOrderRetry,
    CatalogData,
} from './database';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let pendingSyncInterval: ReturnType<typeof setInterval> | null = null;

// ─── Catalog Sync ───────────────────────────────────────────────────────────

interface SyncConfig {
    serverUrl: string;
    token: string;
    locationId: number;
}

export async function syncCatalog(config: SyncConfig): Promise<{ success: boolean; error?: string }> {
    const { serverUrl, token, locationId } = config;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
    const params = `?locationId=${locationId}`;

    try {
        log.info('[Sync] Starting catalog sync...');

        const [categoriesRes, productsRes, combosRes, tablesRes, zonesRes] = await Promise.all([
            fetch(`${serverUrl}/api/categories${params}`, { headers }),
            fetch(`${serverUrl}/api/products${params}`, { headers }),
            fetch(`${serverUrl}/api/combos${params}`, { headers }),
            fetch(`${serverUrl}/api/tables${params}`, { headers }),
            fetch(`${serverUrl}/api/zones${params}`, { headers }),
        ]);

        if (!categoriesRes.ok || !productsRes.ok || !combosRes.ok) {
            throw new Error(`API error: categories=${categoriesRes.status} products=${productsRes.status} combos=${combosRes.status}`);
        }

        const categoriesData: any = await categoriesRes.json();
        const productsData: any = await productsRes.json();
        const combosData: any = await combosRes.json();
        const tablesData: any = tablesRes.ok ? await tablesRes.json() : [];
        const zonesData: any = zonesRes.ok ? await zonesRes.json() : { zones: [], basePrice: 0 };

        const catalog: CatalogData = {
            categories: (Array.isArray(categoriesData) ? categoriesData : categoriesData.categories || []).filter((c: any) => c.isActive),
            products: (Array.isArray(productsData) ? productsData : productsData.products || []).filter((p: any) => p.isActive),
            combos: (Array.isArray(combosData) ? combosData : combosData.combos || []).filter((c: any) => c.isActive),
            tables: (Array.isArray(tablesData) ? tablesData : tablesData.tables || []).filter((t: any) => t.isActive),
            zones: (zonesData.zones || []).filter((z: any) => z.isActive),
            zonesBasePrice: parseFloat(zonesData.basePrice || '0'),
        };

        replaceCatalog(catalog);
        log.info('[Sync] Catalog sync complete');
        return { success: true };
    } catch (err: any) {
        log.error('[Sync] Catalog sync failed:', err.message);
        return { success: false, error: err.message };
    }
}

// ─── Pending Order Sync ─────────────────────────────────────────────────────

export async function syncPendingOrders(config: SyncConfig): Promise<{ synced: number; failed: number }> {
    const orders = getPendingOrders();
    if (orders.length === 0) return { synced: 0, failed: 0 };

    log.info(`[Sync] Syncing ${orders.length} pending orders...`);
    let synced = 0;
    let failed = 0;

    const MAX_RETRIES = 10;

    for (const order of orders) {
        // Exponential backoff: skip orders that have been retried recently
        if (order.retries > 0) {
            const backoffMs = Math.min(1000 * Math.pow(2, order.retries), 5 * 60 * 1000); // max 5 min
            const lastRetryAge = Date.now() - new Date(order.createdAt).getTime();
            if (lastRetryAge < backoffMs) continue;
        }
        if (order.retries >= MAX_RETRIES) {
            log.warn(`[Sync] Order ${order.id} exceeded ${MAX_RETRIES} retries — skipping`);
            removePendingOrder(order.id);
            failed++;
            continue;
        }

        try {
            const res = await fetch(`${config.serverUrl}/api/orders/pos`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(order.payload),
            });

            if (res.ok) {
                removePendingOrder(order.id);
                synced++;
                log.info(`[Sync] Order ${order.id} synced successfully`);
            } else {
                const data: any = await res.json().catch(() => ({}));
                const errMsg = data.error || `HTTP ${res.status}`;
                // If it's a 4xx client error (not 401/408), remove it — it will never succeed
                if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408) {
                    removePendingOrder(order.id);
                    log.warn(`[Sync] Order ${order.id} rejected (${res.status}): ${errMsg} — removed`);
                    failed++;
                } else {
                    updatePendingOrderRetry(order.id, errMsg);
                    failed++;
                }
            }
        } catch (err: any) {
            updatePendingOrderRetry(order.id, err.message);
            failed++;
        }
    }

    log.info(`[Sync] Pending sync done — synced: ${synced}, failed: ${failed}`);
    return { synced, failed };
}

// ─── Health Check (connection detection) ────────────────────────────────────

export async function checkConnection(serverUrl: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${serverUrl}/api/health`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

export function startSyncScheduler(
    getConfig: () => SyncConfig | null,
    onStatusChange: (status: 'connected' | 'reconnecting' | 'offline') => void,
): void {
    // Catalog sync every 5 minutes
    syncInterval = setInterval(async () => {
        const config = getConfig();
        if (!config) return;

        const online = await checkConnection(config.serverUrl);
        if (online) {
            onStatusChange('connected');
            await syncCatalog(config);
        } else {
            onStatusChange('offline');
        }
    }, 5 * 60 * 1000);

    // Pending order sync every 15 seconds
    pendingSyncInterval = setInterval(async () => {
        const config = getConfig();
        if (!config) return;

        const online = await checkConnection(config.serverUrl);
        if (online) {
            onStatusChange('connected');
            await syncPendingOrders(config);
        } else {
            onStatusChange('offline');
        }
    }, 15 * 1000);
}

export function stopSyncScheduler(): void {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
    if (pendingSyncInterval) { clearInterval(pendingSyncInterval); pendingSyncInterval = null; }
    log.info('[Sync] Scheduler stopped');
}
