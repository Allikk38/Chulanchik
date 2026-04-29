// ============================================================
// components/ReportSales.js
// Шаг 7: Вкладка «Продажи» — сводка и таблица
// ============================================================

/**
 * Компонент вкладки «Продажи» для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 *
 * @module components/ReportSales
 */

import { formatMoney, formatNumber, formatDateTime, getPaymentMethodName } from '../utils/formatters.js';

// ============================================================
// Вычисления
// ============================================================

function computeSalesSummary(sales) {
    const count = sales.length;
    const revenue = sales.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const profit = sales.reduce((s, r) => s + (Number(r.profit) || 0), 0);
    const avgCheck = count > 0 ? revenue / count : 0;

    return { count, revenue, profit, avgCheck };
}

// ============================================================
// Рендеринг
// ============================================================

/**
 * Нормализует поле items — массив или JSON-строка.
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

function renderSalesTable(sales) {
    if (sales.length === 0) {
        return '<div class="empty-state"><p>Нет продаж за выбранный период</p></div>';
    }

    return `
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
                    ${sales.map(sale => {
                        const items = normalizeItems(sale.items);
                        const itemCount = items.length;

                        return `
                            <tr>
                                <td>${formatDateTime(sale.created_at)}</td>
                                <td>${itemCount} поз.</td>
                                <td class="money">${formatMoney(sale.total)}</td>
                                <td class="money">${formatMoney(sale.profit)}</td>
                                <td>${getPaymentMethodName(sale.payment_method)}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Рендерит HTML вкладки «Продажи».
 *
 * @param {Object} state — состояние контроллера
 * @returns {string} HTML
 */
export function renderSalesTab(state) {
    const sales = state.sales;
    const summary = computeSalesSummary(sales);

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Всего продаж</span>
                <span class="value">${formatNumber(summary.count)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Выручка</span>
                <span class="value">${formatMoney(summary.revenue)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Прибыль</span>
                <span class="value">${formatMoney(summary.profit)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Средний чек</span>
                <span class="value">${formatMoney(summary.avgCheck)}</span>
            </div>
        </div>
        ${renderSalesTable(sales)}`;
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    renderSalesTab
};
