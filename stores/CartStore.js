// ============================================================
// stores/CartStore.js
// v1.2.0 — 2026-04-30: валидация товаров при загрузке из кэша
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Стор корзины кассового модуля.
//   Владеет массивом товаров, их количеством и скидками.
//   Сохраняет состояние в localStorage для восстановления после
//   обновления страницы или закрытия браузера.
//
// ЗАВИСИМОСТИ
//   EventEmitter — базовый класс для событий (из ./EventEmitter.js)
//
// ИСПОЛЬЗУЕТСЯ
//   CashierController — добавление/удаление товаров, оформление продажи
//   SaleService        — получение списка товаров для продажи
//   CashierCart        — рендеринг панели корзины
//
// ПОТОК ДАННЫХ
//   1. При инициализации кассы вызывается loadFromCache(productStore)
//   2. Метод загружает сохранённую корзину из localStorage
//   3. Для каждого товара проверяется его актуальный статус через productStore
//   4. Товары, которые уже проданы, удалены или зарезервированы — удаляются
//   5. Оставшиеся товары остаются в корзине и отображаются пользователю
//
//   При добавлении/удалении товаров:
//   - addItem() добавляет или увеличивает количество
//   - updateQuantity() изменяет количество ±1
//   - removeItem() удаляет товар
//   - reset() очищает корзину после успешной продажи
//
//   При успешной продаже:
//   - SaleService вызывает cartStore.reset()
//   - reset() очищает state.items, сбрасывает скидку, удаляет кэш
//   - Вызывает this.emit('change') для обновления UI
//
// КЭШ
//   localStorage: ключ 'cart_cache'
//   Формат: { items: [...], totalDiscount: number, cachedAt: timestamp }
//   TTL: 60 минут
//   При загрузке товары с истёкшим TTL игнорируются
//
// ИЗМЕНЕНИЯ
//   v1.2.0 — улучшена валидация при загрузке из кэша:
//            - loadFromCache() всегда проверяет статус товаров
//            - удалённые/проданные товары удаляются из восстановленной корзины
//            - подробное логирование удалённых товаров
//   v1.1.0 — валидация при загрузке из кэша:
//            - loadFromCache() принимает productStore
//            - товары с status !== 'in_stock' автоматически удаляются
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

/** Ключ для localStorage */
const CART_KEY = 'cart_cache';

/** Время жизни кэша в миллисекундах (60 минут) */
const CART_TTL_MS = 60 * 60 * 1000;

// ============================================================
// Состояние
// ============================================================

const state = {
    /** @type {Array<{id: string, name: string, price: number, cost_price: number, quantity: number, discount: number}>} */
    items: [],

    /** @type {number} общая скидка на корзину в процентах (0–100) */
    totalDiscount: 0
};

// ============================================================
// Работа с localStorage
// ============================================================

/**
 * Сохраняет текущее состояние корзины в localStorage.
 * Вызывается после каждого изменения (addItem, removeItem, reset, etc.)
 */
function saveCache() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify({
            items: state.items,
            totalDiscount: state.totalDiscount,
            cachedAt: Date.now()
        }));
    } catch (e) {
        // localStorage переполнен или недоступен — не критично
    }
}

/**
 * Загружает состояние корзины из localStorage.
 * Проверяет TTL. Если кэш просрочен — удаляет его.
 *
 * @returns {boolean} true если кэш загружен успешно
 */
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
            // Кэш просрочен — удаляем
            localStorage.removeItem(CART_KEY);
        }
    } catch (e) {
        // Битый кэш — удаляем
        localStorage.removeItem(CART_KEY);
    }
    return false;
}

/**
 * Удаляет кэш корзины из localStorage.
 * Вызывается при очистке корзины (reset) и при выходе из системы.
 */
