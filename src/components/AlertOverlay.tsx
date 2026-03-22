import React, { useEffect, useState } from 'react';

interface AlertOverlayProps {
    visible: boolean;
    onDismiss: () => void;
    orderCode?: string;
    userRole?: string;
}

export const AlertOverlay: React.FC<AlertOverlayProps> = ({ visible, onDismiss, orderCode, userRole }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (visible) {
            setShow(true);
        }
    }, [visible]);

    const handleDismiss = () => {
        setShow(false);
        setTimeout(onDismiss, 300);
    };

    useEffect(() => {
        if (!visible) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                handleDismiss();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [visible]);

    if (!visible && !show) return null;

    return (
        <div className={`alert-overlay ${show ? 'alert-overlay--visible' : 'alert-overlay--hidden'}`} onClick={handleDismiss}>
            <div className="alert-overlay__content">
                <div className="alert-overlay__icon">{userRole === 'KITCHEN' ? '🔥' : userRole === 'DELIVERY' ? '🛵' : '🔔'}</div>
                <h2 className="alert-overlay__title">
                    {userRole === 'KITCHEN' ? '¡PEDIDO PARA PREPARAR!' : userRole === 'DELIVERY' ? '¡PEDIDO LISTO PARA ENVÍO!' : '¡NUEVO PEDIDO!'}
                </h2>
                {orderCode && <p className="alert-overlay__code">#{orderCode}</p>}
                <p className="alert-overlay__hint">Click o presiona cualquier tecla para continuar</p>
            </div>
        </div>
    );
};
