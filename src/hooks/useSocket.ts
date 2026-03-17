import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '../services/socket.service';
import { Order, OrderStatus } from '../types/order';
import { playRepeatingAlert } from '../services/alert.service';

interface UseSocketReturn {
    orders: Order[];
    isConnected: boolean;
    hasNewAlert: boolean;
    dismissAlert: () => void;
    updateOrderLocally: (orderId: number, status: OrderStatus) => void;
    removeOrder: (orderId: number) => void;
}

export function useSocket(socketUrl: string, token?: string | null): UseSocketReturn {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [hasNewAlert, setHasNewAlert] = useState(false);
    const stopAlertRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        socketService.connect(socketUrl, token);

        const unsubConnection = socketService.onConnectionChange((connected) => {
            setIsConnected(connected);
        });

        const unsubOrder = socketService.onNewOrder((order) => {
            setOrders((prev) => {
                if (prev.some((o) => o.id === order.id)) return prev;
                return [order, ...prev];
            });

            setHasNewAlert(true);
            if (stopAlertRef.current) stopAlertRef.current();
            stopAlertRef.current = playRepeatingAlert(3000, 3);
        });

        return () => {
            unsubConnection();
            unsubOrder();
            socketService.disconnect();
            if (stopAlertRef.current) stopAlertRef.current();
        };
    }, [socketUrl, token]);

    const dismissAlert = useCallback(() => {
        setHasNewAlert(false);
        if (stopAlertRef.current) {
            stopAlertRef.current();
            stopAlertRef.current = null;
        }
    }, []);

    const updateOrderLocally = useCallback((orderId: number, status: OrderStatus) => {
        setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status } : o))
        );
    }, []);

    const removeOrder = useCallback((orderId: number) => {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
    }, []);

    return { orders, isConnected, hasNewAlert, dismissAlert, updateOrderLocally, removeOrder };
}
