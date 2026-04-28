// ========================================
// ФАЙЛ: shared/state/product-store.js
// ========================================

/**
 * Product Store — единый источник истины для товаров
 * 
 * Все страницы (склад, касса, отчёты) берут товары отсюда.
 * Никакой модуль больше не грузит товары из Supabase напрямую.
 * 
 * Паттерн: Observable Store (pub/sub через EventEmitter)
 * 
 * @module shared/state/product-store
 * @version 1.0.0
 */

// На первом этапе используем заглушку репозитория
// Когда БД оживёт — заменим импорт на реальный product-repo.js
import { ProductRepo } from '../../core/repositories/product-repo.js';

// ========== EVENT EMITTER (простая реализация) ==========

class EventEmitter {
    constructor() {
        this._listeners = new Map();
    }

    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        // Возвращаем функцию для отписки
        return () => this._listeners.get(event)?.delete(callback);
    }

    emit(event, data) {
        this._listeners.get(event)?.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`[EventEmitter] Error in listener for "${event}":`, e);
            }
        });
    }
}

// ========== КОНСТАНТЫ ==========

const CACHE_KEY = 'chulanchik_product_store';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// ========== STORE ==========

class ProductStore extends EventEmitter {
    constructor() {
        super();
        
        /** @type {Array<Object>} Все загруженные товары */
        this._all = [];
        
        /** @type {boolean} Флаг загрузки */
        this._isLoading = false;
        
        /** @type {boolean} Была ли хотя бы одна успешная загрузка */
        this._isInitialized = false;
        
        // Кэш в sessionStorage (опционально)
        this._loadFromCache();
        
        // Подписка на события сети
        this._setupNetworkListeners();
    }

    // ========== ПУБЛИЧНЫЕ СВОЙСТВА (только геттеры) ==========

    get all() {
        return [...this._all];
    }

    get isLoading() {
        return this._isLoading;
    }

    get isInitialized() {
        return this._isInitialized;
    }

    /**
     * Количество товаров всего
     */
    get totalCount() {
        return this._all.length;
    }

    // ========== ЗАГРУЗКА ДАННЫХ ==========

    /**
     * Загружает товары из репозитория
     * @param {Object} options - Опции загрузки
     * @param {boolean} [options.forceRefresh=false] - Игнорировать кэш
     * @param {string} [options.status] - Фильтр по статусу (для кассы: 'in_stock')
     * @returns {Promise<Array<Object>>}
     */
    async load({ forceRefresh = false, status = null } = {}) {
        // Защита от повторной загрузки
        if (this._isLoading) {
            console.log('[ProductStore] Already loading, skipping');
            return this._all;
        }

        // Если уже загружено и не принудительно — возвращаем кэш
        if (!forceRefresh && this._isInitialized && this._all.length > 0) {
            console.log('[ProductStore] Using loaded data');
            return this._all;
        }

        this._isLoading = true;
        this.emit('loading', true);

        try {
            const products = await ProductRepo.getAll({ status });
            this._all = products || [];
            this._isInitialized = true;
            this._saveToCache();
            
            console.log(`[ProductStore] Loaded ${this._all.length} products`);
            this.emit('loaded', this._all);
            return this._all;
            
        } catch (error) {
            console.error('[ProductStore] Load error:', error);
            
            // При ошибке пробуем кэш
            const cached = this._loadFromCache();
            if (cached && cached.length > 0) {
                console.log('[ProductStore] Using cached data after error');
                this._all = cached;
                this.emit('loaded', this._all);
                return this._all;
            }
            
            this.emit('error', error);
            return [];
            
        } finally {
            this._isLoading = false;
            this.emit('loading', false);
        }
    }

    /**
     * Добавляет товар в стор (после создания через репозиторий)
     * @param {Object} product - Новый товар
     */
    add(product) {
        if (!product || !product.id) {
            console.warn('[ProductStore] Cannot add invalid product');
            return;
        }
        
        // Проверяем, нет ли уже такого товара
        const existingIndex = this._all.findIndex(p => p.id === product.id);
        if (existingIndex >= 0) {
            this._all[existingIndex] = product;
        } else {
            this._all.unshift(product);
        }
        
        this._saveToCache();
        this.emit('added', product);
        this.emit('changed', this._all);
    }

