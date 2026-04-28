// ============================================================
// services/ExpenseService.js
// ============================================================

/**
 * Сервис расходов.
 * 
 * Бизнес-логика: валидация, проверка прав,
 * координация между репозиторием и стором.
 * 
 * @module services/ExpenseService
 */

import ExpenseRepository from '../repositories/ExpenseRepository.js';
import { expenseStore } from '../stores/ExpenseStore.js';

// ============================================================
// Константы
// ============================================================

const CATEGORIES = [
    'rent',        // Аренда
    'advertising', // Реклама
    'supplies',    // Хозтовары
    'utilities',   // Коммунальные
    'salary',      // Зарплата
    'taxes',       // Налоги
    'repair',      // Ремонт
    'other'        // Прочее
];

const CATEGORY_LABELS = {
    rent: 'Аренда',
    advertising: 'Реклама',
    supplies: 'Хозтовары',
    utilities: 'Коммунальные услуги',
    salary: 'Зарплата',
    taxes: 'Налоги',
    repair: 'Ремонт / Обслуживание',
    other: 'Прочее'
};

// ============================================================
// Валидация
// ============================================================

/**
 * Валидирует данные расхода.
 * 
 * @param {Object} data
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateExpense(data) {
    const errors = [];

    if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
        errors.push('Сумма должна быть больше 0');
    }

    if (!data.category || !CATEGORIES.includes(data.category)) {
        errors.push('Выберите корректную категорию');
    }

    if (data.description && data.description.length > 500) {
        errors.push('Описание не может превышать 500 символов');
    }

    if (data.expense_date) {
        const date = new Date(data.expense_date);
        if (isNaN(date.getTime())) {
            errors.push('Некорректная дата');
        }
        if (date > new Date()) {
            errors.push('Дата расхода не может быть в будущем');
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================
// Сервис
// ============================================================

export const ExpenseService = {
    /**
     * Возвращает список категорий с метками.
     * 
     * @returns {Array<{value: string, label: string}>}
     */
    getCategories() {
        return CATEGORIES.map(cat => ({
            value: cat,
            label: CATEGORY_LABELS[cat] || cat
        }));
    },

    /**
     * Возвращает метку категории.
     * 
     * @param {string} category
     * @returns {string}
     */
    getCategoryLabel(category) {
        return CATEGORY_LABELS[category] || category;
    },

    /**
     * Создаёт расход.
     * 
     * @param {Object} data
     * @param {number} data.amount
     * @param {string} data.category
     * @param {string} [data.description]
     * @param {string} [data.expense_date]
     * @param {File} [data.receiptFile]
     * @param {string} data.userId
     * @returns {Promise<{success: boolean, error?: string, expense?: Object}>}
     */
    async create(data) {
        console.log('[ExpenseService] create() called', { amount: data.amount, category: data.category });

        const validation = validateExpense(data);
        if (!validation.valid) {
            console.log('[ExpenseService] validation failed:', validation.errors);
            return { success: false, error: validation.errors[0] };
        }

        try {
            let receiptUrl = null;

            if (data.receiptFile) {
                console.log('[ExpenseService] uploading receipt...');
                receiptUrl = await ExpenseRepository.uploadReceipt(data.receiptFile);
                console.log('[ExpenseService] receipt uploaded:', receiptUrl);
            }

            const expense = await ExpenseRepository.create({
                amount: data.amount,
                category: data.category,
                description: data.description?.trim() || null,
                expense_date: data.expense_date || new Date().toISOString(),
                receipt_url: receiptUrl,
                created_by: data.userId
            });

            expenseStore.addLocally(expense);
            console.log('[ExpenseService] expense created:', expense.id);

            return { success: true, expense };

        } catch (err) {
            console.error('[ExpenseService] create error:', err);
            return { success: false, error: err.message || 'Ошибка создания расхода' };
        }
    },

    /**
     * Обновляет расход.
     * 
     * @param {string} id
     * @param {Object} data
     * @returns {Promise<{success: boolean, error?: string, expense?: Object}>}
     */
    async update(id, data) {
        console.log('[ExpenseService] update() called', { id });

        const existing = expenseStore.getById(id);
        if (!existing) {
            return { success: false, error: 'Расход не найден' };
        }

        const validation = validateExpense(data);
        if (!validation.valid) {
            return { success: false, error: validation.errors[0] };
        }

        try {
            let receiptUrl = existing.receipt_url;

            if (data.newReceiptFile) {
                if (existing.receipt_url) {
                    await ExpenseRepository.deleteReceipt(existing.receipt_url);
                }
                receiptUrl = await ExpenseRepository.uploadReceipt(data.newReceiptFile);
            }

            const expense = await ExpenseRepository.update(id, {
                amount: data.amount,
                category: data.category,
                description: data.description?.trim() || null,
                expense_date: data.expense_date,
                receipt_url: receiptUrl
            });

            expenseStore.updateLocally(id, expense);
            console.log('[ExpenseService] expense updated:', id);

            return { success: true, expense };

        } catch (err) {
            console.error('[ExpenseService] update error:', err);
            return { success: false, error: err.message || 'Ошибка обновления расхода' };
        }
    },

    /**
     * Удаляет расход.
     * 
     * @param {string} id
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async remove(id) {
        console.log('[ExpenseService] remove() called', { id });

        const existing = expenseStore.getById(id);
        if (!existing) {
            return { success: false, error: 'Расход не найден' };
        }

        try {
            await ExpenseRepository.remove(id, existing.receipt_url);
            expenseStore.removeLocally(id);
            console.log('[ExpenseService] expense removed:', id);

            return { success: true };

        } catch (err) {
            console.error('[ExpenseService] remove error:', err);
            return { success: false, error: err.message || 'Ошибка удаления расхода' };
        }
    },

    /**
     * Загружает расходы (инициализация стора).
     * 
     * @returns {Promise<Object[]>}
     */
    async loadExpenses() {
        console.log('[ExpenseService] loadExpenses() called');
        return await expenseStore.loadExpenses();
    }
};

export default ExpenseService;