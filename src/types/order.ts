// ─── Order Types (matches backend Prisma schema) ─────────────────────────────

export type OrderStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'ON_THE_WAY'
    | 'READY_PICKUP'
    | 'DELIVERED'
    | 'CANCELLED';

export type OrderType = 'DELIVERY' | 'PICKUP';

export interface Order {
    id: number;
    code: string;
    status: OrderStatus;
    type: OrderType;
    guestName: string | null;
    guestPhone: string | null;
    guestAddress: string | null;
    notes: string | null;

    subtotal: string | number;
    deliveryFee: string | number;
    discount: string | number;
    total: string | number;

    createdAt: string;

    user?: {
        id: number;
        name: string;
        phone: string;
        email: string | null;
    } | null;

    zone?: {
        id: number;
        name: string;
        surcharge: string | number;
    } | null;

    items: OrderItem[];
}

export interface OrderItem {
    id: number;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    notes: string | null;

    product?: {
        id: number;
        name: string;
        description: string | null;
    } | null;

    combo?: {
        id: number;
        name: string;
    } | null;

    variant?: {
        id: number;
        name: string;
    } | null;

    addons: Array<{
        id: number;
        quantity: number;
        price: string | number;
        addon: {
            id: number;
            name: string;
        };
    }>;
}

// ─── Auth Types ──────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'VENDOR' | 'CLIENT';

export interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: Role;
}

export interface AuthState {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export interface LoginResponse {
    token: string;
    user: AuthUser;
}

// ─── Electron API Types ──────────────────────────────────────────────────────

export interface ElectronAPI {
    printTicket: (ticketText: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    getEnvConfig: () => Promise<{ socketUrl: string; storeName: string; currencySymbol: string }>;
    storeToken: (token: string | null) => Promise<void>;
    getToken: () => Promise<string | null>;
    storePrinterId: (printerId: number | null) => Promise<void>;
    getPrinterId: () => Promise<number | null>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}
