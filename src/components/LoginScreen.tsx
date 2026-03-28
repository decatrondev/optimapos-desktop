import React, { useState, useEffect, FormEvent } from 'react';

interface LoginScreenProps {
    onLogin: (email: string, password: string, rememberMe: boolean) => Promise<void>;
    error: string | null;
    isLoading: boolean;
    storeName: string;
    onChangeServer?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, error, isLoading, storeName, onChangeServer }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [localError, setLocalError] = useState<string | null>(null);

    // Load saved rememberMe preference
    useEffect(() => {
        if (window.electronAPI?.getConfig) {
            window.electronAPI.getConfig().then(cfg => {
                if (cfg.rememberMe !== undefined) setRememberMe(cfg.rememberMe);
            });
        }
    }, []);

    const displayError = localError || error;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        if (!email.trim() || !password.trim()) return;
        if (!EMAIL_RE.test(email.trim())) {
            setLocalError('Ingresa un correo electrónico válido');
            return;
        }
        try {
            await onLogin(email.trim(), password, rememberMe);
        } catch {
            // Error is handled by parent context
        }
    };

    return (
        <div className="login-screen">
            {/* Background decorations */}
            <div className="login-screen__bg-orb login-screen__bg-orb--1" />
            <div className="login-screen__bg-orb login-screen__bg-orb--2" />
            <div className="login-screen__bg-orb login-screen__bg-orb--3" />

            <div className="login-card">
                {/* Header */}
                <div className="login-card__header">
                    <span className="login-card__logo">⚡</span>
                    <h1 className="login-card__title">{storeName}</h1>
                    <p className="login-card__subtitle">OptimaPOS Terminal</p>
                </div>

                {/* Form */}
                <form className="login-card__form" onSubmit={handleSubmit}>
                    {displayError && (
                        <div className="login-card__error">
                            <span className="login-card__error-icon">⚠️</span>
                            <span>{displayError}</span>
                        </div>
                    )}

                    <div className="login-card__field">
                        <label className="login-card__label" htmlFor="email">
                            Correo electrónico
                        </label>
                        <div className="login-card__input-wrap">
                            <span className="login-card__input-icon">📧</span>
                            <input
                                id="email"
                                type="email"
                                className="login-card__input"
                                placeholder="admin@restaurante.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                                disabled={isLoading}
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <div className="login-card__field">
                        <label className="login-card__label" htmlFor="password">
                            Contraseña
                        </label>
                        <div className="login-card__input-wrap">
                            <span className="login-card__input-icon">🔒</span>
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                className="login-card__input"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="login-card__toggle-pw"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    <label className="login-card__remember">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            disabled={isLoading}
                        />
                        <span>Recordar sesión</span>
                    </label>

                    <button
                        type="submit"
                        className="login-card__submit"
                        disabled={isLoading || !email.trim() || !password.trim()}
                    >
                        {isLoading ? (
                            <>
                                <span className="login-card__spinner" />
                                Ingresando...
                            </>
                        ) : (
                            '🔓 Ingresar'
                        )}
                    </button>
                </form>

                <p className="login-card__footer">Solo personal autorizado</p>

                {onChangeServer && (
                    <button
                        type="button"
                        className="login-card__change-server"
                        onClick={onChangeServer}
                    >
                        Cambiar servidor
                    </button>
                )}
            </div>
        </div>
    );
};
