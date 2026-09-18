// ============================================================
// repositories/AuditRepository.js
// v1.0.0 — 2026-09-18: инфраструктура аудита
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Репозиторий журнала аудита.
//   Единственный модуль, который обращается к таблице audit_log.
//
// ЗАВИСИМОСТИ
//   supabase — клиент из core/supabase-client.js
//
// ИСПОЛЬЗУЕТСЯ
//   Сервисами (ProductService, SaleService, ExpenseService, ShiftService)
//   для записи событий. Интеграция — отдельная задача.
//
// ПОТОК ДАННЫХ
//   Сервис → AuditRepository.log({...}) → supabase.from('audit_log').insert(...)
//
// ВАЖНО
//   Метод log() НЕ бросает исключений наружу.
//   Если логирование упало — основная операция не должна ломаться.
//   Ошибка пишется в console.error.
//
//   Таблица audit_log иммутабельна: RLS запрещает UPDATE и DELETE.
//
// @module repositories/AuditRepository
// ============================================================

import { supabase } from '../core/supabase-client.js';

// ============================================================
// Константы
// ============================================================

/**
 * Допустимые типы действий.
 * Используется для валидации на стороне клиента (не вместо БД).
 */
export const AUDIT_ACTIONS = {
    CREATE:       'create',
    UPDATE:       'update',
    DELETE:       'delete',
    ARCHIVE:      'archive',
    SALE:         'sale',
    SHIFT_OPEN:   'shift_open',
    SHIFT_CLOSE:  'shift_close',
    LOGIN:        'login'
};

/**
 * Допустимые типы сущностей.
 */
export const AUDIT_ENTITY_TYPES = {
    PRODUCT: 'product',
    SALE:    'sale',
    EXPENSE: 'expense',
    SHIFT:   'shift',
    USER:    'user'
};

// ============================================================
// Внутренние хелперы
// ============================================================

/**
 * Приводит значение к JSONB-совместимому виду.
 * Убирает undefined (JSON.stringify их и так игнорирует,
 * но для явности и предсказуемости — конвертируем в null).
 *
 * @param {*} value
 * @returns {Object|null}
 */
function sanitizeSnapshot(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object') return value;

    try {
        // Клонируем через JSON — заодно отсекаем функции, Date → строка и т.п.
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        console.warn('[AuditRepository] sanitizeSnapshot failed:', e);
        return null;
    }
}

// ============================================================
// Репозиторий
// ============================================================

export const AuditRepository = {
    /**
     * Записывает событие в журнал аудита.
     *
     * НЕ бросает исключений наружу: ошибка логирования
     * не должна ломать основную операцию. Ошибка пишется
     * в console.error.
     *
     * @param {Object} event
     * @param {string|null} event.userId       — ID пользователя (null для системных)
     * @param {string} event.action            — тип действия (см. AUDIT_ACTIONS)
     * @param {string} event.entityType        — тип сущности (см. AUDIT_ENTITY_TYPES)
     * @param {string} event.entityId          — ID сущности (строкой)
     * @param {Object} [event.oldData]         — снимок до изменения
     * @param {Object} [event.newData]         — снимок после изменения
     * @param {string} [event.description]     — человекочитаемое описание
     * @returns {Promise<boolean>} true если запись создана, false при ошибке
     */
    async log({
        userId = null,
        action,
        entityType,
        entityId,
        oldData = null,
        newData = null,
        description = null
    } = {}) {
        // Базовая клиентская валидация — чтобы не гонять заведомо битые данные
        if (!action || !entityType || entityId === undefined || entityId === null) {
            console.warn('[AuditRepository] log() called with missing required fields:', {
                action, entityType, entityId
            });
            return false;
        }

        const payload = {
            user_id:     userId,
            action:      action,
            entity_type: entityType,
            entity_id:   String(entityId),
            old_data:    sanitizeSnapshot(oldData),
            new_data:    sanitizeSnapshot(newData),
            description: description || null
        };

        try {
            const { error } = await supabase
                .from('audit_log')
                .insert(payload);

            if (error) {
                console.error('[AuditRepository] insert error:', {
                    message: error.message,
                    code:    error.code,
                    details: error.details,
                    hint:    error.hint,
                    payload
                });
                return false;
            }

            return true;

        } catch (err) {
            // Сетевые ошибки, падение клиента Supabase и т.п.
            console.error('[AuditRepository] unexpected error:', err, { payload });
            return false;
        }
    },

    /**
     * Возвращает историю изменений конкретной сущности.
     * Отсортировано по created_at DESC (свежие сверху).
     *
     * @param {string} entityType — тип сущности ('product', 'sale', ...)
     * @param {string} entityId   — ID сущности
     * @param {Object} [options]
     * @param {number} [options.limit=50]
     * @returns {Promise<Object[]>}
     */
    async getByEntity(entityType, entityId, { limit = 50 } = {}) {
        if (!entityType || entityId === undefined || entityId === null) {
            console.warn('[AuditRepository] getByEntity() called with missing args');
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('audit_log')
                .select('*')
                .eq('entity_type', entityType)
                .eq('entity_id', String(entityId))
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];

        } catch (err) {
            console.error('[AuditRepository] getByEntity error:', err);
            return [];
        }
    },

    /**
     * Возвращает последние события с опциональной фильтрацией.
     *
     * @param {Object} [options]
     * @param {number} [options.limit=100]
     * @param {string} [options.userId] — фильтр по пользователю
     * @param {string} [options.action] — фильтр по типу действия
     * @returns {Promise<Object[]>}
     */
    async getRecent({ limit = 100, userId, action } = {}) {
        try {
            let query = supabase
                .from('audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (userId) query = query.eq('user_id', userId);
            if (action) query = query.eq('action', action);

            const { data, error } = await query;

            if (error) throw error;
            return data || [];

        } catch (err) {
            console.error('[AuditRepository] getRecent error:', err);
            return [];
        }
    }
};

export default AuditRepository;
