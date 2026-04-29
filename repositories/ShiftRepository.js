// ============================================================
// repositories/ShiftRepository.js
// ============================================================

/**
 * Репозиторий смен.
 * 
 * Единственный модуль, который обращается к таблице shifts в Supabase.
 * Владеет кэшем активной смены в localStorage.
 * 
 * @module repositories/ShiftRepository
 */

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Константы
// ============================================================

const ACTIVE_SHIFT_KEY = 'active_shift_cache';
const ACTIVE_SHIFT_TTL_MS = 24 * 60 * 60 * 1000;

// ============================================================
// Кэш активной смены
// ============================================================

/** @type {Object|null} */
let cachedActiveShift = null;

/**
 * Загружает кэш активной смены из localStorage.
 *
 * @returns {Object|null}
 */
function loadCachedActiveShift() {
    if (cachedActiveShift) return cachedActiveShift;

    try {
        const raw = localStorage.getItem(ACTIVE_SHIFT_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.cachedAt < ACTIVE_SHIFT_TTL_MS) {
                cachedActiveShift = parsed.shift;
                console.log('[ShiftRepository] loaded cached shift:', cachedActiveShift?.id);
                return cachedActiveShift;
            }
            console.log('[ShiftRepository] cache expired, removing');
            localStorage.removeItem(ACTIVE_SHIFT_KEY);
        }
    } catch (e) {
        console.warn('[ShiftRepository] failed to load cache:', e);
        localStorage.removeItem(ACTIVE_SHIFT_KEY);
    }

    return null;
}

/**
 * Сохраняет активную смену в localStorage.
 *
 * @param {Object|null} shift
 */
function saveCachedActiveShift(shift) {
    cachedActiveShift = shift;
    try {
        if (shift) {
            console.log('[ShiftRepository] saving shift to cache:', shift.id);
            localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify({
                shift,
                cachedAt: Date.now()
            }));
        } else {
            console.log('[ShiftRepository] clearing shift cache');
            localStorage.removeItem(ACTIVE_SHIFT_KEY);
        }
    } catch (e) {
        console.warn('[ShiftRepository] failed to save cache:', e);
    }
}

/**
 * Нормализует поле items — может прийти как JSON-строка или уже как массив.
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

// ============================================================
// Репозиторий
// ============================================================

export const ShiftRepository = {
    /**
     * Получает профиль пользователя (имя продавца).
     *
     * @param {string} userId
     * @returns {Promise<string>}
     */
    async getSellerName(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();

        if (error) {
            console.warn('[ShiftRepository] getSellerName error:', error);
            return null;
        }

        return data?.full_name || null;
    },

    /**
     * Получает активную (незакрытую) смену пользователя.
     *
     * @param {string} userId
     * @returns {Promise<Object|null>}
     */
    async getActive(userId) {
        console.log('[ShiftRepository] getActive() called, userId:', userId);

        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('user_id', userId)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('[ShiftRepository] no active shift found');
                return null;
            }
            console.error('[ShiftRepository] getActive error:', error);
            throw error;
        }

        console.log('[ShiftRepository] active shift found:', data?.id);
        if (data) saveCachedActiveShift(data);
        return data || null;
    },

    /**
     * Открывает новую смену.
     *
     * @param {string} userId
     * @returns {Promise<Object>}
     */
    async open(userId) {
        console.log('[ShiftRepository] open() called, userId:', userId);

        const sellerName = await this.getSellerName(userId);

        const shiftData = {
            user_id: userId,
            seller_name: sellerName,
            opened_at: new Date().toISOString(),
            status: 'active',
            total_revenue: 0,
            total_profit: 0,
            sales_count: 0
        };

        console.log('[ShiftRepository] inserting shift:', shiftData);

        const { data, error } = await supabase
            .from('shifts')
            .insert(shiftData)
            .select()
            .single();

        if (error) {
            console.error('[ShiftRepository] open error:', error);
            throw error;
        }

        console.log('[ShiftRepository] shift opened successfully:', data.id);
        saveCachedActiveShift(data);
        return data;
    },

    /**
     * Закрывает смену.
     * Обновляет closed_at, status, а также статистику (total_revenue, total_profit, sales_count).
     *
     * @param {string} shiftId
     * @returns {Promise<Object>}
     */
    async close(shiftId) {
        console.log('[ShiftRepository] close() called, shiftId:', shiftId);

        const stats = await this.loadStats(shiftId);

        const updateData = {
            closed_at: new Date().toISOString(),
            status: 'closed',
            total_revenue: stats.revenue,
            total_profit: stats.profit,
            sales_count: stats.salesCount
        };

        console.log('[ShiftRepository] updating shift with stats:', updateData);

        const { data, error } = await supabase
            .from('shifts')
            .update(updateData)
            .eq('id', shiftId)
            .select()
            .single();

        if (error) {
            console.error('[ShiftRepository] close error:', error);
            throw error;
        }

        console.log('[ShiftRepository] shift closed successfully:', data.id);
        saveCachedActiveShift(null);
        return data;
    },

    /**
     * Возвращает статистику смены на основе продаж.
     *
     * @param {string} shiftId
     * @returns {Promise<{revenue: number, profit: number, salesCount: number, itemsCount: number}>}
     */
    async loadStats(shiftId) {
        console.log('[ShiftRepository] loadStats() called, shiftId:', shiftId);

        const { data, error } = await supabase
            .from('sales')
            .select('total, profit, items')
            .eq('shift_id', shiftId);

        if (error) {
            console.error('[ShiftRepository] loadStats error:', error);
            throw error;
        }

        const sales = data || [];

        let revenue = 0;
        let profit = 0;
        let itemsCount = 0;

        for (const sale of sales) {
            revenue += sale.total || 0;
            profit += sale.profit || 0;

            const saleItems = normalizeItems(sale.items);
            for (const item of saleItems) {
                itemsCount += item.quantity || 0;
            }
        }

        const stats = { revenue, profit, salesCount: sales.length, itemsCount };
        console.log('[ShiftRepository] stats calculated:', stats);
        return stats;
    },

    /**
     * Возвращает список смен (для отчётов).
     *
     * @param {Object} [options]
     * @param {string} [options.userId] — фильтр по пользователю
     * @param {string} [options.from] — ISO-дата «с»
     * @param {string} [options.to] — ISO-дата «по»
     * @param {number} [options.limit=50]
     * @returns {Promise<Object[]>}
     */
    async getAll({ userId, from, to, limit = 50 } = {}) {
        let query = supabase
            .from('shifts')
            .select('*')
            .order('opened_at', { ascending: false })
            .limit(limit);

        if (userId) query = query.eq('user_id', userId);
        if (from) query = query.gte('opened_at', from);
        if (to) query = query.lte('opened_at', to);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Возвращает смену по ID.
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    /**
     * Возвращает закэшированную активную смену (без запроса к серверу).
     *
     * @returns {Object|null}
     */
    getCachedActive() {
        return loadCachedActiveShift();
    },

    /**
     * Сбрасывает кэш активной смены.
     */
    clearCache() {
        saveCachedActiveShift(null);
    }
};

export default ShiftRepository;
