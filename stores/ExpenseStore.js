// ============================================================
// stores/ExpenseStore.js
// ============================================================

/**
 * Стор расходов.
 * 
 * Единый источник данных для расходов.
 * Подписчики (отчёты, страница расходов) получают уведомления через EventEmitter.
 * 
 * @module stores/ExpenseStore
 */

import { EventEmitter } from './EventEmitter.js';
import ExpenseRepository from '../repositories/ExpenseRepository.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    /** @type {Object[]} все загруженные расходы */
    all: [],

    /** @type {boolean} идёт загрузка? */
    isLoading: false,

    /** @type {string|null} ошибка последней загрузки */
    error: null,

    /** @type {number} timestamp последней успешной загрузки */
    lastLoadedAt: 0
};

// ============================================================
// Стор
// ============================================================

class ExpenseStore extends EventEmitter {
    /**
     * Загружает расходы из репозитория.
     * 
     * @param {Object} [options]
     * @param {boolean} [options.force=false] — принудительно с сервера
     * @returns {Promise<Object[]>}
     */
    async loadExpenses({ force = false } = {}) {
        console.log('[ExpenseStore] loadExpenses() called, force:', force);

        if (state.isLoading) {
            console.log('[ExpenseStore] already loading, returning cached');
            return state.all;
        }

        state.isLoading = true;
        state.error = null;
        this.emit('loadStart');

        try {
            const data = await ExpenseRepository.loadAll({ force });

            state.all = data;
            state.lastLoadedAt = Date.now();
            state.isLoading = false;

            console.log('[ExpenseStore] loaded', data.length, 'expenses');
            this.emit('change', state.all);
            this.emit('loadEnd', null);

            return state.all;

        } catch (err) {
            console.error('[ExpenseStore] loadExpenses error:', err);
            state.error = err.message || 'Ошибка загрузки расходов';
            state.isLoading = false;

            this.emit('change', state.all);
            this.emit('loadEnd', state.error);
            this.emit('error', state.error);

            return state.all;
        }
    }

    /**
     * Возвращает все расходы (текущий снимок).
     * 
     * @returns {Object[]}
     */
    getAll() {
        return [...state.all];
    }

    /**
     * Возвращает расход по ID.
     * 
     * @param {string} id
     * @returns {Object|undefined}
     */
    getById(id) {
        return state.all.find(e => e.id === id);
    }

    /**
     * Возвращает расходы за период.
     * 
     * @param {string} from - ISO дата начала
     * @param {string} to - ISO дата конца
     * @returns {Object[]}
     */
    getByPeriod(from, to) {
        if (!from && !to) return this.getAll();

        const fromDate = from ? new Date(from) : null;
        const toDate = to ? new Date(to) : null;

        return state.all.filter(expense => {
            const expenseDate = new Date(expense.expense_date);

            if (fromDate && expenseDate < fromDate) return false;
            if (toDate && expenseDate > toDate) return false;
            return true;
        });
    }

    /**
     * Возвращает расходы по категории.
     * 
     * @param {string} category
     * @returns {Object[]}
     */
    getByCategory(category) {
        if (!category) return this.getAll();
        return state.all.filter(e => e.category === category);
    }

    /**
     * Возвращает сумму расходов за период.
     * 
     * @param {string} from
     * @param {string} to
     * @returns {number}
     */
    getTotalByPeriod(from, to) {
        const expenses = this.getByPeriod(from, to);
        return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    }

    /**
     * Возвращает статистику по расходам за период.
     * 
     * @param {string} from
     * @param {string} to
     * @returns {{total: number, byCategory: Object, count: number}}
     */
    getStatsByPeriod(from, to) {
        const expenses = this.getByPeriod(from, to);
        const byCategory = {};

        expenses.forEach(e => {
            const cat = e.category || 'other';
            byCategory[cat] = (byCategory[cat] || 0) + (e.amount || 0);
        });

        return {
            total: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
            byCategory,
            count: expenses.length
        };
    }

    /**
     * Проверяет, идёт ли загрузка.
     * 
     * @returns {boolean}
     */
    isLoading() {
        return state.isLoading;
    }

    /**
     * Оптимистично добавляет расход в локальное состояние.
     * 
     * @param {Object} expense
     */
    addLocally(expense) {
        state.all.unshift(expense);
        this.emit('change', state.all);
        console.log('[ExpenseStore] added locally:', expense.id);
    }

    /**
     * Оптимистично обновляет расход в локальном состоянии.
     * 
     * @param {string} id
     * @param {Object} updates
     * @returns {boolean}
     */
    updateLocally(id, updates) {
        const index = state.all.findIndex(e => e.id === id);
        if (index === -1) return false;

        state.all[index] = { ...state.all[index], ...updates };
        this.emit('change', state.all);
        console.log('[ExpenseStore] updated locally:', id);
        return true;
    }

    /**
     * Оптимистично удаляет расход из локального состояния.
     * 
     * @param {string} id
     * @returns {boolean}
     */
    removeLocally(id) {
        const index = state.all.findIndex(e => e.id === id);
        if (index === -1) return false;

        state.all.splice(index, 1);
        this.emit('change', state.all);
        console.log('[ExpenseStore] removed locally:', id);
        return true;
    }

    /**
     * Очищает все расходы (при выходе из системы).
     */
    clear() {
        state.all = [];
        state.error = null;
        this.emit('change', state.all);
        console.log('[ExpenseStore] cleared');
    }
}

// ============================================================
// Синглтон
// ============================================================

/** @type {ExpenseStore} */
export const expenseStore = new ExpenseStore();

export default expenseStore;