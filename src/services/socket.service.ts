import { io, Socket } from 'socket.io-client';
import { Order } from '../types/order';

type NewOrderCallback = (order: Order) => void;
type ConnectionCallback = (connected: boolean) => void;

class SocketService {
    private socket: Socket | null = null;
    private orderCallbacks: NewOrderCallback[] = [];
    private connectionCallbacks: ConnectionCallback[] = [];
    private _isConnected = false;

    get isConnected(): boolean {
        return this._isConnected;
    }

    connect(url: string, token?: string | null): void {
        if (this.socket?.connected) return;

        this.socket = io(url, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            timeout: 20000,
            auth: token ? { token } : undefined,
        });

        this.socket.on('connect', () => {
            console.log('[Socket] ✅ Connected:', this.socket?.id);
            this._isConnected = true;
            this.connectionCallbacks.forEach((cb) => cb(true));
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] ❌ Disconnected:', reason);
            this._isConnected = false;
            this.connectionCallbacks.forEach((cb) => cb(false));
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error.message);
            this._isConnected = false;
            this.connectionCallbacks.forEach((cb) => cb(false));
        });

        this.socket.on('new_order', (data: Order) => {
            console.log('[Socket] 🆕 New order received:', data.code);
            this.orderCallbacks.forEach((cb) => cb(data));
        });
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this._isConnected = false;
        }
    }

    onNewOrder(callback: NewOrderCallback): () => void {
        this.orderCallbacks.push(callback);
        return () => {
            this.orderCallbacks = this.orderCallbacks.filter((cb) => cb !== callback);
        };
    }

    onConnectionChange(callback: ConnectionCallback): () => void {
        this.connectionCallbacks.push(callback);
        return () => {
            this.connectionCallbacks = this.connectionCallbacks.filter((cb) => cb !== callback);
        };
    }
}

// Singleton
export const socketService = new SocketService();
