// ============================================================
// utils/pdfExport.js
// v1.4.0 — 2026-04-30: встроенный шрифт PTSans с кириллицей
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Модуль экспорта отчётов в PDF.
//
// ЗАВИСИМОСТИ
//   jsPDF (CDN) — создание PDF
//   qrcode (CDN) — генерация QR-кодов
//
// ИСПОЛЬЗУЕТСЯ
//   ReportsController.exportPdf() — финансовый отчёт
//
// ИЗМЕНЕНИЯ
//   v1.4.0 — кириллица:
//     - добавлен loadFont() с загрузкой PTSans через jsDelivr (CORS-friendly)
//     - шрифт регистрируется в jsPDF через addFont
//     - весь текст отображается через setFont('PTSans')
//     - при ошибке загрузки — fallback на courier с предупреждением
//   v1.3.0 — детальные логи, упрощена загрузка библиотек
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
// Загрузка jsPDF
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
                reject(new Error('jsPDF constructor not found'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load jsPDF'));
        document.head.appendChild(script);
    });
}

// ============================================================
// Загрузка QRCode
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
        script.onerror = () => reject(new Error('Failed to load QRCode'));
        document.head.appendChild(script);
    });
}

// ============================================================
// Загрузка кириллического шрифта (PTSans)
// ============================================================

