/**
 * POS View — Point of Sale for VENDOR / ADMIN / MANAGER roles.
 *
 * Layout: Product catalog (left 60%) | Cart (right 40%)
 * Supports DINE_IN, PICKUP, DELIVERY order types.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    POSProduct, POSCategory, POSCombo, POSTable, POSZone,
    CartItem, OrderType, PaymentMethod,
} from '../types/order';
import {
    fetchProducts, fetchCategories, fetchCombos, fetchTables, fetchZones,
    fetchTableOpenOrder, validatePromoCode, createPOSOrder, addItemsToOrder,
    closeTableOrder, CreatePOSOrderPayload,
} from '../services/pos.service';

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
    { key: 'CASH', label: 'Efectivo', icon: '💵' },
    { key: 'YAPE', label: 'Yape', icon: '📱' },
    { key: 'CARD', label: 'Tarjeta', icon: '💳' },
    { key: 'IZIPAY', label: 'Izipay', icon: '📲' },
    { key: 'TRANSFER', label: 'Transfer.', icon: '🏦' },
];

const CURRENCY = 'S/';

/** Safely convert any value (string | number | Decimal) to a number */
function num(v: any): number {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
}

/** Format a price for display */
function fmt(v: any): string {
    return num(v).toFixed(2);
}

function cartItemTotal(item: CartItem): number {
    const addonTotal = item.addons.reduce((s, a) => s + num(a.price) * a.quantity, 0);
    return (num(item.basePrice) + addonTotal) * item.quantity;
}

function getActivePrice(p: POSProduct): number {
    if (p.promoPrice != null && p.promoValidFrom && p.promoValidUntil) {
        const now = Date.now();
        if (now >= new Date(p.promoValidFrom).getTime() && now <= new Date(p.promoValidUntil).getTime()) {
            return num(p.promoPrice);
        }
    }
    return num(p.price);
}

interface POSViewProps {
    token: string;
    serverUrl: string;
    locationId?: number;
    storeName: string;
    onPrintOrder?: (order: any) => void;
    isOffline?: boolean;
    saveOfflineOrder?: (id: string, payload: any) => Promise<{ success: boolean; error?: string }>;
}

