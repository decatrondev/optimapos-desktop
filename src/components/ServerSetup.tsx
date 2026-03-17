import React, { useState, FormEvent } from 'react';
import { validateServer } from '../services/auth.service';

interface ServerSetupProps {
    onComplete: (serverUrl: string, tenantSlug: string) => void;
}

export const ServerSetup: React.FC<ServerSetupProps> = ({ onComplete }) => {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validated, setValidated] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setLoading(true);
        setError(null);
        setValidated(false);

        try {
            // Normalize URL
            let serverUrl = url.trim().toLowerCase();
            if (!serverUrl.startsWith('http')) {
                serverUrl = `https://${serverUrl}`;
            }
            serverUrl = serverUrl.replace(/\/+$/, '');

            const result = await validateServer(serverUrl);

            if (result.valid) {
                setValidated(true);
                // Extract slug from URL (e.g. doncarlyn.decatron.net → doncarlyn)
                const hostname = new URL(serverUrl).hostname;
                const slug = hostname.split('.')[0];

                setTimeout(() => {
                    onComplete(serverUrl, slug);
                }, 500);
            } else {
                setError(result.error || 'No se pudo conectar al servidor');
            }
        } catch (e: any) {
            setError('Error de conexión. Verifica la URL.');
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
                    <span className="login-card__logo">📡</span>
                    <h1 className="login-card__title">OptimaPOS Terminal</h1>
                    <p className="login-card__subtitle">Configuración Inicial</p>
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
                            ✅ Servidor conectado correctamente
                        </div>
                    )}

                    <div className="login-card__field">
                        <label className="login-card__label" htmlFor="server-url">
                            URL del Restaurante
                        </label>
                        <div className="login-card__input-wrap">
                            <span className="login-card__input-icon">🌐</span>
                            <input
                                id="server-url"
                                type="text"
                                className="login-card__input"
                                placeholder="mirestaurante.decatron.net"
                                value={url}
                                onChange={(e) => { setUrl(e.target.value); setValidated(false); setError(null); }}
                                autoFocus
                                disabled={loading}
                            />
                        </div>
                        <p className="login-card__hint">
                            Ingresa la URL proporcionada por el administrador
                        </p>
                    </div>

                    <button
                        type="submit"
                        className="login-card__submit"
                        disabled={loading || !url.trim() || validated}
                    >
                        {loading ? (
                            <><span className="login-card__spinner" /> Verificando...</>
                        ) : validated ? (
                            '✅ Conectado'
                        ) : (
                            '🔗 Conectar'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
