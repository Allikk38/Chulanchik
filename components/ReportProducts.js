// ============================================================
// components/ReportProducts.js
// Шаг 7: Вкладка «Товары» — топ продаж, залежавшиеся, статистика
// ============================================================

/**
 * Компонент вкладки «Товары» для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 *
 * @module components/ReportProducts
 */

import { productStore } from '../stores/ProductStore.js';
import { formatMoney, formatNumber, escapeHtml } from '../utils/formatters.js';

// ============================================================
// Вычисления
// ============================================================

function computeTopProducts(state, limit = 10) {
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
// Рендеринг
// ============================================================

function renderTopProductsList(products) {
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

function renderSlowMovingList(products) {
    if (products.length === 0) {
        return '<div class="empty-message">Нет залежавшихся товаров</div>';
    }

    return products.map(p => `
        <div class="slow-item">
            <span class="name">${escapeHtml(p.name)}</span>
            <span class="days">${p.daysInStock} дн.</span>
            <span class="price">${formatMoney(p.price)}</span>
        </div>
    `).join('');
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Рендерит HTML вкладки «Товары».
 *
 * @param {Object} state — состояние контроллера
 * @returns {string} HTML
 */
export function renderProductsTab(state) {
    const stats = productStore.getStats();
    const topProducts = computeTopProducts(state);
    const slowMoving = computeSlowMoving();

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Всего товаров</span>
                <span class="value">${formatNumber(stats.total)}</span>
            </div>
            <div class="summary-card">
                <span class="label">В наличии</span>
                <span class="value">${formatNumber(stats.inStock)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Продано</span>
                <span class="value">${formatNumber(stats.sold)}</span>
            </div>
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
                ${renderTopProductsList(topProducts)}
            </div>
            <div class="card">
                <h4>Залежавшиеся (более 30 дн.)</h4>
                ${renderSlowMovingList(slowMoving)}
            </div>
        </div>`;
}

export default { renderProductsTab };
