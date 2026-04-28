// ============================================================
// core/auth.js
// ============================================================

/**
 * Модуль аутентификации и авторизации.
 *
 * @module auth
 */

import { supabase } from './supabase-client.js';

// ============================================================
// Внутреннее состояние
// ============================================================

/** @type {Object|null} */
let currentUser = null;

/** @type {string[]} */
let currentPermissions = [];

/** @type {Function[]} */
const authChangeCallbacks = [];

// ============================================================
// Приватные функции
// ============================================================

/**
 * Получает профиль пользователя вместе с ролью и правами.
 *
 * @param {string} userId
 * @returns {Promise<{profile: Object, permissions: string[]}>}
 */
async function fetchProfileWithPermissions(userId) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
            id,
            full_name,
            role:roles (
                id,
                name,
                role_permissions (
                    permission:permissions (
                        slug
                    )
                )
            )
        `)
        .eq('id', userId)
        .single();

    if (error) throw error;
    if (!profile) throw new Error('Профиль не найден');

    const permissions = (profile.role?.role_permissions || [])
        .map(rp => rp.permission?.slug)
        .filter(Boolean);

    return { profile, permissions };
}

/**
 * Нормализует объект пользователя.
 *
 * @param {Object} authUser — из supabase.auth.getUser()
 * @param {Object} profile
 * @param {string[]} permissions
 * @returns {Object}
 */
function normalizeUser(authUser, profile, permissions) {
    return {
        id: authUser.id,
        email: authUser.email,
        fullName: profile.full_name || '',
        roleId: profile.role?.id || null,
        roleName: profile.role?.name || null,
        permissions
    };
}

/**
 * Оповещает подписчиков об изменении состояния авторизации.
 */
function notifyAuthChange() {
    const user = currentUser ? { ...currentUser } : null;
    authChangeCallbacks.forEach(fn => {
        try { fn(user); } catch (e) { /* не роняем цепочку */ }
    });
}

// ============================================================
// Публичный API
// ============================================================

/**
 * Проверяет сессию при старте приложения.
 * Если сессия есть — загружает профиль и права.
 *
 * @returns {Promise<Object|null>} пользователь или null
 */
export async function initAuth() {
    try {
        const { data, error } = await supabase.auth.getUser();

        if (error || !data?.user) {
            currentUser = null;
            currentPermissions = [];
            notifyAuthChange();
            return null;
        }

        const { profile, permissions } = await fetchProfileWithPermissions(data.user.id);

        currentUser = normalizeUser(data.user, profile, permissions);
        currentPermissions = permissions;
        notifyAuthChange();

        return currentUser;

    } catch (err) {
        console.error('[auth] initAuth error:', err);
        currentUser = null;
        currentPermissions = [];
        notifyAuthChange();
        return null;
    }
}

/**
 * Вход по email и паролю.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user: Object|null, error: string|null}>}
 */
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) throw error;
        if (!data?.user) throw new Error('Не удалось получить данные пользователя');

        const { profile, permissions } = await fetchProfileWithPermissions(data.user.id);

        currentUser = normalizeUser(data.user, profile, permissions);
        currentPermissions = permissions;
        notifyAuthChange();

        return { success: true, user: currentUser, error: null };

    } catch (err) {
        console.error('[auth] signIn error:', err);
        currentUser = null;
        currentPermissions = [];
        notifyAuthChange();

        return {
            success: false,
            user: null,
            error: err.message || 'Ошибка входа'
        };
    }
}

/**
 * Выход.
 */
export async function logout() {
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.warn('[auth] logout error:', err);
    }

    currentUser = null;
    currentPermissions = [];
    notifyAuthChange();

    window.location.href = 'pages/login.html';
}

/**
 * Синхронный геттер текущего пользователя.
 *
 * @returns {Object|null}
 */
export function getCurrentUser() {
    return currentUser ? { ...currentUser } : null;
}

/**
 * Синхронная проверка права.
 *
 * @param {string} slug — например 'products:create'
 * @returns {boolean}
 */
export function hasPermission(slug) {
    return currentPermissions.includes(slug);
}

/**
 * Синхронный геттер всех прав.
 *
 * @returns {string[]}
 */
export function getPermissions() {
    return [...currentPermissions];
}

/**
 * Проверяет авторизацию и возвращает пользователя.
 * Если сессии нет — редирект на логин не делает,
 * оставляет решение контроллеру страницы.
 *
 * @returns {Promise<{user: Object|null, authError: boolean}>}
 */
export async function requireAuth() {
    if (currentUser) {
        return { user: currentUser, authError: false };
    }

    const user = await initAuth();

    if (user) {
        return { user, authError: false };
    }

    return { user: null, authError: true };
}

/**
 * Подписка на изменение состояния авторизации.
 * Возвращает функцию отписки.
 *
 * @param {Function} callback — получает user или null
 * @returns {Function} unsubscribe
 */
export function onAuthChange(callback) {
    authChangeCallbacks.push(callback);
    return () => {
        const index = authChangeCallbacks.indexOf(callback);
        if (index !== -1) authChangeCallbacks.splice(index, 1);
    };
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    initAuth,
    signIn,
    logout,
    getCurrentUser,
    hasPermission,
    getPermissions,
    requireAuth,
    onAuthChange
};
