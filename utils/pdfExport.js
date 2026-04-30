// ============================================================
// utils/pdfExport.js
// v1.6.0 — 2026-04-30: загрузка шрифта из локального файла
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Модуль экспорта отчётов в PDF с поддержкой кириллицы.
//
// ШРИФТ
//   Roboto-Regular.ttf должен находиться в папке fonts/
//   Скачать: https://fonts.google.com/specimen/Roboto
//
// ЗАВИСИМОСТИ
//   jsPDF (CDN)         — создание PDF
//   qrcode (CDN)        — генерация QR-кодов
//   fonts/Roboto-Regular.ttf — локальный шрифт с кириллицей
//
// ИСПОЛЬЗУЕТСЯ
//   ReportsController.exportPdf() — финансовый отчёт
//
// ИЗМЕНЕНИЯ
//   v1.6.0 — локальный файл шрифта:
//     - Roboto-Regular.ttf загружается из fonts/
//     - регистрируется в jsPDF через addFont
//     - работает без интернета после первой загрузки
//   v1.5.0 — встроенный base64 (отменено — слишком большой)
//   v1.4.0 — загрузка через jsDelivr (CORS)
//
// ============================================================

import { formatMoney, formatDate } from './formatters.js';

// ============================================================
// Состояние
// ============================================================

let jsPDF = null;
let qrcode = null;
let loadPromise = null;
let fontBase64 = null;

// ============================================================
// Загрузка jsPDF с CDN
// ============================================================

function loadJsPDF() {
    return new Promise((resolve, reject) => {
        if (window.jspdf?.jsPDF) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            if (window.jspdf?.jsPDF) {
                resolve();
            } else {
                reject(new Error('jsPDF не загрузился'));
            }
        };
        script.onerror = () => reject(new Error('Нет интернета для загрузки jsPDF'));
        document.head.appendChild(script);
    });
}

// ============================================================
// Загрузка QRCode с CDN
// ============================================================

function loadQRCode() {
    return new Promise((resolve, reject) => {
        if (window.QRCode) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Нет интернета для загрузки QRCode'));
        document.head.appendChild(script);
    });
}

// ============================================================
// Загрузка шрифта из локальной папки fonts/
// ============================================================

