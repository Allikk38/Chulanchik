// ============================================================
// components/PriceTagForm.js
// ============================================================

/**
 * Модалка выбора товаров и настроек для печати ценников.
 *
 * Чистый UI: принимает productStore, возвращает Promise<void>.
 * При подтверждении вызывает printPriceTags() из utils/priceTags.js.
 *
 * @module components/PriceTagForm
 */

import { productStore } from '../stores/ProductStore.js';
import { getCategoryName, escapeHtml } from '../utils/formatters.js';
import { showNotification } from '../utils/ui.js';
import { printPriceTags } from '../utils/priceTags.js';

// ============================================================
// HTML
// ============================================================

function modalHtml() {
    return `
    <div class="modal-overlay" id="priceTagOverlay">
        <div class="modal" style="max-width:720px;">
            <div class="modal-header">
                <h3>Печать ценников</h3>
                <button class="btn-close" id="ptClose">x</button>
            </div>
            <div class="modal-body">

                <div class="form-group">
                    <label>Что печатать</label>
                    <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
                        <label class="radio-label">
                            <input type="radio" name="ptScope" value="all" checked>
                            Все товары в наличии (<span id="ptCountAll">0</span>)
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="ptScope" value="category">
                            По категории
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="ptScope" value="selected">
                            Только выбранные (<span id="ptCountSelected">0</span>)
                        </label>
                    </div>
                </div>

                <div class="form-group" id="ptCategoryGroup" style="display:none;">
                    <label>Категория</label>
                    <select id="ptCategory"></select>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Размер ценника</label>
                        <select id="ptSize">
                            <option value="S">S — 4×10 на лист (48×26 мм)</option>
                            <option value="M" selected>M — 3×8 на лист (63×34 мм)</option>
                            <option value="L">L — 2×6 на лист (95×45 мм)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Копий каждого</label>
                        <input type="number" id="ptCopies" min="1" max="10" value="1">
                    </div>
                </div>

                <div class="form-group">
                    <label>Дополнительно</label>
                    <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
                        <label class="checkbox-label">
                            <input type="checkbox" id="ptShowCategory" checked> Категория
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="ptShowDate"> Дата поступления
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="ptShowId"> ID товара (8 символов)
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="ptShowBarcode"> Псевдо-штрихкод
                        </label>
                    </div>
                </div>

                <div id="ptPreviewInfo" style="
                    padding:10px 12px;
                    background:#faf9f7;
                    border-radius:6px;
                    font-size:13px;
                    color:#6b5e53;
                    border-left:3px solid #1a3c2a;
                ">Будет напечатано: 0 ценников</div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="ptCancel">Отмена</button>
                <button type="button" class="btn-primary" id="ptPrint">Печать</button>
            </div>
        </div>
    </div>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Открывает модалку печати ценников.
 *
 * @param {Object} [options]
 * @param {string[]} [options.selectedIds] — предвыбранные ID (из таблицы склада)
 * @returns {Promise<void>}
 */
export function openPriceTagModal({ selectedIds = [] } = {}) {
    return new Promise((resolve) => {
        const container = document.getElementById('modalContainer') || document.body;
        container.insertAdjacentHTML('beforeend', modalHtml());

        const overlay = document.getElementById('priceTagOverlay');
        const $ = id => document.getElementById(id);

        // --- Данные ---
        const allInStock = productStore.getInStock();
        const categories = productStore.getCategories();

        // --- Инициализация UI ---
        $('ptCountAll').textContent = allInStock.length;
        $('ptCountSelected').textContent = selectedIds.length;

        // Категории
        const catSelect = $('ptCategory');
        catSelect.innerHTML = categories.map(c =>
            `<option value="${escapeHtml(c.value)}">${escapeHtml(getCategoryName(c.value))} (${c.count})</option>`
        ).join('');

        // Если выбрано 0 товаров — радио «Только выбранные» дизейблим
        if (selectedIds.length === 0) {
            const radio = overlay.querySelector('input[value="selected"]');
            if (radio) {
                radio.disabled = true;
                radio.parentElement.style.opacity = '0.5';
            }
        }

        // --- Пересчёт «Будет напечатано» ---
        const updatePreview = () => {
            const scope = overlay.querySelector('input[name="ptScope"]:checked').value;
            const copies = Math.max(1, parseInt($('ptCopies').value, 10) || 1);
            let count = 0;

            if (scope === 'all') count = allInStock.length;
            else if (scope === 'selected') count = selectedIds.length;
            else if (scope === 'category') {
                const cat = catSelect.value;
                count = productStore.getByCategory(cat).filter(p => p.status === 'in_stock').length;
            }

            const total = count * copies;
            const perPage = { S: 40, M: 24, L: 12 }[$('ptSize').value] || 24;
            const pages = Math.ceil(total / perPage);

            $('ptPreviewInfo').textContent = total > 0
                ? `Будет напечатано: ${total} ценник(ов) на ${pages} лист(ах) A4`
                : 'Нет товаров для печати';
        };

        overlay.querySelectorAll('input[name="ptScope"]').forEach(r => {
            r.addEventListener('change', () => {
                const scope = overlay.querySelector('input[name="ptScope"]:checked').value;
                $('ptCategoryGroup').style.display = scope === 'category' ? 'block' : 'none';
                updatePreview();
            });
        });
        catSelect.addEventListener('change', updatePreview);
        $('ptCopies').addEventListener('input', updatePreview);
        $('ptSize').addEventListener('change', updatePreview);

        updatePreview();

        // --- Закрытие ---
        const close = () => {
            overlay.remove();
            resolve();
        };
        $('ptClose').onclick = close;
        $('ptCancel').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // --- Печать ---
        $('ptPrint').onclick = () => {
            const scope = overlay.querySelector('input[name="ptScope"]:checked').value;
            let products = [];

            if (scope === 'all') {
                products = allInStock;
            } else if (scope === 'category') {
                products = productStore.getByCategory(catSelect.value).filter(p => p.status === 'in_stock');
            } else if (scope === 'selected') {
                products = selectedIds
                    .map(id => productStore.getById(id))
                    .filter(p => p && p.status === 'in_stock');
            }

            if (products.length === 0) {
                showNotification('Нет товаров для печати', 'warning');
                return;
            }

            const copies = Math.max(1, Math.min(10, parseInt($('ptCopies').value, 10) || 1));

            printPriceTags(products, {
                size: $('ptSize').value,
                showCategory: $('ptShowCategory').checked,
                showDate: $('ptShowDate').checked,
                showId: $('ptShowId').checked,
                showBarcode: $('ptShowBarcode').checked,
                copies
            });

            showNotification(`Открыто окно печати: ${products.length * copies} ценник(ов)`, 'success');
            close();
        };

        // Escape
        const onKey = (e) => {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
    });
}

export default { openPriceTagModal };