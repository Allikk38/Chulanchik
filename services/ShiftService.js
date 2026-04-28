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
        if (!userId) {
            return { success: false, error: 'Пользователь не определён' };
        }

        if (shiftStore.isOpen()) {
            return { success: false, error: 'Смена уже открыта' };
        }

        const ok = await shiftStore.openShift(userId);

        if (!ok) {
            return { success: false, error: 'Не удалось открыть смену' };
        }

        return { success: true };
    },

    /**
     * Закрывает смену.
     * 
     * @returns {Promise<{success: boolean, error?: string, stats?: Object}>}
     */
    async closeShift() {
        if (!shiftStore.isOpen()) {
            return { success: false, error: 'Нет открытой смены' };
        }

        // Сохраняем статистику до закрытия — для ответа
        const stats = shiftStore.getStats();

        const ok = await shiftStore.closeShift();

        if (!ok) {
            return { success: false, error: 'Не удалось закрыть смену' };
        }

        return { success: true, stats };
    }
};

export default ShiftService;
