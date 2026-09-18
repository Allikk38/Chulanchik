// ============================================================
// services/SaleService.js
// v1.3.0 — 2026-09-18: sellerName в продаже и аудите
// ============================================================

/**
 * Сервис продаж.
 *
 * Оформление продажи через RPC `checkout_sale`.
 * Имя продавца передаётся снимком — денормализуется в sales
 * для отображения в UI и сохранения истории.
 *
 * @module services/SaleService
 */

import SaleRepository from '../repositories/SaleRepository.js';
import AuditRepository, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../repositories/AuditRepository.js';
import { cartStore } from '../stores/CartStore.js';
import { shiftStore } from '../stores/ShiftStore.js';
import { productStore } from '../stores/ProductStore.js';
import { formatMoney, getPaymentMethodName } from '../utils/formatters.js';

export const SaleService = {
    /**
     * Оформляет продажу.
     *
     * @param {Object} options
     * @param {string} options.paymentMethod — 'cash' | 'card' | 'transfer' | 'qr'
     * @param {string} options.userId
     * @param {string} [options.sellerName] — снимок имени продавца
     * @returns {Promise<{success: boolean, error?: string, sale?: Object}>}
     */
    async checkout({ paymentMethod, userId, sellerName = null }) {
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
                user_id: userId,
                seller_name: sellerName
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

            const auditDescription = sellerName
                ? `Продажа на ${formatMoney(total)} (${itemsCount} поз., ${getPaymentMethodName(paymentMethod)}). Продавец: ${sellerName}`
                : `Продажа на ${formatMoney(total)} (${itemsCount} поз., ${getPaymentMethodName(paymentMethod)})`;

            void AuditRepository.log({
                userId,
                action: AUDIT_ACTIONS.SALE,
                entityType: AUDIT_ENTITY_TYPES.SALE,
                entityId: sale.id,
                oldData: null,
                newData: {
                    items: itemsForDb,
                    total,
                    profit: Math.round(profit),
                    payment_method: paymentMethod,
                    shift_id: shiftId,
                    seller_name: sellerName
                },
                description: auditDescription
            });

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
