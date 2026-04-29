// ============================================================
// components/AppHeader.js
// ============================================================

/**
 * Компонент верхней панели навигации.
 *
 * Чистый UI. Рендерит HTML-строку шапки и предоставляет
 * функцию для привязки обработчиков событий.
 *
 * Используется всеми страницами приложения.
 *
 * @module components/AppHeader
 */

// ============================================================
// Константы
// ============================================================

const PAGES = [
    { id: 'inventory', label: 'Склад', href: 'pages/inventory.html' },
    { id: 'cashier', label: 'Касса', href: 'pages/cashier.html' },
    { id: 'reports', label: 'Отчёты', href: 'pages/reports.html' }
];

const SECTION_LABELS = {
    inventory: 'Склад',
    cashier: 'Касса',
    reports: 'Отчёты'
};

// ============================================================
// Приватные хелперы
// ============================================================

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
// Публичные функции
// ============================================================

/**
 * Рендерит HTML верхней панели навигации.
 *
 * @param {Object} options
 * @param {string} options.currentPage - идентификатор страницы ('inventory', 'cashier', 'reports')
 * @param {string} [options.userName] - имя пользователя для отображения
 * @returns {string} HTML-строка
 */
export function renderAppHeader({ currentPage, userName }) {
    const sectionLabel = SECTION_LABELS[currentPage] || '';
    const displayName = userName || 'Пользователь';

    const tabsHtml = PAGES.map(page => {
        const isActive = page.id === currentPage;
        return `
            <a href="${escapeHtml(page.href)}"
               class="app-tab ${isActive ? 'active' : ''}"
               data-page="${escapeHtml(page.id)}"
               ${isActive ? 'aria-current="page"' : ''}>
                ${escapeHtml(page.label)}
            </a>`;
    }).join('');

    return `
        <header class="app-header">
            <div class="app-header-left">
                <span class="app-brand">Чуланчик</span>
                <span class="app-divider"></span>
                <span class="app-section">${escapeHtml(sectionLabel)}</span>
            </div>

            <nav class="app-tabs">
                ${tabsHtml}
            </nav>

            <div class="header-actions">
                <span class="user-email" id="userEmail">${escapeHtml(displayName)}</span>
                <button class="btn-ghost btn-sm" id="logoutBtn">Выход</button>
            </div>
        </header>`;
}

/**
 * Привязывает обработчики событий к элементам навигации.
 *
 * @param {Object} options
 * @param {Function} [options.onNavigate] - вызывается при клике на вкладку, получает pageId
 * @param {Function} [options.onLogout] - вызывается при клике на «Выход»
 */
export function bindAppHeaderEvents({ onNavigate, onLogout } = {}) {
    if (onNavigate) {
        document.querySelectorAll('.app-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const pageId = tab.dataset.page;
                if (pageId) {
                    e.preventDefault();
                    onNavigate(pageId);
                }
            });
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && onLogout) {
        logoutBtn.addEventListener('click', onLogout);
    }
}

/**
 * Обновляет имя пользователя в шапке без перерендера всей панели.
 *
 * @param {string} userName
 */
export function updateUserName(userName) {
    const el = document.getElementById('userEmail');
    if (el) {
        el.textContent = userName || 'Пользователь';
    }
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    renderAppHeader,
    bindAppHeaderEvents,
    updateUserName
};
