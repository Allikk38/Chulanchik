// ============================================================
// repositories/SaleRepository.js
// v2.5.0 — 2026-09-18: передача seller_name в checkout_sale
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
    } catch (e) {}
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
     *
     * @param {Object} saleData
     * @param {string} saleData.shift_id
     * @param {Object[]} saleData.items
     * @param {number} saleData.total
     * @param {number} saleData.profit
     * @param {string} saleData.payment_method
     * @param {string} saleData.user_id
     * @param {string} [saleData.seller_name] — снимок имени продавца
     * @returns {Promise<{id: string}>}
     */
    async create(saleData) {
        console.log('[SaleRepository] Creating sale with data:', {
            shift_id: saleData.shift_id,
            items_count: saleData.items.length,
            total: saleData.total,
            profit: saleData.profit,
            payment_method: saleData.payment_method,
            user_id: saleData.user_id,
            seller_name: saleData.seller_name
        });

        const { data, error } = await supabase.rpc('checkout_sale', {
            p_shift_id: saleData.shift_id,
            p_items: saleData.items,
            p_total: saleData.total,
            p_profit: saleData.profit,
            p_payment_method: saleData.payment_method,
            p_user_id: saleData.user_id,
            p_seller_name: saleData.seller_name || null
        });

        if (error) {
            console.error('[SaleRepository] RPC error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            throw error;
        }

        console.log('[SaleRepository] Sale created, id:', data);
        return { id: data };
    },

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
            if (staleCache) return staleCache;
            return [];
        }
    },

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
