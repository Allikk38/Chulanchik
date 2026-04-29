// ============================================================
// repositories/SaleRepository.js
// Шаг 2: Нормализация items + исправление передачи параметров в RPC
// ============================================================

/**
 * Репозиторий продаж.
 *
 * Единственный модуль, который обращается к таблице sales в Supabase.
 * Владеет кэшем в sessionStorage (TTL 2 минуты).
 * Нормализует поле items и числовые поля.
 *
 * @module repositories/SaleRepository
 */

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Константы
// ============================================================

const CACHE_KEY = 'sales_cache';
const CACHE_TTL_MS = 2 * 60 * 1000;

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

// ============================================================
// Нормализация
// ============================================================

function normalizeItems(items) {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
        try {
            const parsed = JSON.parse(items);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

function normalizeSale(sale) {
    return {
        ...sale,
        items: normalizeItems(sale.items),
        total: Number(sale.total) || 0,
        profit: Number(sale.profit) || 0
    };
}

// ============================================================
// Репозиторий
// ============================================================

export const SaleRepository = {
    /**
     * Создаёт продажу через RPC.
     * p_items передаётся как массив (Supabase JS-клиент сам преобразует в JSONB).
     *
     * @param {Object} saleData
     * @returns {Promise<Object>}
     */
    async create(saleData) {
        const { data, error } = await supabase.rpc('checkout_sale', {
            p_shift_id: saleData.shift_id,
            p_items: saleData.items,
            p_total: saleData.total,
            p_profit: saleData.profit,
            p_payment_method: saleData.payment_method,
            p_user_id: saleData.user_id
        });

        if (error) throw error;
        return { id: data };
    },

    /**
     * Загружает продажи с фильтрацией.
     * Нормализует items и числовые поля.
     *
     * @param {Object} [options]
     * @returns {Promise<Object[]>}
     */
    async getAll({ shiftId, from, to, limit = 100, force = false } = {}) {
        if (!force) {
            const cached = loadCache();
            if (cached) return cached;
        }

        try {
            let query = supabase
                .from('sales')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (shiftId) query = query.eq('shift_id', shiftId);
            if (from) query = query.gte('created_at', from);
            if (to) query = query.lte('created_at', to);

            const { data, error } = await query;

            if (error) throw error;

            const sales = (data || []).map(normalizeSale);
            saveCache(sales);
            return sales;

        } catch (err) {
            console.error('[SaleRepository] getAll error:', err);

            const staleCache = loadCache();
            if (staleCache) {
                console.warn('[SaleRepository] returning stale cache due to network error');
                return staleCache;
            }

            return [];
        }
    },

    /**
     * Получает продажу по ID.
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        try {
            const { data, error } = await supabase
                .from('sales')
                .select('*')
                .eq('id', id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data ? normalizeSale(data) : null;

        } catch (err) {
            console.error('[SaleRepository] getById error:', err);
            return null;
        }
    }
};

export default SaleRepository;
