// ─── Printer Config Types (KDS 2.0 — Template V2) ────────────────────────────

export interface Printer {
    id: number;
    name: string;
    type: 'NETWORK' | 'USB';
    address: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PrintRule {
    id: number;
    name: string;
    printerId: number;
    templateId: number;
    events: string[];
    conditions: PrintRuleConditions | null;
    isActive: boolean;
    printer?: { id: number; name: string };
    template?: { id: number; name: string };
}

export interface PrintRuleConditions {
    type?: 'DELIVERY' | 'PICKUP';
    categories?: number[];
    [key: string]: unknown;
}

export interface TicketTemplate {
    id: number;
    name: string;
    width: 58 | 80;
    isDefault: boolean;
    content: {
        elements: TemplateElement[];
    };
    createdAt: string;
    updatedAt: string;
}

// ─── Base Element (shared by ALL elements) ────────────────────────────────────

interface BaseElement {
    id: string;
    type: string;

    // Font & Alignment
    align?: 'left' | 'center' | 'right';  // Default: 'left'
    font?: 'A' | 'B';                      // Default: 'A'

    // Text modifiers
    bold?: boolean;       // Default: false
    underline?: boolean;  // Default: false
    invert?: boolean;     // Default: false (white on black)

    // Scale (character size multiplier, 1-4)
    scaleW?: 1 | 2 | 3 | 4;  // Width  (Default: 1)
    scaleH?: 1 | 2 | 3 | 4;  // Height (Default: 1)
}

// ─── Element Types ────────────────────────────────────────────────────────────

/** Title text (e.g. store name) */
export interface HeaderElement extends BaseElement {
    type: 'header';
    content: string;
}

/** Free-form text (e.g. address, thanks message). Supports \n for multiline. */
export interface TextElement extends BaseElement {
    type: 'text';
    content: string;
}

/** Logo or image */
export interface ImageElement extends BaseElement {
    type: 'image';
    content: string;
    algo?: string;
    imageSize?: number;
}

/** Logo (alias — backend sometimes sends 'logo' instead of 'image') */
export interface LogoElement extends BaseElement {
    type: 'logo';
    content?: string;
    algo?: string;
    imageSize?: number;
}

/** Divider line */
export interface SeparatorElement extends BaseElement {
    type: 'separator';
    content?: string;  // Character to repeat (default: '-')
    char?: string;     // Alias for content
}

/** Dynamic order info block (order#, date, customer, table) */
export interface OrderInfoElement extends BaseElement {
    type: 'order_info';
    showTable?: boolean;  // If true, show "MESA: X" when table exists
}

/** Product items table with optional column headers */
export interface ItemsListElement extends BaseElement {
    type: 'items_list';
    showPrices?: boolean;   // Default: true. false = hide price column (kitchen)
    showAddons?: boolean;   // Default: true. false = hide addons
}

/** Financial totals block */
export interface TotalsElement extends BaseElement {
    type: 'totals';
    showSubtotal?: boolean;     // Default: true
    showDeliveryFee?: boolean;  // Default: true
    showDiscount?: boolean;     // Default: true
}

/** Barcode element */
export interface BarcodeElement extends BaseElement {
    type: 'barcode';
    content?: string;  // Template: "{code}" replaced with order.code
    height?: number;   // Height in px/points (default: 50)
}

// ─── Union Type ───────────────────────────────────────────────────────────────

export type TemplateElement =
    | HeaderElement
    | TextElement
    | ImageElement
    | LogoElement
    | SeparatorElement
    | OrderInfoElement
    | ItemsListElement
    | TotalsElement
    | BarcodeElement;
