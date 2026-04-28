// ============================================================
// controllers/LoginController.js
// ============================================================

/**
 * Контроллер страницы входа.
 *
 * @module controllers/LoginController
 */

import { signIn } from '../core/auth.js';
import { isValidEmail } from '../utils/formatters.js';
import { showNotification } from '../utils/ui.js';

// ============================================================
// DOM
// ============================================================

const DOM = {
    form: document.getElementById('loginForm'),
    email: document.getElementById('email'),
    password: document.getElementById('password'),
    emailError: document.getElementById('emailError'),
    passwordError: document.getElementById('passwordError'),
    formError: document.getElementById('formError'),
    btn: document.getElementById('loginBtn'),
    offlineBanner: document.getElementById('offlineBanner')
};

// ============================================================
// Валидация
// ============================================================

function validate() {
    let valid = true;

    const email = DOM.email.value.trim();
    if (!email) {
        DOM.emailError.textContent = 'Email обязателен';
        valid = false;
    } else if (!isValidEmail(email)) {
        DOM.emailError.textContent = 'Некорректный email';
        valid = false;
    } else {
        DOM.emailError.textContent = '';
    }

    if (!DOM.password.value) {
        DOM.passwordError.textContent = 'Пароль обязателен';
        valid = false;
    } else {
        DOM.passwordError.textContent = '';
    }

    return valid;
}

function showFormError(msg) {
    DOM.formError.textContent = msg;
    DOM.formError.classList.add('show');
    setTimeout(() => DOM.formError.classList.remove('show'), 5000);
}

// ============================================================
// Отправка
// ============================================================

async function handleSubmit(e) {
    e.preventDefault();

    if (DOM.btn.disabled) return;

    if (!validate()) return;

    if (!navigator.onLine) {
        showFormError('Нет подключения к интернету');
        return;
    }

    DOM.btn.disabled = true;
    DOM.btn.textContent = 'Вход...';

    try {
        const { success, user, error } = await signIn(
            DOM.email.value.trim(),
            DOM.password.value
        );

        if (success && user) {
            showNotification('Вход выполнен', 'success');
            setTimeout(() => {
                window.location.href = 'pages/inventory.html';
            }, 300);
        } else {
            showFormError(error || 'Ошибка входа');
        }

    } catch (err) {
        console.error('[Login] error:', err);
        showFormError('Ошибка соединения');
    } finally {
        DOM.btn.disabled = false;
        DOM.btn.textContent = 'Войти';
    }
}

// ============================================================
// Офлайн
// ============================================================

function updateOfflineBanner() {
    DOM.offlineBanner.classList.toggle('show', !navigator.onLine);
}

// ============================================================
// Инициализация
// ============================================================

function init() {
    DOM.form.addEventListener('submit', handleSubmit);
    DOM.email.addEventListener('input', validate);
    DOM.password.addEventListener('input', validate);

    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();

    DOM.email.focus();
}

document.addEventListener('DOMContentLoaded', init);
