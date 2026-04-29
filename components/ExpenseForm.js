// ============================================================
// components/ExpenseForm.js
// ============================================================

/**
 * Компонент формы расхода.
 * 
 * Чистый UI. Не зависит от сервисов или сторов.
 * Принимает данные, возвращает Promise с сохранённым расходом.
 * 
 * @module components/ExpenseForm
 */

import { formatMoney, escapeHtml } from '../utils/formatters.js';
import { ExpenseRepository } from '../repositories/ExpenseRepository.js';
import { ExpenseService } from '../services/ExpenseService.js';

// ============================================================
// Константы
// ============================================================

const CATEGORIES = [
    { value: 'rent', label: 'Аренда' },
    { value: 'advertising', label: 'Реклама' },
    { value: 'supplies', label: 'Хозтовары' },
    { value: 'utilities', label: 'Коммунальные услуги' },
    { value: 'salary', label: 'Зарплата' },
    { value: 'taxes', label: 'Налоги' },
    { value: 'repair', label: 'Ремонт / Обслуживание' },
    { value: 'other', label: 'Прочее' }
];

const MAX_DESCRIPTION_LENGTH = 500;

// ============================================================
// HTML модалки
// ============================================================

function modalHtml({ mode, initialData }) {
    const title = mode === 'create' ? 'Добавление расхода' : 'Редактирование расхода';
    const submitText = mode === 'create' ? 'Сохранить' : 'Обновить';
    
    const formattedDate = initialData.expense_date 
        ? new Date(initialData.expense_date).toISOString().slice(0, 16)
        : new Date().toISOString().slice(0, 16);
    
    const hasReceipt = !!initialData.receipt_url;

    return `
    <div class="modal-overlay" id="expenseFormOverlay">
        <div class="modal expense-form-modal">
            <div class="modal-header">
                <h3>${escapeHtml(title)}</h3>
                <button class="btn-close" id="efClose">x</button>
            </div>
            <div class="modal-body">
                <div class="photo-upload-section">
                    <label class="photo-upload-label">Чек (опционально)</label>
                    <div class="photo-upload-container">
                        <div class="photo-preview ${hasReceipt ? 'has-image' : ''}" id="efPreview">
                            <div class="photo-placeholder-icon" id="efPlaceholder" style="display:${hasReceipt ? 'none' : 'flex'}">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                                    <path d="M3 16l5-5 2 2 4-4 7 7"/>
                                </svg>
                            </div>
                            <img id="efImg" src="${escapeHtml(initialData.receipt_url || '')}" alt=""
                                style="display:${hasReceipt ? 'block' : 'none'}">
                        </div>
                        <div class="photo-upload-controls">
                            <input type="file" id="efReceiptInput" accept="image/*" style="display:none">
                            <button type="button" class="photo-upload-btn" id="efUploadBtn">Выбрать чек</button>
                            <button type="button" class="photo-upload-btn photo-remove-btn" id="efRemoveBtn"
                                style="display:${hasReceipt ? 'inline-flex' : 'none'}">Удалить</button>
                            <span class="photo-upload-hint">JPG, PNG, WEBP до 5 MB</span>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="efAmount">Сумма (RUB)<span class="required">*</span></label>
                        <input type="number" id="efAmount" min="1" step="1"
                            value="${initialData.amount || ''}" required>
                        <div class="field-error" id="efAmount_error"></div>
                    </div>

                    <div class="form-group">
                        <label for="efDate">Дата расхода<span class="required">*</span></label>
                        <input type="datetime-local" id="efDate" value="${formattedDate}" required>
                        <div class="field-error" id="efDate_error"></div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="efCategory">Категория<span class="required">*</span></label>
                    <select id="efCategory" required>
                        <option value="">Выберите категорию...</option>
                        ${CATEGORIES.map(c => `
                            <option value="${c.value}" ${c.value === initialData.category ? 'selected' : ''}>
                                ${escapeHtml(c.label)}
                            </option>
                        `).join('')}
                    </select>
                    <div class="field-error" id="efCategory_error"></div>
                </div>

                <div class="form-group">
                    <label for="efDescription">Описание</label>
                    <textarea id="efDescription" rows="3" 
                        placeholder="Например: пакеты для упаковки, канцтовары..."
                        maxlength="${MAX_DESCRIPTION_LENGTH}">${escapeHtml(initialData.description || '')}</textarea>
                    <div class="form-hint" id="efDescriptionCounter">
                        ${(initialData.description || '').length} / ${MAX_DESCRIPTION_LENGTH}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="efCancel">Отмена</button>
                <button type="button" class="btn-primary" id="efSubmit">${submitText}</button>
            </div>
        </div>
    </div>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Открывает модальное окно формы расхода.
 * 
 * @param {Object} options
 * @param {'create'|'edit'} options.mode
 * @param {Object} [options.initialData] — данные для редактирования
 * @param {string} options.userId
 * @returns {Promise<Object|null>} созданный/обновлённый расход или null
 */
export function openExpenseFormModal({ mode = 'create', initialData = {}, userId } = {}) {
    return new Promise(resolve => {
        const container = document.getElementById('modalContainer') || document.body;

        let receiptFile = null;
        let receiptUrl = initialData.receipt_url || null;
        let isSubmitting = false;

        container.insertAdjacentHTML('beforeend', modalHtml({ mode, initialData }));
        const overlay = document.getElementById('expenseFormOverlay');

        const $ = id => document.getElementById(id);
        const amountEl = $('efAmount');
        const dateEl = $('efDate');
        const categoryEl = $('efCategory');
        const descriptionEl = $('efDescription');
        const counterEl = $('efDescriptionCounter');

        // Счётчик символов
        if (descriptionEl && counterEl) {
            descriptionEl.addEventListener('input', () => {
                const len = descriptionEl.value.length;
                counterEl.textContent = `${len} / ${MAX_DESCRIPTION_LENGTH}`;
                if (len >= MAX_DESCRIPTION_LENGTH) {
                    counterEl.style.color = 'var(--color-danger)';
                } else {
                    counterEl.style.color = 'var(--color-text-muted)';
                }
            });
        }

        // --- Фото чека ---
        $('efUploadBtn').onclick = () => $('efReceiptInput').click();

        $('efReceiptInput').onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const allowed = ['image/jpeg', 'image/png', 'image/webp'];
            if (!allowed.includes(file.type)) {
                alert('Поддерживаются только JPG, PNG, WEBP');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert('Файл не должен превышать 5 MB');
                return;
            }

            receiptFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                receiptUrl = reader.result;
                $('efPreview').classList.add('has-image');
                $('efPlaceholder').style.display = 'none';
                $('efImg').src = receiptUrl;
                $('efImg').style.display = 'block';
                $('efRemoveBtn').style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
        };

        $('efRemoveBtn').onclick = () => {
            receiptFile = null;
            receiptUrl = null;
            $('efPreview').classList.remove('has-image');
            $('efPlaceholder').style.display = 'flex';
            $('efImg').style.display = 'none';
            $('efRemoveBtn').style.display = 'none';
            $('efReceiptInput').value = '';
        };

        // --- Закрытие ---
        const close = () => {
            if (!isSubmitting) {
                overlay.remove();
                resolve(null);
            }
        };
        $('efClose').onclick = close;
        $('efCancel').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // --- Отправка ---
        $('efSubmit').onclick = async () => {
            if (isSubmitting) return;

            // Валидация
            const amount = parseFloat(amountEl?.value);
            if (isNaN(amount) || amount <= 0) {
                $('efAmount_error').textContent = 'Введите сумму больше 0';
                return;
            }

            const category = categoryEl?.value;
            if (!category) {
                $('efCategory_error').textContent = 'Выберите категорию';
                return;
            }

            const expenseDate = dateEl?.value;
            if (!expenseDate) {
                $('efDate_error').textContent = 'Укажите дату расхода';
                return;
            }

            const description = descriptionEl?.value?.trim() || null;

            isSubmitting = true;
            $('efSubmit').disabled = true;

            try {
                let finalReceiptUrl = receiptUrl;

                if (receiptFile && !receiptUrl?.startsWith('http')) {
                    finalReceiptUrl = await ExpenseRepository.uploadReceipt(receiptFile);
                }

                const formData = {
                    amount,
                    category,
                    description,
                    expense_date: expenseDate,
                    receipt_url: finalReceiptUrl,
                    userId
                };

                let result;

                if (mode === 'create') {
                    result = await ExpenseService.create(formData);
                } else {
                    if (receiptFile) {
                        formData.newReceiptFile = receiptFile;
                    }
                    result = await ExpenseService.update(initialData.id, formData);
                }

                if (result.success) {
                    overlay.remove();
                    resolve(result.expense);
                } else {
                    alert(result.error || 'Ошибка сохранения расхода');
                    isSubmitting = false;
                    $('efSubmit').disabled = false;
                }

            } catch (err) {
                console.error('[ExpenseForm] submit error:', err);
                alert('Ошибка сохранения: ' + (err.message || 'Неизвестная ошибка'));
                isSubmitting = false;
                $('efSubmit').disabled = false;
            }
        };

        // Escape
        const onKey = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);

        // Фокус
        setTimeout(() => amountEl?.focus(), 100);
    });
}

export default { openExpenseFormModal };