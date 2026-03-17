import { AuthUser, LoginResponse, AppConfig } from '../types/order';

/** Get the server URL from config or fallback */
async function getServerUrl(): Promise<string> {
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        if (config.serverUrl) return config.serverUrl;
    }
    return import.meta.env.VITE_SOCKET_URL || '';
}

export class AuthError extends Error {
    constructor(message: string, public statusCode?: number) {
        super(message);
        this.name = 'AuthError';
    }
}

const BLOCKED_ROLES = ['CLIENT', 'SUPER_ADMIN'];

export async function login(email: string, password: string): Promise<LoginResponse> {
    const serverUrl = await getServerUrl();
    if (!serverUrl) throw new AuthError('Servidor no configurado');

    const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) throw new AuthError('Credenciales incorrectas', 401);
        if (res.status === 403) {
            if (data.suspended) throw new AuthError('Tu restaurante está suspendido. Contacta soporte.', 403);
            throw new AuthError(data.error || 'Acceso denegado', 403);
        }
        if (res.status === 429) throw new AuthError('Demasiados intentos. Espera 15 minutos.', 429);
        throw new AuthError(data.error || `Error ${res.status}`, res.status);
    }

    const data: LoginResponse = await res.json();

    if (BLOCKED_ROLES.includes(data.user.role)) {
        throw new AuthError('Esta app es solo para personal del restaurante', 403);
    }

    return data;
}

export async function persistToken(token: string | null): Promise<void> {
    if (window.electronAPI?.storeToken) {
        await window.electronAPI.storeToken(token);
    } else {
        if (token) localStorage.setItem('op_token', token);
        else localStorage.removeItem('op_token');
    }
}

export async function getPersistedToken(): Promise<string | null> {
    if (window.electronAPI?.getToken) {
        return window.electronAPI.getToken();
    }
    return localStorage.getItem('op_token');
}

export async function validateToken(token: string): Promise<AuthUser | null> {
    try {
        const serverUrl = await getServerUrl();
        if (!serverUrl) return null;

        const res = await fetch(`${serverUrl}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const user = data.user || data;
        if (BLOCKED_ROLES.includes(user.role)) return null;
        return user;
    } catch {
        return null;
    }
}

/** Validate a server URL by calling /api/health */
export async function validateServer(url: string): Promise<{ valid: boolean; name?: string; error?: string }> {
    try {
        const cleanUrl = url.replace(/\/+$/, '');
        const res = await fetch(`${cleanUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        if (data.status === 'ok' || data.status === 'degraded') {
            return { valid: true, name: data.name || 'OptimaPOS' };
        }
        return { valid: false, error: 'Servidor no reconocido' };
    } catch (e: any) {
        return { valid: false, error: e.message?.includes('timeout') ? 'Servidor no responde' : 'Sin conexión' };
    }
}

/** Fetch user's locations */
export async function fetchUserLocations(token: string): Promise<Array<{ id: number; name: string; address: string | null }>> {
    const serverUrl = await getServerUrl();
    const res = await fetch(`${serverUrl}/api/locations`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : data.locations || []).filter((l: any) => l.isActive !== false);
}
