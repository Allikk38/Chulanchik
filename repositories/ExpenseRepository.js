// ============================================================
// repositories/ExpenseRepository.js
// ============================================================

/**
 * Репозиторий расходов.
 * 
 * Единственный модуль, который обращается к таблице expenses в Supabase.
 * Владеет кэшем расходов в sessionStorage (TTL 5 минут).
 * 
 * @module repositories/ExpenseRepository
 */

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Константы
// ============================================================

const CACHE_KEY = 'expenses_cache';
const CACHE_TTL_MS = 5 * 60 * 1000;
const RECEIPTS_BUCKET = 'expense-receipts';
const MAX_PHOTO_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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
        // не критично
    }
}

/**
 * Инвалидирует кэш.
 */
function invalidateCache() {
    cacheEntry = null;
    try {
        sessionStorage.removeItem(CACHE_KEY);
    } catch (e) { /* */ }
}

// ============================================================
// Работа с фото чеков
// ============================================================

/**
 * Загружает фото чека в Storage.
 * 
 * @param {File} file
 * @returns {Promise<string>} publicUrl
 */
async function uploadReceipt(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error('Неподдерживаемый формат файла. Используйте JPG, PNG, WEBP или HEIC');
    }

    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        throw new Error(`Файл не должен превышать ${MAX_PHOTO_MB} MB`);
    }

    const ext = file.name.split('.').pop();
    const fileName = `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error('Ошибка загрузки чека: ' + error.message);

    const { data } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
}

/**
 * Удаляет фото чека из Storage.
 * 
 * @param {string} receiptUrl
 */
async function deleteReceipt(receiptUrl) {
    if (!receiptUrl) return;
    try {
        const fileName = receiptUrl.split('/').pop();
        if (fileName) {
            await supabase.storage.from(RECEIPTS_BUCKET).remove([fileName]);
        }
    } catch (e) {
        console.warn('[ExpenseRepository] deleteReceipt error:', e);
    }
}

// ============================================================
// Репозиторий
// ============================================================

export const ExpenseRepository = {
    /**
     * Загружает все расходы пользователя.
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
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false });

        if (error) throw error;

        const expenses = data || [];
        saveCache(expenses);
        return expenses;
    },

    /**
     * Загружает расходы за период.
     * 
     * @param {string} from - ISO дата начала
     * @param {string} to - ISO дата конца
     * @returns {Promise<Object[]>}
     */
    async loadByPeriod(from, to) {
        let query = supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false });

        if (from) query = query.gte('expense_date', from);
        if (to) query = query.lte('expense_date', to);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Получает расход по ID.
     * 
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    },

    /**
     * Создаёт расход.
     * 
     * @param {Object} expenseData
     * @param {number} expenseData.amount
     * @param {string} expenseData.category
     * @param {string} [expenseData.description]
     * @param {string} [expenseData.expense_date]
     * @param {string} [expenseData.receipt_url]
     * @param {string} expenseData.created_by
     * @returns {Promise<Object>}
     */
    async create(expenseData) {
        const { data, error } = await supabase
            .from('expenses')
            .insert({
                user_id: expenseData.created_by,
                amount: expenseData.amount,
                category: expenseData.category,
                description: expenseData.description || null,
                expense_date: expenseData.expense_date || new Date().toISOString(),
                receipt_url: expenseData.receipt_url || null,
                created_by: expenseData.created_by
            })
            .select()
            .single();

        if (error) throw error;

        invalidateCache();
        return data;
    },

    /**
     * Обновляет расход.
     * 
     * @param {string} id
     * @param {Object} updates
     * @returns {Promise<Object>}
     */
    async update(id, updates) {
        const { data, error } = await supabase
            .from('expenses')
            .update({
                amount: updates.amount,
                category: updates.category,
                description: updates.description,
                expense_date: updates.expense_date,
                receipt_url: updates.receipt_url
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        invalidateCache();
        return data;
    },

    /**
     * Удаляет расход.
     * 
     * @param {string} id
     * @param {string} [receiptUrl]
     * @returns {Promise<void>}
     */
    async remove(id, receiptUrl) {
        if (receiptUrl) {
            await deleteReceipt(receiptUrl);
        }

        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', id);

        if (error) throw error;

        invalidateCache();
    },

    /**
     * Возвращает сумму расходов за период по категориям.
     * 
     * @param {string} from
     * @param {string} to
     * @returns {Promise<Object>}
     */
    async getTotalByPeriod(from, to) {
        const expenses = await this.loadByPeriod(from, to);
        
        const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const byCategory = {};
        
        expenses.forEach(e => {
            const cat = e.category || 'other';
            byCategory[cat] = (byCategory[cat] || 0) + (e.amount || 0);
        });

        return { total, byCategory, count: expenses.length };
    },

    /**
     * Загружает фото чека.
     * 
     * @param {File} file
     * @returns {Promise<string>}
     */
    uploadReceipt,

    /**
     * Удаляет фото чека.
     * 
     * @param {string} receiptUrl
     * @returns {Promise<void>}
     */
    deleteReceipt
};

export default ExpenseRepository;