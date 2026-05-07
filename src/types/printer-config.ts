// ─── Printer Config Types (V2 — matches backend Phase 6) ─────────────────────

export interface Printer {
    id: number;
    name: string;
    type: 'NETWORK' | 'USB' | 'BLUETOOTH';
    address: string;
    port: number;
    isActive: boolean;
    isDefault: boolean;
    locationId: number | null;
    locationName: string | null;
    // Print config (merged from old PrintRule)
    templateId: number | null;
    template: TicketTemplate | null;
    events: string[];
    orderTypes: string[];
    copies: number;
    autoPrint: boolean;
}

export interface PrintRule {
    id: number;
    name: string;
    printerId: number;
    printerName: string;
    printerType: string;
    printerAddress: string;
    printerPort: number;
    templateId: number;
    events: string[];
    orderTypes: string[];
    copies: number;
    autoPrint: boolean;
    isActive: boolean;
    template: {
        id: number;
        name: string;
        width: 58 | 80;
        content: any;
        category: string | null;
    };
}

export interface TicketTemplate {
    id: number;
    name: string;
    width: 58 | 80;
    isDefault: boolean;
    category: string | null;
    content: {
        elements: TemplateElement[];
    };
}

/** Desktop config response from GET /desktop/config */
export interface DesktopConfig {
    tenant: {
        id: number;
        name: string;
        slug: string;
        ruc: string | null;
    };
    locations: Array<{ id: number; name: string; address: string | null }>;
    printers: Printer[];
    rules: PrintRule[];
    templates: TicketTemplate[];
}

/** Print job received via WebSocket */
export interface PrintJob {
    jobId: string;
    event: string;
    rule: {
        id: number;
        name: string;
        copies: number;
        autoPrint: boolean;
    };
    printer: {
        id: number;
        name: string;
        type: string;
        address: string;
        port: number;
    };
    template: {
        id: number;
        name: string;
        width: number;
        content: any;
    };
    data: Record<string, any>;
    timestamp: string;
}

// ─── Template Elements ───────────────────────────────────────────────────────

interface BaseElement {
    id: string;
    type: string;
    align?: 'left' | 'center' | 'right';
    font?: 'A' | 'B';
    bold?: boolean;
    underline?: boolean;
    invert?: boolean;
    scaleW?: 1 | 2 | 3 | 4;
    scaleH?: 1 | 2 | 3 | 4;
}

export interface HeaderElement extends BaseElement {
    type: 'header';
    content: string;
}

export interface TextElement extends BaseElement {
    type: 'text';
    content: string;
}

export interface ImageElement extends BaseElement {
    type: 'image';
    content: string;
    imageSize?: number;
}

export interface LogoElement extends BaseElement {
    type: 'logo';
    content?: string;
    imageSize?: number;
}

export interface SeparatorElement extends BaseElement {
    type: 'separator';
    content?: string;
    char?: string;
    separatorStyle?: 'dashed' | 'solid' | 'double' | 'stars';
}

export interface SpacerElement extends BaseElement {
    type: 'spacer';
    spacerHeight?: number;
}

export interface CutElement extends BaseElement {
    type: 'cut';
    cutMode?: 'partial' | 'full';
}

export interface QrCodeElement extends BaseElement {
    type: 'qr_code';
    content?: string;
    qrSize?: 'S' | 'M' | 'L';
}

export interface OrderInfoElement extends BaseElement {
    type: 'order_info';
    showTable?: boolean;
}

export interface ItemsListElement extends BaseElement {
    type: 'items_list';
    showPrices?: boolean;
    showAddons?: boolean;
}

export interface TotalsElement extends BaseElement {
    type: 'totals';
    showSubtotal?: boolean;
    showDeliveryFee?: boolean;
    showDiscount?: boolean;
}

export interface BarcodeElement extends BaseElement {
    type: 'barcode';
    content?: string;
    height?: number;
}

export type TemplateElement =
    | HeaderElement
    | TextElement
    | ImageElement
    | LogoElement
    | SeparatorElement
    | SpacerElement
    | CutElement
    | QrCodeElement
    | OrderInfoElement
    | ItemsListElement
    | TotalsElement
    | BarcodeElement;
