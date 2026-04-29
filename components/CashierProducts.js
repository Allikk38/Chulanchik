// ============================================================
// components/CashierProducts.js
// ============================================================

/**
 * Компонент панели товаров для кассового модуля.
 *
 * Чистый UI. Отвечает за рендеринг сетки товаров,
 * бара смены, тулбара поиска и заглушки закрытой смены.
 *
 * @module components/CashierProducts
 */

import { formatMoney, getCategoryName, escapeHtml } from '../utils/formatters.js';
import { isScanSupported } from '../utils/BarcodeScanner.js';

// ============================================================
// Внешние зависимости (внедряются контроллером)
// ============================================================

let productStoreRef = null;
let cartStoreRef = null;
let shiftStoreRef = null;
let stateRef = null;

/**
 * Устанавливает ссылки на сторы и состояние.
 *
 * @param {Object} deps
 * @param {Object} deps.productStore
 * @param {Object} deps.cartStore
 * @param {Object} deps.shiftStore
 * @param {Object} deps.state — объект состояния контроллера
 */
export function initProducts({ productStore, cartStore, shiftStore, state }) {
    productStoreRef = productStore;
    cartStoreRef = cartStore;
    shiftStoreRef = shiftStore;
    stateRef = state;
}

// ============================================================
// Хелпер
// ============================================================

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}

// ============================================================
// Рендеринг — экран закрытой смены
// ============================================================

/**
 * Рендерит экран закрытой смены.
 *
 * @returns {string} HTML
 */
export function renderClosedShift() {
    return `
        <div class="cashier-layout shift-closed-mode">
            <div class="shift-closed-overlay">
                <div class="shift-closed-icon">--</div>
                <h2>Смена закрыта</h2>
                <p>Для начала работы откройте смену</p>
                <button class="btn-primary btn-lg" id="openShiftBtn"
                    ${shiftStoreRef.isPending() ? 'disabled' : ''}>
                    ${shiftStoreRef.isPending() ? 'Открытие...' : 'Открыть смену'}
                </button>
            </div>
        </div>`;
}

// ============================================================
// Рендеринг — бар смены
// ============================================================

/**
 * Рендерит бар статистики открытой смены.
 *
 * @returns {string} HTML
 */
export function renderShiftBar() {
    const stats = shiftStoreRef.getStats();
    const revenue = formatMoney(stats.revenue);
    const profit = formatMoney(stats.profit);
    const salesCount = stats.salesCount;

    return `
        <div class="shift-bar">
            <div class="shift-status">
                <span class="status-dot"></span>
                <span>Смена открыта</span>
            </div>
            <div class="shift-stats">
                <div class="stat-item">
                    <span class="stat-label">Продаж</span>
                    <span class="stat-value">${salesCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Выручка</span>
                    <span class="stat-value">${revenue}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Прибыль</span>
                    <span class="stat-value">${profit}</span>
                </div>
            </div>
            <button class="btn-danger btn-sm" id="closeShiftBtn"
                ${shiftStoreRef.isPending() ? 'disabled' : ''}>
                ${shiftStoreRef.isPending() ? 'Закрытие...' : 'Закрыть смену'}
            </button>
        </div>`;
}

// ============================================================
// Рендеринг — тулбар
// ============================================================

/**
 * Рендерит тулбар поиска и категорий.
 *
 * @returns {string} HTML
 */
export function renderToolbar() {
    const showScanner = isScanSupported();

    return `
        <div class="products-toolbar">
            <div class="toolbar-left">
                <div class="search-wrapper">
                    <input type="text" id="searchInput" class="search-input"
                        placeholder="Поиск или сканирование..."
                        value="${escapeHtml(stateRef.searchQuery)}"
                        ${stateRef.isScanning ? 'disabled' : ''}>
                </div>
                ${showScanner ? `
                    <button class="btn-secondary btn-sm" id="scanBtn"
                        title="Сканировать штрихкод"
                        ${stateRef.isScanning ? 'disabled' : ''}>
                        ${stateRef.isScanning ? 'Скан...' : 'Скан'}
                    </button>
                ` : ''}
                <button class="btn-secondary btn-sm" id="quickAddBtn" title="Быстрое добавление">
                    + Быстрый товар
                </button>
            </div>
            <div class="toolbar-right">
                ${(stateRef.searchQuery || stateRef.selectedCategory) ? `
                    <button class="btn-ghost btn-sm" id="resetFiltersBtn">Сбросить</button>
                ` : ''}
            </div>
        </div>
        <div class="category-bar">
            <button class="category-tab ${!stateRef.selectedCategory ? 'active' : ''}" data-category="">
                Все (${productStoreRef.getInStock().length})
            </button>
            ${productStoreRef.getCategories().map(c => `
                <button class="category-tab ${stateRef.selectedCategory === c.value ? 'active' : ''}"
                    data-category="${c.value}">
                    ${getCategoryName(c.value)} (${c.count})
                </button>
            `).join('')}
        </div>`;
}

// ============================================================
// Рендеринг — сетка товаров
// ============================================================

/**
 * Рендерит сетку товаров.
 *
 * @returns {string} HTML
 */
export function renderProductGrid() {
    let products = stateRef.selectedCategory
        ? productStoreRef.getByCategory(stateRef.selectedCategory)
        : productStoreRef.getInStock();

    if (stateRef.searchQuery) {
        const q = stateRef.searchQuery.toLowerCase();
        products = products.filter(p =>
            p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
        );
    }

    if (productStoreRef.isLoading() && products.length === 0) {
        return '<div class="loading-spinner"></div>';
    }

    if (products.length === 0) {
        return `<div class="empty-state">${stateRef.searchQuery || stateRef.selectedCategory
            ? 'Ничего не найдено'
            : 'Нет товаров в наличии'}</div>`;
    }

    const cartItemIds = new Set(cartStoreRef.getItems().map(i => i.id));

    return `
        <div class="products-grid">
            ${products.map(p => {
                const inCart = cartItemIds.has(p.id);
                return `
                <div class="product-card ${inCart ? 'in-cart' : ''}" data-id="${p.id}">
                    <div class="product-photo">
                        ${p.photo_url
                            ? `<img src="${escapeAttr(p.photo_url)}" alt="" loading="lazy">`
                            : '<span class="photo-placeholder">Фото</span>'}
                    </div>
                    <div class="product-info">
                        <div class="product-name">${escapeHtml(p.name)}</div>
                        <div class="product-price">${formatMoney(p.price)}</div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    initProducts,
    renderClosedShift,
    renderShiftBar,
    renderToolbar,
    renderProductGrid
};
