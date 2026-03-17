import React from 'react';
import { TicketTemplate, TemplateElement } from '../types/printer-config';
import { Order, OrderItem } from '../types/order';

interface TicketPreviewProps {
    template: TicketTemplate;
    order: Order;
    currencySymbol: string;
    storeName: string;
    onClose: () => void;
    onPrint: () => void;
}

function getItemName(item: OrderItem): string {
    if (item.product) return item.product.name;
    if (item.combo) return `🎁 ${item.combo.name}`;
    if (item.variant) return item.variant.name;
    return 'Producto';
}

function formatPrice(value: string | number, symbol: string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `${symbol}${num.toFixed(2)}`;
}

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

/**
 * Generates CSS that simulates ESC/POS commands.
 * Uses fontSize + letterSpacing (same approach as the admin editor's SortableElement.tsx).
 * This avoids text deformation that happens with transform: scaleX().
 */
function getElementStyle(el: TemplateElement): React.CSSProperties {
    const scaleW = el.scaleW || 1;
    const scaleH = el.scaleH || 1;
    const baseFontSize = el.font === 'B' ? 11 : 14;

    return {
        fontSize: `${baseFontSize * Math.max(scaleW, scaleH)}px`,
        fontWeight: el.bold ? 'bold' : 'normal',
        textDecoration: el.underline ? 'underline' : 'none',
        backgroundColor: el.invert ? '#000' : 'transparent',
        color: el.invert ? '#fff' : '#000',
        fontFamily: '"Courier New", monospace',
        letterSpacing: scaleW > 1 ? `${(scaleW - 1) * 1.5}px` : 'normal',
        lineHeight: scaleH > 1 ? `${1.3 * scaleH}` : '1.4',
        width: '100%',
        wordBreak: 'break-word' as const,
        padding: el.invert ? '2px 4px' : undefined,
    };
}

function getAlignStyle(align?: string): React.CSSProperties {
    return { textAlign: (align || 'left') as 'left' | 'center' | 'right' };
}

/**
 * Renders a single template element visually — same logic as admin's SortableElement.tsx.
 */