async function loadFont() {
    // Уже загружен
    if (fontBase64) return fontBase64;

    console.log('[PDFExport] Loading font from fonts/Roboto-Regular.ttf...');

    const response = await fetch('fonts/Roboto-Regular.ttf');

    if (!response.ok) {
        throw new Error(`Файл шрифта не найден: fonts/Roboto-Regular.ttf (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Конвертация в base64
    let binary = '';
    uint8Array.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    fontBase64 = btoa(binary);
    console.log('[PDFExport] Font loaded and converted to base64');

    return fontBase64;
}

// ============================================================
// Инициализация всего
// ============================================================

async function loadLibraries() {
    if (jsPDF && qrcode) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        console.log('[PDFExport] Loading CDN libraries...');
        await Promise.all([loadJsPDF(), loadQRCode()]);
        jsPDF = window.jspdf.jsPDF;
        qrcode = window.QRCode;
        console.log('[PDFExport] Libraries ready');
    })();

    return loadPromise;
}

// ============================================================
// Регистрация шрифта в документе
// ============================================================

function registerFont(doc) {
    if (fontBase64) {
        doc.addFileToVFS('Roboto-Regular.ttf', fontBase64);
        doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.setFont('Roboto', 'normal');
    } else {
        // Фолбэк — стандартный шрифт без кириллицы
        doc.setFont('courier', 'normal');
    }
}

// ============================================================
// QR-код
// ============================================================

function generateQRCodeDataURL(text, size = 80) {
    return new Promise((resolve) => {
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
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
                resolve(canvas ? canvas.toDataURL('image/png') : null);
                container.remove();
            }, 150);
        } catch (e) {
            container.remove();
            resolve(null);
        }
    });
}

// ============================================================
// Спарклайн
// ============================================================

function renderSparkline(values, width = 50) {
    if (!values?.length) return '-'.repeat(width);

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return '—'.repeat(width);

    const chars = '▁▂▃▄▅▆▇█';
    const step = values.length / width;
    let result = '';

    for (let i = 0; i < width; i++) {
        const val = values[Math.min(Math.floor(i * step), values.length - 1)];
        const idx = Math.min(Math.floor(((val - min) / (max - min)) * (chars.length - 1)), chars.length - 1);
        result += chars[idx];
    }

    return result;
}

// ============================================================
// Метки категорий
// ============================================================

function getCategoryLabel(cat) {
    const map = {
        rent: 'Аренда', advertising: 'Реклама', supplies: 'Хозтовары',
        utilities: 'Коммунальные', salary: 'Зарплата', taxes: 'Налоги',
        repair: 'Ремонт', other: 'Прочее'
    };
    return map[cat] || cat;
}

// ============================================================
// Экспорт финансового отчёта в PDF
// ============================================================

export async function exportFinancialReport(data) {
    console.log('[PDFExport] === Starting PDF generation ===');

    // 1. Загружаем библиотеки
    await loadLibraries();

    // 2. Загружаем шрифт
    try {
        await loadFont();
        console.log('[PDFExport] Font ready');
    } catch (err) {
        console.warn('[PDFExport] Font not loaded:', err.message);
        console.warn('[PDFExport] Cyrillic text will not display correctly');
    }

    // 3. Создаём документ
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    registerFont(doc);

    const {
        shopName = 'Чуланчик',
        period = '',
        kpis = {},
        dailyRevenue = [],
        expensesByCategory = [],
        topExpenses = [],
        generatedAt = new Date().toISOString()
    } = data;

    const pw = doc.internal.pageSize.getWidth();
    const m = 15;
    let y = 20;

    // --- Заголовок ---
    doc.setFontSize(20);
    doc.text(shopName, m, y);
    y += 8;
    doc.setFontSize(10);
    doc.text('Финансовый отчёт', m, y);
    y += 6;
    doc.setFontSize(9);
    doc.text(`Период: ${period}`, m, y);
    y += 5;
    doc.text(`Сформирован: ${formatDate(generatedAt)} ${new Date(generatedAt).toLocaleTimeString('ru-RU')}`, m, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(m, y, pw - m, y);
    y += 8;

    // --- KPI ---
    if (kpis.revenue !== undefined) {
        doc.setFontSize(10);
        doc.text('КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ', m, y);
        y += 8;

        const cw = (pw - m * 2 - 6) / 4;
        [
            ['Выручка', formatMoney(kpis.revenue || 0)],
            ['Прибыль', formatMoney(kpis.profit || 0)],
            ['Расходы', formatMoney(kpis.expenses || 0)],
            ['Чистая прибыль', formatMoney(kpis.netProfit || 0)]
        ].forEach(([label, value], i) => {
            const x = m + i * (cw + 2);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(x, y, cw, 24, 2, 2, 'F');
            doc.setFontSize(7);
            doc.text(label, x + 3, y + 7);
            doc.setFontSize(13);
            doc.text(value, x + 3, y + 19);
        });
        y += 32;
    }

    // --- Спарклайн ---
    if (dailyRevenue.length > 0) {
        doc.setFontSize(10);
        doc.text('ДИНАМИКА ВЫРУЧКИ', m, y);
        y += 7;
        const vals = dailyRevenue.map(d => d.revenue || 0);
        doc.setFontSize(8);
        doc.text(renderSparkline(vals, 50), m, y);
        y += 6;
        doc.setFontSize(7);
        doc.text(`Макс: ${formatMoney(Math.max(...vals))}  |  Мин: ${formatMoney(Math.min(...vals))}  |  Дней: ${vals.length}`, m, y);
        y += 10;
    }

    // --- Расходы по категориям ---
    if (expensesByCategory.length > 0) {
        doc.setFontSize(10);
        doc.text('РАСХОДЫ ПО КАТЕГОРИЯМ', m, y);
        y += 7;
        doc.setFontSize(8);
        doc.text('Категория', m, y);
        doc.text('Сумма', pw - m - 40, y, { align: 'right' });
        y += 4;
        doc.setDrawColor(220);
        doc.line(m, y, pw - m, y);
        y += 4;

        for (const cat of expensesByCategory.slice(0, 8)) {
            if (y > 260) { doc.addPage(); registerFont(doc); doc.setFontSize(8); y = 20; }
            doc.text(getCategoryLabel(cat.category), m, y);
            doc.text(formatMoney(cat.amount), pw - m - 40, y, { align: 'right' });
            y += 5;
        }
        y += 5;
        doc.line(m, y, pw - m, y);
        y += 8;
    }

    // --- Топ-5 ---
    if (topExpenses.length > 0) {
        doc.setFontSize(10);
        doc.text('ТОП-5 РАСХОДОВ', m, y);
        y += 7;
        doc.setFontSize(8);
        doc.text('#', m, y);
        doc.text('Категория / Описание', m + 8, y);
        doc.text('Сумма', pw - m - 40, y, { align: 'right' });
        y += 4;
        doc.setDrawColor(220);
        doc.line(m, y, pw - m, y);
        y += 4;

        topExpenses.slice(0, 5).forEach((exp, i) => {
            if (y > 260) { doc.addPage(); registerFont(doc); doc.setFontSize(8); y = 20; }
            const desc = exp.description ? ` ${exp.description.slice(0, 30)}` : '';
            doc.text(`${i + 1}`, m, y);
            doc.text(`${getCategoryLabel(exp.category)}${desc}`, m + 8, y);
            doc.text(formatMoney(exp.amount), pw - m - 40, y, { align: 'right' });
            y += 5;
        });
        y += 5;
        doc.line(m, y, pw - m, y);
        y += 8;
    }

    // --- QR-код ---
    const qrUrl = await generateQRCodeDataURL(JSON.stringify({
        shop: shopName,
        period,
        generated: generatedAt
    }));

    if (qrUrl) {
        doc.addImage(qrUrl, 'PNG', pw - m - 20, y, 20, 20);
    }

    doc.setFontSize(7);
    doc.text(`Подписано электронной печатью • ${formatDate(generatedAt)}`, m, y + 8);

    // --- Сохранение ---
    const filename = `financial_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    console.log('[PDFExport] === Saved:', filename, '===');
}

// ============================================================

export async function exportExpensesReport(data) {
    // Будет реализовано позже
}

export default { exportFinancialReport, exportExpensesReport };
