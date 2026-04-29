// ============================================================
// components/ReportExpenses.js
// Шаг 9: CRUD расходов через модалку
// ============================================================

/**
 * Компонент вкладки «Расходы» для страницы отчётов.
 *
 * Чистый UI. Рендерит таблицу, фильтры, кнопки действий.
 * Обработчики событий вешаются отдельно через bindExpensesEvents.
 *
 * @module components/ReportExpenses
 */

import { formatMoney, formatDate, escapeHtml } from '../utils/formatters.js';

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
    return { total, count: expenses.length };
}

// ============================================================
// Рендеринг
// ============================================================

function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
}

function renderExpenseRow(expense) {
    const hasReceipt = !!expense.receipt_url;

    return `
        <tr data-id="${expense.id}">
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
            <td class="receipt-cell text-center">
                ${hasReceipt ? `
                    <button class="btn-icon btn-sm view-receipt-btn" data-receipt-url="${escapeHtml(expense.receipt_url)}" title="Показать чек">
                        &check;
                    </button>
                ` : '<span class="text-muted">--</span>'}
            </td>
            <td class="actions-cell text-center">
                <div class="row-actions">
                    <button class="btn-icon btn-sm edit-expense" data-id="${expense.id}" title="Редактировать">
                        &pencil;
                    </button>
                    <button class="btn-icon btn-sm btn-danger delete-expense" data-id="${expense.id}" title="Удалить">
                        &times;
                    </button>
                </div>
            </td>
        </tr>`;
}

function renderExpensesTable(expenses) {
    if (expenses.length === 0) {
        return '<div class="empty-state"><p>Нет расходов за выбранный период</p></div>';
    }

    const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return `
        <div class="expense-summary-bar">
            <span class="expense-total-label">Всего расходов:</span>
            <span class="expense-total-value">${formatMoney(total)}</span>
        </div>
        <div class="table-container">
            <table class="data-table expense-table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Категория</th>
                        <th>Описание</th>
                        <th class="text-right">Сумма</th>
                        <th class="text-center">Чек</th>
                        <th class="text-center">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map(expense => renderExpenseRow(expense)).join('')}
                </tbody>
            </table>
        </div>`;
}

// ============================================================
// Публичные функции
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
        <div class="expenses-tab-header">
            <div class="expenses-actions">
                <button class="btn-primary" id="addExpenseBtn">+ Добавить расход</button>
            </div>
        </div>

        <div class="expenses-summary">
            <div class="summary-card">
                <span class="label">Всего расходов</span>
                <span class="value ${summary.total > 0 ? 'text-danger' : ''}">${formatMoney(summary.total)}</span>
            </div>
            <div class="summary-card">
                <span class="label">Количество</span>
                <span class="value">${summary.count}</span>
            </div>
        </div>

        <div id="expensesTableContainer">
            ${renderExpensesTable(state.expenses)}
        </div>`;
}

/**
 * Привязывает обработчики событий к DOM-элементам вкладки расходов.
 * Вызывается контроллером после вставки HTML в DOM.
 *
 * @param {Object} state — состояние контроллера
 * @param {Function} onDataChanged — колбэк для обновления данных после CRUD
 */
export function bindExpensesEvents(state, onDataChanged) {
    // Кнопка добавления расхода
    const addBtn = document.getElementById('addExpenseBtn');
    if (addBtn && !addBtn.dataset.eventsBound) {
        addBtn.dataset.eventsBound = 'true';
        addBtn.addEventListener('click', async () => {
            const { openExpenseFormModal } = await import('../components/ExpenseForm.js');
            const { showNotification } = await import('../utils/ui.js');
            const { expenseStore } = await import('../stores/ExpenseStore.js');
            const ExpenseService = (await import('../services/ExpenseService.js')).default;

            const result = await openExpenseFormModal({
                mode: 'create',
                userId: state.user?.id
            });

            if (result) {
                showNotification(`Расход на ${formatMoney(result.amount)} добавлен`, 'success');
                onDataChanged();
            }
        });
    }

    // Редактирование расхода
    document.querySelectorAll('.edit-expense').forEach(btn => {
        if (btn.dataset.eventsBound) return;
        btn.dataset.eventsBound = 'true';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const { openExpenseFormModal } = await import('../components/ExpenseForm.js');
            const { showNotification } = await import('../utils/ui.js');
            const { expenseStore } = await import('../stores/ExpenseStore.js');

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
                showNotification('Расход обновлён', 'success');
                onDataChanged();
            }
        });
    });

    // Удаление расхода
    document.querySelectorAll('.delete-expense').forEach(btn => {
        if (btn.dataset.eventsBound) return;
        btn.dataset.eventsBound = 'true';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const { showConfirmDialog, showNotification } = await import('../utils/ui.js');
            const ExpenseService = (await import('../services/ExpenseService.js')).default;

            const confirmed = await showConfirmDialog({
                title: 'Удаление расхода',
                message: 'Вы уверены, что хотите удалить этот расход?',
                confirmText: 'Удалить',
                confirmClass: 'btn-danger'
            });

            if (!confirmed) return;

            const result = await ExpenseService.remove(id);

            if (result.success) {
                showNotification('Расход удалён', 'success');
                onDataChanged();
            } else {
                showNotification(result.error || 'Ошибка удаления', 'error');
            }
        });
    });

    // Просмотр чека
    document.querySelectorAll('.view-receipt-btn').forEach(btn => {
        if (btn.dataset.eventsBound) return;
        btn.dataset.eventsBound = 'true';

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = btn.dataset.receiptUrl;
            if (url) {
                window.open(url, '_blank');
            }
        });
    });
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    renderExpensesTab,
    bindExpensesEvents
};
