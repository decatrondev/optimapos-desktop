import React, { useState, FormEvent } from 'react';
import { validateServer } from '../services/auth.service';

interface ServerSetupProps {
    onComplete: (serverUrl: string, tenantSlug: string) => void;
}

const DOMAIN = 'decatron.net';

export const ServerSetup: React.FC<ServerSetupProps> = ({ onComplete }) => {
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validated, setValidated] = useState(false);
    const [tenantName, setTenantName] = useState('');

    const cleanSlug = (value: string) => {
        // Only allow lowercase letters, numbers, hyphens
        return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const s = slug.trim();
        if (!s) return;

        setLoading(true);
        setError(null);
        setValidated(false);

        try {
            const serverUrl = `https://${s}.${DOMAIN}`;
            const result = await validateServer(serverUrl);

            if (result.valid) {
                setValidated(true);
                setTenantName(result.name || s);
                setTimeout(() => {
                    onComplete(serverUrl, s);
                }, 600);
            } else {
                setError('Local no encontrado. Verifica el nombre e intenta de nuevo.');
            }
        } catch {
            setError('Error de conexion. Verifica tu internet.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-screen">
            <div className="login-screen__bg-orb login-screen__bg-orb--1" />
            <div className="login-screen__bg-orb login-screen__bg-orb--2" />
            <div className="login-screen__bg-orb login-screen__bg-orb--3" />

            <div className="login-card">
                <div className="login-card__header">
                    <span className="login-card__logo">⚡</span>
                    <h1 className="login-card__title">OptimaPOS Terminal</h1>
                    <p className="login-card__subtitle">Ingresa el nombre de tu local</p>
                </div>

                <form className="login-card__form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-card__error">
                            <span className="login-card__error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {validated && (
                        <div className="login-card__success">
                            ✅ {tenantName} conectado
                        </div>
                    )}

                    <div className="login-card__field">
                        <label className="login-card__label" htmlFor="local-name">
                            Nombre del local
                        </label>
                        <div className="login-card__input-wrap">
                            <span className="login-card__input-icon">🏪</span>
                            <input
                                id="local-name"
                                type="text"
                                className="login-card__input"
                                placeholder="mirestaurante"
                                value={slug}
                                onChange={(e) => { setSlug(cleanSlug(e.target.value)); setValidated(false); setError(null); }}
                                autoFocus
                                disabled={loading}
                            />
                        </div>
                        <p className="login-card__hint" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ opacity: 0.5 }}>{slug || 'mirestaurante'}.{DOMAIN}</span>
                        </p>
                    </div>

                    <button
                        type="submit"
                        className="login-card__submit"
                        disabled={loading || !slug.trim() || validated}
                    >
                        {loading ? (
                            <><span className="login-card__spinner" /> Buscando local...</>
                        ) : validated ? (
                            '✅ Conectado'
                        ) : (
                            'Conectar'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
