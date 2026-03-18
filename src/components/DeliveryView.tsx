import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '../types/order';

interface DeliveryViewProps {
    orders: Order[];
    token: string;
    serverUrl: string;
    onAdvanceStatus?: (orderId: number, orderType: string) => Promise<void>;
    onPrint?: (order: Order) => void;
    locationMap?: Record<number, string>;
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
    orders, token, serverUrl, onAdvanceStatus, onPrint, locationMap,
}) => {
    const deliveryOrders = orders.filter(o => o.type === 'DELIVERY' && o.status !== 'CANCELLED');

    // Group by status
    const readyForPickup = deliveryOrders.filter(o => o.status === 'PREPARING' || o.status === 'READY_PICKUP');
    const onTheWay = deliveryOrders.filter(o => o.status === 'ON_THE_WAY');
    const delivered = deliveryOrders.filter(o => o.status === 'DELIVERED');
    const pending = deliveryOrders.filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED');

    const [advancing, setAdvancing] = useState<number | null>(null);

    const handleAdvance = async (orderId: number) => {
        if (!onAdvanceStatus) return;
        setAdvancing(orderId);
        try {
            await onAdvanceStatus(orderId, 'DELIVERY');
        } catch { /* handled upstream */ }
        finally { setAdvancing(null); }
    };

    const getLocationLabel = (order: Order) => {
        if (!locationMap || !order.locationId) return undefined;
        return locationMap[order.locationId];
    };

    const renderCard = (order: Order) => {
        const customerName = order.user?.name || order.guestName || 'Cliente';
        const phone = order.user?.phone || order.guestPhone;
        const address = order.guestAddress || order.zone?.name || 'Sin dirección';
        const locationLabel = getLocationLabel(order);

        const actionLabel = (() => {
            switch (order.status) {
                case 'PENDING': return '✅ Confirmar';
                case 'CONFIRMED': return '🔥 Preparar';
                case 'PREPARING': return '📦 Listo';
                case 'READY_PICKUP': return '🛵 En camino';
                case 'ON_THE_WAY': return '✔️ Entregado';
                default: return null;
            }
        })();

        return (
            <div key={order.id} className="delivery-card">
                <div className="delivery-card__header">
                    <div className="delivery-card__header-left">
                        <span className="delivery-card__code">#{order.code}</span>
                        <DeliveryTimer createdAt={order.createdAt} />
                    </div>
                    <span className={`delivery-card__status status--${order.status.toLowerCase().replace('_', '-')}`}>
                        {order.status === 'ON_THE_WAY' ? '🛵 En camino' :
                         order.status === 'READY_PICKUP' ? '📦 Listo' :
                         order.status === 'PREPARING' ? '🔥 Preparando' :
                         order.status === 'DELIVERED' ? '✔️ Entregado' :
                         order.status === 'PENDING' ? '⏳ Pendiente' :
                         order.status === 'CONFIRMED' ? '✅ Confirmado' : order.status}
                    </span>
                </div>

                {locationLabel && (
                    <div className="delivery-card__location">📍 {locationLabel}</div>
                )}

                <div className="delivery-card__customer">
                    <div className="delivery-card__customer-name">👤 {customerName}</div>
                    {phone && (
                        <div className="delivery-card__customer-phone">
                            📞 {phone}
                            <button className="delivery-card__copy-btn" onClick={() => navigator.clipboard.writeText(phone)} title="Copiar">📋</button>
                        </div>
                    )}
                    <div className="delivery-card__address">
                        📍 {address}
                        <button className="delivery-card__copy-btn" onClick={() => navigator.clipboard.writeText(address)} title="Copiar">📋</button>
                    </div>
                </div>

                <div className="delivery-card__items">
                    {order.items.map((item, idx) => (
                        <div key={item.id || idx} className="delivery-card__item">
                            <span className="delivery-card__item-qty">{item.quantity}x</span>
                            <span className="delivery-card__item-name">
                                {item.product?.name || item.combo?.name || item.variant?.name || 'Producto'}
                            </span>
                        </div>
                    ))}
                    {order.notes && <div className="delivery-card__notes">📝 {order.notes}</div>}
                </div>

                <div className="delivery-card__footer">
                    <span className="delivery-card__total">
                        S/{(typeof order.total === 'string' ? parseFloat(order.total) : order.total).toFixed(2)}
                        {order.paymentMethod && <span className="delivery-card__payment"> — {order.paymentMethod}</span>}
                    </span>
                    <div className="delivery-card__actions">
                        {onPrint && (
                            <button className="btn btn--print btn--sm" onClick={() => onPrint(order)}>🖨️</button>
                        )}
                        {actionLabel && onAdvanceStatus && order.status !== 'DELIVERED' && (
                            <button
                                className="btn btn--advance btn--sm"
                                onClick={() => handleAdvance(order.id)}
                                disabled={advancing === order.id}
                            >
                                {advancing === order.id ? '⏳' : actionLabel}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (deliveryOrders.length === 0) {
        return (
            <main className="delivery-view">
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
            {pending.length > 0 && (
                <section className="delivery-section">
                    <h3 className="delivery-section__title">⏳ Pendientes <span className="delivery-section__count">{pending.length}</span></h3>
                    <div className="delivery-section__list">{pending.map(renderCard)}</div>
                </section>
            )}
            {readyForPickup.length > 0 && (
                <section className="delivery-section">
                    <h3 className="delivery-section__title">📦 Listos para envío <span className="delivery-section__count">{readyForPickup.length}</span></h3>
                    <div className="delivery-section__list">{readyForPickup.map(renderCard)}</div>
                </section>
            )}
            {onTheWay.length > 0 && (
                <section className="delivery-section">
                    <h3 className="delivery-section__title">🛵 En camino <span className="delivery-section__count">{onTheWay.length}</span></h3>
                    <div className="delivery-section__list">{onTheWay.map(renderCard)}</div>
                </section>
            )}
            {delivered.length > 0 && (
                <section className="delivery-section delivery-section--completed">
                    <h3 className="delivery-section__title">✔️ Entregados <span className="delivery-section__count">{delivered.length}</span></h3>
                    <div className="delivery-section__list">{delivered.map(renderCard)}</div>
                </section>
            )}
        </main>
    );
};
