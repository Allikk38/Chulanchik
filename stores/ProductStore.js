// ============================================================
// stores/ProductStore.js
// ============================================================

/**
 * Единый стор товаров для всего приложения.
 * 
 * Владеет состоянием productsState, подписчики (касса, склад, отчёты)
 * получают уведомления через события EventEmitter.
 * 
 * @module stores/ProductStore
 */

import { EventEmitter } from './EventEmitter.js';
import ProductRepository from '../repositories/ProductRepository.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    /** @type {Object[]} все загруженные товары */
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

class ProductStore extends EventEmitter {
    /**
     * Загружает товары из репозитория.
     * 
     * @param {Object} [options]
     * @param {boolean} [options.force=false] — принудительно с сервера
     * @returns {Promise<Object[]>}
     */
    async loadProducts({ force = false } = {}) {
        if (state.isLoading) return state.all;

        state.isLoading = true;
        state.error = null;
        this.emit('loadStart');

        try {
            const data = await ProductRepository.loadAll({ force });

            state.all = data;
            state.lastLoadedAt = Date.now();
            state.isLoading = false;

            this.emit('change', state.all);
            this.emit('loadEnd', null);

            return state.all;

        } catch (err) {
            console.error('[ProductStore] loadProducts error:', err);
            state.error = err.message || 'Ошибка загрузки';
            state.isLoading = false;

            this.emit('change', state.all);
            this.emit('loadEnd', state.error);
            this.emit('error', state.error);

            return state.all;
        }
    }

    /**
     * Возвращает все товары (текущий снимок).
     * 
     * @returns {Object[]}
     */
    getAll() {
        return [...state.all];
    }

    /**
     * Возвращает товар по ID.
     * 
     * @param {string} id
     * @returns {Object|undefined}
     */
    getById(id) {
        return state.all.find(p => p.id === id);
    }

    /**
     * Возвращает товары в наличии.
     * 
     * @returns {Object[]}
     */
    getInStock() {
        return state.all.filter(p => p.status === 'in_stock');
    }

    /**
     * Фильтрует товары по категории.
     * 
     * @param {string} category
     * @returns {Object[]}
     */
    getByCategory(category) {
        if (!category) return this.getAll();
        return state.all.filter(p => p.category === category);
    }

    /**
     * Ищет товары по названию или ID.
     * 
     * @param {string} query
     * @returns {Object[]}
     */
    search(query) {
        if (!query) return this.getAll();
        const q = query.toLowerCase();
        return state.all.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.id?.toLowerCase().includes(q)
        );
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
     * Оптимистично добавляет товар в локальное состояние.
     * Вызывается после успешного создания через ProductRepository.
     * 
     * @param {Object} product
     */
    addLocally(product) {
        state.all.unshift(product);
        this.emit('change', state.all);
    }

    /**
     * Оптимистично обновляет товар в локальном состоянии.
     * 
     * @param {string} id
     * @param {Object} updates
     * @returns {boolean} найден ли товар
     */
    updateLocally(id, updates) {
        const index = state.all.findIndex(p => p.id === id);
        if (index === -1) return false;

        state.all[index] = { ...state.all[index], ...updates };
        this.emit('change', state.all);
        return true;
    }

    /**
     * Оптимистично удаляет товар из локального состояния.
     * 
     * @param {string} id
     * @returns {boolean} найден ли товар
     */
    removeLocally(id) {
        const index = state.all.findIndex(p => p.id === id);
        if (index === -1) return false;

        state.all.splice(index, 1);
        this.emit('change', state.all);
        return true;
    }

    /**
     * Возвращает список категорий с количеством.
     * 
     * @returns {Array<{value: string, count: number}>}
     */
    getCategories() {
        const counts = new Map();
        state.all.forEach(p => {
            const cat = p.category || 'other';
            counts.set(cat, (counts.get(cat) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Возвращает статистику по товарам.
     * 
     * @returns {Object}
     */
    getStats() {
        const inStock = state.all.filter(p => p.status === 'in_stock');

        return {
            total: state.all.length,
            inStock: inStock.length,
            sold: state.all.filter(p => p.status === 'sold').length,
            reserved: state.all.filter(p => p.status === 'reserved').length,
            stockValue: inStock.reduce((sum, p) => sum + (p.price || 0), 0),
            potentialProfit: inStock.reduce((sum, p) => sum + ((p.price || 0) - (p.cost_price || 0)), 0)
        };
    }
}

// ============================================================
// Синглтон
// ============================================================

/** @type {ProductStore} */
export const productStore = new ProductStore();

export default productStore;
