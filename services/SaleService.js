// ============================================================
// services/SaleService.js
// v1.2.0 — 2026-04-30: улучшена обработка ошибок от сервера
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Сервисный слой для оформления продаж.
//   Содержит бизнес-логику, валидацию и координацию между сторы.
//
// ЗАВИСИМОСТИ
//   SaleRepository  — сохранение продажи в БД (репозиторий)
//   cartStore       — стор корзины (CartStore)
//   shiftStore      — стор текущей смены (ShiftStore)
//   productStore    — стор товаров (ProductStore)
//
// ИСПОЛЬЗУЕТСЯ
//   CashierController — оформление продажи через checkout()
//
// ПОТОК ДАННЫХ
//   checkout(paymentMethod, userId)
//     -> проверка: корзина не пуста
//     -> проверка: смена открыта
//     -> проверка: userId передан
//     -> проверка: shiftId получен из стора
//     -> проверка: все товары в корзине имеют статус 'in_stock'
//        (если нет — товар удаляется из корзины, продажа прерывается)
//     -> SaleRepository.create(...)
//     -> обновление productStore (статус 'sold')
//     -> обновление shiftStore (статистика)
//     -> очистка корзины
//     -> возврат { success: true, sale }
//
// ИЗМЕНЕНИЯ
//   v1.2.0 — улучшена обработка ошибок:
//     - разбор ошибки сервера о недоступных товарах
//     - автоматическое удаление недоступных товаров из корзины
//     - понятные сообщения пользователю
//   v1.1.0 — защита от двойной продажи:
//     - добавлена проверка статуса товаров перед оформлением
//     - если товар продан другим кассиром, он удаляется из корзины
//     - пользователь получает уведомление (возвращается error с описанием)
//     - после удаления недоступных товаров нужно повторить checkout
//   v1.0.0 — первоначальная версия
//
// ============================================================

/**
 * Сервис продаж.
 *
 * Бизнес-логика оформления продажи.
 * Не зависит от UI. Контроллеры вызывают методы сервиса
 * и сами решают что показать пользователю.
 *
 * @module services/SaleService
 */

import SaleRepository from '../repositories/SaleRepository.js';
import { cartStore } from '../stores/CartStore.js';
import { shiftStore } from '../stores/ShiftStore.js';
import { productStore } from '../stores/ProductStore.js';

// ============================================================
// Сервис
// ============================================================

export const SaleService = {
    /**
     * Оформляет продажу.
     *
     * Алгоритм:
     * 1. Валидация входных данных (корзина, смена, пользователь)
     * 2. Проверка статуса всех товаров в корзине
     *    — если товар уже продан, удаляет его из корзины и прерывает операцию
     * 3. Расчёт итогов и прибыли
     * 4. Сохранение продажи через SaleRepository
     * 5. Обновление сторов (productStore, shiftStore, cartStore)
     *
     * @param {Object} params
     * @param {string} params.paymentMethod — 'cash', 'card', 'transfer'
     * @param {string} params.userId — ID пользователя
     * @returns {Promise<{success: boolean, error?: string, sale?: Object}>}
     */
    async checkout({ paymentMethod, userId }) {
        // --- Валидация входных данных ---

        if (cartStore.isEmpty()) {
            return { success: false, error: 'Корзина пуста' };
        }

        if (!shiftStore.isOpen()) {
            return { success: false, error: 'Смена не открыта' };
        }

        if (!userId) {
            return { success: false, error: 'Пользователь не определён' };
        }

        const shiftId = shiftStore.getCurrentShiftId();
        if (!shiftId) {
            return { success: false, error: 'Не удалось определить смену' };
        }

        // --- Проверка статуса товаров (защита от двойной продажи) ---

        const items = cartStore.getItems();
        const unavailableItems = [];

        for (const cartItem of items) {
            const currentProduct = productStore.getById(cartItem.id);

            // Товар не найден в сторе — значит был удалён
            if (!currentProduct) {
                unavailableItems.push({
                    id: cartItem.id,
                    name: cartItem.name,
                    reason: 'товар удалён из системы'
                });
                continue;
            }

            // Товар уже продан (этим или другим кассиром)
            if (currentProduct.status === 'sold') {
                unavailableItems.push({
                    id: cartItem.id,
                    name: cartItem.name,
                    reason: 'товар только что продан'
                });
                continue;
            }

            // Товар зарезервирован
            if (currentProduct.status === 'reserved') {
                unavailableItems.push({
                    id: cartItem.id,
                    name: cartItem.name,
                    reason: 'товар зарезервирован'
                });
                continue;
            }
        }

        // Если есть недоступные товары — удаляем их из корзины и прерываем операцию
        if (unavailableItems.length > 0) {
            for (const unavailable of unavailableItems) {
                cartStore.removeItem(unavailable.id);
            }

            const names = unavailableItems.map(item => `«${item.name}»`).join(', ');
            return {
                success: false,
                error: `Некоторые товары больше недоступны и удалены из корзины: ${names}. Проверьте корзину и попробуйте снова.`
            };
        }

        // --- Сбор данных для продажи ---

        const total = cartStore.getTotal();

        const itemsForDb = items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            cost_price: item.cost_price,
            quantity: item.quantity,
            discount: item.discount
        }));

        const profit = items.reduce((sum, item) => {
            const discounted = (item.price || 0) * (1 - (item.discount || 0) / 100);
            return sum + ((discounted - (item.cost_price || 0)) * item.quantity);
        }, 0);

        const itemsCount = items.reduce((sum, i) => sum + i.quantity, 0);

        // --- Сохранение продажи ---

        try {
            const sale = await SaleRepository.create({
                shift_id: shiftId,
                items: itemsForDb,
                total,
                profit: Math.round(profit),
                payment_method: paymentMethod,
                user_id: userId
            });

            // Обновляем сторы
            for (const item of items) {
                productStore.updateLocally(item.id, { status: 'sold' });
            }

            shiftStore.addToStats({
                revenue: total,
                profit: Math.round(profit),
                salesCount: 1,
                itemsCount
            });

            cartStore.reset();

            return { success: true, sale };

        } catch (err) {
            console.error('[SaleService] checkout error:', err);

            // --- Улучшенная обработка ошибок от сервера ---
            const errorMessage = err.message || '';

            // Проверяем, содержит ли ошибка информацию о недоступных товарах
            // (эту ошибку генерирует наша новая версия checkout_sale в БД)
            if (errorMessage.includes('Товары недоступны для продажи')) {
                // Извлекаем UUID недоступных товаров из сообщения об ошибке
                const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                const unavailableIds = errorMessage.match(uuidPattern);

                if (unavailableIds && unavailableIds.length > 0) {
                    // Удаляем недоступные товары из корзины
                    for (const id of unavailableIds) {
                        const removed = cartStore.removeItem(id);
                        if (removed) {
                            console.log('[SaleService] Removed unavailable item from cart:', id);
                        }
                    }

                    return {
                        success: false,
                        error: 'Некоторые товары уже проданы другим пользователем и удалены из корзины. Пожалуйста, проверьте корзину и попробуйте снова.'
                    };
                }
            }

            // Общая ошибка сети или сервера
            return {
                success: false,
                error: 'Не удалось оформить продажу. Проверьте подключение к интернету и попробуйте снова.'
            };
        }
    }
};

export default SaleService;
