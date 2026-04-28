// ========================================
// ФАЙЛ: utils/category-schema.js
// ========================================

/**
 * Category Schema — единый источник схем категорий
 * 
 * Определяет поля для каждой категории товаров.
 * Используется формой товара и отчётами.
 * 
 * @module utils/category-schema
 * @version 2.2.0
 */

export const CATEGORY_KEYS = ['clothes', 'toys', 'dishes', 'electronics', 'furniture', 'other'];

export const CATEGORY_SCHEMA = {
    clothes: {
        name: 'Одежда',
        fields: [
            { name: 'size', label: 'Размер', type: 'text', placeholder: '42, M, XL, 104', required: true },
            { name: 'brand', label: 'Бренд', type: 'text', placeholder: 'Zara, H&M', required: false },
            { name: 'material', label: 'Материал', type: 'text', placeholder: 'Хлопок, Шерсть', required: false },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Требует ремонта'], required: true },
            { name: 'season', label: 'Сезон', type: 'select', options: ['Лето', 'Зима', 'Демисезон', 'Всесезон'], required: false }
        ]
    },
    toys: {
        name: 'Игрушки',
        fields: [
            { name: 'age', label: 'Возраст', type: 'text', placeholder: '3+, 5-7 лет', required: true },
            { name: 'brand', label: 'Бренд', type: 'text', placeholder: 'LEGO, Mattel', required: false },
            { name: 'type', label: 'Тип', type: 'select', options: ['Конструктор', 'Кукла', 'Машинка', 'Настольная игра', 'Мягкая игрушка', 'Развивающая', 'Другое'], required: false },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Требует ремонта'], required: true },
            { name: 'completeness', label: 'Комплектация', type: 'select', options: ['Полная', 'Неполная', 'Отсутствуют детали'], required: false }
        ]
    },
    dishes: {
        name: 'Посуда',
        fields: [
            { name: 'material', label: 'Материал', type: 'select', options: ['Керамика', 'Стекло', 'Фарфор', 'Металл', 'Пластик', 'Дерево', 'Хрусталь'], required: true },
            { name: 'volume', label: 'Объём', type: 'text', placeholder: '250 мл, 1 л', required: false },
            { name: 'brand', label: 'Бренд', type: 'text', placeholder: 'IKEA, Tefal', required: false },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Имеет дефекты'], required: true },
            { name: 'setItems', label: 'Предметов в наборе', type: 'text', placeholder: '1, 6, 12', required: false }
        ]
    },
    electronics: {
        name: 'Электроника',
        fields: [
            { name: 'brand', label: 'Бренд', type: 'text', placeholder: 'Apple, Samsung', required: true },
            { name: 'model', label: 'Модель', type: 'text', placeholder: 'iPhone 13, Galaxy S22', required: true },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Требует ремонта'], required: true },
            { name: 'accessories', label: 'Комплектация', type: 'text', placeholder: 'Зарядное устройство, коробка', required: false },
            { name: 'warranty', label: 'Гарантия', type: 'text', placeholder: '3 месяца, 1 год', required: false }
        ]
    },
    furniture: {
        name: 'Мебель',
        fields: [
            { name: 'material', label: 'Материал', type: 'select', options: ['Дерево', 'Металл', 'Пластик', 'Стекло', 'Ткань', 'Кожа'], required: true },
            { name: 'dimensions', label: 'Размеры (Ш×Г×В)', type: 'text', placeholder: '80×40×120 см', required: false },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Требует ремонта'], required: true },
            { name: 'assembly', label: 'Требуется сборка', type: 'select', options: ['Да', 'Нет', 'Частично'], required: false },
            { name: 'color', label: 'Цвет', type: 'text', placeholder: 'Белый, дуб, венге', required: false }
        ]
    },
    other: {
        name: 'Другое',
        fields: [
            { name: 'description', label: 'Описание', type: 'textarea', placeholder: 'Дополнительная информация', required: false },
            { name: 'condition', label: 'Состояние', type: 'select', options: ['Новое', 'Отличное', 'Хорошее', 'Среднее', 'Требует ремонта'], required: true },
            { name: 'brand', label: 'Бренд/Производитель', type: 'text', placeholder: 'Укажите если известно', required: false }
        ]
    }
};

export function getCategorySchema(category) {
    return CATEGORY_SCHEMA[category] || CATEGORY_SCHEMA.other;
}

export function getCategoryName(category) {
    if (!category) return 'Другое';
    return CATEGORY_SCHEMA[category]?.name || category;
}

export function getCategoryOptions(includeOther = true) {
    return Object.entries(CATEGORY_SCHEMA)
        .filter(([key]) => includeOther || key !== 'other')
        .map(([value, data]) => ({ value, label: data.name }));
}

export function getCategoryFields(category) {
    const schema = getCategorySchema(category);
    return schema.fields || [];
}

export function getRequiredFields(category) {
    return getCategoryFields(category).filter(f => f.required);
}

export function validateAttributes(category, attributes = {}) {
    const requiredFields = getRequiredFields(category);
    const missingFields = [];

    requiredFields.forEach(field => {
        const value = attributes[field.name];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            missingFields.push(field.name);
        }
    });

    const errors = missingFields.map(name => {
        const field = requiredFields.find(f => f.name === name);
        return `Поле "${field?.label || name}" обязательно`;
    });

    return { valid: missingFields.length === 0, errors, missingFields };
}

export default {
    CATEGORY_SCHEMA,
    CATEGORY_KEYS,
    getCategorySchema,
    getCategoryName,
    getCategoryOptions,
    getCategoryFields,
    getRequiredFields,
    validateAttributes
};

console.log('[CategorySchema] Module loaded');
