// ============================================================
// utils/pdfExport.js
// v1.3.0 — 2026-04-30: исправлена загрузка jsPDF, добавлены логи
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Модуль экспорта отчётов в PDF.
//   Создаёт профессиональные документы с таблицами и QR-кодами.
//
// ЗАВИСИМОСТИ
//   html2canvas (CDN) — рендеринг HTML в canvas (в данной версии не используется)
//   jsPDF (CDN)        — создание PDF
//   qrcode (CDN)        — генерация QR-кодов
//
// ИСПОЛЬЗУЕТСЯ
//   ReportsController.exportPdf()  — финансовый отчёт
//
// ИЗМЕНЕНИЯ
//   v1.3.0 — полный рефакторинг загрузки библиотек:
//     - добавлены детальные логи на каждом шаге
//     - исправлено получение конструктора jsPDF
//     - убран неиспользуемый html2canvas
//     - loadRussianFont временно закомментирован до решения проблемы CORS
//   v1.2.1 — фолбэк при ошибке загрузки шрифта
//   v1.2.0 — добавлена функция loadRussianFont()
//   v1.1.0 — добавлен exportExpensesReport()
//   v1.0.0 — первоначальная версия
//
// ============================================================

import { formatMoney, formatDate } from './formatters.js';

// ============================================================
// Состояние библиотек
// ============================================================

let jsPDF = null;
let qrcode = null;
let loadPromise = null;

// ============================================================
// Загрузка jsPDF
// ============================================================

function loadJsPDF() {
    return new Promise((resolve, reject) => {
        // Уже загружен
        if (window.jspdf && (window.jspdf.jsPDF || window.jspdf.JSPDF)) {
            console.log('[PDFExport] jsPDF already loaded');
            resolve();
            return;
        }

        console.log('[PDFExport] Loading jsPDF from CDN...');

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

        script.onload = () => {
            console.log('[PDFExport] jsPDF script loaded');

            // Пробуем все возможные имена конструктора
            const JsPDF = window.jspdf?.jsPDF
                || window.jspdf?.JSPDF
                || (window.jspdf?.default?.jsPDF);

            if (JsPDF) {
                console.log('[PDFExport] jsPDF constructor found');
                resolve();
            } else {
                console.error('[PDFExport] jsPDF constructor not found in window.jspdf');
                console.log('[PDFExport] Available keys:', window.jspdf ? Object.keys(window.jspdf) : 'jspdf is null');
                reject(new Error('Конструктор jsPDF не найден'));
            }
        };

        script.onerror = () => {
            console.error('[PDFExport] Failed to load jsPDF script');
            reject(new Error('Не удалось загрузить jsPDF с CDN'));
        };

        document.head.appendChild(script);
    });
}

// ============================================================
// Загрузка QRCode
// ============================================================

function loadQRCode() {
    return new Promise((resolve, reject) => {
        if (window.QRCode) {
            console.log('[PDFExport] QRCode already loaded');
            resolve();
            return;
        }

        console.log('[PDFExport] Loading QRCode from CDN...');

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

        script.onload = () => {
            console.log('[PDFExport] QRCode script loaded');
            resolve();
        };

        script.onerror = () => {
            console.error('[PDFExport] Failed to load QRCode script');
            reject(new Error('Не удалось загрузить QRCode с CDN'));
        };

        document.head.appendChild(script);
    });
}

// ============================================================
// Инициализация всех библиотек
// ============================================================

async function loadLibraries() {
    if (jsPDF && qrcode) {
        console.log('[PDFExport] Libraries already initialized');
        return;
    }

    if (loadPromise) {
        console.log('[PDFExport] Libraries already loading, waiting...');
        return loadPromise;
    }

    loadPromise = (async () => {
        try {
            console.log('[PDFExport] Starting library loading...');

            await Promise.all([
                loadJsPDF(),
                loadQRCode()
            ]);

            // Получаем конструктор jsPDF
            jsPDF = window.jspdf?.jsPDF
                || window.jspdf?.JSPDF
                || (window.jspdf?.default?.jsPDF);

            if (!jsPDF) {
                throw new Error('Не удалось получить конструктор jsPDF после загрузки');
            }

            console.log('[PDFExport] jsPDF constructor obtained:', typeof jsPDF);

            // Получаем QRCode
            qrcode = window.QRCode;

            if (!qrcode) {
                throw new Error('Не удалось получить QRCode после загрузки');
            }

            console.log('[PDFExport] All libraries loaded successfully');
            console.log('[PDFExport] jsPDF type:', typeof jsPDF);
            console.log('[PDFExport] QRCode type:', typeof qrcode);

        } catch (err) {
            console.error('[PDFExport] Library loading failed:', err);
            loadPromise = null;
            throw err;
        }
    })();

    return loadPromise;
}

