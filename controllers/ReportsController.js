// ============================================================
// controllers/ReportsController.js
// ============================================================

/**
 * Контроллер страницы отчётов.
 *
 * Подписан на productStore и expenseStore. Загружает продажи, смены и расходы
 * через репозитории. Рендерит дашборд и таблицы.
 *
 * @module controllers/ReportsController
 */

import { requireAuth, logout } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import { expenseStore } from '../stores/ExpenseStore.js';
import SaleRepository from '../repositories/SaleRepository.js';
import ShiftRepository from '../repositories/ShiftRepository.js';
import { formatMoney, formatDate } from '../utils/formatters.js';
import { showNotification } from '../utils/ui.js';
import { exportFinancialReport, exportExpensesReport } from '../utils/pdfExport.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';
import {
    renderDashboard,
    renderSalesTab,
    renderProductsTab,
    renderShiftsTab,
    drawCharts
} from '../components/ReportDashboard.js';
import {
    renderExpensesTab,
    bindExpensesEvents
} from '../components/ReportExpenses.js';

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    period: 'week',
    activeTab: 'dashboard',

    sales: [],
    shifts: [],
    expenses: [],

    expenseFilters: {
        fromDate: '',
        toDate: '',
        category: ''
    },

    isLoadingExpenses: false,
    isRendering: false,

    /** @type {number|null} ID таймаута для графиков */
    _chartsTimeoutId: null,

    /** @type {number|null} ID таймаута для биндинга расходов */
    _expensesTimeoutId: null,

    /** @type {boolean} запланирован ли повторный рендер */
    _pendingRender: false
};

// ============================================================
// DOM
// ============================================================

const DOM = {
    content: null,
    periodSelect: null,
    refreshBtn: null,
    exportBtn: null,
    exportPdfBtn: null
};

// ============================================================
// Период
// ============================================================

function getPeriodDates() {
    const now = new Date();
    const to = now.toISOString();
    let from;

    switch (state.period) {
        case 'today':
            from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            break;
        case 'yesterday': {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            from = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString();
            break;
        }
        case 'week': {
            from = new Date(now);
            from.setDate(from.getDate() - 7);
            from = from.toISOString();
            break;
        }
        case 'month': {
            from = new Date(now);
            from.setMonth(from.getMonth() - 1);
            from = from.toISOString();
            break;
        }
        case 'quarter': {
            from = new Date(now);
            from.setMonth(from.getMonth() - 3);
            from = from.toISOString();
            break;
        }
        case 'year': {
            from = new Date(now);
            from.setFullYear(from.getFullYear() - 1);
            from = from.toISOString();
            break;
        }
        default:
            from = new Date(now.setDate(now.getDate() - 7)).toISOString();
    }

    return { from, to };
}

// ============================================================
// Загрузка данных
// ============================================================

