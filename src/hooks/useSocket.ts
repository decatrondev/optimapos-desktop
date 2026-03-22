import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService } from '../services/socket.service';
import { Order, OrderStatus, Role } from '../types/order';
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

export function useSocket(socketUrl: string, token?: string | null, locationId?: number, userRole?: Role): UseSocketReturn {
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

        const triggerAlert = () => {
            setHasNewAlert(true);
            if (stopAlertRef.current) stopAlertRef.current();
            stopAlertRef.current = playRepeatingAlert(3000, 3);
        };

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

            // Role-aware alerts on new_order:
            // KITCHEN: no alert on new order (wait for CONFIRMED via order_updated)
            // DELIVERY: no alert on new order (wait for READY_PICKUP via order_updated)
            // ADMIN/MANAGER/VENDOR: alert on all new orders
            if (!userRole || ['ADMIN', 'MANAGER', 'VENDOR'].includes(userRole)) {
                triggerAlert();
            }
        });

        // Listen for order updates (status changes, edits, assignments)
        const unsubOrderUpdated = socketService.onOrderUpdated((updatedOrder) => {
            if (locationId && updatedOrder.locationId && updatedOrder.locationId !== locationId) {
                return;
            }
            setOrders((prev) => {
                const exists = prev.some(o => o.id === updatedOrder.id);
                if (exists) {
                    return prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o);
                } else {
                    return [updatedOrder, ...prev];
                }
            });

            // Role-aware alerts on status updates:
            // KITCHEN: alert when order becomes CONFIRMED (ready to prepare)
            if (userRole === 'KITCHEN' && updatedOrder.status === 'CONFIRMED') {
                triggerAlert();
            }
            // DELIVERY: alert when delivery order becomes READY_PICKUP (ready to pick up)
            if (userRole === 'DELIVERY' && updatedOrder.type === 'DELIVERY' && updatedOrder.status === 'READY_PICKUP') {
                triggerAlert();
            }
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
            unsubOrderUpdated();
            unsubPrintJob();
            socketService.disconnect();
            if (stopAlertRef.current) stopAlertRef.current();
        };
    }, [socketUrl, token, locationId, userRole]);

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
