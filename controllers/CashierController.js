// ============================================================
// controllers/CashierController.js
// v2.5.0 — 2026-10-27: повторная печать чека, офлайн-индикатор,
//                      защита от дублей, проверка корзины при закрытии
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Контроллер страницы кассы.
//   Управляет рендерингом, событиями пользователя и координацией сторов.
//
// ЗАВИСИМОСТИ
//   productStore         — стор товаров (ProductStore)
//   cartStore            — стор корзины (CartStore)
//   shiftStore           — стор смены (ShiftStore)
//   SaleService          — оформление продажи
//   ShiftService         — открытие/закрытие смены
//   CashierCart          — рендеринг корзины и мобильной кнопки
//   CashierProducts      — рендеринг панели товаров
//   AppHeader            — рендеринг навигации
//   usbScanner           — глобальный HID-слушатель
//   usbPrinter           — работа с ESC/POS-принтером (WebUSB)
//
// ИЗМЕНЕНИЯ
//   v2.5.0 — повторная печать последнего чека, офлайн-индикатор,
//            запрет дублей штучного товара, проверка корзины
//            при закрытии смены, F9 не работает в офлайне
//   v2.4.0 — интеграция USB-сканера и ESC/POS-принтера
//   v2.3.2 — исправлен импорт SaleService на именованный
//   v2.3.1 — исправлен импорт SaleService
//   v2.3.0 — исправление бесконечной загрузки на мобильных
//   v2.2.0 — валидация корзины и таймаут загрузки
//   v2.1.0 — удалена дублирующаяся ensureMobileCartButton()
//   v2.0.0 — мобильная кнопка корзины
//   v1.0.0 — первоначальная версия
//
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
import { formatMoney, debounce, resolveUserName } from '../utils/formatters.js';
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
import * as usbScanner from '../utils/usbScanner.js';
import * as usbPrinter from '../utils/usbPrinter.js';

// ============================================================
// Константы
// ============================================================

const DATA_LOAD_TIMEOUT_MS = 15000;
const SLOW_LOAD_THRESHOLD_MS = 5000;

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    searchQuery: '',
    selectedCategory: null,
    isScanning: false,
    isInitialLoading: true,
    isSlowLoad: false,
    isCheckingOut: false,
    usbScannerDispose: null,
    usbPrinterStatus: 'disconnected',
    /** Снимок последней успешной продажи — для повторной печати чека */
    lastReceipt: null
};

// ============================================================
// DOM-элементы
// ============================================================

const DOM = {
    content: null
};

// ============================================================
// USB — сканер
// ============================================================

/**
 * Инициализирует глобальный HID-сканер.
 * При успешном распознавании штрихкода:
 *   - 1 товар in_stock → добавляет в корзину;
 *   - N товаров → заполняет поиск;
 *   - 0 → уведомление.
 */
function initUsbScanner() {
    if (state.usbScannerDispose) return;

    state.usbScannerDispose = usbScanner.init({
        onScan: (barcode) => {
            console.log('[Cashier] HID scan received:', barcode);

            if (state.isInitialLoading) return;

            // Смена закрыта — игнорируем
            if (!shiftStore.isOpen()) {
                showNotification('Смена закрыта — откройте смену для продаж', 'warning');
                return;
            }

            // Ищем товары по штрихкоду:
            // 1) точное совпадение по id (частый случай для комиссионки)
            // 2) частичное совпадение по name
            const all = productStore.getInStock();
            const exact = all.find(p => String(p.id).toLowerCase() === barcode.toLowerCase());
            if (exact) {
                addProductToCart(exact);
                return;
            }

            const matches = all.filter(p =>
                p.name?.toLowerCase().includes(barcode.toLowerCase()) ||
                p.id?.toLowerCase().includes(barcode.toLowerCase())
            );

            if (matches.length === 1) {
                addProductToCart(matches[0]);
            } else if (matches.length > 1) {
                state.searchQuery = barcode;
                state.selectedCategory = null;
                showNotification(`Найдено ${matches.length} товаров`, 'info');
                render();
                setTimeout(() => document.getElementById('searchInput')?.focus(), 50);
            } else {
                showNotification(`Товар по штрихкоду "${barcode}" не найден`, 'warning');
            }
        }
    });

    console.log('[Cashier] HID scanner initialized');
}

/**
 * Добавляет товар в корзину с защитой от дублей штучного товара.
 * Штучным считаем товар, у которого нет поля quantity_limit
 * или оно === 1. Для комиссионки это дефолт.
 *
 * @param {Object} product
 */
function addProductToCart(product) {
    if (!product) return;

    const alreadyInCart = cartStore.getItems().some(i => i.id === product.id);
    const isSinglePiece = !product.quantity_limit || Number(product.quantity_limit) === 1;

    if (alreadyInCart && isSinglePiece) {
        showNotification(`«${product.name}» уже в корзине`, 'warning');
        return;
    }

    cartStore.addItem(product);
    showNotification(`«${product.name}» добавлен в корзину`, 'success');
}

// ============================================================
// USB — принтер
// ============================================================

/**
 * Инициализирует соединение с принтером:
 *   - подписывается на изменение статуса (для индикатора);
 *   - пытается восстановить соединение с ранее разрешённым устройством.
 */
async function initUsbPrinter() {
    usbPrinter.onStatusChange((status, error) => {
        state.usbPrinterStatus = status;
        updatePrinterIndicator(status, error);
    });

    if (!usbPrinter.isSupported()) {
        console.log('[Cashier] USB printer not supported in this browser');
        updatePrinterIndicator('unsupported', null);
        return;
    }

    const reconnected = await usbPrinter.tryReconnect();
    console.log('[Cashier] printer reconnect result:', reconnected);
}

/**
 * Обновляет индикатор и кнопку принтера в шапке.
 *
 * @param {string} status
 * @param {string|null} error
 */
function updatePrinterIndicator(status, error) {
    const indicator = document.getElementById('printerIndicator');
    const button = document.getElementById('connectPrinterBtn');

    if (indicator) {
        indicator.dataset.status = status;
        const map = {
            disconnected: { text: 'Принтер не подключён', color: '#8c7b6e' },
            connecting:   { text: 'Подключение...', color: '#ea580c' },
            connected:    { text: 'Принтер подключён', color: '#16a34a' },
            error:        { text: 'Ошибка принтера', color: '#dc2626' },
            unsupported:  { text: 'Принтер не поддерживается', color: '#94a3b8' }
        };
        const info = map[status] || map.disconnected;
        indicator.textContent = info.text;
        indicator.style.color = info.color;
        indicator.title = error || '';
    }

    if (button) {
        if (status === 'unsupported') {
            button.disabled = true;
            button.title = 'WebUSB не поддерживается в этом браузере (Chrome/Edge на десктопе)';
        } else if (status === 'connected') {
            button.disabled = false;
            button.textContent = 'Отключить принтер';
        } else if (status === 'connecting') {
            button.disabled = true;
            button.textContent = 'Подключение...';
        } else {
            button.disabled = false;
            button.textContent = 'Подключить принтер';
        }
    }
}

/**
 * Обработчик клика по кнопке принтера.
 * Если подключён — отключает, иначе — открывает диалог выбора устройства.
 */
async function handlePrinterButtonClick() {
    if (state.usbPrinterStatus === 'connected') {
        await usbPrinter.disconnect();
        showNotification('Принтер отключён', 'info');
        return;
    }

    const ok = await usbPrinter.connect();
    if (ok) {
        showNotification('Принтер подключён', 'success');
    } else if (state.usbPrinterStatus === 'error') {
        showNotification('Не удалось подключить принтер', 'error');
    }
}

/**
 * Печатает чек. Возвращает результат, чтобы вызывающий код
 * мог показать тост и обновить состояние.
 *
 * @param {Object} receipt
 * @param {Object} receipt.sale
 * @param {Array} receipt.items — снимок cartStore.getItems() ДО reset
 * @param {string} receipt.paymentMethod
 * @param {string} receipt.sellerName
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function printReceiptAfterSale({ sale, items, paymentMethod, sellerName }) {
    if (state.usbPrinterStatus !== 'connected') {
        return { success: false, error: 'Принтер не подключён' };
    }

    const receiptData = {
        shopName: 'Чуланчик',
        date: new Date(),
        sellerName,
        shiftId: shiftStore.getCurrentShiftId(),
        saleId: sale?.id || '',
        items,
        total: cartStoreTotalBeforeReset(items),
        paymentMethod,
        qrText: sale?.id
            ? `Чуланчик|sale=${sale.id}|total=${cartStoreTotalBeforeReset(items)}`
            : '',
        paperWidth: usbPrinter.PAPER_WIDTH_58
    };

    const result = await usbPrinter.printReceipt(receiptData);
    if (result.success) {
        console.log('[Cashier] receipt printed');
        return { success: true };
    }
    console.warn('[Cashier] print failed:', result.error);
    return { success: false, error: result.error || 'Ошибка печати' };
}

/**
 * Восстанавливает сумму корзины по снимку items
 * (cartStore уже мог быть reset — нельзя читать getTotal()).
 *
 * @param {Array} items
 * @returns {number}
 */
function cartStoreTotalBeforeReset(items) {
    return items.reduce((sum, item) => {
        const price = Number(item.price) || 0;
        const discount = Number(item.discount) || 0;
        const qty = Number(item.quantity) || 0;
        return sum + Math.round(price * (1 - discount / 100) * qty);
    }, 0);
}

// ============================================================
// Офлайн-индикатор
// ============================================================

let offlineBannerEl = null;

function updateOnlineStatus() {
    if (!offlineBannerEl) {
        offlineBannerEl = document.createElement('div');
        offlineBannerEl.id = 'cashierOfflineBanner';
        offlineBannerEl.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'right:0',
            'background:#ea580c',
            'color:#fff',
            'text-align:center',
            'padding:6px 12px',
            'font-size:13px',
            'font-weight:500',
            'z-index:9999',
            'display:none'
        ].join(';');
        offlineBannerEl.textContent = 'Нет подключения к интернету — продажи и печать не сохранятся';
        document.body.appendChild(offlineBannerEl);
    }

    offlineBannerEl.style.display = navigator.onLine ? 'none' : 'block';
}

// ============================================================
// Рендеринг
// ============================================================

