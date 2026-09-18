// ============================================================
// services/ShiftService.js
// v1.1.0 — 2026-09-18: добавлено логирование в audit_log
// ============================================================

/**
 * Сервис смен.
 *
 * Бизнес-логика открытия/закрытия смены.
 * Не зависит от UI.
 *
 * Открытие и закрытие смены пишутся в audit_log.
 *
 * @module services/ShiftService
 */

import { shiftStore } from '../stores/ShiftStore.js';
import AuditRepository, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../repositories/AuditRepository.js';
import { formatMoney } from '../utils/formatters.js';

// ============================================================
// Сервис
// ============================================================

export const ShiftService = {
    /**
     * Открывает смену.
     *
     * @param {string} userId
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async openShift(userId) {
        console.log('[ShiftService] openShift() called, userId:', userId);

        if (!userId) {
            console.error('[ShiftService] openShift failed: no userId');
            return { success: false, error: 'Пользователь не определён' };
        }

        if (shiftStore.isOpen()) {
            console.log('[ShiftService] openShift skipped: shift already open');
            return { success: false, error: 'Смена уже открыта' };
        }

        console.log('[ShiftService] calling shiftStore.openShift()...');

        const ok = await shiftStore.openShift(userId);

        if (!ok) {
            console.error('[ShiftService] openShift failed: shiftStore.openShift returned false');
            return { success: false, error: 'Не удалось открыть смену' };
        }

        console.log('[ShiftService] openShift completed successfully');

        // Аудит: успешное открытие смены
        const shiftId = shiftStore.getCurrentShiftId();
        void AuditRepository.log({
            userId,
            action: AUDIT_ACTIONS.SHIFT_OPEN,
            entityType: AUDIT_ENTITY_TYPES.SHIFT,
            entityId: shiftId || 'unknown',
            oldData: null,
            newData: shiftStore.getCurrent(),
            description: 'Открыта смена'
        });

        return { success: true };
    },

    /**
     * Закрывает смену.
     *
     * @returns {Promise<{success: boolean, error?: string, stats?: Object}>}
     */
    async closeShift() {
        console.log('[ShiftService] closeShift() called');

        if (!shiftStore.isOpen()) {
            console.log('[ShiftService] closeShift failed: no open shift');
            return { success: false, error: 'Нет открытой смены' };
        }

        const statsBeforeClose = shiftStore.getStats();
        const shiftId = shiftStore.getCurrentShiftId();
        const shiftSnapshot = shiftStore.getCurrent();
        console.log('[ShiftService] stats before close:', statsBeforeClose);

        console.log('[ShiftService] calling shiftStore.closeShift()...');

        const ok = await shiftStore.closeShift();

        if (!ok) {
            console.error('[ShiftService] closeShift failed: shiftStore.closeShift returned false');
            return { success: false, error: 'Не удалось закрыть смену' };
        }

        const finalStats = {
            revenue: statsBeforeClose.revenue || 0,
            profit: statsBeforeClose.profit || 0,
            salesCount: statsBeforeClose.salesCount || 0,
            itemsCount: statsBeforeClose.itemsCount || 0
        };

        console.log('[ShiftService] closeShift completed successfully, returning stats:', finalStats);

        // Аудит: успешное закрытие смены
        // userId берём из снимка смены (поле user_id), потому что
        // closeShift() не принимает userId, а закрыть смену может
        // только тот, кто её открыл (по RLS).
        void AuditRepository.log({
            userId: shiftSnapshot?.user_id || null,
            action: AUDIT_ACTIONS.SHIFT_CLOSE,
            entityType: AUDIT_ENTITY_TYPES.SHIFT,
            entityId:
