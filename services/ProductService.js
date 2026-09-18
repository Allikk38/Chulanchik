// ============================================================
// services/ProductService.js
// v1.2.0 — 2026-09-18: загрузка/замена/удаление фото товара
// ============================================================

/**
 * Сервис товаров.
 *
 * Бизнес-логика: валидация, координация репозитория и стора,
 * работа с фото (загрузка/замена/удаление в Storage),
 * запись в audit_log.
 *
 * @module services/ProductService
 */

import ProductRepository from '../repositories/ProductRepository.js';
import AuditRepository, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../repositories/AuditRepository.js';
import { productStore } from '../stores/ProductStore.js';
import { validateAttributes } from '../utils/categorySchema.js';
import { formatMoney } from '../utils/formatters.js';

// ============================================================
// Валидация
// ============================================================

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
// Хелперы для работы с фото
// ============================================================

/**
 * Определяет финальный photo_url для операции create/update.
 *
 * Логика:
 *   - photoRemoved === true → null (удалить фото)
 *   - photoFile передан     → загрузить, вернуть новый URL
 *   - иначе                 → оставить existing (или null)
 *
 * Старый файл удаляется из Storage, если:
 *   - он был и заменяется новым, ИЛИ
 *   - он был и явно удаляется пользователем.
 *
 * @param {Object} options
 * @param {File|null} options.photoFile — новый файл (если выбран)
 * @param {boolean} options.photoRemoved — флаг явного удаления
 * @param {string|null} options.existingUrl — текущий URL фото (для update)
 * @returns {Promise<string|null>} финальный photo_url
 */
async function resolvePhotoUrl({ photoFile, photoRemoved, existingUrl }) {
    // Явное удаление — удаляем старый из Storage, возвращаем null
    if (photoRemoved) {
        if (existingUrl) {
            await ProductRepository.deletePhoto(existingUrl);
        }
        return null;
    }

    // Новый файл — грузим, удаляем старый если был
    if (photoFile) {
        const newUrl = await ProductRepository.uploadPhoto(photoFile);
        if (existingUrl) {
            await ProductRepository.deletePhoto(existingUrl);
        }
        return newUrl;
    }

    // Ничего не меняется — оставляем как было
    return existingUrl || null;
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
     * @param {File} [data.photoFile]
     * @param {string} data.created_by
     * @returns {Promise<{success: boolean, error?: string, product?: Object}>}
     */
    async create(data) {
        const baseValidation = validateProductBase(data);
        if (!baseValidation.valid) {
            return { success: false, error: baseValidation.errors[0] };
        }

        const category = data.category || 'other';
        const attributes = data.attributes || {};
        const attrValidation = validateAttributes(category, attributes);
        if (!attrValidation.valid) {
            return { success: false, error: attrValidation.errors[0] };
        }

        try {
            // Загружаем фото (если есть) ДО создания товара.
            // Если загрузка упадёт — товар не создастся (лучше явная ошибка,
            // чем товар без фото, которое пользователь выбрал).
            let photoUrl = null;
            if (data.photoFile) {
                photoUrl = await ProductRepository.uploadPhoto(data.photoFile);
            }

            const product = await ProductRepository.create({
                name: data.name.trim(),
                price: data.price,
                cost_price: data.cost_price || 0,
                category,
                attributes,
                photo_url: photoUrl,
                created_by: data.created_by
            });

            productStore.addLocally(product);

            // Аудит: успешное создание
            void AuditRepository.log({
                userId: data.created_by,
                action: AUDIT_ACTIONS.CREATE,
                entityType: AUDIT_ENTITY_TYPES.PRODUCT,
                entityId: product.id,
                oldData: null,
                newData: product,
                description: `Создан товар: «${product.name}» за ${formatMoney(product.price)}`
            });

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
     * @param {Object} data
     * @param {File} [data.photoFile] — новое фото (если заменяется)
     * @param {boolean} [data.photoRemoved] — флаг удаления фото
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

        if (data.name !== undefined && !data.name.trim()) {
            return { success: false, error: 'Название не может быть пустым' };
        }

        if (data.price !== undefined && (isNaN(data.price) || data.price < 0)) {
            return { success: false, error: 'Некорректная цена' };
        }

        if (data.attributes) {
            const category = data.category || existing.category || 'other';
            const attrValidation = validateAttributes(category, data.attributes);
            if (!attrValidation.valid) {
                return { success: false, error: attrValidation.errors[0] };
            }
        }

        try {
            // Определяем финальный photo_url:
            //   - новое фото → грузим, старый удаляем;
            //   - явное удаление → старый удаляем, null;
            //   - ничего не менялось → оставляем existing.photo_url.
            const finalPhotoUrl = await resolvePhotoUrl({
                photoFile: data.photoFile || null,
                photoRemoved: !!data.photoRemoved,
                existingUrl: existing.photo_url || null
            });

            const updates = {
                name: data.name,
                price: data.price,
                cost_price: data.cost_price,
                category: data.category,
                attributes: data.attributes,
                photo_url: finalPhotoUrl
            };

            // Убираем undefined — не перезаписываем поля, которые не пришли
            Object.keys(updates).forEach(key => {
                if (updates[key] === undefined) delete updates[key];
            });

            const updated = await ProductRepository.update(id, updates);
            productStore.updateLocally(id, updated);

            // Аудит: успешное обновление
            void AuditRepository.log({
                userId: data.userId || existing.created_by || null,
                action: AUDIT_ACTIONS.UPDATE,
                entityType: AUDIT_ENTITY_TYPES.PRODUCT,
                entityId: id,
                oldData: existing,
                newData: updated,
                description: `Изменён товар: «${updated.name}»`
            });

            return { success: true, product: updated };

        } catch (err) {
            console.error('[ProductService] update error:', err);
            return { success: false, error: err.message || 'Ошибка обновления товара' };
        }
    },

    /**
     * Удаляет товар.
     * Также удаляет его фото из Storage.
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

            // Удаляем фото из Storage (не блокирует основную операцию)
            if (existing.photo_url) {
                await ProductRepository.deletePhoto(existing.photo_url);
            }

            productStore.removeLocally(id);

            void AuditRepository.log({
                userId: existing.created_by || null,
                action: AUDIT_ACTIONS.DELETE,
                entityType: AUDIT_ENTITY_TYPES.PRODUCT,
                entityId: id,
                oldData: existing,
                newData: null,
                description: `Удалён товар: «${existing.name}»`
            });

            return { success: true };

        } catch (err) {
            console.error('[ProductService] remove error:', err);
            return { success: false, error: err.message || 'Ошибка удаления товара' };
        }
    }
};

export default ProductService;
