// ========================================
// ФАЙЛ: core/repositories/product-repo.js
// ========================================

/**
 * Product Repository — слой доступа к данным товаров
 * 
 * ЕДИНСТВЕННЫЙ модуль, который общается с Supabase по таблице products.
 * Все запросы к БД проходят только через этот репозиторий.
 * 
 * Когда БД недоступна — использует заглушку с мок-данными.
 * После восстановления БД — удалить блок MOCK и раскомментировать реальный код.
 * 
 * @module core/repositories/product-repo
 * @version 1.0.0
 */

// Когда БД оживёт — используем этот импорт:
// import { supabase } from '../supabase-client.js';

// ========== ВРЕМЕННАЯ ЗАГЛУШКА (удалить после восстановления БД) ==========

const MOCK_PRODUCTS = [
    {
        id: 'mock-001',
        name: 'Джинсы классические',
        price: 2500,
        cost_price: 800,
        category: 'clothes',
        status: 'in_stock',
        photo_url: null,
        attributes: { size: '32', brand: 'Levi\'s', condition: 'Отличное' },
        created_by: 'system',
        created_at: '2026-04-20T10:00:00Z',
        updated_at: null
    },
    {
        id: 'mock-002',
        name: 'Конструктор LEGO',
        price: 3200,
        cost_price: 1500,
        category: 'toys',
        status: 'in_stock',
        photo_url: null,
        attributes: { age: '6+', brand: 'LEGO', completeness: 'Полная' },
        created_by: 'system',
        created_at: '2026-04-19T14:30:00Z',
        updated_at: null
    },
    {
        id: 'mock-003',
        name: 'Чайный сервиз',
        price: 1800,
        cost_price: 600,
        category: 'dishes',
        status: 'sold',
        photo_url: null,
        attributes: { material: 'Фарфор', setItems: '12' },
        created_by: 'system',
        created_at: '2026-04-18T09:15:00Z',
        sold_at: '2026-04-21T11:00:00Z'
    },
    {
        id: 'mock-004',
        name: 'Наушники Sony',
        price: 4500,
        cost_price: 2200,
        category: 'electronics',
        status: 'in_stock',
        photo_url: null,
        attributes: { brand: 'Sony', model: 'WH-1000XM4', condition: 'Отличное' },
        created_by: 'system',
        created_at: '2026-04-17T16:45:00Z',
        updated_at: null
    },
    {
        id: 'mock-005',
        name: 'Стул офисный',
        price: 3500,
        cost_price: 1200,
        category: 'furniture',
        status: 'reserved',
        photo_url: null,
        attributes: { material: 'Ткань', color: 'Серый' },
        created_by: 'system',
        created_at: '2026-04-16T11:20:00Z',
        updated_at: null
    }
];

// ========== РЕПОЗИТОРИЙ ==========

export const ProductRepo = {
    /**
     * Получить все товары
     * @param {Object} options - Опции фильтрации
     * @param {string} [options.status] - Фильтр по статусу
     * @returns {Promise<Array<Object>>}
     */
    async getAll(options = {}) {
        // ===== ВРЕМЕННАЯ ЗАГЛУШКА (заменить на реальный код после восстановления БД) =====
        console.log('[ProductRepo] Using MOCK data (БД недоступна)');
        
        let products = [...MOCK_PRODUCTS];
        
        if (options.status) {
            products = products.filter(p => p.status === options.status);
        }
        
        // Имитация задержки сети
        await new Promise(resolve => setTimeout(resolve, 300));
        
        return products;
        
        // ===== РЕАЛЬНЫЙ КОД (раскомментировать когда БД оживёт) =====
        /*
        console.log('[ProductRepo] Fetching all products...');
        const startTime = Date.now();
        
        let query = supabase
            .from('products')
            .select('*');
        
        if (options.status) {
            query = query.eq('status', options.status);
        }
        
        query = query.order('created_at', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) {
            console.error('[ProductRepo] Failed to fetch products:', error);
            throw error;
        }
        
        console.log(`[ProductRepo] Fetched ${data.length} products in ${Date.now() - startTime}ms`);
        return data;
        */
    },

    /**
     * Получить товар по ID
     * @param {string} id - ID товара
     * @returns {Promise<Object|null>}
     */
    async getById(id) {
        // ===== ВРЕМЕННАЯ ЗАГЛУШКА =====
        console.log('[ProductRepo] Using MOCK data for getById:', id);
        await new Promise(resolve => setTimeout(resolve, 100));
        return MOCK_PRODUCTS.find(p => p.id === id) || null;
        
        // ===== РЕАЛЬНЫЙ КОД =====
        /*
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single();
            
        if (error && error.code !== 'PGRST116') {
            console.error(`[ProductRepo] Failed to fetch product ${id}:`, error);
            throw error;
        }
        
        return data || null;
        */
    },

    /**
     * Создать товар
     * @param {Object} productData - Данные товара
     * @returns {Promise<Object>}
     */
    async create(productData) {
        // ===== ВРЕМЕННАЯ ЗАГЛУШКА =====
        console.log('[ProductRepo] Using MOCK data for create:', productData.name);
        const newProduct = {
            id: 'mock-' + Date.now(),
            ...productData,
            status: 'in_stock',
            created_at: new Date().toISOString(),
            updated_at: null
        };
        return newProduct;
        
        // ===== РЕАЛЬНЫЙ КОД =====
        /*
        const { data, error } = await supabase
            .from('products')
            .insert({
                name: productData.name,
                price: productData.price || 0,
                cost_price: productData.cost_price || 0,
                category: productData.category || 'other',
                status: 'in_stock',
                photo_url: productData.photo_url || null,
                created_by: productData.created_by,
                attributes: productData.attributes || {}
            })
            .select()
            .single();
            
        if (error) {
            console.error('[ProductRepo] Failed to create product:', error);
            throw error;
        }
        
        return data;
        */
    },

    /**
     * Обновить товар
     * @param {string} id - ID товара
     * @param {Object} updates - Поля для обновления
     * @returns {Promise<Object>}
     */
    async update(id, updates) {
        // ===== ВРЕМЕННАЯ ЗАГЛУШКА =====
        console.log('[ProductRepo] Using MOCK data for update:', id);
        const product = MOCK_PRODUCTS.find(p => p.id === id);
        if (!product) throw new Error('Product not found');
        return { ...product, ...updates, updated_at: new Date().toISOString() };
        
        // ===== РЕАЛЬНЫЙ КОД =====
        /*
        const { data, error } = await supabase
            .from('products')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
            
        if (error) {
            console.error(`[ProductRepo] Failed to update product ${id}:`, error);
            throw error;
        }
        
        return data;
        */
    },

    /**
     * Удалить товар
     * @param {string} id - ID товара
     * @returns {Promise<boolean>}
     */
    async remove(id) {
        // ===== ВРЕМЕННАЯ ЗАГЛУШКА =====
        console.log('[ProductRepo] Using MOCK data for remove:', id);
        return true;
        
        // ===== РЕАЛЬНЫЙ КОД =====
        /*
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);
            
        if (error) {
            console.error(`[ProductRepo] Failed to delete product ${id}:`, error);
            throw error;
        }
        
        return true;
        */
    }
};

export default ProductRepo;

console.log('[ProductRepo] Module loaded');
