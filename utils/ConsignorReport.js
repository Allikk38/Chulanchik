// ============================================================
// utils/ConsignorReport.js
// ============================================================

/**
 * Модуль формирования отчёта комитенту (лист сдатчика).
 *
 * Создаёт HTML-документ установленной формы в новой вкладке браузера.
 * Документ готов к печати и сохранению в PDF стандартными средствами.
 *
 * @module utils/ConsignorReport
 */

import { formatMoney, formatDate, escapeHtml } from './formatters.js';

// ============================================================
// Константы
// ============================================================

/** Настройки магазина */
const SHOP = {
    name: 'Чуланчик',
    legalName: 'ООО «Чуланчик»',
    inn: '0000000000',
    phone: '+7 (999) 123-45-67',
    logo: 'C'
};

/** Человекочитаемые названия статусов */
const STATUS_LABELS = {
    in_stock: 'На витрине',
    sold: 'Продан',
    reserved: 'Возвращён'
};

/** Человекочитаемые названия категорий */
const CATEGORY_LABELS = {
    clothes: 'Одежда',
    toys: 'Игрушки',
    dishes: 'Посуда',
    electronics: 'Электроника',
    furniture: 'Мебель',
    other: 'Другое'
};

// ============================================================
// Хелперы
// ============================================================

function getStatusLabel(status) {
    return STATUS_LABELS[status] || status || 'Неизвестно';
}

function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category || 'Другое';
}

/**
 * Генерирует номер документа на основе текущей даты.
 * Формат: ЧЛ-20260429-001
 */
function generateDocNumber() {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = String(Math.floor(Math.random() * 900) + 100);
    return `ЧЛ-${datePart}-${randomPart}`;
}

// ============================================================
// Рендеринг блоков документа
// ============================================================

function renderHeader() {
    return `
        <div class="report-header">
            <div class="report-logo">${escapeHtml(SHOP.logo)}</div>
            <div class="report-shop-name">${escapeHtml(SHOP.name)}</div>
            <div class="report-doc-title">Отчёт комиссионера перед комитентом</div>
        </div>`;
}

function renderRequisites(docNumber, generatedAt) {
    return `
        <div class="report-requisites">
            <div class="requisite-row">
                <span class="requisite-label">Документ:</span>
                <span class="requisite-value">${escapeHtml(docNumber)}</span>
            </div>
            <div class="requisite-row">
                <span class="requisite-label">Дата формирования:</span>
                <span class="requisite-value">${formatDate(generatedAt, { withTime: true })}</span>
            </div>
        </div>`;
}

function renderParties(consignor) {
    return `
        <div class="report-parties">
            <div class="party-block">
                <div class="party-title">Комитент (сдатчик)</div>
                <div class="party-name">${escapeHtml(consignor.fullName || '______________________')}</div>
                ${consignor.phone ? `<div class="party-detail">Телефон: ${escapeHtml(consignor.phone)}</div>` : ''}
                ${consignor.contractId ? `<div class="party-detail">Договор: ${escapeHtml(consignor.contractId)}</div>` : ''}
            </div>
            <div class="party-block">
                <div class="party-title">Комиссионер (магазин)</div>
                <div class="party-name">${escapeHtml(SHOP.legalName)}</div>
                <div class="party-detail">ИНН: ${escapeHtml(SHOP.inn)}</div>
                <div class="party-detail">Телефон: ${escapeHtml(SHOP.phone)}</div>
            </div>
        </div>`;
}

