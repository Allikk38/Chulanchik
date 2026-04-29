// ============================================================
// controllers/ReportsController.js
// Шаг 1: Минимальный контроллер — шапка, авторизация, заглушка
// ============================================================

/**
 * Контроллер страницы отчётов (минимальная версия).
 *
 * @module controllers/ReportsController
 */

import { requireAuth, logout } from '../core/auth.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    user: null,
    period: 'week'
};

// ============================================================
// DOM
// ============================================================

const DOM = {
    content: null,
    periodSelect: null
};

// ============================================================
// Рендеринг
// ============================================================

function renderContent() {
    if (!DOM.content) return;

    DOM.content.innerHTML = `
        <div class="reports-tabs" role="tablist">
            <button class="tab-btn active" data-tab="dashboard" role="tab" aria-selected="true">
                Дашборд
            </button>
            <button class="tab-btn" data-tab="sales" role="tab">
                Продажи
            </button>
            <button class="tab-btn" data-tab="products" role="tab">
                Товары
            </button>
            <button class="tab-btn" data-tab="shifts" role="tab">
                Смены
            </button>
            <button class="tab-btn" data-tab="expenses" role="tab">
                Расходы
            </button>
        </div>
        <div class="reports-content-inner">
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <span class="loading-text">Отчёты загружаются...</span>
            </div>
        </div>`;
}

// ============================================================
// Инициализация
// ============================================================

function cacheDom() {
    DOM.content = document.getElementById('reportsContent');
    DOM.periodSelect = document.getElementById('periodSelect');
}

function bindEvents() {
    DOM.periodSelect?.addEventListener('change', (e) => {
        state.period = e.target.value;
        console.log('[Reports] period changed to:', state.period);
    });
}

async function init() {
    console.log('[Reports] init() started');

    // 1. Вставляем навигацию синхронно
    const headerHtml = renderAppHeader({
        currentPage: 'reports',
        userName: 'Пользователь'
    });

    const appEl = document.querySelector('.app');
    if (appEl) {
        appEl.insertAdjacentHTML('afterbegin', headerHtml);
        console.log('[Reports] header inserted into .app');
    } else {
        console.error('[Reports] .app element not found in DOM');
    }

    bindAppHeaderEvents({
        onNavigate: (pageId) => {
            const pages = {
                inventory: 'pages/inventory.html',
                cashier: 'pages/cashier.html',
                reports: 'pages/reports.html'
            };
            const href = pages[pageId];
            if (href && pageId !== 'reports') {
                window.location.href = href;
            }
        },
        onLogout: () => logout()
    });

    // 2. Проверяем авторизацию с таймаутом
    console.log('[Reports] checking auth...');

    let user = null;
    let authError = false;

    try {
        const result = await Promise.race([
            requireAuth(),
            new Promise((resolve) => {
                setTimeout(() => {
                    console.warn('[Reports] auth timed out after 10s');
                    resolve({ user: null, authError: true });
                }, 10000);
            })
        ]);
        user = result.user;
        authError = result.authError;
    } catch (err) {
        console.error('[Reports] auth error:', err);
        authError = true;
    }

    if (authError || !user) {
        console.warn('[Reports] not authenticated, redirecting to login');
        window.location.href = 'pages/login.html';
        return;
    }

    state.user = user;
    console.log('[Reports] user authenticated:', user.email);

    // 3. Обновляем имя пользователя в шапке
    updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    // 4. Кэшируем DOM и вешаем события
    cacheDom();
    bindEvents();

    // 5. Рендерим заглушку
    renderContent();

    console.log('[Reports] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
