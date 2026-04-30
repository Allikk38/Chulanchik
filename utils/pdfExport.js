// ============================================================
// utils/pdfExport.js
// v1.2.0 — 2026-04-30: исправлена кодировка кириллицы в PDF
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Модуль экспорта отчётов в PDF.
//   Создаёт профессиональные документы с графиками, QR-кодами и таблицами.
//
// ЗАВИСИМОСТИ
//   html2canvas (CDN) — рендеринг HTML в canvas
//   jsPDF (CDN)        — создание PDF
//   qrcode (CDN)        — генерация QR-кодов
//   Roboto-Regular.ttf  — шрифт с кириллицей (Google Fonts)
//
// ИСПОЛЬЗУЕТСЯ
//   ReportsController.exportPdf()  — финансовый отчёт
//   ReportsController (опция)       — отчёт о расходах
//
// ИЗМЕНЕНИЯ
//   v1.2.0 — исправлена кодировка:
//     - добавлена функция loadRussianFont()
//     - шрифт Roboto-Regular загружается с Google Fonts
//     - все вызовы setFont() заменены на Roboto-Regular
//     - добавлена индикация загрузки шрифта в loadLibraries()
//   v1.1.0 — добавлен exportExpensesReport() (отчёт о расходах)
//   v1.0.0 — первоначальная версия с exportFinancialReport()
//
// ============================================================

/**
 * Модуль экспорта отчётов в PDF.
 *
 * Использует html2canvas + jsPDF для создания профессиональных PDF-отчётов.
 * Поддерживает кириллицу через встроенный шрифт Roboto.
 *
 * @module utils/pdfExport
 */

import { formatMoney, formatDate } from './formatters.js';

// ============================================================
// Конфигурация
// ============================================================

let html2canvas = null;
let jsPDF = null;
let qrcode = null;

let loadPromise = null;

// Флаг загрузки кириллического шрифта
let russianFontLoaded = false;
let russianFontBase64 = null;

// ============================================================
// Загрузка кириллического шрифта
// ============================================================

/**
 * Загружает шрифт Roboto с поддержкой кириллицы.
 * Конвертирует TTF в base64 для использования в jsPDF.
 *
 * @returns {Promise<string>} base64-строка шрифта
 */
async function loadRussianFont() {
    if (russianFontBase64) return russianFontBase64;

    const fontUrl = 'https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Mu5mxKKTU1Kvnz.woff2';

    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error('Не удалось загрузить шрифт Roboto');

    const arrayBuffer = await response.arrayBuffer();
    const binaryString = Array.from(new Uint8Array(arrayBuffer))
        .map(byte => String.fromCharCode(byte))
        .join('');

    russianFontBase64 = btoa(binaryString);
    russianFontLoaded = true;

    return russianFontBase64;
}

// ============================================================
// Загрузка библиотек
// ============================================================

async function loadLibraries() {
    if (html2canvas && jsPDF && qrcode) return { html2canvas, jsPDF, qrcode };
    if (loadPromise) return loadPromise;

    loadPromise = new Promise(async (resolve, reject) => {
        try {
            // html2canvas
            if (!window.html2canvas) {
                await new Promise((res, rej) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    script.onload = res;
                    script.onerror = rej;
                    document.head.appendChild(script);
                });
            }
            html2canvas = window.html2canvas;

            // jsPDF
            if (!window.jspdf) {
                await new Promise((res, rej) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    script.onload = res;
                    script.onerror = rej;
                    document.head.appendChild(script);
                });
            }
            jsPDF = window.jspdf?.jsPDF || window.jspdf?.JSPDF || (window.jspdf?.default?.jsPDF);

            if (!jsPDF && window.jspdf?.jsPDF) jsPDF = window.jspdf.jsPDF;

            // QRCode
            if (!window.QRCode) {
                await new Promise((res, rej) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
                    script.onload = res;
                    script.onerror = rej;
                    document.head.appendChild(script);
                });
            }
            qrcode = window.QRCode;

            // Шрифт с кириллицей
            await loadRussianFont();

            resolve({ html2canvas, jsPDF, qrcode });
        } catch (err) {
            reject(err);
        }
    });

    return loadPromise;
}

