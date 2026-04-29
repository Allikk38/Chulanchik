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

import { requireAuth, logout, hasPermission } from '../core/auth.js';
import { productStore } from '../stores/ProductStore.js';
import { expenseStore } from '../stores/ExpenseStore.js';
import ExpenseService from '../services/ExpenseService.js';
import SaleRepository from '../repositories/SaleRepository.js';
import ShiftRepository from '../repositories/ShiftRepository.js';
import {
    formatMoney, formatNumber, formatPercent,
    formatDate, formatDateTime, getCategoryName,
    getPaymentMethodName, getStatusText
} from '../utils/formatters.js';
import { showNotification, showConfirmDialog } from '../utils/ui.js';
import { openExpenseFormModal } from '../components/ExpenseForm.js';
import { renderExpenseTable, renderExpenseFilters, bindExpenseListEvents, showReceiptModal } from '../components/ExpenseList.js';
import { exportFinancialReport, exportExpensesReport } from '../utils/pdfExport.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';

// ============================================================
// Локальное состояние
// ============================================================

const state = {
    user: null,
    period: 'week',
    activeTab: 'dashboard',

    sales: [],
    shifts: [],

    // Фильтры для расходов
    expenseFilters: {
        fromDate: '',
        toDate: '',
        category: ''
    },
    expenses: [],
    isLoadingExpenses: false
};

// ============================================================
// DOM
// ============================================================

const DOM = {
    content: null,
    periodSelect: null,
    refreshBtn: null,
    exportBtn: null,
    exportPdfBtn: null,
    exportExpensesPdfBtn: null,
    addExpenseBtn: null
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
            from = new Date(now).setDate(now.getDate() - 7).toISOString();
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

        let fromDate, toDate;

        if (state.expenseFilters.fromDate) {
            fromDate = state.expenseFilters.fromDate;
        }
        if (state.expenseFilters.toDate) {
            toDate = state.expenseFilters.toDate;
        }

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
// Вычисления
// ============================================================

function computeOverview() {
    const sales = state.sales;
    const revenue = sales.reduce((s, r) => s + (r.total || 0), 0);
    const profit = sales.reduce((s, r) => s + (r.profit || 0), 0);
    const count = sales.length;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgCheck = count > 0 ? revenue / count : 0;
    const inStock = productStore.getStats().inStock;
    const stockValue = productStore.getStats().stockValue;
    const potentialProfit = productStore.getStats().potentialProfit;

    const totalExpenses = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = profit - totalExpenses;

    return { revenue, profit, margin, count, avgCheck, inStock, stockValue, potentialProfit, totalExpenses, netProfit };
}

function computeTopProducts(limit = 5) {
    const map = new Map();
    state.sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            const key = item.id || item.name;
            if (!map.has(key)) {
                map.set(key, { name: item.name, quantity: 0, revenue: 0 });
            }
            const entry = map.get(key);
            entry.quantity += item.quantity || 0;
            entry.revenue += (item.price || 0) * (item.quantity || 0);
        });
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

