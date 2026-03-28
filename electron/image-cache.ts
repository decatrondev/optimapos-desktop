/**
 * Image Cache — Caches product/banner images to disk for offline and fast loading.
 * Images are stored in {userData}/image-cache/{hash}.{ext}
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import log from 'electron-log';

const CACHE_DIR = path.join(app.getPath('userData'), 'image-cache');
const MAX_CACHE_SIZE_MB = 200;
const MAX_CACHE_AGE_DAYS = 30;

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function urlToHash(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
}

function getExtFromUrl(url: string): string {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * Get cached image path for a URL, or null if not cached.
 */
export function getCachedImage(url: string): string | null {
    const hash = urlToHash(url);
    const ext = getExtFromUrl(url);
    const filePath = path.join(CACHE_DIR, `${hash}.${ext}`);
    if (fs.existsSync(filePath)) {
        // Touch the file (update mtime) so LRU works
        const now = new Date();
        try { fs.utimesSync(filePath, now, now); } catch {}
        return filePath;
    }
    return null;
}

/**
 * Download and cache an image. Returns the local file path.
 */
export async function cacheImage(url: string): Promise<string | null> {
    if (!url || url.startsWith('data:')) return null;

    const existing = getCachedImage(url);
    if (existing) return existing;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        const hash = urlToHash(url);
        const ext = getExtFromUrl(url);
        const filePath = path.join(CACHE_DIR, `${hash}.${ext}`);

        fs.writeFileSync(filePath, buffer);
        log.info(`[ImageCache] Cached: ${url.slice(-40)} -> ${hash}.${ext} (${(buffer.length / 1024).toFixed(0)}KB)`);
        return filePath;
    } catch (err: any) {
        log.warn(`[ImageCache] Failed to cache ${url.slice(-40)}:`, err.message);
        return null;
    }
}

/**
 * Get a cached image as a data URL for use in renderer.
 */
export function getCachedImageDataUrl(url: string): string | null {
    const filePath = getCachedImage(url);
    if (!filePath) return null;

    try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath).slice(1);
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
        return null;
    }
}

/**
 * Clean up old/large cache entries.
 */
export function cleanupCache(): void {
    try {
        const files = fs.readdirSync(CACHE_DIR)
            .map(name => {
                const filePath = path.join(CACHE_DIR, name);
                const stat = fs.statSync(filePath);
                return { name, path: filePath, size: stat.size, mtime: stat.mtimeMs };
            })
            .sort((a, b) => a.mtime - b.mtime); // oldest first

        // Remove files older than MAX_CACHE_AGE_DAYS
        const maxAge = Date.now() - MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
        let totalSize = files.reduce((sum, f) => sum + f.size, 0);
        let removed = 0;

        for (const file of files) {
            if (file.mtime < maxAge || totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024) {
                fs.unlinkSync(file.path);
                totalSize -= file.size;
                removed++;
            }
        }

        if (removed > 0) {
            log.info(`[ImageCache] Cleanup: removed ${removed} files, ${(totalSize / 1024 / 1024).toFixed(1)}MB remaining`);
        }
    } catch (err: any) {
        log.warn('[ImageCache] Cleanup error:', err.message);
    }
}