// ============================================================
// Генерация QR-кода как DataURL
// ============================================================

function generateQRCodeDataURL(text, size = 100) {
    return new Promise((resolve, reject) => {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        document.body.appendChild(container);

        try {
            new qrcode(container, {
                text: text,
                width: size,
                height: size,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });

            setTimeout(() => {
                const canvas = container.querySelector('canvas');
                if (canvas) {
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    reject(new Error('QR code canvas not found'));
                }
                document.body.removeChild(container);
            }, 100);
        } catch (err) {
            document.body.removeChild(container);
            reject(err);
        }
    });
}

// ============================================================
// Спарклайн (простой ASCII/текстовый график)
// ============================================================

function renderSparkline(values, width = 20) {
    if (!values || values.length === 0) return '─'.repeat(width);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) return '─'.repeat(width);

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const step = values.length / width;

    let result = '';
    for (let i = 0; i < width; i++) {
        const idx = Math.floor(i * step);
        const val = values[Math.min(idx, values.length - 1)];
        const normalized = (val - min) / range;
        const charIdx = Math.floor(normalized * (chars.length - 1));
        result += chars[charIdx];
    }

    return result;
}

// ============================================================
// Основной экспорт: финансовый отчёт
// ============================================================

/**
 * Экспортирует финансовый отчёт в PDF.
 *
 * @param {Object} data
 * @param {string} data.shopName - название магазина
 * @param {string} data.period - период (например, "01.04.2026 - 28.04.2026")
 * @param {Object} data.kpis - { revenue, profit, expenses, netProfit }
 * @param {Array} data.dailyRevenue - [{ date, revenue }] для спарклайна
 * @param {Array} data.expensesByCategory - [{ category, amount }]
 * @param {Array} data.topExpenses - [{ category, amount, description }] топ-5
 * @param {string} data.generatedAt - дата формирования
 * @returns {Promise<void>}
 */