function renderLoadingSkeleton() {
    const shiftBarHtml = shiftStore.isOpen() ? renderShiftBar() : '';

    const slowLoadNotice = state.isSlowLoad ? `
        <div style="
            text-align: center;
            padding: 12px 16px;
            margin: 12px 16px;
            background: #fff7ed;
            border-radius: 8px;
            color: #9a3412;
            font-size: 14px;
            border-left: 3px solid #ea580c;
        ">
            Медленное соединение. Пожалуйста, подождите...
        </div>` : '';

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
                ${slowLoadNotice}
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

    if (state.isInitialLoading) {
        DOM.content.innerHTML = renderLoadingSkeleton();
        return;
    }

    if (!shiftStore.isOpen()) {
        document.getElementById('cartToggleBtn')?.remove();
        document.getElementById('cartOverlay')?.remove();

        DOM.content.innerHTML = renderClosedShift();

        document.getElementById('openShiftBtn')?.addEventListener('click', async () => {
            const { success, error } = await ShiftService.openShift(state.user?.id);
            if (success) {
                showNotification('Смена открыта', 'success');
            } else {
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
    updateMobileCartTrigger();
}

// ============================================================
// FAB кнопка (быстрый товар)
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
// Сканирование штрихкода (камера)
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
            addProductToCart(products[0]);
            state.searchQuery = '';
        } else if (products.length > 1) {
            showNotification(`Найдено ${products.length} товаров`, 'info');
        } else {
            const product = productStore.getById(barcode);
            if (product && product.status === 'in_stock') {
                addProductToCart(product);
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
    if (state.isCheckingOut) return;

    // Офлайн — сразу отказ, без модалки оплаты
    if (!navigator.onLine) {
        showNotification('Нет подключения к интернету — продажа не сохранится', 'error');
        return;
    }

    const checkoutBtn = document.getElementById('checkoutBtn');
    const total = cartStore.getTotal();
    const method = await showPaymentModal(total);
    if (!method) return;

    state.isCheckingOut = true;
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Оформление...';
    }

    // Снимок корзины ДО reset — нужен для печати чека
    const itemsSnapshot = cartStore.getItems();
    const sellerName = resolveUserName(state.user);

    const result = await SaleService.checkout({
        paymentMethod: method,
        userId: state.user?.id,
        sellerName
    });

    state.isCheckingOut = false;
    if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Оформить продажу (F9)';
    }

    if (result.success) {
        closeCart();
        showNotification(`Продажа на ${formatMoney(total)} оформлена`, 'success');

        // Сохраняем снимок для повторной печати
        state.lastReceipt = {
            sale: result.sale,
            items: itemsSnapshot,
            paymentMethod: method,
            sellerName
        };

        // Печатаем — с явным результатом
        const printResult = await printReceiptAfterSale(state.lastReceipt);
        if (printResult.success) {
            showNotification('Чек напечатан', 'success', { duration: 2000 });
        } else {
            showNotification(
                `Чек не напечатан: ${printResult.error}. Нажмите «Печать чека» в шапке смены.`,
                'warning',
                { duration: 6000 }
            );
        }

        // Перерисовываем, чтобы появилась кнопка «Печать чека»
        render();
    } else {
        showNotification(result.error || 'Ошибка оформления', 'error');
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

    if (!shiftStore.isOpen()) {
        showNotification('Нет открытой смены', 'warning');
        return;
    }

    // Защита от случайного закрытия с непустой корзиной
    if (!cartStore.isEmpty()) {
        const ok = await showConfirmDialog({
            title: 'В корзине есть товары',
            message: `В корзине ${cartStore.getCount()} поз. на ${formatMoney(cartStore.getTotal())}. Закрытие смены очистит корзину. Продолжить?`,
            confirmText: 'Закрыть смену',
            cancelText: 'Вернуться в корзину',
            confirmClass: 'btn-danger'
        });
        if (!ok) return;
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

    if (!confirmed) return;

    const result = await ShiftService.closeShift();

    if (result.success) {
        cartStore.reset();
        state.lastReceipt = null;

        const successMsg = [
            `Выручка: ${formatMoney(result.stats.revenue)}`,
            `Продаж: ${result.stats.salesCount}`,
            `Прибыль: ${formatMoney(result.stats.profit)}`
        ].join(' | ');

        showNotification(successMsg, 'success', { title: 'Смена закрыта', duration: 6000 });
    } else {
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

    // Повторная печать последнего чека
    document.getElementById('reprintReceiptBtn')?.addEventListener('click', async () => {
        if (!state.lastReceipt) return;
        const res = await printReceiptAfterSale(state.lastReceipt);
        if (res.success) {
            showNotification('Чек напечатан', 'success');
        } else {
            showNotification(`Не удалось напечатать: ${res.error}`, 'error');
        }
    });

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
                addProductToCart(product);
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
    if (state.isInitialLoading) return;

    render();
    updateFabVisibility();
    renderMobileCartTrigger();
    updateMobileCartTrigger();
}

// ============================================================
// Загрузка данных с таймаутом
// ============================================================

async function loadDataWithTimeout() {
    let slowLoadTimer = null;

    slowLoadTimer = setTimeout(() => {
        state.isSlowLoad = true;
        DOM.content.innerHTML = renderLoadingSkeleton();
    }, SLOW_LOAD_THRESHOLD_MS);

    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('TIMEOUT')), DATA_LOAD_TIMEOUT_MS);
        });

        await Promise.race([
            Promise.all([
                productStore.loadProducts(),
                shiftStore.checkOpenShift(state.user.id)
            ]),
            timeoutPromise
        ]);

        clearTimeout(slowLoadTimer);
        state.isSlowLoad = false;
        console.log('[Cashier] Data loaded successfully');
        return true;

    } catch (err) {
        clearTimeout(slowLoadTimer);
        state.isSlowLoad = false;

        if (err.message === 'TIMEOUT') {
            console.warn('[Cashier] Data loading timed out after', DATA_LOAD_TIMEOUT_MS, 'ms');
            showNotification(
                'Загрузка данных занимает больше обычного. Проверьте подключение к интернету. Некоторые функции могут быть недоступны.',
                'warning',
                { duration: 8000 }
            );
        } else {
            console.error('[Cashier] Data loading error:', err);
            showNotification(
                'Ошибка загрузки данных. Проверьте подключение к интернету.',
                'error',
                { duration: 6000 }
            );
        }

        return false;
    }
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('cashierContent');
}

