// ============================================================
// components/ReportDashboard.js
// ============================================================

/**
 * Компонент дашборда и таблиц для страницы отчётов.
 *
 * Чистый UI. Все функции рендеринга принимают state
 * и возвращают HTML-строку.
 *
 * @module components/ReportDashboard
 */

import { productStore } from '../stores/ProductStore.js';
import {
    formatMoney,
    formatNumber,
    formatPercent,
    formatDate,
    formatDateTime,
    getCategoryName,
    getPaymentMethodName,
    escapeHtml
} from '../utils/formatters.js';

// ============================================================
// Вычисления
// ============================================================

function computeOverview(state) {
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

function computeTopProducts(state, limit = 5) {
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

function computeTopCategories(state, limit = 5) {
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

function computeShiftsBySeller(state) {
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
// Рендеринг — Дашборд
// ============================================================

function renderKpiCards(overview) {
    const kpis = [
        { title: 'Выручка', value: formatMoney(overview.revenue), icon: 'R' },
        { title: 'Прибыль', value: formatMoney(overview.profit), icon: 'P' },
        { title: 'Маржинальность', value: formatPercent(overview.margin, { isFraction: false, decimals: 1 }), icon: 'M' },
        { title: 'Продаж', value: formatNumber(overview.count), icon: 'N' }
    ];

    return `
        <div class="kpi-grid">
            ${kpis.map(k => `
                <div class="kpi-card">
                    <div class="kpi-header">
                        <span class="kpi-icon">${k.icon}</span>
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
            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-icon">S</span>
                    <span class="kpi-title">В наличии</span>
                </div>
                <div class="kpi-value">${formatNumber(overview.inStock)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-icon">V</span>
                    <span class="kpi-title">Стоимость склада</span>
                </div>
                <div class="kpi-value">${formatMoney(overview.stockValue)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-icon">E</span>
                    <span class="kpi-title">Потенц. прибыль</span>
                </div>
                <div class="kpi-value ${overview.potentialProfit >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(overview.potentialProfit)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-header">
                    <span class="kpi-icon">A</span>
                    <span class="kpi-title">Средний чек</span>
                </div>
                <div class="kpi-value">${formatMoney(overview.avgCheck)}</div>
            </div>
        </div>`;
}

function renderNetProfitCard(overview) {
    const netProfitClass = overview.netProfit >= 0 ? 'text-success' : 'text-danger';
    return `
        <div class="kpi-grid">
            <div class="kpi-card net-profit-card">
                <div class="kpi-header">
                    <span class="kpi-icon">$</span>
                    <span class="kpi-title">ЧИСТАЯ ПРИБЫЛЬ</span>
                </div>
                <div class="kpi-value ${netProfitClass}">${formatMoney(overview.netProfit)}</div>
                <div style="font-size: 11px; color: #8c7b6e; margin-top: 4px;">
                    Прибыль: ${formatMoney(overview.profit)} | Расходы: -${formatMoney(overview.totalExpenses)}
                </div>
            </div>
        </div>`;
}

function renderExpensesSummaryCard(state, overview) {
    const totalExpenses = overview.totalExpenses;
    if (totalExpenses <= 0 && state.expenses.length === 0) return '';

    const recentExpenses = state.expenses.slice(0, 5);

    return `
        <div class="expenses-summary-card">
            <div class="card-header">
                <h4>Расходы за период</h4>
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
                                <span class="expense-description">${escapeHtml((exp.description || '').slice(0, 40))}</span>
                            </div>
                            <div class="expense-amount">${formatMoney(exp.amount)}</div>
                        </div>
                    `).join('')}
                </div>
            ` : '<div class="empty-message">Нет расходов за период</div>'}
        </div>`;
}

// ============================================================
// Рендеринг — Дашборд (сборка)
// ============================================================

export function renderDashboard(state) {
    const overview = computeOverview(state);
    const topProducts = computeTopProducts(state);
    const topCategories = computeTopCategories(state);

    return `
        <div class="dashboard-content">
            ${renderKpiCards(overview)}
            ${renderNetProfitCard(overview)}
            ${renderInventoryKpis(overview)}
            ${renderExpensesSummaryCard(state, overview)}

            <div class="charts-row">
                <div class="chart-card">
                    <h4>Выручка и прибыль по дням</h4>
                    <div class="chart-container">
                        <canvas id="revenueChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <h4>Категории</h4>
                    <div class="chart-container">
                        <canvas id="categoryChart"></canvas>
                    </div>
                </div>
            </div>

            <div class="dashboard-bottom">
                <div class="card">
                    <h4>Топ-5 товаров</h4>
                    ${topProducts.length === 0
                        ? '<div class="empty-message">Нет данных</div>'
                        : topProducts.map((p, i) => `
                            <div class="top-product-item">
                                <span class="rank">#${i + 1}</span>
                                <div class="name">${escapeHtml(p.name)}</div>
                                <div class="value">${p.quantity} шт.</div>
                                <div class="revenue">${formatMoney(p.revenue)}</div>
                            </div>
                        `).join('')}
                </div>
                <div class="card">
                    <h4>Топ-5 категорий</h4>
                    ${topCategories.length === 0
                        ? '<div class="empty-message">Нет данных</div>'
                        : topCategories.map((c, i) => `
                            <div class="top-product-item">
                                <span class="rank">#${i + 1}</span>
                                <div class="name">${getCategoryName(c.category)}</div>
                                <div class="value">${c.quantity} шт.</div>
                                <div class="revenue">${formatMoney(c.revenue)}</div>
                            </div>
                        `).join('')}
                </div>
            </div>
        </div>`;
}

// ============================================================
// Рендеринг — Продажи
// ============================================================

export function renderSalesTab(state) {
    const overview = computeOverview(state);

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Всего продаж</span>
                <span class="value">${formatNumber(overview.count)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Выручка</span>
                <span class="value">${formatMoney(overview.revenue)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Прибыль</span>
                <span class="value">${formatMoney(overview.profit)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Средний чек</span>
                <span class="value">${formatMoney(overview.avgCheck)}</span>
            </div>
        </div>
        ${state.sales.length === 0
            ? '<div class="empty-state">Нет продаж за период</div>'
            : `
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Товаров</th>
                                <th>Сумма</th>
                                <th>Прибыль</th>
                                <th>Оплата</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.sales.slice(0, 50).map(s => `
                                <tr>
                                    <td>${formatDateTime(s.created_at)}</td>
                                    <td>${(s.items || []).length} поз.</td>
                                    <td class="money">${formatMoney(s.total)}</td>
                                    <td class="money">${formatMoney(s.profit)}</td>
                                    <td>${getPaymentMethodName(s.payment_method)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`}`;
}

// ============================================================
// Рендеринг — Товары
// ============================================================

export function renderProductsTab(state) {
    const topProducts = computeTopProducts(state, 10);
    const slowMoving = computeSlowMoving();
    const stats = productStore.getStats();

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Стоимость склада</span>
                <span class="value">${formatMoney(stats.stockValue)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Потенц. прибыль</span>
                <span class="value ${stats.potentialProfit >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(stats.potentialProfit)}</span>
            </div>
        </div>
        <div class="two-columns">
            <div class="card">
                <h4>Самые продаваемые</h4>
                ${topProducts.length === 0
                    ? '<div class="empty-message">Нет данных</div>'
                    : topProducts.map((p, i) => `
                        <div class="top-product-item">
                            <span class="rank">#${i + 1}</span>
                            <div class="name">${escapeHtml(p.name)}</div>
                            <div class="value">${p.quantity} шт.</div>
                            <div class="revenue">${formatMoney(p.revenue)}</div>
                        </div>
                    `).join('')}
            </div>
            <div class="card">
                <h4>Залежавшиеся (более 30 дн.)</h4>
                ${slowMoving.length === 0
                    ? '<div class="empty-message">Нет</div>'
                    : slowMoving.map(p => `
                        <div class="slow-item">
                            <span class="name">${escapeHtml(p.name)}</span>
                            <span class="days">${p.daysInStock} дн.</span>
                            <span class="price">${formatMoney(p.price)}</span>
                        </div>
                    `).join('')}
            </div>
        </div>`;
}

// ============================================================
// Рендеринг — Смены
// ============================================================

export function renderShiftsTab(state) {
    const bySeller = computeShiftsBySeller(state);
    const summary = {
        totalShifts: state.shifts.length,
        activeShifts: state.shifts.filter(s => !s.closed_at).length,
        totalRevenue: state.shifts.reduce((s, sh) => s + (sh.total_revenue || 0), 0),
        totalProfit: state.shifts.reduce((s, sh) => s + (sh.total_profit || 0), 0)
    };

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Всего смен</span>
                <span class="value">${formatNumber(summary.totalShifts)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Активных</span>
                <span class="value">${formatNumber(summary.activeShifts)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Выручка</span>
                <span class="value">${formatMoney(summary.totalRevenue)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Прибыль</span>
                <span class="value">${formatMoney(summary.totalProfit)}</span>
            </div>
        </div>

        <div class="card" style="margin-bottom:24px">
            <h4>По продавцам</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Продавец</th>
                            <th>Смен</th>
                            <th>Продаж</th>
                            <th>Выручка</th>
                            <th>Прибыль</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(bySeller).map(([name, s]) => `
                            <tr>
                                <td>${escapeHtml(name)}</td>
                                <td>${s.shifts}</td>
                                <td>${s.salesCount}</td>
                                <td class="money">${formatMoney(s.revenue)}</td>
                                <td class="money">${formatMoney(s.profit)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card">
            <h4>Список смен</h4>
            ${state.shifts.length === 0
                ? '<div class="empty-message">Нет смен</div>'
                : `
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Открыта</th>
                                    <th>Закрыта</th>
                                    <th>Продавец</th>
                                    <th>Продаж</th>
                                    <th>Выручка</th>
                                    <th>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.shifts.map(s => `
                                    <tr>
                                        <td>${formatDateTime(s.opened_at)}</td>
                                        <td>${s.closed_at ? formatDateTime(s.closed_at) : '--'}</td>
                                        <td>${escapeHtml(s.seller_name || s.user_name || '--')}</td>
                                        <td>${s.sales_count || 0}</td>
                                        <td class="money">${formatMoney(s.total_revenue || 0)}</td>
                                        <td>
                                            <span class="status-badge ${s.closed_at ? 'status-sold' : 'status-in_stock'}">
                                                ${s.closed_at ? 'Закрыта' : 'Активна'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`}
        </div>`;
}

// ============================================================
// Графики
// ============================================================

export async function drawCharts(state) {
    try {
        const { drawRevenueChart, drawCategoryChart } = await import('../components/Charts.js');

        const dailyMap = new Map();

        state.sales.forEach(sale => {
            const day = sale.created_at?.slice(0, 10);
            if (!day) return;
            if (!dailyMap.has(day)) dailyMap.set(day, { date: day, revenue: 0, profit: 0 });
            const d = dailyMap.get(day);
            d.revenue += sale.total || 0;
            d.profit += sale.profit || 0;
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
        console.error('[ReportDashboard] drawCharts error:', err);
    }
}