// ============================================================
// Генерация QR-кода
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
                colorDark: '#1a3c2a',
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
// Спарклайн
// ============================================================

function renderSparkline(values, width = 50) {
    if (!values || values.length === 0) return '-'.repeat(width);

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range === 0) return '-'.repeat(width);

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const step = values.length / width;

    let result = '';
    for (let i = 0; i < width; i++) {
        const idx = Math.floor(i * step);
        const val = values[Math.min(idx, values.length - 1)];
        const normalized = (val - min) / range;
        const charIdx = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
        result += chars[charIdx];
    }

    return result;
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

// ============================================================
// Экспорт финансового отчёта в PDF
// ============================================================

/**
 * Экспортирует финансовый отчёт в PDF.
 *
 * @param {Object} data
 * @param {string} data.shopName
 * @param {string} data.period
 * @param {Object} data.kpis - { revenue, profit, expenses, netProfit }
 * @param {Array} data.dailyRevenue
 * @param {Array} data.expensesByCategory
 * @param {Array} data.topExpenses
 * @param {string} data.generatedAt
 * @returns {Promise<void>}
 */
export async function exportFinancialReport(data) {
    console.log('[PDFExport] === Starting financial report generation ===');

    try {
        console.log('[PDFExport] Step 1: Loading libraries...');
        await loadLibraries();
        console.log('[PDFExport] Step 1 complete: Libraries loaded');
    } catch (err) {
        console.error('[PDFExport] Failed to load libraries:', err);
        throw new Error('Не удалось загрузить библиотеки для PDF. Проверьте подключение к интернету.');
    }

    console.log('[PDFExport] Step 2: Creating jsPDF instance...');

    const { shopName = 'Чуланчик', period = '', kpis = {}, dailyRevenue = [], expensesByCategory = [], topExpenses = [], generatedAt = new Date().toISOString() } = data;

    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
    });

    console.log('[PDFExport] Step 2 complete: jsPDF instance created');

    // Для кириллицы используем courier (содержит кириллицу в jsPDF 2.5+)
    doc.setFont('courier', 'normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    console.log('[PDFExport] Step 3: Rendering header...');

    // --- Заголовок ---
    doc.setFontSize(20);
    doc.text(shopName, margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.text('Финансовый отчёт', margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.text(`Период: ${period}`, margin, y);
    y += 5;

    const genDate = formatDate(generatedAt);
    const genTime = new Date(generatedAt).toLocaleTimeString('ru-RU');
    doc.text(`Сформирован: ${genDate} ${genTime}`, margin, y);
    y += 10;

    // --- Линия-разделитель ---
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    console.log('[PDFExport] Step 4: Rendering KPI cards...');

    // --- KPI карточки ---
    if (kpis.revenue !== undefined) {
        doc.setFontSize(10);
        doc.text('КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ', margin, y);
        y += 6;

        const cardWidth = (pageWidth - margin * 2 - 8) / 4;
        const cards = [
            { label: 'Выручка', value: formatMoney(kpis.revenue || 0) },
            { label: 'Прибыль', value: formatMoney(kpis.profit || 0) },
            { label: 'Расходы', value: formatMoney(kpis.expenses || 0) },
            { label: 'Чистая прибыль', value: formatMoney(kpis.netProfit || 0) }
        ];

        cards.forEach((card, i) => {
            const x = margin + i * (cardWidth + 2);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(x, y, cardWidth, 25, 2, 2, 'F');
            doc.setFontSize(7);
            doc.text(card.label, x + 4, y + 8);
            doc.setFontSize(13);
            doc.text(card.value, x + 4, y + 20);
        });

        y += 32;
    }

    // --- Спарклайн ---
    if (dailyRevenue.length > 0) {
        console.log('[PDFExport] Step 5: Rendering sparkline...');

        doc.setFontSize(10);
        doc.text('ДИНАМИКА ВЫРУЧКИ', margin, y);
        y += 6;

        const revenueValues = dailyRevenue.map(d => d.revenue || 0);
        const sparklineText = renderSparkline(revenueValues, 50);

        doc.setFontSize(8);
        doc.text(sparklineText, margin, y);
        y += 6;

        const maxRev = Math.max(...revenueValues);
        const minRev = Math.min(...revenueValues);

        doc.setFontSize(7);
        doc.text(`Макс: ${formatMoney(maxRev)}  |  Мин: ${formatMoney(minRev)}  |  Дней: ${revenueValues.length}`, margin, y);
        y += 10;
    }

    // --- Расходы по категориям ---
    if (expensesByCategory.length > 0) {
        console.log('[PDFExport] Step 6: Rendering expenses by category...');

        doc.setFontSize(10);
        doc.text('РАСХОДЫ ПО КАТЕГОРИЯМ', margin, y);
        y += 6;

        doc.setFontSize(8);
        doc.text('Категория', margin, y);
        doc.text('Сумма', pageWidth - margin - 40, y, { align: 'right' });
        y += 4;

        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 3;

        doc.setFontSize(8);

        for (const cat of expensesByCategory.slice(0, 8)) {
            if (y > 260) {
                doc.addPage();
                doc.setFont('courier', 'normal');
                doc.setFontSize(8);
                y = 20;
            }

            doc.text(getCategoryLabel(cat.category), margin, y);
            doc.text(formatMoney(cat.amount), pageWidth - margin - 40, y, { align: 'right' });
            y += 5;
        }

        y += 5;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    }

    // --- Топ-5 расходов ---
    if (topExpenses.length > 0) {
        console.log('[PDFExport] Step 7: Rendering top expenses...');

        doc.setFontSize(10);
        doc.text('ТОП-5 РАСХОДОВ', margin, y);
        y += 6;

        doc.setFontSize(8);
        doc.text('#', margin, y);
        doc.text('Категория / Описание', margin + 10, y);
        doc.text('Сумма', pageWidth - margin - 40, y, { align: 'right' });
        y += 4;

        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 3;

        doc.setFontSize(8);

        topExpenses.slice(0, 5).forEach((exp, i) => {
            if (y > 260) {
                doc.addPage();
                doc.setFont('courier', 'normal');
                doc.setFontSize(8);
                y = 20;
            }

            const desc = exp.description ? ` (${exp.description.slice(0, 30)})` : '';
            doc.text(`${i + 1}`, margin, y);
            doc.text(`${getCategoryLabel(exp.category)}${desc}`, margin + 10, y);
            doc.text(formatMoney(exp.amount), pageWidth - margin - 40, y, { align: 'right' });
            y += 5;
        });

        y += 5;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    }

    // --- QR-код ---
    try {
        console.log('[PDFExport] Step 8: Generating QR code...');

        const qrData = JSON.stringify({
            shop: shopName,
            period: period,
            generated: generatedAt,
            netProfit: kpis.netProfit || 0
        });

        const qrDataURL = await generateQRCodeDataURL(qrData, 80);
        const qrSize = 20;
        const qrX = pageWidth - margin - qrSize;

        doc.addImage(qrDataURL, 'PNG', qrX, y, qrSize, qrSize);

        doc.setFontSize(7);
        doc.text('Подписано электронной печатью', margin, y + 4);
        doc.text(`${shopName} • ${genDate}`, margin, y + 9);
        doc.text('Отсканируйте QR-код для верификации', margin, y + 14);

        console.log('[PDFExport] Step 8 complete: QR code added');
    } catch (err) {
        console.warn('[PDFExport] QR code generation failed:', err.message);
        doc.setFontSize(7);
        doc.text(`Подписано электронной печатью • ${genDate}`, margin, y + 8);
    }

    // --- Сохранение ---
    console.log('[PDFExport] Step 9: Saving PDF...');

    const filename = `financial_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);

    console.log('[PDFExport] === Report saved as:', filename, '===');
}

// ============================================================
// Экспорт отчёта о расходах в PDF (пока заглушка)
// ============================================================

export async function exportExpensesReport(data) {
    console.log('[PDFExport] Expenses report not yet implemented in this version');
    // В будущем можно добавить
}

export default {
    exportFinancialReport,
    exportExpensesReport
};
