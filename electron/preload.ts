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
