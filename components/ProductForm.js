// ============================================================
// components/ProductForm.js
// ============================================================

/**
 * Компонент формы товара.
 * 
 * Чистый UI. Не зависит от сервисов или сторов.
 * Принимает данные, возвращает Promise с сохранённым товаром.
 * 
 * @module components/ProductForm
 */

import { supabase } from '../core/supabase-client.js';
import { formatMoney, escapeHtml } from '../utils/formatters.js';
import {
    getCategorySchema,
    getCategoryOptions,
    validateAttributes,
    CATEGORY_KEYS
} from '../utils/categorySchema.js';

// ============================================================
// Константы
// ============================================================

const BUCKET = 'product-photos';
const MAX_PHOTO_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ============================================================
// Загрузка фото
// ============================================================

async function uploadPhoto(file) {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) throw new Error('Ошибка загрузки фото: ' + error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return data.publicUrl;
}

async function deletePhoto(photoUrl) {
    if (!photoUrl) return;
    try {
        const fileName = photoUrl.split('/').pop();
        if (fileName) await supabase.storage.from(BUCKET).remove([fileName]);
    } catch (e) { /* не критично */ }
}

// ============================================================
// Рендеринг полей категории
// ============================================================

function renderFields(category, initialAttrs = {}) {
    const schema = getCategorySchema(category);
    if (!schema.fields?.length) return '';

    return schema.fields.map(f => {
        const id = `attr_${f.name}`;
        const val = initialAttrs[f.name] || '';
        const req = f.required ? 'required' : '';

        if (f.type === 'select') {
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(f.label)}${f.required ? '<span class="required">*</span>' : ''}</label>
                    <select id="${id}" name="${f.name}" ${req}>
                        <option value="">Выберите...</option>
                        ${(f.options || []).map(o =>
                            `<option value="${escapeHtml(o)}" ${o === val ? 'selected' : ''}>${escapeHtml(o)}</option>`
                        ).join('')}
                    </select>
                    <div class="field-error" id="${id}_error"></div>
                </div>`;
        }

        if (f.type === 'textarea') {
            return `
                <div class="form-group">
                    <label for="${id}">${escapeHtml(f.label)}${f.required ? '<span class="required">*</span>' : ''}</label>
                    <textarea id="${id}" name="${f.name}" ${req} placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(val)}</textarea>
                    <div class="field-error" id="${id}_error"></div>
                </div>`;
        }

        return `
            <div class="form-group">
                <label for="${id}">${escapeHtml(f.label)}${f.required ? '<span class="required">*</span>' : ''}</label>
                <input type="${f.type || 'text'}" id="${id}" name="${f.name}" ${req}
                    placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(val)}">
                <div class="field-error" id="${id}_error"></div>
            </div>`;
    }).join('');
}

// ============================================================
// HTML модалки
// ============================================================

function modalHtml({ mode, initialData }) {
    const title = mode === 'create' ? '➕ Добавление товара' : '✎ Редактирование товара';
    const submitText = mode === 'create' ? 'Сохранить' : 'Обновить';
    const cat = initialData.category || CATEGORY_KEYS[0];
    const hasPhoto = !!initialData.photo_url;

    return `
    <div class="modal-overlay" id="productFormOverlay">
        <div class="modal product-form-modal">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="btn-close" id="pfClose">×</button>
            </div>
            <div class="modal-body">
                <div class="photo-upload-section">
                    <label class="photo-upload-label">Фото товара</label>
                    <div class="photo-upload-container">
                        <div class="photo-preview ${hasPhoto ? 'has-image' : ''}" id="pfPreview">
                            <div class="photo-placeholder-icon" id="pfPlaceholder" style="display:${hasPhoto ? 'none' : 'flex'}">📸</div>
                            <img id="pfImg" src="${escapeHtml(initialData.photo_url || '')}" alt=""
                                style="display:${hasPhoto ? 'block' : 'none'}">
                        </div>
                        <div class="photo-upload-controls">
                            <input type="file" id="pfPhotoInput" accept="image/*" style="display:none">
                            <button type="button" class="photo-upload-btn" id="pfUploadBtn">📁 Выбрать фото</button>
                            <button type="button" class="photo-upload-btn photo-remove-btn" id="pfRemoveBtn"
                                style="display:${hasPhoto ? 'inline-flex' : 'none'}">🗑️ Удалить</button>
                            <span class="photo-upload-hint">JPG, PNG, WEBP до ${MAX_PHOTO_MB} MB</span>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="pfName">Название<span class="required">*</span></label>
                    <input type="text" id="pfName" value="${escapeHtml(initialData.name || '')}" required>
                    <div class="field-error" id="pfName_error"></div>
                </div>

                <div class="form-group">
                    <label for="pfCategory">Категория<span class="required">*</span></label>
                    <select id="pfCategory" required>
                        ${getCategoryOptions(true).map(o =>
                            `<option value="${o.value}" ${o.value === cat ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
                        ).join('')}
                    </select>
                </div>

                <div class="pricing-section">
                    <div class="pricing-row">
                        <div class="form-group">
                            <label for="pfPrice">Цена продажи (₽)<span class="required">*</span></label>
                            <input type="number" id="pfPrice" min="0" step="1"
                                value="${initialData.price || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="pfCost">Себестоимость (₽)</label>
                            <input type="number" id="pfCost" min="0" step="1"
                                value="${initialData.cost_price || ''}">
                        </div>
                    </div>
                    <div class="margin-indicator">
                        <span class="margin-label">Маржа:</span>
                        <span id="pfMargin" class="margin-value">0 ₽</span>
                    </div>
                </div>

                <div class="category-fields" id="pfCategoryFields">
                    ${renderFields(cat, initialData.attributes || {})}
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="pfCancel">Отмена</button>
                <button type="button" class="btn-primary" id="pfSubmit">${submitText}</button>
            </div>
        </div>
    </div>`;
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Открывает модальное окно формы товара.
 * 
 * @param {Object} options
 * @param {'create'|'edit'} options.mode
 * @param {Object} [options.initialData] — данные для редактирования
 * @param {string} options.userId
 * @returns {Promise<Object|null>} созданный/обновлённый товар или null
 */
export function openProductFormModal({ mode = 'create', initialData = {}, userId } = {}) {
    return new Promise(resolve => {
        const container = document.getElementById('modalContainer') || document.body;

        // Состояние формы
        let photoFile = null;
        let photoUrl = initialData.photo_url || null;
        let isSubmitting = false;

        // Рендерим
        container.insertAdjacentHTML('beforeend', modalHtml({ mode, initialData }));
        const overlay = document.getElementById('productFormOverlay');

        // DOM-элементы
        const $ = id => document.getElementById(id);
        const nameEl = $('pfName');
        const catEl = $('pfCategory');
        const priceEl = $('pfPrice');
        const costEl = $('pfCost');

        // --- Фото ---
        $('pfUploadBtn').onclick = () => $('pfPhotoInput').click();

        $('pfPhotoInput').onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!ALLOWED_TYPES.includes(file.type)) return;
            if (file.size > MAX_PHOTO_MB * 1024 * 1024) return;

            photoFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                photoUrl = reader.result;
                $('pfPreview').classList.add('has-image');
                $('pfPlaceholder').style.display = 'none';
                $('pfImg').src = photoUrl;
                $('pfImg').style.display = 'block';
                $('pfRemoveBtn').style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
        };

        $('pfRemoveBtn').onclick = async () => {
            if (mode === 'edit' && initialData.photo_url && !photoFile) {
                await deletePhoto(initialData.photo_url);
            }
            photoFile = null;
            photoUrl = null;
            $('pfPreview').classList.remove('has-image');
            $('pfPlaceholder').style.display = 'flex';
            $('pfImg').style.display = 'none';
            $('pfRemoveBtn').style.display = 'none';
            $('pfPhotoInput').value = '';
        };

        // --- Маржа ---
        const updateMargin = () => {
            const price = parseFloat(priceEl.value) || 0;
            const cost = parseFloat(costEl.value) || 0;
            const m = price - cost;
            const el = $('pfMargin');
            el.textContent = formatMoney(m);
            el.className = 'margin-value ' + (m > 0 ? 'positive' : m < 0 ? 'negative' : 'warning');
        };
        priceEl.addEventListener('input', updateMargin);
        costEl.addEventListener('input', updateMargin);

        // --- Категория → поля ---
        catEl.addEventListener('change', () => {
            $('pfCategoryFields').innerHTML = renderFields(catEl.value);
        });

        // --- Закрытие ---
        const close = () => {
            if (!isSubmitting) {
                overlay.remove();
                resolve(null);
            }
        };
        $('pfClose').onclick = close;
        $('pfCancel').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // --- Отправка ---
        $('pfSubmit').onclick = async () => {
            if (isSubmitting) return;

            // Базовая валидация
            const name = nameEl.value.trim();
            if (!name) {
                $('pfName_error').textContent = 'Название обязательно';
                return;
            }

            const price = parseFloat(priceEl.value);
            if (isNaN(price) || price < 0) return;

            const category = catEl.value;
            const cost = parseFloat(costEl.value) || 0;

            // Собираем атрибуты
            const attrs = {};
            document.querySelectorAll('#pfCategoryFields [name]').forEach(f => {
                attrs[f.name] = f.value;
            });

            const validation = validateAttributes(category, attrs);
            if (!validation.valid) {
                validation.missingFields.forEach(fn => {
                    const errEl = document.getElementById(`attr_${fn}_error`);
                    if (errEl) errEl.textContent = 'Обязательное поле';
                });
                return;
            }

            isSubmitting = true;
            $('pfSubmit').disabled = true;

            try {
                // Загрузка фото
                if (photoFile) {
                    if (mode === 'edit' && initialData.photo_url) {
                        await deletePhoto(initialData.photo_url);
                    }
                    photoUrl = await uploadPhoto(photoFile);
                }

                const formData = {
                    name,
                    category,
                    price,
                    cost_price: cost,
                    attributes: attrs,
                    photo_url: photoUrl,
                    created_by: userId
                };

                // Вызываем ProductService через колбэк — контроллер сам решит что делать
                const { ProductService } = await import('../services/ProductService.js');
                let result;

                if (mode === 'create') {
                    result = await ProductService.create(formData);
                } else {
                    result = await ProductService.update(initialData.id, formData);
                }

                if (result.success) {
                    overlay.remove();
                    resolve(result.product);
                } else {
                    // Ошибка от сервиса
                    alert(result.error || 'Ошибка сохранения');
                    isSubmitting = false;
                    $('pfSubmit').disabled = false;
                }

            } catch (err) {
                console.error('[ProductForm] submit error:', err);
                alert('Ошибка сохранения: ' + (err.message || 'Неизвестная ошибка'));
                isSubmitting = false;
                $('pfSubmit').disabled = false;
            }
        };

        // Escape
        const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);

        // Фокус
        setTimeout(() => nameEl?.focus(), 100);
    });
}

export default { openProductFormModal };
