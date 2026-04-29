// controllers/ReportsController.js
// Шаг 2: Обход зависания — синхронная проверка сессии
// ============================================================

import { requireAuth, logout } from '../core/auth.js';
import { renderAppHeader, bindAppHeaderEvents, updateUserName } from '../components/AppHeader.js';
import { supabase } from '../core/supabase-client.js';

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
// Хелпер: синхронная проверка наличия сессии
// ============================================================

/**
 * Проверяет, есть ли сохранённая сессия Supabase в localStorage.
 * Не делает сетевых запросов — работает мгновенно.
 *
 * @returns {boolean}
 */
function hasCachedSession() {
    try {
        // Supabase хранит сессию в localStorage с ключом вида sb-<project-id>-auth-token
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('-auth-token')) {
                const value = localStorage.getItem(key);
                if (value) {
                    const parsed = JSON.parse(value);
                    if (parsed?.access_token) {
                        return true;
                    }
                }
            }
        }
    } catch (e) {
        // битый localStorage — считаем что сессии нет
    }
    return false;
}

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

    // 2. Быстрая проверка: есть ли сохранённая сессия?
    console.log('[Reports] checking cached session...');

    if (!hasCachedSession()) {
        console.warn('[Reports] no cached session found, redirecting to login');
        window.location.href = 'pages/login.html';
        return;
    }

    console.log('[Reports] cached session found');

    // 3. Кэшируем DOM и рендерим заглушку СРАЗУ
    cacheDom();
    bindEvents();
    renderContent();

    console.log('[Reports] skeleton rendered');

    // 4. Теперь в фоне пытаемся подтвердить сессию через сервер
    console.log('[Reports] verifying session in background...');

    try {
        const { user, authError } = await requireAuth();

        if (authError || !user) {
            console.warn('[Reports] session verification failed, redirecting to login');
            window.location.href = 'pages/login.html';
            return;
        }

        state.user = user;
        console.log('[Reports] user authenticated:', user.email);

        // Обновляем имя пользователя
        updateUserName(user.fullName || user.email?.split('@')[0] || 'Пользователь');

    } catch (err) {
        console.error('[Reports] auth error in background:', err);
        // Не редиректим — страница уже показана, продолжаем с тем что есть
        // Если пользователь попытается выполнить действие требующее сервер —
        // оно упадёт с понятной ошибкой
    }

    console.log('[Reports] init() completed');
}

// ============================================================
// Запуск
// ============================================================

document.addEventListener('DOMContentLoaded', init);
