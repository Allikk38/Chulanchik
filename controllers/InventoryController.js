// ============================================================
// controllers/InventoryController.js
// v6.3.0 — 2026-10-27: убраны псевдо-иконки статистики
// ============================================================

/**
 * Контроллер страницы склада.
 *
 * v6.3.0 — в renderStats() псевдо-иконки "!= + - ~" заменены
 *           на текстовые метки (Всего / В наличии / Продано / Склад).
 *
 * @module controllers/InventoryController
 */

import { requireAuth, hasPermission, logout } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import ProductService from '../services/ProductService.js';
import { formatMoney, getCategoryName, getStatusText, escapeHtml } from '../utils/formatters.js';
import { showNotification, showConfirmDialog } from '../utils/ui.js';
import { openProductFormModal } from '../components/ProductForm.js';
import { openPriceTagModal } from '../components/PriceTagForm.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';

// ============================================================
// Локальное состояние страницы
// ============================================================

const state = {
    user: null,
    /** @type {Set<string>} выбранные ID для массовых действий */
    selectedIds: new Set(),
    /** @type {boolean} идёт операция (удаление) */
    isBusy: false,
    /** @type {boolean} показывать таблицу (true) или карточки (false) на мобильных */
    showTable: false,

    // Фильтры (UI-состояние)
    filters: {
        search: '',
        category: '',
        status: '',
        sort: 'created_at-desc'
    }
};

// ============================================================
// DOM-элементы (кэшируются при инициализации)
// ============================================================

const DOM = {
    tableBody: null,
    statsBar: null,
    searchInput: null,
    categoryFilter: null,
    statusFilter: null,
    sortSelect: null,
    addBtn: null,
    refreshBtn: null,
    printTagsBtn: null,
    selectAllCb: null,
    mobileCardsContainer: null,
    viewToggleBtn: null
};

// ============================================================
// Приватные хелперы
// ============================================================

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}

// ============================================================
// Рендеринг
// ============================================================

function renderStats() {
    if (!DOM.statsBar) return;
    const stats = productStore.getStats();

    DOM.statsBar.innerHTML = `
        <div class="stat-card-inline">
            <div class="stat-content">
                <span class="stat-label">Всего товаров</span>
                <span class="stat-value">${stats.total}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <div class="stat-content">
                <span class="stat-label">В наличии</span>
                <span class="stat-value" style="color: var(--color-success)">${stats.inStock}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <div class="stat-content">
                <span class="stat-label">Продано</span>
                <span class="stat-value" style="color: var(--color-danger)">${stats.sold}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <div class="stat-content">
                <span class="stat-label">Стоимость склада</span>
                <span class="stat-value">${formatMoney(stats.stockValue)}</span>
            </div>
        </div>
    `;
}

function updateCategoryOptions() {
    if (!DOM.categoryFilter) return;
    const categories = productStore.getCategories();
    const currentValue = DOM.categoryFilter.value;

    DOM.categoryFilter.innerHTML = '<option value="">Все категории</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.value;
        option.textContent = `${getCategoryName(cat.value)} (${cat.count})`;
        DOM.categoryFilter.appendChild(option);
    });

    if (currentValue) DOM.categoryFilter.value = currentValue;
}

function getFilteredProducts() {
    let products = productStore.getAll();

    if (state.filters.search) {
        const q = state.filters.search.toLowerCase();
        products = products.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.id?.toLowerCase().includes(q)
        );
    }

    if (state.filters.status) {
        products = products.filter(p => p.status === state.filters.status);
    }

    if (state.filters.category) {
        products = products.filter(p => p.category === state.filters.category);
    }

    // Сортировка
    switch (state.filters.sort) {
        case 'price-asc':
            products.sort((a, b) => (a.price || 0) - (b.price || 0));
            break;
        case 'price-desc':
            products.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'name-asc':
            products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        default:
            products.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return products;
}

