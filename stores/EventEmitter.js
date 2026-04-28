// ============================================================
// stores/EventEmitter.js
// ============================================================

/**
 * Простейшая реализация Observer Pattern.
 * 
 * Не тянет зависимостей. Используется как базовый класс
 * для всех сторов (ProductStore, CartStore, ShiftStore, AuthStore).
 * 
 * @module stores/EventEmitter
 */

export class EventEmitter {
    /** @type {Map<string, Function[]>} */
    #listeners = new Map();

    /**
     * Подписаться на событие.
     * Возвращает функцию отписки.
     * 
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    on(event, callback) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, []);
        }
        this.#listeners.get(event).push(callback);

        return () => this.off(event, callback);
    }

    /**
     * Отписаться от события.
     * 
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const cbs = this.#listeners.get(event);
        if (!cbs) return;
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
    }

    /**
     * Вызвать событие с данными.
     * 
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
        const cbs = this.#listeners.get(event);
        if (!cbs) return;
        // Копируем массив — если колбэк отпишется внутри вызова, не сломаем цикл
        [...cbs].forEach(fn => {
            try { fn(data); } catch (e) { /* не роняем */ }
        });
    }
}

export default EventEmitter;
