import React, { useState, useEffect, useCallback } from 'react';
import { Order } from '../types/order';

type ActiveView = 'dashboard' | 'kitchen' | 'delivery' | 'cash' | 'orders';

interface DashboardStats {
    totalSales: number;
    totalOrders: number;
    avgTicket: number;
    cancelledOrders: number;
}

interface ManagerDashboardProps {
    token: string;
    serverUrl: string;
    locationId?: number;
    activeOrders: Order[];
    onNavigate: (view: ActiveView) => void;
    currentView: ActiveView;
}

async function fetchDashboardStats(token: string, serverUrl: string, locationId?: number): Promise<DashboardStats> {
    const today = new Date().toISOString().split('T')[0];
    const locParam = locationId ? `&locationId=${locationId}` : '';
    try {
        const res = await fetch(`${serverUrl}/api/reports/summary?from=${today}&to=${today}${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return { totalSales: 0, totalOrders: 0, avgTicket: 0, cancelledOrders: 0 };
        const data = await res.json();
        return {
            totalSales: parseFloat(data.totalSales) || 0,
            totalOrders: parseInt(data.totalOrders) || 0,
            avgTicket: parseFloat(data.avgTicket) || 0,
            cancelledOrders: parseInt(data.cancelledOrders) || 0,
        };
    } catch {
        return { totalSales: 0, totalOrders: 0, avgTicket: 0, cancelledOrders: 0 };
    }
}

async function fetchTopProducts(token: string, serverUrl: string, locationId?: number): Promise<{ name: string; qty: number }[]> {
    const today = new Date().toISOString().split('T')[0];
    const locParam = locationId ? `&locationId=${locationId}` : '';
    try {
        const res = await fetch(`${serverUrl}/api/reports/top-products?from=${today}&to=${today}&limit=5${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

async function fetchCashStatus(token: string, serverUrl: string, locationId?: number): Promise<{ isOpen: boolean; openingAmount?: number; openedAt?: string } | null> {
    const locParam = locationId ? `?locationId=${locationId}` : '';
    try {
        const res = await fetch(`${serverUrl}/api/cash/current${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) return { isOpen: false };
        const data = await res.json();
        if (!data || !data.id) return { isOpen: false };
        return { isOpen: true, openingAmount: parseFloat(data.openingAmount) || 0, openedAt: data.openedAt };
    } catch {
        return null;
    }
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
    token, serverUrl, locationId, activeOrders, onNavigate, currentView,
}) => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [topProducts, setTopProducts] = useState<{ name: string; qty: number }[]>([]);
    const [cashStatus, setCashStatus] = useState<{ isOpen: boolean; openingAmount?: number; openedAt?: string } | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [s, tp, cs] = await Promise.all([
            fetchDashboardStats(token, serverUrl, locationId),
            fetchTopProducts(token, serverUrl, locationId),
            fetchCashStatus(token, serverUrl, locationId),
        ]);
        setStats(s);
        setTopProducts(tp);
        setCashStatus(cs);
        setLoading(false);
    }, [token, serverUrl, locationId]);

    useEffect(() => {
        loadData();
        const iv = setInterval(loadData, 60000); // refresh every minute
        return () => clearInterval(iv);
    }, [loadData]);

    const pendingCount = activeOrders.filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED').length;
    const preparingCount = activeOrders.filter(o => o.status === 'PREPARING').length;
    const deliveryCount = activeOrders.filter(o => (o.status === 'ON_THE_WAY' || o.status === 'READY_PICKUP')).length;

    const navItems: { key: ActiveView; label: string; icon: string; badge?: number }[] = [
        { key: 'dashboard', label: 'Dashboard', icon: '📊' },
        { key: 'kitchen', label: 'Cocina', icon: '🔥', badge: pendingCount + preparingCount },
        { key: 'orders', label: 'Pedidos', icon: '📋', badge: activeOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length },
        { key: 'delivery', label: 'Delivery', icon: '🛵', badge: deliveryCount },
        { key: 'cash', label: 'Caja', icon: '💰' },
    ];

    if (currentView !== 'dashboard') {
        // Only render nav bar when not on dashboard (the view itself is rendered by parent)
        return null;
    }

    return (
        <main className="manager-dashboard">
            {loading ? (
                <div className="manager-dashboard__loading">
                    <div className="loading-screen__spinner" />
                    <p>Cargando estadísticas...</p>
                </div>
            ) : (
                <>
                    {/* Stats row */}
                    <div className="dashboard-stats">
                        <div className="dashboard-stat dashboard-stat--sales">
                            <span className="dashboard-stat__icon">💰</span>
                            <div className="dashboard-stat__content">
                                <span className="dashboard-stat__value">S/{stats?.totalSales.toFixed(2) ?? '0.00'}</span>
                                <span className="dashboard-stat__label">Ventas del día</span>
                            </div>
                        </div>
                        <div className="dashboard-stat dashboard-stat--orders">
                            <span className="dashboard-stat__icon">📦</span>
                            <div className="dashboard-stat__content">
                                <span className="dashboard-stat__value">{stats?.totalOrders ?? 0}</span>
                                <span className="dashboard-stat__label">Pedidos hoy</span>
                            </div>
                        </div>
                        <div className="dashboard-stat dashboard-stat--avg">
                            <span className="dashboard-stat__icon">📈</span>
                            <div className="dashboard-stat__content">
                                <span className="dashboard-stat__value">S/{stats?.avgTicket.toFixed(2) ?? '0.00'}</span>
                                <span className="dashboard-stat__label">Ticket promedio</span>
                            </div>
                        </div>
                        <div className="dashboard-stat dashboard-stat--cancelled">
                            <span className="dashboard-stat__icon">❌</span>
                            <div className="dashboard-stat__content">
                                <span className="dashboard-stat__value">{stats?.cancelledOrders ?? 0}</span>
                                <span className="dashboard-stat__label">Cancelados</span>
                            </div>
                        </div>
                    </div>

                    {/* Quick access cards */}
                    <div className="dashboard-nav-cards">
                        <button className="dashboard-nav-card dashboard-nav-card--kitchen" onClick={() => onNavigate('kitchen')}>
                            <span className="dashboard-nav-card__icon">🔥</span>
                            <span className="dashboard-nav-card__title">Cocina</span>
                            <span className="dashboard-nav-card__desc">{pendingCount} pendientes, {preparingCount} preparando</span>
                        </button>
                        <button className="dashboard-nav-card dashboard-nav-card--orders" onClick={() => onNavigate('orders')}>
                            <span className="dashboard-nav-card__icon">📋</span>
                            <span className="dashboard-nav-card__title">Pedidos</span>
                            <span className="dashboard-nav-card__desc">{activeOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length} activos</span>
                        </button>
                        <button className="dashboard-nav-card dashboard-nav-card--delivery" onClick={() => onNavigate('delivery')}>
                            <span className="dashboard-nav-card__icon">🛵</span>
                            <span className="dashboard-nav-card__title">Delivery</span>
                            <span className="dashboard-nav-card__desc">{deliveryCount} en camino / listos</span>
                        </button>
                        <button className="dashboard-nav-card dashboard-nav-card--cash" onClick={() => onNavigate('cash')}>
                            <span className="dashboard-nav-card__icon">💰</span>
                            <span className="dashboard-nav-card__title">Caja</span>
                            <span className="dashboard-nav-card__desc">
                                {cashStatus?.isOpen ? 'Abierta' : 'Cerrada'}
                                {cashStatus?.isOpen && cashStatus.openingAmount !== undefined && ` — S/${cashStatus.openingAmount.toFixed(2)}`}
                            </span>
                        </button>
                    </div>

                    {/* Bottom row: top products + cash status */}
                    <div className="dashboard-bottom">
                        <div className="dashboard-panel">
                            <h3 className="dashboard-panel__title">🏆 Top Productos Hoy</h3>
                            {topProducts.length === 0 ? (
                                <p className="dashboard-panel__empty">Sin ventas aún</p>
                            ) : (
                                <div className="dashboard-panel__list">
                                    {topProducts.map((p, i) => (
                                        <div key={i} className="dashboard-top-product">
                                            <span className="dashboard-top-product__rank">#{i + 1}</span>
                                            <span className="dashboard-top-product__name">{p.name}</span>
                                            <span className="dashboard-top-product__qty">{p.qty} uds</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="dashboard-panel">
                            <h3 className="dashboard-panel__title">📊 Resumen Operativo</h3>
                            <div className="dashboard-panel__list">
                                <div className="dashboard-summary-row">
                                    <span>⏳ Pendientes</span>
                                    <span className="dashboard-summary-row__value">{pendingCount}</span>
                                </div>
                                <div className="dashboard-summary-row">
                                    <span>🔥 Preparando</span>
                                    <span className="dashboard-summary-row__value">{preparingCount}</span>
                                </div>
                                <div className="dashboard-summary-row">
                                    <span>🛵 En delivery</span>
                                    <span className="dashboard-summary-row__value">{activeOrders.filter(o => o.status === 'ON_THE_WAY').length}</span>
                                </div>
                                <div className="dashboard-summary-row">
                                    <span>📦 Listos para recoger</span>
                                    <span className="dashboard-summary-row__value">{activeOrders.filter(o => o.status === 'READY_PICKUP').length}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
};
