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
        console.log('[ShiftStore] checkOpenShift() called, userId:', userId);

        if (!userId) {
            console.log('[ShiftStore] checkOpenShift: no userId');
            return false;
        }

        const cached = ShiftRepository.getCachedActive();
        if (cached) {
            console.log('[ShiftStore] using cached shift:', cached.id);
            state.current = cached;
            this.emit('change');
            await this.loadStats();
            console.log('[ShiftStore] stats loaded from cache, stats:', state.stats);
            return true;
        }

        console.log('[ShiftStore] no cached shift, fetching from server...');

        try {
            const shift = await ShiftRepository.getActive(userId);
            if (shift) {
                console.log('[ShiftStore] active shift found:', shift.id);
                state.current = shift;
                this.emit('change');
                await this.loadStats();
                console.log('[ShiftStore] stats loaded from server, stats:', state.stats);
                return true;
            }
            console.log('[ShiftStore] no active shift found');
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
        console.log('[ShiftStore] openShift() called, userId:', userId);

        if (state.isPending) {
            console.log('[ShiftStore] openShift: already pending');
            return false;
        }
        if (!userId) {
            console.log('[ShiftStore] openShift: no userId');
            return false;
        }

        state.isPending = true;
        this.emit('change');

        try {
            console.log('[ShiftStore] calling ShiftRepository.open()...');
            const shift = await ShiftRepository.open(userId);

            console.log('[ShiftStore] shift opened:', shift.id);
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
        console.log('[ShiftStore] closeShift() called');
        console.log('[ShiftStore] current shift:', state.current?.id);
        console.log('[ShiftStore] isPending:', state.isPending);

        if (!state.current) {
            console.log('[ShiftStore] closeShift: no current shift');
            return false;
        }

        if (state.isPending) {
            console.log('[ShiftStore] closeShift: already pending');
            return false;
        }

        state.isPending = true;
        this.emit('change');

        try {
            console.log('[ShiftStore] calling ShiftRepository.close() with shiftId:', state.current.id);
            const result = await ShiftRepository.close(state.current.id);
            console.log('[ShiftStore] ShiftRepository.close() result:', result);

            console.log('[ShiftStore] clearing current shift');
            state.current = null;
            state.stats = { revenue: 0, profit: 0, salesCount: 0, itemsCount: 0 };
            this.emit('change');

            console.log('[ShiftStore] closeShift completed successfully');
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
        if (!state.current) {
            console.log('[ShiftStore] loadStats: no current shift');
            return;
        }

        console.log('[ShiftStore] loadStats() for shift:', state.current.id);

        try {
            const stats = await ShiftRepository.loadStats(state.current.id);
            console.log('[ShiftStore] stats loaded:', stats);
            state.stats = stats;
            this.emit('change');
        } catch (err) {
            console.error('[ShiftStore] loadStats error:', err);
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
        console.log('[ShiftStore] addToStats:', { revenue, profit, salesCount, itemsCount });
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