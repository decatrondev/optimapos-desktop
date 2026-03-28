import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Order, OrderItem, OrderStatus } from '../types/order';
import { getNextActionLabel, getNextStatus } from '../services/order.service';
import { getItemName } from '../utils/format';

interface KitchenKanbanProps {
    orders: Order[];
    currencySymbol: string;
    onAdvanceStatus?: (orderId: number, orderType: string) => Promise<void>;
    onRemove: (orderId: number) => void;
    onPrint?: (order: Order) => void;
    locationMap?: Record<number, string>;
    userRole?: string;
}

type KanbanColumn = 'pending' | 'preparing' | 'ready';

const COLUMNS: { key: KanbanColumn; title: string; icon: string; statuses: OrderStatus[] }[] = [
    { key: 'pending', title: 'Pendiente', icon: '⏳', statuses: ['PENDING', 'CONFIRMED'] },
    { key: 'preparing', title: 'En Preparación', icon: '🔥', statuses: ['PREPARING'] },
    { key: 'ready', title: 'Listo', icon: '✅', statuses: ['READY_PICKUP', 'ON_THE_WAY'] },
];

function getItemCategory(item: OrderItem): string | null {
    return item.product?.category?.name || item.combo?.category?.name || null;
}

function OrderTimer({ createdAt }: { createdAt: string }) {
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
    const timerClass = mins >= 20 ? 'kanban-timer--red' : mins >= 10 ? 'kanban-timer--yellow' : 'kanban-timer--green';

    return (
        <span className={`kanban-timer ${timerClass}`}>
            {mins}:{secs.toString().padStart(2, '0')}
        </span>
    );
}

