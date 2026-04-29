// ============================================================
// components/ReportDashboard.js
// Шаг 6: Дашборд — KPI-карточки, топ-товары, топ-категории
// ============================================================

/**
 * Компонент дашборда для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 * Не зависит от контроллера.
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
 * Защита от падения если Supabase возвращает строку вместо массива.
 *
 * @param {*} items
 * @returns {Object[]}
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
// Публичная функция
// ============================================================

/**
 * Рендерит HTML дашборда.
 *
 * @param {Object} state — состояние контроллера (sales, shifts, expenses, period)
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

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    renderDashboard
};