function computeTopCategories(limit = 5) {
    const map = new Map();
    state.sales.forEach(sale => {
        (sale.items || []).forEach(item => {
            const product = productStore.getById(item.id);
            const cat = product?.category || 'other';
            if (!map.has(cat)) map.set(cat, { category: cat, quantity: 0, revenue: 0 });
            const entry = map.get(cat);
            entry.quantity += item.quantity || 0;
            entry.revenue += (item.price || 0) * (item.quantity || 0);
        });
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

function computeShiftsBySeller() {
    const bySeller = {};
    state.shifts.forEach(shift => {
        const name = shift.seller_name || shift.user_name || 'Неизвестный';
        if (!bySeller[name]) {
            bySeller[name] = { shifts: 0, salesCount: 0, revenue: 0, profit: 0 };
        }
        bySeller[name].shifts += 1;
        bySeller[name].salesCount += shift.sales_count || 0;
        bySeller[name].revenue += shift.total_revenue || 0;
        bySeller[name].profit += shift.total_profit || 0;
    });
    return bySeller;
}

function computeSlowMoving(days = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    return productStore.getInStock()
        .filter(p => p.created_at && new Date(p.created_at) < threshold)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, 10)
        .map(p => ({
            ...p,
            daysInStock: Math.floor((Date.now() - new Date(p.created_at)) / (1000 * 60 * 60 * 24))
        }));
}

function getDailyRevenue() {
    const dailyMap = new Map();
    state.sales.forEach(sale => {
        const day = sale.created_at?.slice(0, 10);
        if (!day) return;
        if (!dailyMap.has(day)) dailyMap.set(day, { date: day, revenue: 0 });
        dailyMap.get(day).revenue += sale.total || 0;
    });
    return [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getExpensesByCategory() {
    const map = new Map();
    state.expenses.forEach(expense => {
        const cat = expense.category || 'other';
        if (!map.has(cat)) map.set(cat, { category: cat, amount: 0 });
        map.get(cat).amount += expense.amount || 0;
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function getTopExpenses(limit = 5) {
    return [...state.expenses]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit);
}

// ============================================================
// Рендеринг — Дашборд
// ============================================================

function renderKpiCards(overview) {
    const kpis = [
        { title: 'Выручка', value: formatMoney(overview.revenue), label: 'R' },
        { title: 'Прибыль', value: formatMoney(overview.profit), label: 'P' },
        { title: 'Маржинальность', value: formatPercent(overview.margin, { isFraction: false, decimals: 1 }), label: 'M' },
        { title: 'Продаж', value: formatNumber(overview.count), label: 'N' }
    ];

    return `
        <div class="kpi-grid">
            ${kpis.map(k => `
                <div class="kpi-card">
                    <div class="kpi-header">
                        <span class="kpi-icon">${k.label}</span>
                        <span class="kpi-title">${k.title}</span>
                    </div>
                    <div class="kpi-value">${k.value}</div>
                </div>
            `).join('')}
        </div>`;
}

function renderInventoryKpis(overview) {
    return `
        <div class="kpi-grid" style="margin-top:var(--spacing-4)">
            <div class="kpi-card"><div class="kpi-header"><span class="kpi-icon">S</span><span class="kpi-title">В наличии</span></div><div class="kpi-value">${formatNumber(overview.inStock)}</div></div>
            <div class="kpi-card"><div class="kpi-header"><span class="kpi-icon">V</span><span class="kpi-title">Стоимость склада</span></div><div class="kpi-value">${formatMoney(overview.stockValue)}</div></div>
            <div class="kpi-card"><div class="kpi-header"><span class="kpi-icon">E</span><span class="kpi-title">Потенц. прибыль</span></div><div class="kpi-value ${overview.potentialProfit >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(overview.potentialProfit)}</div></div>
            <div class="kpi-card"><div class="kpi-header"><span class="kpi-icon">A</span><span class="kpi-title">Средний чек</span></div><div class="kpi-value">${formatMoney(overview.avgCheck)}</div></div>
        </div>`;
}

function renderNetProfitCard(overview) {
    const netProfitClass = overview.netProfit >= 0 ? 'text-success' : 'text-danger';
    return `
        <div class="kpi-card net-profit-card" style="border-left-color: var(--color-primary); background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
            <div class="kpi-header">
                <span class="kpi-icon" style="color: white;">$</span>
                <span class="kpi-title" style="color: #94a3b8;">ЧИСТАЯ ПРИБЫЛЬ</span>
            </div>
            <div class="kpi-value" style="color: white; font-size: 28px;">${formatMoney(overview.netProfit)}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                Прибыль: ${formatMoney(overview.profit)} | Расходы: -${formatMoney(overview.totalExpenses)}
            </div>
        </div>`;
}

function renderDashboard() {
    const overview = computeOverview();
    const topProducts = computeTopProducts();
    const topCategories = computeTopCategories();
    const recentExpenses = state.expenses.slice(0, 5);
    const totalExpenses = overview.totalExpenses;

    return `
        <div class="dashboard-content">
            ${renderKpiCards(overview)}
            <div class="kpi-grid">
                ${renderNetProfitCard(overview)}
            </div>
            ${renderInventoryKpis(overview)}

            ${totalExpenses > 0 ? `
            <div class="expenses-summary-card">
                <div class="card-header">
                    <h4>$ Расходы за период</h4>
                    <button class="btn-ghost btn-sm" id="viewAllExpensesBtn">Все расходы</button>
                </div>
                <div class="expenses-summary-stats">
                    <div class="expense-stat">
                        <span class="expense-stat-label">Всего расходов</span>
                        <span class="expense-stat-value">${formatMoney(totalExpenses)}</span>
                    </div>
                    <div class="expense-stat">
                        <span class="expense-stat-label">Количество операций</span>
                        <span class="expense-stat-value">${state.expenses.length}</span>
                    </div>
                </div>
                ${recentExpenses.length > 0 ? `
                <div class="recent-expenses-list">
                    ${recentExpenses.map(exp => `
                        <div class="recent-expense-item">
                            <div class="expense-info">
                                <span class="expense-category">${getExpenseCategoryLabel(exp.category)}</span>
                                <span class="expense-description">${escapeHtml(exp.description?.slice(0, 40) || '')}</span>
                            </div>
                            <div class="expense-amount">${formatMoney(exp.amount)}</div>
                        </div>
                    `).join('')}
                </div>
                ` : '<div class="empty-message">Нет расходов за период</div>'}
            </div>
            ` : ''}

            <div class="charts-row">
                <div class="chart-card"><h4>Выручка и прибыль по дням</h4><div class="chart-container"><canvas id="revenueChart"></canvas></div></div>
                <div class="chart-card"><h4>Категории</h4><div class="chart-container"><canvas id="categoryChart"></canvas></div></div>
            </div>
            <div class="dashboard-bottom">
                <div class="card"><h4>Топ-5 товаров</h4>
                    ${topProducts.length === 0 ? '<div class="empty-message">Нет данных</div>' :
                        topProducts.map((p, i) => `<div class="top-product-item"><span class="rank">#${i + 1}</span><div class="name">${escapeHtml(p.name)}</div><div class="value">${p.quantity} шт.</div><div class="revenue">${formatMoney(p.revenue)}</div></div>`).join('')}
                </div>
                <div class="card"><h4>Топ-5 категорий</h4>
                    ${topCategories.length === 0 ? '<div class="empty-message">Нет данных</div>' :
                        topCategories.map((c, i) => `<div class="top-product-item"><span class="rank">#${i + 1}</span><div class="name">${getCategoryName(c.category)}</div><div class="value">${c.quantity} шт.</div><div class="revenue">${formatMoney(c.revenue)}</div></div>`).join('')}
                </div>
            </div>
        </div>`;
}

// ============================================================
// Рендеринг — Таблицы
// ============================================================

function renderSalesTab() {
    const overview = computeOverview();
    return `
        <div class="summary-cards">
            <div class="summary-card"><span class="label">Всего продаж</span><span class="value">${formatNumber(overview.count)}</span></div>
            <div class="summary-card"><span class="label">Выручка</span><span class="value">${formatMoney(overview.revenue)}</span></div>
            <div class="summary-card"><span class="label">Прибыль</span><span class="value">${formatMoney(overview.profit)}</span></div>
            <div class="summary-card"><span class="label">Средний чек</span><span class="value">${formatMoney(overview.avgCheck)}</span></div>
        </div>
        ${state.sales.length === 0 ? '<div class="empty-state">Нет продаж за период</div>' : `
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Дата</th><th>Товаров</th><th>Сумма</th><th>Прибыль</th><th>Оплата</th></tr></thead>
                    <tbody>${state.sales.slice(0, 50).map(s => `
                        <tr>
                            <td>${formatDateTime(s.created_at)}</td>
                            <td>${(s.items || []).length} поз.</td>
                            <td class="money">${formatMoney(s.total)}</td>
                            <td class="money">${formatMoney(s.profit)}</td>
                            <td>${getPaymentMethodName(s.payment_method)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}`;
}

function renderProductsTab() {
    const topProducts = computeTopProducts(10);
    const slowMoving = computeSlowMoving();
    const stats = productStore.getStats();

    return `
        <div class="summary-cards">
            <div class="summary-card"><span class="label">Стоимость склада</span><span class="value">${formatMoney(stats.stockValue)}</span></div>
            <div class="summary-card"><span class="label">Потенц. прибыль</span><span class="value ${stats.potentialProfit >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(stats.potentialProfit)}</span></div>
        </div>
        <div class="two-columns">
            <div class="card"><h4>Самые продаваемые</h4>
                ${topProducts.length === 0 ? '<div class="empty-message">Нет данных</div>' :
                    topProducts.map((p, i) => `<div class="top-product-item"><span class="rank">#${i + 1}</span><div class="name">${escapeHtml(p.name)}</div><div class="value">${p.quantity} шт.</div><div class="revenue">${formatMoney(p.revenue)}</div></div>`).join('')}
            </div>
            <div class="card"><h4>Залежавшиеся (более 30 дн.)</h4>
                ${slowMoving.length === 0 ? '<div class="empty-message">Нет</div>' :
                    slowMoving.map(p => `<div class="slow-item"><span class="name">${escapeHtml(p.name)}</span><span class="days">${p.daysInStock} дн.</span><span class="price">${formatMoney(p.price)}</span></div>`).join('')}
            </div>
        </div>`;
}

function renderShiftsTab() {
    const bySeller = computeShiftsBySeller();
    const summary = {
        totalShifts: state.shifts.length,
        activeShifts: state.shifts.filter(s => !s.closed_at).length,
        totalRevenue: state.shifts.reduce((s, sh) => s + (sh.total_revenue || 0), 0),
        totalProfit: state.shifts.reduce((s, sh) => s + (sh.total_profit || 0), 0)
    };

    return `
        <div class="summary-cards">
            <div class="summary-card"><span class="label">Всего смен</span><span class="value">${formatNumber(summary.totalShifts)}</span></div>
            <div class="summary-card"><span class="label">Активных</span><span class="value">${formatNumber(summary.activeShifts)}</span></div>
            <div class="summary-card"><span class="label">Выручка</span><span class="value">${formatMoney(summary.totalRevenue)}</span></div>
            <div class="summary-card"><span class="label">Прибыль</span><span class="value">${formatMoney(summary.totalProfit)}</span></div>
        </div>
        <div class="card" style="margin-bottom:24px"><h4>По продавцам</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Продавец</th><th>Смен</th><th>Продаж</th><th>Выручка</th><th>Прибыль</th></tr></thead>
                    <tbody>${Object.entries(bySeller).map(([name, s]) => `
                        <tr>
                            <td>${escapeHtml(name)}</td>
                            <td>${s.shifts}</td>
                            <td>${s.salesCount}</td>
                            <td class="money">${formatMoney(s.revenue)}</td>
                            <td class="money">${formatMoney(s.profit)}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
        </div>
        <div class="card"><h4>Список смен</h4>
            ${state.shifts.length === 0 ? '<div class="empty-message">Нет смен</div>' : `
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Открыта</th><th>Закрыта</th><th>Продавец</th><th>Продаж</th><th>Выручка</th><th>Статус</th></tr></thead>
                        <tbody>${state.shifts.map(s => `
                            <tr>
                                <td>${formatDateTime(s.opened_at)}</td>
                                <td>${s.closed_at ? formatDateTime(s.closed_at) : '--'}</td>
                                <td>${escapeHtml(s.seller_name || s.user_name || '--')}</td>
                                <td>${s.sales_count || 0}</td>
                                <td class="money">${formatMoney(s.total_revenue || 0)}</td>
                                <td><span class="status-badge ${s.closed_at ? 'status-sold' : 'status-in_stock'}">${s.closed_at ? 'Закрыта' : 'Активна'}</span></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`}
        </div>`;
}

function renderExpensesTab() {
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return `
        <div class="expenses-tab-header">
            <div class="expenses-actions">
                <button class="btn-primary" id="addExpenseBtn">+ Добавить расход</button>
                <button class="btn-secondary" id="exportExpensesPdfBtn">$ Экспорт PDF</button>
            </div>
            ${renderExpenseFilters({
                fromDate: state.expenseFilters.fromDate,
                toDate: state.expenseFilters.toDate,
                category: state.expenseFilters.category
            })}
        </div>

        <div class="expenses-summary">
            <div class="summary-card">
                <span class="label">Всего расходов</span>
                <span class="value ${totalExpenses > 0 ? 'text-danger' : ''}">${formatMoney(totalExpenses)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Количество</span>
                <span class="value">${state.expenses.length}</span>
            </div>
        </div>

        <div id="expensesTableContainer">
            ${renderExpenseTable({
                expenses: state.expenses,
                isLoading: state.isLoadingExpenses,
                onEdit: (id) => editExpense(id),
                onDelete: (id) => deleteExpense(id)
            })}
        </div>
    `;
}

function getExpenseCategoryLabel(category) {
    const labels = {
        rent: 'Аренда',
        advertising: 'Реклама',
        supplies: 'Хозтовары',
        utilities: 'Коммунальные',
        salary: 'Зарплата',
        taxes: 'Налоги',
        repair: 'Ремонт',
        other: 'Прочее'
    };
    return labels[category] || category;
}

// ============================================================
// Действия с расходами
// ============================================================

async function addExpense() {
    if (!hasPermission('expenses:create')) {
        showNotification('Недостаточно прав', 'error');
        return;
    }

    const result = await openExpenseFormModal({
        mode: 'create',
        userId: state.user?.id
    });

    if (result) {
        showNotification(`Расход на ${formatMoney(result.amount)} добавлен`, 'success');
        await loadExpenses();
        renderContent();
    }
}

async function editExpense(id) {
    const expense = expenseStore.getById(id);
    if (!expense) {
        showNotification('Расход не найден', 'error');
        return;
    }

    const result = await openExpenseFormModal({
        mode: 'edit',
        initialData: expense,
        userId: state.user?.id
    });

    if (result) {
        showNotification(`Расход обновлён`, 'success');
        await loadExpenses();
        renderContent();
    }
}

async function deleteExpense(id) {
    const result = await ExpenseService.remove(id);

    if (result.success) {
        showNotification('Расход удалён', 'success');
        await loadExpenses();
        renderContent();
    } else {
        showNotification(result.error || 'Ошибка удаления', 'error');
    }
}

// ============================================================
// PDF Экспорт
// ============================================================

async function handleExportFinancialPdf() {
    const overview = computeOverview();
    const dailyRevenue = getDailyRevenue();
    const expensesByCategory = getExpensesByCategory();
    const topExpenses = getTopExpenses(5);
    const { from, to } = getPeriodDates();

    const periodStr = `${formatDate(from)} — ${formatDate(to)}`;

    try {
        await exportFinancialReport({
            shopName: 'Чуланчик',
            period: periodStr,
            kpis: {
                revenue: overview.revenue,
                profit: overview.profit,
                expenses: overview.totalExpenses,
                netProfit: overview.netProfit
            },
            dailyRevenue,
            expensesByCategory,
            topExpenses,
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
// Рендеринг верхнего уровня
// ============================================================

function renderContent() {
    if (!DOM.content) return;

    const tabs = ['dashboard', 'sales', 'products', 'shifts', 'expenses'];

    let body = '<div class="reports-loader">Загрузка...</div>';

    switch (state.activeTab) {
        case 'dashboard': body = renderDashboard(); break;
        case 'sales': body = renderSalesTab(); break;
        case 'products': body = renderProductsTab(); break;
        case 'shifts': body = renderShiftsTab(); break;
        case 'expenses': body = renderExpensesTab(); break;
    }

    DOM.content.innerHTML = `
        <div class="reports-tabs" role="tablist">
            ${tabs.map(t => `
                <button class="tab-btn ${state.activeTab === t ? 'active' : ''}" data-tab="${t}" role="tab" aria-selected="${state.activeTab === t}">
                    ${t === 'dashboard' ? 'Дашборд' : t === 'sales' ? 'Продажи' : t === 'products' ? 'Товары' : t === 'shifts' ? 'Смены' : 'Расходы'}
                </button>
            `).join('')}
        </div>
        <div class="reports-content-inner">${body}</div>`;

    DOM.content.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.activeTab = btn.dataset.tab;
            renderContent();
        });
    });

    if (state.activeTab === 'dashboard') {
        setTimeout(() => drawCharts(), 100);
    }

    if (state.activeTab === 'expenses') {
        setTimeout(() => bindExpensesEvents(), 100);
    }
}

function bindExpensesEvents() {
    const expensesContainer = document.getElementById('expensesTableContainer');
    if (expensesContainer) {
        bindExpenseListEvents(expensesContainer, {
            onEdit: (id) => editExpense(id),
            onDelete: (id) => deleteExpense(id),
            onViewReceipt: (url) => showReceiptModal(url)
        });
    }

    DOM.addExpenseBtn = document.getElementById('addExpenseBtn');
    if (DOM.addExpenseBtn) {
        DOM.addExpenseBtn.addEventListener('click', addExpense);
    }

    DOM.exportExpensesPdfBtn = document.getElementById('exportExpensesPdfBtn');
    if (DOM.exportExpensesPdfBtn) {
        DOM.exportExpensesPdfBtn.addEventListener('click', handleExportExpensesPdf);
    }

    const fromDateInput = document.getElementById('expenseFromDate');
    const toDateInput = document.getElementById('expenseToDate');
    const categorySelect = document.getElementById('expenseCategory');
    const resetBtn = document.getElementById('resetExpenseFilters');

    if (fromDateInput) {
        fromDateInput.addEventListener('change', async () => {
            state.expenseFilters.fromDate = fromDateInput.value;
            await loadExpenses();
            renderContent();
        });
    }

    if (toDateInput) {
        toDateInput.addEventListener('change', async () => {
            state.expenseFilters.toDate = toDateInput.value;
            await loadExpenses();
            renderContent();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', async () => {
            state.expenseFilters.category = categorySelect.value;
            await loadExpenses();
            renderContent();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            state.expenseFilters = { fromDate: '', toDate: '', category: '' };
            await loadExpenses();
            renderContent();
        });
    }
}

async function drawCharts() {
    try {
        const { drawRevenueChart, drawCategoryChart } = await import('../components/Charts.js');

        const dailyMap = new Map();

        state.sales.forEach(sale => {
            const day = sale.created_at?.slice(0, 10);
            if (!day) return;
            if (!dailyMap.has(day)) dailyMap.set(day, { date: day, revenue: 0, profit: 0, count: 0 });
            const d = dailyMap.get(day);
            d.revenue += sale.total || 0;
            d.profit += sale.profit || 0;
            d.count += 1;
        });

        const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

        const catMap = new Map();
        state.sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                const product = productStore.getById(item.id);
                const cat = product?.category || 'other';
                if (!catMap.has(cat)) catMap.set(cat, { category: cat, revenue: 0 });
                catMap.get(cat).revenue += (item.price || 0) * (item.quantity || 0);
            });
        });

        const categories = [...catMap.values()];

        drawRevenueChart(daily);
        drawCategoryChart(categories);

    } catch (err) {
        console.error('[Reports] drawCharts error:', err);
    }
}

// ============================================================
// Экспорт CSV
// ============================================================

function exportCsv() {
    const overview = computeOverview();
    const topProducts = computeTopProducts(20);
    const bySeller = computeShiftsBySeller();

    let csv = 'Показатель,Значение\n';
    csv += `Выручка,${overview.revenue}\nПрибыль,${overview.profit}\nМаржинальность,${overview.margin.toFixed(1)}%\nПродаж,${overview.count}\nСредний чек,${overview.avgCheck.toFixed(0)}\n`;
    csv += `Расходы,${overview.totalExpenses}\nЧистая прибыль,${overview.netProfit}\n`;

    csv += '\n\nТоп товаров\nНазвание,Количество,Выручка\n';
    topProducts.forEach(p => csv += `"${p.name}",${p.quantity},${p.revenue}\n`);

    csv += '\n\nПо продавцам\nПродавец,Смен,Продаж,Выручка,Прибыль\n';
    Object.entries(bySeller).forEach(([name, s]) => csv += `"${name}",${s.shifts},${s.salesCount},${s.revenue},${s.profit}\n`);

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${state.period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        renderContent();
    });

    DOM.refreshBtn?.addEventListener('click', async () => {
        await productStore.loadProducts({ force: true });
        await loadData();
        renderContent();
    });

    DOM.exportBtn?.addEventListener('click', exportCsv);

    if (DOM.exportPdfBtn) {
        DOM.exportPdfBtn.addEventListener('click', handleExportFinancialPdf);
    } else {
        const btn = document.getElementById('exportPdfBtn');
        if (btn) btn.addEventListener('click', handleExportFinancialPdf);
    }

    productStore.on('change', () => {
        if (DOM.content) renderContent();
    });

    expenseStore.on('change', () => {
        if (DOM.content && (state.activeTab === 'expenses' || state.activeTab === 'dashboard')) {
            loadExpenses().then(() => renderContent());
        }
    });
}

async function init() {
    const { user, authError } = await requireAuth();
    if (authError || !user) {
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;

    // Рендерим шапку через AppHeader
    const headerHtml = renderAppHeader({
        currentPage: 'reports',
        userName: user.fullName || user.email?.split('@')[0] || 'Пользователь'
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

    cacheDom();
    bindEvents();

    await productStore.loadProducts();
    await expenseStore.loadExpenses();
    await loadData();
    renderContent();
}

// ============================================================
// Хелперы
// ============================================================

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
