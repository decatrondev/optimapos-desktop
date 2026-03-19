/**
 * useOffline — React hook for offline state management.
 * Monitors connection, triggers catalog sync, exposes cached data fallbacks.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

interface UseOfflineOptions {
    serverUrl: string;
    token: string | null;
    locationId: number | null;
}

interface UseOfflineResult {
    status: ConnectionStatus;
    isOffline: boolean;
    lastSync: string | null;
    pendingCount: number;
    hasCatalog: boolean;
    syncCatalogNow: () => Promise<void>;
    syncPendingNow: () => Promise<{ synced: number; failed: number }>;
    saveOfflineOrder: (id: string, payload: any) => Promise<{ success: boolean; error?: string }>;
}

const PING_INTERVAL = 15_000; // 15 seconds

export function useOffline({ serverUrl, token, locationId }: UseOfflineOptions): UseOfflineResult {
    const [status, setStatus] = useState<ConnectionStatus>('reconnecting');
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [pendingCount, setPendingCount] = useState(0);
    const [hasCatalog, setHasCatalog] = useState(false);
    const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const api = window.electronAPI;

    // Load initial state
    useEffect(() => {
        if (!api) return;
        api.offlineGetLastSync().then(setLastSync);
        api.offlineHasCatalog().then(setHasCatalog);
        api.offlineGetPendingCount().then(setPendingCount);
    }, [api]);

    // Listen for status changes from main process
    useEffect(() => {
        if (!api?.onOfflineStatus) return;
        const unsub = api.onOfflineStatus((data) => {
            setStatus(data.status);
        });
        return unsub;
    }, [api]);

    // Manual ping loop for faster detection
    useEffect(() => {
        if (!api || !serverUrl) return;

        const ping = async () => {
            try {
                const online = await api.offlineCheckConnection(serverUrl);
                setStatus(prev => {
                    if (online && prev !== 'connected') return 'connected';
                    if (!online && prev === 'connected') return 'reconnecting';
                    if (!online && prev === 'reconnecting') return 'offline';
                    return prev;
                });
            } catch {
                setStatus('offline');
            }
        };

        ping(); // initial check
        pingRef.current = setInterval(ping, PING_INTERVAL);
        return () => {
            if (pingRef.current) clearInterval(pingRef.current);
        };
    }, [api, serverUrl]);

    // Refresh pending count periodically
    useEffect(() => {
        if (!api) return;
        const interval = setInterval(() => {
            api.offlineGetPendingCount().then(setPendingCount);
        }, 10_000);
        return () => clearInterval(interval);
    }, [api]);

    // Sync catalog on first connect and when status returns to connected
    useEffect(() => {
        if (status !== 'connected' || !api || !token || !locationId || !serverUrl) return;
        // Auto-sync catalog when we come back online
        api.offlineSyncCatalog(serverUrl, token, locationId).then((result) => {
            if (result.success) {
                api.offlineGetLastSync().then(setLastSync);
                api.offlineHasCatalog().then(setHasCatalog);
            }
        });
        // Auto-sync pending orders
        api.offlineSyncPending(serverUrl, token, locationId).then(() => {
            api.offlineGetPendingCount().then(setPendingCount);
        });
    }, [status, api, token, locationId, serverUrl]);

    const syncCatalogNow = useCallback(async () => {
        if (!api || !token || !locationId || !serverUrl) return;
        const result = await api.offlineSyncCatalog(serverUrl, token, locationId);
        if (result.success) {
            setLastSync(await api.offlineGetLastSync());
            setHasCatalog(await api.offlineHasCatalog());
        }
    }, [api, token, locationId, serverUrl]);

    const syncPendingNow = useCallback(async () => {
        if (!api || !token || !locationId || !serverUrl) return { synced: 0, failed: 0 };
        const result = await api.offlineSyncPending(serverUrl, token, locationId);
        setPendingCount(await api.offlineGetPendingCount());
        return result;
    }, [api, token, locationId, serverUrl]);

    const saveOfflineOrder = useCallback(async (id: string, payload: any) => {
        if (!api) return { success: false, error: 'No electron API' };
        const result = await api.offlineSaveOrder(id, payload);
        setPendingCount(await api.offlineGetPendingCount());
        return result;
    }, [api]);

    return {
        status,
        isOffline: status !== 'connected',
        lastSync,
        pendingCount,
        hasCatalog,
        syncCatalogNow,
        syncPendingNow,
        saveOfflineOrder,
    };
}
