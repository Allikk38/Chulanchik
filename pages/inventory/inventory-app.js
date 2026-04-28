// ========================================
// ФАЙЛ: pages/inventory/inventory-app.js
// ========================================

/**
 * Inventory App — страница склада
 * 
 * Использует:
 * - productStore — единый источник товаров
 * - ProductRepo — создание/обновление/удаление через Supabase
 * - openProductFormModal — чистая UI-форма
 * - hasPermission — проверка прав
 * 
 * НЕ делает прямых запросов к Supabase.
 * НЕ дублирует логику загрузки товаров.
 * 
 * @module pages/inventory/inventory-app
 * @version 1.0.0
 */

import { requireAuth, logout, hasPermission } from '../../core/auth.js';
import { productStore } from '../../shared/state/product-store.js';
import { ProductRepo } from '../../core/repositories/product-repo.js';
import { supabase } from '../../core/supabase-client.js';
import {
    formatMoney,
    escapeHtml,
    getCategoryName,
    getStatusText,
    debounce
} from '../../utils/formatters.js';
import { showNotification, showConfirmDialog } from '../../shared/ui/ui.js';
import { openProductFormModal } from '../../shared/ui/product-form.js';

// ========== КОНСТАНТЫ ==========

const SUPABASE_STORAGE_BUCKET = 'product-photos';

// ========== СОСТОЯНИЕ UI (только для этой страницы) ==========

const state = {
    user: null,
    isDeleting: false,
    selectedIds: new Set(),

    // Фильтры (применяются к productStore.getFiltered)
    searchQuery: '',
    selectedStatus: '',
    selectedCategory: '',
    sortBy: 'created_at-desc'
};

// ========== DOM ЭЛЕМЕНТЫ ==========

const DOM = {
    tableBody: null,
    statsBar: null,
    categoryFilter: null,
    searchInput: null,
    statusFilter: null,
    sortSelect: null,
    addProductBtn: null,
    refreshBtn: null,
    errorBanner: null,
    errorMessage: null,
    offlineBanner: null,
    offlineRetryBtn: null,
    userEmail: null,
    logoutBtn: null,
    moduleLoading: null,
    tableContainer: null,
    selectAllCheckbox: null
};

// ========== БАННЕРЫ ==========

function showOfflineBanner() {
    if (DOM.offlineBanner) DOM.offlineBanner.style.display = 'flex';
}

function hideOfflineBanner() {
    if (DOM.offlineBanner) DOM.offlineBanner.style.display = 'none';
}

function showError(message, type = 'error') {
    if (DOM.errorBanner && DOM.errorMessage) {
        DOM.errorMessage.textContent = message;
        DOM.errorBanner.style.display = 'flex';
        DOM.errorBanner.className = `error-banner error-banner-${type}`;
    }
}

function hideError() {
    if (DOM.errorBanner) DOM.errorBanner.style.display = 'none';
}

// ========== ЗАГРУЗКА ФОТО ==========

/**
 * Загружает фото в Supabase Storage
 * @param {File} file
 * @returns {Promise<string>} URL фото
 */
async function uploadPhoto(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        throw new Error('Ошибка загрузки фото: ' + uploadError.message);
    }

    const { data: { publicUrl } } = supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .getPublicUrl(fileName);

    return publicUrl;
}

/**
 * Удаляет фото из Supabase Storage
 * @param {string} photoUrl
 */
async function deletePhoto(photoUrl) {
    if (!photoUrl) return;
    const fileName = photoUrl.split('/').pop();
    if (!fileName) return;

    await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([fileName]);
}

// ========== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ==========

function displayUserInfo() {
    if (DOM.userEmail) {
        if (state.user) {
            const name = state.user.email?.split('@')[0] || 'Пользователь';
            DOM.userEmail.textContent = name;
        } else {
            DOM.userEmail.textContent = 'Гость';
        }
    }
}

// ========== РЕНДЕРИНГ ==========

function getStatusClass(status) {
    const classes = {
        'in_stock': 'status-in_stock',
        'sold': 'status-sold',
        'reserved': 'status-reserved'
    };
    return classes[status] || 'status-unknown';
}

/**
 * Рендерит панель статистики
 */
function renderStats() {
    if (!DOM.statsBar) return;

    const stats = productStore.getStats();

    DOM.statsBar.innerHTML = `
        <div class="stat-card-inline">
            <span class="stat-icon">📦</span>
            <div class="stat-content">
                <span class="stat-label">Всего товаров</span>
                <span class="stat-value">${stats.total}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <span class="stat-icon">✅</span>
            <div class="stat-content">
                <span class="stat-label">В наличии</span>
                <span class="stat-value" style="color: var(--color-success)">${stats.inStock}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <span class="stat-icon">💰</span>
            <div class="stat-content">
                <span class="stat-label">Продано</span>
                <span class="stat-value" style="color: var(--color-danger)">${stats.sold}</span>
            </div>
        </div>
        <div class="stat-card-inline">
            <span class="stat-icon">💵</span>
            <div class="stat-content">
                <span class="stat-label">Стоимость склада</span>
                <span class="stat-value">${formatMoney(stats.stockValue)}</span>
            </div>
        </div>
    `;
}

