// ============================================================
// sw.js — Service Worker
// ============================================================

const CACHE_VERSION = 'chulanchik-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const BASE_PATH = '/Chulanchik';

// Статика — кэшируется при установке
const STATIC_ASSETS = [
    `${BASE_PATH}/`,
    `${BASE_PATH}/css/styles.css`,
    `${BASE_PATH}/css/base/variables.css`,
    `${BASE_PATH}/css/base/reset.css`,
    `${BASE_PATH}/css/base/typography.css`,
    `${BASE_PATH}/css/components/buttons.css`,
    `${BASE_PATH}/css/components/forms.css`,
    `${BASE_PATH}/css/components/tables.css`,
    `${BASE_PATH}/css/components/modal.css`,
    `${BASE_PATH}/css/components/notifications.css`,
    `${BASE_PATH}/css/components/product-card.css`,
    `${BASE_PATH}/css/components/cart.css`,
    `${BASE_PATH}/css/layouts/app.css`,
    `${BASE_PATH}/css/layouts/cashier.css`,
    `${BASE_PATH}/css/layouts/inventory.css`,
    `${BASE_PATH}/css/layouts/reports.css`,
    `${BASE_PATH}/css/utils/utilities.css`,
    `${BASE_PATH}/css/utils/responsive.css`,
    `${BASE_PATH}/manifest.json`,
    `${BASE_PATH}/icons/icon-192.png`,
    `${BASE_PATH}/icons/icon-512.png`
];

// Supabase — не кэшируем
const SUPABASE_ORIGIN = 'https://bhdwniiyrrujeoubrvle.supabase.co';

// ============================================================
// Установка
// ============================================================

self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => console.warn('[SW] Cache install error:', err))
    );
});

// ============================================================
// Активация
// ============================================================

self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names
                    .filter(n => n.startsWith('chulanchik-') &&
                        n !== STATIC_CACHE &&
                        n !== PAGES_CACHE)
                    .map(n => {
                        console.log('[SW] Deleting old cache:', n);
                        return caches.delete(n);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// ============================================================
// Запросы
// ============================================================

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Только GET
    if (request.method !== 'GET') return;

    // Supabase API — не кэшируем
    if (url.origin === SUPABASE_ORIGIN) return;

    // HTML-страницы — Network First
    if (request.destination === 'document') {
        event.respondWith(networkFirst(request, PAGES_CACHE));
        return;
    }

    // Статика — Cache First
    if (
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'image' ||
        request.destination === 'font' ||
        url.pathname.includes('/icons/') ||
        url.pathname.endsWith('.json')
    ) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    // Остальное — Network First
    event.respondWith(networkFirst(request, STATIC_CACHE));
});

// ============================================================
// Стратегии
// ============================================================

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback для страниц — index.html
        if (request.destination === 'document') {
            return caches.match(`${BASE_PATH}/`);
        }

        return new Response('Offline', { status: 503 });
    }
}
