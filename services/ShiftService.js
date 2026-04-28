// ============================================================
// services/ShiftService.js
// ============================================================

/**
 * Сервис смен.
 * 
 * Бизнес-логика открытия/закрытия смены.
 * Не зависит от UI.
 * 
 * @module services/ShiftService
 */

import { shiftStore } from '../stores/ShiftStore.js';

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

        const stats = shiftStore.getStats();
        console.log('[ShiftService] current stats before close:', stats);

        console.log('[ShiftService] calling shiftStore.closeShift()...');

        const ok = await shiftStore.closeShift();

        if (!ok) {
            console.error('[ShiftService] closeShift failed: shiftStore.closeShift returned false');
            return { success: false, error: 'Не удалось закрыть смену' };
        }

        console.log('[ShiftService] closeShift completed successfully, returning stats:', stats);
        return { success: true, stats };
    }
};

export default ShiftService;