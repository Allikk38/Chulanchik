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