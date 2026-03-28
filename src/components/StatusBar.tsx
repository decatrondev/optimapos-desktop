import React from 'react';
import { useClock } from '../hooks/useClock';
import { AuthUser } from '../types/order';
import { ConnectionStatus } from '../hooks/useOffline';

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
    onRefresh?: () => void;
    offlineStatus?: ConnectionStatus;
    pendingOrders?: number;
    lastSync?: string | null;
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
    onRefresh, offlineStatus, pendingOrders, lastSync,
}) => {
    const time = useClock();
    const roleBadge = user ? getRoleBadge(user.role) : null;

    const isOffline = offlineStatus === 'disconnected' || (!offlineStatus && !isConnected);
    const isReconnecting = offlineStatus === 'reconnecting';

    return (
        <>
        {(isOffline || isReconnecting) && (
            <div className="offline-banner" style={{
                background: isReconnecting ? '#d97706' : '#dc2626',
                color: '#fff',
                textAlign: 'center',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
            }}>
                <span>{isReconnecting ? '🔄' : '📴'}</span>
                <span>{isReconnecting ? 'Reconectando al servidor...' : 'Trabajando sin conexion — los pedidos se sincronizaran al reconectar'}</span>
                {pendingOrders != null && pendingOrders > 0 && (
                    <span style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '2px 8px', fontSize: '12px' }}>
                        {pendingOrders} pendiente{pendingOrders > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        )}
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

                {onRefresh && (
                    <button className="btn btn--refresh" onClick={onRefresh} title="Actualizar datos">
                        🔄
                    </button>
                )}

                <div className="status-bar__orders-badge">
                    <span className="status-bar__orders-count">{orderCount}</span>
                    <span className="status-bar__orders-label">pedidos</span>
                </div>

                {pendingOrders != null && pendingOrders > 0 && (
                    <div className="status-bar__pending" title={`${pendingOrders} pedido(s) pendientes de sincronizar`}>
                        <span className="status-bar__pending-icon">📴</span>
                        <span className="status-bar__pending-count">{pendingOrders}</span>
                    </div>
                )}

                <div className={`status-bar__connection ${offlineStatus === 'connected' || (!offlineStatus && isConnected) ? 'connected' : offlineStatus === 'reconnecting' ? 'reconnecting' : 'disconnected'}`}
                     title={lastSync ? `Ultimo sync: ${new Date(lastSync).toLocaleTimeString()}` : undefined}>
                    <span className="status-bar__connection-dot" />
                    <span className="status-bar__connection-text">
                        {offlineStatus === 'connected' || (!offlineStatus && isConnected)
                            ? 'Conectado'
                            : offlineStatus === 'reconnecting'
                                ? 'Reconectando...'
                                : 'Sin conexion'}
                    </span>
                </div>
            </div>
        </header>
        </>
    );
};
