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

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    searchQuery: '',
    selectedCategory: null
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

    DOM.content.innerHTML = `
        <div class="cashier-layout">
            <div class="products-panel">
                ${renderShiftBar()}
                ${renderToolbar()}
                <div class="products-grid-container" id="productsGridContainer">
                    ${renderProductGrid()}
                </div>
            </div>
            ${renderCartPanel()}
        </div>`;

    bindEvents();
    renderMobileCartTrigger();
}

function renderClosedShift() {
    // Убираем мобильные элементы корзины
    document.getElementById('cartToggleBtn')?.remove();
    document.getElementById('cartOverlay')?.remove();

    DOM.content.innerHTML = `
        <div class="cashier-layout shift-closed-mode">
            <div class="shift-closed-overlay">
                <div class="shift-closed-icon">Закрыто</div>
                <h2>Смена закрыта</h2>
                <p>Для начала работы откройте смену</p>
                <button class="btn-primary btn-lg" id="openShiftBtn"
                    ${shiftStore.isPending() ? 'disabled' : ''}>
                    ${shiftStore.isPending() ? 'Открытие...' : 'Открыть смену'}
                </button>
            </div>
        </div>`;

    document.getElementById('openShiftBtn')?.addEventListener('click', async () => {
        const { success, error } = await ShiftService.openShift(state.user?.id);
        if (success) {
            showNotification('Смена открыта', 'success');
        } else {
            showNotification(error || 'Ошибка открытия смены', 'error');
        }
        render();
    });
}

function renderShiftBar() {
    const stats = shiftStore.getStats();
    return `
        <div class="shift-bar">
            <div class="shift-status">
                <span class="status-dot"></span>
                <span>Смена открыта</span>
            </div>
            <div class="shift-stats">
                <div class="stat-item">
                    <span class="stat-label">Выручка</span>
                    <span class="stat-value">${formatMoney(stats.revenue)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Продаж</span>
                    <span class="stat-value">${stats.salesCount}</span>
                </div>
            </div>
            <button class="btn-secondary btn-sm" id="closeShiftBtn"
                ${shiftStore.isPending() ? 'disabled' : ''}>
                Закрыть смену
            </button>
        </div>`;
}

function renderToolbar() {
    const cats = productStore.getCategories();
    return `
        <div class="products-toolbar">
            <div class="toolbar-left">
                <div class="search-wrapper">
                    <input type="text" id="searchInput" class="search-input"
                        placeholder="Поиск или сканирование..."
                        value="${escapeHtml(state.searchQuery)}">
                </div>
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
            ${cats.map(c => `
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

    // Определяем, какие товары уже в корзине
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

function renderCartPanel() {
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
                        <button class="btn-remove" data-action="remove" data-id="${item.id}">&#10005;</button>
                    </div>
                </div>
            </div>
        `).join('');

    return `
        <div class="cart-panel">
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
            </div>
        </div>`;
}

// ============================================================
// Мобильная корзина
// ============================================================

function renderMobileCartTrigger() {
    // Удаляем старые элементы если есть
    document.getElementById('cartToggleBtn')?.remove();
    document.getElementById('cartOverlay')?.remove();

    const count = cartStore.getCount();
    const total = cartStore.getTotal();

    // Оверлей
    const overlay = document.createElement('div');
    overlay.id = 'cartOverlay';
    overlay.className = 'cart-overlay';
    overlay.addEventListener('click', closeCart);
    DOM.content.appendChild(overlay);

    // Кнопка-триггер
    const btn = document.createElement('button');
    btn.id = 'cartToggleBtn';
    btn.className = 'cart-toggle-btn';
    btn.innerHTML = `
        Корзина
        <span class="cart-toggle-badge" id="cartToggleBadge">${count}</span>
        &middot;
        <span>${formatMoney(total)}</span>
    `;
    btn.addEventListener('click', toggleCart);
    DOM.content.appendChild(btn);
}

function toggleCart() {
    const panel = document.querySelector('.cart-panel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    if (overlay) {
        overlay.style.display = isOpen ? 'block' : 'none';
    }
}

function closeCart() {
    const panel = document.querySelector('.cart-panel');
    const overlay = document.getElementById('cartOverlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.style.display = 'none';
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
        // Закрываем корзину на мобильных после продажи
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
    const stats = shiftStore.getStats();
    const confirmed = await showConfirmDialog({
        title: 'Закрытие смены',
        message: `Выручка: ${formatMoney(stats.revenue)}\nПродаж: ${stats.salesCount}\nПрибыль: ${formatMoney(stats.profit)}\n\nЗакрыть смену?`,
        confirmText: 'Закрыть',
        confirmClass: 'btn-primary'
    });

    if (!confirmed) return;

    const { success, error } = await ShiftService.closeShift();
    if (success) {
        cartStore.reset();
        showNotification('Смена закрыта', 'success');
    } else {
        showNotification(error || 'Ошибка закрытия смены', 'error');
    }
    render();
}

// ============================================================
// События
// ============================================================

function bindEvents() {
    // Смена
    document.getElementById('closeShiftBtn')?.addEventListener('click', closeShift);

    // Корзина: очистить
    document.getElementById('clearCartBtn')?.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
            title: 'Очистка корзины',
            message: `Удалить все товары (${cartStore.getCount()} поз.) из корзины?`,
            confirmText: 'Очистить',
            confirmClass: 'btn-danger'
        });
        if (confirmed) cartStore.reset();
    });

    // Корзина: чекаут
    document.getElementById('checkoutBtn')?.addEventListener('click', checkout);

    // Быстрое добавление
    document.getElementById('quickAddBtn')?.addEventListener('click', quickAdd);

    // Сброс фильтров
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        state.searchQuery = '';
        state.selectedCategory = null;
        render();
    });

    // Поиск
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debounced = debounce((val) => {
            state.searchQuery = val;
            render();
        }, 300);
        searchInput.addEventListener('input', e => debounced(e.target.value));
        searchInput.focus();
    }

    // Категории
    document.querySelectorAll('[data-category]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedCategory = btn.dataset.category || null;
            render();
        });
    });

    // Карточки товаров
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const product = productStore.getById(card.dataset.id);
            if (product && product.status === 'in_stock') {
                cartStore.addItem(product);
            }
        });
    });

    // Кнопки в корзине
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
    // Обновляем бейдж и сумму на кнопке-триггере без полного ререндера
    const badge = document.getElementById('cartToggleBadge');
    if (badge) {
        badge.textContent = cartStore.getCount();
    }
    // Обновляем сумму в кнопке-триггере
    const toggleBtn = document.getElementById('cartToggleBtn');
    if (toggleBtn) {
        const total = cartStore.getTotal();
        const count = cartStore.getCount();
        toggleBtn.innerHTML = `
            Корзина
            <span class="cart-toggle-badge" id="cartToggleBadge">${count}</span>
            &middot;
            <span>${formatMoney(total)}</span>
        `;
    }
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

    // Горячие клавиши
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

    // Подписки на сторы — при любом изменении перерендериваем
    productStore.on('change', onStoreChange);
    cartStore.on('change', onStoreChange);
    shiftStore.on('change', onStoreChange);
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

    // Восстанавливаем корзину из кэша
    cartStore.loadFromCache();

    // Проверяем смену
    await shiftStore.checkOpenShift(user.id);

    // Загружаем товары
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
