// ============================================================
// components/ReportDashboard.js
// Шаг 8: Добавлены контейнеры для графиков + функция drawCharts
// ============================================================

/**
 * Компонент дашборда для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 * Также экспортирует drawCharts для отрисовки графиков после вставки в DOM.
 *
 * @module components/ReportDashboard
 */

import { productStore } from '../stores/ProductStore.js';
import {
    formatMoney,
    formatNumber,
    formatPercent,
    escapeHtml
} from '../utils/formatters.js';
import { drawRevenueChart, drawCategoryChart } from '../components/Charts.js';

// ============================================================
// Вычисления
// ============================================================

function computeOverview(state) {
    const sales = state.sales;
    const revenue = sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const profit = sales.reduce((s, r) => s + (Number(r.profit) || 0), 0);
    const count = sales.length;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgCheck = count > 0 ? revenue / count : 0;

    const stockStats = productStore.getStats();
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = profit - totalExpenses;

    return {
        revenue,
        profit,
        margin,
        count,
        avgCheck,
        inStock: stockStats.inStock,
        stockValue: stockStats.stockValue,
        potentialProfit: stockStats.potentialProfit,
        totalExpenses,
        netProfit
    };
}

function computeTopProducts(state, limit = 5) {
    const map = new Map();

    state.sales.forEach(sale => {
        const items = normalizeItems(sale.items);
        items.forEach(item => {
            const key = item.id || item.name;
            if (!map.has(key)) {
                map.set(key, { name: item.name, quantity: 0, revenue: 0 });
            }
            const entry = map.get(key);
            entry.quantity += item.quantity || 0;
            entry.revenue += (Number(item.price) || 0) * (item.quantity || 0);
        });
    });

    return [...map.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
}

function computeTopCategories(state, limit = 5) {
    const map = new Map();

    state.sales.forEach(sale => {
        const items = normalizeItems(sale.items);
        items.forEach(item => {
            const product = productStore.getById(item.id);
            const cat = product?.category || 'other';
            if (!map.has(cat)) {
                map.set(cat, { category: cat, quantity: 0, revenue: 0 });
            }
            const entry = map.get(cat);
            entry.quantity += item.quantity || 0;
            entry.revenue += (Number(item.price) || 0) * (item.quantity || 0);
        });
    });

    return [...map.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
}

/**
 * Нормализует поле items — может быть массивом или JSON-строкой.
 */
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
// Рендеринг — KPI-карточки
// ============================================================

function renderKpiCards(overview) {
    const cards = [
        { title: 'Выручка', value: formatMoney(overview.revenue), color: '#1a3c2a' },
        { title: 'Прибыль', value: formatMoney(overview.profit), color: '#2e7d32' },
        { title: 'Маржинальность', value: formatPercent(overview.margin, { isFraction: false, decimals: 1 }), color: '#e65100' },
        { title: 'Продаж', value: formatNumber(overview.count), color: '#0369a1' },
        { title: 'Средний чек', value: formatMoney(overview.avgCheck), color: '#7c3aed' },
        { title: 'В наличии', value: formatNumber(overview.inStock), color: '#ca8a04' }
    ];

    return `
        <div class="kpi-grid">
            ${cards.map(c => `
                <div class="kpi-card" style="border-left: 3px solid ${c.color}">
                    <div class="kpi-header">
                        <span class="kpi-title">${c.title}</span>
                    </div>
                    <div class="kpi-value">${c.value}</div>
                </div>
            `).join('')}
        </div>`;
}

function renderNetProfitCard(overview) {
    const netClass = overview.netProfit >= 0 ? 'text-success' : 'text-danger';

    return `
        <div class="kpi-grid">
            <div class="kpi-card net-profit-card">
                <div class="kpi-header">
                    <span class="kpi-title">ЧИСТАЯ ПРИБЫЛЬ</span>
                </div>
                <div class="kpi-value ${netClass}">${formatMoney(overview.netProfit)}</div>
                <div style="font-size: 11px; color: #8c7b6e; margin-top: 4px;">
                    Прибыль: ${formatMoney(overview.profit)} | Расходы: -${formatMoney(overview.totalExpenses)}
                </div>
            </div>
        </div>`;
}

// ============================================================
// Рендеринг — топ-списки
// ============================================================

function renderTopProducts(products) {
    if (products.length === 0) {
        return '<div class="empty-message">Нет данных</div>';
    }

    return products.map((p, i) => `
        <div class="top-product-item">
            <span class="rank">#${i + 1}</span>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="value">${p.quantity} шт.</div>
            <div class="revenue">${formatMoney(p.revenue)}</div>
        </div>
    `).join('');
}

function renderTopCategories(categories) {
    if (categories.length === 0) {
        return '<div class="empty-message">Нет данных</div>';
    }

    const categoryNames = {
        clothes: 'Одежда',
        toys: 'Игрушки',
        dishes: 'Посуда',
        electronics: 'Электроника',
        furniture: 'Мебель',
        other: 'Другое'
    };

    return categories.map((c, i) => `
        <div class="top-product-item">
            <span class="rank">#${i + 1}</span>
            <div class="name">${escapeHtml(categoryNames[c.category] || c.category)}</div>
            <div class="value">${c.quantity} шт.</div>
            <div class="revenue">${formatMoney(c.revenue)}</div>
        </div>
    `).join('');
}

// ============================================================
// Публичные функции
// ============================================================

/**
 * Рендерит HTML дашборда.
 *
 * @param {Object} state — состояние контроллера
 * @returns {string} HTML
 */
export function renderDashboard(state) {
    const overview = computeOverview(state);
    const topProducts = computeTopProducts(state);
    const topCategories = computeTopCategories(state);

    return `
        <div class="dashboard-content">
            ${renderKpiCards(overview)}
            ${renderNetProfitCard(overview)}

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
                    ${renderTopProducts(topProducts)}
                </div>
                <div class="card">
                    <h4>Топ-5 категорий</h4>
                    ${renderTopCategories(topCategories)}
                </div>
            </div>
        </div>`;
}

/**
 * Отрисовывает графики на дашборде.
 * Должна вызываться после вставки HTML в DOM.
 *
 * @param {Object} state — состояние контроллера
 */
export function drawCharts(state) {
    const dailyMap = new Map();

    state.sales.forEach(sale => {
        const day = sale.created_at?.slice(0, 10);
        if (!day) return;
        if (!dailyMap.has(day)) {
            dailyMap.set(day, { date: day, revenue: 0, profit: 0 });
        }
        const d = dailyMap.get(day);
        d.revenue += Number(sale.total) || 0;
        d.profit += Number(sale.profit) || 0;
    });

    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const catMap = new Map();

    state.sales.forEach(sale => {
        const items = normalizeItems(sale.items);
        items.forEach(item => {
            const product = productStore.getById(item.id);
            const cat = product?.category || 'other';
            if (!catMap.has(cat)) {
                catMap.set(cat, { category: cat, revenue: 0 });
            }
            catMap.get(cat).revenue += (Number(item.price) || 0) * (item.quantity || 0);
        });
    });

    const categories = [...catMap.values()];

    drawRevenueChart(daily);
    drawCategoryChart(categories);
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    renderDashboard,
    drawCharts
};