export const POSView: React.FC<POSViewProps> = ({ token, serverUrl, locationId, storeName, onPrintOrder, isOffline, saveOfflineOrder: saveOffline }) => {
    // ─── Catalog State ──────────────────────────────────────────────────────
    const [products, setProducts] = useState<POSProduct[]>([]);
    const [categories, setCategories] = useState<POSCategory[]>([]);
    const [combos, setCombos] = useState<POSCombo[]>([]);
    const [tables, setTables] = useState<POSTable[]>([]);
    const [zones, setZones] = useState<POSZone[]>([]);
    const [deliveryBasePrice, setDeliveryBasePrice] = useState(0);
    const [loading, setLoading] = useState(true);

    // ─── Filter State ───────────────────────────────────────────────────────
    const [activeCategory, setActiveCategory] = useState<number | 'combos' | null>(null);
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    // ─── Cart State ─────────────────────────────────────────────────────────
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
    const [selectedTable, setSelectedTable] = useState<POSTable | null>(null);
    const [openOrder, setOpenOrder] = useState<any>(null);
    const [selectedZone, setSelectedZone] = useState<POSZone | null>(null);
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestAddress, setGuestAddress] = useState('');
    const [orderNotes, setOrderNotes] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [promoResult, setPromoResult] = useState<any>(null);

    // ─── Payment State ──────────────────────────────────────────────────────
    const [showPayment, setShowPayment] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
    const [cashReceived, setCashReceived] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [successOrder, setSuccessOrder] = useState<any>(null);

    // ─── Addon Modal ────────────────────────────────────────────────────────
    const [addonProduct, setAddonProduct] = useState<POSProduct | null>(null);
    const [addonVariantId, setAddonVariantId] = useState<number | undefined>(undefined);
    const [addonSelections, setAddonSelections] = useState<Record<number, number>>({});

    // ─── Table Picker ───────────────────────────────────────────────────────
    const [showTablePicker, setShowTablePicker] = useState(false);

    // ─── Load catalog (online → offline fallback) ─────────────────────────
    useEffect(() => {
        const locId = locationId && locationId > 0 ? locationId : undefined;
        setLoading(true);

        const loadOnline = () => Promise.all([
            fetchProducts(token, locId),
            fetchCategories(token, locId),
            fetchCombos(token, locId),
            fetchTables(token, locId),
            fetchZones(token, locId),
        ]).then(([prods, cats, cmbs, tbls, zoneData]) => {
            setProducts(prods);
            setCategories(cats);
            setCombos(cmbs);
            setTables(tbls);
            setZones(zoneData.zones);
            setDeliveryBasePrice(zoneData.basePrice);
        });

        const loadOffline = async () => {
            const api = window.electronAPI;
            if (!api?.offlineGetProducts) return false;
            const hasCatalog = await api.offlineHasCatalog();
            if (!hasCatalog) return false;
            const [prods, cats, cmbs, tbls, zoneData] = await Promise.all([
                api.offlineGetProducts(),
                api.offlineGetCategories(),
                api.offlineGetCombos(),
                api.offlineGetTables(),
                api.offlineGetZones(),
            ]);
            setProducts(prods);
            setCategories(cats);
            setCombos(cmbs);
            setTables(tbls);
            setZones(zoneData.zones);
            setDeliveryBasePrice(zoneData.basePrice);
            return true;
        };

        if (isOffline) {
            loadOffline().then(ok => {
                if (!ok) console.warn('[POS] No cached catalog available');
            }).finally(() => setLoading(false));
        } else {
            loadOnline().catch(async (err) => {
                console.error('[POS] Online load failed, trying cache:', err);
                await loadOffline();
            }).finally(() => setLoading(false));
        }
    }, [token, locationId, isOffline]);

    // ─── Keyboard shortcuts ─────────────────────────────────────────────────
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                searchRef.current?.focus();
            } else if (e.key === 'Escape') {
                if (showPayment) setShowPayment(false);
                else if (addonProduct) setAddonProduct(null);
                else if (showTablePicker) setShowTablePicker(false);
                else setSearch('');
            } else if (e.key === 'F4' && cart.length > 0) {
                e.preventDefault();
                setShowPayment(true);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [showPayment, addonProduct, showTablePicker, cart.length]);

    // ─── Filtered products ──────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        let list = products;
        if (activeCategory && activeCategory !== 'combos') {
            list = list.filter(p => p.categoryId === activeCategory);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return list.sort((a, b) => a.sortOrder - b.sortOrder);
    }, [products, activeCategory, search]);

    const filteredCombos = useMemo(() => {
        if (activeCategory && activeCategory !== 'combos') return [];
        if (!search.trim()) return combos;
        const q = search.toLowerCase();
        return combos.filter(c => c.name.toLowerCase().includes(q));
    }, [combos, activeCategory, search]);

    const showCombos = activeCategory === 'combos' || (!activeCategory && !search.trim());

    // ─── Cart calculations ──────────────────────────────────────────────────
    const subtotal = cart.reduce((s, item) => s + cartItemTotal(item), 0);
    const deliveryFee = orderType === 'DELIVERY'
        ? deliveryBasePrice + num(selectedZone?.surcharge)
        : 0;
    const discount = useMemo(() => {
        if (!promoResult?.valid || !promoResult.discountCode) return 0;
        const dc = promoResult.discountCode;
        if (dc.discountType === 'PERCENTAGE') return subtotal * (dc.discountValue / 100);
        if (dc.discountType === 'FIXED_AMOUNT') return Math.min(dc.discountValue, subtotal);
        if (dc.discountType === 'FREE_DELIVERY') return deliveryFee;
        return 0;
    }, [promoResult, subtotal, deliveryFee]);
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const cashChange = paymentMethod === 'CASH' && cashReceived
        ? parseFloat(cashReceived) - total
        : 0;

    // ─── Add product to cart ────────────────────────────────────────────────
    const addProduct = useCallback((product: POSProduct, variantId?: number) => {
        const variant = variantId ? product.variants.find(v => v.id === variantId) : undefined;
        const price = variant ? num(variant.price) : getActivePrice(product);
        const name = product.name;
        const vName = variant?.name || null;
        const cartId = `p-${product.id}-${variantId || 'base'}`;

        // Check if product has addon groups → open addon modal
        if (product.addonGroups.length > 0) {
            setAddonProduct(product);
            setAddonVariantId(variantId);
            setAddonSelections({});
            return;
        }

        // Check stock
        if (product.stockEnabled) {
            const existingQty = cart.filter(c => c.productId === product.id).reduce((s, c) => s + c.quantity, 0);
            if (existingQty >= product.stockCurrent) return;
        }

        setCart(prev => {
            const existing = prev.find(c => c.cartId === cartId);
            if (existing) {
                if (product.stockEnabled && existing.quantity >= product.stockCurrent) return prev;
                return prev.map(c => c.cartId === cartId ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, {
                cartId, productId: product.id, variantId: variantId || undefined,
                name, variantName: vName, basePrice: price, quantity: 1,
                addons: [], notes: '', maxStock: product.stockEnabled ? product.stockCurrent : undefined,
            }];
        });
    }, [cart]);

    // ─── Add combo to cart ──────────────────────────────────────────────────
    const addCombo = useCallback((combo: POSCombo) => {
        const cartId = `c-${combo.id}`;
        setCart(prev => {
            const existing = prev.find(c => c.cartId === cartId);
            if (existing) {
                return prev.map(c => c.cartId === cartId ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, {
                cartId, comboId: combo.id,
                name: combo.name, variantName: null, basePrice: num(combo.price),
                quantity: 1, addons: [], notes: '',
            }];
        });
    }, []);

    // ─── Confirm addon selection ────────────────────────────────────────────
    const confirmAddons = useCallback(() => {
        if (!addonProduct) return;
        const variant = addonVariantId ? addonProduct.variants.find(v => v.id === addonVariantId) : undefined;
        const price = variant ? num(variant.price) : getActivePrice(addonProduct);
        const selectedAddons = Object.entries(addonSelections)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => {
                const addonId = parseInt(id);
                for (const ag of addonProduct.addonGroups) {
                    const found = ag.addonGroup.addons.find(a => a.id === addonId);
                    if (found) return { addonId, name: found.name, price: num(found.price), quantity: qty };
                }
                return null;
            })
            .filter(Boolean) as CartItem['addons'];

        const addonKey = selectedAddons.map(a => `${a.addonId}:${a.quantity}`).join(',');
        const cartId = `p-${addonProduct.id}-${addonVariantId || 'base'}-${addonKey || 'none'}`;

        if (addonProduct.stockEnabled) {
            const existingQty = cart.filter(c => c.productId === addonProduct.id).reduce((s, c) => s + c.quantity, 0);
            if (existingQty >= addonProduct.stockCurrent) { setAddonProduct(null); return; }
        }

        setCart(prev => {
            const existing = prev.find(c => c.cartId === cartId);
            if (existing) {
                return prev.map(c => c.cartId === cartId ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, {
                cartId, productId: addonProduct.id, variantId: addonVariantId,
                name: addonProduct.name, variantName: variant?.name || null, basePrice: price,
                quantity: 1, addons: selectedAddons, notes: '',
                maxStock: addonProduct.stockEnabled ? addonProduct.stockCurrent : undefined,
            }];
        });
        setAddonProduct(null);
    }, [addonProduct, addonVariantId, addonSelections, cart]);

    // ─── Cart actions ───────────────────────────────────────────────────────
    const updateQty = (cartId: string, delta: number) => {
        setCart(prev => prev.map(c => {
            if (c.cartId !== cartId) return c;
            const newQty = c.quantity + delta;
            if (newQty <= 0) return c; // remove handled separately
            if (c.maxStock && newQty > c.maxStock) return c;
            return { ...c, quantity: newQty };
        }).filter(c => c.quantity > 0));
    };

    const removeItem = (cartId: string) => {
        setCart(prev => prev.filter(c => c.cartId !== cartId));
    };

    const clearCart = () => {
        setCart([]);
        setPromoCode('');
        setPromoResult(null);
        setSelectedTable(null);
        setOpenOrder(null);
        setSelectedZone(null);
        setGuestName('');
        setGuestPhone('');
        setGuestAddress('');
        setOrderNotes('');
        setShowPayment(false);
        setCashReceived('');
    };

    // ─── Table selection ────────────────────────────────────────────────────
    const selectTable = useCallback(async (table: POSTable) => {
        setSelectedTable(table);
        setShowTablePicker(false);
        if (table.status === 'OCCUPIED') {
            const existing = await fetchTableOpenOrder(token, table.id);
            setOpenOrder(existing);
        } else {
            setOpenOrder(null);
        }
    }, [token]);

    // ─── Promo code validation ──────────────────────────────────────────────
    const applyPromo = useCallback(async () => {
        if (!promoCode.trim()) return;
        const locId = locationId && locationId > 0 ? locationId : undefined;
        const result = await validatePromoCode(token, promoCode.trim(), subtotal, locId);
        setPromoResult(result);
    }, [token, promoCode, subtotal, locationId]);

    // ─── Submit order ───────────────────────────────────────────────────────
    const submitOrder = useCallback(async () => {
        if (cart.length === 0 || submitting) return;
        setSubmitting(true);
        try {
            const locId = locationId && locationId > 0 ? locationId : undefined;
            const items: CreatePOSOrderPayload['items'] = cart.map(c => ({
                productId: c.productId,
                comboId: c.comboId,
                variantId: c.variantId,
                quantity: c.quantity,
                notes: c.notes || undefined,
                addons: c.addons.length > 0 ? c.addons.map(a => ({ addonId: a.addonId, quantity: a.quantity })) : undefined,
            }));

            let result: any;

            if (orderType === 'DINE_IN' && openOrder) {
                // Add items to existing open order
                result = await addItemsToOrder(token, openOrder.id, items);
            } else if (orderType === 'DINE_IN' && selectedTable) {
                // Create new DINE_IN order
                result = await createPOSOrder(token, {
                    type: 'DINE_IN',
                    tableId: selectedTable.id,
                    locationId: locId,
                    notes: orderNotes || undefined,
                    promoCode: promoResult?.valid ? promoCode : undefined,
                    items,
                });
            } else {
                // PICKUP or DELIVERY
                result = await createPOSOrder(token, {
                    type: orderType,
                    locationId: locId,
                    guestName: guestName || undefined,
                    guestPhone: guestPhone || undefined,
                    guestAddress: orderType === 'DELIVERY' ? guestAddress || undefined : undefined,
                    zoneId: orderType === 'DELIVERY' ? selectedZone?.id : undefined,
                    notes: orderNotes || undefined,
                    promoCode: promoResult?.valid ? promoCode : undefined,
                    paymentMethod: paymentMethod,
                    paymentStatus: 'PAID',
                    items,
                });
            }

            const order = result?.order || result;
            setSuccessOrder(order);
            if (onPrintOrder && order) onPrintOrder(order);

            // Refresh tables
            if (orderType === 'DINE_IN') {
                const locId2 = locationId && locationId > 0 ? locationId : undefined;
                fetchTables(token, locId2).then(setTables).catch(() => {});
            }

            clearCart();
            setShowPayment(false);

            // Auto-dismiss success after 4 seconds
            setTimeout(() => setSuccessOrder(null), 4000);
        } catch (err: any) {
            console.error('[POS] Order failed:', err);
            // If offline and we have saveOffline, save locally
            if (isOffline && saveOffline) {
                const offlineId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const locId2 = locationId && locationId > 0 ? locationId : undefined;
                const payload: CreatePOSOrderPayload = {
                    type: orderType,
                    locationId: locId2,
                    tableId: orderType === 'DINE_IN' ? selectedTable?.id : undefined,
                    guestName: guestName || undefined,
                    guestPhone: guestPhone || undefined,
                    guestAddress: orderType === 'DELIVERY' ? guestAddress || undefined : undefined,
                    zoneId: orderType === 'DELIVERY' ? selectedZone?.id : undefined,
                    notes: orderNotes || undefined,
                    paymentMethod: paymentMethod,
                    paymentStatus: 'PAID',
                    items: cart.map(c => ({
                        productId: c.productId,
                        comboId: c.comboId,
                        variantId: c.variantId,
                        quantity: c.quantity,
                        notes: c.notes || undefined,
                        addons: c.addons.length > 0 ? c.addons.map(a => ({ addonId: a.addonId, quantity: a.quantity })) : undefined,
                    })),
                };
                const saveResult = await saveOffline(offlineId, payload);
                if (saveResult.success) {
                    setSuccessOrder({ id: offlineId, code: 'OFFLINE', offline: true });
                    clearCart();
                    setShowPayment(false);
                    setTimeout(() => setSuccessOrder(null), 4000);
                } else {
                    alert(`Error offline: ${saveResult.error}`);
                }
            } else {
                alert(`Error: ${err.message}`);
            }
        } finally {
            setSubmitting(false);
        }
    }, [cart, orderType, selectedTable, openOrder, selectedZone, guestName, guestPhone, guestAddress, orderNotes, promoCode, promoResult, paymentMethod, token, locationId, onPrintOrder, submitting]);

    // ─── Close table (payment for DINE_IN) ──────────────────────────────────
    const closeTable = useCallback(async () => {
        if (!openOrder || submitting) return;
        setSubmitting(true);
        try {
            // If cart has items, add them first
            if (cart.length > 0) {
                const items: CreatePOSOrderPayload['items'] = cart.map(c => ({
                    productId: c.productId,
                    comboId: c.comboId,
                    variantId: c.variantId,
                    quantity: c.quantity,
                    notes: c.notes || undefined,
                    addons: c.addons.length > 0 ? c.addons.map(a => ({ addonId: a.addonId, quantity: a.quantity })) : undefined,
                }));
                await addItemsToOrder(token, openOrder.id, items);
            }

            const result = await closeTableOrder(token, openOrder.id, paymentMethod, promoResult?.valid ? promoCode : undefined);
            const order = result?.order || result;
            setSuccessOrder(order);
            if (onPrintOrder && order) onPrintOrder(order);

            const locId = locationId && locationId > 0 ? locationId : undefined;
            fetchTables(token, locId).then(setTables).catch(() => {});

            clearCart();
            setShowPayment(false);
            setTimeout(() => setSuccessOrder(null), 4000);
        } catch (err: any) {
            console.error('[POS] Close table failed:', err);
            alert(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    }, [openOrder, cart, paymentMethod, promoCode, promoResult, token, locationId, onPrintOrder, submitting]);

    // ─── Loading ────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="pos">
                <div className="pos__loading">
                    <div className="login-card__spinner" />
                    <p>Cargando catálogo...</p>
                </div>
            </div>
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════════════════════════

    return (
        <div className="pos">
            {/* ── Left: Catalog ── */}
            <div className="pos__catalog">
                {/* Search bar */}
                <div className="pos__search">
                    <input
                        ref={searchRef}
                        type="text"
                        className="pos__search-input"
                        placeholder="Buscar producto... (F2)"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="pos__search-clear" onClick={() => setSearch('')}>×</button>
                    )}
                </div>

                {/* Category tabs */}
                <div className="pos__categories">
                    <button
                        className={`pos__cat-btn ${!activeCategory ? 'pos__cat-btn--active' : ''}`}
                        onClick={() => setActiveCategory(null)}
                    >
                        Todo
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            className={`pos__cat-btn ${activeCategory === cat.id ? 'pos__cat-btn--active' : ''}`}
                            onClick={() => setActiveCategory(cat.id)}
                        >
                            {cat.name}
                        </button>
                    ))}
                    {combos.length > 0 && (
                        <button
                            className={`pos__cat-btn pos__cat-btn--combo ${activeCategory === 'combos' ? 'pos__cat-btn--active' : ''}`}
                            onClick={() => setActiveCategory('combos')}
                        >
                            Combos
                        </button>
                    )}
                </div>

                {/* Product grid */}
                <div className="pos__grid">
                    {activeCategory !== 'combos' && filteredProducts.map(product => {
                        const price = getActivePrice(product);
                        const hasPromo = price < num(product.price);
                        const outOfStock = product.stockEnabled && product.stockCurrent <= 0;
                        return (
                            <button
                                key={product.id}
                                className={`pos__product ${outOfStock ? 'pos__product--out' : ''}`}
                                onClick={() => {
                                    if (outOfStock) return;
                                    if (product.variants.length > 0) {
                                        // For products with variants, don't add directly — show variant buttons inline
                                        return;
                                    }
                                    addProduct(product);
                                }}
                                disabled={outOfStock}
                            >
                                {product.image && (
                                    <img
                                        className="pos__product-img"
                                        src={`${serverUrl}${product.image}`}
                                        alt={product.name}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                )}
                                <div className="pos__product-info">
                                    <span className="pos__product-name">{product.name}</span>
                                    <span className="pos__product-price">
                                        {hasPromo && <span className="pos__product-old-price">{CURRENCY}{fmt(product.price)}</span>}
                                        {CURRENCY}{fmt(price)}
                                    </span>
                                </div>
                                {product.stockEnabled && (
                                    <span className={`pos__product-stock ${product.stockCurrent <= 3 ? 'pos__product-stock--low' : ''}`}>
                                        {product.stockCurrent}
                                    </span>
                                )}
                                {product.variants.length > 0 && (
                                    <div className="pos__product-variants">
                                        {product.variants.filter(v => v.isActive).map(v => (
                                            <button
                                                key={v.id}
                                                className="pos__variant-btn"
                                                onClick={(e) => { e.stopPropagation(); addProduct(product, v.id); }}
                                            >
                                                {v.name} {CURRENCY}{fmt(v.price)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </button>
                        );
                    })}

                    {/* Combos */}
                    {showCombos && filteredCombos.map(combo => (
                        <button key={`combo-${combo.id}`} className="pos__product pos__product--combo" onClick={() => addCombo(combo)}>
                            {combo.image && (
                                <img
                                    className="pos__product-img"
                                    src={`${serverUrl}${combo.image}`}
                                    alt={combo.name}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <div className="pos__product-info">
                                <span className="pos__product-name">{combo.name}</span>
                                <span className="pos__product-price">{CURRENCY}{fmt(combo.price)}</span>
                            </div>
                            <span className="pos__product-badge">COMBO</span>
                        </button>
                    ))}

                    {filteredProducts.length === 0 && filteredCombos.length === 0 && (
                        <div className="pos__grid-empty">Sin resultados</div>
                    )}
                </div>
            </div>

            {/* ── Right: Cart ── */}
            <div className="pos__cart">
                {/* Order type selector */}
                <div className="pos__type-row">
                    {(['DINE_IN', 'PICKUP', 'DELIVERY'] as OrderType[]).map(t => (
                        <button
                            key={t}
                            className={`pos__type-btn ${orderType === t ? 'pos__type-btn--active' : ''}`}
                            onClick={() => { setOrderType(t); setSelectedTable(null); setOpenOrder(null); setSelectedZone(null); }}
                        >
                            {t === 'DINE_IN' ? '🍽️ Mesa' : t === 'PICKUP' ? '🏪 Recojo' : '🛵 Delivery'}
                        </button>
                    ))}
                </div>

                {/* DINE_IN: Table selector */}
                {orderType === 'DINE_IN' && (
                    <div className="pos__table-bar">
                        <button className="pos__table-select" onClick={() => setShowTablePicker(true)}>
                            {selectedTable ? `Mesa ${selectedTable.name}` : 'Seleccionar mesa...'}
                            {selectedTable?.status === 'OCCUPIED' && <span className="pos__table-badge">Ocupada</span>}
                        </button>
                        {openOrder && (
                            <div className="pos__open-order">
                                Pedido abierto: #{openOrder.code} — {CURRENCY}{fmt(openOrder.total)}
                            </div>
                        )}
                    </div>
                )}

                {/* DELIVERY: Zone + customer info */}
                {orderType === 'DELIVERY' && (
                    <div className="pos__delivery-info">
                        <select
                            className="pos__select"
                            value={selectedZone?.id || ''}
                            onChange={e => {
                                const z = zones.find(z => z.id === parseInt(e.target.value));
                                setSelectedZone(z || null);
                            }}
                        >
                            <option value="">Zona de entrega...</option>
                            {zones.map(z => (
                                <option key={z.id} value={z.id}>{z.name} (+{CURRENCY}{fmt(z.surcharge)})</option>
                            ))}
                        </select>
                        <input className="pos__input" placeholder="Nombre" value={guestName} onChange={e => setGuestName(e.target.value)} />
                        <input className="pos__input" placeholder="Teléfono" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
                        <input className="pos__input" placeholder="Dirección" value={guestAddress} onChange={e => setGuestAddress(e.target.value)} />
                    </div>
                )}

                {/* PICKUP: Customer info */}
                {orderType === 'PICKUP' && (
                    <div className="pos__delivery-info">
                        <input className="pos__input" placeholder="Nombre (opcional)" value={guestName} onChange={e => setGuestName(e.target.value)} />
                        <input className="pos__input" placeholder="Teléfono (opcional)" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
                    </div>
                )}

                {/* Cart items */}
                <div className="pos__items">
                    {cart.length === 0 ? (
                        <div className="pos__items-empty">Carrito vacío</div>
                    ) : cart.map(item => (
                        <div key={item.cartId} className="pos__item">
                            <div className="pos__item-main">
                                <div className="pos__item-name">
                                    {item.name}
                                    {item.variantName && <span className="pos__item-variant"> ({item.variantName})</span>}
                                </div>
                                <div className="pos__item-price">{CURRENCY}{cartItemTotal(item).toFixed(2)}</div>
                            </div>
                            {item.addons.length > 0 && (
                                <div className="pos__item-addons">
                                    {item.addons.map(a => (
                                        <span key={a.addonId} className="pos__item-addon">
                                            + {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="pos__item-actions">
                                <button className="pos__qty-btn" onClick={() => updateQty(item.cartId, -1)}>−</button>
                                <span className="pos__qty-val">{item.quantity}</span>
                                <button className="pos__qty-btn" onClick={() => updateQty(item.cartId, 1)}>+</button>
                                <button className="pos__remove-btn" onClick={() => removeItem(item.cartId)}>🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Notes */}
                {cart.length > 0 && (
                    <input
                        className="pos__input pos__notes-input"
                        placeholder="Notas del pedido..."
                        value={orderNotes}
                        onChange={e => setOrderNotes(e.target.value)}
                    />
                )}

                {/* Promo code */}
                {cart.length > 0 && (
                    <div className="pos__promo-row">
                        <input
                            className="pos__input pos__promo-input"
                            placeholder="Código descuento"
                            value={promoCode}
                            onChange={e => { setPromoCode(e.target.value); setPromoResult(null); }}
                        />
                        <button className="pos__promo-btn" onClick={applyPromo} disabled={!promoCode.trim()}>Aplicar</button>
                        {promoResult && (
                            <span className={`pos__promo-status ${promoResult.valid ? 'pos__promo-status--ok' : 'pos__promo-status--err'}`}>
                                {promoResult.valid ? `−${CURRENCY}${discount.toFixed(2)}` : promoResult.error || 'Inválido'}
                            </span>
                        )}
                    </div>
                )}

                {/* Totals */}
                <div className="pos__totals">
                    <div className="pos__total-row">
                        <span>Subtotal</span>
                        <span>{CURRENCY}{subtotal.toFixed(2)}</span>
                    </div>
                    {deliveryFee > 0 && (
                        <div className="pos__total-row">
                            <span>Delivery</span>
                            <span>{CURRENCY}{deliveryFee.toFixed(2)}</span>
                        </div>
                    )}
                    {discount > 0 && (
                        <div className="pos__total-row pos__total-row--discount">
                            <span>Descuento</span>
                            <span>−{CURRENCY}{discount.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="pos__total-row pos__total-row--total">
                        <span>TOTAL</span>
                        <span>{CURRENCY}{total.toFixed(2)}</span>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="pos__actions">
                    {cart.length > 0 && (
                        <button className="pos__btn pos__btn--clear" onClick={clearCart}>Limpiar</button>
                    )}
                    {orderType === 'DINE_IN' && openOrder ? (
                        <>
                            {cart.length > 0 && (
                                <button
                                    className="pos__btn pos__btn--send"
                                    onClick={submitOrder}
                                    disabled={submitting}
                                >
                                    {submitting ? '⏳' : '📤 Agregar a mesa'}
                                </button>
                            )}
                            <button
                                className="pos__btn pos__btn--pay"
                                onClick={() => setShowPayment(true)}
                                disabled={submitting}
                            >
                                💰 Cobrar mesa (F4)
                            </button>
                        </>
                    ) : orderType === 'DINE_IN' ? (
                        <button
                            className="pos__btn pos__btn--send"
                            onClick={submitOrder}
                            disabled={cart.length === 0 || !selectedTable || submitting}
                        >
                            {submitting ? '⏳' : '📤 Enviar a cocina'}
                        </button>
                    ) : (
                        <button
                            className="pos__btn pos__btn--pay"
                            onClick={() => setShowPayment(true)}
                            disabled={cart.length === 0 || submitting}
                        >
                            💰 Cobrar (F4)
                        </button>
                    )}
                </div>
            </div>

            {/* ── Payment Modal ── */}
            {showPayment && (
                <div className="pos__overlay" onClick={() => setShowPayment(false)}>
                    <div className="pos__modal" onClick={e => e.stopPropagation()}>
                        <h3 className="pos__modal-title">Método de pago</h3>
                        <div className="pos__payment-methods">
                            {PAYMENT_METHODS.map(pm => (
                                <button
                                    key={pm.key}
                                    className={`pos__pm-btn ${paymentMethod === pm.key ? 'pos__pm-btn--active' : ''}`}
                                    onClick={() => setPaymentMethod(pm.key)}
                                >
                                    <span>{pm.icon}</span>
                                    <span>{pm.label}</span>
                                </button>
                            ))}
                        </div>

                        {paymentMethod === 'CASH' && (
                            <div className="pos__cash-section">
                                <label className="pos__cash-label">Monto recibido:</label>
                                <input
                                    type="number"
                                    className="pos__cash-input"
                                    value={cashReceived}
                                    onChange={e => setCashReceived(e.target.value)}
                                    placeholder={total.toFixed(2)}
                                    autoFocus
                                />
                                {cashChange > 0 && (
                                    <div className="pos__cash-change">
                                        Vuelto: <strong>{CURRENCY}{cashChange.toFixed(2)}</strong>
                                    </div>
                                )}
                                {cashReceived && parseFloat(cashReceived) < total && (
                                    <div className="pos__cash-insufficient">Monto insuficiente</div>
                                )}
                            </div>
                        )}

                        <div className="pos__modal-total">
                            Total: <strong>{CURRENCY}{total.toFixed(2)}</strong>
                        </div>

                        <div className="pos__modal-actions">
                            <button className="pos__btn pos__btn--clear" onClick={() => setShowPayment(false)}>Cancelar</button>
                            <button
                                className="pos__btn pos__btn--pay"
                                onClick={openOrder ? closeTable : submitOrder}
                                disabled={submitting || (paymentMethod === 'CASH' && cashReceived !== '' && parseFloat(cashReceived) < total)}
                            >
                                {submitting ? '⏳ Procesando...' : `✅ Confirmar ${CURRENCY}${total.toFixed(2)}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Table Picker Modal ── */}
            {showTablePicker && (
                <div className="pos__overlay" onClick={() => setShowTablePicker(false)}>
                    <div className="pos__modal pos__modal--tables" onClick={e => e.stopPropagation()}>
                        <h3 className="pos__modal-title">Seleccionar mesa</h3>
                        <div className="pos__table-grid">
                            {tables.map(table => (
                                <button
                                    key={table.id}
                                    className={`pos__table-btn pos__table-btn--${table.status.toLowerCase()}`}
                                    onClick={() => selectTable(table)}
                                >
                                    <span className="pos__table-num">{table.name}</span>
                                    <span className="pos__table-status">
                                        {table.status === 'FREE' ? 'Libre' : table.status === 'OCCUPIED' ? 'Ocupada' : 'Reservada'}
                                    </span>
                                    {table.zone && <span className="pos__table-zone">{table.zone}</span>}
                                </button>
                            ))}
                            {tables.length === 0 && <div className="pos__grid-empty">Sin mesas configuradas</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Addon Modal ── */}
            {addonProduct && (
                <div className="pos__overlay" onClick={() => setAddonProduct(null)}>
                    <div className="pos__modal" onClick={e => e.stopPropagation()}>
                        <h3 className="pos__modal-title">{addonProduct.name} — Adicionales</h3>
                        {addonProduct.addonGroups.map(ag => (
                            <div key={ag.addonGroup.id} className="pos__addon-group">
                                <h4 className="pos__addon-group-title">{ag.addonGroup.name}</h4>
                                {ag.addonGroup.addons.map(addon => {
                                    const qty = addonSelections[addon.id] || 0;
                                    return (
                                        <div key={addon.id} className="pos__addon-row">
                                            <span className="pos__addon-name">{addon.name}</span>
                                            <span className="pos__addon-price">+{CURRENCY}{fmt(addon.price)}</span>
                                            <div className="pos__addon-qty">
                                                <button
                                                    className="pos__qty-btn"
                                                    onClick={() => setAddonSelections(prev => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] || 0) - 1) }))}
                                                >−</button>
                                                <span>{qty}</span>
                                                <button
                                                    className="pos__qty-btn"
                                                    onClick={() => setAddonSelections(prev => ({ ...prev, [addon.id]: (prev[addon.id] || 0) + 1 }))}
                                                >+</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                        <div className="pos__modal-actions">
                            <button className="pos__btn pos__btn--clear" onClick={() => setAddonProduct(null)}>Cancelar</button>
                            <button className="pos__btn pos__btn--pay" onClick={confirmAddons}>Agregar al carrito</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Success overlay ── */}
            {successOrder && (
                <div className="pos__success-overlay" onClick={() => setSuccessOrder(null)}>
                    <div className="pos__success-card">
                        <span className="pos__success-icon">{successOrder.offline ? '📴' : '✅'}</span>
                        <h2>{successOrder.offline ? 'Guardado offline' : 'Pedido creado'}</h2>
                        <p className="pos__success-code">#{successOrder.code}</p>
                        {successOrder.offline
                            ? <p className="pos__success-total" style={{ fontSize: '0.9rem', opacity: 0.7 }}>Se enviara al servidor cuando haya conexion</p>
                            : <p className="pos__success-total">{CURRENCY}{fmt(successOrder.total)}</p>
                        }
                    </div>
                </div>
            )}
        </div>
    );
};
