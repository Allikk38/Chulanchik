// ========== ДОБАВИТЬ В core/auth.js ПОСЛЕ ИМПОРТОВ ==========

import { supabase } from './supabase-client.js';

// ... существующий код ...

// ========== ПРАВА ДОСТУПА ==========

/**
 * @type {Object|null} Профиль пользователя из таблицы profiles
 */
let currentProfile = null;

/**
 * @type {string[]} Массив slug прав текущего пользователя
 */
let currentPermissions = [];

/**
 * Загружает профиль и права пользователя
 * Вызывается после успешного входа
 * 
 * @param {string} userId - UUID пользователя из auth.users
 * @returns {Promise<void>}
 */
async function loadUserProfile(userId) {
    try {
        // 1. Загружаем профиль с ролью
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*, roles:role_id(id, name)')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.warn('[Auth] Profile not found for user:', userId);
            currentProfile = null;
            currentPermissions = [];
            return;
        }

        currentProfile = profile;

        if (!profile.role_id) {
            currentPermissions = [];
            return;
        }

        // 2. Загружаем права роли
        const { data: rolePerms, error: permsError } = await supabase
            .from('role_permissions')
            .select('permissions:permission_id(slug, module)')
            .eq('role_id', profile.role_id);

        if (permsError) {
            console.warn('[Auth] Failed to load permissions:', permsError);
            currentPermissions = [];
            return;
        }

        currentPermissions = (rolePerms || [])
            .map(rp => rp.permissions?.slug)
            .filter(Boolean);

        console.log('[Auth] Permissions loaded:', currentPermissions);

    } catch (err) {
        console.error('[Auth] Load profile error:', err);
        currentProfile = null;
        currentPermissions = [];
    }
}

/**
 * Проверяет наличие права у текущего пользователя
 * @param {string} permission - slug права (например 'products:create')
 * @returns {boolean}
 */
export function hasPermission(permission) {
    if (!permission) return false;
    return currentPermissions.includes(permission) || currentPermissions.includes('*');
}

/**
 * Проверяет наличие любого из перечисленных прав
 * @param {string[]} permissions - slug прав
 * @returns {boolean}
 */
export function hasAnyPermission(permissions = []) {
    return permissions.some(p => hasPermission(p));
}

/**
 * Проверяет наличие всех перечисленных прав
 * @param {string[]} permissions - slug прав
 * @returns {boolean}
 */
export function hasAllPermissions(permissions = []) {
    return permissions.every(p => hasPermission(p));
}

/**
 * Возвращает текущий профиль пользователя
 * @returns {Object|null}
 */
export function getCurrentProfile() {
    return currentProfile;
}

/**
 * Возвращает все права текущего пользователя
 * @returns {string[]}
 */
export function getCurrentPermissions() {
    return [...currentPermissions];
}

// ========== ОБНОВИТЬ ФУНКЦИЮ signIn (добавить вызов loadUserProfile) ==========

export async function signIn(email, password) {
    console.log(`[Auth] SignIn attempt: ${email}`);
    const startTime = Date.now();

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) throw error;

        if (data?.user) {
            currentUser = data.user;
            
            // ЗАГРУЗКА ПРАВ — вот это добавляем
            await loadUserProfile(data.user.id);
            
            console.log(`[Auth] SignIn success in ${Date.now() - startTime}ms`);
            return { success: true, user: currentUser, error: null };
        }

        throw new Error('No user returned from Supabase');

    } catch (error) {
        console.error('[Auth] SignIn failed:', error);
        return {
            success: false,
            user: null,
            error: error.message || 'Ошибка входа'
        };
    }
}

// ========== ОБНОВИТЬ initAuth (добавить загрузку прав при восстановлении сессии) ==========

export async function initAuth() {
    console.log('[Auth] InitAuth started...');

    try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            // ... существующая логика восстановления сессии ...
            return null;
        }

        if (data?.user) {
            currentUser = data.user;
            
            // ЗАГРУЗКА ПРАВ — добавляем
            await loadUserProfile(data.user.id);
            
            console.log('[Auth] User session found:', data.user.email);
        }
    } catch (err) {
        console.error('[Auth] InitAuth failed', err);
    }

    return currentUser;
}

// ========== ОБНОВИТЬ EXPORTЫ ==========

export default {
    initAuth,
    signIn,
    getCurrentUser,
    isAuthenticated,
    requireAuth,
    logout,
    isOnline,
    getReturnUrl,
    getSupabase,
    // Новые
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getCurrentProfile,
    getCurrentPermissions
};
