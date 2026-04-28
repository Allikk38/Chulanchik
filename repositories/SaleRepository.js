// ============================================================
// repositories/SaleRepository.js
// ============================================================

/**
 * Репозиторий продаж.
 * 
 * Единственный модуль, который обращается к таблице sales в Supabase.
 * В будущем create() будет использовать RPC checkout_sale.
 * 
 * @module repositories/SaleRepository
 */

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Репозиторий
// ============================================================

export const SaleRepository = {
    /**
     * Создаёт продажу.
     * 
     * В будущем заменится на supabase.rpc('checkout_sale', {...}).
     * Контракт (входные/выходные данные) останется тем же.
     * 
     * @param {Object} saleData
     * @param {string} saleData.shift_id
     * @param {Object[]} saleData.items — [{id, name, price, cost_price, quantity, discount}]
     * @param {number} saleData.total
     * @param {number} saleData.profit
     * @param {string} saleData.payment_method
     * @param {string} saleData.created_by
     * @returns {Promise<Object>} созданная продажа
     */
    async create(saleData) {
        const { data, error } = await supabase
            .from('sales')
            .insert({
                shift_id: saleData.shift_id,
                items: saleData.items,
                total: saleData.total,
                profit: saleData.profit,
                payment_method: saleData.payment_method,
                created_by: saleData.created_by
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Возвращает продажи с фильтрацией (для отчётов).
     * 
     * @param {Object} [options]
     * @param {string} [options.shiftId]
     * @param {string} [options.from] — ISO-дата «с»
     * @param {string} [options.to] — ISO-дата «по»
     * @param {number} [options.limit=100]
     * @returns {Promise<Object[]>}
     */
    async getAll({ shiftId, from, to, limit = 100 } = {}) {
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
        return data || [];
    },

    /**
     * Возвращает продажу по ID.
     * 
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const { data, error } = await supabase
            .from('sales')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    }
};

export default SaleRepository;
