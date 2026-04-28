// core/constants.js — Единые константы приложения

export const APP_NAME = 'Chulanchik';
export const APP_VERSION = '1.0.0';

export const SUPABASE_URL = 'https://bhdwniiyrrujeoubrvle.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoZHduaWl5cnJ1amVvdWJydmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MzM2MTYsImV4cCI6MjA5MjIwOTYxNn0.-EilGBYgNNRraTjEqilYuvk-Pfy_Mf5TNEtS1NrU2WM';

export const CACHE_TTL = {
    PRODUCTS: 5 * 60 * 1000,
    SHIFT: 24 * 60 * 60 * 1000,
    CART: 60 * 60 * 1000
};

export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20
};

export const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    CASHIER: 'cashier'
};

export const PERMISSIONS = {
    PRODUCTS_VIEW: 'products:view',
    PRODUCTS_CREATE: 'products:create',
    PRODUCTS_EDIT: 'products:edit',
    PRODUCTS_DELETE: 'products:delete',
    SALES_CREATE: 'sales:create',
    SALES_VIEW: 'sales:view',
    SHIFT_OPEN: 'shift:open',
    SHIFT_CLOSE: 'shift:close',
    REPORTS_VIEW: 'reports:view',
    REPORTS_EXPORT: 'reports:export'
};
