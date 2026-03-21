import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Order, Role } from '../types/order';
import { claimDeliveryOrder } from '../services/order.service';

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
    userRole?: Role | string;
    userId?: number;
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
    orders, token, serverUrl, locationId, onPrint, locationMap, userRole, userId,
}) => {
    const [deliveryUsers, setDeliveryUsers] = useState<DeliveryUser[]>([]);
    const [localOrders, setLocalOrders] = useState<Order[]>([]);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [newOrderFlash, setNewOrderFlash] = useState(false);
    const [advancing, setAdvancing] = useState<number | null>(null);
    const [claiming, setClaiming] = useState<number | null>(null);
    const prevOrderCount = useRef(0);
    const isFirstLoad = useRef(true);

    const isDriver = userRole === 'DELIVERY';

    // Filter to delivery orders only
    useEffect(() => {
        const deliveryOrders = orders.filter(o =>
            o.type === 'DELIVERY' && o.status !== 'CANCELLED' && o.status !== 'DELIVERED'
        );

        // Alert sound when new orders arrive (only for DELIVERY type)
        if (!isFirstLoad.current && deliveryOrders.length > prevOrderCount.current) {
            if (soundEnabled) playAlertSound();
            setNewOrderFlash(true);
            setTimeout(() => setNewOrderFlash(false), 3000);
        }

        prevOrderCount.current = deliveryOrders.length;
        isFirstLoad.current = false;
        setLocalOrders(deliveryOrders);
    }, [orders, soundEnabled]);

    // Fetch available delivery users (only for admin/manager — drivers don't assign)
    useEffect(() => {
        if (isDriver) return;
        const locParam = locationId ? `?locationId=${locationId}` : '';
        fetch(`${serverUrl}/api/orders/delivery/users${locParam}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
            .then(res => res.ok ? res.json() : [])
            .then(data => setDeliveryUsers(data || []))
            .catch(() => {});
    }, [serverUrl, token, locationId, isDriver]);

    // Assign motorizado to order (admin/manager only)
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

    // Claim order (driver self-assigns)
    const handleClaim = useCallback(async (orderId: number) => {
        setClaiming(orderId);
        try {
            await claimDeliveryOrder(orderId, token);
            // Optimistic update
            setLocalOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, deliveryUserId: userId ?? null, deliveryUser: { id: userId ?? 0, name: 'Yo', phone: '' } } : o
            ));
        } catch (err: any) {
            console.error('Error claiming order:', err);
            alert(err.message || 'Error al tomar pedido');
        } finally {
            setClaiming(null);
        }
    }, [token, userId]);

    // Update delivery status
    const updateStatus = useCallback(async (orderId: number, status: string) => {
        setAdvancing(orderId);
        try {
            setLocalOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, status: status as any } : o
            ));

            const res = await fetch(`${serverUrl}/api/orders/delivery/${orderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status }),
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                console.error('Status update failed:', d.error);
                alert(d.error || 'Error al actualizar estado');
                // Revert
                setLocalOrders(orders.filter(o =>
                    o.type === 'DELIVERY' && o.status !== 'CANCELLED' && o.status !== 'DELIVERED'
                ));
            }

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

    // ─── Driver View: "Mis pedidos" + "Sin asignar" ───────────────────
    if (isDriver) {
        const myOrders = localOrders.filter(o => o.deliveryUser?.id === userId);
        const unassigned = localOrders.filter(o => !o.deliveryUser && !o.deliveryUserId);

        const renderDriverCard = (order: Order, isMine: boolean) => {
            const customerName = order.user?.name || order.guestName || 'Cliente';
            const phone = order.user?.phone || order.guestPhone;
            const address = order.guestAddress || order.zone?.name || 'Sin dirección';
            const badge = getStatusBadge(order.status);
            const isOnTheWay = order.status === 'ON_THE_WAY';
            const hasPhoto = !!order.deliveryPhoto;
            const locationLabel = getLocationLabel(order);

            return (
                <div key={order.id} className="delivery-card">
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

                    {order.notes && (
                        <div className="delivery-card__notes">⚠️ {order.notes}</div>
                    )}

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
                            {!isMine ? (
                                <button
                                    className="btn btn--delivery-claim"
                                    onClick={() => handleClaim(order.id)}
                                    disabled={claiming === order.id}
                                >
                                    {claiming === order.id ? '⏳' : '✋ Tomar pedido'}
                                </button>
                            ) : (
                                <>
                                    {onPrint && (
                                        <button className="btn btn--print btn--sm" onClick={() => onPrint(order)}>🖨️</button>
                                    )}
                                    {!isOnTheWay && (
                                        <button
                                            className="btn btn--delivery-go"
                                            onClick={() => updateStatus(order.id, 'ON_THE_WAY')}
                                            disabled={advancing === order.id}
                                        >
                                            {advancing === order.id ? '⏳' : '🛵 En camino'}
                                        </button>
                                    )}
                                    {isOnTheWay && (
                                        <button
                                            className={`btn btn--delivery-done ${!hasPhoto ? 'btn--disabled-hint' : ''}`}
                                            onClick={() => {
                                                if (!hasPhoto) {
                                                    alert('Sube la foto de entrega desde la app móvil antes de marcar como entregado');
                                                    return;
                                                }
                                                updateStatus(order.id, 'DELIVERED');
                                            }}
                                            disabled={advancing === order.id}
                                        >
                                            {advancing === order.id ? '⏳' : hasPhoto ? '✔️ Entregado' : '📷 Falta foto'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Photo indicator */}
                    {isMine && isOnTheWay && (
                        <div className={`delivery-card__photo-status ${hasPhoto ? 'delivery-card__photo-status--ok' : 'delivery-card__photo-status--pending'}`}>
                            {hasPhoto ? '📷 Foto subida' : '📷 Foto pendiente — sube desde app móvil'}
                        </div>
                    )}
                </div>
            );
        };

        if (myOrders.length === 0 && unassigned.length === 0) {
            return (
                <main className="delivery-view">
                    <div className="delivery-view__header">
                        <h2 className="delivery-view__title">🛵 Mis Entregas</h2>
                        <button
                            className={`delivery-view__sound-btn ${soundEnabled ? 'delivery-view__sound-btn--on' : ''}`}
                            onClick={() => setSoundEnabled(!soundEnabled)}
                        >
                            {soundEnabled ? '🔊' : '🔇'}
                        </button>
                    </div>
                    <div className="delivery-view__empty">
                        <span className="delivery-view__empty-icon">🛵</span>
                        <h2>Sin entregas</h2>
                        <p>No hay pedidos listos para entregar</p>
                    </div>
                </main>
            );
        }

        return (
            <main className="delivery-view">
                <div className="delivery-view__header">
                    <h2 className="delivery-view__title">🛵 Mis Entregas</h2>
                    <div className="delivery-view__header-right">
                        <span className="delivery-view__count">{myOrders.length + unassigned.length} pedidos</span>
                        <button
                            className={`delivery-view__sound-btn ${soundEnabled ? 'delivery-view__sound-btn--on' : ''}`}
                            onClick={() => setSoundEnabled(!soundEnabled)}
                        >
                            {soundEnabled ? '🔊' : '🔇'}
                        </button>
                    </div>
                </div>

                {newOrderFlash && (
                    <div className="delivery-view__flash">🔔 Nuevo pedido listo!</div>
                )}

                {/* My Orders Section */}
                {myOrders.length > 0 && (
                    <div className="delivery-section">
                        <div className="delivery-section__header delivery-section__header--mine">
                            📋 Tus pedidos
                            <span className="delivery-column__badge">{myOrders.length}</span>
                        </div>
                        <div className="delivery-section__grid">
                            {myOrders.map(o => renderDriverCard(o, true))}
                        </div>
                    </div>
                )}

                {/* Unassigned Section */}
                {unassigned.length > 0 && (
                    <div className="delivery-section">
                        <div className="delivery-section__header delivery-section__header--pool">
                            🆓 Sin asignar
                            <span className="delivery-column__badge">{unassigned.length}</span>
                        </div>
                        <div className="delivery-section__grid">
                            {unassigned.map(o => renderDriverCard(o, false))}
                        </div>
                    </div>
                )}
            </main>
        );
    }

    // ─── Admin/Manager View: Kanban board ─────────────────────────────

    // Group: "Por Recoger" (before ON_THE_WAY) and "En Camino" (ON_THE_WAY)
    const toPickupOrders = localOrders.filter(o =>
        ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_PICKUP'].includes(o.status)
    );
    const onTheWayOrders = localOrders.filter(o => o.status === 'ON_THE_WAY');

    const renderAdminCard = (order: Order) => {
        const customerName = order.user?.name || order.guestName || 'Cliente';
        const phone = order.user?.phone || order.guestPhone;
        const address = order.guestAddress || order.zone?.name || 'Sin dirección';
        const locationLabel = getLocationLabel(order);
        const badge = getStatusBadge(order.status);
        const isOnTheWay = order.status === 'ON_THE_WAY';
        const hasPhoto = !!order.deliveryPhoto;

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
                        value={order.deliveryUserId || ''}
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
                                className={`btn btn--delivery-done ${!hasPhoto ? 'btn--disabled-hint' : ''}`}
                                onClick={() => {
                                    if (!hasPhoto) {
                                        alert('El motorizado debe subir la foto de entrega desde la app móvil');
                                        return;
                                    }
                                    updateStatus(order.id, 'DELIVERED');
                                }}
                                disabled={advancing === order.id}
                            >
                                {advancing === order.id ? '⏳' : hasPhoto ? '✔️ Entregado' : '📷 Falta foto'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Photo indicator for on-the-way orders */}
                {isOnTheWay && (
                    <div className={`delivery-card__photo-status ${hasPhoto ? 'delivery-card__photo-status--ok' : 'delivery-card__photo-status--pending'}`}>
                        {hasPhoto ? '📷 Foto de entrega subida' : '📷 Esperando foto del motorizado'}
                    </div>
                )}
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
                <div className="delivery-column">
                    <div className="delivery-column__header delivery-column__header--pickup">
                        📦 Por Recoger
                        <span className="delivery-column__badge">{toPickupOrders.length}</span>
                    </div>
                    <div className="delivery-column__content">
                        {toPickupOrders.length === 0 ? (
                            <div className="delivery-column__empty">Todo al día</div>
                        ) : (
                            toPickupOrders.map(renderAdminCard)
                        )}
                    </div>
                </div>

                <div className="delivery-column">
                    <div className="delivery-column__header delivery-column__header--on-way">
                        🛵 En Camino
                        <span className="delivery-column__badge">{onTheWayOrders.length}</span>
                    </div>
                    <div className="delivery-column__content">
                        {onTheWayOrders.length === 0 ? (
                            <div className="delivery-column__empty">No hay viajes activos</div>
                        ) : (
                            onTheWayOrders.map(renderAdminCard)
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
};
