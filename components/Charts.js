// ============================================================
// components/Charts.js
// ============================================================

/**
 * Обёртка над Chart.js.
 * 
 * Загружает Chart.js один раз при первом вызове.
 * Управляет экземплярами графиков: уничтожает старые,
 * создаёт новые в переданных canvas.
 * 
 * @module components/Charts
 */

import { formatMoney, getCategoryName } from '../utils/formatters.js';

// ============================================================
// Состояние
// ============================================================

let ChartConstructor = null;
let loadPromise = null;

/** @type {Object|null} */
let revenueChart = null;

/** @type {Object|null} */
let categoryChart = null;

// ============================================================
// Загрузка Chart.js
// ============================================================

async function ensureChartJs() {
    if (ChartConstructor) return ChartConstructor;
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        // Если уже загружен глобально (напр. через index.html)
        if (window.Chart) {
            ChartConstructor = window.Chart;
            resolve(ChartConstructor);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => {
            ChartConstructor = window.Chart;
            resolve(ChartConstructor);
        };
        script.onerror = () => reject(new Error('Не удалось загрузить Chart.js'));
        document.head.appendChild(script);
    });

    return loadPromise;
}

// ============================================================
// Цвета
// ============================================================

const COLORS = [
    '#2563eb', '#16a34a', '#ea580c', '#0284c7', '#7c3aed',
    '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#475569'
];

// ============================================================
// График выручки и прибыли
// ============================================================

/**
 * Отрисовывает линейный график выручки и прибыли по дням.
 * 
 * @param {Array<{date: string, revenue: number, profit: number}>} dailyData
 */
export async function drawRevenueChart(dailyData) {
    await ensureChartJs();

    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;

    if (revenueChart) {
        revenueChart.destroy();
        revenueChart = null;
    }

    if (!dailyData || dailyData.length === 0) return;

    const labels = dailyData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    });

    const ctx = canvas.getContext('2d');

    revenueChart = new ChartConstructor(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Выручка',
                    data: dailyData.map(d => d.revenue),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Прибыль',
                    data: dailyData.map(d => d.profit),
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.08)',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const label = ctx.dataset.label || '';
                            return `${label}: ${formatMoney(ctx.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => formatMoney(v) }
                }
            }
        }
    });
}

// ============================================================
// Круговая диаграмма по категориям
// ============================================================

/**
 * Отрисовывает круговую диаграмму распределения выручки по категориям.
 * 
 * @param {Array<{category: string, revenue: number}>} categoryData
 */
export async function drawCategoryChart(categoryData) {
    await ensureChartJs();

    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    if (!categoryData || categoryData.length === 0) return;

    const labels = categoryData.map(c => getCategoryName(c.category));
    const data = categoryData.map(c => c.revenue);
    const total = data.reduce((a, b) => a + b, 0);

    const ctx = canvas.getContext('2d');

    categoryChart = new ChartConstructor(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: COLORS.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, padding: 15 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const label = ctx.label || '';
                            const value = formatMoney(ctx.raw);
                            const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

export default { drawRevenueChart, drawCategoryChart };
