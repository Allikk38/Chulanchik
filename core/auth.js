// ========== ДОБАВИТЬ В core/auth.js ==========

/**
 * Разрешения текущего пользователя
 * @type {string[]}
 */
let currentPermissions = [];

/**
 * Проверяет, есть ли у пользователя право
 * @param {string} permission - Ключ права (например 'products:create')
 * @returns {boolean}
 */
export function hasPermission(permission) {
    return currentPermissions.includes(permission) || currentPermissions.includes('*');
}

/**
 * Загружает права пользователя из profiles
 * Вызывается после успешного входа
 */
async function loadPermissions(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('permissions')
            .eq('id', userId)
            .single();
        
        if (error) throw error;
        
        currentPermissions = data?.permissions || [];
        console.log('[Auth] Permissions loaded:', currentPermissions);
    } catch (err) {
        console.warn('[Auth] Failed to load permissions:', err);
        currentPermissions = [];
    }
}

// Вызывать loadPermissions(user.id) внутри signIn после успешного входа