/**
 * Обновляет список категорий в select
 */
function updateCategorySelect() {
    if (!DOM.categoryFilter) return;

    const categories = productStore.getCategories();
    const currentValue = DOM.categoryFilter.value;

    // Удаляем старые опции кроме первой ("Все категории")
    while (DOM.categoryFilter.options.length > 1) {
        DOM.categoryFilter.remove(1);
    }

    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.value;
        option.textContent = `${getCategoryName(cat.value)} (${cat.count})`;
        DOM.categoryFilter.appendChild(option);
    });

    if (currentValue) {
        DOM.categoryFilter.value = currentValue;
    }
}

/**
 * Обновляет чекбокс "Выбрать всё"
 */
function updateSelectAllCheckbox() {
    if (!DOM.selectAllCheckbox) return;

    const checkboxes = document.querySelectorAll('.table-checkbox');
    const checkedCount = document.querySelectorAll('.table-checkbox:checked').length;

    if (checkedCount === 0) {
        DOM.selectAllCheckbox.checked = false;
        DOM.selectAllCheckbox.indeterminate = false;
    } else if (checkboxes.length > 0 && checkedCount === checkboxes.length) {
        DOM.selectAllCheckbox.checked = true;
        DOM.selectAllCheckbox.indeterminate = false;
    } else {
        DOM.selectAllCheckbox.indeterminate = true;
    }
}

/**
 * Главная функция рендеринга
 */
