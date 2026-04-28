// ============================================================
// services/ProductService.js
// ============================================================

/**
 * Сервис товаров.
 * 
 * Бизнес-логика: валидация, проверки прав (на уровне данных),
 * координация между репозиторием и стором.
 * 
 * @module services/ProductService
 */

import ProductRepository from '../repositories/ProductRepository.js';
import { productStore } from '../stores/ProductStore.js';
import { validateAttributes } from '../utils/categorySchema.js';

// ============================================================
// Валидация
// ============================================================

/**
 * Валидирует основные поля товара.
 * 
 * @param {Object} data
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateProductBase(data) {
    const errors = [];

    if (!data.name || !data.name.trim()) {
        errors.push('Название обязательно');
    }

    if (data.price === undefined || data.price === null || isNaN(data.price) || data.price < 0) {
        errors.push('Укажите корректную цену');
    }

    if (data.cost_price !== undefined && data.cost_price !== null && (isNaN(data.cost_price) || data.cost_price < 0)) {
        errors.push('Себестоимость не может быть отрицательной');
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================
// Сервис
// ============================================================

export const ProductService = {
    /**
     * Создаёт товар.
     * 
     * @param {Object} data
     * @param {string} data.name
     * @param {number} data.price
     * @param {number} [data.cost_price]
     * @param {string} [data.category]
     * @param {Object} [data.attributes]
     * @param {string} [data.photo_url]
     * @param {string} data.created_by
     * @returns {Promise<{success: boolean, error?: string, product?: Object}>}
     */
    async create(data) {
        // Валидация основных полей
        const baseValidation = validateProductBase(data);
        if (!baseValidation.valid) {
            return { success: false, error: baseValidation.errors[0] };
        }

        // Валидация атрибутов категории
        const category = data.category || 'other';
        const attributes = data.attributes || {};
        const attrValidation = validateAttributes(category, attributes);
        if (!attrValidation.valid) {
            return { success: false, error: attrValidation.errors[0] };
        }

        try {
            const product = await ProductRepository.create({
                name: data.name.trim(),
                price: data.price,
                cost_price: data.cost_price || 0,
                category,
                attributes,
                photo_url: data.photo_url || null,
                created_by: data.created_by
            });

            productStore.addLocally(product);

            return { success: true, product };

        } catch (err) {
            console.error('[ProductService] create error:', err);
            return { success: false, error: err.message || 'Ошибка создания товара' };
        }
    },

    /**
     * Обновляет товар.
     * 
     * @param {string} id
     * @param {Object} data — поля для обновления
     * @returns {Promise<{success: boolean, error?: string, product?: Object}>}
     */
    async update(id, data) {
        const existing = productStore.getById(id);

        if (!existing) {
            return { success: false, error: 'Товар не найден' };
        }

        if (existing.status === 'sold') {
            return { success: false, error: 'Нельзя редактировать проданный товар' };
        }

        // Валидируем только переданные поля
        if (data.name !== undefined && !data.name.trim()) {
            return { success: false, error: 'Название не может быть пустым' };
        }

        if (data.price !== undefined && (isNaN(data.price) || data.price < 0)) {
            return { success: false, error: 'Некорректная цена' };
        }

        // Валидация атрибутов если переданы
        if (data.attributes) {
            const category = data.category || existing.category || 'other';
            const attrValidation = validateAttributes(category, data.attributes);
            if (!attrValidation.valid) {
                return { success: false, error: attrValidation.errors[0] };
            }
        }

        try {
            const updated = await ProductRepository.update(id, data);
            productStore.updateLocally(id, updated);

            return { success: true, product: updated };

        } catch (err) {
            console.error('[ProductService] update error:', err);
            return { success: false, error: err.message || 'Ошибка обновления товара' };
        }
    },

    /**
     * Удаляет товар.
     * 
     * @param {string} id
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async remove(id) {
        const existing = productStore.getById(id);

        if (!existing) {
            return { success: false, error: 'Товар не найден' };
        }

        if (existing.status === 'sold') {
            return { success: false, error: 'Нельзя удалить проданный товар' };
        }

        try {
            await ProductRepository.remove(id);
            productStore.removeLocally(id);

            return { success: true };

        } catch (err) {
            console.error('[ProductService] remove error:', err);
            return { success: false, error: err.message || 'Ошибка удаления товара' };
        }
    }
};

export default ProductService;
