import React, { useState, useEffect, useCallback } from 'react';

interface UpdaterStatus {
    status: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error';
    version?: string;
    percent?: number;
    message?: string;
    releaseNotes?: string;
}

export const UpdateBanner: React.FC = () => {
    const [updater, setUpdater] = useState<UpdaterStatus | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [appVersion, setAppVersion] = useState<string>('');

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onUpdaterStatus) return;

        api.getAppVersion?.().then((v: string) => setAppVersion(v));

        const unsub = api.onUpdaterStatus((data: UpdaterStatus) => {
            setUpdater(data);
            if (data.status === 'available' || data.status === 'ready') {
                setDismissed(false);
            }
        });

        return () => unsub?.();
    }, []);

    const handleDownload = useCallback(() => {
        (window as any).electronAPI?.updaterDownload();
    }, []);

    const handleInstall = useCallback(() => {
        (window as any).electronAPI?.updaterInstall();
    }, []);

    if (!updater || dismissed) return null;

    // Only show banner for actionable states
    if (updater.status === 'checking' || updater.status === 'up-to-date') return null;

    return (
        <div className={`update-banner update-banner--${updater.status}`}>
            {updater.status === 'available' && (
                <>
                    <span className="update-banner__text">
                        Nueva version v{updater.version} disponible
                    </span>
                    <button className="update-banner__btn" onClick={handleDownload}>
                        Descargar
                    </button>
                    <button className="update-banner__dismiss" onClick={() => setDismissed(true)}>
                        &times;
                    </button>
                </>
            )}

            {updater.status === 'downloading' && (
                <>
                    <span className="update-banner__text">
                        Descargando actualizacion... {updater.percent ?? 0}%
                    </span>
                    <div className="update-banner__progress">
                        <div
                            className="update-banner__progress-bar"
                            style={{ width: `${updater.percent ?? 0}%` }}
                        />
                    </div>
                </>
            )}

            {updater.status === 'ready' && (
                <>
                    <span className="update-banner__text">
                        v{updater.version} lista para instalar
                    </span>
                    <button className="update-banner__btn update-banner__btn--install" onClick={handleInstall}>
                        Reiniciar e Instalar
                    </button>
                    <button className="update-banner__dismiss" onClick={() => setDismissed(true)}>
                        &times;
                    </button>
                </>
            )}

            {updater.status === 'error' && (
                <>
                    <span className="update-banner__text">
                        Error de actualizacion: {updater.message}
                    </span>
                    <button className="update-banner__dismiss" onClick={() => setDismissed(true)}>
                        &times;
                    </button>
                </>
            )}
        </div>
    );
};
