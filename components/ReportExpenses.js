// ============================================================
// components/ReportExpenses.js
// ============================================================

/**
 * Компонент вкладки расходов для страницы отчётов.
 *
 * Чистый UI. Рендерит фильтры, таблицу, обрабатывает
 * добавление/редактирование/удаление расходов.
 *
 * @module components/ReportExpenses
 */

import { expenseStore } from '../stores/ExpenseStore.js';
import ExpenseService from '../services/ExpenseService.js';
import { formatMoney } from '../utils/formatters.js';
import { showNotification, showConfirmDialog } from '../utils/ui.js';
import { hasPermission } from '../core/auth.js';
import { openExpenseFormModal } from '../components/ExpenseForm.js';
import {
    renderExpenseTable,
    renderExpenseFilters,
    bindExpenseListEvents,
    showReceiptModal
} from '../components/ExpenseList.js';

// ============================================================
// Рендеринг
// ============================================================

export function renderExpensesTab(state) {
    const totalExpenses = state.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return `
        <div class="expenses-tab-header">
            <div class="expenses-actions">
                <button class="btn-primary" id="addExpenseBtn">+ Добавить расход</button>
                <button class="btn-secondary" id="exportExpensesPdfBtn">Экспорт PDF</button>
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
                onEdit: () => {},
                onDelete: () => {}
            })}
        </div>
    `;
}

// ============================================================
// Действия с расходами
// ============================================================

async function addExpense(state, onDataChanged) {
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
        onDataChanged();
    }
}

async function editExpense(state, id, onDataChanged) {
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
}

async function deleteExpense(id, onDataChanged) {
    const result = await ExpenseService.remove(id);

    if (result.success) {
        showNotification('Расход удалён', 'success');
        onDataChanged();
    } else {
        showNotification(result.error || 'Ошибка удаления', 'error');
    }
}

async function handleExportExpensesPdf(state) {
    const { exportExpensesReport } = await import('../utils/pdfExport.js');
    const { formatDate } = await import('../utils/formatters.js');

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const periodStr = `${formatDate(from.toISOString())} — ${formatDate(now.toISOString())}`;
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
        console.error('[ReportExpenses] PDF export error:', err);
        showNotification('Ошибка формирования PDF', 'error');
    }
}

// ============================================================
// Биндинг событий
// ============================================================

export function bindExpensesEvents(state, onDataChanged) {
    const expensesContainer = document.getElementById('expensesTableContainer');
    if (expensesContainer) {
        bindExpenseListEvents(expensesContainer, {
            onEdit: (id) => editExpense(state, id, onDataChanged),
            onDelete: (id) => deleteExpense(id, onDataChanged),
            onViewReceipt: (url) => showReceiptModal(url)
        });
    }

    // Кнопка добавления
    const addBtn = document.getElementById('addExpenseBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addExpense(state, onDataChanged));
    }

    // Кнопка экспорта PDF
    const exportPdfBtn = document.getElementById('exportExpensesPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => handleExportExpensesPdf(state));
    }

    // Фильтры
    const fromDateInput = document.getElementById('expenseFromDate');
    const toDateInput = document.getElementById('expenseToDate');
    const categorySelect = document.getElementById('expenseCategory');
    const resetBtn = document.getElementById('resetExpenseFilters');

    if (fromDateInput) {
        fromDateInput.addEventListener('change', () => {
            state.expenseFilters.fromDate = fromDateInput.value;
            onDataChanged();
        });
    }

    if (toDateInput) {
        toDateInput.addEventListener('change', () => {
            state.expenseFilters.toDate = toDateInput.value;
            onDataChanged();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            state.expenseFilters.category = categorySelect.value;
            onDataChanged();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.expenseFilters = { fromDate: '', toDate: '', category: '' };
            onDataChanged();
        });
    }

    // Кнопка «Все расходы» на дашборде
    const viewAllBtn = document.getElementById('viewAllExpensesBtn');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            state.activeTab = 'expenses';
            onDataChanged();
        });
    }
}