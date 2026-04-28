// ============================================================
// services/SaleService.js
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
     * @param {Object} params
     * @param {string} params.paymentMethod — 'cash', 'card', 'transfer'
     * @param {string} params.userId — ID пользователя
     * @returns {Promise<{success: boolean, error?: string, sale?: Object}>}
     */
    async checkout({ paymentMethod, userId }) {
        // Валидация
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

        // Собираем данные
        const items = cartStore.getItems();
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

        // Сохраняем через репозиторий
        try {
            const sale = await SaleRepository.create({
                shift_id: shiftId,
                items: itemsForDb,
                total,
                profit: Math.round(profit),
                payment_method: paymentMethod,
                created_by: userId
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
            return { success: false, error: err.message || 'Ошибка оформления продажи' };
        }
    }
};

export default SaleService;