const TicketElement: React.FC<{
    element: TemplateElement;
    order: Order;
    currencySymbol: string;
}> = ({ element: el, order, currencySymbol }) => {
    const style = getElementStyle(el);
    const alignStyle = getAlignStyle(el.align);

    switch (el.type) {
        // ── Image ──────────────────────────────────────────────────────────
        case 'image':
        case 'logo': {
            const justify = el.align === 'right' ? 'flex-end' : el.align === 'center' ? 'center' : 'flex-start';
            // Resolve relative URLs (e.g. "/logo_claro.png" → full backend URL)
            let imgSrc = (el as any).content || '';
            if (imgSrc && imgSrc.startsWith('/')) {
                const baseUrl = (import.meta as any).env?.VITE_SOCKET_URL || '';
                imgSrc = `${baseUrl}${imgSrc}`;
            }
            return (
                <div style={{ display: 'flex', padding: '4px 0', justifyContent: justify }}>
                    {imgSrc ? (
                        <img
                            src={imgSrc}
                            alt="Logo"
                            style={{ height: `${(el as any).imageSize || 64}px`, width: 'auto', objectFit: 'contain', filter: 'grayscale(1)' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div style={{ border: '2px dashed #ccc', borderRadius: '4px', padding: '16px', color: '#aaa', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            <span style={{ fontSize: '24px' }}>🖼️</span>
                            <span style={{ fontSize: '10px' }}>Logo / Imagen</span>
                        </div>
                    )}
                </div>
            );
        }

        // ── Header / Text ──────────────────────────────────────────────────
        case 'header':
        case 'text': {
            const lines = (el.content || '').split('\n');
            return (
                <div style={{ ...alignStyle }}>
                    <span style={{ ...style, display: 'inline-block' }}>
                        {lines.map((line, i) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < lines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </span>
                </div>
            );
        }

        // ── Separator ──────────────────────────────────────────────────────
        case 'separator':
            return <div style={{ borderBottom: '2px dashed #999', width: '100%', margin: '4px 0' }} />;

        // ── Order Info ─────────────────────────────────────────────────────
        case 'order_info': {
            const customerName = order.user?.name || order.guestName || 'Cliente';
            return (
                <div style={{ ...style, ...alignStyle }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pedido:</span><span style={{ fontWeight: 'bold' }}>#{order.code}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tipo:</span><span>{order.type === 'DELIVERY' ? '🛵 Delivery' : '🏪 Recojo'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cliente:</span><span>{customerName}</span></div>
                    {order.guestAddress && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Dir:</span><span>{order.guestAddress}</span></div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fecha:</span><span>{formatDate(order.createdAt)}</span></div>
                    {order.notes && <div style={{ fontStyle: 'italic', marginTop: '2px' }}>📝 {order.notes}</div>}
                </div>
            );
        }

        // ── Items List ─────────────────────────────────────────────────────
        case 'items_list': {
            const showPrices = el.showPrices !== false;
            const showAddons = el.showAddons !== false;
            return (
                <div style={{ width: '100%', textAlign: 'left', fontFamily: '"Courier New", monospace', fontSize: style.fontSize, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight }}>
                    {/* Column headers */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '2px', color: '#000' }}>
                        <span>CANT. PRODUCTO</span>
                        {showPrices && <span>P.UNIT</span>}
                    </div>
                    <div style={style}>
                        {order.items.map((item, idx) => (
                            <React.Fragment key={item.id || idx}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <span>{item.quantity} x {getItemName(item)}</span>
                                    {showPrices && <span>{formatPrice(item.totalPrice, currencySymbol)}</span>}
                                </div>
                                {showAddons && item.addons.length > 0 && item.addons.map((addon, aIdx) => (
                                    <div key={addon.id || aIdx} style={{ paddingLeft: '16px', opacity: 0.75 }}>
                                        + {addon.addon.name}{addon.quantity > 1 ? ` x${addon.quantity}` : ''}{showPrices ? ` ${formatPrice(addon.price, currencySymbol)}` : ''}
                                    </div>
                                ))}
                                {item.notes && (
                                    <div style={{ paddingLeft: '16px', opacity: 0.7, fontStyle: 'italic' }}>📝 {item.notes}</div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            );
        }

        // ── Totals ─────────────────────────────────────────────────────────
        case 'totals': {
            const showSubtotal = el.showSubtotal !== false;
            const showDeliveryFee = el.showDeliveryFee !== false;
            const showDiscount = el.showDiscount !== false;
            return (
                <div style={{ ...style, width: '100%', textAlign: 'right', paddingTop: '4px', borderTop: '1px dashed #000', marginTop: '2px' }}>
                    {showSubtotal && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span>{formatPrice(order.subtotal, currencySymbol)}</span></div>
                    )}
                    {showDeliveryFee && order.type === 'DELIVERY' && parseFloat(String(order.deliveryFee)) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery:</span><span>{formatPrice(order.deliveryFee, currencySymbol)}</span></div>
                    )}
                    {showDiscount && parseFloat(String(order.discount)) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Descuento:</span><span>-{formatPrice(order.discount, currencySymbol)}</span></div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
                        <span>TOTAL:</span>
                        <span>{formatPrice(order.total, currencySymbol)}</span>
                    </div>
                </div>
            );
        }

        // ── Barcode ────────────────────────────────────────────────────────
        case 'barcode': {
            const code = (el.content || '{code}').replace('{code}', order.code);
            return (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                    <div style={{
                        height: '48px', width: '192px',
                        background: 'rgba(0,0,0,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid #000',
                        fontFamily: 'monospace', fontSize: '10px', letterSpacing: '3px', color: '#000',
                    }}>
                        || ||| || |||| ||| ||
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
};

/**
 * Modal showing a visual preview of the ticket — uses the same rendering logic
 * as the admin editor (SortableElement.tsx) for pixel-perfect consistency.
 */
export const TicketPreview: React.FC<TicketPreviewProps> = ({
    template, order, currencySymbol, storeName, onClose, onPrint,
}) => {
    // Match admin editor: 380px for 80mm, 280px for 58mm
    const widthPx = template.width === 58 ? 280 : 380;

    const zigzagTop: React.CSSProperties = {
        position: 'absolute' as const, left: 0, right: 0, top: -8, height: '16px',
        background: '#fff',
        clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)',
        transform: 'rotate(180deg)',
    };

    const zigzagBottom: React.CSSProperties = {
        position: 'absolute' as const, left: 0, right: 0, bottom: -8, height: '16px',
        background: '#fff',
        clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)',
    };

    return (
        <div className="ticket-modal" onClick={onClose}>
            <div className="ticket-modal__content" onClick={(e) => e.stopPropagation()}>
                <div className="ticket-modal__toolbar">
                    <span className="ticket-modal__title">
                        🧾 Preview — {template.name} ({template.width}mm)
                    </span>
                    <div className="ticket-modal__actions">
                        <button className="btn btn--print" onClick={onPrint}>🖨️ Imprimir</button>
                        <button className="btn btn--remove" onClick={onClose}>✕ Cerrar</button>
                    </div>
                </div>

                <div className="ticket-modal__paper-wrap">
                    <div
                        style={{
                            background: '#fff',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                            position: 'relative',
                            width: `${widthPx}px`,
                            padding: '10px',
                            color: '#000',
                            minHeight: '200px',
                        }}
                    >
                        {/* Zigzag top edge */}
                        <div style={zigzagTop} />

                        {/* Content area — matches admin's py-3 px-8 */}
                        <div style={{ padding: '12px 32px' }}>
                            {template.content.elements.map((el) => (
                                <TicketElement
                                    key={el.id}
                                    element={el}
                                    order={order}
                                    currencySymbol={currencySymbol}
                                />
                            ))}
                        </div>

                        {/* Zigzag bottom edge */}
                        <div style={zigzagBottom} />
                    </div>
                </div>
            </div>
        </div>
    );
};
