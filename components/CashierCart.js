// ============================================================
// components/CashierCart.js
// ============================================================

/**
 * Компонент корзины для кассового модуля.
 *
 * Чистый UI. Отвечает за рендеринг панели корзины,
 * мобильной кнопки-триггера и поведение slide-in панели.
 *
 * @module components/CashierCart
 */

import { formatMoney } from '../utils/formatters.js';
import { escapeHtml } from '../utils/formatters.js';

// ============================================================
// Внешние зависимости (внедряются контроллером)
// ============================================================

/** @type {Object} ссылки на cartStore и DOM.content */
let cartStoreRef = null;
let contentRef = null;

/**
 * Устанавливает ссылки на стор корзины и DOM-элемент контента.
 *
 * @param {Object} deps
 * @param {Object} deps.cartStore — экземпляр CartStore
 * @param {HTMLElement} deps.content — DOM-элемент #cashierContent
 */
export function initCart({ cartStore, content }) {
    cartStoreRef = cartStore;
    contentRef = content;
}

// ============================================================
// Хелперы
// ============================================================

function isMobile() {
    return window.innerWidth <= 768;
}

// ============================================================
// Рендеринг панели корзины
// ============================================================

/**
 * Рендерит HTML-строку содержимого панели корзины.
 *
 * @returns {string} HTML
 */
export function renderCartPanelContent() {
    const items = cartStoreRef.getItems();
    const total = cartStoreRef.getTotal();
    const count = cartStoreRef.getCount();

    const itemsHtml = items.length === 0
        ? '<div class="cart-empty">Корзина пуста</div>'
        : items.map(item => `
            <div class="cart-item">
                <div class="cart-item-main">
                    <div class="cart-item-info">
                        <span class="cart-item-name">${escapeHtml(item.name)}</span>
                    </div>
                    <div class="cart-item-actions">
                        <div class="quantity-control">
                            <button class="btn-qty" data-action="decrease" data-id="${item.id}">-</button>
                            <span class="qty-input">${item.quantity}</span>
                            <button class="btn-qty" data-action="increase" data-id="${item.id}">+</button>
                        </div>
                        <span class="item-total">${formatMoney(cartStoreRef.getItemTotal(item.id))}</span>
                        <button class="btn-remove" data-action="remove" data-id="${item.id}">x</button>
                    </div>
                </div>
            </div>
        `).join('');

    return `
        <div class="cart-header">
            <h3>Корзина</h3>
            <span class="cart-count">${count} поз.</span>
            ${items.length > 0 ? '<button class="btn-ghost btn-sm" id="clearCartBtn">Очистить</button>' : ''}
        </div>
        <div class="cart-items-container">
            <div class="cart-items">${itemsHtml}</div>
        </div>
        <div class="cart-footer">
            <div class="cart-summary">
                <div class="summary-row total">
                    <span>ИТОГО</span>
                    <span class="total-amount">${formatMoney(total)}</span>
                </div>
            </div>
            <button class="btn-checkout" id="checkoutBtn" ${count === 0 ? 'disabled' : ''}>
                Оформить продажу (F9)
            </button>
            <div class="keyboard-hints">
                <kbd>F9</kbd> — оформить
                <kbd>Ctrl</kbd>+<kbd>F</kbd> — поиск
            </div>
        </div>`;
}

// ============================================================
// Мобильная корзина
// ============================================================

/**
 * Рендерит мобильную кнопку-триггер корзины и оверлей.
 * Вызывается при каждом рендере.
 */
export function renderMobileCartTrigger() {
    // Удаляем старые элементы
    document.getElementById('cartToggleBtn')?.remove();
    document.getElementById('cartOverlay')?.remove();

    if (!isMobile()) return;

    const count = cartStoreRef.getCount();
    const total = cartStoreRef.getTotal();

    const overlay = document.createElement('div');
    overlay.id = 'cartOverlay';
    overlay.className = 'cart-overlay';
    overlay.addEventListener('click', closeCart);
    contentRef.appendChild(overlay);

    const btn = document.createElement('button');
    btn.id = 'cartToggleBtn';
    btn.className = 'cart-toggle-btn';
    btn.innerHTML = getMobileCartTriggerHTML(count, total);
    btn.addEventListener('click', toggleCart);
    contentRef.appendChild(btn);
}

/**
 * Возвращает HTML-строку для содержимого мобильной кнопки корзины.
 * Используется также при обновлении кнопки без пересоздания DOM.
 *
 * @param {number} count
 * @param {number} total
 * @returns {string}
 */
export function getMobileCartTriggerHTML(count, total) {
    return `
        Корзина
        <span class="cart-toggle-badge" id="cartToggleBadge">${count}</span>
        -
        <span>${formatMoney(total)}</span>
    `;
}

/**
 * Обновляет мобильную кнопку корзины без пересоздания DOM.
 */
export function updateMobileCartTrigger() {
    const toggleBtn = document.getElementById('cartToggleBtn');
    if (!toggleBtn) return;

    const count = cartStoreRef.getCount();
    const total = cartStoreRef.getTotal();
    toggleBtn.innerHTML = getMobileCartTriggerHTML(count, total);
}

/**
 * Открывает/закрывает мобильную панель корзины.
 */
export function toggleCart() {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    if (overlay) {
        overlay.style.display = isOpen ? 'block' : 'none';
    }
}

/**
 * Закрывает мобильную панель корзины.
 */
export function closeCart() {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    initCart,
    renderCartPanelContent,
    renderMobileCartTrigger,
    getMobileCartTriggerHTML,
    updateMobileCartTrigger,
    toggleCart,
    closeCart
};
