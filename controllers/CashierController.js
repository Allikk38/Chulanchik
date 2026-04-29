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
import { formatMoney, debounce } from '../utils/formatters.js';
import { showNotification, showPaymentModal, showConfirmDialog } from '../utils/ui.js';
import { openProductFormModal } from '../components/ProductForm.js';
import { startBarcodeScan } from '../utils/BarcodeScanner.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';
import {
    initCart,
    renderCartPanelContent,
    renderMobileCartTrigger,
    updateMobileCartTrigger,
    closeCart
} from '../components/CashierCart.js';
import {
    initProducts,
    renderClosedShift,
    renderShiftBar,
    renderToolbar,
    renderProductGrid
} from '../components/CashierProducts.js';

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    searchQuery: '',
    selectedCategory: null,
    isScanning: false,
    /** @type {boolean} идёт первичная загрузка данных */
    isInitialLoading: true
};

// ============================================================
// DOM-элементы
// ============================================================

const DOM = {
    content: null
};

// ============================================================
// Рендеринг
// ============================================================

/**
 * Рендерит заглушку на время первичной загрузки.
 * Показывает шапку смены (если открыта) и скелетон сетки товаров,
 * вместо пустого экрана или мигания.
 *
 * @returns {string} HTML
 */
function renderLoadingSkeleton() {
    const shiftBarHtml = shiftStore.isOpen() ? renderShiftBar() : '';

    return `
        <div class="cashier-layout">
            <div class="products-panel">
                ${shiftBarHtml}
                <div class="products-toolbar" style="opacity:0.5;pointer-events:none;">
                    <div class="toolbar-left">
                        <div class="search-wrapper">
                            <input type="text" class="search-input" placeholder="Загрузка товаров..." disabled>
                        </div>
                    </div>
                </div>
                <div class="products-grid-container" id="productsGridContainer">
                    <div class="loading-overlay">
                        <div class="loading-spinner"></div>
                        <span class="loading-text">Загрузка товаров...</span>
                    </div>
                </div>
            </div>
            <div class="cart-panel" id="cartPanel">
                <div class="cart-header">
                    <h3>Корзина</h3>
                </div>
                <div class="cart-items-container">
                    <div class="cart-empty">Загрузка...</div>
                </div>
            </div>
        </div>`;
}

function render() {
    if (!DOM.content) return;

    // Первичная загрузка — показываем скелетон, не лезем в сторы за данными
    if (state.isInitialLoading) {
        DOM.content.innerHTML = renderLoadingSkeleton();
        return;
    }

    if (!shiftStore.isOpen()) {
        document.getElementById('cartToggleBtn')?.remove();
        document.getElementById('cartOverlay')?.remove();
        document.getElementById('fabQuickAdd')?.remove();

        DOM.content.innerHTML = renderClosedShift();

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

    const isMobile = window.innerWidth <= 768;
    fab.style.display = isMobile ? 'flex' : 'none';
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
    // Игнорируем события сторов во время первичной загрузки —
    // все данные ещё не собраны, финальный render() будет вызван явно
    if (state.isInitialLoading) return;

    render();
    updateFabVisibility();
    updateMobileCartTrigger();
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('cashierContent');
}

function bindGlobalEvents() {
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
    console.log('[Cashier] init() started');

    // 1. Вставляем навигацию синхронно, до любых асинхронных операций
    const headerHtml = renderAppHeader({
        currentPage: 'cashier',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
        console.log('[Cashier] header inserted into .app');
    } else {
        console.error('[Cashier] .app element not found in DOM');
    }

    bindAppHeaderEvents({
        onNavigate: (pageId) => {
            const pages = {
                inventory: 'pages/inventory.html',
                cashier: 'pages/cashier.html',
                reports: 'pages/reports.html'
            };
            const href = pages[pageId];
            if (href && pageId !== 'cashier') {
                window.location.href = href;
            }
        },
        onLogout: () => logout()
    });

    // 2. Проверяем авторизацию
    const { user, authError } = await requireAuth();
    if (authError || !user) {
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;
    console.log('[Cashier] user authenticated:', user.email);

    // 3. Обновляем имя пользователя в уже вставленной шапке
    updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    // 4. Внедряем зависимости в компоненты
    initCart({ cartStore, content: DOM.content });
    initProducts({ productStore, cartStore, shiftStore, state });

    // 5. Кэшируем DOM и вешаем глобальные события
    cacheDom();
    bindGlobalEvents();

    // 6. Показываем скелетон загрузки немедленно,
    //    чтобы страница не была пустой во время запросов к серверу
    render();

    // 7. Загружаем корзину из кэша (синхронно, мгновенно)
    cartStore.loadFromCache();

    // 8. Загружаем смену и товары ПАРАЛЛЕЛЬНО
    //    Раньше было последовательно: сначала смена, потом товары.
    //    Теперь оба запроса уходят одновременно — загрузка вдвое быстрее.
    const [shiftOk] = await Promise.all([
        shiftStore.checkOpenShift(user.id),
        productStore.loadProducts()
    ]);

    console.log('[Cashier] data loaded, shift open:', shiftOk);

    // 9. Финальный рендер с реальными данными
    state.isInitialLoading = false;
    render();

    console.log('[Cashier] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
