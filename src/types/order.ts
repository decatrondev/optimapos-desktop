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
        categoryId?: number;
        category?: { name: string };
    } | null;

    combo?: {
        id: number;
        name: string;
        categoryId?: number;
        category?: { name: string };
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

    // Printer — TCP (network)
    printerPrintTCP: (ip: string, port: number, data: number[]) => Promise<{ success: boolean; error?: string }>;
    printerPrintTextTCP: (ip: string, port: number, text: string) => Promise<{ success: boolean; error?: string }>;
    printerTestTCP: (ip: string, port: number, storeName: string) => Promise<{ success: boolean; error?: string }>;
    printerTestConnection: (ip: string, port: number) => Promise<{ success: boolean; error?: string }>;

    // Printer — USB (system driver)
    printerPrintUSB: (printerName: string, data: number[]) => Promise<{ success: boolean; error?: string }>;
    printerPrintTextUSB: (printerName: string, text: string) => Promise<{ success: boolean; error?: string }>;
    printerTestUSB: (printerName: string, storeName: string) => Promise<{ success: boolean; error?: string }>;

    // Printer — Discovery
    printerScanNetwork: () => Promise<Array<{ ip: string; port: number }>>;
    printerListSystem: () => Promise<Array<{ name: string; isDefault: boolean; portName?: string }>>;
    onPrinterScanProgress: (callback: (data: { current: number; total: number }) => void) => () => void;

    // Auto-Updater
    getAppVersion: () => Promise<string>;
    updaterCheck: () => Promise<{ success: boolean; version?: string; error?: string }>;
    updaterDownload: () => Promise<{ success: boolean; error?: string }>;
    updaterInstall: () => Promise<void>;
    onUpdaterStatus: (callback: (data: any) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

// ─── POS Types ──────────────────────────────────────────────────────────────

export interface POSProduct {
    id: number;
    name: string;
    price: number;
    image: string | null;
    categoryId: number;
    isActive: boolean;
    sortOrder: number;
    stockEnabled: boolean;
    stockCurrent: number;
    promoPrice?: number | null;
    promoValidFrom?: string | null;
    promoValidUntil?: string | null;
    variants: POSVariant[];
    addonGroups: { addonGroup: POSAddonGroup }[];
}

export interface POSVariant {
    id: number;
    name: string;
    price: number;
    isActive: boolean;
}

export interface POSAddonGroup {
    id: number;
    name: string;
    type: 'ADDITION' | 'SUGGESTED';
    addons: POSAddon[];
}

export interface POSAddon {
    id: number;
    name: string;
    price: number;
}

export interface POSCategory {
    id: number;
    name: string;
    image: string | null;
    sortOrder: number;
    _count?: { products: number };
}

export interface POSCombo {
    id: number;
    name: string;
    price: number;
    image: string | null;
    description: string | null;
    items?: { product: { id: number; name: string }; quantity: number }[];
}

export interface POSTable {
    id: number;
    name: string;
    number: number;
    capacity: number;
    zone: string | null;
    status: 'FREE' | 'OCCUPIED' | 'RESERVED';
}

export interface POSZone {
    id: number;
    name: string;
    surcharge: number;
}

export interface CartItem {
    cartId: string;
    productId?: number;
    comboId?: number;
    variantId?: number;
    name: string;
    variantName: string | null;
    basePrice: number;
    quantity: number;
    addons: { addonId: number; name: string; price: number; quantity: number }[];
    notes: string;
    maxStock?: number;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'YAPE' | 'IZIPAY' | 'TRANSFER';
