// ============================================================
// repositories/ProductRepository.js
// v1.1.0 — 2026-09-18: добавлены uploadPhoto / deletePhoto
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

/**
 * Загружает фото товара в Storage.
 * Валидирует MIME-тип и размер.
 *
 * @param {File} file
 * @returns {Promise<string>} publicUrl загруженного файла
 * @throws {Error} при невалидном файле или ошибке загрузки
 */
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

/**
 * Удаляет фото товара из Storage по его publicUrl.
 * Молча игнорирует ошибки — удаление не критично.
 *
 * @param {string} photoUrl
 * @returns {Promise<void>}
 */
async function deletePhoto(photoUrl) {
    if (!photoUrl) return;

    try {
        // URL вида: https://xxx.supabase.co/storage/v1/object/public/product-photos/product-123-abc.jpg
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
    /**
     * Загружает все товары.
     *
     * @param {Object} [options]
     * @param {boolean} [options.force=false]
     * @returns {Promise<Object[]>}
     */
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

    /**
     * Загружает товары в наличии.
     *
     * @param {Object} [options]
     * @param {boolean} [options.force=false]
     * @returns {Promise<Object[]>}
     */
    async loadInStock({ force = false } = {}) {
        const all = await this.loadAll({ force });
        return all.filter(p => p.status === 'in_stock');
    },

    /**
     * Получает товар по ID.
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    /**
     * Создаёт товар.
     *
     * @param {Object} productData
     * @returns {Promise<Object>} созданный товар
     */
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
                status: 'in_stock'
            })
            .select()
            .single();

        if (error) throw error;

        invalidateCache();
        return data;
    },

    /**
     * Обновляет товар.
     *
     * @param {string} id
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
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

    /**
     * Удаляет товар.
     *
     * @param {string} id
     * @returns {Promise<void>}
     */
    async remove(id) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;

        invalidateCache();
    },

    /**
     * Загружает фото товара в Storage.
     *
     * @param {File} file
     * @returns {Promise<string>} publicUrl
     */
    uploadPhoto,

    /**
     * Удаляет фото товара из Storage.
     *
     * @param {string} photoUrl
     * @returns {Promise<void>}
     */
    deletePhoto
};

export default ProductRepository;
