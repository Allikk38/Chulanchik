// ============================================================
// stores/CartStore.js
// v1.1.0 — 2026-04-30: валидация товаров при загрузке из кэша
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Стор корзины кассового модуля.
//   Владеет массивом товаров, их количеством и скидками.
//
// ЗАВИСИМОСТИ
//   EventEmitter — базовый класс (из ./EventEmitter.js)
//
// ИСПОЛЬЗУЕТСЯ
//   CashierController — добавление/удаление товаров
//   SaleService        — получение списка товаров для продажи
//   CashierCart        — рендеринг панели корзины
//
// ПОТОК ДАННЫХ
//   addItem(product) — добавляет товар или увеличивает количество
//   updateQuantity(id, delta) — меняет количество ±1
//   removeItem(id) — удаляет товар
//   reset() — очищает корзину (после продажи)
//   loadFromCache() — восстанавливает корзину из localStorage
//
// КЭШ
//   localStorage: 'cart_cache' (TTL 60 минут)
//   Формат: { items: [...], totalDiscount: number, cachedAt: timestamp }
//
// ИЗМЕНЕНИЯ
//   v1.1.0 — валидация при загрузке из кэша:
//     - loadFromCache() теперь принимает productStore
//     - товары с status !== 'in_stock' автоматически удаляются
//     - удалённые товары логируются в консоль
//   v1.0.0 — первоначальная версия
//
// ============================================================

/**
 * Стор корзины.
 *
 * Чистое состояние корзины, без UI-зависимостей.
 * Используется только кассовым модулем.
 *
 * @module stores/CartStore
 */

import { EventEmitter } from './EventEmitter.js';

// ============================================================
// Константы
// ============================================================

const CART_KEY = 'cart_cache';
const CART_TTL_MS = 60 * 60 * 1000;

// ============================================================
// Состояние
// ============================================================

const state = {
    /** @type {Object[]} */
    items: [],

    /** @type {number} общая скидка на корзину (проценты, 0–100) */
    totalDiscount: 0
};

// ============================================================
// Кэш
// ============================================================

function saveCache() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify({
            items: state.items,
            totalDiscount: state.totalDiscount,
            cachedAt: Date.now()
        }));
    } catch (e) { /* */ }
}

function loadCache() {
    try {
        const raw = localStorage.getItem(CART_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.cachedAt < CART_TTL_MS) {
                state.items = parsed.items || [];
                state.totalDiscount = parsed.totalDiscount || 0;
                return true;
            }
            localStorage.removeItem(CART_KEY);
        }
    } catch (e) {
        localStorage.removeItem(CART_KEY);
    }
    return false;
}

function clearCache() {
    try {
        localStorage.removeItem(CART_KEY);
    } catch (e) { /* */ }
}

// ============================================================
// Стор
// ============================================================

class CartStore extends EventEmitter {
    /**
     * Загружает корзину из кэша и проверяет товары на актуальность.
     *
     * Алгоритм:
     * 1. Загружает данные из localStorage
     * 2. Если передан productStore — проверяет статус каждого товара
     * 3. Товары с status !== 'in_stock' удаляются из корзины
     * 4. Если были удаления — эмитит 'change'
     *
     * @param {Object} [productStore] — стор товаров для проверки статуса
     * @returns {boolean} true если корзина восстановлена (даже частично)
     */
    loadFromCache(productStore) {
        const loaded = loadCache();

        if (!loaded) return false;

        // Если передан productStore — проверяем статус товаров
        if (productStore) {
            const beforeCount = state.items.length;
            const removedItems = [];

            state.items = state.items.filter(item => {
                const product = productStore.getById(item.id);

                // Товар не найден в сторе — удаляем
                if (!product) {
                    removedItems.push(item);
                    return false;
                }

                // Товар продан или зарезервирован — удаляем
                if (product.status !== 'in_stock') {
                    removedItems.push(item);
                    return false;
                }

                return true;
            });

            if (removedItems.length > 0) {
                console.warn('[CartStore] Removed unavailable items from cache:',
                    removedItems.map(i => `${i.name} (status: ${productStore.getById(i.id)?.status || 'deleted'})`));
                saveCache();
                this.emit('change');
            }

            if (state.items.length === 0 && beforeCount > 0) {
                console.log('[CartStore] All cached items were unavailable, cart is empty');
            }
        }

        this.emit('change');
        return state.items.length > 0 || loaded;
    }

