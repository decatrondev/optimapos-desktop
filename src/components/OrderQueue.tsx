import React from 'react';
import { Order } from '../types/order';
import { OrderCard } from './OrderCard';

interface OrderQueueProps {
    orders: Order[];
    currencySymbol: string;
    storeName: string;
    onAdvanceStatus?: (orderId: number, orderType: string) => Promise<void>;
    onRemove: (orderId: number) => void;
    onPrint?: (order: Order) => void;
}

export const OrderQueue: React.FC<OrderQueueProps> = ({ orders, currencySymbol, storeName, onAdvanceStatus, onRemove, onPrint }) => {
    const activeOrders = orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const completedOrders = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED');

    return (
        <main className="order-queue">
            {orders.length === 0 ? (
                <div className="order-queue__empty">
                    <div className="order-queue__empty-icon">🍽️</div>
                    <h2 className="order-queue__empty-title">Sin pedidos</h2>
                    <p className="order-queue__empty-subtitle">Esperando nuevos pedidos...</p>
                    <div className="order-queue__empty-pulse" />
                </div>
            ) : (
                <>
                    {activeOrders.length > 0 && (
                        <section className="order-queue__section">
                            <h2 className="order-queue__section-title">
                                🔥 Pedidos Activos
                                <span className="order-queue__section-count">{activeOrders.length}</span>
                            </h2>
                            <div className="order-queue__grid">
                                {activeOrders.map((order, idx) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        currencySymbol={currencySymbol}
                                        storeName={storeName}
                                        onAdvanceStatus={onAdvanceStatus}
                                        onRemove={onRemove}
                                        onPrint={onPrint}
                                        isNew={idx === 0}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {completedOrders.length > 0 && (
                        <section className="order-queue__section order-queue__section--completed">
                            <h2 className="order-queue__section-title">
                                ✅ Completados
                                <span className="order-queue__section-count">{completedOrders.length}</span>
                            </h2>
                            <div className="order-queue__grid">
                                {completedOrders.map((order) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        currencySymbol={currencySymbol}
                                        storeName={storeName}
                                        onAdvanceStatus={onAdvanceStatus}
                                        onRemove={onRemove}
                                        onPrint={onPrint}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </main>
    );
};
