import React from 'react';
import { TicketTemplate, TemplateElement, PrintJob } from '../types/printer-config';
import { Order, OrderItem } from '../types/order';
import { formatMoney, formatPrice, getItemName } from '../utils/format';
import { CURRENCY_SYMBOL } from '../utils/constants';
import { resolveVariablesKeepUnresolved as resolveVariables, buildVarsFromOrder as buildVariablesFromOrder, buildVarsFromData as buildVariablesFromPrintData } from '../utils/ticket-variables';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TicketPreviewProps {
    template: TicketTemplate;
    order: Order;
    currencySymbol: string;
    storeName: string;
    serverUrl?: string;
    onClose: () => void;
    onPrint: () => void;
}

interface PrintJobPreviewProps {
    job: PrintJob;
    serverUrl: string;
    onClose: () => void;
    onPrint: () => void;
}

// Variables, buildVariablesFromOrder, buildVariablesFromPrintData imported from shared utils

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(isoString: string): string {
    const d = new Date(isoString);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Element Style ───────────────────────────────────────────────────────────

function getElementStyle(el: TemplateElement): React.CSSProperties {
    const scaleW = el.scaleW || 1;
    const scaleH = el.scaleH || 1;
    const baseFontSize = el.font === 'B' ? 11 : 14;
    const fontSize = baseFontSize * Math.max(scaleW, scaleH);

    return {
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize * 1.3}px`,
        fontWeight: el.bold ? 'bold' : 'normal',
        textDecoration: el.underline ? 'underline' : 'none',
        backgroundColor: el.invert ? '#000' : 'transparent',
        color: el.invert ? '#fff' : '#000',
        fontFamily: '"Courier New", monospace',
        letterSpacing: scaleW > 1 ? `${(scaleW - 1) * 1.5}px` : 'normal',
        wordBreak: 'break-word' as const,
        padding: el.invert ? '2px 4px' : undefined,
    };
}

// ─── Element Renderer ────────────────────────────────────────────────────────

const TicketElement: React.FC<{
    element: TemplateElement;
    items: any[];
    currencySymbol: string;
    vars: Record<string, string>;
    serverUrl: string;
}> = ({ element: el, items, currencySymbol, vars, serverUrl }) => {
    const style = getElementStyle(el);
    const align = el.align || 'left';
    const alignStyle: React.CSSProperties = { textAlign: align as any };

    // Render text with variable highlighting
    const renderText = (text: string) => {
        const resolved = resolveVariables(text, vars);
        const parts = resolved.split(/({{[^}]+}})/g);
        return parts.map((part, i) =>
            part.startsWith('{{') ? (
                <span key={i} style={{ background: 'rgba(234,179,8,0.2)', color: '#a16207', borderRadius: '2px', padding: '0 2px', fontSize: '0.85em' }}>{part}</span>
            ) : <span key={i}>{part}</span>
        );
    };

    switch (el.type) {
        case 'image':
        case 'logo': {
            const justify = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
            let imgSrc = (el as any).content || '';
            if (imgSrc && imgSrc.startsWith('/')) imgSrc = `${serverUrl}${imgSrc}`;
            return (
                <div style={{ display: 'flex', padding: '4px 0', justifyContent: justify }}>
                    {imgSrc ? (
                        <img src={imgSrc} alt="Logo"
                            style={{ height: `${(el as any).imageSize || 64}px`, width: 'auto', objectFit: 'contain', filter: 'grayscale(1)' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <div style={{ border: '2px dashed #ccc', borderRadius: '4px', padding: '16px', color: '#aaa', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            <span style={{ fontSize: '24px' }}>🖼️</span>
                            <span style={{ fontSize: '10px' }}>Logo</span>
                        </div>
                    )}
                </div>
            );
        }

        case 'header':
        case 'text': {
            const content = (el as any).content || '';
            const lines = content.split('\n');
            return (
                <div style={alignStyle}>
                    <span style={{ ...style, display: 'inline-block' }}>
                        {lines.map((line: string, i: number) => (
                            <React.Fragment key={i}>
                                {renderText(line)}
                                {i < lines.length - 1 && <br />}
                            </React.Fragment>
                        ))}
                    </span>
                </div>
            );
        }

        case 'separator': {
            const sepStyle = (el as any).separatorStyle || 'dashed';
            if (sepStyle === 'solid') return <div style={{ borderBottom: '2px solid #555', width: '100%', margin: '4px 0' }} />;
            if (sepStyle === 'double') return <div style={{ margin: '4px 0' }}><div style={{ borderBottom: '1px solid #555', marginBottom: '2px' }} /><div style={{ borderBottom: '1px solid #555' }} /></div>;
            if (sepStyle === 'stars') return <div style={{ textAlign: 'center', color: '#666', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '2px', margin: '4px 0' }}>{'*'.repeat(32)}</div>;
            return <div style={{ borderBottom: '2px dashed #999', width: '100%', margin: '4px 0' }} />;
        }

        case 'spacer':
            return <div style={{ height: `${((el as any).spacerHeight || 1) * 12}px` }} />;

        case 'cut':
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0', color: '#999' }}>
                    <span>✂</span>
                    <div style={{ flex: 1, borderBottom: '2px dashed #ccc' }} />
                    <span style={{ fontSize: '10px' }}>{(el as any).cutMode === 'full' ? 'CORTE TOTAL' : 'CORTE PARCIAL'}</span>
                    <div style={{ flex: 1, borderBottom: '2px dashed #ccc' }} />
                    <span style={{ transform: 'scaleX(-1)' }}>✂</span>
                </div>
            );

        case 'qr_code': {
            const size = (el as any).qrSize === 'L' ? 120 : (el as any).qrSize === 'S' ? 60 : 90;
            return (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                    <div style={{ width: size, height: size, border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9f9f9' }}>
                        <span style={{ fontSize: '10px', color: '#666' }}>QR</span>
                    </div>
                </div>
            );
        }

        case 'order_info': {
            return (
                <div style={{ ...style, ...alignStyle }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pedido:</span><span style={{ fontWeight: 'bold' }}>#{vars['pedido_codigo'] || '---'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tipo:</span><span>{vars['pedido_tipo'] || '---'}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cliente:</span><span>{vars['cliente_nombre'] || 'Cliente'}</span></div>
                    {vars['pedido_mesa'] && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mesa:</span><span>{vars['pedido_mesa']}</span></div>}
                    {vars['cliente_direccion'] && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Dir:</span><span>{vars['cliente_direccion']}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fecha:</span><span>{vars['pedido_fecha']} {vars['pedido_hora']}</span></div>
                    {vars['pedido_notas'] && <div style={{ fontStyle: 'italic', marginTop: '2px' }}>📝 {vars['pedido_notas']}</div>}
                </div>
            );
        }

        case 'items_list': {
            const showPrices = (el as any).showPrices !== false;
            const showAddons = (el as any).showAddons !== false;
            const showNotes = (el as any).showNotes !== false;
            return (
                <div style={{ width: '100%', textAlign: 'left', fontFamily: '"Courier New", monospace', fontSize: style.fontSize, lineHeight: style.lineHeight }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', marginBottom: '2px' }}>
                        <span>CANT. PRODUCTO</span>
                        {showPrices && <span>PRECIO</span>}
                    </div>
                    {items.map((item: any, idx: number) => (
                        <React.Fragment key={item.id || idx}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <span>{item.quantity} x {getItemName(item)}</span>
                                {showPrices && <span>{formatPrice(item.totalPrice || item.unitPrice, currencySymbol)}</span>}
                            </div>
                            {showAddons && item.addons?.length > 0 && item.addons.map((addon: any, aIdx: number) => (
                                <div key={aIdx} style={{ paddingLeft: '16px', opacity: 0.75, fontSize: '0.9em' }}>
                                    + {addon.name || addon.addon?.name}{addon.quantity > 1 ? ` x${addon.quantity}` : ''}{showPrices ? ` ${formatPrice(addon.price, currencySymbol)}` : ''}
                                </div>
                            ))}
                            {showNotes && item.notes && <div style={{ paddingLeft: '16px', opacity: 0.7, fontStyle: 'italic', fontSize: '0.9em' }}>📝 {item.notes}</div>}
                        </React.Fragment>
                    ))}
                    {items.length === 0 && <div style={{ color: '#999', fontStyle: 'italic' }}>Sin items</div>}
                </div>
            );
        }

        case 'totals': {
            const showSubtotal = (el as any).showSubtotal !== false;
            const showDeliveryFee = (el as any).showDeliveryFee !== false;
            const showDiscount = (el as any).showDiscount !== false;
            const subtotal = parseFloat(vars['subtotal'] || '0');
            const discount = parseFloat(vars['descuento'] || '0');
            const deliveryFee = parseFloat(vars['delivery_fee'] || '0');
            const total = parseFloat(vars['total'] || '0');
            return (
                <div style={{ ...style, width: '100%', textAlign: 'right', paddingTop: '4px', borderTop: '1px dashed #000', marginTop: '2px' }}>
                    {showSubtotal && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span>{formatPrice(subtotal, currencySymbol)}</span></div>}
                    {showDeliveryFee && deliveryFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delivery:</span><span>{formatPrice(deliveryFee, currencySymbol)}</span></div>}
                    {showDiscount && discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Descuento:</span><span>-{formatPrice(discount, currencySymbol)}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}><span>TOTAL:</span><span>{formatPrice(total, currencySymbol)}</span></div>
                </div>
            );
        }

        case 'barcode': {
            return (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                    <div style={{ height: '48px', width: '192px', background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #000', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '3px' }}>
                        || ||| || |||| ||| ||
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
};

// ─── Ticket Paper Wrapper ────────────────────────────────────────────────────

const zigzagTop: React.CSSProperties = {
    position: 'absolute', left: 0, right: 0, top: -8, height: '16px', background: '#fff',
    clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)',
    transform: 'rotate(180deg)',
};

const zigzagBottom: React.CSSProperties = {
    position: 'absolute', left: 0, right: 0, bottom: -8, height: '16px', background: '#fff',
    clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)',
};

const TicketPaper: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => {
    const widthPx = width === 58 ? 280 : 380;
    return (
        <div style={{ background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.15)', position: 'relative', width: `${widthPx}px`, padding: '10px', color: '#000', minHeight: '200px' }}>
            <div style={zigzagTop} />
            <div style={{ padding: '12px 24px' }}>{children}</div>
            <div style={zigzagBottom} />
        </div>
    );
};

// ─── Order-based Preview (legacy, used by manual print button) ───────────────

export const TicketPreview: React.FC<TicketPreviewProps> = ({
    template, order, currencySymbol, storeName, serverUrl: serverUrlProp, onClose, onPrint,
}) => {
    const vars = buildVariablesFromOrder(order, storeName);
    const elements = template.content?.elements || [];
    const serverUrl = serverUrlProp || '';

    return (
        <div className="ticket-modal" onClick={onClose}>
            <div className="ticket-modal__content" onClick={e => e.stopPropagation()}>
                <div className="ticket-modal__toolbar">
                    <span className="ticket-modal__title">🧾 {template.name} ({template.width}mm)</span>
                    <div className="ticket-modal__actions">
                        <button className="btn btn--print" onClick={onPrint}>🖨️ Imprimir</button>
                        <button className="btn btn--remove" onClick={onClose}>✕ Cerrar</button>
                    </div>
                </div>
                <div className="ticket-modal__paper-wrap">
                    <TicketPaper width={template.width}>
                        {elements.map((el: TemplateElement) => (
                            <TicketElement key={el.id} element={el} items={order.items} currencySymbol={currencySymbol} vars={vars} serverUrl={serverUrl} />
                        ))}
                    </TicketPaper>
                </div>
            </div>
        </div>
    );
};

// ─── PrintJob-based Preview (for WebSocket print_job events) ─────────────────

export const PrintJobPreview: React.FC<PrintJobPreviewProps> = ({
    job, serverUrl, onClose, onPrint,
}) => {
    const vars = buildVariablesFromPrintData(job.data);
    const elements = job.template.content?.elements || [];
    const items = job.data.order?.items || job.data.newItems || [];
    const currencySymbol = CURRENCY_SYMBOL;

    const eventLabels: Record<string, string> = {
        ORDER_CREATED: '🆕 Nuevo Pedido',
        ITEMS_ADDED: '➕ Items Agregados',
        ITEM_CANCELLED: '❌ Item Cancelado',
        ORDER_MODIFIED: '✏️ Pedido Modificado',
        TABLE_CHANGED: '🔄 Mesa Cambiada',
        PRE_BILL: '📋 Pre-Cuenta',
        ORDER_CLOSED: '✅ Pedido Cerrado',
        DELIVERY_TICKET: '🛵 Ticket Delivery',
        CASH_OPEN: '💰 Caja Abierta',
        CASH_CLOSE: '💰 Caja Cerrada',
        REPRINT: '🔁 Reimpresión',
    };

    return (
        <div className="ticket-modal" onClick={onClose}>
            <div className="ticket-modal__content" onClick={e => e.stopPropagation()}>
                <div className="ticket-modal__toolbar">
                    <span className="ticket-modal__title">
                        🧾 {eventLabels[job.event] || job.event} → {job.printer.name}
                    </span>
                    <div className="ticket-modal__actions">
                        {job.rule.copies > 1 && <span style={{ color: '#f97316', fontSize: '12px' }}>x{job.rule.copies} copias</span>}
                        <button className="btn btn--print" onClick={onPrint}>🖨️ Imprimir</button>
                        <button className="btn btn--remove" onClick={onClose}>✕ Cerrar</button>
                    </div>
                </div>
                <div className="ticket-modal__paper-wrap">
                    <TicketPaper width={job.template.width}>
                        {elements.map((el: TemplateElement) => (
                            <TicketElement key={el.id} element={el} items={items} currencySymbol={currencySymbol} vars={vars} serverUrl={serverUrl} />
                        ))}
                    </TicketPaper>
                </div>
            </div>
        </div>
    );
};
