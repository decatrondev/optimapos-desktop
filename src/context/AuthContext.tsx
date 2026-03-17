import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthUser, AuthState } from '../types/order';
import { login as loginAPI, persistToken, getPersistedToken, validateToken, AuthError } from '../services/auth.service';

export interface Permission {
    module: string;
    canRead: boolean;
    canWrite: boolean;
}

interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    error: string | null;
    permissions: Permission[];
    hasPermission: (module: string, action: 'read' | 'write') => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'https://doncarlyn.decatron.net';

async function fetchPermissions(token: string): Promise<Permission[]> {
    try {
        const res = await fetch(`${API_BASE}/api/users/me/permissions`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<Permission[]>([]);

    // Auto-login: try to restore session from stored token
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const storedToken = await getPersistedToken();
                if (storedToken) {
                    const validUser = await validateToken(storedToken);
                    if (validUser) {
                        setToken(storedToken);
                        setUser(validUser);
                        // Load permissions
                        if (validUser.role !== 'ADMIN') {
                            const perms = await fetchPermissions(storedToken);
                            setPermissions(perms);
                        }
                    } else {
                        await persistToken(null);
                    }
                }
            } catch (e) {
                console.warn('[Auth] Session restore failed:', e);
            } finally {
                setIsLoading(false);
            }
        };
        restoreSession();
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await loginAPI(email, password);
            setToken(response.token);
            setUser(response.user);
            await persistToken(response.token);

            // Load permissions for non-admin users
            if (response.user.role !== 'ADMIN') {
                const perms = await fetchPermissions(response.token);
                setPermissions(perms);
            }
        } catch (e) {
            const message = e instanceof AuthError ? e.message : 'Error de conexión. Verifica tu red.';
            setError(message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        setUser(null);
        setToken(null);
        setError(null);
        setPermissions([]);
        await persistToken(null);
    }, []);

    const hasPermission = useCallback((module: string, action: 'read' | 'write'): boolean => {
        if (!user) return false;
        if (user.role === 'ADMIN') return true;
        const perm = permissions.find((p) => p.module === module);
        if (!perm) return false;
        return action === 'read' ? perm.canRead : perm.canWrite;
    }, [user, permissions]);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!user && !!token,
                isLoading,
                error,
                login,
                logout,
                permissions,
                hasPermission,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