function renderItemsTable(items) {
    if (items.length === 0) {
        return `
            <div class="report-table-container">
                <p style="text-align:center;color:#8c7b6e;padding:20px;">Товары отсутствуют</p>
            </div>`;
    }

    const rows = items.map(item => `
        <tr>
            <td class="col-name">${escapeHtml(item.name || 'Без названия')}</td>
            <td class="col-category">${escapeHtml(getCategoryLabel(item.category))}</td>
            <td class="col-price">${formatMoney(item.price)}</td>
            <td class="col-status">
                <span class="status-indicator status-${item.status}">
                    ${getStatusLabel(item.status)}
                </span>
            </td>
        </tr>
    `).join('');

    return `
        <div class="report-table-container">
            <table class="report-table">
                <thead>
                    <tr>
                        <th class="col-name">Наименование товара</th>
                        <th class="col-category">Категория</th>
                        <th class="col-price">Цена продажи</th>
                        <th class="col-status">Статус</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
}

function renderFinancials({ total, commission, toPay }) {
    const commissionPercent = total > 0 ? Math.round((commission / total) * 100) : 0;

    return `
        <div class="report-financials">
            <div class="financial-row">
                <span>Общая стоимость проданных товаров</span>
                <span class="financial-value">${formatMoney(total)}</span>
            </div>
            <div class="financial-row">
                <span>Комиссионное вознаграждение магазина (${commissionPercent}%)</span>
                <span class="financial-value">${formatMoney(commission)}</span>
            </div>
            <div class="financial-row financial-total">
                <span>К ВЫПЛАТЕ КОМИТЕНТУ</span>
                <span class="financial-to-pay">${formatMoney(toPay)}</span>
            </div>
        </div>`;
}

function renderSignatures() {
    return `
        <div class="report-signatures">
            <div class="signature-block">
                <div class="signature-line"></div>
                <div class="signature-label">Комиссионер</div>
                <div class="signature-hint">_______________________</div>
            </div>
            <div class="signature-block">
                <div class="signature-line"></div>
                <div class="signature-label">Комитент</div>
                <div class="signature-hint">_______________________</div>
            </div>
        </div>`;
}

function renderFooter(docNumber) {
    return `
        <div class="report-footer">
            <div class="footer-left">
                ${escapeHtml(SHOP.legalName)} &bull; ИНН ${escapeHtml(SHOP.inn)}
            </div>
            <div class="footer-right">
                ${escapeHtml(docNumber)}
            </div>
        </div>`;
}

// ============================================================
// Сборка документа
// ============================================================

function buildDocumentHtml(data) {
    const docNumber = data.docNumber || generateDocNumber();
    const generatedAt = data.generatedAt || new Date().toISOString();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Отчёт комитенту — ${escapeHtml(docNumber)}</title>
    <style>
        :root {
            --brand: #1a3c2a;
            --brand-light: #2d5a3d;
            --bg: #f5f2ed;
            --text: #1e1a16;
            --text-secondary: #6b5e53;
            --text-muted: #8c7b6e;
            --border: #e0dbd3;
            --border-light: #f0ede8;
            --success: #2e7d32;
            --warning: #e65100;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: var(--text);
            background: #ffffff;
            max-width: 210mm;
            margin: 0 auto;
            padding: 15mm 12mm 20mm;
        }

        /* ===== Шапка ===== */
        .report-header {
            text-align: center;
            margin-bottom: 10mm;
            padding-bottom: 8mm;
            border-bottom: 2px solid var(--brand);
        }

        .report-logo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 54px;
            height: 54px;
            border: 2px solid var(--brand);
            border-radius: 8px;
            font-family: 'Lobster', cursive;
            font-size: 28px;
            color: var(--brand);
            margin-bottom: 4mm;
        }

        .report-shop-name {
            font-family: 'Lobster', cursive;
            font-size: 24px;
            color: var(--brand);
            letter-spacing: 0.02em;
            margin-bottom: 2mm;
        }

        .report-doc-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        /* ===== Реквизиты ===== */
        .report-requisites {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6mm;
            padding: 3mm 0;
            border-bottom: 1px solid var(--border-light);
        }

        .requisite-row {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .requisite-label {
            font-weight: 500;
        }

        .requisite-value {
            font-weight: 600;
            color: var(--text);
        }

        /* ===== Стороны ===== */
        .report-parties {
            display: flex;
            gap: 10mm;
            margin-bottom: 8mm;
        }

        .party-block {
            flex: 1;
            padding: 4mm 5mm;
            border: 1px solid var(--border);
            border-radius: 4px;
            background: var(--bg);
        }

        .party-title {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 2mm;
        }

        .party-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 1mm;
        }

        .party-detail {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 1mm;
        }

        /* ===== Таблица товаров ===== */
        .report-table-container {
            margin-bottom: 8mm;
        }

        .report-table {
            width: 100%;
            border-collapse: collapse;
        }

        .report-table thead {
            border-bottom: 2px solid var(--brand);
        }

        .report-table th {
            padding: 3mm 2mm;
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: left;
            background: var(--bg);
        }

        .report-table td {
            padding: 2.5mm 2mm;
            border-bottom: 1px solid var(--border-light);
            font-size: 12px;
            color: var(--text);
        }

        .col-name {
            width: 40%;
        }

        .col-category {
            width: 20%;
        }

        .col-price {
            width: 18%;
            text-align: right;
            font-family: 'SF Mono', 'Monaco', monospace;
            white-space: nowrap;
        }

        .col-status {
            width: 22%;
        }

        .status-indicator {
            display: inline-block;
            padding: 1mm 3mm;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-in_stock {
            background: #e8f5e9;
            color: #2e7d32;
        }

        .status-sold {
            background: #e0e7ff;
            color: #1a3c2a;
        }

        .status-reserved {
            background: #fff3e0;
            color: #e65100;
        }

        /* ===== Финансовый блок ===== */
        .report-financials {
            margin-bottom: 10mm;
            padding: 5mm 6mm;
            background: var(--bg);
            border-radius: 4px;
            border: 1px solid var(--border);
        }

        .financial-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2mm 0;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .financial-row + .financial-row {
            border-top: 1px solid var(--border);
        }

        .financial-value {
            font-weight: 600;
            color: var(--text);
            font-family: 'SF Mono', 'Monaco', monospace;
        }

        .financial-total {
            margin-top: 3mm;
            padding-top: 4mm !important;
            border-top: 2px solid var(--brand) !important;
        }

        .financial-total span:first-child {
            font-size: 12px;
            font-weight: 700;
            color: var(--text);
        }

        .financial-to-pay {
            font-size: 18px !important;
            font-weight: 700 !important;
            color: var(--brand) !important;
            font-family: 'SF Mono', 'Monaco', monospace !important;
        }

        /* ===== Подписи ===== */
        .report-signatures {
            display: flex;
            gap: 10mm;
            margin-bottom: 15mm;
        }

        .signature-block {
            flex: 1;
            text-align: center;
        }

        .signature-line {
            margin-bottom: 2mm;
        }

        .signature-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--text);
            margin-bottom: 4mm;
        }

        .signature-hint {
            font-size: 10px;
            color: var(--text-muted);
            border-top: 1px solid var(--text-muted);
            padding-top: 2mm;
            margin-top: 10mm;
        }

        /* ===== Подвал ===== */
        .report-footer {
            display: flex;
            justify-content: space-between;
            padding-top: 3mm;
            border-top: 1px solid var(--border);
            font-size: 9px;
            color: var(--text-muted);
        }

        /* ===== Печать ===== */
        @media print {
            @page {
                size: A4;
                margin: 15mm 12mm;
            }

            body {
                padding: 0;
                max-width: none;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .report-header {
                border-bottom-color: #000;
            }

            .report-table thead {
                border-bottom-color: #000;
            }

            .financial-total {
                border-top-color: #000 !important;
            }
        }

        @media (max-width: 190mm) {
            body {
                padding: 5mm;
            }

            .report-parties {
                flex-direction: column;
                gap: 3mm;
            }

            .report-signatures {
                flex-direction: column;
                gap: 8mm;
            }
        }
    </style>
</head>
<body>
    ${renderHeader()}
    ${renderRequisites(docNumber, generatedAt)}
    ${renderParties(data.consignor)}
    ${renderItemsTable(data.items)}
    ${renderFinancials({
        total: data.total || 0,
        commission: data.commission || 0,
        toPay: data.toPay || 0
    })}
    ${renderSignatures()}
    ${renderFooter(docNumber)}
</body>
</html>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Открывает отчёт комитенту в новой вкладке браузера.
 *
 * @param {Object} data — данные для отчёта
 * @param {Object} data.consignor — данные комитента
 * @param {string} data.consignor.fullName — ФИО комитента
 * @param {string} [data.consignor.phone] — номер телефона
 * @param {string} [data.consignor.contractId] — номер договора или ID
 * @param {Object[]} data.items — массив товаров
 * @param {string} data.items[].name — наименование товара
 * @param {string} data.items[].category — категория товара
 * @param {number} data.items[].price — цена продажи
 * @param {string} data.items[].status — статус товара
 * @param {number} data.total — общая стоимость проданных товаров
 * @param {number} data.commission — комиссионное вознаграждение
 * @param {number} data.toPay — сумма к выплате комитенту
 * @param {string} [data.docNumber] — номер документа (генерируется автоматически)
 * @param {string} [data.generatedAt] — дата формирования (по умолчанию — сейчас)
 */
export function openConsignorReport(data) {
    if (!data || !data.consignor || !data.items) {
        console.error('[ConsignorReport] Missing required data: consignor and items');
        return;
    }

    const html = buildDocumentHtml(data);
    const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);

    const newWindow = window.open(url, '_blank');

    if (newWindow) {
        // Освобождаем память когда вкладка загрузится
        newWindow.addEventListener('load', () => {
            URL.revokeObjectURL(url);
        });

        // Fallback: если load не сработал, освобождаем через 5 секунд
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) { /* уже освобождён */ }
        }, 5000);
    } else {
        // Браузер заблокировал всплывающее окно
        console.warn('[ConsignorReport] Popup blocked. Creating download instead.');
        const a = document.createElement('a');
        a.href = url;
        a.download = `otchet-komitentu-${data.docNumber || 'document'}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default { openConsignorReport };
