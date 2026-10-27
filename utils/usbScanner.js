// ============================================================
// utils/usbScanner.js
// ============================================================

/**
 * Глобальный слушатель HID-сканера штрихкодов.
 *
 * Сканер в режиме эмуляции клавиатуры вводит символы с очень
 * маленьким интервалом (< 50 мс) и завершает ввод Enter.
 *
 * Эвристика распознавания:
 *   - длина буфера > 4 символов;
 *   - средний интервал между символами < 50 мс;
 *   - завершающий символ — Enter.
 *
 * Если фокус находится в textarea или в обычном input (не в #searchInput),
 * скан игнорируется — чтобы не мешать ручному вводу.
 *
 * @module utils/usbScanner
 */

// ============================================================
// Константы
// ============================================================

const MAX_INTERVAL_MS = 50;      // макс. интервал между символами
const MIN_LENGTH = 4;            // минимальная длина штрихкода
const RESET_AFTER_MS = 300;      // сброс буфера, если долго нет ввода

// ============================================================
// Состояние
// ============================================================

const scannerState = {
    buffer: [],
    lastCharAt: 0,
    isActive: false,
    onScan: null,
    ignored: false,
    resetTimer: null
};

// ============================================================
// Проверка, куда направлен фокус
// ============================================================

/**
 * Игнорировать ли скан, если фокус в этом элементе.
 * Возвращает true, если сканирование надо подавить.
 *
 * @param {HTMLElement|null} activeEl
 * @returns {boolean}
 */
function shouldIgnoreTarget(activeEl) {
    if (!activeEl) return false;

    const tag = activeEl.tagName;

    // В textarea — игнорируем всегда
    if (tag === 'TEXTAREA') return true;

    // В обычном input (кроме #searchInput) — игнорируем,
    // чтобы не перехватывать ввод в формах.
    if (tag === 'INPUT') {
        const id = activeEl.id || '';
        const type = (activeEl.getAttribute('type') || 'text').toLowerCase();

        // Если это #searchInput — разрешаем сканер (там как раз удобно)
        if (id === 'searchInput') return false;

        // В input[type=text] вне поиска — игнорируем
        if (type === 'text' || type === 'search') return true;

        // В числовых полях, checkbox и т.п. — тоже игнорируем
        return true;
    }

    return false;
}

// ============================================================
// Обработчик клавиатуры
// ============================================================

function handleKeyDown(e) {
    if (!scannerState.isActive) return;

    const now = Date.now();
    const activeEl = document.activeElement;

    if (shouldIgnoreTarget(activeEl)) {
        // Сбрасываем буфер, чтобы не «склеивать» с ручным вводом
        resetBuffer();
        return;
    }

    const key = e.key;

    // Enter — завершение сканирования
    if (key === 'Enter') {
        if (scannerState.buffer.length >= MIN_LENGTH) {
            const barcode = scannerState.buffer.join('');
            const avgInterval = scannerState.buffer.length > 1
                ? (now - scannerState.lastCharAt) / scannerState.buffer.length
                : 0;

            // Проверяем, что это не медленный ручной ввод
            if (avgInterval < MAX_INTERVAL_MS || now - scannerState.lastCharAt < MAX_INTERVAL_MS * 2) {
                console.log('[usbScanner] scanned:', barcode);
                e.preventDefault();
                e.stopPropagation();

                if (typeof scannerState.onScan === 'function') {
                    try {
                        scannerState.onScan(barcode);
                    } catch (err) {
                        console.error('[usbScanner] onScan error:', err);
                    }
                }
                resetBuffer();
                return;
            }
        }
        resetBuffer();
        return;
    }

    // Только печатные символы
    if (key.length !== 1) return;

    // Если интервал слишком большой — начинаем новый буфер
    if (now - scannerState.lastCharAt > RESET_AFTER_MS) {
        scannerState.buffer = [];
    }

    scannerState.buffer.push(key);
    scannerState.lastCharAt = now;

    // Таймер автосброса
    clearTimeout(scannerState.resetTimer);
    scannerState.resetTimer = setTimeout(() => {
        resetBuffer();
    }, RESET_AFTER_MS);
}

function resetBuffer() {
    scannerState.buffer = [];
    scannerState.lastCharAt = 0;
    clearTimeout(scannerState.resetTimer);
    scannerState.resetTimer = null;
}

// ============================================================
// Публичный API
// ============================================================

/**
 * Инициализирует глобальный HID-сканер.
 *
 * @param {Object} options
 * @param {Function} options.onScan — callback(barcode), вызывается при успешном распознавании
 * @returns {Function} dispose — отписка
 */
export function init(options = {}) {
    const { onScan } = options;

    if (scannerState.isActive) {
        console.warn('[usbScanner] already initialized');
        scannerState.onScan = onScan || scannerState.onScan;
        return () => dispose();
    }

    scannerState.onScan = onScan;
    scannerState.isActive = true;
    scannerState.buffer = [];
    scannerState.lastCharAt = 0;

    // Слушаем keydown в capture-фазе, чтобы успеть раньше других обработчиков
    document.addEventListener('keydown', handleKeyDown, true);
    console.log('[usbScanner] initialized — HID scanner listener active');

    return () => dispose();
}

/**
 * Отключает слушатель.
 */
export function dispose() {
    if (!scannerState.isActive) return;
    document.removeEventListener('keydown', handleKeyDown, true);
    resetBuffer();
    scannerState.isActive = false;
    console.log('[usbScanner] disposed');
}

/**
 * Активен ли сканер.
 * @returns {boolean}
 */
export function isActive() {
    return scannerState.isActive;
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    init,
    dispose,
    isActive
};