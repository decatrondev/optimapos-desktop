import { io, Socket } from 'socket.io-client';
import { Order } from '../types/order';
import { PrintJob } from '../types/printer-config';

type NewOrderCallback = (order: Order) => void;
type OrderUpdatedCallback = (order: Order) => void;
type PrintJobCallback = (job: PrintJob) => void;
type ConnectionCallback = (connected: boolean) => void;

class SocketService {
    private socket: Socket | null = null;
    private orderCallbacks: NewOrderCallback[] = [];
    private orderUpdatedCallbacks: OrderUpdatedCallback[] = [];
    private printJobCallbacks: PrintJobCallback[] = [];
    private connectionCallbacks: ConnectionCallback[] = [];
    private _isConnected = false;
    private _isDesktopAuth = false;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private printerStatuses: Array<{ id: number; status: string }> = [];

    get isConnected(): boolean {
        return this._isConnected;
    }

    get isDesktopAuth(): boolean {
        return this._isDesktopAuth;
    }

    connect(url: string, token?: string | null): void {
        if (this.socket?.connected) return;

        this.socket = io(url, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            timeout: 20000,
            auth: token ? { token } : undefined,
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected:', this.socket?.id);
            this._isConnected = true;
            this.connectionCallbacks.forEach(cb => cb(true));
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            this._isConnected = false;
            this._isDesktopAuth = false;
            this.connectionCallbacks.forEach(cb => cb(false));
            this.stopHeartbeat();
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error.message);
            this._isConnected = false;
            this.connectionCallbacks.forEach(cb => cb(false));
        });

        // Listen for new orders
        this.socket.on('new_order', (data: Order) => {
            console.log('[Socket] New order:', data.code);
            this.orderCallbacks.forEach(cb => cb(data));
        });

        // Listen for order updates (status changes, assignments, edits)
        this.socket.on('order_updated', (data: Order) => {
            console.log('[Socket] Order updated:', data.code || data.id, '→', data.status);
            this.orderUpdatedCallbacks.forEach(cb => cb(data));
        });

        // Listen for print jobs (desktop-specific event from printEventService)
        this.socket.on('print_job', (job: PrintJob) => {
            console.log(`[Socket] Print job: ${job.jobId} | event: ${job.event} | printer: ${job.printer.name}`);
            this.printJobCallbacks.forEach(cb => cb(job));
        });

        // Listen for print job status updates (ack feedback)
        this.socket.on('print_job_status', (data: { jobId: string; status: string; error?: string }) => {
            console.log(`[Socket] Print job status: ${data.jobId} → ${data.status}`);
        });
    }

    /**
     * Authenticate as a desktop app using API key.
     * This joins the tenant + location rooms on the server.
     */
    async desktopConnect(apiKey: string, tenantSlug: string, locationId?: number): Promise<{ success: boolean; tenantId?: number; tenantName?: string; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket?.connected) {
                resolve({ success: false, error: 'Socket not connected' });
                return;
            }

            this.socket.emit('desktop_connect', { apiKey, tenantSlug, locationId }, (resp: any) => {
                if (resp?.success) {
                    this._isDesktopAuth = true;
                    console.log(`[Socket] Desktop auth OK — tenant: ${resp.tenantName} (${resp.tenantId})`);
                    this.startHeartbeat();
                    resolve({ success: true, tenantId: resp.tenantId, tenantName: resp.tenantName });
                } else {
                    console.error('[Socket] Desktop auth failed:', resp?.error);
                    resolve({ success: false, error: resp?.error || 'Auth failed' });
                }
            });

            // Timeout after 10s
            setTimeout(() => resolve({ success: false, error: 'Timeout' }), 10000);
        });
    }

    /**
     * Acknowledge a print job was processed.
     */
    ackPrintJob(jobId: string, status: 'printed' | 'error', error?: string): void {
        if (!this.socket?.connected) return;
        this.socket.emit('print_job_ack', { jobId, status, error });
    }

    /**
     * Set printer statuses to report in heartbeat.
     */
    setPrinterStatuses(statuses: Array<{ id: number; status: string }>): void {
        this.printerStatuses = statuses;
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        // Send heartbeat every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            if (this.socket?.connected) {
                this.socket.emit('desktop_heartbeat', { printers: this.printerStatuses });
            }
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    disconnect(): void {
        this.stopHeartbeat();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this._isConnected = false;
            this._isDesktopAuth = false;
        }
    }

    onNewOrder(callback: NewOrderCallback): () => void {
        this.orderCallbacks.push(callback);
        return () => { this.orderCallbacks = this.orderCallbacks.filter(cb => cb !== callback); };
    }

    onOrderUpdated(callback: OrderUpdatedCallback): () => void {
        this.orderUpdatedCallbacks.push(callback);
        return () => { this.orderUpdatedCallbacks = this.orderUpdatedCallbacks.filter(cb => cb !== callback); };
    }

    onPrintJob(callback: PrintJobCallback): () => void {
        this.printJobCallbacks.push(callback);
        return () => { this.printJobCallbacks = this.printJobCallbacks.filter(cb => cb !== callback); };
    }

    onConnectionChange(callback: ConnectionCallback): () => void {
        this.connectionCallbacks.push(callback);
        return () => { this.connectionCallbacks = this.connectionCallbacks.filter(cb => cb !== callback); };
    }
}

// Singleton
export const socketService = new SocketService();
