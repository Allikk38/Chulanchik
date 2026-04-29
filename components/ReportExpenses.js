// ============================================================
// components/ReportExpenses.js
// Шаг 7: Вкладка «Расходы» — сводка и таблица
// ============================================================

/**
 * Компонент вкладки «Расходы» для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 *
 * @module components/ReportExpenses
 */

import { formatMoney, formatNumber, formatDate, escapeHtml } from '../utils/formatters.js';

// ============================================================
// Константы
// ============================================================

const CATEGORY_LABELS = {
    rent: 'Аренда',
    advertising: 'Реклама',
    supplies: 'Хозтовары',
    utilities: 'Коммунальные',
    salary: 'Зарплата',
    taxes: 'Налоги',
    repair: 'Ремонт',
    other: 'Прочее'
};

// ============================================================
// Вычисления
// ============================================================

function computeExpensesSummary(expenses) {
    const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const count = expenses.length;

    const byCategory = {};
    expenses.forEach(e => {
        const cat = e.category || 'other';
        byCategory[cat] = (byCategory[cat] || 0) + (Number(e.amount) || 0);
    });

    return { total, count, byCategory };
}

// ============================================================
// Рендеринг
// ============================================================

function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
}

function renderExpensesTable(expenses) {
    if (expenses.length === 0) {
        return '<div class="empty-state"><p>Нет расходов за выбранный период</p></div>';
    }

    return `
        <div class="table-container">
            <table class="data-table expense-table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Категория</th>
                        <th>Описание</th>
                        <th class="text-right">Сумма</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map(expense => `
                        <tr>
                            <td class="date-cell">${formatDate(expense.expense_date)}</td>
                            <td class="category-cell">
                                <span class="category-badge category-${expense.category}">
                                    ${escapeHtml(getCategoryLabel(expense.category))}
                                </span>
                            </td>
                            <td class="description-cell">
                                <span class="expense-description">
                                    ${escapeHtml((expense.description || '').slice(0, 50))}
                                    ${expense.description && expense.description.length > 50 ? '...' : ''}
                                </span>
                            </td>
                            <td class="amount-cell text-right">
                                <span class="expense-amount">${formatMoney(expense.amount)}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderCategoriesBreakdown(byCategory) {
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        return '';
    }

    return entries.map(([cat, amount]) => `
        <div class="top-product-item">
            <div class="name">${escapeHtml(getCategoryLabel(cat))}</div>
            <div class="revenue">${formatMoney(amount)}</div>
        </div>
    `).join('');
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Рендерит HTML вкладки «Расходы».
 *
 * @param {Object} state — состояние контроллера
 * @returns {string} HTML
 */
export function renderExpensesTab(state) {
    const summary = computeExpensesSummary(state.expenses);

    return `
        <div class="summary-cards">
            <div class="summary-card">
                <span class="label">Всего расходов</span>
                <span class="value ${summary.total > 0 ? 'text-danger' : ''}">${formatMoney(summary.total)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Количество</span>
                <span class="value">${formatNumber(summary.count)}</span>
            </div>
        </div>

        ${Object.keys(summary.byCategory).length > 0 ? `
            <div class="card" style="margin-bottom:24px">
                <h4>По категориям</h4>
                ${renderCategoriesBreakdown(summary.byCategory)}
            </div>
        ` : ''}

        ${renderExpensesTable(state.expenses)}`;
}

export default { renderExpensesTab };
