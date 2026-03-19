import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthUser, AuthState, AppConfig, Location } from '../types/order';
import {
    login as loginAPI, persistToken, getPersistedToken, validateToken,
    AuthError, fetchUserLocations,
} from '../services/auth.service';

export interface Permission {
    module: string;
    canRead: boolean;
    canWrite: boolean;
}

interface AuthContextType extends AuthState {
    login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
    logout: () => void;
    error: string | null;
    permissions: Permission[];
    hasPermission: (module: string, action: 'read' | 'write') => boolean;
    appConfig: AppConfig | null;
    locations: Location[];
    setAppConfig: (updates: Partial<AppConfig>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function getServerUrl(): Promise<string> {
    if (window.electronAPI?.getConfig) {
        const config = await window.electronAPI.getConfig();
        return config.serverUrl || '';
    }
    return import.meta.env.VITE_SOCKET_URL || '';
}

async function fetchPermissions(token: string): Promise<Permission[]> {
    try {
        const serverUrl = await getServerUrl();
        const res = await fetch(`${serverUrl}/api/users/me/permissions`, {
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
    const [appConfig, setAppConfigState] = useState<AppConfig | null>(null);
    const [locations, setLocations] = useState<Location[]>([]);

    // Load app config + try auto-login
    useEffect(() => {
        const init = async () => {
            try {
                // Load persistent config
                if (window.electronAPI?.getConfig) {
                    const config = await window.electronAPI.getConfig();
                    setAppConfigState(config);
                }

                // Try to restore session
                const storedToken = await getPersistedToken();
                if (storedToken) {
                    const validUser = await validateToken(storedToken);
                    if (validUser) {
                        setToken(storedToken);
                        setUser(validUser);
                        if (validUser.role !== 'ADMIN' && validUser.role !== 'MANAGER') {
                            const perms = await fetchPermissions(storedToken);
                            setPermissions(perms);
                        }
                        // Fetch locations
                        const locs = await fetchUserLocations(storedToken);
                        setLocations(locs);
                    } else {
                        await persistToken(null);
                    }
                }
            } catch (e) {
                console.warn('[Auth] Init failed:', e);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    const setAppConfig = useCallback(async (updates: Partial<AppConfig>) => {
        if (window.electronAPI?.saveConfig) {
            const updated = await window.electronAPI.saveConfig(updates);
            setAppConfigState(updated);
        } else {
            // Browser fallback
            setAppConfigState(prev => prev ? { ...prev, ...updates } : null);
        }
    }, []);

    const login = useCallback(async (email: string, password: string, rememberMe = true) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await loginAPI(email, password);
            setToken(response.token);
            setUser(response.user);

            // Save rememberMe preference and persist token only if checked
            if (window.electronAPI?.saveConfig) {
                await window.electronAPI.saveConfig({ rememberMe });
            }
            if (rememberMe) {
                await persistToken(response.token);
            } else {
                await persistToken(null); // Clear any previously saved token
            }

            if (response.user.role !== 'ADMIN' && response.user.role !== 'MANAGER') {
                const perms = await fetchPermissions(response.token);
                setPermissions(perms);
            }

            // Fetch locations
            const locs = await fetchUserLocations(response.token);
            setLocations(locs);
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
        setLocations([]);
        await persistToken(null);
    }, []);

    const hasPermission = useCallback((module: string, action: 'read' | 'write'): boolean => {
        if (!user) return false;
        if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
        const perm = permissions.find(p => p.module === module);
        if (!perm) return false;
        return action === 'read' ? perm.canRead : perm.canWrite;
    }, [user, permissions]);

    return (
        <AuthContext.Provider
            value={{
                user, token,
                isAuthenticated: !!user && !!token,
                isLoading, error,
                login, logout,
                permissions, hasPermission,
                appConfig, setAppConfig,
                locations,
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