function renderTable() {
    if (!DOM.tableBody) return;

    const products = getFilteredProducts();

    if (productStore.isLoading() && products.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr><td colspan="7" style="text-align:center;padding:40px;">
                <div class="loading-spinner"></div>
            </td></tr>`;
        return;
    }

    if (products.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr><td colspan="7" style="text-align:center;padding:60px;">
                <p>${state.filters.search || state.filters.status || state.filters.category
                    ? 'По вашему запросу ничего не найдено'
                    : 'Нет товаров. Нажмите «Добавить товар»'}</p>
            </td></tr>`;
        return;
    }

    DOM.tableBody.innerHTML = products.map(p => {
        const isSelected = state.selectedIds.has(p.id);
        const statusClass = `status-${p.status || 'unknown'}`;
        const shortId = p.id?.slice(0, 8) || '--';

        return `
            <tr class="product-row ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="table-checkbox" data-id="${p.id}"
                        ${state.isBusy ? 'disabled' : ''} ${isSelected ? 'checked' : ''}>
                </td>
                <td class="photo-cell">
                    <div class="product-thumb">
                        ${p.photo_url
                            ? `<img src="${escapeAttr(p.photo_url)}" alt="" loading="lazy">`
                            : '<span class="thumb-placeholder"></span>'}
                    </div>
                </td>
                <td class="name-cell">
                    <div class="product-name">${escapeHtml(p.name)}</div>
                    <div class="product-id">ID: ${shortId}</div>
                </td>
                <td>${getCategoryName(p.category)}</td>
                <td class="price-cell">
                    <div class="price-main">${formatMoney(p.price)}</div>
                    ${p.cost_price ? `<div class="price-cost">Себ.: ${formatMoney(p.cost_price)}</div>` : ''}
                </td>
                <td>
                    <span class="status-badge ${statusClass}">
                        <span class="status-dot-indicator"></span>${getStatusText(p.status)}
                    </span>
                </td>
                <td class="actions-cell">
                    <div class="row-actions">
                        <button class="btn-icon" data-action="edit" data-id="${p.id}"
                            ${state.isBusy ? 'disabled' : ''} title="Редактировать" aria-label="Редактировать">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                                <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/>
                            </svg>
                        </button>
                        <button class="btn-icon btn-danger" data-action="delete" data-id="${p.id}"
                            ${state.isBusy ? 'disabled' : ''} title="Удалить" aria-label="Удалить">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                                <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    // Чекбоксы
    DOM.tableBody.querySelectorAll('.table-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            cb.checked
                ? state.selectedIds.add(cb.dataset.id)
                : state.selectedIds.delete(cb.dataset.id);
            updateSelectAll();
            updateMobileCardsSelection();
        });
    });

    // Кнопки действий
    DOM.tableBody.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => editProduct(btn.dataset.id));
    });
    DOM.tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
    });
}

/**
 * Рендерит мобильные карточки товаров.
 * Использует те же данные getFilteredProducts(), что и таблица.
 */
function renderMobileCards() {
    if (!DOM.mobileCardsContainer) return;

    const products = getFilteredProducts();

    if (productStore.isLoading() && products.length === 0) {
        DOM.mobileCardsContainer.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <div class="loading-spinner"></div>
            </div>`;
        return;
    }

    if (products.length === 0) {
        DOM.mobileCardsContainer.innerHTML = `
            <div class="empty-state">
                <p>${state.filters.search || state.filters.status || state.filters.category
                    ? 'По вашему запросу ничего не найдено'
                    : 'Нет товаров. Нажмите «Добавить товар»'}</p>
            </div>`;
        return;
    }

    DOM.mobileCardsContainer.innerHTML = products.map(p => {
        const isSelected = state.selectedIds.has(p.id);
        const statusClass = p.status || 'unknown';

        return `
            <div class="mobile-product-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
                <div class="card-photo">
                    ${p.photo_url
                        ? `<img src="${escapeAttr(p.photo_url)}" alt="" loading="lazy">`
                        : '<span class="photo-placeholder"></span>'}
                </div>
                <div class="card-info">
                    <div class="card-name">${escapeHtml(p.name)}</div>
                    <div class="card-meta">
                        <span class="card-category">${getCategoryName(p.category)}</span>
                        <span class="card-status status-${statusClass}">
                            <span class="status-dot-indicator"></span>${getStatusText(p.status)}
                        </span>
                    </div>
                </div>
                <div class="card-price">
                    <div class="price-value">${formatMoney(p.price)}</div>
                    ${p.cost_price ? `<div class="price-cost">Себ. ${formatMoney(p.cost_price)}</div>` : ''}
                </div>
                <div class="card-actions">
                    <button class="btn-icon" data-action="edit" data-id="${p.id}"
                        ${state.isBusy ? 'disabled' : ''} title="Редактировать" aria-label="Редактировать">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                            <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-danger" data-action="delete" data-id="${p.id}"
                        ${state.isBusy ? 'disabled' : ''} title="Удалить" aria-label="Удалить">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                            <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4"/>
                        </svg>
                    </button>
                </div>
            </div>`;
    }).join('');

    // Обработчики карточек
    DOM.mobileCardsContainer.querySelectorAll('.mobile-product-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;

            const id = card.dataset.id;
            if (state.selectedIds.has(id)) {
                state.selectedIds.delete(id);
            } else {
                state.selectedIds.add(id);
            }
            updateSelectAll();
            renderMobileCards();
            renderTable();
        });
    });

    DOM.mobileCardsContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editProduct(btn.dataset.id);
        });
    });
    DOM.mobileCardsContainer.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProduct(btn.dataset.id);
        });
    });
}

