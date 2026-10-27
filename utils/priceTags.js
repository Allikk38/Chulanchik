// ============================================================
// utils/priceTags.js
// ============================================================

/**
 * Генерация листа ценников для печати на A4.
 *
 * Не зависит от сторов — принимает готовый массив товаров.
 * Формирует HTML-документ и открывает новую вкладку с window.print().
 *
 * Формат:
 *   - A4 (210×297 мм), поля 10 мм;
 *   - сетка: 3 колонки × 8 строк (24 ценника на лист) для размера M;
 *   - 4×10 (40 на лист) для S;
 *   - 2×6 (12 на лист) для L;
 *   - каждый ценник: название (обрезанное), цена (крупно),
 *     опционально — категория, ID, дата поступления, штрихкод товара.
 *
 * @module utils/priceTags
 */

import { formatMoney, formatDate, escapeHtml, getCategoryName } from './formatters.js';

// ============================================================
// Константы
// ============================================================

const SIZES = {
    S: { cols: 4, rows: 10, cellW: '48mm', cellH: '26mm', priceFont: '14pt', nameFont: '6.5pt' },
    M: { cols: 3, rows: 8,  cellW: '63mm', cellH: '34mm', priceFont: '18pt', nameFont: '8pt' },
    L: { cols: 2, rows: 6,  cellW: '95mm', cellH: '45mm', priceFont: '24pt', nameFont: '10pt' }
};

// ============================================================
// Хелперы
// ============================================================

