import React, { useState, useEffect } from 'react';
import { Printer } from '../types/printer-config';
import { fetchPrinters, storePrinterId } from '../services/printer-config.service';

interface PrinterSetupProps {
    token: string;
    storeName: string;
    locationId?: number;
    onComplete: (printerId: number) => void;
}

export const PrinterSetup: React.FC<PrinterSetupProps> = ({ token, storeName, locationId, onComplete }) => {
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPrinters(token, locationId)
            .then((data) => {
                const active = data.filter((p) => p.isActive);
                setPrinters(active);
                if (active.length === 1) setSelectedId(active[0].id);
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [token]);

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

    const selectedPrinter = printers.find((p) => p.id === selectedId);

    return (
        <div className="login-screen">
            {/* Animated background orbs */}
            <div className="login-screen__bg-orb login-screen__bg-orb--1" />
            <div className="login-screen__bg-orb login-screen__bg-orb--2" />
            <div className="login-screen__bg-orb login-screen__bg-orb--3" />

            <div className="login-card printer-setup-card">
                <div className="login-card__header">
                    <span className="login-card__logo">🖨️</span>
                    <h1 className="login-card__title">{storeName}</h1>
                    <p className="login-card__subtitle">Configuración de Puesto</p>
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

                    {!loading && !error && printers.length === 0 && (
                        <div className="printer-setup__empty">
                            <span className="printer-setup__empty-icon">📭</span>
                            <p>No hay impresoras configuradas.</p>
                            <p className="printer-setup__hint">Configura impresoras desde el panel de admin.</p>
                        </div>
                    )}

                    {!loading && printers.length > 0 && (
                        <>
                            <p className="printer-setup__label">¿Qué impresora es esta terminal?</p>
                            <div className="printer-setup__grid">
                                {printers.map((printer) => (
                                    <button
                                        key={printer.id}
                                        className={`printer-setup__option ${selectedId === printer.id ? 'printer-setup__option--selected' : ''}`}
                                        onClick={() => setSelectedId(printer.id)}
                                    >
                                        <span className="printer-setup__option-icon">
                                            {printer.type === 'NETWORK' ? '🌐' : '🔌'}
                                        </span>
                                        <span className="printer-setup__option-name">{printer.name}</span>
                                        <span className="printer-setup__option-type">
                                            {printer.type === 'NETWORK' ? 'Red' : 'USB'} · {printer.address}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {selectedPrinter && (
                                <div className="printer-setup__selected-info">
                                    ✅ Esta terminal imprimirá como <strong>{selectedPrinter.name}</strong>
                                </div>
                            )}

                            <button
                                className="login-card__submit"
                                onClick={handleConfirm}
                                disabled={!selectedId || saving}
                            >
                                {saving ? (
                                    <>
                                        <span className="login-card__spinner" />
                                        Guardando...
                                    </>
                                ) : (
                                    '🚀 Confirmar Puesto'
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
