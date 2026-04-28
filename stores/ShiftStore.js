// ============================================================
// stores/ShiftStore.js
// ============================================================

/**
 * Стор смены.
 * 
 * Владеет состоянием текущей смены и её статистикой.
 * Все компоненты (касса, отчёты) используют этот стор.
 * 
 * @module stores/ShiftStore
 */

import { EventEmitter } from './EventEmitter.js';
import ShiftRepository from '../repositories/ShiftRepository.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    /** @type {Object|null} текущая открытая смена */
    current: null,

    /** @type {{revenue: number, profit: number, salesCount: number, itemsCount: number}} */
    stats: {
        revenue: 0,
        profit: 0,
        salesCount: 0,
        itemsCount: 0
    },

    /** @type {boolean} идёт операция над сменой? */
    isPending: false
};

// ============================================================
// Стор
// ============================================================

class ShiftStore extends EventEmitter {
    /**
     * Проверяет, есть ли открытая смена у пользователя.
     * Сначала проверяет кэш, потом сервер.
     * 
     * @param {string} userId
     * @returns {Promise<boolean>} true если смена открыта
     */
    async checkOpenShift(userId) {
        if (!userId) return false;

        // 1. Пробуем кэш
        const cached = ShiftRepository.getCachedActive();
        if (cached) {
            state.current = cached;
            this.emit('change');
            await this.loadStats();
            return true;
        }

        // 2. Сервер
        try {
            const shift = await ShiftRepository.getActive(userId);
            if (shift) {
                state.current = shift;
                this.emit('change');
                await this.loadStats();
                return true;
            }
        } catch (err) {
            console.error('[ShiftStore] checkOpenShift error:', err);
            this.emit('error', err.message);
        }

        return false;
    }

    /**
     * Открывает новую смену.
     * 
     * @param {string} userId
     * @returns {Promise<boolean>} true если смена открыта
     */
    async openShift(userId) {
        if (state.isPending) return false;
        if (!userId) return false;

        state.isPending = true;
        this.emit('change');

        try {
            const shift = await ShiftRepository.open(userId);

            state.current = shift;
            state.stats = { revenue: 0, profit: 0, salesCount: 0, itemsCount: 0 };
            this.emit('change');

            return true;

        } catch (err) {
            console.error('[ShiftStore] openShift error:', err);
            this.emit('error', err.message);
            return false;

        } finally {
            state.isPending = false;
            this.emit('change');
        }
    }

    /**
     * Закрывает текущую смену.
     * 
     * @returns {Promise<boolean>}
     */
    async closeShift() {
        if (!state.current || state.isPending) return false;

        state.isPending = true;
        this.emit('change');

        try {
            await ShiftRepository.close(state.current.id, state.stats);

            state.current = null;
            state.stats = { revenue: 0, profit: 0, salesCount: 0, itemsCount: 0 };
            this.emit('change');

            return true;

        } catch (err) {
            console.error('[ShiftStore] closeShift error:', err);
            this.emit('error', err.message);
            return false;

        } finally {
            state.isPending = false;
            this.emit('change');
        }
    }

    /**
     * Загружает статистику текущей смены с сервера.
     * 
     * @returns {Promise<void>}
     */
    async loadStats() {
        if (!state.current) return;

        try {
            const stats = await ShiftRepository.loadStats(state.current.id);
            state.stats = stats;
            this.emit('change');
        } catch (err) {
            console.error('[ShiftStore] loadStats error:', err);
            // не ломаем приложение — статистика останется старой
        }
    }

    /**
     * Обновляет статистику локально (после продажи).
     * 
     * @param {Object} delta
     * @param {number} delta.revenue
     * @param {number} delta.profit
     * @param {number} delta.salesCount
     * @param {number} delta.itemsCount
     */
    addToStats({ revenue = 0, profit = 0, salesCount = 0, itemsCount = 0 }) {
        state.stats.revenue += revenue;
        state.stats.profit += profit;
        state.stats.salesCount += salesCount;
        state.stats.itemsCount += itemsCount;
        this.emit('change');
    }

    /**
     * Открыта ли смена?
     * 
     * @returns {boolean}
     */
    isOpen() {
        return !!state.current;
    }

    /**
     * Возвращает ID текущей смены.
     * 
     * @returns {string|null}
     */
    getCurrentShiftId() {
        return state.current?.id || null;
    }

    /**
     * Возвращает копию текущей статистики.
     * 
     * @returns {{revenue: number, profit: number, salesCount: number, itemsCount: number}}
     */
    getStats() {
        return { ...state.stats };
    }

    /**
     * Возвращает текущую смену.
     * 
     * @returns {Object|null}
     */
    getCurrent() {
        return state.current ? { ...state.current } : null;
    }

    /**
     * Идёт ли операция над сменой?
     * 
     * @returns {boolean}
     */
    isPending() {
        return state.isPending;
    }
}

// ============================================================
// Синглтон
// ============================================================

/** @type {ShiftStore} */
export const shiftStore = new ShiftStore();

export default shiftStore;
