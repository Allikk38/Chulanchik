// ============================================================
// services/SaleService.js
// v1.3.0 — 2026-04-30: восстановлен правильный файл
// ============================================================

import SaleRepository from '../repositories/SaleRepository.js';
import { cartStore } from '../stores/CartStore.js';
import { shiftStore } from '../stores/ShiftStore.js';
import { productStore } from '../stores/ProductStore.js';

export const SaleService = {
    async checkout({ paymentMethod, userId }) {
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

        const items = cartStore.getItems();
        const unavailableItems = [];

        for (const cartItem of items) {
            const currentProduct = productStore.getById(cartItem.id);
            if (!currentProduct) {
                unavailableItems.push({ id: cartItem.id, name: cartItem.name, reason: 'товар удалён из системы' });
                continue;
            }
            if (currentProduct.status === 'sold') {
                unavailableItems.push({ id: cartItem.id, name: cartItem.name, reason: 'товар только что продан' });
                continue;
            }
            if (currentProduct.status === 'reserved') {
                unavailableItems.push({ id: cartItem.id, name: cartItem.name, reason: 'товар зарезервирован' });
                continue;
            }
        }

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

        try {
            const sale = await SaleRepository.create({
                shift_id: shiftId,
                items: itemsForDb,
                total,
                profit: Math.round(profit),
                payment_method: paymentMethod,
                user_id: userId
            });

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
            const errorMessage = err.message || '';

            if (errorMessage.includes('Товары недоступны для продажи')) {
                const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
                const unavailableIds = errorMessage.match(uuidPattern);

                if (unavailableIds && unavailableIds.length > 0) {
                    for (const id of unavailableIds) {
                        cartStore.removeItem(id);
                    }
                    return {
                        success: false,
                        error: 'Некоторые товары уже проданы другим пользователем и удалены из корзины. Пожалуйста, проверьте корзину и попробуйте снова.'
                    };
                }
            }

            return {
                success: false,
                error: 'Не удалось оформить продажу. Проверьте подключение к интернету и попробуйте снова.'
            };
        }
    }
};

export default SaleService;
