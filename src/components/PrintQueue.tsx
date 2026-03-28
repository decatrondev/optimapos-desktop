/**
 * PrintQueue — Shows print job history with status, reprint, and queue visibility.
 * Accessible from StatusBar printer icon.
 */

import React, { useState, useCallback } from 'react';
import { PrintJob } from '../types/printer-config';
import { executePrintJob } from '../services/print-executor';

export interface PrintHistoryEntry {
    job: PrintJob;
    status: 'pending' | 'printed' | 'error';
    error?: string;
    timestamp: number;
}

interface PrintQueueProps {
    history: PrintHistoryEntry[];
    pendingCount: number;
    onClose: () => void;
    onReprint: (entry: PrintHistoryEntry) => void;
}

const EVENT_LABELS: Record<string, string> = {
    ORDER_CREATED: 'Nuevo Pedido',
    ITEMS_ADDED: 'Items Agregados',
    ITEM_CANCELLED: 'Item Cancelado',
    ORDER_MODIFIED: 'Pedido Modificado',
    TABLE_CHANGED: 'Mesa Cambiada',
    PRE_BILL: 'Pre-Cuenta',
    ORDER_CLOSED: 'Pedido Cerrado',
    DELIVERY_TICKET: 'Ticket Delivery',
    CASH_OPEN: 'Caja Abierta',
    CASH_CLOSE: 'Caja Cerrada',
    REPRINT: 'Reimpresión',
};

const STATUS_ICON: Record<string, string> = {
    pending: '⏳',
    printed: '✅',
    error: '❌',
};

function timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
    return `hace ${Math.floor(diff / 3600)}h`;
}

export const PrintQueue: React.FC<PrintQueueProps> = ({ history, pendingCount, onClose, onReprint }) => {
    const [reprinting, setReprinting] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'printed' | 'error'>('all');

    const handleReprint = useCallback(async (entry: PrintHistoryEntry) => {
        setReprinting(entry.job.jobId);
        try {
            await executePrintJob(entry.job);
            onReprint(entry);
        } catch {}
        setReprinting(null);
    }, [onReprint]);

    const filtered = filter === 'all' ? history : history.filter(e => e.status === filter);
    const errorCount = history.filter(e => e.status === 'error').length;
    const printedCount = history.filter(e => e.status === 'printed').length;

    return (
        <div className="print-queue__overlay" onClick={onClose}>
            <div className="print-queue__panel" onClick={e => e.stopPropagation()}>
                <div className="print-queue__header">
                    <h3 className="print-queue__title">🖨️ Cola de Impresion</h3>
                    <button className="print-queue__close" onClick={onClose}>✕</button>
                </div>

                {/* Stats */}
                <div className="print-queue__stats">
                    <span className="print-queue__stat">
                        {pendingCount > 0 ? `⏳ ${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}` : '✅ Sin pendientes'}
                    </span>
                    <span className="print-queue__stat">{printedCount} impresos</span>
                    {errorCount > 0 && <span className="print-queue__stat print-queue__stat--error">{errorCount} error{errorCount > 1 ? 'es' : ''}</span>}
                </div>

                {/* Filter */}
                <div className="print-queue__filters">
                    {(['all', 'printed', 'error'] as const).map(f => (
                        <button
                            key={f}
                            className={`print-queue__filter ${filter === f ? 'print-queue__filter--active' : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f === 'all' ? 'Todos' : f === 'printed' ? '✅ Impresos' : '❌ Errores'}
                        </button>
                    ))}
                </div>

                {/* History list */}
                <div className="print-queue__list">
                    {filtered.length === 0 && (
                        <div className="print-queue__empty">
                            {history.length === 0 ? 'Sin historial de impresion' : 'Sin resultados para este filtro'}
                        </div>
                    )}
                    {filtered.map((entry) => (
                        <div key={`${entry.job.jobId}-${entry.timestamp}`} className={`print-queue__item print-queue__item--${entry.status}`}>
                            <div className="print-queue__item-main">
                                <span className="print-queue__item-icon">{STATUS_ICON[entry.status]}</span>
                                <div className="print-queue__item-info">
                                    <span className="print-queue__item-event">
                                        {EVENT_LABELS[entry.job.event] || entry.job.event}
                                    </span>
                                    <span className="print-queue__item-meta">
                                        {entry.job.printer.name} · {entry.job.data?.order?.code || ''} · {timeAgo(entry.timestamp)}
                                    </span>
                                    {entry.error && (
                                        <span className="print-queue__item-error">{entry.error}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                className="print-queue__reprint"
                                onClick={() => handleReprint(entry)}
                                disabled={reprinting === entry.job.jobId}
                                title="Reimprimir"
                            >
                                {reprinting === entry.job.jobId ? '⏳' : '🔄'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
