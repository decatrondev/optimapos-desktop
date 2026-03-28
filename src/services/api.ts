/**
 * Shared API configuration — single source of truth for server URL.
 */

let cachedServerUrl: string | null = null;

export async function getServerUrl(): Promise<string> {
    if (cachedServerUrl) return cachedServerUrl;
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        if (config?.serverUrl) {
            cachedServerUrl = config.serverUrl;
            return config.serverUrl;
        }
    }
    return import.meta.env.VITE_SOCKET_URL || '';
}

export function clearServerUrlCache(): void {
    cachedServerUrl = null;
}
