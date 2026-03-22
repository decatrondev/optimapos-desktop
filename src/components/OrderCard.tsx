import React, { useState } from 'react';
import { Order, OrderItem } from '../types/order';
import { getNextActionLabel, getStatusLabel, getStatusColorClass } from '../services/order.service';

interface OrderCardProps {
    order: Order;
    currencySymbol: string;
    storeName: string;
    onAdvanceStatus?: (orderId: number, orderType: string) => Promise<void>;
    onRemove: (orderId: number) => void;
    onPrint?: (order: Order) => void;
    isNew?: boolean;
    locationLabel?: string;
    userRole?: string;
}

function getItemName(item: OrderItem): string {
    if (item.product) return item.product.name;
    if (item.combo) return `🎁 ${item.combo.name}`;
    if (item.variant) return item.variant.name;
    return 'Producto';
}

function formatPrice(value: string | number, symbol: string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${symbol}${num.toFixed(2)}`;
}

function timeAgo(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `hace ${hrs}h ${mins % 60}m`;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, currencySymbol, storeName, onAdvanceStatus, onRemove, onPrint, isNew, locationLabel, userRole }) => {
    const [advancing, setAdvancing] = useState(false);
    const [statusError, setStatusError] = useState<string | null>(null);

    const isCompleted = order.status === 'DELIVERED' || order.status === 'CANCELLED';
    const customerName = order.user?.name || order.guestName || 'Cliente';
    const nextActionLabel = getNextActionLabel(order.status, order.type, userRole);
    const statusLabel = getStatusLabel(order.status);
    const statusClass = getStatusColorClass(order.status);

    const handleAdvance = async () => {
        setAdvancing(true);
        setStatusError(null);
        try {
            if (!onAdvanceStatus) return;
            await onAdvanceStatus(order.id, order.type);
        } catch (e: any) {
            setStatusError(e.message || 'Error al actualizar');
            setTimeout(() => setStatusError(null), 4000);
        } finally {
            setAdvancing(false);
        }
    };

    return (
        <div className={`order-card ${isNew ? 'order-card--new' : ''} ${isCompleted ? 'order-card--completed' : ''}`}>
            {/* Header */}
            <div className="order-card__header">
                <div className="order-card__header-left">
                    <span className="order-card__code">#{order.code}</span>
                    <span className={`order-card__type order-card__type--${order.type.toLowerCase()}`}>
                        {order.type === 'DELIVERY' ? '🛵 Delivery' : order.type === 'DINE_IN' ? '🍽️ Mesa' : '🏪 Recojo'}
                    </span>
                </div>
                <div className="order-card__header-right">
                    <span className={`order-card__status ${statusClass}`}>{statusLabel}</span>
                    <span className="order-card__time">{timeAgo(order.createdAt)}</span>
                </div>
            </div>

            {/* Location badge (visible in "all locations" mode) */}
            {locationLabel && (
                <div className="order-card__location-badge">📍 {locationLabel}</div>
            )}

            {/* Customer */}
            <div className="order-card__customer">
                <span className="order-card__customer-icon">👤</span>
                <div className="order-card__customer-info">
                    <span className="order-card__customer-name">{customerName}</span>
                    {(order.user?.phone || order.guestPhone) && (
                        <span className="order-card__customer-phone">📞 {order.user?.phone || order.guestPhone}</span>
                    )}
                    {order.guestAddress && <span className="order-card__customer-address">📍 {order.guestAddress}</span>}
                </div>
            </div>

            {/* Items */}
            <div className="order-card__items">
                {order.items.map((item, idx) => (
                    <div key={item.id || idx} className="order-card__item">
                        <div className="order-card__item-main">
                            <span className="order-card__item-qty">{item.quantity}x</span>
                            <span className="order-card__item-name">{getItemName(item)}</span>
                            <span className="order-card__item-price">{formatPrice(item.totalPrice, currencySymbol)}</span>
                        </div>
                        {item.addons.length > 0 && (
                            <div className="order-card__addons">
                                {item.addons.map((addon, aIdx) => (
                                    <span key={addon.id || aIdx} className="order-card__addon">
                                        + {addon.addon.name} {addon.quantity > 1 ? `x${addon.quantity}` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                        {item.notes && <div className="order-card__item-notes">📝 {item.notes}</div>}
                    </div>
                ))}
            </div>

            {/* Order notes */}
            {order.notes && (
                <div className="order-card__notes"><strong>Nota:</strong> {order.notes}</div>
            )}

            {/* Status error */}
            {statusError && <div className="order-card__error">⚠️ {statusError}</div>}

            {/* Footer */}
            <div className="order-card__footer">
                <div className="order-card__total">
                    <span>Total</span>
                    <span className="order-card__total-value">{formatPrice(order.total, currencySymbol)}</span>
                </div>
                <div className="order-card__actions">
                    {onPrint && (
                        <button className="btn btn--print" onClick={() => onPrint(order)}>
                            🖨️ Ticket
                        </button>
                    )}

                    {nextActionLabel && !isCompleted && onAdvanceStatus && (
                        <button className="btn btn--advance" onClick={handleAdvance} disabled={advancing}>
                            {advancing ? '⏳...' : nextActionLabel}
                        </button>
                    )}

                    {isCompleted && (
                        <button className="btn btn--remove" onClick={() => onRemove(order.id)}>🗑️ Quitar</button>
                    )}
                </div>
            </div>
        </div>
    );
};
