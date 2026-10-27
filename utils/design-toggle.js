// utils/design-toggle.js
// Переключатель второго дизайна. Удалить этот файл — и всё вернётся к v1.

const DESIGN_KEY = 'chulanchik_design';
const V2_HREF = 'css/design-v2.css';
const V2_ID = 'design-v2-stylesheet';

/**
 * Возвращает текущий дизайн: 'v1' | 'v2'
 */
export function getDesign() {
    return localStorage.getItem(DESIGN_KEY) === 'v2' ? 'v2' : 'v1';
}

/**
 * Подключает/отключает design-v2.css и сохраняет выбор.
 * @param {'v1'|'v2'} version
 */
export function setDesign(version) {
    if (version === 'v2') {
        localStorage.setItem(DESIGN_KEY, 'v2');
        enableV2();
    } else {
        localStorage.removeItem(DESIGN_KEY);
        disableV2();
    }
    // Сообщаем подписчикам (для UI-переключателя)
    window.dispatchEvent(new CustomEvent('designchange', { detail: { version } }));
}

function enableV2() {
    if (document.getElementById(V2_ID)) return;
    const link = document.createElement('link');
    link.id = V2_ID;
    link.rel = 'stylesheet';
    link.href = V2_HREF;
    document.head.appendChild(link);
}

function disableV2() {
    document.getElementById(V2_ID)?.remove();
}

/**
 * Вызывается при загрузке страницы. Если пользователь выбрал v2 —
 * подключает его сразу.
 */
export function initDesign() {
    if (getDesign() === 'v2') enableV2();
}

// ============================================================
// UI-переключатель (страница входа)
// ============================================================

/**
 * Возвращает HTML-разметку переключателя оформления.
 * Две кнопки-таба: «Стандарт» / «Компакт».
 *
 * @returns {string}
 */
export function renderDesignToggle() {
    const current = getDesign();
    return `
        <div class="design-toggle" id="designToggle" role="radiogroup" aria-label="Оформление">
            <button type="button" class="design-toggle-option ${current === 'v1' ? 'active' : ''}"
                data-design="v1" role="radio" aria-checked="${current === 'v1'}">Стандарт</button>
            <button type="button" class="design-toggle-option ${current === 'v2' ? 'active' : ''}"
                data-design="v2" role="radio" aria-checked="${current === 'v2'}">Компакт</button>
        </div>`;
}

/**
 * Вешает обработчики на переключатель. Вызывать после вставки
 * renderDesignToggle() в DOM.
 *
 * @param {Function} [onChange] — вызывается с 'v1' | 'v2' после смены
 */
export function bindDesignToggle(onChange) {
    const root = document.getElementById('designToggle');
    if (!root) return;

    root.querySelectorAll('.design-toggle-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const version = btn.dataset.design;
            if (!version || version === getDesign()) return;
            setDesign(version);

            root.querySelectorAll('.design-toggle-option').forEach(b => {
                const active = b.dataset.design === version;
                b.classList.toggle('active', active);
                b.setAttribute('aria-checked', String(active));
            });

            if (typeof onChange === 'function') onChange(version);
        });
    });
}