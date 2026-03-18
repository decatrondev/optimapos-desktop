import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '../services/socket.service';
import { Order, OrderStatus } from '../types/order';
import { PrintJob } from '../types/printer-config';
import { playRepeatingAlert } from '../services/alert.service';

interface UseSocketReturn {
    orders: Order[];
    isConnected: boolean;
    hasNewAlert: boolean;
    printJobs: PrintJob[];
    dismissAlert: () => void;
    updateOrderLocally: (orderId: number, status: OrderStatus) => void;
    removeOrder: (orderId: number) => void;
    clearPrintJob: (jobId: string) => void;
}

export function useSocket(socketUrl: string, token?: string | null, locationId?: number): UseSocketReturn {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [hasNewAlert, setHasNewAlert] = useState(false);
    const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
    const stopAlertRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!socketUrl) return;

        socketService.connect(socketUrl, token);

        const unsubConnection = socketService.onConnectionChange((connected) => {
            setIsConnected(connected);
        });

        const unsubOrder = socketService.onNewOrder((order) => {
            // Filter by locationId if set (non-ADMIN users)
            if (locationId && order.locationId && order.locationId !== locationId) {
                console.log(`[Socket] Ignoring order #${order.id} from location ${order.locationId} (mine: ${locationId})`);
                return;
            }
            setOrders((prev) => {
                if (prev.some(o => o.id === order.id)) return prev;
                return [order, ...prev];
            });
            setHasNewAlert(true);
            if (stopAlertRef.current) stopAlertRef.current();
            stopAlertRef.current = playRepeatingAlert(3000, 3);
        });

        const unsubPrintJob = socketService.onPrintJob((job) => {
            console.log(`[PrintJob] Received: ${job.jobId} | ${job.event} | printer: ${job.printer.name}`);
            setPrintJobs(prev => [...prev, job]);

            // Auto-print jobs play a brief alert
            if (job.rule.autoPrint) {
                if (stopAlertRef.current) stopAlertRef.current();
                stopAlertRef.current = playRepeatingAlert(2000, 1);
            }
        });

        return () => {
            unsubConnection();
            unsubOrder();
            unsubPrintJob();
            socketService.disconnect();
            if (stopAlertRef.current) stopAlertRef.current();
        };
    }, [socketUrl, token, locationId]);

    const dismissAlert = useCallback(() => {
        setHasNewAlert(false);
        if (stopAlertRef.current) {
            stopAlertRef.current();
            stopAlertRef.current = null;
        }
    }, []);

    const updateOrderLocally = useCallback((orderId: number, status: OrderStatus) => {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }, []);

    const removeOrder = useCallback((orderId: number) => {
        setOrders(prev => prev.filter(o => o.id !== orderId));
    }, []);

    const clearPrintJob = useCallback((jobId: string) => {
        setPrintJobs(prev => prev.filter(j => j.jobId !== jobId));
        socketService.ackPrintJob(jobId, 'printed');
    }, []);

    return { orders, isConnected, hasNewAlert, printJobs, dismissAlert, updateOrderLocally, removeOrder, clearPrintJob };
}
