import React, { useState, useEffect, useCallback } from 'react';

interface CashRegister {
    id: number;
    openedAt: string;
    closedAt?: string;
    openingAmount: number;
    closingAmount?: number;
    expectedAmount?: number;
    status: string;
    user?: { name: string };
}

interface CashMovement {
    id: number;
    type: 'IN' | 'OUT';
    reason: string;
    amount: number;
    createdAt: string;
    user?: { name: string };
}

interface CashManagementProps {
    token: string;
    serverUrl: string;
    locationId?: number;
}

export const CashManagement: React.FC<CashManagementProps> = ({ token, serverUrl, locationId }) => {
    const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
    const [movements, setMovements] = useState<CashMovement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [openAmount, setOpenAmount] = useState('');
    const [closeAmount, setCloseAmount] = useState('');
    const [closeNotes, setCloseNotes] = useState('');
    const [movType, setMovType] = useState<'IN' | 'OUT'>('OUT');
    const [movAmount, setMovAmount] = useState('');
    const [movReason, setMovReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const locParam = locationId ? `?locationId=${locationId}` : '';
    const locParamAmp = locationId ? `&locationId=${locationId}` : '';

    const loadCurrent = useCallback(async () => {
        setLoading(true);
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
                setMovements([]);
                setLoading(false);
                return;
            }
            const data = await res.json();
            if (data && data.id) {
                setCurrentRegister({
                    ...data,
                    openingAmount: parseFloat(data.openingAmount) || 0,
                    closingAmount: data.closingAmount ? parseFloat(data.closingAmount) : undefined,
                    expectedAmount: data.expectedAmount ? parseFloat(data.expectedAmount) : undefined,
                });
                // Load movements for this register
                const movRes = await fetch(`${serverUrl}/api/cash/movements?cashRegisterId=${data.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (movRes.ok) {
                    const movData = await movRes.json();
                    setMovements((movData || []).map((m: any) => ({
                        ...m,
                        amount: parseFloat(m.amount) || 0,
                    })));
                }
            } else {
                setCurrentRegister(null);
                setMovements([]);
            }
        } catch (e: any) {
            setError('Error al cargar caja');
        } finally {
            setLoading(false);
        }
    }, [token, serverUrl, locParam]);

    useEffect(() => { loadCurrent(); }, [loadCurrent]);

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

    // Calculate running total
    const movementsTotal = movements.reduce((sum, m) => {
        return sum + (m.type === 'IN' ? m.amount : -m.amount);
    }, 0);
    const runningBalance = (currentRegister?.openingAmount || 0) + movementsTotal;

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
                            <span className="cash-mgmt__status-label">Movimientos</span>
                            <span className={`cash-mgmt__status-value ${movementsTotal >= 0 ? 'cash-mgmt__status-value--positive' : 'cash-mgmt__status-value--negative'}`}>
                                {movementsTotal >= 0 ? '+' : ''}S/{movementsTotal.toFixed(2)}
                            </span>
                        </div>
                        <div className="cash-mgmt__status-item">
                            <span className="cash-mgmt__status-label">Balance</span>
                            <span className="cash-mgmt__status-value cash-mgmt__status-value--balance">S/{runningBalance.toFixed(2)}</span>
                        </div>
                    </div>

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
                            <h3 className="cash-mgmt__panel-title">Movimientos ({movements.length})</h3>
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
                        <h3 className="cash-mgmt__panel-title">Cerrar Caja</h3>
                        <form className="cash-mgmt__close-form" onSubmit={handleClose}>
                            <div className="cash-mgmt__field">
                                <label className="cash-mgmt__label">Monto de cierre (S/)</label>
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
                            <button className="btn btn--remove cash-mgmt__submit" type="submit" disabled={submitting}>
                                {submitting ? '⏳ Cerrando...' : '🔒 Cerrar Caja'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};
