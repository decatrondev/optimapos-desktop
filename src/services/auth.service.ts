import { AuthUser, LoginResponse } from '../types/order';

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net';

export class AuthError extends Error {
    constructor(message: string, public statusCode?: number) {
        super(message);
        this.name = 'AuthError';
    }
}

/**
 * Authenticates a user via the backend API.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.message || data.error || `Error ${res.status}`;

        if (res.status === 401) {
            throw new AuthError('Credenciales incorrectas', 401);
        }
        throw new AuthError(message, res.status);
    }

    const data: LoginResponse = await res.json();

    // Role gate: only ADMIN and VENDOR can access the terminal
    if (data.user.role === 'CLIENT') {
        throw new AuthError('Acceso denegado: Solo personal autorizado', 403);
    }

    return data;
}

/**
 * Persists the token (Electron IPC or localStorage fallback).
 */
export async function persistToken(token: string | null): Promise<void> {
    if (window.electronAPI?.storeToken) {
        await window.electronAPI.storeToken(token);
    } else {
        if (token) {
            localStorage.setItem('dc_token', token);
        } else {
            localStorage.removeItem('dc_token');
        }
    }
}

/**
 * Retrieves persisted token.
 */
export async function getPersistedToken(): Promise<string | null> {
    if (window.electronAPI?.getToken) {
        return window.electronAPI.getToken();
    }
    return localStorage.getItem('dc_token');
}

/**
 * Validates a token by calling the backend (optional, for auto-login).
 */
export async function validateToken(token: string): Promise<AuthUser | null> {
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();

        // could be { user: {...} } or just {...}
        const user = data.user || data;
        if (user.role === 'CLIENT') return null;
        return user;
    } catch {
        return null;
    }
}
