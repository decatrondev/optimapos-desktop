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
});