    /**
     * Обновляет товар в сторе
     * @param {string} id - ID товара
     * @param {Object} updates - Обновлённые поля
     */
    update(id, updates) {
        const index = this._all.findIndex(p => p.id === id);
        if (index === -1) {
            console.warn('[ProductStore] Product not found for update:', id);
            return;
        }
        
        this._all[index] = { ...this._all[index], ...updates };
        this._saveToCache();
        this.emit('updated', this._all[index]);
        this.emit('changed', this._all);
    }

    /**
     * Удаляет товар из стора
     * @param {string} id - ID товара
     */
    remove(id) {
        const index = this._all.findIndex(p => p.id === id);
        if (index === -1) return;
        
        const removed = this._all[index];
        this._all.splice(index, 1);
        
        this._saveToCache();
        this.emit('removed', removed);
        this.emit('changed', this._all);
    }

    // ========== ПОИСК ==========

    /**
     * Ищет товар по ID или штрихкоду
     * @param {string} code - ID товара или штрихкод
     * @returns {Object|null}
     */
    findByCode(code) {
        if (!code) return null;
        const cleanCode = code.trim();
        return this._all.find(p => p.id === cleanCode || p.barcode === cleanCode) || null;
    }

    // ========== ФИЛЬТРАЦИЯ (возвращает новый массив, не меняет стор) ==========

    /**
     * Возвращает отфильтрованные товары
     * @param {Object} filters - Фильтры
     * @param {string} [filters.searchQuery] - Поисковый запрос
     * @param {string} [filters.status] - Статус товара
     * @param {string} [filters.category] - Категория
     * @param {string} [filters.sortBy] - Сортировка
     * @returns {Array<Object>}
     */
    getFiltered({ searchQuery = '', status = '', category = '', sortBy = 'created_at-desc' } = {}) {
        let filtered = [...this._all];

        // Поиск по названию или ID
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                p.name?.toLowerCase().includes(q) ||
                p.id?.toLowerCase().includes(q)
            );
        }

        // Статус
        if (status) {
            filtered = filtered.filter(p => p.status === status);
        }

        // Категория
        if (category) {
            filtered = filtered.filter(p => p.category === category);
        }

        // Сортировка
        filtered = this._sort(filtered, sortBy);

        return filtered;
    }

    /**
     * Возвращает список категорий с количеством товаров
     * @returns {Array<{value: string, count: number}>}
     */
    getCategories() {
        const counts = new Map();
        this._all.forEach(p => {
            const cat = p.category || 'other';
            counts.set(cat, (counts.get(cat) || 0) + 1);
        });
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Возвращает статистику по складу
     * @returns {Object}
     */
    getStats() {
        const inStock = this._all.filter(p => p.status === 'in_stock');
        return {
            total: this._all.length,
            inStock: inStock.length,
            sold: this._all.filter(p => p.status === 'sold').length,
            reserved: this._all.filter(p => p.status === 'reserved').length,
            stockValue: inStock.reduce((sum, p) => sum + (p.price || 0), 0),
            potentialProfit: inStock.reduce((sum, p) => sum + ((p.price || 0) - (p.cost_price || 0)), 0)
        };
    }

    // ========== ПРИВАТНЫЕ МЕТОДЫ ==========

    _sort(products, sortBy) {
        const sorted = [...products];
        switch (sortBy) {
            case 'price-asc':
                return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
            case 'price-desc':
                return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
            case 'name-asc':
                return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'created_at-desc':
            default:
                return sorted.sort((a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
                    return dateB - dateA;
                });
        }
    }

    _saveToCache() {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                data: this._all,
                timestamp: Date.now()
            }));
        } catch (e) {
            // sessionStorage может быть переполнен
        }
    }

    _loadFromCache() {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    return data;
                }
            }
        } catch (e) {
            // Ничего не делаем
        }
        return null;
    }

    _setupNetworkListeners() {
        // При восстановлении сети — автоматически обновляем данные
        window.addEventListener('online', () => {
            console.log('[ProductStore] Network restored, refreshing data...');
            this.load({ forceRefresh: true });
        });
    }
}

// ========== SINGLETON ==========

// Единственный экземпляр стора на всё приложение
export const productStore = new ProductStore();

// Для тестирования: можно создать новый экземпляр
export { ProductStore };

export default productStore;

console.log('[ProductStore] Module loaded');