async function loadData() {
    const { from, to } = getPeriodDates();

    try {
        const [sales, shifts] = await Promise.all([
            SaleRepository.getAll({ from, to, limit: 200 }),
            ShiftRepository.getAll({ from, to, limit: 100 })
        ]);

        state.sales = sales;
        state.shifts = shifts;

        await loadExpenses();

    } catch (err) {
        console.error('[Reports] loadData error:', err);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function loadExpenses() {
    state.isLoadingExpenses = true;

    try {
        await expenseStore.loadExpenses();

        let expenses = expenseStore.getAll();

        let fromDate = state.expenseFilters.fromDate || null;
        let toDate = state.expenseFilters.toDate || null;

        if (!fromDate && !toDate) {
            const { from, to } = getPeriodDates();
            fromDate = from;
            toDate = to;
        }

        if (fromDate) {
            expenses = expenses.filter(e => e.expense_date >= fromDate);
        }
        if (toDate) {
            expenses = expenses.filter(e => e.expense_date <= toDate);
        }

        if (state.expenseFilters.category) {
            expenses = expenses.filter(e => e.category === state.expenseFilters.category);
        }

        state.expenses = expenses;

    } catch (err) {
        console.error('[Reports] loadExpenses error:', err);
        showNotification('Ошибка загрузки расходов', 'error');
    } finally {
        state.isLoadingExpenses = false;
    }
}

// ============================================================
// Планировщик рендеринга (замена рекурсивных вызовов)
// ============================================================

/**
 * Запрашивает рендеринг. Если рендеринг уже идёт — ставит в очередь.
 * Гарантирует максимум один отложенный рендер.
 */
function requestRender() {
    if (state.isRendering) {
        state._pendingRender = true;
        return;
    }
    renderContent();
}

// ============================================================
// Рендеринг
// ============================================================

function renderContent() {
    if (!DOM.content) return;

    if (state.isRendering) {
        state._pendingRender = true;
        return;
    }

    state.isRendering = true;

    // Очищаем предыдущие таймауты, чтобы избежать множественных подписок
    if (state._chartsTimeoutId !== null) {
        clearTimeout(state._chartsTimeoutId);
        state._chartsTimeoutId = null;
    }
    if (state._expensesTimeoutId !== null) {
        clearTimeout(state._expensesTimeoutId);
        state._expensesTimeoutId = null;
    }

    try {
        const tabs = ['dashboard', 'sales', 'products', 'shifts', 'expenses'];
        const tabLabels = {
            dashboard: 'Дашборд',
            sales: 'Продажи',
            products: 'Товары',
            shifts: 'Смены',
            expenses: 'Расходы'
        };

        let body = '<div class="reports-loader">Загрузка...</div>';

        switch (state.activeTab) {
            case 'dashboard':
                body = renderDashboard(state);
                break;
            case 'sales':
                body = renderSalesTab(state);
                break;
            case 'products':
                body = renderProductsTab(state);
                break;
            case 'shifts':
                body = renderShiftsTab(state);
                break;
            case 'expenses':
                body = renderExpensesTab(state);
                break;
        }

        DOM.content.innerHTML = `
            <div class="reports-tabs" role="tablist">
                ${tabs.map(t => `
                    <button class="tab-btn ${state.activeTab === t ? 'active' : ''}"
                        data-tab="${t}" role="tab"
                        aria-selected="${state.activeTab === t}">
                        ${tabLabels[t]}
                    </button>
                `).join('')}
            </div>
            <div class="reports-content-inner">${body}</div>`;

        // Обработчики табов — без блокировки, используют requestRender
        DOM.content.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newTab = btn.dataset.tab;
                if (state.activeTab === newTab) return;
                state.activeTab = newTab;
                requestRender();
            });
        });

        // Графики после вставки в DOM
        if (state.activeTab === 'dashboard') {
            state._chartsTimeoutId = setTimeout(() => {
                state._chartsTimeoutId = null;
                try {
                    drawCharts(state);
                } catch (err) {
                    console.error('[Reports] drawCharts error:', err);
                }
            }, 100);
        }

        // Биндинг событий для вкладки расходов
        if (state.activeTab === 'expenses') {
            state._expensesTimeoutId = setTimeout(() => {
                state._expensesTimeoutId = null;
                bindExpensesEvents(state, () => {
                    loadExpenses().then(() => requestRender());
                });
            }, 100);
        }

    } finally {
        state.isRendering = false;

        // Если за время рендеринга был запрошен повторный — выполняем
        if (state._pendingRender) {
            state._pendingRender = false;
            renderContent();
        }
    }
}

// ============================================================
// Экспорт CSV
// ============================================================

