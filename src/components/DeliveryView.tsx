import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Order } from '../types/order';

interface DeliveryUser {
    id: number;
    name: string;
    phone: string;
}

interface DeliveryViewProps {
    orders: Order[];
    token: string;
    serverUrl: string;
    locationId?: number;
    onPrint?: (order: Order) => void;
    locationMap?: Record<number, string>;
}

function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [0, 0.15, 0.3].forEach((delay) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 660;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.12);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.12);
        });
        setTimeout(() => ctx.close(), 600);
    } catch { /* Audio not supported */ }
}

function DeliveryTimer({ createdAt }: { createdAt: string }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const start = new Date(createdAt).getTime();
        const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
        tick();
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [createdAt]);

    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timerClass = mins >= 30 ? 'delivery-timer--red' : mins >= 15 ? 'delivery-timer--yellow' : 'delivery-timer--green';

    return (
        <span className={`delivery-timer ${timerClass}`}>
            {mins}:{secs.toString().padStart(2, '0')}
        </span>
    );
}

export const DeliveryView: React.FC<DeliveryViewProps> = ({
    orders, token, serverUrl, locationId, onPrint, locationMap,
}) => {
    const [deliveryUsers, setDeliveryUsers] = useState<DeliveryUser[]>([]);
    const [localOrders, setLocalOrders] = useState<Order[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [newOrderFlash, setNewOrderFlash] = useState(false);
    const [advancing, setAdvancing] = useState<number | null>(null);
    const prevOrderCount = useRef(0);
    const isFirstLoad = useRef(true);

    // Filter to delivery orders only (backend already filters, but be safe)
    useEffect(() => {
        const deliveryOrders = orders.filter(o =>
            o.type === 'DELIVERY' && o.status !== 'CANCELLED' && o.status !== 'DELIVERED'
        );

        // Alert sound when new orders arrive
        if (!isFirstLoad.current && deliveryOrders.length > prevOrderCount.current) {
            if (soundEnabled) playAlertSound();
            setNewOrderFlash(true);
            setTimeout(() => setNewOrderFlash(false), 3000);
        }

        prevOrderCount.current = deliveryOrders.length;
        isFirstLoad.current = false;
        setLocalOrders(deliveryOrders);
    }, [orders, soundEnabled]);

    // Fetch available delivery users (motorizados)
    useEffect(() => {
        const locParam = locationId ? `?locationId=${locationId}` : '';
        fetch(`${serverUrl}/api/orders/delivery/users${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => setDeliveryUsers(data || []))
            .catch(() => {});
    }, [serverUrl, token, locationId]);

    // Assign motorizado to order
    const assignDriver = useCallback(async (orderId: number, deliveryUserId: number | null) => {
        try {
            const res = await fetch(`${serverUrl}/api/orders/delivery/${orderId}/assign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ deliveryUserId }),
            });
            if (res.ok) {
                const data = await res.json();
                setLocalOrders(prev => prev.map(o =>
                    o.id === orderId ? { ...o, deliveryUserId, deliveryUser: data.order?.deliveryUser } : o
                ));
            }
        } catch (err) {
            console.error('Error assigning driver:', err);
        }
    }, [serverUrl, token]);

    // Update delivery status — only 2 transitions: → ON_THE_WAY and → DELIVERED
    const updateStatus = useCallback(async (orderId: number, status: string) => {
        setAdvancing(orderId);
        try {
            // Optimistic UI update
            setLocalOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, status: status as any } : o
            ));

            const res = await fetch(`${serverUrl}/api/orders/delivery/${orderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status }),
            });

            if (!res.ok) {
                // Revert on error
                const d = await res.json().catch(() => ({}));
                console.error('Status update failed:', d.error);
                setLocalOrders(orders.filter(o =>
                    o.type === 'DELIVERY' && o.status !== 'CANCELLED' && o.status !== 'DELIVERED'
                ));
            }

            // Remove delivered orders after a brief delay
            if (status === 'DELIVERED') {
                setTimeout(() => {
                    setLocalOrders(prev => prev.filter(o => o.id !== orderId));
                }, 1500);
            }
        } catch (err) {
            console.error('Status update error:', err);
        } finally {
            setAdvancing(null);
        }
    }, [serverUrl, token, orders]);

    const getLocationLabel = (order: Order) => {
        if (!locationMap || !order.locationId) return undefined;
        return locationMap[order.locationId];
    };

    // Group: "Por Recoger" (before ON_THE_WAY) and "En Camino" (ON_THE_WAY)
    const toPickupOrders = localOrders.filter(o =>
        ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_PICKUP'].includes(o.status)
    );
    const onTheWayOrders = localOrders.filter(o => o.status === 'ON_THE_WAY');

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'PENDING': return { label: '⏳ Pendiente', cls: 'delivery-badge--pending' };
            case 'CONFIRMED': return { label: '✅ Confirmado', cls: 'delivery-badge--confirmed' };
            case 'PREPARING': return { label: '🔥 Preparando', cls: 'delivery-badge--preparing' };
            case 'READY_PICKUP': return { label: '📦 Listo!', cls: 'delivery-badge--ready' };
            case 'ON_THE_WAY': return { label: '🛵 En camino', cls: 'delivery-badge--on-way' };
            default: return { label: status, cls: '' };
        }
    };

    const renderCard = (order: Order) => {
        const customerName = order.user?.name || order.guestName || 'Cliente';
        const phone = order.user?.phone || order.guestPhone;
        const address = order.guestAddress || order.zone?.name || 'Sin dirección';
        const locationLabel = getLocationLabel(order);
        const badge = getStatusBadge(order.status);
        const isOnTheWay = order.status === 'ON_THE_WAY';

        return (
            <div key={order.id} className="delivery-card">
                {/* Header */}
                <div className="delivery-card__header">
                    <div className="delivery-card__header-left">
                        <span className="delivery-card__code">#{order.code?.split('-')[1] || order.code}</span>
                        <DeliveryTimer createdAt={order.createdAt} />
                    </div>
                    <span className={`delivery-badge ${badge.cls}`}>{badge.label}</span>
                </div>

                {locationLabel && (
                    <div className="delivery-card__location">📍 {locationLabel}</div>
                )}

                {/* Customer & Address */}
                <div className="delivery-card__customer">
                    <div className="delivery-card__address">
                        📍 {address}
                        <button className="delivery-card__copy-btn" onClick={() => navigator.clipboard.writeText(address)} title="Copiar">📋</button>
                    </div>
                    <div className="delivery-card__customer-row">
                        <span className="delivery-card__customer-name">👤 {customerName}</span>
                        {phone && (
                            <span className="delivery-card__customer-phone">
                                📞 {phone}
                                <button className="delivery-card__copy-btn" onClick={() => navigator.clipboard.writeText(phone)} title="Copiar">📋</button>
                            </span>
                        )}
                    </div>
                </div>

                {/* Notes */}
                {order.notes && (
                    <div className="delivery-card__notes">⚠️ {order.notes}</div>
                )}

                {/* Driver Assignment */}
                <div className="delivery-card__driver">
                    <span className="delivery-card__driver-label">🛵 Motorizado:</span>
                    <select
                        value={(order as any).deliveryUserId || ''}
                        onChange={(e) => assignDriver(order.id, e.target.value ? parseInt(e.target.value) : null)}
                        className="delivery-card__driver-select"
                    >
                        <option value="">Sin asignar</option>
                        {deliveryUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                {/* Items */}
                <div className="delivery-card__items">
                    {order.items.map((item, idx) => (
                        <div key={item.id || idx} className="delivery-card__item">
                            <span className="delivery-card__item-qty">{item.quantity}x</span>
                            <span className="delivery-card__item-name">
                                {item.product?.name || item.combo?.name || item.variant?.name || 'Producto'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Footer: Total + Actions */}
                <div className="delivery-card__footer">
                    <div className="delivery-card__total">
                        <span className="delivery-card__total-label">Cobrar:</span>
                        <span className="delivery-card__total-amount">
                            S/{(typeof order.total === 'string' ? parseFloat(order.total) : order.total).toFixed(2)}
                        </span>
                        {order.paymentMethod && (
                            <span className="delivery-card__payment">{order.paymentMethod}</span>
                        )}
                    </div>
                    <div className="delivery-card__actions">
                        {onPrint && (
                            <button className="btn btn--print btn--sm" onClick={() => onPrint(order)}>🖨️</button>
                        )}
                        {!isOnTheWay && (
                            <button
                                className="btn btn--delivery-go"
                                onClick={() => updateStatus(order.id, 'ON_THE_WAY')}
                                disabled={advancing === order.id}
                            >
                                {advancing === order.id ? '⏳' : '🛵 Iniciar Viaje'}
                            </button>
                        )}
                        {isOnTheWay && (
                            <button
                                className="btn btn--delivery-done"
                                onClick={() => updateStatus(order.id, 'DELIVERED')}
                                disabled={advancing === order.id}
                            >
                                {advancing === order.id ? '⏳' : '✔️ Entregado'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (localOrders.length === 0) {
        return (
            <main className="delivery-view">
                <div className="delivery-view__header">
                    <h2 className="delivery-view__title">🛵 Delivery</h2>
                    <button
                        className={`delivery-view__sound-btn ${soundEnabled ? 'delivery-view__sound-btn--on' : ''}`}
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        title={soundEnabled ? 'Silenciar alertas' : 'Activar alertas'}
                    >
                        {soundEnabled ? '🔊' : '🔇'}
                    </button>
                </div>
                <div className="delivery-view__empty">
                    <span className="delivery-view__empty-icon">🛵</span>
                    <h2>Sin entregas</h2>
                    <p>No hay pedidos de delivery activos</p>
                </div>
            </main>
        );
    }

    return (
        <main className="delivery-view">
            <div className="delivery-view__header">
                <h2 className="delivery-view__title">🛵 Delivery</h2>
                <div className="delivery-view__header-right">
                    <span className="delivery-view__count">{localOrders.length} pedidos</span>
                    <button
                        className={`delivery-view__sound-btn ${soundEnabled ? 'delivery-view__sound-btn--on' : ''}`}
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        title={soundEnabled ? 'Silenciar alertas' : 'Activar alertas'}
                    >
                        {soundEnabled ? '🔊' : '🔇'}
                    </button>
                </div>
            </div>

            {newOrderFlash && (
                <div className="delivery-view__flash">
                    🔔 Nuevo pedido delivery!
                </div>
            )}

            {/* Two-column board: Por Recoger | En Camino */}
            <div className="delivery-board">
                {/* Column: Por Recoger */}
                <div className="delivery-column">
                    <div className="delivery-column__header delivery-column__header--pickup">
                        📦 Por Recoger
                        <span className="delivery-column__badge">{toPickupOrders.length}</span>
                    </div>
                    <div className="delivery-column__content">
                        {toPickupOrders.length === 0 ? (
                            <div className="delivery-column__empty">Todo al día</div>
                        ) : (
                            toPickupOrders.map(renderCard)
                        )}
                    </div>
                </div>

                {/* Column: En Camino */}
                <div className="delivery-column">
                    <div className="delivery-column__header delivery-column__header--on-way">
                        🛵 En Camino
                        <span className="delivery-column__badge">{onTheWayOrders.length}</span>
                    </div>
                    <div className="delivery-column__content">
                        {onTheWayOrders.length === 0 ? (
                            <div className="delivery-column__empty">No hay viajes activos</div>
                        ) : (
                            onTheWayOrders.map(renderCard)
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
};