function render() {
    if (!DOM.tableBody) return;

    renderStats();
    updateCategorySelect();

    const isLoading = productStore.isLoading;
    const filteredProducts = productStore.getFiltered({
        searchQuery: state.searchQuery,
        status: state.selectedStatus,
        category: state.selectedCategory,
        sortBy: state.sortBy
    });

    // Скрываем лоадер модуля
    if (DOM.moduleLoading) {
        DOM.moduleLoading.style.display = 'none';
    }

    // Показываем таблицу
    if (DOM.tableContainer) {
        DOM.tableContainer.style.display = '';
    }

    // Загрузка
    if (isLoading && filteredProducts.length === 0) {
        DOM.tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <span style="margin-left: 12px; color: var(--color-text-muted);">Загрузка товаров...</span>
                </td>
            </tr>
        `;
        return;
    }

    // Пустой список
    if (filteredProducts.length === 0) {
        const hasFilters = state.searchQuery || state.selectedStatus || state.selectedCategory;
        DOM.tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 60px;">
                    <div class="empty-state-icon">📦</div>
                    <p style="margin-top: 16px; color: var(--color-text-muted);">
                        ${hasFilters ? 'По вашему запросу ничего не найдено' : 'Товары не найдены. Добавьте первый товар.'}
                    </p>
                </td>
            </tr>
        `;
        return;
    }

    // Рендерим строки таблицы
    DOM.tableBody.innerHTML = filteredProducts.map(product => {
        const statusText = getStatusText(product.status);
        const statusClass = getStatusClass(product.status);
        const safeName = escapeHtml(product.name || 'Без названия');
        const safeId = escapeHtml(product.id?.slice(0, 8) || '—');
        const safePhotoUrl = product.photo_url ? escapeHtml(product.photo_url) : null;
        const isSelected = state.selectedIds.has(product.id);
        const canEdit = hasPermission('products:update') || hasPermission('*');

        return `
            <tr class="product-row ${isSelected ? 'selected' : ''}" data-id="${product.id}">
                <td class="checkbox-cell">
                    <input type="checkbox" class="table-checkbox" data-id="${product.id}"
                        ${state.isDeleting ? 'disabled' : ''} ${isSelected ? 'checked' : ''}>
                </td>
                <td class="photo-cell">
                    <div class="product-thumb">
                        ${safePhotoUrl
                            ? `<img src="${safePhotoUrl}" alt="${safeName}" loading="lazy">`
                            : '<span class="thumb-placeholder">📦</span>'
                        }
                    </div>
                </td>
                <td class="name-cell">
                    <div class="product-name">${safeName}</div>
                    <div class="product-id">ID: ${safeId}</div>
                </td>
                <td class="category-cell">${getCategoryName(product.category)}</td>
                <td class="price-cell">
                    <div class="price-main">${formatMoney(product.price)}</div>
                    ${product.cost_price ? `<div class="price-cost">Себ.: ${formatMoney(product.cost_price)}</div>` : ''}
                </td>
                <td class="status-cell">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td class="actions-cell">
                    <div class="row-actions">
                        ${canEdit ? `
                            <button class="btn-icon" data-action="edit" data-id="${product.id}"
                                title="Редактировать" ${state.isDeleting ? 'disabled' : ''}>
                                ✎
                            </button>
                        ` : ''}
                        <button class="btn-icon btn-danger" data-action="delete" data-id="${product.id}"
                            title="Удалить" ${state.isDeleting ? 'disabled' : ''}>
                            ${state.isDeleting ? '⌛' : '✕'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    attachRowEvents();
    updateSelectAllCheckbox();
}

function attachRowEvents() {
    if (!DOM.tableBody) return;

    // Кнопка редактирования
    DOM.tableBody.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.isDeleting) openEditProductForm(btn.dataset.id);
        });
    });

    // Кнопка удаления
    DOM.tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.isDeleting) deleteProduct(btn.dataset.id);
        });
    });

    // Чекбоксы
    DOM.tableBody.querySelectorAll('.table-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) {
                state.selectedIds.add(id);
            } else {
                state.selectedIds.delete(id);
            }
            updateSelectAllCheckbox();
        });
    });
}

// ========== ДЕЙСТВИЯ С ТОВАРАМИ ==========

/**
 * Открывает форму редактирования товара
 */
async function openEditProductForm(id) {
    const product = productStore.all.find(p => p.id === id);
    if (!product) {
        showNotification('Товар не найден', 'error');
        return;
    }

    try {
        await openProductFormModal({
            mode: 'edit',
            initialData: product,
            onPhotoUpload: uploadPhoto,
            onPhotoDelete: deletePhoto,
            onSubmit: async (formData) => {
                const updated = await ProductRepo.update(id, {
                    name: formData.name,
                    price: formData.price,
                    cost_price: formData.costPrice,
                    category: formData.category,
                    attributes: formData.attributes,
                    photo_url: formData.photoUrl
                });

                // Обновляем в сторе
                productStore.update(id, updated);
                render();

                showNotification(`Товар "${updated.name}" обновлён`, 'success');
                return updated;
            }
        });
    } catch (error) {
        console.error('[Inventory] Edit error:', error);
        showNotification('Не удалось открыть форму редактирования', 'error');
    }
}

/**
 * Открывает форму добавления товара
 */
async function openAddProductForm() {
    if (!hasPermission('products:create') && !hasPermission('*')) {
        showNotification('Недостаточно прав для добавления товаров', 'error');
        return;
    }

    if (!state.user?.id) {
        showNotification('Не удалось определить пользователя', 'error');
        return;
    }

    try {
        await openProductFormModal({
            mode: 'create',
            onPhotoUpload: uploadPhoto,
            onPhotoDelete: deletePhoto,
            onSubmit: async (formData) => {
                const created = await ProductRepo.create({
                    name: formData.name,
                    price: formData.price,
                    cost_price: formData.costPrice,
                    category: formData.category,
                    attributes: formData.attributes,
                    photo_url: formData.photoUrl,
                    created_by: state.user.id
                });

                // Добавляем в стор
                productStore.add(created);
                render();

                showNotification(`Товар "${created.name}" добавлен`, 'success');
                return created;
            }
        });
    } catch (error) {
        console.error('[Inventory] Add error:', error);
        showNotification('Не удалось открыть форму добавления', 'error');
    }
}

/**
 * Удаляет товар
 */
async function deleteProduct(id) {
    if (state.isDeleting) return;

    const product = productStore.all.find(p => p.id === id);
    if (!product) {
        showNotification('Товар не найден', 'error');
        return;
    }

    if (product.status === 'sold') {
        showNotification('Нельзя удалить проданный товар', 'warning');
        return;
    }

    const confirmed = await showConfirmDialog({
        title: 'Удаление товара',
        message: `Вы уверены, что хотите удалить товар "${product.name}"?`,
        confirmText: 'Удалить',
        confirmClass: 'btn-danger'
    });

    if (!confirmed) return;

    state.isDeleting = true;
    render();

    try {
        await ProductRepo.remove(id);

        // Удаляем из стора
        productStore.remove(id);
        state.selectedIds.delete(id);

        showNotification(`Товар "${product.name}" удалён`, 'success');
        render();

    } catch (error) {
        console.error('[Inventory] Delete error:', error);
        showNotification('Ошибка удаления: ' + error.message, 'error');
    } finally {
        state.isDeleting = false;
        render();
    }
}

// ========== ПОДПИСКА НА ИЗМЕНЕНИЯ СТОРА ==========

function subscribeToStore() {
    // При загрузке данных — рендерим
    productStore.on('loaded', () => {
        console.log('[Inventory] Store loaded, rerendering');
        render();
    });

    // При изменении данных — рендерим
    productStore.on('changed', () => {
        console.log('[Inventory] Store changed, rerendering');
        render();
    });

    // Ошибка
    productStore.on('error', (error) => {
        console.error('[Inventory] Store error:', error);
        showError('Ошибка загрузки товаров: ' + error.message);
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

function cacheElements() {
    DOM.tableBody = document.getElementById('tableBody');
    DOM.statsBar = document.getElementById('statsBar');
    DOM.categoryFilter = document.getElementById('categoryFilter');
    DOM.searchInput = document.getElementById('searchInput');
    DOM.statusFilter = document.getElementById('statusFilter');
    DOM.sortSelect = document.getElementById('sortSelect');
    DOM.addProductBtn = document.getElementById('addProductBtn');
    DOM.refreshBtn = document.getElementById('refreshBtn');
    DOM.errorBanner = document.getElementById('errorBanner');
    DOM.errorMessage = document.getElementById('errorMessage');
    DOM.offlineBanner = document.getElementById('offlineBanner');
    DOM.offlineRetryBtn = document.getElementById('offlineRetryBtn');
    DOM.userEmail = document.getElementById('userEmail');
    DOM.logoutBtn = document.getElementById('logoutBtn');
    DOM.moduleLoading = document.getElementById('moduleLoading');
    DOM.tableContainer = document.getElementById('productsTable');
    DOM.selectAllCheckbox = document.getElementById('selectAllCheckbox');
}

function attachEvents() {
    // Выход
    if (DOM.logoutBtn) {
        DOM.logoutBtn.addEventListener('click', () => logout());
    }

    // Обновление
    if (DOM.refreshBtn) {
        DOM.refreshBtn.addEventListener('click', async () => {
            hideError();
            await productStore.load({ forceRefresh: true });
        });
    }

    // Добавление товара
    if (DOM.addProductBtn) {
        DOM.addProductBtn.addEventListener('click', openAddProductForm);
    }

    // Офлайн — переподключение
    if (DOM.offlineRetryBtn) {
        DOM.offlineRetryBtn.addEventListener('click', async () => {
            await productStore.load({ forceRefresh: true });
        });
    }

    // Поиск
    if (DOM.searchInput) {
        const debouncedSearch = debounce(() => {
            state.searchQuery = DOM.searchInput.value.trim();
            render();
        }, 300);
        DOM.searchInput.addEventListener('input', debouncedSearch);
    }

    // Фильтр по статусу
    if (DOM.statusFilter) {
        DOM.statusFilter.addEventListener('change', (e) => {
            state.selectedStatus = e.target.value;
            render();
        });
    }

    // Фильтр по категории
    if (DOM.categoryFilter) {
        DOM.categoryFilter.addEventListener('change', (e) => {
            state.selectedCategory = e.target.value;
            render();
        });
    }

    // Сортировка
    if (DOM.sortSelect) {
        DOM.sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            render();
        });
    }

    // Закрытие баннера ошибки
    const closeErrorBtn = document.getElementById('closeErrorBtn');
    if (closeErrorBtn) {
        closeErrorBtn.addEventListener('click', hideError);
    }

    // Чекбокс "Выбрать всё"
    if (DOM.selectAllCheckbox) {
        DOM.selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.table-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                const id = cb.dataset.id;
                if (e.target.checked) {
                    state.selectedIds.add(id);
                } else {
                    state.selectedIds.delete(id);
                }
            });
            updateSelectAllCheckbox();
        });
    }

    // Сеть
    window.addEventListener('online', () => {
        hideOfflineBanner();
        showNotification('Соединение восстановлено', 'success');
    });

    window.addEventListener('offline', () => {
        showOfflineBanner();
        showNotification('Нет подключения к интернету', 'warning');
    });
}

/**
 * Точка входа
 */
async function init() {
    console.log('[Inventory] Initializing...');

    cacheElements();

    // Авторизация
    const authResult = await requireAuth();

    if (authResult.user) {
        state.user = authResult.user;
    } else if (authResult.offline) {
        state.user = null;
        showOfflineBanner();
        showNotification('Работа в офлайн-режиме', 'warning');
    } else if (authResult.authError) {
        return; // requireAuth сама перенаправит на логин
    }

    if (!navigator.onLine) {
        showOfflineBanner();
    }

    displayUserInfo();
    attachEvents();
    subscribeToStore();

    // Загружаем товары
    await productStore.load();

    // Скрываем лоадер
    if (DOM.moduleLoading) {
        DOM.moduleLoading.style.display = 'none';
    }

    console.log('[Inventory] Initialized');
}

// ========== ЗАПУСК ==========

document.addEventListener('DOMContentLoaded', init);

export { init };
