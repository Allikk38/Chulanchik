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
                return cachedActiveShift;
            }
            localStorage.removeItem(ACTIVE_SHIFT_KEY);
        }
    } catch (e) {
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
            localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify({
                shift,
                cachedAt: Date.now()
            }));
        } else {
            localStorage.removeItem(ACTIVE_SHIFT_KEY);
        }
    } catch (e) { /* */ }
}

// ============================================================
// Репозиторий
// ============================================================

export const ShiftRepository = {
    /**
     * Получает активную (незакрытую) смену пользователя.
     *
     * @param {string} userId
     * @returns {Promise<Object|null>}
     */
    async getActive(userId) {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('user_id', userId)
            .is('closed_at', null)
            .order('opened_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

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
        const { data, error } = await supabase
            .from('shifts')
            .insert({
                user_id: userId,
                opened_at: new Date().toISOString(),
                status: 'active'
            })
            .select()
            .single();

        if (error) throw error;

        saveCachedActiveShift(data);
        return data;
    },

    /**
     * Закрывает смену.
     * Обновляет closed_at, статус и финальные показатели.
     *
     * @param {string} shiftId
     * @param {Object} stats
     * @param {number} stats.revenue
     * @param {number} stats.profit
     * @param {number} stats.salesCount
     * @param {number} stats.itemsCount
     * @returns {Promise<Object>}
     */
    async close(shiftId, stats) {
        const { data, error } = await supabase
            .from('shifts')
            .update({
                closed_at: new Date().toISOString(),
                final_cash: stats.revenue,
                total_revenue: stats.revenue,
                total_profit: stats.profit,
                sales_count: stats.salesCount,
                items_count: stats.itemsCount,
                status: 'closed'
            })
            .eq('id', shiftId)
            .select()
            .single();

        if (error) throw error;

        saveCachedActiveShift(null);
        return data;
    },

    /**
     * Возвращает статистику активной смены на основе продаж.
     *
     * @param {string} shiftId
     * @returns {Promise<{revenue: number, profit: number, salesCount: number, itemsCount: number}>}
     */
    async loadStats(shiftId) {
        const { data, error } = await supabase
            .from('sales')
            .select('total, profit, items')
            .eq('shift_id', shiftId);

        if (error) throw error;

        const sales = data || [];

        return {
            revenue: sales.reduce((sum, s) => sum + (s.total || 0), 0),
            profit: sales.reduce((sum, s) => sum + (s.profit || 0), 0),
            salesCount: sales.length,
            itemsCount: sales.reduce((sum, s) => {
                return sum + (s.items || []).reduce((s2, i) => s2 + (i.quantity || 0), 0);
            }, 0)
        };
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
