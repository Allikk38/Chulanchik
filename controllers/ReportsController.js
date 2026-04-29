// ============================================================
// controllers/ReportsController.js
// Шаг 6: Контроллер с табами, дашборд вынесен в компонент
// ============================================================

/**
 * Контроллер страницы отчётов.
 *
 * Координирует загрузку данных, переключение табов,
 * передаёт state в компоненты для рендеринга.
 *
 * @module controllers/ReportsController
 */

import { logout } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import { expenseStore } from '../stores/ExpenseStore.js';
import SaleRepository from '../repositories/SaleRepository.js';
import ShiftRepository from '../repositories/ShiftRepository.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';
import { renderDashboard } from '../components/ReportDashboard.js';

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
    loadError: null
};

// ============================================================
// DOM
// ============================================================

const DOM = {
    content: null,
    periodSelect: null,
    refreshBtn: null
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
// Рендеринг
// ============================================================

/**
 * Рендерит табы навигации.
 * @returns {string} HTML
 */
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

/**
 * Рендерит тело активной вкладки.
 * @returns {string} HTML
 */
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
            return renderSalesStub();

        case 'products':
            return renderProductsStub();

        case 'shifts':
            return renderShiftsStub();

        case 'expenses':
            return renderExpensesStub();

        default:
            return renderDashboard(state);
    }
}

// ============================================================
// Заглушки для табов (будут вынесены в отдельные компоненты)
// ============================================================

function renderSalesStub() {
    return `
        <div class="card">
            <h4>Продажи</h4>
            <p>Компонент в разработке</p>
        </div>`;
}

function renderProductsStub() {
    return `
        <div class="card">
            <h4>Товары</h4>
            <p>Компонент в разработке</p>
        </div>`;
}

function renderShiftsStub() {
    return `
        <div class="card">
            <h4>Смены</h4>
            <p>Компонент в разработке</p>
        </div>`;
}

function renderExpensesStub() {
    return `
        <div class="card">
            <h4>Расходы</h4>
            <p>Компонент в разработке</p>
        </div>`;
}

function renderContent() {
    if (!DOM.content) return;

    DOM.content.innerHTML = `
        ${renderTabs()}
        <div class="reports-content-inner">
            ${renderTabContent()}
        </div>`;

    // Обработчики табов
    DOM.content.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newTab = btn.dataset.tab;
            if (state.activeTab === newTab) return;
            state.activeTab = newTab;
            renderContent();
        });
    });
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('reportsContent');
    DOM.periodSelect = document.getElementById('periodSelect');
    DOM.refreshBtn = document.getElementById('refreshBtn');
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
}

async function init() {
    console.log('[Reports] v6 - separate components');
    console.log('[Reports] init() started');

    // 1. Вставляем навигацию синхронно
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

    // 2. Быстрая проверка сессии
    console.log('[Reports] checking cached session...');

    if (!hasCachedSession()) {
        console.warn('[Reports] no cached session found, redirecting to login');
        window.location.href = 'pages/login.html';
        return;
    }

    console.log('[Reports] cached session found');

    // 3. Кэшируем DOM, вешаем события, рендерим заглушку
    cacheDom();
    bindEvents();
    renderContent();

    console.log('[Reports] skeleton rendered, loading data...');

    // 4. Загружаем данные
    await loadData();
    renderContent();

    console.log('[Reports] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