const KanbanCard: React.FC<{
    order: Order;
    currencySymbol: string;
    onAdvance?: (orderId: number, orderType: string) => Promise<void>;
    onRemove: (orderId: number) => void;
    onPrint?: (order: Order) => void;
    locationLabel?: string;
    highlightCategories?: Set<string>;
    userRole?: string;
}> = ({ order, currencySymbol, onAdvance, onRemove, onPrint, locationLabel, highlightCategories, userRole }) => {
    const [advancing, setAdvancing] = useState(false);

    const typeLabel = order.type === 'DELIVERY' ? '🛵 Delivery' : order.type === 'DINE_IN' ? '🍽️ Mesa' : '🏪 Recojo';
    const tableInfo = order.table ? ` — Mesa ${order.table.name}` : '';
    const isReady = order.status === 'READY_PICKUP' || order.status === 'ON_THE_WAY' || order.status === 'DELIVERED';

    const handleAdvance = async () => {
        if (!onAdvance) return;
        setAdvancing(true);
        try {
            await onAdvance(order.id, order.type);
        } catch {
            // handled upstream
        } finally {
            setAdvancing(false);
        }
    };

    const nextLabel = getNextActionLabel(order.status, order.type, userRole);

    return (
        <div className={`kanban-card ${isReady ? 'kanban-card--ready' : ''}`}>
            <div className="kanban-card__header">
                <div className="kanban-card__header-left">
                    <span className="kanban-card__code">#{order.code}</span>
                    <span className="kanban-card__type">{typeLabel}{tableInfo}</span>
                </div>
                <OrderTimer createdAt={order.createdAt} />
            </div>

            {locationLabel && (
                <div className="kanban-card__location">📍 {locationLabel}</div>
            )}

            <div className="kanban-card__items">
                {order.items.map((item, idx) => {
                    const cat = getItemCategory(item);
                    const dimmed = highlightCategories && highlightCategories.size > 0 && cat && !highlightCategories.has(cat);
                    return (
                        <div key={item.id || idx} className={`kanban-card__item ${dimmed ? 'kanban-card__item--dimmed' : ''}`}>
                            <span className="kanban-card__item-qty">{item.quantity}x</span>
                            <span className="kanban-card__item-name">{getItemName(item)}</span>
                            {item.addons.length > 0 && (
                                <div className="kanban-card__addons">
                                    {item.addons.map((a, i) => (
                                        <span key={a.id || i} className="kanban-card__addon">
                                            + {a.addon.name}{a.quantity > 1 ? ` x${a.quantity}` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {item.notes && <div className="kanban-card__item-note">📝 {item.notes}</div>}
                        </div>
                    );
                })}
            </div>

            {order.notes && (
                <div className="kanban-card__notes">📝 {order.notes}</div>
            )}

            <div className="kanban-card__footer">
                {onPrint && (
                    <button className="btn btn--print btn--sm" onClick={() => onPrint(order)}>🖨️</button>
                )}
                {nextLabel && onAdvance && (
                    <button className="btn btn--advance btn--sm" onClick={handleAdvance} disabled={advancing}>
                        {advancing ? '⏳' : nextLabel}
                    </button>
                )}
                {(order.status === 'DELIVERED' || order.status === 'CANCELLED') && (
                    <button className="btn btn--remove btn--sm" onClick={() => onRemove(order.id)}>🗑️</button>
                )}
            </div>
        </div>
    );
};

export const KitchenKanban: React.FC<KitchenKanbanProps> = ({
    orders, currencySymbol, onAdvanceStatus, onRemove, onPrint, locationMap, userRole,
}) => {
    const [stationFilter, setStationFilter] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [alwaysOnTop, setAlwaysOnTop] = useState(false);

    const toggleAlwaysOnTop = useCallback(() => {
        const next = !alwaysOnTop;
        setAlwaysOnTop(next);
        window.electronAPI?.setAlwaysOnTop?.(next);
    }, [alwaysOnTop]);

    // Extract unique category names from all order items for station filter
    const allCategories = useMemo(() => {
        const cats = new Set<string>();
        for (const order of orders) {
            for (const item of order.items) {
                const cat = getItemCategory(item);
                if (cat) cats.add(cat);
            }
        }
        return Array.from(cats).sort();
    }, [orders]);

    // Fullscreen toggle with F11
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'F11') {
                e.preventDefault();
                toggleFullscreen();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Sync fullscreen state with actual fullscreen changes
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    }, []);

    const getLocationLabel = (order: Order) => {
        if (!locationMap || !order.locationId) return undefined;
        return locationMap[order.locationId];
    };

    // Filter orders: if station filter is active, only show orders that have items in that category
    const filteredOrders = useMemo(() => {
        if (!stationFilter) return orders;
        return orders.filter(o =>
            o.items.some(item => getItemCategory(item) === stationFilter)
        );
    }, [orders, stationFilter]);

    const highlightCategories = useMemo(
        () => stationFilter ? new Set([stationFilter]) : new Set<string>(),
        [stationFilter]
    );

    const columnOrders = (statuses: OrderStatus[]) =>
        filteredOrders
            .filter(o => statuses.includes(o.status))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const activeCount = filteredOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;

    if (activeCount === 0 && filteredOrders.length === 0 && !stationFilter) {
        return (
            <main className="kanban">
                <div className="kanban__empty">
                    <div className="kanban__empty-icon">🍽️</div>
                    <h2 className="kanban__empty-title">Sin pedidos</h2>
                    <p className="kanban__empty-subtitle">Esperando nuevos pedidos...</p>
                    <div className="kanban__empty-pulse" />
                </div>
            </main>
        );
    }

    return (
        <main className={`kanban ${isFullscreen ? 'kanban--fullscreen' : ''}`}>
            {/* Station filter bar */}
            {allCategories.length > 1 && (
                <div className="kanban__station-bar">
                    <button
                        className={`kanban__station-btn ${!stationFilter ? 'kanban__station-btn--active' : ''}`}
                        onClick={() => setStationFilter(null)}
                    >
                        Todas
                    </button>
                    {allCategories.map(cat => (
                        <button
                            key={cat}
                            className={`kanban__station-btn ${stationFilter === cat ? 'kanban__station-btn--active' : ''}`}
                            onClick={() => setStationFilter(stationFilter === cat ? null : cat)}
                        >
                            {cat}
                        </button>
                    ))}
                    <div className="kanban__station-spacer" />
                    <button
                        className={`kanban__station-btn ${alwaysOnTop ? 'kanban__station-btn--active' : ''}`}
                        onClick={toggleAlwaysOnTop}
                        title={alwaysOnTop ? 'Desactivar siempre visible' : 'Siempre visible'}
                    >
                        📌
                    </button>
                    <button
                        className="kanban__station-btn kanban__station-btn--fs"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)'}
                    >
                        {isFullscreen ? '⊡' : '⊞'} F11
                    </button>
                </div>
            )}

            {/* No station filter bar but still show fullscreen button */}
            {allCategories.length <= 1 && (
                <div className="kanban__station-bar kanban__station-bar--minimal">
                    <div className="kanban__station-spacer" />
                    <button
                        className={`kanban__station-btn ${alwaysOnTop ? 'kanban__station-btn--active' : ''}`}
                        onClick={toggleAlwaysOnTop}
                        title={alwaysOnTop ? 'Desactivar siempre visible' : 'Siempre visible'}
                    >
                        📌
                    </button>
                    <button
                        className="kanban__station-btn kanban__station-btn--fs"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)'}
                    >
                        {isFullscreen ? '⊡' : '⊞'} F11
                    </button>
                </div>
            )}

            <div className="kanban__columns">
                {COLUMNS.map(col => {
                    const colOrders = columnOrders(col.statuses);
                    return (
                        <div key={col.key} className={`kanban__column kanban__column--${col.key}`}>
                            <div className="kanban__column-header">
                                <span className="kanban__column-icon">{col.icon}</span>
                                <span className="kanban__column-title">{col.title}</span>
                                <span className="kanban__column-count">{colOrders.length}</span>
                            </div>
                            <div className="kanban__column-body">
                                {colOrders.map(order => (
                                    <KanbanCard
                                        key={order.id}
                                        order={order}
                                        currencySymbol={currencySymbol}
                                        onAdvance={onAdvanceStatus}
                                        onRemove={onRemove}
                                        onPrint={onPrint}
                                        locationLabel={getLocationLabel(order)}
                                        highlightCategories={highlightCategories}
                                        userRole={userRole}
                                    />
                                ))}
                                {colOrders.length === 0 && (
                                    <div className="kanban__column-empty">
                                        {stationFilter ? `Sin pedidos de ${stationFilter}` : 'Sin pedidos'}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Completed orders bar at bottom */}
            {filteredOrders.some(o => o.status === 'DELIVERED' || o.status === 'CANCELLED') && (
                <div className="kanban__completed-bar">
                    <span className="kanban__completed-label">
                        Completados: {filteredOrders.filter(o => o.status === 'DELIVERED' || o.status === 'CANCELLED').length}
                    </span>
                    <div className="kanban__completed-list">
                        {filteredOrders.filter(o => o.status === 'DELIVERED' || o.status === 'CANCELLED').map(order => (
                            <div key={order.id} className="kanban__completed-chip">
                                #{order.code}
                                <button className="kanban__completed-remove" onClick={() => onRemove(order.id)}>×</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </main>
    );
};