/**
 * Вставляет блок кнопок принтера в правую часть шапки
 * (рядом с «Выход»). Ничего не ломает, если шапки нет.
 */
function injectPrinterControls() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;

    if (document.getElementById('connectPrinterBtn')) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const indicator = document.createElement('span');
    indicator.id = 'printerIndicator';
    indicator.style.cssText = 'font-size:11px;white-space:nowrap;';
    indicator.textContent = 'Принтер не подключён';
    indicator.style.color = '#8c7b6e';

    const button = document.createElement('button');
    button.id = 'connectPrinterBtn';
    button.className = 'btn-ghost btn-sm';
    button.textContent = 'Подключить принтер';
    button.addEventListener('click', handlePrinterButtonClick);

    wrapper.appendChild(indicator);
    wrapper.appendChild(button);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && logoutBtn.parentElement === actions) {
        actions.insertBefore(wrapper, logoutBtn);
    } else {
        actions.appendChild(wrapper);
    }
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
        renderMobileCartTrigger();
    });

    // Офлайн/онлайн
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Отслеживаем физическое отключение устройства
    if (navigator.usb && typeof navigator.usb.addEventListener === 'function') {
        navigator.usb.addEventListener('disconnect', (event) => {
            if (state.usbPrinterStatus === 'connected') {
                console.warn('[Cashier] USB device disconnected:', event.device?.productName);
                showNotification('Принтер отключён', 'warning');
                state.usbPrinterStatus = 'disconnected';
                updatePrinterIndicator('disconnected', null);
            }
        });
    }
}

async function init() {
    console.log('[Cashier] v2.5.0 — reprint + offline banner + duplicate guard');

    const headerHtml = renderAppHeader({
        currentPage: 'cashier',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
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

    // Кнопка принтера — сразу, до авторизации (чтобы не мигала)
    injectPrinterControls();

    const { user, authError } = await requireAuth();
    if (authError || !user) {
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;
    console.log('[Cashier] user authenticated:', user.email);

    updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    cacheDom();

    initCart({ cartStore, content: DOM.content });
    initProducts({ productStore, cartStore, shiftStore, state });

    bindGlobalEvents();

    // USB-сканер — независим от данных, можно инициализировать сразу
    initUsbScanner();

    // USB-принтер — асинхронно, не блокирует загрузку
    void initUsbPrinter();

    state.isInitialLoading = true;
    render();

    await loadDataWithTimeout();

    cartStore.loadFromCache(productStore);

    state.isInitialLoading = false;
    render();
    renderMobileCartTrigger();
    updateMobileCartTrigger();

    console.log('[Cashier] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);