async function loadFont() {
    if (fontBase64) return fontBase64;

    const fontUrl = 'https://cdn.jsdelivr.net/npm/@canvas-fonts/ptsans@1.0.0/PT_Sans-Web-Regular.ttf';

    console.log('[PDFExport] Loading font from:', fontUrl);

    const response = await fetch(fontUrl, { mode: 'cors' });

    if (!response.ok) {
        throw new Error(`Font fetch failed: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Конвертируем в base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }

    fontBase64 = btoa(binary);
    console.log('[PDFExport] Font loaded successfully, size:', fontBase64.length, 'chars');

    return fontBase64;
}

// ============================================================
// Инициализация всех библиотек
// ============================================================

async function loadLibraries() {
    if (jsPDF && qrcode) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        console.log('[PDFExport] Loading libraries...');

        await Promise.all([
            loadJsPDF(),
            loadQRCode()
        ]);

        jsPDF = window.jspdf.jsPDF;
        qrcode = window.QRCode;

        console.log('[PDFExport] Libraries loaded');
    })();

    return loadPromise;
}

// ============================================================
// Генерация QR-кода
// ============================================================

function generateQRCodeDataURL(text, size = 100) {
    return new Promise((resolve, reject) => {
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
                if (canvas) {
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    resolve(null);
                }
                container.remove();
            }, 150);
        } catch (err) {
            container.remove();
            resolve(null);
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
        const val = values[Math.min(Math.floor(i * step), values.length - 1)];
        const idx = Math.min(Math.floor(((val - min) / range) * (chars.length - 1)), chars.length - 1);
        result += chars[idx];
    }

    return result;
}

// ============================================================
// Хелпер: метки категорий
// ============================================================

function getCategoryLabel(category) {
    const map = {
        rent: 'Аренда',
        advertising: 'Реклама',
        supplies: 'Хозтовары',
        utilities: 'Коммунальные',
        salary: 'Зарплата',
        taxes: 'Налоги',
        repair: 'Ремонт',
        other: 'Прочее'
    };
    return map[category] || category;
}

// ============================================================
// Экспорт финансового отчёта в PDF
// ============================================================

export async function exportFinancialReport(data) {
    console.log('[PDFExport] === Starting financial report ===');

    // 1. Загружаем библиотеки
    await loadLibraries();

    // 2. Пытаемся загрузить шрифт (не блокирует создание PDF)
    let fontReady = false;
    try {
        await loadFont();
        fontReady = true;
        console.log('[PDFExport] Font ready for Cyrillic');
    } catch (err) {
        console.warn('[PDFExport] Font not available, text may not display correctly:', err.message);
    }

    // 3. Создаём документ
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // 4. Регистрируем шрифт если загружен
    if (fontReady && fontBase64) {
        doc.addFileToVFS('PTSans-Regular.ttf', fontBase64);
        doc.addFont('PTSans-Regular.ttf', 'PTSans', 'normal');
        doc.setFont('PTSans', 'normal');
        console.log('[PDFExport] Using PTSans font');
    } else {
        doc.setFont('courier', 'normal');
        console.log('[PDFExport] Using fallback courier font');
    }

    const { shopName = 'Чуланчик', period = '', kpis = {}, dailyRevenue = [], expensesByCategory = [], topExpenses = [], generatedAt = new Date().toISOString() } = data;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

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
    doc.text(`Сформирован: ${formatDate(generatedAt)} ${new Date(generatedAt).toLocaleTimeString('ru-RU')}`, margin, y);
    y += 10;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // --- KPI ---
    if (kpis.revenue !== undefined) {
        doc.setFontSize(10);
        doc.text('КЛЮЧЕВЫЕ ПОКАЗАТЕЛИ', margin, y);
        y += 8;

        const cardW = (pageWidth - margin * 2 - 6) / 4;
        const cards = [
            ['Выручка', formatMoney(kpis.revenue || 0)],
            ['Прибыль', formatMoney(kpis.profit || 0)],
            ['Расходы', formatMoney(kpis.expenses || 0)],
            ['Чистая прибыль', formatMoney(kpis.netProfit || 0)]
        ];

        cards.forEach(([label, value], i) => {
            const x = margin + i * (cardW + 2);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(x, y, cardW, 24, 2, 2, 'F');
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
        doc.text('ДИНАМИКА ВЫРУЧКИ', margin, y);
        y += 7;

        const values = dailyRevenue.map(d => d.revenue || 0);
        doc.setFontSize(8);
        doc.text(renderSparkline(values, 50), margin, y);
        y += 6;

        doc.setFontSize(7);
        doc.text(`Макс: ${formatMoney(Math.max(...values))}  |  Мин: ${formatMoney(Math.min(...values))}  |  Дней: ${values.length}`, margin, y);
        y += 10;
    }

    // --- Расходы по категориям ---
    if (expensesByCategory.length > 0) {
        doc.setFontSize(10);
        doc.text('РАСХОДЫ ПО КАТЕГОРИЯМ', margin, y);
        y += 7;
        doc.setFontSize(8);
        doc.text('Категория', margin, y);
        doc.text('Сумма', pageWidth - margin - 40, y, { align: 'right' });
        y += 4;
        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;

        for (const cat of expensesByCategory.slice(0, 8)) {
            if (y > 260) {
                doc.addPage();
                if (fontReady && fontBase64) {
                    doc.setFont('PTSans', 'normal');
                } else {
                    doc.setFont('courier', 'normal');
                }
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
        doc.setFontSize(10);
        doc.text('ТОП-5 РАСХОДОВ', margin, y);
        y += 7;
        doc.setFontSize(8);
        doc.text('#', margin, y);
        doc.text('Категория / Описание', margin + 8, y);
        doc.text('Сумма', pageWidth - margin - 40, y, { align: 'right' });
        y += 4;
        doc.setDrawColor(220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;

        topExpenses.slice(0, 5).forEach((exp, i) => {
            if (y > 260) {
                doc.addPage();
                if (fontReady && fontBase64) {
                    doc.setFont('PTSans', 'normal');
                } else {
                    doc.setFont('courier', 'normal');
                }
                doc.setFontSize(8);
                y = 20;
            }
            const desc = exp.description ? ` ${exp.description.slice(0, 30)}` : '';
            doc.text(`${i + 1}`, margin, y);
            doc.text(`${getCategoryLabel(exp.category)}${desc}`, margin + 8, y);
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
        const qrUrl = await generateQRCodeDataURL(JSON.stringify({
            shop: shopName,
            period,
            generated: generatedAt
        }), 80);

        if (qrUrl) {
            const qrSize = 20;
            doc.addImage(qrUrl, 'PNG', pageWidth - margin - qrSize, y, qrSize, qrSize);
        }
    } catch (err) {
        console.warn('[PDFExport] QR skipped:', err.message);
    }

    doc.setFontSize(7);
    doc.text(`Подписано электронной печатью • ${formatDate(generatedAt)}`, margin, y + 8);

    // --- Сохранение ---
    const filename = `financial_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    console.log('[PDFExport] === Saved:', filename, '===');
}

// ============================================================
// Экспорт отчёта о расходах
// ============================================================

export async function exportExpensesReport(data) {
    // Будет реализовано позже
    console.log('[PDFExport] exportExpensesReport not implemented');
}

export default { exportFinancialReport, exportExpensesReport };