function clearCache() {
    try {
        localStorage.removeItem(CART_KEY);
    } catch (e) {
        // не критично
    }
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
     * 2. Для каждого товара проверяет его статус через productStore
     * 3. Товары, которые уже проданы, удалены или зарезервированы — удаляются из корзины
     * 4. Оставшиеся валидные товары сохраняются
     * 5. Вызывает this.emit('change') для обновления UI
     *
     * @param {Object} [productStore] — стор товаров для проверки актуального статуса
     * @returns {boolean} true если корзина восстановлена (хотя бы частично)
     */
    loadFromCache(productStore) {
        // 1. Пытаемся загрузить кэш
        const loaded = loadCache();

        // 2. Если кэша нет — выходим
        if (!loaded) {
            console.log('[CartStore] No cache found, starting with empty cart');
            return false;
        }

        console.log('[CartStore] Cache loaded, items:', state.items.length);

        // 3. Проверяем статус товаров, если передан productStore
        if (productStore) {
            const beforeCount = state.items.length;
            const removedItems = [];

            // Фильтруем: оставляем только товары в наличии
            state.items = state.items.filter(item => {
                const product = productStore.getById(item.id);

                // Товар не найден в сторе — удаляем
                if (!product) {
                    console.warn('[CartStore] Product not found in store, removing:', item.name);
                    removedItems.push({ ...item, reason: 'удалён из системы' });
                    return false;
                }

                // Товар продан или зарезервирован — удаляем
                if (product.status !== 'in_stock') {
                    console.warn('[CartStore] Product unavailable, removing:', item.name, 'status:', product.status);
                    removedItems.push({ ...item, reason: `статус: ${product.status}` });
                    return false;
                }

                // Обновляем цену и себестоимость из актуальных данных
                item.price = product.price || item.price;
                item.cost_price = product.cost_price || item.cost_price;

                return true;
            });

            // 4. Если были удаления — логируем и сохраняем обновлённую корзину
            if (removedItems.length > 0) {
                console.warn('[CartStore] Removed', removedItems.length, 'unavailable items from cache:',
                    removedItems.map(i => `${i.name} (reason: ${i.reason})`));
                
                // Сохраняем очищенную корзину в кэш
                saveCache();
                
                // Уведомляем подписчиков об изменении
                this.emit('change');
            }

            // 5. Логируем итог
            if (state.items.length === 0 && beforeCount > 0) {
                console.log('[CartStore] All cached items were unavailable, cart is now empty');
            } else if (state.items.length > 0) {
                console.log('[CartStore] Cart restored with', state.items.length, 'valid items');
            }
        }

        // 6. Уведомляем подписчиков
        this.emit('change');
        
        return state.items.length > 0;
    }

    /**
     * Добавляет товар в корзину.
     * Если товар уже есть — увеличивает количество на 1.
     *
     * @param {Object} product — объект товара из productStore
     * @param {string} product.id — уникальный идентификатор
     * @param {string} product.name — название товара
     * @param {number} product.price — цена продажи
     * @param {number} [product.cost_price=0] — себестоимость
     * @returns {boolean} true если товар добавлен успешно
     */
    addItem(product) {
        if (!product?.id) {
            console.warn('[CartStore] addItem: product has no id');
            return false;
        }

        const existing = state.items.find(i => i.id === product.id);

        if (existing) {
            // Товар уже в корзине — увеличиваем количество
            existing.quantity += 1;
            console.log('[CartStore] Increased quantity for:', product.name, 'to:', existing.quantity);
        } else {
            // Новый товар — добавляем
            state.items.push({
                id: product.id,
                name: product.name,
                price: product.price || 0,
                cost_price: product.cost_price || 0,
                quantity: 1,
                discount: 0
            });
            console.log('[CartStore] Added new item:', product.name);
        }

        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Изменяет количество товара на указанную величину.
     * Если итоговое количество <= 0 — удаляет товар из корзины.
     *
     * @param {string} productId — ID товара
     * @param {number} delta — изменение количества (+1 или -1)
     * @returns {boolean} true если изменение применено
     */
    updateQuantity(productId, delta) {
        const item = state.items.find(i => i.id === productId);
        if (!item) {
            console.warn('[CartStore] updateQuantity: item not found:', productId);
            return false;
        }

        const newQty = item.quantity + delta;

        if (newQty <= 0) {
            // Количество стало нулевым или отрицательным — удаляем товар
            return this.removeItem(productId);
        }

        item.quantity = newQty;
        console.log('[CartStore] Updated quantity for:', item.name, 'to:', newQty);
        
        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Удаляет товар из корзины по ID.
     *
     * @param {string} productId — ID товара для удаления
     * @returns {boolean} true если товар найден и удалён
     */
    removeItem(productId) {
        const initialLength = state.items.length;
        
        state.items = state.items.filter(i => i.id !== productId);

        if (state.items.length !== initialLength) {
            console.log('[CartStore] Removed item:', productId);
            saveCache();
            this.emit('change');
            return true;
        }

        console.warn('[CartStore] removeItem: item not found:', productId);
        return false;
    }

    /**
     * Устанавливает скидку на конкретный товар в процентах.
     *
     * @param {string} productId — ID товара
     * @param {number} percent — процент скидки (0–100)
     * @returns {boolean} true если скидка применена
     */
    setItemDiscount(productId, percent) {
        const item = state.items.find(i => i.id === productId);
        if (!item) {
            console.warn('[CartStore] setItemDiscount: item not found:', productId);
            return false;
        }

        item.discount = Math.min(100, Math.max(0, percent || 0));
        console.log('[CartStore] Set discount for:', item.name, 'to:', item.discount + '%');
        
        saveCache();
        this.emit('change');
        return true;
    }

    /**
     * Устанавливает общую скидку на всю корзину в процентах.
     *
     * @param {number} percent — процент скидки (0–100)
     */
    setTotalDiscount(percent) {
        state.totalDiscount = Math.min(100, Math.max(0, percent || 0));
        console.log('[CartStore] Set total discount to:', state.totalDiscount + '%');
        
        saveCache();
        this.emit('change');
    }

    /**
     * Полностью очищает корзину.
     * Вызывается после успешной продажи через SaleService.
     * Не требует подтверждения — вызывается автоматически.
     */
    reset() {
        console.log('[CartStore] Resetting cart');
        
        state.items = [];
        state.totalDiscount = 0;
        
        clearCache();
        this.emit('change');
    }

    // ============================================================
    // Геттеры (не изменяют состояние, только читают)
    // ============================================================

    /**
     * Возвращает копию массива товаров в корзине.
     * Не возвращает оригинальный массив для защиты от случайных изменений.
     *
     * @returns {Array<{id: string, name: string, price: number, cost_price: number, quantity: number, discount: number}>}
     */
    getItems() {
        return [...state.items];
    }

    /**
     * Возвращает общее количество единиц товара в корзине.
     * Суммирует quantity всех позиций.
     *
     * @returns {number} общее количество товаров
     */
    getCount() {
        return state.items.reduce((sum, i) => sum + i.quantity, 0);
    }

    /**
     * Вычисляет итоговую сумму корзины с учётом всех скидок.
     * Учитывает индивидуальные скидки товаров и общую скидку на корзину.
     *
     * @returns {number} итоговая сумма в рублях
     */
    getTotal() {
        // Суммируем стоимость товаров с учётом индивидуальных скидок
        const subtotal = state.items.reduce((sum, item) => {
            const price = item.price || 0;
            const discount = item.discount || 0;
            const discounted = price * (1 - discount / 100);
            return sum + (discounted * item.quantity);
        }, 0);

        // Применяем общую скидку на корзину
        const total = subtotal * (1 - state.totalDiscount / 100);
        return Math.max(0, Math.round(total));
    }

    /**
     * Вычисляет итоговую стоимость конкретного товара с учётом его скидки.
     *
     * @param {string} productId — ID товара
     * @returns {number} стоимость товара в рублях
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
     * Проверяет, пуста ли корзина.
     *
     * @returns {boolean} true если корзина пуста
     */
    isEmpty() {
        return state.items.length === 0;
    }
}

// ============================================================
// Синглтон
// ============================================================

/**
 * Единственный экземпляр стора корзины.
 * Используется всеми модулями, работающими с корзиной.
 *
 * @type {CartStore}
 */
export const cartStore = new CartStore();

export default cartStore;
