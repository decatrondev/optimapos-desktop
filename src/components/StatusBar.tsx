import React from 'react';
import { useClock } from '../hooks/useClock';
import { AuthUser } from '../types/order';

interface StatusBarProps {
    storeName: string;
    locationName?: string | null;
    isConnected: boolean;
    orderCount: number;
    user: AuthUser | null;
    onLogout?: () => void;
    onSettings?: () => void;
    onChangeServer?: () => void;
    onChangeLocation?: () => void;
    canChangeLocation?: boolean;
}

function getRoleBadge(role: string): { label: string; className: string } {
    switch (role) {
        case 'ADMIN': return { label: 'Admin', className: 'role-badge--admin' };
        case 'MANAGER': return { label: 'Manager', className: 'role-badge--admin' };
        case 'VENDOR': return { label: 'Cajero', className: 'role-badge--vendor' };
        case 'KITCHEN': return { label: 'Cocina', className: 'role-badge--kitchen' };
        case 'DELIVERY': return { label: 'Delivery', className: 'role-badge--delivery' };
        default: return { label: role, className: '' };
    }
}

export const StatusBar: React.FC<StatusBarProps> = ({
    storeName, locationName, isConnected, orderCount, user, onLogout, onSettings, onChangeServer, onChangeLocation, canChangeLocation,
}) => {
    const time = useClock();
    const roleBadge = user ? getRoleBadge(user.role) : null;

    return (
        <header className="status-bar">
            <div className="status-bar__left">
                <div className="status-bar__logo">
                    <span className="status-bar__logo-icon">⚡</span>
                    <div>
                        <h1 className="status-bar__title">{storeName}</h1>
                        {locationName && (
                            <span
                                className={`status-bar__subtitle ${canChangeLocation ? 'status-bar__subtitle--clickable' : ''}`}
                                onClick={canChangeLocation ? onChangeLocation : undefined}
                                title={canChangeLocation ? 'Cambiar local' : undefined}
                            >
                                📍 {locationName} {canChangeLocation ? '▾' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="status-bar__center">
                <div className="status-bar__clock">{time}</div>
            </div>

            <div className="status-bar__right">
                {user && (
                    <div className="status-bar__user">
                        <span className="status-bar__user-name">👤 {user.name}</span>
                        {roleBadge && (
                            <span className={`status-bar__role-badge ${roleBadge.className}`}>
                                {roleBadge.label}
                            </span>
                        )}
                        {onSettings && (
                            <button className="btn btn--logout" onClick={onSettings} title="Cambiar impresora">
                                🖨️
                            </button>
                        )}
                        {onChangeServer && (
                            <button className="btn btn--logout" onClick={onChangeServer} title="Cambiar servidor">
                                🌐
                            </button>
                        )}
                        {onLogout && (
                            <button className="btn btn--logout" onClick={onLogout} title="Cerrar sesión">
                                🚪
                            </button>
                        )}
                    </div>
                )}

                <div className="status-bar__orders-badge">
                    <span className="status-bar__orders-count">{orderCount}</span>
                    <span className="status-bar__orders-label">pedidos</span>
                </div>

                <div className={`status-bar__connection ${isConnected ? 'connected' : 'disconnected'}`}>
                    <span className="status-bar__connection-dot" />
                    <span className="status-bar__connection-text">
                        {isConnected ? 'Conectado' : 'Sin conexión'}
                    </span>
                </div>
            </div>
        </header>
    );
};