function truncateName(name, max) {
    const s = String(name || 'Без названия');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Рендерит один ценник.
 *
 * @param {Object} product
 * @param {Object} opts
 * @param {string} opts.size — 'S' | 'M' | 'L'
 * @param {boolean} opts.showCategory
 * @param {boolean} opts.showId
 * @param {boolean} opts.showDate
 * @param {boolean} opts.showBarcode
 * @returns {string}
 */
function renderPriceTag(product, opts) {
    const { size, showCategory, showId, showDate, showBarcode } = opts;
    const cfg = SIZES[size] || SIZES.M;

    const nameMax = size === 'S' ? 24 : size === 'M' ? 32 : 48;
    const name = truncateName(product.name, nameMax);

    const meta = [];
    if (showCategory && product.category) {
        meta.push(getCategoryName(product.category));
    }
    if (showDate && product.created_at) {
        meta.push(formatDate(product.created_at));
    }
    if (showId && product.id) {
        meta.push(`ID ${String(product.id).slice(0, 8)}`);
    }

    const barcodeValue = product.id ? String(product.id).slice(0, 32) : '';
    // Простой «псевдо-штрихкод» — чёрные/белые полосы по цифрам.
    // Это НЕ настоящий Code128, а визуальный placeholder.
    // Для настоящего штрихкода нужен JsBarcode (см. TODO ниже).
    const barcodeBars = showBarcode && barcodeValue
        ? Array.from(barcodeValue).map((ch, i) => {
            const w = (parseInt(ch, 10) % 3) + 1;
            return `<span style="display:inline-block;width:${w}px;height:14px;background:#000;margin-right:1px;"></span>`;
        }).join('')
        : '';

    return `
        <div class="tag" style="
            width:${cfg.cellW};
            height:${cfg.cellH};
            border:1px solid #000;
            padding:2mm;
            box-sizing:border-box;
            display:flex;
            flex-direction:column;
            justify-content:space-between;
            overflow:hidden;
            page-break-inside:avoid;
            break-inside:avoid;
            font-family:'Inter',Arial,sans-serif;
        ">
            <div style="
                font-size:${cfg.nameFont};
                line-height:1.15;
                font-weight:500;
                color:#000;
                overflow:hidden;
            ">${escapeHtml(name)}</div>

            <div style="
                font-size:${cfg.priceFont};
                font-weight:700;
                line-height:1;
                color:#000;
                text-align:right;
            ">${escapeHtml(formatMoney(product.price).replace(/\s/g, ''))}</div>

            ${meta.length ? `
                <div style="
                    font-size:${size === 'S' ? '5pt' : '6pt'};
                    color:#000;
                    line-height:1.1;
                    display:flex;
                    justify-content:space-between;
                    gap:2px;
                    flex-wrap:wrap;
                ">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>
            ` : ''}

            ${barcodeBars ? `<div style="margin-top:1mm;">${barcodeBars}</div>` : ''}
        </div>`;
}

// ============================================================
// Сборка документа
// ============================================================

/**
 * Собирает полный HTML-документ с ценниками.
 *
 * @param {Array<Object>} products
 * @param {Object} options
 * @param {string} [options.size='M']
 * @param {boolean} [options.showCategory=true]
 * @param {boolean} [options.showId=false]
 * @param {boolean} [options.showDate=false]
 * @param {boolean} [options.showBarcode=false]
 * @param {number} [options.copies=1] — сколько копий каждого ценника
 * @param {string} [options.shopName='Чуланчик']
 * @returns {string} HTML
 */
export function buildPriceTagsHtml(products, options = {}) {
    const {
        size = 'M',
        showCategory = true,
        showId = false,
        showDate = false,
        showBarcode = false,
        copies = 1,
        shopName = 'Чуланчик'
    } = options;

    const cfg = SIZES[size] || SIZES.M;

    // Размножаем товары по copies
    const expanded = [];
    for (const p of products) {
        for (let i = 0; i < copies; i++) expanded.push(p);
    }

    const tagsHtml = expanded
        .map(p => renderPriceTag(p, { size, showCategory, showId, showDate, showBarcode }))
        .join('');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Ценники — ${escapeHtml(shopName)}</title>
    <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
            font-family: 'Inter', Arial, sans-serif;
            background: #fff;
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .print-toolbar {
            padding: 10px 16px;
            background: #f5f2ed;
            border-bottom: 1px solid #e0dbd3;
            display: flex;
            gap: 12px;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .print-toolbar h3 { margin: 0; font-size: 14px; }
        .print-toolbar button {
            padding: 6px 16px;
            font-size: 13px;
            border-radius: 6px;
            border: 1px solid #1a3c2a;
            background: #1a3c2a;
            color: #fff;
            cursor: pointer;
        }
        .print-toolbar button.secondary {
            background: #fff;
            color: #1a3c2a;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(${cfg.cols}, ${cfg.cellW});
            gap: 0;
            justify-content: flex-start;
            padding: 5mm;
        }
        @media print {
            .print-toolbar { display: none !important; }
            .grid { padding: 0; gap: 0; }
            .tag { border-color: #999 !important; }
        }
    </style>
</head>
<body>
    <div class="print-toolbar">
        <h3>Ценники — ${expanded.length} шт. (${cfg.cols}×${cfg.rows} на лист)</h3>
        <button onclick="window.print()">Печать</button>
        <button class="secondary" onclick="window.close()">Закрыть</button>
    </div>
    <div class="grid">
        ${tagsHtml}
    </div>
    <script>
        // Автозапуск печати через 400 мс — чтобы шрифты успели подгрузиться.
        // Можно отключить, если не нужно.
        setTimeout(() => { try { window.print(); } catch(e) {} }, 400);
    </script>
</body>
</html>`;
}

/**
 * Открывает ценники в новой вкладке.
 *
 * @param {Array<Object>} products
 * @param {Object} options — см. buildPriceTagsHtml
 * @returns {Window|null}
 */
export function printPriceTags(products, options = {}) {
    if (!products || products.length === 0) {
        console.warn('[priceTags] no products to print');
        return null;
    }

    const html = buildPriceTagsHtml(products, options);
    const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
    const url = URL.createObjectURL(blob);

    const win = window.open(url, '_blank');

    if (win) {
        win.addEventListener('load', () => {
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    } else {
        // Popup blocked — скачиваем как файл
        const a = document.createElement('a');
        a.href = url;
        a.download = `price-tags-${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return win;
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    printPriceTags,
    buildPriceTagsHtml,
    SIZES
};