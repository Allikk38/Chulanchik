// ============================================================
// controllers/ReportsController.js
// v12.0 — 2026-04-30: добавлена кнопка PDF-экспорта
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Контроллер страницы отчётов.
//   Управляет вкладками (дашборд, продажи, товары, смены, расходы),
//   загрузкой данных за период и экспортом отчётов.
//
// ЗАВИСИМОСТИ
//   productStore         — стор товаров (ProductStore)
//   expenseStore         — стор расходов (ExpenseStore)
//   SaleRepository       — загрузка продаж из БД
//   ShiftRepository      — загрузка смен из БД
//   AppHeader            — рендеринг навигации
//   ReportDashboard      — вкладка дашборда + графики
//   ReportSales          — вкладка продаж
//   ReportProducts       — вкладка товаров + кнопка отчёта сдатчику
//   ReportShifts         — вкладка смен
//   ReportExpenses       — вкладка расходов
//   pdfExport            — экспорт финансового отчёта в PDF
//
// ПОТОК ДАННЫХ
//   1. init() при DOMContentLoaded
//   2. Проверка кэшированной сессии (без редиректа на логин)
//   3. Вставка AppHeader с навигацией
//   4. Загрузка данных за выбранный период (loadData)
//   5. renderContent() отрисовывает активную вкладку
//   6. Период можно менять через periodSelect — перезагружает данные
//   7. Кнопки: refreshBtn (перезагрузка), exportBtn (CSV), exportPdfBtn (PDF)
//
// ИЗМЕНЕНИЯ
//   v12.0 — добавлен обработчик exportPdfBtn:
//     - собирает KPI, dailyRevenue, expensesByCategory, topExpenses
//     - вызывает exportFinancialReport() из utils/pdfExport.js
//   v11.0 — добавлена поддержка кнопки «Отчёт сдатчику»
//   v10.0 — добавлена вкладка расходов с CRUD
//   v9.0  — добавлены графики (Chart.js)
//
// ============================================================

/**
 * Контроллер страницы отчётов.
 *
 * @module controllers/ReportsController
 */

import { logout } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import { expenseStore } from '../stores/ExpenseStore.js';
import SaleRepository from '../repositories/SaleRepository.js';
import ShiftRepository from '../repositories/ShiftRepository.js';
import { formatMoney, formatDate } from '../utils/formatters.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';
import { renderDashboard, drawCharts } from '../components/ReportDashboard.js';
import { renderSalesTab } from '../components/ReportSales.js';
import { renderProductsTab } from '../components/ReportProducts.js';
import { renderShiftsTab } from '../components/ReportShifts.js';
import { renderExpensesTab, bindExpensesEvents } from '../components/ReportExpenses.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    user: null,
    period: 'week',
    activeTab: 'dashboard',
    sales: [],
    shifts: [],
    expenses: [],
    isLoading: true,
    loadError: null,
    _chartsTimeoutId: null,
    _expensesTimeoutId: null
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
// Хелперы
// ============================================================

function hasCachedSession() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('-auth-token')) {
                const value = localStorage.getItem(key);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed?.access_token) {
                        return true;
                    }
                }
            }
        }
    } catch (e) {
        // битый localStorage
    }
    return false;
}

function getUserFromCache() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('-auth-token')) {
                const value = localStorage.getItem(key);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed?.user?.id) {
                        return {
                            id: parsed.user.id,
                            email: parsed.user.email || '',
                            fullName: parsed.user.user_metadata?.full_name || ''
                        };
                    }
                }
            }
        }
    } catch (e) {
        // битый localStorage
    }
    return null;
}

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

function getPeriodLabel() {
    const { from, to } = getPeriodDates();
    return `${formatDate(from)} – ${formatDate(to)}`;
}

// ============================================================
// Нормализация items (разбор JSON-строки или массива)
// ============================================================

