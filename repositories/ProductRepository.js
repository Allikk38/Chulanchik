// ============================================================
// repositories/ProductRepository.js
// ============================================================

/**
 * Репозиторий товаров.
 * 
 * Единственный модуль, который обращается к таблице products в Supabase.
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

// ============================================================
// Кэш
// ============================================================

/** @type {Object|null} */
let cacheEntry = null;

/**
 * Пытается загрузить кэш из sessionStorage.
 * Если кэш просрочен — удаляет его и возвращает null.
 * 
 * @returns {Object[]|null}
 */
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
        // битый кэш — игнорируем
        sessionStorage.removeItem(CACHE_KEY);
    }

    return null;
}

/**
 * Сохраняет данные в кэш.
 * 
 * @param {Object[]} data
 */
function saveCache(data) {
    cacheEntry = { data, timestamp: Date.now() };
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    } catch (e) {
        // sessionStorage переполнен — не критично
    }
}

/**
 * Инвалидирует кэш (вызывается после мутаций).
 */
function invalidateCache() {
    cacheEntry = null;
    try {
        sessionStorage.removeItem(CACHE_KEY);
    } catch (e) { /* */ }
}

// ============================================================
// Репозиторий
// ============================================================

export const ProductRepository = {
    /**
     * Загружает все товары.
     * 
     * @param {Object} [options]
     * @param {boolean} [options.force=false] — принудительно с сервера
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
     * Загружает товары в наличии (для кассы).
     * 
     * @param {Object} [options]
     * @param {boolean} [options.force=false]
     * @returns {Promise<Object[]>}
     */
    async loadInStock({ force = false } = {}) {
        // loadAll уже кэширует всё, фильтруем на стороне репозитория
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
     * @param {string} productData.name
     * @param {number} productData.price
     * @param {number} [productData.cost_price]
     * @param {string} [productData.category]
     * @param {Object} [productData.attributes]
     * @param {string} [productData.photo_url]
     * @param {string} productData.created_by
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
     * @returns {Promise<Object>} обновлённый товар
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
    }
};

export default ProductRepository;
