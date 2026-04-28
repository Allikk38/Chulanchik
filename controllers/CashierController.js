// ============================================================
// controllers/CashierController.js
// ============================================================

/**
 * Контроллер страницы кассы.
 *
 * Подписан на productStore, cartStore, shiftStore.
 * Управляет сменой, корзиной, поиском и оформлением продаж.
 *
 * @module controllers/CashierController
 */

import { requireAuth, hasPermission, logout } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import { cartStore } from '../stores/CartStore.js';
import { shiftStore } from '../stores/ShiftStore.js';
import SaleService from '../services/SaleService.js';
import ShiftService from '../services/ShiftService.js';
import { formatMoney, getCategoryName, debounce } from '../utils/formatters.js';
import { showNotification, showPaymentModal, showConfirmDialog } from '../utils/ui.js';
import { openProductFormModal } from '../components/ProductForm.js';
import { startBarcodeScan, isScanSupported } from '../utils/BarcodeScanner.js';

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    searchQuery: '',
    selectedCategory: null,
    isScanning: false
};

// ============================================================
// DOM-элементы
// ============================================================

const DOM = {
    content: null,
    userEmail: null,
    logoutBtn: null
};

// ============================================================
// Рендеринг
// ============================================================

function render() {
    if (!DOM.content) return;

    if (!shiftStore.isOpen()) {
        renderClosedShift();
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const cartPanelClass = isMobile ? 'cart-panel cart-panel-mobile' : 'cart-panel';

    DOM.content.innerHTML = `
        <div class="cashier-layout">
            <div class="products-panel">
                ${renderShiftBar()}
                ${renderToolbar()}
                <div class="products-grid-container" id="productsGridContainer">
                    ${renderProductGrid()}
                </div>
            </div>
            <div class="${cartPanelClass}" id="cartPanel">
                ${renderCartPanelContent()}
            </div>
        </div>`;

    bindEvents();
    updateFabVisibility();
    renderMobileCartTrigger();
}

function renderClosedShift() {
    document.getElementById('cartToggleBtn')?.remove();
    document.getElementById('cartOverlay')?.remove();
    document.getElementById('fabQuickAdd')?.remove();

    DOM.content.innerHTML = `
        <div class="cashier-layout shift-closed-mode">
            <div class="shift-closed-overlay">
                <div class="shift-closed-icon">--</div>
                <h2>Смена закрыта</h2>
                <p>Для начала работы откройте смену</p>
                <button class="btn-primary btn-lg" id="openShiftBtn"
                    ${shiftStore.isPending() ? 'disabled' : ''}>
                    ${shiftStore.isPending() ? 'Открытие...' : 'Открыть смену'}
                </button>
            </div>
        </div>`;

    document.getElementById('openShiftBtn')?.addEventListener('click', async () => {
        console.log('[Cashier] openShift button clicked');
        const { success, error } = await ShiftService.openShift(state.user?.id);
        if (success) {
            showNotification('Смена открыта', 'success');
            console.log('[Cashier] shift opened successfully');
        } else {
            console.error('[Cashier] shift open failed:', error);
            showNotification(error || 'Ошибка открытия смены', 'error');
        }
        render();
    });
}

function renderShiftBar() {
    const stats = shiftStore.getStats();
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
                ${shiftStore.isPending() ? 'disabled' : ''}>
                ${shiftStore.isPending() ? 'Закрытие...' : 'Закрыть смену'}
            </button>
        </div>`;
}

function renderToolbar() {
    const showScanner = isScanSupported();

    return `
        <div class="products-toolbar">
            <div class="toolbar-left">
                <div class="search-wrapper">
                    <input type="text" id="searchInput" class="search-input"
                        placeholder="Поиск или сканирование..."
                        value="${escapeHtml(state.searchQuery)}"
                        ${state.isScanning ? 'disabled' : ''}>
                </div>
                ${showScanner ? `
                    <button class="btn-secondary btn-sm" id="scanBtn"
                        title="Сканировать штрихкод"
                        ${state.isScanning ? 'disabled' : ''}>
                        ${state.isScanning ? 'Скан...' : 'Скан'}
                    </button>
                ` : ''}
                <button class="btn-secondary btn-sm" id="quickAddBtn" title="Быстрое добавление">
                    + Быстрый товар
                </button>
            </div>
            <div class="toolbar-right">
                ${(state.searchQuery || state.selectedCategory) ? `
                    <button class="btn-ghost btn-sm" id="resetFiltersBtn">Сбросить</button>
                ` : ''}
            </div>
        </div>
        <div class="category-bar">
            <button class="category-tab ${!state.selectedCategory ? 'active' : ''}" data-category="">
                Все (${productStore.getInStock().length})
            </button>
            ${productStore.getCategories().map(c => `
                <button class="category-tab ${state.selectedCategory === c.value ? 'active' : ''}"
                    data-category="${c.value}">
                    ${getCategoryName(c.value)} (${c.count})
                </button>
            `).join('')}
        </div>`;
}

function renderProductGrid() {
    let products = state.selectedCategory
        ? productStore.getByCategory(state.selectedCategory)
        : productStore.getInStock();

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        products = products.filter(p =>
            p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
        );
    }

    if (productStore.isLoading() && products.length === 0) {
        return '<div class="loading-spinner"></div>';
    }

    if (products.length === 0) {
        return `<div class="empty-state">${state.searchQuery || state.selectedCategory
            ? 'Ничего не найдено'
            : 'Нет товаров в наличии'}</div>`;
    }

    const cartItemIds = new Set(cartStore.getItems().map(i => i.id));

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

function renderCartPanelContent() {
    const items = cartStore.getItems();
    const total = cartStore.getTotal();
    const count = cartStore.getCount();

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
                        <span class="item-total">${formatMoney(cartStore.getItemTotal(item.id))}</span>
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

function isMobile() {
    return window.innerWidth <= 768;
}

function renderMobileCartTrigger() {
    document.getElementById('cartToggleBtn')?.remove();
    document.getElementById('cartOverlay')?.remove();

    if (!isMobile()) return;

    const count = cartStore.getCount();
    const total = cartStore.getTotal();

    const overlay = document.createElement('div');
    overlay.id = 'cartOverlay';
    overlay.className = 'cart-overlay';
    overlay.addEventListener('click', closeCart);
    DOM.content.appendChild(overlay);

    const btn = document.createElement('button');
    btn.id = 'cartToggleBtn';
    btn.className = 'cart-toggle-btn';
    btn.innerHTML = `
        Корзина
        <span class="cart-toggle-badge" id="cartToggleBadge">${count}</span>
        ·
        <span>${formatMoney(total)}</span>
    `;
    btn.addEventListener('click', toggleCart);
    DOM.content.appendChild(btn);
}

function toggleCart() {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    if (overlay) {
        overlay.style.display = isOpen ? 'block' : 'none';
    }
}

function closeCart() {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
}

// ============================================================
// FAB кнопка (мобильные)
// ============================================================

function updateFabVisibility() {
    let fab = document.getElementById('fabQuickAdd');

    if (!fab) {
        fab = document.createElement('button');
        fab.id = 'fabQuickAdd';
        fab.className = 'fab-add-product';
        fab.title = 'Быстрый товар';
        fab.textContent = '+';
        fab.addEventListener('click', quickAdd);
        document.body.appendChild(fab);
    }

    fab.style.display = isMobile() ? 'flex' : 'none';
}

// ============================================================
// Сканирование штрихкода
// ============================================================

async function startScan() {
    if (state.isScanning) return;

    state.isScanning = true;
    render();

    try {
        showNotification('Наведите камеру на штрихкод', 'info', { duration: 2000 });

        const barcode = await startBarcodeScan();

        state.searchQuery = barcode;
        state.selectedCategory = null;

        const products = productStore.getInStock().filter(p =>
            p.name?.toLowerCase().includes(barcode.toLowerCase()) ||
            p.id?.toLowerCase().includes(barcode.toLowerCase())
        );

        if (products.length === 1) {
            cartStore.addItem(products[0]);
            showNotification(`"${products[0].name}" добавлен в корзину`, 'success');
            state.searchQuery = '';
        } else if (products.length > 1) {
            showNotification(`Найдено ${products.length} товаров`, 'info');
        } else {
            const product = productStore.getById(barcode);
            if (product && product.status === 'in_stock') {
                cartStore.addItem(product);
                showNotification(`"${product.name}" добавлен в корзину`, 'success');
                state.searchQuery = '';
            } else {
                showNotification('Товар не найден', 'warning');
            }
        }

    } catch (err) {
        if (err.message !== 'Время сканирования истекло') {
            showNotification(err.message || 'Ошибка сканирования', 'error');
        }
    } finally {
        state.isScanning = false;
        render();
    }
}

// ============================================================
// Действия
// ============================================================

async function checkout() {
    if (cartStore.isEmpty()) return;

    const total = cartStore.getTotal();
    const method = await showPaymentModal(total);
    if (!method) return;

    const { success, error } = await SaleService.checkout({
        paymentMethod: method,
        userId: state.user?.id
    });

    if (success) {
        closeCart();
        showNotification(`Продажа на ${formatMoney(total)} оформлена`, 'success');
    } else {
        showNotification(error || 'Ошибка оформления', 'error');
    }
}

async function quickAdd() {
    if (!hasPermission('products:create')) {
        showNotification('Недостаточно прав', 'error');
        return;
    }

    const result = await openProductFormModal({
        mode: 'create',
        userId: state.user?.id
    });

    if (result) {
        cartStore.addItem(result);
        showNotification(`"${result.name}" добавлен в корзину`, 'success');
    }
}

async function closeShift() {
    console.log('[Cashier] closeShift() called');

    const stats = shiftStore.getStats();
    console.log('[Cashier] current shift stats:', stats);

    if (!shiftStore.isOpen()) {
        console.log('[Cashier] no open shift found');
        showNotification('Нет открытой смены', 'warning');
        return;
    }

    const confirmed = await showConfirmDialog({
        title: 'Закрытие смены',
        message: [
            `Выручка: ${formatMoney(stats.revenue)}`,
            `Продаж: ${stats.salesCount}`,
            `Прибыль: ${formatMoney(stats.profit)}`,
            `Товаров продано: ${stats.itemsCount}`,
            '',
            'Закрыть смену?'
        ].join('\n'),
        confirmText: 'Закрыть смену',
        confirmClass: 'btn-danger'
    });

    if (!confirmed) {
        console.log('[Cashier] user cancelled shift close');
        return;
    }

    console.log('[Cashier] calling ShiftService.closeShift()...');

    const result = await ShiftService.closeShift();

    console.log('[Cashier] ShiftService.closeShift() result:', result);

    if (result.success) {
        cartStore.reset();

        const successMsg = [
            `Выручка: ${formatMoney(result.stats.revenue)}`,
            `Продаж: ${result.stats.salesCount}`,
            `Прибыль: ${formatMoney(result.stats.profit)}`
        ].join(' | ');

        console.log('[Cashier] shift closed successfully:', successMsg);

        showNotification(
            successMsg,
            'success',
            { title: 'Смена закрыта', duration: 6000 }
        );
    } else {
        console.error('[Cashier] shift close failed:', result.error);
        showNotification(result.error || 'Не удалось закрыть смену', 'error');
    }

    render();
}

// ============================================================
// События
// ============================================================

function bindEvents() {
    document.getElementById('closeShiftBtn')?.addEventListener('click', closeShift);

    document.getElementById('clearCartBtn')?.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
            title: 'Очистка корзины',
            message: `Удалить все товары (${cartStore.getCount()} поз.) из корзины?`,
            confirmText: 'Очистить',
            confirmClass: 'btn-danger'
        });
        if (confirmed) cartStore.reset();
    });

    document.getElementById('checkoutBtn')?.addEventListener('click', checkout);

    document.getElementById('quickAddBtn')?.addEventListener('click', quickAdd);

    document.getElementById('scanBtn')?.addEventListener('click', startScan);

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        state.searchQuery = '';
        state.selectedCategory = null;
        render();
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debounced = debounce((val) => {
            state.searchQuery = val;
            render();
        }, 300);
        searchInput.addEventListener('input', e => debounced(e.target.value));
        setTimeout(() => searchInput.focus(), 100);
    }

    document.querySelectorAll('[data-category]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedCategory = btn.dataset.category || null;
            render();
        });
    });

    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const product = productStore.getById(card.dataset.id);
            if (product && product.status === 'in_stock') {
                cartStore.addItem(product);
            }
        });
    });

    document.querySelectorAll('[data-action="increase"]').forEach(btn => {
        btn.addEventListener('click', () => cartStore.updateQuantity(btn.dataset.id, 1));
    });
    document.querySelectorAll('[data-action="decrease"]').forEach(btn => {
        btn.addEventListener('click', () => cartStore.updateQuantity(btn.dataset.id, -1));
    });
    document.querySelectorAll('[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', () => cartStore.removeItem(btn.dataset.id));
    });
}

// ============================================================
// Подписки на сторы
// ============================================================

function onStoreChange() {
    render();

    const badge = document.getElementById('cartToggleBadge');
    if (badge) {
        badge.textContent = cartStore.getCount();
    }
    const toggleBtn = document.getElementById('cartToggleBtn');
    if (toggleBtn) {
        const total = cartStore.getTotal();
        const count = cartStore.getCount();
        toggleBtn.innerHTML = `
            Корзина
            <span class="cart-toggle-badge" id="cartToggleBadge">${count}</span>
            ·
            <span>${formatMoney(total)}</span>
        `;
    }

    updateFabVisibility();
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('cashierContent');
    DOM.userEmail = document.getElementById('userEmail');
    DOM.logoutBtn = document.getElementById('logoutBtn');
}

function bindGlobalEvents() {
    DOM.logoutBtn?.addEventListener('click', logout);

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput')?.focus();
        }
        if (e.key === 'F9') {
            e.preventDefault();
            if (!cartStore.isEmpty()) checkout();
        }
    });

    productStore.on('change', onStoreChange);
    cartStore.on('change', onStoreChange);
    shiftStore.on('change', onStoreChange);

    window.addEventListener('resize', () => {
        updateFabVisibility();
        render();
    });
}

async function init() {
    cacheDom();

    const { user, authError } = await requireAuth();
    if (authError || !user) {
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;

    if (DOM.userEmail) {
        DOM.userEmail.textContent = user.fullName || user.email?.split('@')[0] || 'Пользователь';
    }

    bindGlobalEvents();

    cartStore.loadFromCache();

    await shiftStore.checkOpenShift(user.id);

    await productStore.loadProducts();

    render();
}

// ============================================================
// Хелперы
// ============================================================

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);