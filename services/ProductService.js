// ============================================================
// services/ProductService.js
// v1.4.0 — 2026-10-27: quantity_limit в create
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

    if (data.quantity_limit !== undefined && data.quantity_limit !== null) {
        const ql = Number(data.quantity_limit);
        if (!Number.isFinite(ql) || ql < 1) {
            errors.push('Лимит количества должен быть ≥ 1');
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================
// Хелперы для работы с фото
// ============================================================

async function resolvePhotoUrl({ photoFile, photoRemoved, existingUrl }) {
    if (photoRemoved) {
        if (existingUrl) {
            await ProductRepository.deletePhoto(existingUrl);
        }
        return null;
    }

    if (photoFile) {
        const newUrl = await ProductRepository.uploadPhoto(photoFile);
        if (existingUrl) {
            await ProductRepository.deletePhoto(existingUrl);
        }
        return newUrl;
    }

    return existingUrl || null;
}

// ============================================================
// Сервис
// ============================================================

export const ProductService = {
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
                created_by: data.created_by,
                quantity_limit: Number(data.quantity_limit) || 1
            });

            productStore.addLocally(product);

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
                photo_url: finalPhotoUrl,
                quantity_limit: data.quantity_limit !== undefined
                    ? Number(data.quantity_limit) || 1
                    : undefined
            };

            Object.keys(updates).forEach(key => {
                if (updates[key] === undefined) delete updates[key];
            });

            const updated = await ProductRepository.update(id, updates);
            productStore.updateLocally(id, updated);

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

    async remove(id, { isAdmin = false } = {}) {
        const existing = productStore.getById(id);

        if (!existing) {
            return { success: false, error: 'Товар не найден' };
        }

        if (existing.status === 'sold' && !isAdmin) {
            return { success: false, error: 'Удалять проданные товары может только администратор' };
        }

        try {
            await ProductRepository.remove(id);

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
                description: `Удалён товар: «${existing.name}»` +
                    (existing.status === 'sold' ? ' (проданный, удалён администратором)' : '')
            });

            return { success: true };

        } catch (err) {
            console.error('[ProductService] remove error:', err);
            return { success: false, error: err.message || 'Ошибка удаления товара' };
        }
    }
};

export default ProductService;