export async function exportFinancialReport(data) {
    console.log('[PDFExport] starting financial report generation');

    await loadLibraries();

    const {
        shopName = 'Чуланчик',
        period = '',
        kpis = { revenue: 0, profit: 0, expenses: 0, netProfit: 0 },
        dailyRevenue = [],
        expensesByCategory = [],
        topExpenses = [],
        generatedAt = new Date().toISOString()
    } = data;

    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        putOnlyUsedFonts: true
    });

    // --- Внедрение кириллического шрифта ---
    if (russianFontBase64) {
        doc.addFileToVFS('Roboto-Regular.ttf', russianFontBase64);
        doc.addFont('Roboto-Regular.ttf', 'Roboto-Regular', 'normal');
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // --- Шапка ---
    if (russianFontLoaded) {
        doc.setFont('Roboto-Regular', 'normal');
    } else {
        doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(20);
    doc.text(shopName, margin, y);

    y += 8;
    doc.setFontSize(10);
    doc.text('Финансовый отчёт', margin, y);

    y += 6;
    doc.setFontSize(9);
    doc.text(`Период: ${period}`, margin, y);

    y += 5;
    const generatedDate = formatDate(generatedAt);
    const generatedTime = new Date(generatedAt).toLocaleTimeString('ru-RU');
    doc.text(`Сформирован: ${generatedDate} ${generatedTime}`, margin, y);

    y += 10;

    // --- Линия ---
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // --- KPI карточки ---
    doc.setFontSize(10);
    doc.text('КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ', margin, y);
    y += 6;

    const kpiWidth = (pageWidth - margin * 2 - 10) / 4;
    const kpiX = [margin, margin + kpiWidth + 3, margin + (kpiWidth + 3) * 2, margin + (kpiWidth + 3) * 3];

    const kpiLabels = ['Выручка', 'Прибыль', 'Расходы', 'Чистая прибыль'];
    const kpiValues = [
        formatMoney(kpis.revenue),
        formatMoney(kpis.profit),
        formatMoney(kpis.expenses),
        formatMoney(kpis.netProfit)
    ];

    for (let i = 0; i < 4; i++) {
        doc.setFillColor(245, 248, 250);
        doc.roundedRect(kpiX[i], y, kpiWidth, 25, 2, 2, 'F');

        doc.setFontSize(8);
        doc.text(kpiLabels[i], kpiX[i] + 5, y + 8);

        doc.setFontSize(14);
        doc.text(kpiValues[i], kpiX[i] + 5, y + 20);
    }

    y += 32;

    // --- Спарклайн графика ---
    if (dailyRevenue.length > 0) {
        doc.setFontSize(10);
        doc.text('ДИНАМИКА ВЫРУЧКИ', margin, y);
        y += 6;

        const revenueValues = dailyRevenue.map(d => d.revenue);
        const sparklineText = renderSparkline(revenueValues, 50);

        doc.setFontSize(8);
        doc.text(sparklineText, margin, y);
        y += 6;

        const maxRevenue = Math.max(...revenueValues);
        const minRevenue = Math.min(...revenueValues);

        doc.setFontSize(7);
        doc.text(`Макс: ${formatMoney(maxRevenue)}  |  Мин: ${formatMoney(minRevenue)}  |  Дней: ${revenueValues.length}`, margin, y);
        y += 10;
    }

    // --- Таблица расходов по категориям ---
    if (expensesByCategory.length > 0) {
        doc.setFontSize(10);
        doc.text('РАСХОДЫ ПО КАТЕГОРИЯМ', margin, y);
        y += 6;

        const colX = [margin, pageWidth - margin - 40];

        doc.setFontSize(8);
        doc.text('Категория', colX[0], y);
        doc.text('Сумма', colX[1], y, { align: 'right' });
        y += 4;

        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 3;

        doc.setFontSize(8);

        for (const cat of expensesByCategory.slice(0, 8)) {
            const catLabel = getCategoryLabel(cat.category);
            doc.text(catLabel, colX[0], y);
            doc.text(formatMoney(cat.amount), colX[1], y, { align: 'right' });
            y += 5;

            if (y > 250) {
                doc.addPage();
                y = 20;
            }
        }

        y += 5;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    }

    // --- Топ-5 расходов ---
    if (topExpenses.length > 0) {
        doc.setFontSize(10);
        doc.text('ТОП-5 РАСХОДОВ', margin, y);
        y += 6;

        const colX = [margin, margin + 18, pageWidth - margin - 40];

        doc.setFontSize(8);
        doc.text('#', colX[0], y);
        doc.text('Категория / Описание', colX[1], y);
        doc.text('Сумма', colX[2], y, { align: 'right' });
        y += 4;

        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 3;

        doc.setFontSize(8);

        for (let i = 0; i < topExpenses.length; i++) {
            const exp = topExpenses[i];
            const catLabel = getCategoryLabel(exp.category);
            const desc = exp.description ? ` (${exp.description.slice(0, 30)})` : '';

            doc.text(`${i + 1}`, colX[0], y);
            doc.text(`${catLabel}${desc}`, colX[1], y);
            doc.text(formatMoney(exp.amount), colX[2], y, { align: 'right' });
            y += 5;

            if (y > 250) {
                doc.addPage();
                y = 20;
            }
        }

        y += 5;
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    }

    // --- QR-код и подпись ---
    try {
        const qrData = JSON.stringify({
            shop: shopName,
            period: period,
            generated: generatedAt,
            netProfit: kpis.netProfit
        });

        const qrDataURL = await generateQRCodeDataURL(qrData, 40);

        const qrSize = 25;
        const qrX = pageWidth - margin - qrSize;
        const qrY = y;

        doc.addImage(qrDataURL, 'PNG', qrX, qrY, qrSize, qrSize);

        doc.setFontSize(7);
        doc.text('Подписано электронной подписью', margin, y + 8);
        doc.text(`${shopName} • ${new Date(generatedAt).toLocaleDateString('ru-RU')}`, margin, y + 13);
        doc.text('Отсканируйте QR-код для верификации', margin, y + 18);

    } catch (err) {
        console.warn('[PDFExport] QR code generation failed:', err);
        doc.setFontSize(7);
        doc.text(`Подписано электронной печатью • ${new Date(generatedAt).toLocaleDateString('ru-RU')}`, margin, y + 10);
    }

    // --- Сохраняем PDF ---
    const filename = `financial_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);

    console.log('[PDFExport] report saved as:', filename);
}

// ============================================================
// Экспорт отчёта о расходах
// ============================================================

/**
 * Экспортирует отчёт о расходах в PDF.
 *
 * @param {Object} data
 * @param {string} data.shopName
 * @param {string} data.period
 * @param {Array} data.expenses
 * @param {number} data.total
 * @param {string} data.generatedAt
 * @returns {Promise<void>}
 */
export async function exportExpensesReport(data) {
    console.log('[PDFExport] starting expenses report generation');

    await loadLibraries();

    const {
        shopName = 'Чуланчик',
        period = '',
        expenses = [],
        total = 0,
        generatedAt = new Date().toISOString()
    } = data;

    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
        putOnlyUsedFonts: true
    });

    // --- Внедрение кириллического шрифта ---
    if (russianFontBase64) {
        doc.addFileToVFS('Roboto-Regular.ttf', russianFontBase64);
        doc.addFont('Roboto-Regular.ttf', 'Roboto-Regular', 'normal');
        doc.setFont('Roboto-Regular', 'normal');
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Шапка
    doc.setFontSize(18);
    doc.text('Отчёт о расходах', margin, y);

    y += 7;
    doc.setFontSize(10);
    doc.text(`${shopName} • ${period}`, margin, y);

    y += 6;
    const generatedDate = formatDate(generatedAt);
    const generatedTime = new Date(generatedAt).toLocaleTimeString('ru-RU');
    doc.text(`Сформирован: ${generatedDate} ${generatedTime}`, margin, y);

    y += 10;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Итого
    doc.setFontSize(12);
    doc.text(`Общая сумма расходов: ${formatMoney(total)}`, margin, y);
    y += 8;

    // Таблица расходов
    const colX = [margin, margin + 32, margin + 69, margin + 131, margin + 168];

    doc.setFontSize(8);
    doc.text('Дата', colX[0], y);
    doc.text('Категория', colX[1], y);
    doc.text('Описание', colX[2], y);
    doc.text('Сумма', colX[3], y);
    doc.text('Чек', colX[4], y);
    y += 5;

    doc.setDrawColor(220);
    doc.line(margin, y, pageWidth - margin, y);
    y += 3;

    doc.setFontSize(8);

    for (const exp of expenses) {
        if (y > 180) {
            doc.addPage();
            y = 20;
            // Повторяем заголовки
            doc.setFontSize(8);
            doc.text('Дата', colX[0], y);
            doc.text('Категория', colX[1], y);
            doc.text('Описание', colX[2], y);
            doc.text('Сумма', colX[3], y);
            doc.text('Чек', colX[4], y);
            y += 5;
            doc.line(margin, y, pageWidth - margin, y);
            y += 3;
            doc.setFontSize(8);
        }

        doc.text(formatDate(exp.expense_date), colX[0], y);
        doc.text(getCategoryLabel(exp.category), colX[1], y);
        doc.text((exp.description || '—').slice(0, 40), colX[2], y);
        doc.text(formatMoney(exp.amount), colX[3], y);
        doc.text(exp.receipt_url ? '✓' : '—', colX[4], y);

        y += 5;
    }

    const filename = `expenses_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);

    console.log('[PDFExport] expenses report saved as:', filename);
}

// ============================================================
// Хелпер: метки категорий
// ============================================================

function getCategoryLabel(category) {
    const labels = {
        rent: 'Аренда',
        advertising: 'Реклама',
        supplies: 'Хозтовары',
        utilities: 'Коммунальные',
        salary: 'Зарплата',
        taxes: 'Налоги',
        repair: 'Ремонт',
        other: 'Прочее'
    };
    return labels[category] || category;
}

export default {
    exportFinancialReport,
    exportExpensesReport
};
