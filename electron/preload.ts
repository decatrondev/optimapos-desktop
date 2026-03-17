import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — exposes a safe API to the renderer process.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Writes a ticket text file to the configured output directory.
     */
    printTicket: (ticketText: string, fileName: string): Promise<{ success: boolean; path?: string; error?: string }> => {
        return ipcRenderer.invoke('print-ticket', ticketText, fileName);
    },

    /**
     * Retrieves environment configuration from the main process.
     */
    getEnvConfig: (): Promise<{ socketUrl: string; storeName: string; currencySymbol: string }> => {
        return ipcRenderer.invoke('get-env-config');
    },

    /**
     * Stores the auth token persistently.
     */
    storeToken: (token: string | null): Promise<void> => {
        return ipcRenderer.invoke('store-token', token);
    },

    /**
     * Retrieves the stored auth token.
     */
    getToken: (): Promise<string | null> => {
        return ipcRenderer.invoke('get-token');
    },

    /**
     * Stores the selected printer ID persistently.
     */
    storePrinterId: (printerId: number | null): Promise<void> => {
        return ipcRenderer.invoke('store-printer-id', printerId);
    },

    /**
     * Retrieves the stored printer ID.
     */
    getPrinterId: (): Promise<number | null> => {
        return ipcRenderer.invoke('get-printer-id');
    },
});
