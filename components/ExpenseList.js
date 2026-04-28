// ============================================================
// components/ExpenseList.js
// ============================================================

/**
 * Компонент списка расходов.
 * 
 * Чистый UI. Отображает таблицу расходов с фильтрацией.
 * 
 * @module components/ExpenseList
 */

import { formatMoney, formatDateTime, escapeHtml } from '../utils/formatters.js';
import { showConfirmDialog, showNotification } from '../utils/ui.js';

// ============================================================
// Константы
// ============================================================

const CATEGORY_LABELS = {
    rent: 'Аренда',
    advertising: 'Реклама',
    supplies: 'Хозтовары',
    utilities: 'Коммунальные услуги',
    salary: 'Зарплата',
    taxes: 'Налоги',
    repair: 'Ремонт / Обслуживание',
    other: 'Прочее'
};

// ============================================================
// Рендеринг
// ============================================================

/**
 * Рендерит таблицу расходов.
 * 
 * @param {Object} options
 * @param {Array} options.expenses - список расходов
 * @param {Function} options.onEdit - callback при редактировании
 * @param {Function} options.onDelete - callback при удалении
 * @param {boolean} options.isLoading - идёт загрузка
 * @returns {string} HTML
 */
export function renderExpenseTable({ expenses, onEdit, onDelete, isLoading }) {
    if (isLoading && expenses.length === 0) {
        return `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <span class="loading-text">Загрузка расходов...</span>
            </div>`;
    }

    if (expenses.length === 0) {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <p>Нет расходов за выбранный период</p>
                <small>Нажмите «+ Добавить расход», чтобы внести первые данные</small>
            </div>`;
    }

    const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

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
                        <th>Чек</th>
                        <th class="text-center">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map(expense => renderExpenseRow(expense, onEdit, onDelete)).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderExpenseRow(expense, onEdit, onDelete) {
    const categoryLabel = CATEGORY_LABELS[expense.category] || expense.category;
    const hasReceipt = !!expense.receipt_url;
    const shortId = expense.id?.slice(0, 8);

    return `
        <tr data-id="${expense.id}">
            <td class="date-cell">
                <span class="expense-date">${formatDateTime(expense.expense_date)}</span>
            </td>
            <td class="category-cell">
                <span class="category-badge category-${expense.category}">${escapeHtml(categoryLabel)}</span>
            </td>
            <td class="description-cell">
                <span class="expense-description" title="${escapeHtml(expense.description || '')}">
                    ${escapeHtml(expense.description?.slice(0, 50) || '—')}
                    ${expense.description?.length > 50 ? '...' : ''}
                </span>
                <span class="expense-id text-muted">ID: ${shortId}</span>
            </td>
            <td class="amount-cell text-right">
                <span class="expense-amount">${formatMoney(expense.amount)}</span>
            </td>
            <td class="receipt-cell">
                ${hasReceipt ? `
                    <button class="btn-icon btn-sm view-receipt-btn" data-receipt-url="${escapeHtml(expense.receipt_url)}" title="Показать чек">
                        📎
                    </button>
                ` : '<span class="text-muted">—</span>'}
            </td>
            <td class="actions-cell text-center">
                <div class="row-actions">
                    <button class="btn-icon btn-sm edit-expense" data-id="${expense.id}" title="Редактировать">
                        ✎
                    </button>
                    <button class="btn-icon btn-sm btn-danger delete-expense" data-id="${expense.id}" title="Удалить">
                        ✕
                    </button>
                </div>
            </td>
        </tr>`;
}

/**
 * Рендерит фильтры для списка расходов.
 * 
 * @param {Object} options
 * @param {string} options.fromDate - начальная дата (YYYY-MM-DD)
 * @param {string} options.toDate - конечная дата (YYYY-MM-DD)
 * @param {string} options.category - выбранная категория
 * @returns {string} HTML
 */
export function renderExpenseFilters({ fromDate, toDate, category }) {
    const categories = [
        { value: '', label: 'Все категории' },
        { value: 'rent', label: 'Аренда' },
        { value: 'advertising', label: 'Реклама' },
        { value: 'supplies', label: 'Хозтовары' },
        { value: 'utilities', label: 'Коммунальные услуги' },
        { value: 'salary', label: 'Зарплата' },
        { value: 'taxes', label: 'Налоги' },
        { value: 'repair', label: 'Ремонт' },
        { value: 'other', label: 'Прочее' }
    ];

    return `
        <div class="expense-filters">
            <div class="filter-group">
                <label>С даты</label>
                <input type="date" id="expenseFromDate" value="${escapeHtml(fromDate || '')}" class="filter-input">
            </div>
            <div class="filter-group">
                <label>По дату</label>
                <input type="date" id="expenseToDate" value="${escapeHtml(toDate || '')}" class="filter-input">
            </div>
            <div class="filter-group">
                <label>Категория</label>
                <select id="expenseCategory" class="filter-select">
                    ${categories.map(c => `
                        <option value="${c.value}" ${c.value === category ? 'selected' : ''}>
                            ${escapeHtml(c.label)}
                        </option>
                    `).join('')}
                </select>
            </div>
            <button class="btn-secondary btn-sm" id="resetExpenseFilters">Сбросить</button>
        </div>`;
}

/**
 * Инициализирует обработчики для списка расходов.
 * 
 * @param {HTMLElement} container - контейнер с таблицей
 * @param {Object} handlers
 * @param {Function} handlers.onEdit
 * @param {Function} handlers.onDelete
 * @param {Function} handlers.onViewReceipt
 */
export function bindExpenseListEvents(container, handlers) {
    if (!container) return;

    // Редактирование
    container.querySelectorAll('.edit-expense').forEach(btn => {
        btn.removeEventListener('click', handlers._editHandler);
        const handler = (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (id && handlers.onEdit) handlers.onEdit(id);
        };
        btn.addEventListener('click', handler);
        btn._editHandler = handler;
    });

    // Удаление
    container.querySelectorAll('.delete-expense').forEach(btn => {
        btn.removeEventListener('click', handlers._deleteHandler);
        const handler = async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (id && handlers.onDelete) {
                const confirmed = await showConfirmDialog({
                    title: 'Удаление расхода',
                    message: 'Вы уверены, что хотите удалить этот расход?',
                    confirmText: 'Удалить',
                    confirmClass: 'btn-danger'
                });
                if (confirmed) handlers.onDelete(id);
            }
        };
        btn.addEventListener('click', handler);
        btn._deleteHandler = handler;
    });

    // Просмотр чека
    container.querySelectorAll('.view-receipt-btn').forEach(btn => {
        btn.removeEventListener('click', handlers._receiptHandler);
        const handler = (e) => {
            e.stopPropagation();
            const receiptUrl = btn.dataset.receiptUrl;
            if (receiptUrl && handlers.onViewReceipt) handlers.onViewReceipt(receiptUrl);
        };
        btn.addEventListener('click', handler);
        btn._receiptHandler = handler;
    });
}

/**
 * Показывает модальное окно с чеком.
 * 
 * @param {string} receiptUrl
 */
export function showReceiptModal(receiptUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay receipt-modal';
    modal.innerHTML = `
        <div class="modal receipt-modal-content">
            <div class="modal-header">
                <h3>Чек</h3>
                <button class="btn-close receipt-close">x</button>
            </div>
            <div class="modal-body">
                <img src="${escapeHtml(receiptUrl)}" alt="Чек" style="max-width:100%; height:auto;">
            </div>
            <div class="modal-footer">
                <a href="${escapeHtml(receiptUrl)}" download class="btn-primary">Скачать</a>
                <button class="btn-secondary receipt-close">Закрыть</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelectorAll('.receipt-close').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

export default {
    renderExpenseTable,
    renderExpenseFilters,
    bindExpenseListEvents,
    showReceiptModal
};