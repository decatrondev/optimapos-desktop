// ─── Order Types (matches backend Prisma schema) ─────────────────────────────

export type OrderStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'ON_THE_WAY'
    | 'READY_PICKUP'
    | 'DELIVERED'
    | 'CANCELLED';

export type OrderType = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export interface Order {
    id: number;
    code: string;
    status: OrderStatus;
    type: OrderType;
    guestName: string | null;
    guestPhone: string | null;
    guestAddress: string | null;
    notes: string | null;
    staffNotes: string | null;
    tableNumber: string | null;

    subtotal: string | number;
    deliveryFee: string | number;
    discount: string | number;
    total: string | number;

    paymentMethod: string | null;
    paymentStatus: string | null;

    createdAt: string;
    locationId: number | null;

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

    table?: {
        id: number;
        name: string;
        zone: string | null;
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

export type Role = 'ADMIN' | 'MANAGER' | 'VENDOR' | 'KITCHEN' | 'DELIVERY' | 'CLIENT' | 'SUPER_ADMIN';

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

// ─── App Config (persisted via Electron IPC) ────────────────────────────────

export interface AppConfig {
    serverUrl: string;
    tenantSlug: string;
    tenantName: string;
    apiKey: string;
    token: string | null;
    printerId: number | null;
    locationId: number | null;
    locationName: string | null;
    rememberMe: boolean;
}

export interface Location {
    id: number;
    name: string;
    address: string | null;
}

// ─── Electron API Types ──────────────────────────────────────────────────────

export interface ElectronAPI {
    getConfig: () => Promise<AppConfig>;
    saveConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;
    storeToken: (token: string | null) => Promise<void>;
    getToken: () => Promise<string | null>;
    storePrinterId: (printerId: number | null) => Promise<void>;
    getPrinterId: () => Promise<number | null>;
    getEnvConfig: () => Promise<{ socketUrl: string; storeName: string; currencySymbol: string }>;
    printTicket: (ticketText: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}