    /**
     * Добавляет товар в корзину.
     * Если товар уже есть — увеличивает количество на 1.
     *
     * @param {Object} product — {id, name, price, cost_price, ...}
     * @returns {boolean}
     */
    addItem(product) {
        if (!product?.id) return false;

        const existing = state.items.find(i => i.id === product.id);

        if (existing) {
            existing.quantity += 1;
        } else {
            state.items.push({
                id: product.id,
                name: product.name,
                price: product.price || 0,
                cost_price: product.cost_price || 0,
                quantity: 1,
                discount: 0
            });
        }

        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Изменяет количество товара.
     * Если количество <= 0 — удаляет товар.
     *
     * @param {string} productId
     * @param {number} delta — +1 или -1
     * @returns {boolean}
     */
    updateQuantity(productId, delta) {
        const item = state.items.find(i => i.id === productId);
        if (!item) return false;

        const newQty = item.quantity + delta;

        if (newQty <= 0) {
            return this.removeItem(productId);
        }

        item.quantity = newQty;
        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Удаляет товар из корзины.
     *
     * @param {string} productId
     * @returns {boolean}
     */
    removeItem(productId) {
        const len = state.items.length;
        state.items = state.items.filter(i => i.id !== productId);

        if (state.items.length !== len) {
            saveCache();
            this.emit('change');
            return true;
        }

        return false;
    }

    /**
     * Устанавливает скидку на конкретный товар.
     *
     * @param {string} productId
     * @param {number} percent — 0..100
     * @returns {boolean}
     */
    setItemDiscount(productId, percent) {
        const item = state.items.find(i => i.id === productId);
        if (!item) return false;

        item.discount = Math.min(100, Math.max(0, percent || 0));
        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Устанавливает общую скидку на корзину.
     *
     * @param {number} percent — 0..100
     */
    setTotalDiscount(percent) {
        state.totalDiscount = Math.min(100, Math.max(0, percent || 0));
        saveCache();
        this.emit('change');
    }

    /**
     * Очищает корзину (после успешной продажи).
     * Не требует подтверждения.
     */
    reset() {
        state.items = [];
        state.totalDiscount = 0;
        clearCache();
        this.emit('change');
    }

    // ============================================================
    // Геттеры
    // ============================================================

    /**
     * Возвращает копию массива товаров.
     *
     * @returns {Object[]}
     */
    getItems() {
        return [...state.items];
    }

    /**
     * Количество позиций в корзине.
     *
     * @returns {number}
     */
    getCount() {
        return state.items.reduce((sum, i) => sum + i.quantity, 0);
    }

    /**
     * Итоговая сумма корзины с учётом всех скидок.
     *
     * @returns {number}
     */
    getTotal() {
        const subtotal = state.items.reduce((sum, item) => {
            const price = item.price || 0;
            const discount = item.discount || 0;
            const discounted = price * (1 - discount / 100);
            return sum + (discounted * item.quantity);
        }, 0);

        const total = subtotal * (1 - state.totalDiscount / 100);
        return Math.max(0, Math.round(total));
    }

    /**
     * Итоговая сумма конкретного товара с учётом его скидки.
     *
     * @param {string} productId
     * @returns {number}
     */
    getItemTotal(productId) {
        const item = state.items.find(i => i.id === productId);
        if (!item) return 0;

        const price = item.price || 0;
        const discount = item.discount || 0;
        const discounted = price * (1 - discount / 100);
        return Math.round(discounted * item.quantity);
    }

    /**
     * Пуста ли корзина?
     *
     * @returns {boolean}
     */
    isEmpty() {
        return state.items.length === 0;
    }
}

// ============================================================
// Синглтон
// ============================================================

/** @type {CartStore} */
export const cartStore = new CartStore();

export default cartStore;
