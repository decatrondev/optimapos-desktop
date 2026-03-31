import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AuthUser, AuthState, AppConfig, Location } from '../types/order';
import {
    login as loginAPI, persistToken, getPersistedToken, validateToken,
    AuthError, fetchUserLocations,
    persistRefreshToken, getPersistedRefreshToken, refreshAccessToken,
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

// getServerUrl imported from shared api module
import { getServerUrl, clearServerUrlCache } from '../services/api';

async function fetchPermissions(token: string): Promise<Permission[]> {
    try {
        const serverUrl = await getServerUrl();
        const res = await fetch(`${serverUrl}/api/users/me/permissions`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return getCachedPermissions();
        const perms = await res.json();
        // Cache for offline
        if (window.electronAPI?.saveConfig) {
            await window.electronAPI.saveConfig({ cachedPermissions: JSON.stringify(perms) } as any);
        }
        return perms;
    } catch {
        return getCachedPermissions();
    }
}

async function getCachedPermissions(): Promise<Permission[]> {
    try {
        if (window.electronAPI?.getConfig) {
            const config: any = await window.electronAPI.getConfig();
            if (config.cachedPermissions) return JSON.parse(config.cachedPermissions);
        }
    } catch {}
    return [];
}

async function getCachedLocations(): Promise<Location[]> {
    try {
        if (window.electronAPI?.getConfig) {
            const config: any = await window.electronAPI.getConfig();
            if (config.cachedLocations) return JSON.parse(config.cachedLocations);
        }
    } catch {}
    return [];
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
                let activeToken = await getPersistedToken();
                if (activeToken) {
                    let validUser = await validateToken(activeToken);

                    // Token expired? Try refresh
                    if (!validUser) {
                        const rt = await getPersistedRefreshToken();
                        if (rt) {
                            const refreshed = await refreshAccessToken(rt);
                            if (refreshed) {
                                activeToken = refreshed.token;
                                await persistToken(activeToken);
                                await persistRefreshToken(refreshed.refreshToken);
                                validUser = await validateToken(activeToken);
                            }
                        }
                    }

                    if (validUser && activeToken) {
                        setToken(activeToken);
                        setUser(validUser);
                        if (validUser.role !== 'ADMIN' && validUser.role !== 'MANAGER') {
                            const perms = await fetchPermissions(activeToken);
                            setPermissions(perms);
                        }
                        let locs = await fetchUserLocations(activeToken);
                        if (locs.length > 0) {
                            if (window.electronAPI?.saveConfig) {
                                await window.electronAPI.saveConfig({ cachedLocations: JSON.stringify(locs) } as any);
                            }
                        } else {
                            locs = await getCachedLocations();
                        }
                        setLocations(locs);
                    } else {
                        await persistToken(null);
                        await persistRefreshToken(null);
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
                await persistRefreshToken(response.refreshToken || null);
            } else {
                await persistToken(null);
                await persistRefreshToken(null);
            }

            if (response.user.role !== 'ADMIN' && response.user.role !== 'MANAGER') {
                const perms = await fetchPermissions(response.token);
                setPermissions(perms);
            }

            // Fetch locations + cache
            const locs = await fetchUserLocations(response.token);
            setLocations(locs);
            if (window.electronAPI?.saveConfig && locs.length > 0) {
                await window.electronAPI.saveConfig({ cachedLocations: JSON.stringify(locs) } as any);
            }
        } catch (e) {
            const message = e instanceof AuthError ? e.message : 'Error de conexión. Verifica tu red.';
            setError(message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Auto-refresh token every 10 minutes while authenticated
    useEffect(() => {
        if (!token) return;
        const interval = setInterval(async () => {
            const rt = await getPersistedRefreshToken();
            if (!rt) return;
            const refreshed = await refreshAccessToken(rt);
            if (refreshed) {
                setToken(refreshed.token);
                await persistToken(refreshed.token);
                await persistRefreshToken(refreshed.refreshToken);
                console.log('[Auth] Token refreshed automatically');
            }
        }, 10 * 60 * 1000); // 10 minutes
        return () => clearInterval(interval);
    }, [token]);

    const logout = useCallback(async () => {
        setUser(null);
        setToken(null);
        setError(null);
        setPermissions([]);
        setLocations([]);
        await persistToken(null);
        await persistRefreshToken(null);
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
