/**
 * Offline SQLite Database — runs in Electron main process only.
 * Stores cached catalog data and pending offline orders.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import log from 'electron-log';

let db: Database.Database | null = null;

const MAX_OFFLINE_ORDERS = 50;

// ─── Init ────────────────────────────────────────────────────────────────────

export function initDatabase(): void {
    const dbPath = path.join(app.getPath('userData'), 'optimapos-offline.db');
    log.info(`[DB] Opening SQLite at ${dbPath}`);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables();
    log.info('[DB] Database ready');
}

function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized');
    return db;
}

function createTables(): void {
    const d = getDb();

    d.exec(`
        CREATE TABLE IF NOT EXISTS catalog_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id        INTEGER PRIMARY KEY,
            name      TEXT NOT NULL,
            image     TEXT,
            sortOrder INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS products (
            id           INTEGER PRIMARY KEY,
            name         TEXT NOT NULL,
            price        REAL NOT NULL,
            image        TEXT,
            categoryId   INTEGER NOT NULL,
            isActive     INTEGER DEFAULT 1,
            sortOrder    INTEGER DEFAULT 0,
            stockEnabled INTEGER DEFAULT 0,
            stockCurrent INTEGER DEFAULT 0,
            promoPrice   REAL,
            promoFrom    TEXT,
            promoUntil   TEXT,
            FOREIGN KEY (categoryId) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS variants (
            id        INTEGER PRIMARY KEY,
            productId INTEGER NOT NULL,
            name      TEXT NOT NULL,
            price     REAL NOT NULL,
            isActive  INTEGER DEFAULT 1,
            FOREIGN KEY (productId) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS addon_groups (
            id        INTEGER PRIMARY KEY,
            productId INTEGER NOT NULL,
            name      TEXT NOT NULL,
            type      TEXT NOT NULL DEFAULT 'ADDITION',
            FOREIGN KEY (productId) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS addons (
            id           INTEGER PRIMARY KEY,
            addonGroupId INTEGER NOT NULL,
            name         TEXT NOT NULL,
            price        REAL NOT NULL,
            FOREIGN KEY (addonGroupId) REFERENCES addon_groups(id)
        );

        CREATE TABLE IF NOT EXISTS combos (
            id          INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            price       REAL NOT NULL,
            image       TEXT,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS combo_items (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            comboId   INTEGER NOT NULL,
            productId INTEGER NOT NULL,
            quantity  INTEGER DEFAULT 1,
            FOREIGN KEY (comboId) REFERENCES combos(id)
        );

        CREATE TABLE IF NOT EXISTS tables_cache (
            id       INTEGER PRIMARY KEY,
            name     TEXT NOT NULL,
            number   INTEGER NOT NULL,
            capacity INTEGER DEFAULT 4,
            zone     TEXT,
            status   TEXT DEFAULT 'FREE'
        );

        CREATE TABLE IF NOT EXISTS zones (
            id        INTEGER PRIMARY KEY,
            name      TEXT NOT NULL,
            surcharge REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS zones_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pending_orders (
            id         TEXT PRIMARY KEY,
            payload    TEXT NOT NULL,
            createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
            retries    INTEGER DEFAULT 0,
            lastError  TEXT
        );
    `);
}

// ─── Catalog Sync (full replace) ────────────────────────────────────────────

export interface CatalogData {
    categories: any[];
    products: any[];
    combos: any[];
    tables: any[];
    zones: any[];
    zonesBasePrice: number;
}

export function replaceCatalog(data: CatalogData): void {
    const d = getDb();

    const run = d.transaction(() => {
        // Clear all catalog tables
        d.exec(`
            DELETE FROM combo_items;
            DELETE FROM combos;
            DELETE FROM addons;
            DELETE FROM addon_groups;
            DELETE FROM variants;
            DELETE FROM products;
            DELETE FROM categories;
            DELETE FROM tables_cache;
            DELETE FROM zones;
            DELETE FROM zones_meta;
        `);

        // Categories
        const insCategory = d.prepare('INSERT INTO categories (id, name, image, sortOrder) VALUES (?, ?, ?, ?)');
        for (const c of data.categories) {
            insCategory.run(c.id, c.name, c.image || null, c.sortOrder || 0);
        }

        // Products + variants + addon groups + addons
        const insProduct = d.prepare(`INSERT INTO products (id, name, price, image, categoryId, isActive, sortOrder, stockEnabled, stockCurrent, promoPrice, promoFrom, promoUntil)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const insVariant = d.prepare('INSERT INTO variants (id, productId, name, price, isActive) VALUES (?, ?, ?, ?, ?)');
        const insAddonGroup = d.prepare('INSERT INTO addon_groups (id, productId, name, type) VALUES (?, ?, ?, ?)');
        const insAddon = d.prepare('INSERT INTO addons (id, addonGroupId, name, price) VALUES (?, ?, ?, ?)');

        for (const p of data.products) {
            const price = typeof p.price === 'string' ? parseFloat(p.price) : p.price;
            const promoPrice = p.promoPrice != null ? (typeof p.promoPrice === 'string' ? parseFloat(p.promoPrice) : p.promoPrice) : null;
            insProduct.run(p.id, p.name, price, p.image || null, p.categoryId, p.isActive ? 1 : 0,
                p.sortOrder || 0, p.stockEnabled ? 1 : 0, p.stockCurrent || 0,
                promoPrice, p.promoValidFrom || null, p.promoValidUntil || null);

            if (p.variants) {
                for (const v of p.variants) {
                    const vPrice = typeof v.price === 'string' ? parseFloat(v.price) : v.price;
                    insVariant.run(v.id, p.id, v.name, vPrice, v.isActive ? 1 : 0);
                }
            }

            if (p.addonGroups) {
                for (const ag of p.addonGroups) {
                    const group = ag.addonGroup || ag;
                    insAddonGroup.run(group.id, p.id, group.name, group.type || 'ADDITION');
                    if (group.addons) {
                        for (const a of group.addons) {
                            const aPrice = typeof a.price === 'string' ? parseFloat(a.price) : a.price;
                            insAddon.run(a.id, group.id, a.name, aPrice);
                        }
                    }
                }
            }
        }

        // Combos
        const insCombo = d.prepare('INSERT INTO combos (id, name, price, image, description) VALUES (?, ?, ?, ?, ?)');
        const insComboItem = d.prepare('INSERT INTO combo_items (comboId, productId, quantity) VALUES (?, ?, ?)');
        for (const c of data.combos) {
            const cPrice = typeof c.price === 'string' ? parseFloat(c.price) : c.price;
            insCombo.run(c.id, c.name, cPrice, c.image || null, c.description || null);
            if (c.items) {
                for (const ci of c.items) {
                    insComboItem.run(c.id, ci.product?.id || ci.productId, ci.quantity || 1);
                }
            }
        }

        // Tables
        const insTable = d.prepare('INSERT INTO tables_cache (id, name, number, capacity, zone, status) VALUES (?, ?, ?, ?, ?, ?)');
        for (const t of data.tables) {
            insTable.run(t.id, t.name, t.number || 0, t.capacity || 4, t.zone || null, t.status || 'FREE');
        }

        // Zones
        const insZone = d.prepare('INSERT INTO zones (id, name, surcharge) VALUES (?, ?, ?)');
        for (const z of data.zones) {
            const surcharge = typeof z.surcharge === 'string' ? parseFloat(z.surcharge) : z.surcharge;
            insZone.run(z.id, z.name, surcharge || 0);
        }

        // Zones base price
        d.prepare('INSERT OR REPLACE INTO zones_meta (key, value) VALUES (?, ?)').run('basePrice', String(data.zonesBasePrice || 0));

        // Sync timestamp
        d.prepare('INSERT OR REPLACE INTO catalog_meta (key, value) VALUES (?, ?)').run('lastSync', new Date().toISOString());
    });

    run();
    log.info(`[DB] Catalog replaced — ${data.products.length} products, ${data.categories.length} categories`);
}

// ─── Catalog Read ───────────────────────────────────────────────────────────

export function getCachedCategories(): any[] {
    return getDb().prepare('SELECT * FROM categories ORDER BY sortOrder, name').all();
}

export function getCachedProducts(): any[] {
    const d = getDb();
    const products = d.prepare('SELECT * FROM products WHERE isActive = 1 ORDER BY sortOrder, name').all() as any[];
    const variants = d.prepare('SELECT * FROM variants WHERE isActive = 1').all() as any[];
    const addonGroups = d.prepare('SELECT * FROM addon_groups').all() as any[];
    const addons = d.prepare('SELECT * FROM addons').all() as any[];

    // Group addons by group
    const addonsByGroup = new Map<number, any[]>();
    for (const a of addons) {
        if (!addonsByGroup.has(a.addonGroupId)) addonsByGroup.set(a.addonGroupId, []);
        addonsByGroup.get(a.addonGroupId)!.push(a);
    }

    // Group addon groups by product
    const groupsByProduct = new Map<number, any[]>();
    for (const ag of addonGroups) {
        if (!groupsByProduct.has(ag.productId)) groupsByProduct.set(ag.productId, []);
        groupsByProduct.get(ag.productId)!.push({
            addonGroup: { ...ag, addons: addonsByGroup.get(ag.id) || [] },
        });
    }

    // Group variants by product
    const variantsByProduct = new Map<number, any[]>();
    for (const v of variants) {
        if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, []);
        variantsByProduct.get(v.productId)!.push(v);
    }

    return products.map(p => ({
        ...p,
        isActive: !!p.isActive,
        stockEnabled: !!p.stockEnabled,
        variants: variantsByProduct.get(p.id) || [],
        addonGroups: groupsByProduct.get(p.id) || [],
    }));
}

export function getCachedCombos(): any[] {
    const d = getDb();
    const combos = d.prepare('SELECT * FROM combos').all() as any[];
    const comboItems = d.prepare('SELECT * FROM combo_items').all() as any[];

    const itemsByCombo = new Map<number, any[]>();
    for (const ci of comboItems) {
        if (!itemsByCombo.has(ci.comboId)) itemsByCombo.set(ci.comboId, []);
        itemsByCombo.get(ci.comboId)!.push({ product: { id: ci.productId, name: '' }, quantity: ci.quantity });
    }

    return combos.map(c => ({ ...c, items: itemsByCombo.get(c.id) || [] }));
}

export function getCachedTables(): any[] {
    return getDb().prepare('SELECT * FROM tables_cache ORDER BY number').all();
}

export function getCachedZones(): { zones: any[]; basePrice: number } {
    const d = getDb();
    const zones = d.prepare('SELECT * FROM zones ORDER BY name').all();
    const meta = d.prepare("SELECT value FROM zones_meta WHERE key = 'basePrice'").get() as any;
    return { zones, basePrice: meta ? parseFloat(meta.value) : 0 };
}

export function getLastSyncTime(): string | null {
    const row = getDb().prepare("SELECT value FROM catalog_meta WHERE key = 'lastSync'").get() as any;
    return row?.value || null;
}

export function hasCachedCatalog(): boolean {
    const count = getDb().prepare('SELECT COUNT(*) as c FROM products').get() as any;
    return count.c > 0;
}

// ─── Pending Orders ─────────────────────────────────────────────────────────

export function saveOfflineOrder(id: string, payload: any): { success: boolean; error?: string } {
    const d = getDb();
    const count = (d.prepare('SELECT COUNT(*) as c FROM pending_orders').get() as any).c;
    if (count >= MAX_OFFLINE_ORDERS) {
        return { success: false, error: `Limite de ${MAX_OFFLINE_ORDERS} pedidos offline alcanzado` };
    }
    d.prepare('INSERT INTO pending_orders (id, payload) VALUES (?, ?)').run(id, JSON.stringify(payload));
    log.info(`[DB] Offline order saved: ${id}`);
    return { success: true };
}

export function getPendingOrders(): Array<{ id: string; payload: any; createdAt: string; retries: number; lastError: string | null }> {
    const rows = getDb().prepare('SELECT * FROM pending_orders ORDER BY createdAt ASC').all() as any[];
    return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }));
}

export function getPendingOrderCount(): number {
    return (getDb().prepare('SELECT COUNT(*) as c FROM pending_orders').get() as any).c;
}

export function removePendingOrder(id: string): void {
    getDb().prepare('DELETE FROM pending_orders WHERE id = ?').run(id);
    log.info(`[DB] Pending order removed: ${id}`);
}

export function updatePendingOrderRetry(id: string, error: string): void {
    getDb().prepare('UPDATE pending_orders SET retries = retries + 1, lastError = ? WHERE id = ?').run(error, id);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        log.info('[DB] Database closed');
    }
}