function exportCsv() {
    const revenue = state.sales.reduce((s, r) => s + (r.total || 0), 0);
    const profit = state.sales.reduce((s, r) => s + (r.profit || 0), 0);
    const count = state.sales.length;
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = profit - totalExpenses;

    let csv = 'Показатель,Значение\n';
    csv += `Выручка,${revenue}\nПрибыль,${profit}\nПродаж,${count}\n`;
    csv += `Расходы,${totalExpenses}\nЧистая прибыль,${netProfit}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${state.period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================
// Экспорт PDF
// ============================================================

async function handleExportFinancialPdf() {
    const { from, to } = getPeriodDates();
    const periodStr = `${formatDate(from)} — ${formatDate(to)}`;

    const revenue = state.sales.reduce((s, r) => s + (r.total || 0), 0);
    const profit = state.sales.reduce((s, r) => s + (r.profit || 0), 0);
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    try {
        await exportFinancialReport({
            shopName: 'Чуланчик',
            period: periodStr,
            kpis: {
                revenue,
                profit,
                expenses: totalExpenses,
                netProfit: profit - totalExpenses
            },
            dailyRevenue: [],
            expensesByCategory: [],
            topExpenses: [],
            generatedAt: new Date().toISOString()
        });
        showNotification('PDF отчёт сформирован', 'success');
    } catch (err) {
        console.error('[Reports] PDF export error:', err);
        showNotification('Ошибка формирования PDF', 'error');
    }
}

async function handleExportExpensesPdf() {
    const { from, to } = getPeriodDates();
    const periodStr = `${formatDate(from)} — ${formatDate(to)}`;
    const total = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    try {
        await exportExpensesReport({
            shopName: 'Чуланчик',
            period: periodStr,
            expenses: state.expenses,
            total,
            generatedAt: new Date().toISOString()
        });
        showNotification('PDF отчёт о расходах сформирован', 'success');
    } catch (err) {
        console.error('[Reports] Expenses PDF export error:', err);
        showNotification('Ошибка формирования PDF', 'error');
    }
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('reportsContent');
    DOM.periodSelect = document.getElementById('periodSelect');
    DOM.refreshBtn = document.getElementById('refreshBtn');
    DOM.exportBtn = document.getElementById('exportBtn');
    DOM.exportPdfBtn = document.getElementById('exportPdfBtn');
}

function bindEvents() {
    DOM.periodSelect?.addEventListener('change', async (e) => {
        state.period = e.target.value;
        await loadData();
        requestRender();
    });

    DOM.refreshBtn?.addEventListener('click', async () => {
        await productStore.loadProducts({ force: true });
        await loadData();
        requestRender();
    });

    DOM.exportBtn?.addEventListener('click', exportCsv);

    if (DOM.exportPdfBtn) {
        DOM.exportPdfBtn.addEventListener('click', handleExportFinancialPdf);
    } else {
        const btn = document.getElementById('exportPdfBtn');
        if (btn) btn.addEventListener('click', handleExportFinancialPdf);
    }

    // Подписка на productStore — с защитой от рекурсии
    productStore.on('change', () => {
        if (!state.isRendering && DOM.content && document.getElementById('reportsContent')) {
            requestRender();
        }
    });

    // Подписка на expenseStore — с защитой от рекурсии
    expenseStore.on('change', () => {
        if (!state.isRendering && DOM.content && document.getElementById('reportsContent')) {
            if (state.activeTab === 'expenses' || state.activeTab === 'dashboard') {
                loadExpenses().then(() => {
                    if (!state.isRendering) requestRender();
                });
            }
        }
    });
}

async function init() {
    console.log('[Reports] init() started');

    // 1. Вставляем навигацию
    const headerHtml = renderAppHeader({
        currentPage: 'reports',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
    }

    bindAppHeaderEvents({
        onNavigate: (pageId) => {
            const pages = {
                inventory: 'pages/inventory.html',
                cashier: 'pages/cashier.html',
                reports: 'pages/reports.html'
            };
            const href = pages[pageId];
            if (href && pageId !== 'reports') {
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

    // 3. Обновляем имя пользователя
    updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    // 4. Кэшируем DOM и вешаем события
    cacheDom();
    bindEvents();

    // 5. Загружаем данные и рендерим
    await productStore.loadProducts();
    await expenseStore.loadExpenses();
    await loadData();
    requestRender();

    console.log('[Reports] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);