// ============================================================
// repositories/ProductRepository.js
// v1.2.0 — 2026-10-27: чтение quantity_limit
// ============================================================

/**
 * Репозиторий товаров.
 *
 * Единственный модуль, который обращается к таблице products в Supabase
 * и к Storage-бакету product-photos.
 * Владеет кэшем в sessionStorage (TTL 5 минут).
 *
 * @module repositories/ProductRepository
 */

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Константы
// ============================================================

const CACHE_KEY = 'products_cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

const PHOTOS_BUCKET = 'product-photos';
const MAX_PHOTO_MB = 5;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ============================================================
// Кэш
// ============================================================

/** @type {Object|null} */
let cacheEntry = null;

function loadCache() {
    if (cacheEntry) {
        if (Date.now() - cacheEntry.timestamp < CACHE_TTL_MS) {
            return cacheEntry.data;
        }
        cacheEntry = null;
    }

    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
                cacheEntry = parsed;
                return parsed.data;
            }
            sessionStorage.removeItem(CACHE_KEY);
        }
    } catch (e) {
        sessionStorage.removeItem(CACHE_KEY);
    }

    return null;
}

function saveCache(data) {
    cacheEntry = { data, timestamp: Date.now() };
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    } catch (e) {
        // sessionStorage переполнен — не критично
    }
}

function invalidateCache() {
    cacheEntry = null;
    try {
        sessionStorage.removeItem(CACHE_KEY);
    } catch (e) { /* */ }
}

// ============================================================
// Работа с фото товара
// ============================================================

async function uploadPhoto(file) {
    if (!file) {
        throw new Error('Файл не передан');
    }

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        throw new Error('Поддерживаются только JPG, PNG, WEBP');
    }

    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        throw new Error(`Файл не должен превышать ${MAX_PHOTO_MB} MB`);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) {
        throw new Error('Ошибка загрузки фото: ' + error.message);
    }

    const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
}

async function deletePhoto(photoUrl) {
    if (!photoUrl) return;

    try {
        const fileName = photoUrl.split('/').pop();
        if (!fileName) return;

        await supabase.storage.from(PHOTOS_BUCKET).remove([fileName]);
    } catch (e) {
        console.warn('[ProductRepository] deletePhoto error:', e);
    }
}

// ============================================================
// Репозиторий
// ============================================================

export const ProductRepository = {
    async loadAll({ force = false } = {}) {
        if (!force) {
            const cached = loadCache();
            if (cached) return cached;
        }

        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        saveCache(data || []);
        return data || [];
    },

    async loadInStock({ force = false } = {}) {
        const all = await this.loadAll({ force });
        return all.filter(p => p.status === 'in_stock');
    },

    async getById(id) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    async create(productData) {
        const { data, error } = await supabase
            .from('products')
            .insert({
                name: productData.name,
                price: productData.price,
                cost_price: productData.cost_price || 0,
                category: productData.category || 'other',
                attributes: productData.attributes || {},
                photo_url: productData.photo_url || null,
                created_by: productData.created_by,
                status: 'in_stock',
                quantity_limit: Number(productData.quantity_limit) || 1
            })
            .select()
            .single();

        if (error) throw error;

        invalidateCache();
        return data;
    },

    async update(id, updates) {
        const { data, error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        invalidateCache();
        return data;
    },

    async remove(id) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;

        invalidateCache();
    },

    uploadPhoto,
    deletePhoto
};

export default ProductRepository;