function normalizeItems(items) {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
        try {
            const parsed = JSON.parse(items);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    return [];
}

// ============================================================
// Загрузка данных
// ============================================================

async function loadData() {
    const { from, to } = getPeriodDates();

    console.log('[Reports] loading data for period:', state.period, { from, to });

    try {
        const [products, expenses, sales, shifts] = await Promise.all([
            productStore.loadProducts(),
            expenseStore.loadExpenses(),
            SaleRepository.getAll({ from, to, limit: 200 }),
            ShiftRepository.getAll({ from, to, limit: 100 })
        ]);

        state.sales = sales;
        state.shifts = shifts;
        state.expenses = expenses;
        state.isLoading = false;
        state.loadError = null;

        console.log('[Reports] data loaded:', {
            products: products.length,
            expenses: expenses.length,
            sales: sales.length,
            shifts: shifts.length
        });

    } catch (err) {
        console.error('[Reports] loadData error:', err);
        state.isLoading = false;
        state.loadError = err.message || 'Ошибка загрузки данных';
    }
}

// ============================================================
// Экспорт CSV
// ============================================================

function exportCsv() {
    const revenue = state.sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const profit = state.sales.reduce((s, r) => s + (Number(r.profit) || 0), 0);
    const count = state.sales.length;
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = profit - totalExpenses;

    let csv = 'Показатель,Значение\n';
    csv += `Выручка,${revenue}\n`;
    csv += `Прибыль,${profit}\n`;
    csv += `Продаж,${count}\n`;
    csv += `Расходы,${totalExpenses}\n`;
    csv += `Чистая прибыль,${netProfit}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${state.period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[Reports] CSV exported');
}

// ============================================================
// Экспорт PDF
// ============================================================

async function exportPdf() {
    console.log('[Reports] PDF export started');

    // --- Вычисление KPI ---
    const revenue = state.sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const profit = state.sales.reduce((s, r) => s + (Number(r.profit) || 0), 0);
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = profit - totalExpenses;

    // --- Дневная выручка (для спарклайна) ---
    const dailyMap = new Map();
    state.sales.forEach(sale => {
        const day = sale.created_at?.slice(0, 10);
        if (!day) return;
        dailyMap.set(day, (dailyMap.get(day) || 0) + (Number(sale.total) || 0));
    });
    const dailyRevenue = [...dailyMap.entries()]
        .map(([date, rev]) => ({ date, revenue: rev }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // --- Расходы по категориям ---
    const catMap = new Map();
    state.expenses.forEach(exp => {
        const cat = exp.category || 'other';
        catMap.set(cat, (catMap.get(cat) || 0) + (Number(exp.amount) || 0));
    });
    const expensesByCategory = [...catMap.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

    // --- Топ-5 расходов ---
    const topExpenses = [...state.expenses]
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 5)
        .map(e => ({
            category: e.category || 'other',
            amount: Number(e.amount) || 0,
            description: e.description || ''
        }));

    // --- Вызов экспорта ---
    try {
        const { exportFinancialReport } = await import('../utils/pdfExport.js');
        await exportFinancialReport({
            shopName: 'Чуланчик',
            period: getPeriodLabel(),
            kpis: { revenue, profit, expenses: totalExpenses, netProfit },
            dailyRevenue,
            expensesByCategory,
            topExpenses,
            generatedAt: new Date().toISOString()
        });
        console.log('[Reports] PDF exported successfully');
    } catch (err) {
        console.error('[Reports] PDF export error:', err);
        // Импортируем showNotification динамически чтобы не плодить циклические зависимости
        const { showNotification } = await import('../utils/ui.js');
        showNotification('Не удалось создать PDF. Проверьте подключение к интернету.', 'error');
    }
}

// ============================================================
// Рендеринг
// ============================================================

function renderTabs() {
    const tabs = ['dashboard', 'sales', 'products', 'shifts', 'expenses'];
    const labels = {
        dashboard: 'Дашборд',
        sales: 'Продажи',
        products: 'Товары',
        shifts: 'Смены',
        expenses: 'Расходы'
    };

    return `
        <div class="reports-tabs" role="tablist">
            ${tabs.map(t => `
                <button class="tab-btn ${state.activeTab === t ? 'active' : ''}"
                    data-tab="${t}" role="tab"
                    aria-selected="${state.activeTab === t}">
                    ${labels[t]}
                </button>
            `).join('')}
        </div>`;
}

function renderTabContent() {
    if (state.isLoading) {
        return `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <span class="loading-text">Загрузка данных...</span>
            </div>`;
    }

    if (state.loadError) {
        return `
            <div class="error-state">
                <div class="error-state-icon">!</div>
                <p>Ошибка загрузки данных</p>
                <small>${state.loadError}</small>
            </div>`;
    }

    switch (state.activeTab) {
        case 'dashboard':
            return renderDashboard(state);
        case 'sales':
            return renderSalesTab(state);
        case 'products':
            return renderProductsTab(state);
        case 'shifts':
            return renderShiftsTab(state);
        case 'expenses':
            return renderExpensesTab(state);
        default:
            return renderDashboard(state);
    }
}

function renderContent() {
    if (!DOM.content) return;

    if (state._chartsTimeoutId !== null) {
        clearTimeout(state._chartsTimeoutId);
        state._chartsTimeoutId = null;
    }
    if (state._expensesTimeoutId !== null) {
        clearTimeout(state._expensesTimeoutId);
        state._expensesTimeoutId = null;
    }

    DOM.content.innerHTML = `
        ${renderTabs()}
        <div class="reports-content-inner">
            ${renderTabContent()}
        </div>`;

    DOM.content.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newTab = btn.dataset.tab;
            if (state.activeTab === newTab) return;
            state.activeTab = newTab;
            renderContent();
        });
    });

    // Графики
    if (state.activeTab === 'dashboard' && !state.isLoading && !state.loadError) {
        state._chartsTimeoutId = setTimeout(() => {
            state._chartsTimeoutId = null;
            try {
                drawCharts(state);
            } catch (err) {
                console.error('[Reports] drawCharts error:', err);
            }
        }, 200);
    }

    // Расходы
    if (state.activeTab === 'expenses' && !state.isLoading && !state.loadError) {
        state._expensesTimeoutId = setTimeout(() => {
            state._expensesTimeoutId = null;
            bindExpensesEvents(state, () => {
                loadData().then(() => renderContent());
            });
        }, 100);
    }

    // Товары — кнопка «Отчёт сдатчику»
    if (state.activeTab === 'products' && !state.isLoading && !state.loadError) {
        import('../components/ReportProducts.js').then(module => {
            if (state.activeTab === 'products') {
                module.bindProductsEvents();
            }
        });
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
        state.isLoading = true;
        renderContent();
        await loadData();
        renderContent();
    });

    DOM.refreshBtn?.addEventListener('click', async () => {
        state.isLoading = true;
        renderContent();
        await loadData();
        renderContent();
    });

    DOM.exportBtn?.addEventListener('click', () => {
        exportCsv();
    });

    DOM.exportPdfBtn?.addEventListener('click', () => {
        exportPdf();
    });
}

async function init() {
    console.log('[Reports] v12 - PDF export button handler added');
    console.log('[Reports] init() started');

    // 1. Навигация
    const headerHtml = renderAppHeader({
        currentPage: 'reports',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
        console.log('[Reports] header inserted into .app');
    } else {
        console.error('[Reports] .app element not found in DOM');
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

    // 2. Сессия
    console.log('[Reports] checking cached session...');

    if (!hasCachedSession()) {
        console.warn('[Reports] no cached session found, redirecting to login');
        window.location.href = 'pages/login.html';
        return;
    }

    console.log('[Reports] cached session found');

    const cachedUser = getUserFromCache();
    if (cachedUser) {
        state.user = cachedUser;
        updateUserName(cachedUser.fullName || cachedUser.email?.split('@')[0] || 'Пользователь');
        console.log('[Reports] user loaded from cache:', cachedUser.email);
    }

    // 3. DOM и события
    cacheDom();
    bindEvents();
    renderContent();

    console.log('[Reports] skeleton rendered, loading data...');

    // 4. Загрузка данных
    await loadData();
    renderContent();

    console.log('[Reports] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
