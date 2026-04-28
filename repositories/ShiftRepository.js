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
     * Обновляет только closed_at и status.
     * Статистика всегда пересчитывается из продаж через loadStats().
     *
     * @param {string} shiftId
     * @returns {Promise<Object>}
     */
    async close(shiftId) {
        const { data, error } = await supabase
            .from('shifts')
            .update({
                closed_at: new Date().toISOString(),
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
     * Нормализует поле items — может прийти как JSON-строка или уже как массив.
     *
     * @param {*} items
     * @returns {Object[]}
     */
    _normalizeItems(items) {
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

        let revenue = 0;
        let profit = 0;
        let itemsCount = 0;

        for (const sale of sales) {
            revenue += sale.total || 0;
            profit += sale.profit || 0;

            const saleItems = this._normalizeItems(sale.items);
            for (const item of saleItems) {
                itemsCount += item.quantity || 0;
            }
        }

        return {
            revenue,
            profit,
            salesCount: sales.length,
            itemsCount
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
