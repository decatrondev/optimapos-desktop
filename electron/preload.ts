import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // Config
    getConfig: (): Promise<any> => ipcRenderer.invoke('get-config'),
    saveConfig: (updates: any): Promise<any> => ipcRenderer.invoke('save-config', updates),

    // Token
    storeToken: (token: string | null): Promise<void> => ipcRenderer.invoke('store-token', token),
    getToken: (): Promise<string | null> => ipcRenderer.invoke('get-token'),

    // Printer ID
    storePrinterId: (printerId: number | null): Promise<void> => ipcRenderer.invoke('store-printer-id', printerId),
    getPrinterId: (): Promise<number | null> => ipcRenderer.invoke('get-printer-id'),

    // Legacy env config
    getEnvConfig: (): Promise<{ socketUrl: string; storeName: string; currencySymbol: string }> =>
        ipcRenderer.invoke('get-env-config'),

    // Ticket file output
    printTicket: (ticketText: string, fileName: string): Promise<{ success: boolean; path?: string; error?: string }> =>
        ipcRenderer.invoke('print-ticket', ticketText, fileName),

    // Printer — TCP (network)
    printerPrintTCP: (ip: string, port: number, data: number[]): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-print-tcp', ip, port, data),
    printerPrintTextTCP: (ip: string, port: number, text: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-print-text-tcp', ip, port, text),
    printerTestTCP: (ip: string, port: number, storeName: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-test-tcp', ip, port, storeName),
    printerTestConnection: (ip: string, port: number): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-test-connection', ip, port),

    // Printer — USB (system driver)
    printerPrintUSB: (printerName: string, data: number[]): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-print-usb', printerName, data),
    printerPrintTextUSB: (printerName: string, text: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-print-text-usb', printerName, text),
    printerTestUSB: (printerName: string, storeName: string): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('printer-test-usb', printerName, storeName),

    // Printer — Discovery
    printerScanNetwork: (): Promise<Array<{ ip: string; port: number }>> =>
        ipcRenderer.invoke('printer-scan-network'),
    printerListSystem: (): Promise<Array<{ name: string; isDefault: boolean; portName?: string }>> =>
        ipcRenderer.invoke('printer-list-system'),
    onPrinterScanProgress: (callback: (data: { current: number; total: number }) => void): (() => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('printer-scan-progress', handler);
        return () => ipcRenderer.removeListener('printer-scan-progress', handler);
    },

    // Offline / SQLite
    offlineCheckConnection: (serverUrl: string): Promise<boolean> =>
        ipcRenderer.invoke('offline-check-connection', serverUrl),
    offlineSyncCatalog: (serverUrl: string, token: string, locationId: number): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('offline-sync-catalog', serverUrl, token, locationId),
    offlineSyncPending: (serverUrl: string, token: string, locationId: number): Promise<{ synced: number; failed: number }> =>
        ipcRenderer.invoke('offline-sync-pending', serverUrl, token, locationId),
    offlineHasCatalog: (): Promise<boolean> =>
        ipcRenderer.invoke('offline-has-catalog'),
    offlineGetProducts: (): Promise<any[]> =>
        ipcRenderer.invoke('offline-get-products'),
    offlineGetCategories: (): Promise<any[]> =>
        ipcRenderer.invoke('offline-get-categories'),
    offlineGetCombos: (): Promise<any[]> =>
        ipcRenderer.invoke('offline-get-combos'),
    offlineGetTables: (): Promise<any[]> =>
        ipcRenderer.invoke('offline-get-tables'),
    offlineGetZones: (): Promise<{ zones: any[]; basePrice: number }> =>
        ipcRenderer.invoke('offline-get-zones'),
    offlineGetLastSync: (): Promise<string | null> =>
        ipcRenderer.invoke('offline-get-last-sync'),
    offlineSaveOrder: (id: string, payload: any): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('offline-save-order', id, payload),
    offlineGetPendingOrders: (): Promise<any[]> =>
        ipcRenderer.invoke('offline-get-pending-orders'),
    offlineGetPendingCount: (): Promise<number> =>
        ipcRenderer.invoke('offline-get-pending-count'),
    offlineRemovePending: (id: string): Promise<void> =>
        ipcRenderer.invoke('offline-remove-pending', id),
    onOfflineStatus: (callback: (data: { status: 'connected' | 'reconnecting' | 'offline' }) => void): (() => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('offline-status', handler);
        return () => ipcRenderer.removeListener('offline-status', handler);
    },

    // Multi-monitor
    openKitchenWindow: (): Promise<{ success: boolean; display?: string; alreadyOpen?: boolean }> =>
        ipcRenderer.invoke('open-kitchen-window'),
    closeKitchenWindow: (): Promise<void> => ipcRenderer.invoke('close-kitchen-window'),
    getDisplayCount: (): Promise<number> => ipcRenderer.invoke('get-display-count'),

    // Image cache
    imageCacheGet: (url: string): Promise<string | null> => ipcRenderer.invoke('image-cache-get', url),
    imageCacheStore: (url: string): Promise<string | null> => ipcRenderer.invoke('image-cache-store', url),

    // Window controls
    setAlwaysOnTop: (value: boolean): Promise<void> => ipcRenderer.invoke('set-always-on-top', value),
    printerScanCancel: (): Promise<void> => ipcRenderer.invoke('printer-scan-cancel'),

    // Auto-Updater
    getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
    updaterCheck: (): Promise<{ success: boolean; version?: string; error?: string }> =>
        ipcRenderer.invoke('updater-check'),
    updaterDownload: (): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('updater-download'),
    updaterInstall: (): Promise<void> => ipcRenderer.invoke('updater-install'),
    onUpdaterStatus: (callback: (data: any) => void): (() => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('updater-status', handler);
        return () => ipcRenderer.removeListener('updater-status', handler);
    },
});
