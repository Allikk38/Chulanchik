// ============================================================
// repositories/SaleRepository.js
// ============================================================

/**
 * Репозиторий продаж.
 *
 * Единственный модуль, который обращается к таблице sales в Supabase.
 * Владеет кэшем в sessionStorage (TTL 2 минуты) для стабильной работы
 * при нестабильном подключении.
 * Нормализует поле items (может быть JSON-строкой или массивом).
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

/**
 * Пытается загрузить кэш из sessionStorage.
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

// ============================================================
// Нормализация
// ============================================================

/**
 * Нормализует поле items — может прийти как JSON-строка или как массив.
 * Supabase JSONB-поля иногда возвращаются строкой после RPC-вызовов.
 *
 * @param {*} items
 * @returns {Object[]}
 */
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

/**
 * Нормализует числовые поля — total, profit могут прийти как строки.
 *
 * @param {Object} sale
 * @returns {Object}
 */
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
     * @returns {Promise<Object>}
     */
    async create(saleData) {
        const { data, error } = await supabase.rpc('checkout_sale', {
            p_shift_id: saleData.shift_id,
            p_items: JSON.stringify(saleData.items),
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
     * При недоступности сервера возвращает кэшированные данные.
     * Нормализует items и числовые поля в каждой продаже.
     *
     * @param {Object} [options]
     * @param {string} [options.shiftId]
     * @param {string} [options.from] - ISO дата начала
     * @param {string} [options.to] - ISO дата конца
     * @param {number} [options.limit=100]
     * @param {boolean} [options.force=false] - принудительно с сервера
     * @returns {Promise<Object[]>}
     */
    async getAll({ shiftId, from, to, limit = 100, force = false } = {}) {
        // Пробуем кэш если не принудительная загрузка
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

            // Нормализуем каждую продажу перед сохранением в кэш
            const sales = (data || []).map(normalizeSale);
            saveCache(sales);
            return sales;

        } catch (err) {
            console.error('[SaleRepository] getAll error:', err);

            // Если сервер недоступен — пробуем вернуть кэш независимо от TTL
            const staleCache = loadCache();
            if (staleCache) {
                console.warn('[SaleRepository] returning stale cache due to network error');
                return staleCache;
            }

            // Если кэша нет — возвращаем пустой массив, не роняем приложение
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
