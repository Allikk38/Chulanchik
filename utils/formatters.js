// ========================================
// ФАЙЛ: utils/formatters.js
// ========================================

/**
 * Formatters — централизованное форматирование данных
 * 
 * Все функции чистые, без побочных эффектов.
 * Используют Intl API для локализации (ru-RU).
 * 
 * @module utils/formatters
 * @version 2.1.0
 */

import { getCategoryName as getCategoryNameFromSchema } from './category-schema.js';

// ========== HTML ЭКРАНИРОВАНИЕ ==========

let escapeDiv = null;

function getEscapeDiv() {
    if (!escapeDiv) {
        escapeDiv = document.createElement('div');
    }
    return escapeDiv;
}

/**
 * Экранирует HTML-спецсимволы
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str && str !== 0) return '';
    const div = getEscapeDiv();
    div.textContent = String(str);
    return div.innerHTML;
}

// ========== ВАЛЮТА ==========

/**
 * Форматирует число как деньги в рублях
 * @param {number} amount
 * @param {Object} [options]
 * @param {boolean} [options.showSymbol=true]
 * @param {boolean} [options.showKopecks=false]
 * @returns {string}
 */
export function formatMoney(amount, options = {}) {
    const { showSymbol = true, showKopecks = false } = options;
    if (amount === null || amount === undefined || isNaN(amount)) amount = 0;

    const formatter = new Intl.NumberFormat('ru-RU', {
        style: showSymbol ? 'currency' : 'decimal',
        currency: 'RUB',
        minimumFractionDigits: showKopecks ? 2 : 0,
        maximumFractionDigits: showKopecks ? 2 : 0
    });

    return formatter.format(amount).replace('RUB', '₽').trim();
}

// ========== ЧИСЛА ==========

/**
 * Форматирует число с разделителями разрядов
 * @param {number} num
 * @param {number} [decimals=0]
 * @returns {string}
 */
export function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) num = 0;
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

/**
 * Форматирует процент
 * @param {number} value
 * @param {Object} [options]
 * @param {boolean} [options.isFraction=false] — true если значение от 0 до 1
 * @param {number} [options.decimals=1]
 * @returns {string}
 */
export function formatPercent(value, options = {}) {
    const { isFraction = false, decimals = 1 } = options;
    if (value === null || value === undefined || isNaN(value)) value = 0;
    const percentValue = isFraction ? value * 100 : value;
    return `${percentValue.toFixed(decimals).replace('.', ',')}%`;
}

// ========== ДАТЫ ==========

/**
 * Форматирует дату
 * @param {string|Date|null} date
 * @param {Object} [options]
 * @param {boolean} [options.withTime=false]
 * @param {boolean} [options.short=false]
 * @returns {string}
 */
export function formatDate(date, options = {}) {
    const { withTime = false, short = false } = options;
    if (!date) return '';

    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    if (short) {
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }

    const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) {
        dateOptions.hour = '2-digit';
        dateOptions.minute = '2-digit';
    }

    return d.toLocaleDateString('ru-RU', dateOptions).replace(',', '');
}

/**
 * Форматирует дату и время
 * @param {string|Date|null} datetime
 * @returns {string}
 */
export function formatDateTime(datetime) {
    if (!datetime) return '';
    const d = new Date(datetime);
    if (isNaN(d.getTime())) return '';

    const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
}

// ========== ТЕКСТ ==========

/**
 * Склоняет существительное
 * @param {number} count
 * @param {string} one — форма для 1
 * @param {string} two — форма для 2-4
 * @param {string} five — форма для 5+
 * @returns {string}
 */
export function pluralize(count, one, two, five) {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
}

// ========== СТАТУСЫ И КАТЕГОРИИ ==========

/**
 * Человекочитаемый статус товара
 * @param {string} status
 * @returns {string}
 */
export function getStatusText(status) {
    const map = {
        'in_stock': 'В наличии',
        'sold': 'Продан',
        'reserved': 'Забронирован',
        'draft': 'Черновик'
    };
    return map[status] || status || 'Неизвестно';
}

/**
 * Человекочитаемое название категории (из единого источника)
 * @param {string} category
 * @returns {string}
 */
export function getCategoryName(category) {
    return getCategoryNameFromSchema(category);
}

/**
 * Человекочитаемый способ оплаты
 * @param {string} method
 * @returns {string}
 */
export function getPaymentMethodName(method) {
    const map = {
        'cash': 'Наличные',
        'card': 'Карта',
        'transfer': 'Перевод',
        'qr': 'QR-код'
    };
    return map[method] || method || 'Не указано';
}

// ========== ВАЛИДАЦИЯ ==========

/**
 * Проверяет email
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email);
}

// ========== ДЕБАУНС ==========

/**
 * Дебаунсит функцию
 * @param {Function} fn
 * @param {number} [delay=300]
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
    let timer = null;
    return function debounced(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

export default {
    formatMoney,
    formatNumber,
    formatPercent,
    formatDate,
    formatDateTime,
    escapeHtml,
    pluralize,
    getStatusText,
    getCategoryName,
    getPaymentMethodName,
    isValidEmail,
    debounce
};

console.log('[Formatters] Module loaded');