function renderAll() {
    renderStats();
    updateCategoryOptions();
    renderTable();
    renderMobileCards();
    updateSelectAll();
    updateViewToggleButton();
}

function updateSelectAll() {
    if (!DOM.selectAllCb) return;
    const checkboxes = document.querySelectorAll('.table-checkbox');
    const checked = document.querySelectorAll('.table-checkbox:checked');
    DOM.selectAllCb.checked = checked.length > 0 && checked.length === checkboxes.length;
    DOM.selectAllCb.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
}

function updateMobileCardsSelection() {
    if (!DOM.mobileCardsContainer) return;

    DOM.mobileCardsContainer.querySelectorAll('.mobile-product-card').forEach(card => {
        const id = card.dataset.id;
        if (state.selectedIds.has(id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    document.querySelectorAll('.table-checkbox').forEach(cb => {
        cb.checked = state.selectedIds.has(cb.dataset.id);
    });
}

function updateViewToggleButton() {
    if (!DOM.viewToggleBtn) return;

    if (state.showTable) {
        DOM.viewToggleBtn.classList.add('active');
        DOM.viewToggleBtn.textContent = 'Таблица';
        DOM.viewToggleBtn.title = 'Показать карточками';
    } else {
        DOM.viewToggleBtn.classList.remove('active');
        DOM.viewToggleBtn.textContent = 'Карточки';
        DOM.viewToggleBtn.title = 'Показать таблицей';
    }
}

function toggleView() {
    state.showTable = !state.showTable;

    const inventoryPage = document.querySelector('.inventory-page');
    if (inventoryPage) {
        if (state.showTable) {
            inventoryPage.classList.add('show-table');
        } else {
            inventoryPage.classList.remove('show-table');
        }
    }

    updateViewToggleButton();
}

// ============================================================
// Действия
// ============================================================

async function addProduct() {
    if (!hasPermission('products:create')) {
        showNotification('Недостаточно прав', 'error');
        return;
    }

    const result = await openProductFormModal({
        mode: 'create',
        userId: state.user?.id
    });

    if (result) {
        showNotification(`Товар "${result.name}" добавлен`, 'success');
    }
}

async function editProduct(id) {
    const product = productStore.getById(id);
    if (!product) {
        showNotification('Товар не найден', 'error');
        return;
    }

    const result = await openProductFormModal({
        mode: 'edit',
        initialData: product,
        userId: state.user?.id
    });

    if (result) {
        showNotification(`Товар "${result.name}" обновлён`, 'success');
    }
}

async function deleteProduct(id) {
    if (state.isBusy) return;

    const product = productStore.getById(id);
    if (!product) return;

    const isAdmin = state.user?.roleName === 'admin';
    const isSold = product.status === 'sold';

    // 1. Подтверждение
    const confirmed = await showConfirmDialog({
        title: isSold ? 'Удаление проданного товара' : 'Удаление товара',
        message: isSold
            ? `«${product.name}» уже продан. Удалить запись о товаре? История продаж сохранится.`
            : `Вы уверены, что хотите удалить товар «${product.name}»?`,
        confirmText: 'Продолжить',
        confirmClass: 'btn-danger'
    });
    if (!confirmed) return;

    // 2. Если не админ — требуем пароль админа
    if (!isAdmin) {
        const { showAdminPasswordDialog } = await import('../utils/ui.js');
        const { verifyAdminCredentials } = await import('../core/auth.js');

        const creds = await showAdminPasswordDialog();
        if (!creds) return;

        const check = await verifyAdminCredentials(creds.email, creds.password);
        if (!check.ok) {
            showNotification(check.error || 'Неверные данные администратора', 'error');
            return;
        }

        // Продолжаем как "админ" на одну операцию
        state.user = { ...state.user, roleName: 'admin', verifiedForDeletion: true };
    }

    state.isBusy = true;
    renderTable();
    renderMobileCards();

    const { success, error } = await ProductService.remove(id, { isAdmin: true });

    state.isBusy = false;
    state.selectedIds.delete(id);

    if (success) {
        showNotification(
            isSold
                ? `Запись о проданном товаре «${product.name}» удалена`
                : `Товар «${product.name}» удалён`,
            'success'
        );
    } else {
        showNotification(error || 'Ошибка удаления', 'error');
    }

    renderTable();
    renderMobileCards();
}

function printTags() {
    const selectedIds = Array.from(state.selectedIds);
    openPriceTagModal({ selectedIds });
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.tableBody = document.getElementById('tableBody');
    DOM.statsBar = document.getElementById('statsBar');
    DOM.searchInput = document.getElementById('searchInput');
    DOM.categoryFilter = document.getElementById('categoryFilter');
    DOM.statusFilter = document.getElementById('statusFilter');
    DOM.sortSelect = document.getElementById('sortSelect');
    DOM.addBtn = document.getElementById('addProductBtn');
    DOM.refreshBtn = document.getElementById('refreshBtn');
    DOM.printTagsBtn = document.getElementById('printTagsBtn');
    DOM.selectAllCb = document.getElementById('selectAllCheckbox');
    DOM.mobileCardsContainer = document.getElementById('mobileCardsContainer');
    DOM.viewToggleBtn = document.getElementById('viewToggleBtn');
}

function bindEvents() {
    DOM.searchInput?.addEventListener('input', e => {
        state.filters.search = e.target.value.trim();
        renderTable();
        renderMobileCards();
    });

    DOM.categoryFilter?.addEventListener('change', e => {
        state.filters.category = e.target.value;
        renderTable();
        renderMobileCards();
    });

    DOM.statusFilter?.addEventListener('change', e => {
        state.filters.status = e.target.value;
        renderTable();
        renderMobileCards();
    });

    DOM.sortSelect?.addEventListener('change', e => {
        state.filters.sort = e.target.value;
        renderTable();
        renderMobileCards();
    });

    DOM.addBtn?.addEventListener('click', addProduct);

    DOM.refreshBtn?.addEventListener('click', async () => {
        await productStore.loadProducts({ force: true });
    });

    DOM.printTagsBtn?.addEventListener('click', printTags);

    DOM.selectAllCb?.addEventListener('change', e => {
        const checked = e.target.checked;
        document.querySelectorAll('.table-checkbox').forEach(cb => {
            cb.checked = checked;
            if (checked) {
                state.selectedIds.add(cb.dataset.id);
            } else {
                state.selectedIds.delete(cb.dataset.id);
            }
        });
        updateSelectAll();
        updateMobileCardsSelection();
    });

    bindViewToggle();
}

function bindViewToggle() {
    if (!DOM.viewToggleBtn) return;
    DOM.viewToggleBtn.addEventListener('click', toggleView);
}

async function init() {
    console.log('[Inventory] init() started');

    const headerHtml = renderAppHeader({
        currentPage: 'inventory',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
        console.log('[Inventory] header inserted into .app');
    } else {
        console.error('[Inventory] .app element not found in DOM');
    }

    bindAppHeaderEvents({
        onNavigate: (pageId) => {
            const pages = {
                inventory: 'pages/inventory.html',
                cashier: 'pages/cashier.html',
                reports: 'pages/reports.html'
            };
            const href = pages[pageId];
            if (href && pageId !== 'inventory') {
                window.location.href = href;
            }
        },
        onLogout: () => logout()
    });

    const { user, authError } = await requireAuth();
    if (authError || !user) {
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;
    console.log('[Inventory] user authenticated:', user.email);

    updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    cacheDom();
    bindEvents();

    productStore.on('change', () => renderAll());

    await productStore.loadProducts();
    renderAll();

    console.log('[Inventory] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);