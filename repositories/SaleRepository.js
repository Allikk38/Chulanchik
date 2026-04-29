// ============================================================
// repositories/SaleRepository.js
// ============================================================

import { supabase } from '../core/supabase-client.js';

export const SaleRepository = {
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
