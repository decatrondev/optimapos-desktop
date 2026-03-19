import React, { useState, useEffect, useCallback } from 'react';
import { Printer } from '../types/printer-config';
import { fetchPrinters, storePrinterId } from '../services/printer-config.service';

interface PrinterSetupProps {
    token: string;
    storeName: string;
    locationId?: number;
    onComplete: (printerId: number) => void;
    onSkip?: () => void;
    onLogout?: () => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface PrinterStatus {
    connection: TestStatus;
    connectionError?: string;
    print: TestStatus;
    printError?: string;
}

export const PrinterSetup: React.FC<PrinterSetupProps> = ({ token, storeName, locationId, onComplete, onSkip, onLogout }) => {
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [printerStatuses, setPrinterStatuses] = useState<Record<number, PrinterStatus>>({});

    // Network scan state
    const [scanning, setScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
    const [scanResults, setScanResults] = useState<Array<{ ip: string; port: number }> | null>(null);

    // System printers state
    const [systemPrinters, setSystemPrinters] = useState<Array<{ name: string; isDefault: boolean; portName?: string }> | null>(null);
    const [loadingSystem, setLoadingSystem] = useState(false);

    const api = window.electronAPI;

    useEffect(() => {
        fetchPrinters(token, locationId)
            .then((data) => {
                const active = data.filter((p) => p.isActive);
                setPrinters(active);
                if (active.length === 1) setSelectedId(active[0].id);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [token, locationId]);

    const selectedPrinter = printers.find((p) => p.id === selectedId);

    // ─── Test Connection ──────────────────────────────────────────────────────
    const testConnection = useCallback(async (printer: Printer) => {
        if (!api) return;
        setPrinterStatuses(prev => ({
            ...prev,
            [printer.id]: { ...prev[printer.id], connection: 'testing', connectionError: undefined, print: prev[printer.id]?.print || 'idle' }
        }));

        let result: { success: boolean; error?: string };
        if (printer.type === 'NETWORK') {
            result = await api.printerTestConnection(printer.address, printer.port || 9100);
        } else {
            // For USB, check by name OR port name (address could be either)
            const sysPrinters = await api.printerListSystem();
            const found = sysPrinters.some(sp =>
                sp.name === printer.address ||
                sp.portName === printer.address ||
                sp.name.toLowerCase() === printer.address.toLowerCase()
            );
            result = found ? { success: true } : { success: false, error: `Impresora "${printer.address}" no encontrada en el sistema` };
        }

        setPrinterStatuses(prev => ({
            ...prev,
            [printer.id]: {
                ...prev[printer.id],
                connection: result.success ? 'success' : 'error',
                connectionError: result.error,
            }
        }));
    }, [api]);

    // ─── Test Print ───────────────────────────────────────────────────────────
    const testPrint = useCallback(async (printer: Printer) => {
        if (!api) return;
        setPrinterStatuses(prev => ({
            ...prev,
            [printer.id]: { ...prev[printer.id], print: 'testing', printError: undefined, connection: prev[printer.id]?.connection || 'idle' }
        }));

        let result: { success: boolean; error?: string };
        if (printer.type === 'NETWORK') {
            result = await api.printerTestTCP(printer.address, printer.port || 9100, storeName);
        } else {
            result = await api.printerTestUSB(printer.address, storeName);
        }

        setPrinterStatuses(prev => ({
            ...prev,
            [printer.id]: {
                ...prev[printer.id],
                print: result.success ? 'success' : 'error',
                printError: result.error,
            }
        }));
    }, [api, storeName]);

    // ─── Auto-test on load ────────────────────────────────────────────────────
    useEffect(() => {
        if (printers.length > 0 && api) {
            printers.forEach(p => testConnection(p));
        }
    }, [printers, api, testConnection]);

    // ─── Scan Network ─────────────────────────────────────────────────────────
    const handleScanNetwork = useCallback(async () => {
        if (!api) return;
        setScanning(true);
        setScanProgress(null);
        setScanResults(null);

        const cleanup = api.onPrinterScanProgress((data) => {
            setScanProgress(data);
        });

        try {
            const results = await api.printerScanNetwork();
            setScanResults(results);
        } catch (e: any) {
            setScanResults([]);
        } finally {
            setScanning(false);
            cleanup();
        }
    }, [api]);

    // ─── List System Printers ─────────────────────────────────────────────────
    const handleListSystem = useCallback(async () => {
        if (!api) return;
        setLoadingSystem(true);
        try {
            const results = await api.printerListSystem();
            setSystemPrinters(results);
        } catch {
            setSystemPrinters([]);
        } finally {
            setLoadingSystem(false);
        }
    }, [api]);

    // ─── Confirm Selection ────────────────────────────────────────────────────
    const handleConfirm = async () => {
        if (!selectedId) return;
        setSaving(true);
        try {
            await storePrinterId(selectedId);
            onComplete(selectedId);
        } catch (e: any) {
            setError(e.message);
            setSaving(false);
        }
    };

    // ─── Status Badge ─────────────────────────────────────────────────────────
    const StatusDot: React.FC<{ status: TestStatus; label?: string }> = ({ status, label }) => {
        const colors: Record<TestStatus, string> = {
            idle: '#64748b',
            testing: '#f59e0b',
            success: '#22c55e',
            error: '#ef4444',
        };
        const labels: Record<TestStatus, string> = {
            idle: label || '',
            testing: 'Probando...',
            success: 'OK',
            error: 'Error',
        };
        if (status === 'idle' && !label) return null;
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '0.7rem', color: colors[status], fontFamily: 'var(--font-mono)',
            }}>
                <span style={{
                    width: '6px', height: '6px', borderRadius: '50%', background: colors[status],
                    animation: status === 'testing' ? 'pulse 1s infinite' : undefined,
                }} />
                {labels[status]}
            </span>
        );
    };

    return (
        <div className="login-screen">
            <div className="login-screen__bg-orb login-screen__bg-orb--1" />
            <div className="login-screen__bg-orb login-screen__bg-orb--2" />
            <div className="login-screen__bg-orb login-screen__bg-orb--3" />

            <div className="login-card printer-setup-card" style={{ maxWidth: '520px' }}>
                <div className="login-card__header">
                    <span className="login-card__logo" style={{ fontSize: '2.5rem' }}>🖨️</span>
                    <h1 className="login-card__title">{storeName}</h1>
                    <p className="login-card__subtitle">Configuracion de Impresora</p>
                </div>

                <div className="login-card__form">
                    {loading && (
                        <div className="printer-setup__loading">
                            <div className="login-card__spinner" />
                            <p>Cargando impresoras...</p>
                        </div>
                    )}

                    {error && (
                        <div className="login-card__error">
                            <span className="login-card__error-icon">⚠️</span>
                            {error}
                        </div>
                    )}

                    {/* ── Server Printers ── */}
                    {!loading && !error && printers.length === 0 && (
                        <div className="printer-setup__empty">
                            <span className="printer-setup__empty-icon">📭</span>
                            <p>No hay impresoras configuradas para este local.</p>
                            <p className="printer-setup__hint">Configura impresoras desde el panel web (Configuracion &gt; Impresoras).</p>
                        </div>
                    )}

                    {!loading && printers.length > 0 && (
                        <>
                            <p className="printer-setup__label">Selecciona la impresora de esta terminal</p>
                            <div className="printer-setup__grid">
                                {printers.map((printer) => {
                                    const status = printerStatuses[printer.id];
                                    return (
                                        <button
                                            key={printer.id}
                                            className={`printer-setup__option ${selectedId === printer.id ? 'printer-setup__option--selected' : ''}`}
                                            onClick={() => setSelectedId(printer.id)}
                                        >
                                            <span className="printer-setup__option-icon">
                                                {printer.type === 'NETWORK' ? '🌐' : '🔌'}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <span className="printer-setup__option-name">{printer.name}</span>
                                                <span className="printer-setup__option-type">
                                                    {printer.type === 'NETWORK' ? `Red · ${printer.address}:${printer.port || 9100}` : `USB · ${printer.address}`}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                                                <StatusDot status={status?.connection || 'idle'} label={status?.connection === 'idle' ? '' : undefined} />
                                                {status?.connectionError && (
                                                    <span style={{ fontSize: '0.6rem', color: '#ef4444', maxWidth: '120px', textAlign: 'right' }}>
                                                        {status.connectionError.length > 40 ? status.connectionError.slice(0, 40) + '...' : status.connectionError}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* ── Action Buttons for Selected Printer ── */}
                    {selectedPrinter && api && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => testConnection(selectedPrinter)}
                                disabled={printerStatuses[selectedPrinter.id]?.connection === 'testing'}
                                style={{
                                    padding: '8px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border-card)',
                                    color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-primary)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {printerStatuses[selectedPrinter.id]?.connection === 'testing' ? '⏳ Probando...' : '🔗 Probar Conexion'}
                            </button>
                            <button
                                onClick={() => testPrint(selectedPrinter)}
                                disabled={printerStatuses[selectedPrinter.id]?.print === 'testing'}
                                style={{
                                    padding: '8px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border-card)',
                                    color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-primary)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {printerStatuses[selectedPrinter.id]?.print === 'testing' ? '⏳ Imprimiendo...' : '🧾 Imprimir Test'}
                            </button>
                        </div>
                    )}

                    {/* ── Test Result Feedback ── */}
                    {selectedPrinter && printerStatuses[selectedPrinter.id]?.connection === 'success' && (
                        <div style={{
                            marginTop: '8px', padding: '8px 12px', fontSize: '0.8rem',
                            background: 'var(--accent-success-glow)', color: 'var(--accent-success)',
                            borderRadius: 'var(--radius-sm)', border: '1px solid rgba(34, 197, 94, 0.2)',
                            textAlign: 'center',
                        }}>
                            Conexion exitosa con <strong>{selectedPrinter.name}</strong>
                        </div>
                    )}
                    {selectedPrinter && printerStatuses[selectedPrinter.id]?.connection === 'error' && (
                        <div style={{
                            marginTop: '8px', padding: '8px 12px', fontSize: '0.8rem',
                            background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                            borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            textAlign: 'center',
                        }}>
                            Error: {printerStatuses[selectedPrinter.id]?.connectionError || 'No se pudo conectar'}
                        </div>
                    )}
                    {selectedPrinter && printerStatuses[selectedPrinter.id]?.print === 'success' && (
                        <div style={{
                            marginTop: '8px', padding: '8px 12px', fontSize: '0.8rem',
                            background: 'var(--accent-success-glow)', color: 'var(--accent-success)',
                            borderRadius: 'var(--radius-sm)', border: '1px solid rgba(34, 197, 94, 0.2)',
                            textAlign: 'center',
                        }}>
                            Ticket de prueba enviado correctamente
                        </div>
                    )}
                    {selectedPrinter && printerStatuses[selectedPrinter.id]?.print === 'error' && (
                        <div style={{
                            marginTop: '8px', padding: '8px 12px', fontSize: '0.8rem',
                            background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                            borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            textAlign: 'center',
                        }}>
                            Error al imprimir: {printerStatuses[selectedPrinter.id]?.printError || 'Fallo desconocido'}
                        </div>
                    )}

                    {/* ── Confirm Button ── */}
                    {printers.length > 0 && (
                        <button
                            className="login-card__submit"
                            onClick={handleConfirm}
                            disabled={!selectedId || saving}
                            style={{ marginTop: '16px' }}
                        >
                            {saving ? (
                                <>
                                    <span className="login-card__spinner" />
                                    Guardando...
                                </>
                            ) : (
                                'Confirmar Impresora'
                            )}
                        </button>
                    )}

                    {/* ── Divider ── */}
                    <div style={{
                        margin: '20px 0 12px', borderTop: '1px solid var(--border-subtle)',
                        position: 'relative', textAlign: 'center',
                    }}>
                        <span style={{
                            position: 'relative', top: '-10px', background: 'var(--bg-card)',
                            padding: '0 12px', fontSize: '0.75rem', color: 'var(--text-muted)',
                        }}>
                            Herramientas de diagnostico
                        </span>
                    </div>

                    {/* ── Discovery Tools ── */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleScanNetwork}
                            disabled={scanning}
                            style={{
                                padding: '10px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                                color: 'var(--text-secondary)', cursor: scanning ? 'wait' : 'pointer',
                                fontFamily: 'var(--font-primary)', transition: 'all 0.2s',
                            }}
                        >
                            {scanning ? '📡 Escaneando...' : '📡 Escanear Red'}
                        </button>
                        <button
                            onClick={handleListSystem}
                            disabled={loadingSystem}
                            style={{
                                padding: '10px 16px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-primary)', border: '1px solid var(--border-card)',
                                color: 'var(--text-secondary)', cursor: loadingSystem ? 'wait' : 'pointer',
                                fontFamily: 'var(--font-primary)', transition: 'all 0.2s',
                            }}
                        >
                            {loadingSystem ? '🔌 Buscando...' : '🔌 Listar USB'}
                        </button>
                    </div>

                    {/* ── Scan Progress ── */}
                    {scanning && scanProgress && (
                        <div style={{ marginTop: '10px' }}>
                            <div style={{
                                width: '100%', height: '4px', background: 'var(--bg-primary)',
                                borderRadius: '2px', overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                                    height: '100%', background: 'var(--accent-primary)',
                                    borderRadius: '2px', transition: 'width 0.3s',
                                }} />
                            </div>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>
                                {scanProgress.current}/{scanProgress.total} IPs
                            </p>
                        </div>
                    )}

                    {/* ── Network Scan Results ── */}
                    {scanResults !== null && !scanning && (
                        <div style={{
                            marginTop: '10px', padding: '10px 12px',
                            background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-card)',
                        }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                📡 Impresoras de red encontradas: {scanResults.length}
                            </p>
                            {scanResults.length === 0 && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    No se encontraron impresoras en la red local (puerto 9100).
                                </p>
                            )}
                            {scanResults.map((r, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: '6px',
                                    marginTop: '4px',
                                }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-success)' }}>
                                        {r.ip}:{r.port}
                                    </span>
                                    {printers.some(p => p.type === 'NETWORK' && p.address === r.ip) ? (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ya configurada</span>
                                    ) : (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>Nueva</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── System Printers Results ── */}
                    {systemPrinters !== null && (
                        <div style={{
                            marginTop: '10px', padding: '10px 12px',
                            background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-card)',
                        }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                🔌 Impresoras del sistema: {systemPrinters.length}
                            </p>
                            {systemPrinters.length === 0 && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    No se encontraron impresoras instaladas.
                                </p>
                            )}
                            {systemPrinters.map((sp, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '6px 8px', background: 'var(--bg-secondary)', borderRadius: '6px',
                                    marginTop: '4px',
                                }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                        {sp.name}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {sp.portName && (
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                                {sp.portName}
                                            </span>
                                        )}
                                        {sp.isDefault && (
                                            <span style={{
                                                fontSize: '0.6rem', color: 'var(--accent-info)',
                                                background: 'rgba(59, 130, 246, 0.1)', padding: '1px 6px',
                                                borderRadius: '4px',
                                            }}>
                                                Default
                                            </span>
                                        )}
                                        {printers.some(p => p.type === 'USB' && p.address === sp.name) ? (
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Configurada</span>
                                        ) : (
                                            <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>Nueva</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Skip / Logout ── */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px' }}>
                        {onSkip && (
                            <button
                                onClick={onSkip}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline',
                                    fontFamily: 'var(--font-primary)',
                                }}
                            >
                                Continuar sin impresora
                            </button>
                        )}
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                style={{
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline',
                                    fontFamily: 'var(--font-primary)',
                                }}
                            >
                                Cerrar sesion
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
