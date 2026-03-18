import React, { useState, useEffect, useCallback, useRef } from 'react';

interface CashSummary {
    totalSales: number;
    cashSales: number;
    digitalSales: number;
    totalOrders: number;
    byPaymentMethod: { method: string; total: number; count: number }[];
    totalMovementsIn: number;
    totalMovementsOut: number;
    expectedAmount: number;
}

interface CashMovement {
    id: number;
    type: 'IN' | 'OUT';
    reason: string;
    amount: number;
    createdAt: string;
    user?: { id: number; name: string };
}

interface CashRegister {
    id: number;
    openedAt: string;
    closedAt?: string;
    openingAmount: number;
    closingAmount?: number;
    expectedAmount?: number;
    discrepancy?: number;
    status: string;
    openedBy?: { id: number; name: string };
    movements: CashMovement[];
    summary?: CashSummary;
}

interface CashManagementProps {
    token: string;
    serverUrl: string;
    locationId?: number;
}

function fmt(n: number | string | undefined | null): string {
    return (Number(n) || 0).toFixed(2);
}

export const CashManagement: React.FC<CashManagementProps> = ({ token, serverUrl, locationId }) => {
    const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Form states
    const [openAmount, setOpenAmount] = useState('');
    const [closeAmount, setCloseAmount] = useState('');
    const [closeNotes, setCloseNotes] = useState('');
    const [movType, setMovType] = useState<'IN' | 'OUT'>('OUT');
    const [movAmount, setMovAmount] = useState('');
    const [movReason, setMovReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showCloseForm, setShowCloseForm] = useState(false);

    const locParam = locationId ? `?locationId=${locationId}` : '';

    const loadCurrent = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${serverUrl}/api/cash/current${locParam}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Sin permisos para gestionar caja. Contacta al administrador.');
                }
                setCurrentRegister(null);
                if (!silent) setLoading(false);
                return;
            }
            const data = await res.json();
            if (data && data.id) {
                // Parse numeric fields and include summary + movements from response
                const register: CashRegister = {
                    ...data,
                    openingAmount: parseFloat(data.openingAmount) || 0,
                    closingAmount: data.closingAmount ? parseFloat(data.closingAmount) : undefined,
                    expectedAmount: data.expectedAmount ? parseFloat(data.expectedAmount) : undefined,
                    movements: (data.movements || []).map((m: any) => ({
                        ...m,
                        amount: parseFloat(m.amount) || 0,
                    })),
                    summary: data.summary ? {
                        totalSales: parseFloat(data.summary.totalSales) || 0,
                        cashSales: parseFloat(data.summary.cashSales) || 0,
                        digitalSales: parseFloat(data.summary.digitalSales) || 0,
                        totalOrders: data.summary.totalOrders || 0,
                        byPaymentMethod: (data.summary.byPaymentMethod || []).map((m: any) => ({
                            ...m,
                            total: parseFloat(m.total) || 0,
                        })),
                        totalMovementsIn: parseFloat(data.summary.totalMovementsIn) || 0,
                        totalMovementsOut: parseFloat(data.summary.totalMovementsOut) || 0,
                        expectedAmount: parseFloat(data.summary.expectedAmount) || 0,
                    } : undefined,
                };
                setCurrentRegister(register);
            } else {
                setCurrentRegister(null);
            }
        } catch (e: any) {
            setError('Error al cargar caja');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [token, serverUrl, locParam]);

    useEffect(() => { loadCurrent(); }, [loadCurrent]);

    // Auto-refresh every 60s when caja is open
    useEffect(() => {
        if (currentRegister?.status === 'OPEN') {
            refreshRef.current = setInterval(() => loadCurrent(true), 60_000);
        }
        return () => {
            if (refreshRef.current) clearInterval(refreshRef.current);
        };
    }, [currentRegister?.status, loadCurrent]);

    const handleOpen = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const body: any = { openingAmount: parseFloat(openAmount) || 0 };
            if (locationId) body.locationId = locationId;
            const res = await fetch(`${serverUrl}/api/cash/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Error al abrir caja');
            }
            setOpenAmount('');
            await loadCurrent();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const body: any = {
                closingAmount: parseFloat(closeAmount) || 0,
                notes: closeNotes || undefined,
            };
            if (currentRegister) body.cashRegisterId = currentRegister.id;
            const res = await fetch(`${serverUrl}/api/cash/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Error al cerrar caja');
            }
            setCloseAmount('');
            setCloseNotes('');
            setShowCloseForm(false);
            await loadCurrent();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!movReason.trim() || !movAmount) return;
        setSubmitting(true);
        setError(null);
        try {
            const body: any = {
                type: movType,
                reason: movReason.trim(),
                amount: parseFloat(movAmount) || 0,
            };
            if (currentRegister) body.cashRegisterId = currentRegister.id;
            const res = await fetch(`${serverUrl}/api/cash/movements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || 'Error al agregar movimiento');
            }
            setMovAmount('');
            setMovReason('');
            await loadCurrent();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="cash-mgmt">
                <div className="cash-mgmt__loading">
                    <div className="loading-screen__spinner" />
                    <p>Cargando caja...</p>
                </div>
            </main>
        );
    }

    const summary = currentRegister?.summary;
    const movements = currentRegister?.movements || [];
    const expectedAmount = summary?.expectedAmount ?? 0;

    // Close form diff calculation
    const closingNum = parseFloat(closeAmount) || 0;
    const diff = closingNum - expectedAmount;

    return (
        <main className="cash-mgmt">
            {error && (
                <div className="cash-mgmt__error">⚠️ {error}</div>
            )}

            {!currentRegister ? (
                /* Caja cerrada — open form */
                <div className="cash-mgmt__closed">
                    <div className="cash-mgmt__closed-icon">🔒</div>
                    <h2 className="cash-mgmt__closed-title">Caja Cerrada</h2>
                    <p className="cash-mgmt__closed-desc">Abre la caja para iniciar operaciones</p>
                    <form className="cash-mgmt__open-form" onSubmit={handleOpen}>
                        <div className="cash-mgmt__field">
                            <label className="cash-mgmt__label">Monto inicial (S/)</label>
                            <input
                                className="cash-mgmt__input"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={openAmount}
                                onChange={e => setOpenAmount(e.target.value)}
                                required
                            />
                        </div>
                        <button className="btn btn--advance cash-mgmt__submit" type="submit" disabled={submitting}>
                            {submitting ? '⏳ Abriendo...' : '🔓 Abrir Caja'}
                        </button>
                    </form>
                </div>
            ) : (
                /* Caja abierta */
                <div className="cash-mgmt__open">
                    {/* KPI Cards — synced with sales */}
                    <div className="cash-mgmt__kpi-grid">
                        <div className="cash-mgmt__kpi-card">
                            <span className="cash-mgmt__kpi-label">Total Ventas</span>
                            <span className="cash-mgmt__kpi-value">S/{fmt(summary?.totalSales)}</span>
                            <span className="cash-mgmt__kpi-sub">{summary?.totalOrders ?? 0} pedidos</span>
                        </div>
                        <div className="cash-mgmt__kpi-card">
                            <span className="cash-mgmt__kpi-label">En Efectivo</span>
                            <span className="cash-mgmt__kpi-value cash-mgmt__kpi-value--cash">S/{fmt(summary?.cashSales)}</span>
                            <span className="cash-mgmt__kpi-sub">Ventas CASH</span>
                        </div>
                        <div className="cash-mgmt__kpi-card">
                            <span className="cash-mgmt__kpi-label">Digital / Otros</span>
                            <span className="cash-mgmt__kpi-value cash-mgmt__kpi-value--digital">S/{fmt(summary?.digitalSales)}</span>
                            <span className="cash-mgmt__kpi-sub">Yape, Izipay, etc.</span>
                        </div>
                        <div className="cash-mgmt__kpi-card">
                            <span className="cash-mgmt__kpi-label">Esperado en Caja</span>
                            <span className="cash-mgmt__kpi-value cash-mgmt__kpi-value--expected">S/{fmt(expectedAmount)}</span>
                            <span className="cash-mgmt__kpi-sub">Apertura + Efectivo + Mov.</span>
                        </div>
                    </div>

                    {/* Status header */}
                    <div className="cash-mgmt__status-bar">
                        <div className="cash-mgmt__status-item">
                            <span className="cash-mgmt__status-label">Estado</span>
                            <span className="cash-mgmt__status-value cash-mgmt__status-value--open">🟢 Abierta</span>
                        </div>
                        <div className="cash-mgmt__status-item">
                            <span className="cash-mgmt__status-label">Apertura</span>
                            <span className="cash-mgmt__status-value">S/{currentRegister.openingAmount.toFixed(2)}</span>
                        </div>
                        <div className="cash-mgmt__status-item">
                            <span className="cash-mgmt__status-label">Cajero</span>
                            <span className="cash-mgmt__status-value">{currentRegister.openedBy?.name || '—'}</span>
                        </div>
                        <div className="cash-mgmt__status-item">
                            <span className="cash-mgmt__status-label">Hora apertura</span>
                            <span className="cash-mgmt__status-value">
                                {new Date(currentRegister.openedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>

                    {/* Payment methods breakdown */}
                    {summary?.byPaymentMethod && summary.byPaymentMethod.length > 0 && (
                        <div className="cash-mgmt__panel">
                            <h3 className="cash-mgmt__panel-title">Por metodo de pago</h3>
                            <div className="cash-mgmt__payment-methods">
                                {summary.byPaymentMethod.map(m => {
                                    const pct = summary.totalSales > 0 ? (m.total / summary.totalSales) * 100 : 0;
                                    return (
                                        <div key={m.method} className="cash-mgmt__payment-method">
                                            <div className="cash-mgmt__payment-method-header">
                                                <span className="cash-mgmt__payment-method-name">{m.method}</span>
                                                <span className="cash-mgmt__payment-method-detail">
                                                    S/{fmt(m.total)} · {m.count} ped.
                                                </span>
                                            </div>
                                            <div className="cash-mgmt__payment-method-bar">
                                                <div
                                                    className="cash-mgmt__payment-method-bar-fill"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="cash-mgmt__content">
                        {/* Add movement form */}
                        <div className="cash-mgmt__panel">
                            <h3 className="cash-mgmt__panel-title">Agregar Movimiento</h3>
                            <form className="cash-mgmt__mov-form" onSubmit={handleAddMovement}>
                                <div className="cash-mgmt__mov-type-toggle">
                                    <button
                                        type="button"
                                        className={`cash-mgmt__mov-type-btn ${movType === 'IN' ? 'cash-mgmt__mov-type-btn--active-in' : ''}`}
                                        onClick={() => setMovType('IN')}
                                    >
                                        ⬆️ Ingreso
                                    </button>
                                    <button
                                        type="button"
                                        className={`cash-mgmt__mov-type-btn ${movType === 'OUT' ? 'cash-mgmt__mov-type-btn--active-out' : ''}`}
                                        onClick={() => setMovType('OUT')}
                                    >
                                        ⬇️ Egreso
                                    </button>
                                </div>
                                <div className="cash-mgmt__field">
                                    <label className="cash-mgmt__label">Monto (S/)</label>
                                    <input
                                        className="cash-mgmt__input"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        placeholder="0.00"
                                        value={movAmount}
                                        onChange={e => setMovAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="cash-mgmt__field">
                                    <label className="cash-mgmt__label">Motivo</label>
                                    <input
                                        className="cash-mgmt__input"
                                        type="text"
                                        placeholder="Ej: Pago proveedor, propina..."
                                        value={movReason}
                                        onChange={e => setMovReason(e.target.value)}
                                        required
                                    />
                                </div>
                                <button className="btn btn--advance cash-mgmt__submit" type="submit" disabled={submitting}>
                                    {submitting ? '⏳' : `${movType === 'IN' ? '⬆️ Registrar Ingreso' : '⬇️ Registrar Egreso'}`}
                                </button>
                            </form>
                        </div>

                        {/* Movements list */}
                        <div className="cash-mgmt__panel">
                            <h3 className="cash-mgmt__panel-title">
                                Movimientos manuales ({movements.length})
                                {summary && (
                                    <span className="cash-mgmt__mov-summary">
                                        +S/{fmt(summary.totalMovementsIn)} / -S/{fmt(summary.totalMovementsOut)}
                                    </span>
                                )}
                            </h3>
                            {movements.length === 0 ? (
                                <p className="cash-mgmt__no-movements">Sin movimientos registrados</p>
                            ) : (
                                <div className="cash-mgmt__movements">
                                    {movements.map(m => (
                                        <div key={m.id} className={`cash-mgmt__movement cash-mgmt__movement--${m.type.toLowerCase()}`}>
                                            <div className="cash-mgmt__movement-left">
                                                <span className="cash-mgmt__movement-icon">{m.type === 'IN' ? '⬆️' : '⬇️'}</span>
                                                <div>
                                                    <span className="cash-mgmt__movement-reason">{m.reason}</span>
                                                    <span className="cash-mgmt__movement-time">
                                                        {new Date(m.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                                                        {m.user && ` — ${m.user.name}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className={`cash-mgmt__movement-amount cash-mgmt__movement-amount--${m.type.toLowerCase()}`}>
                                                {m.type === 'IN' ? '+' : '-'}S/{m.amount.toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Close caja */}
                    <div className="cash-mgmt__close-section">
                        {!showCloseForm ? (
                            <button
                                className="btn btn--remove cash-mgmt__submit"
                                onClick={() => setShowCloseForm(true)}
                            >
                                🔒 Cerrar Caja
                            </button>
                        ) : (
                            <>
                                <h3 className="cash-mgmt__panel-title">Cerrar Caja — Cuadratura</h3>
                                {/* Summary breakdown */}
                                <div className="cash-mgmt__close-summary">
                                    <div className="cash-mgmt__close-summary-row">
                                        <span>Monto inicial</span>
                                        <span>S/{fmt(currentRegister.openingAmount)}</span>
                                    </div>
                                    <div className="cash-mgmt__close-summary-row cash-mgmt__close-summary-row--plus">
                                        <span>+ Ventas en efectivo</span>
                                        <span>S/{fmt(summary?.cashSales)}</span>
                                    </div>
                                    <div className="cash-mgmt__close-summary-row cash-mgmt__close-summary-row--plus">
                                        <span>+ Entradas manuales</span>
                                        <span>S/{fmt(summary?.totalMovementsIn)}</span>
                                    </div>
                                    <div className="cash-mgmt__close-summary-row cash-mgmt__close-summary-row--minus">
                                        <span>- Salidas manuales</span>
                                        <span>S/{fmt(summary?.totalMovementsOut)}</span>
                                    </div>
                                    <div className="cash-mgmt__close-summary-row cash-mgmt__close-summary-row--total">
                                        <span>Esperado en caja</span>
                                        <span>S/{fmt(expectedAmount)}</span>
                                    </div>
                                </div>

                                <form className="cash-mgmt__close-form" onSubmit={handleClose}>
                                    <div className="cash-mgmt__field">
                                        <label className="cash-mgmt__label">Monto real contado (S/)</label>
                                        <input
                                            className="cash-mgmt__input"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="Contar efectivo..."
                                            value={closeAmount}
                                            onChange={e => setCloseAmount(e.target.value)}
                                            required
                                        />
                                    </div>

                                    {/* Live diff indicator */}
                                    {closeAmount !== '' && (
                                        <div className={`cash-mgmt__close-diff ${
                                            diff === 0 ? 'cash-mgmt__close-diff--ok' :
                                            diff > 0 ? 'cash-mgmt__close-diff--over' :
                                            'cash-mgmt__close-diff--under'
                                        }`}>
                                            Diferencia: {diff >= 0 ? '+' : ''}S/{fmt(diff)}
                                            {diff === 0 && ' — Cuadratura perfecta!'}
                                            {diff > 0 && ' — Sobrante'}
                                            {diff < 0 && ' — Faltante'}
                                        </div>
                                    )}

                                    <div className="cash-mgmt__field">
                                        <label className="cash-mgmt__label">Notas (opcional)</label>
                                        <input
                                            className="cash-mgmt__input"
                                            type="text"
                                            placeholder="Notas de cierre..."
                                            value={closeNotes}
                                            onChange={e => setCloseNotes(e.target.value)}
                                        />
                                    </div>
                                    <div className="cash-mgmt__close-actions">
                                        <button
                                            type="button"
                                            className="btn cash-mgmt__cancel-btn"
                                            onClick={() => setShowCloseForm(false)}
                                        >
                                            Cancelar
                                        </button>
                                        <button className="btn btn--remove cash-mgmt__submit" type="submit" disabled={submitting}>
                                            {submitting ? '⏳ Cerrando...' : '🔒 Cerrar Caja'}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
};
