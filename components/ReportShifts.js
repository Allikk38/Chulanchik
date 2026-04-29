// ============================================================
// components/ReportShifts.js
// Шаг 7: Вкладка «Смены» — сводка, по продавцам, список
// ============================================================

/**
 * Компонент вкладки «Смены» для страницы отчётов.
 *
 * Чистый UI. Принимает state, возвращает HTML-строку.
 *
 * @module components/ReportShifts
 */

import { formatMoney, formatNumber, formatDateTime, escapeHtml } from '../utils/formatters.js';

// ============================================================
// Вычисления
// ============================================================

function computeShiftsSummary(shifts) {
    const totalShifts = shifts.length;
    const activeShifts = shifts.filter(s => !s.closed_at).length;
    const totalRevenue = shifts.reduce((s, sh) => s + (Number(sh.total_revenue) || 0), 0);
    const totalProfit = shifts.reduce((s, sh) => s + (Number(sh.total_profit) || 0), 0);

    return { totalShifts, activeShifts, totalRevenue, totalProfit };
}

function computeShiftsBySeller(shifts) {
    const bySeller = {};

    shifts.forEach(shift => {
        const name = shift.seller_name || 'Неизвестный';
        if (!bySeller[name]) {
            bySeller[name] = { shifts: 0, salesCount: 0, revenue: 0, profit: 0 };
        }
        bySeller[name].shifts += 1;
        bySeller[name].salesCount += shift.sales_count || 0;
        bySeller[name].revenue += Number(shift.total_revenue) || 0;
        bySeller[name].profit += Number(shift.total_profit) || 0;
    });

    return bySeller;
}

// ============================================================
// Рендеринг
// ============================================================

function renderBySellerTable(bySeller) {
    const entries = Object.entries(bySeller);

    if (entries.length === 0) {
        return '<div class="empty-message">Нет данных</div>';
    }

    return `
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
                    ${entries.map(([name, s]) => `
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
        </div>`;
}

function renderShiftsTable(shifts) {
    if (shifts.length === 0) {
        return '<div class="empty-state"><p>Нет смен за выбранный период</p></div>';
    }

    return `
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
                    ${shifts.map(s => `
                        <tr>
                            <td>${formatDateTime(s.opened_at)}</td>
                            <td>${s.closed_at ? formatDateTime(s.closed_at) : '--'}</td>
                            <td>${escapeHtml(s.seller_name || '--')}</td>
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
        </div>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Рендерит HTML вкладки «Смены».
 *
 * @param {Object} state — состояние контроллера
 * @returns {string} HTML
 */
export function renderShiftsTab(state) {
    const shifts = state.shifts;
    const summary = computeShiftsSummary(shifts);
    const bySeller = computeShiftsBySeller(shifts);

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
            ${renderBySellerTable(bySeller)}
        </div>

        <div class="card">
            <h4>Список смен</h4>
            ${renderShiftsTable(shifts)}
        </div>`;
}

export default { renderShiftsTab };
