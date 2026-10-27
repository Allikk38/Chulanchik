// ============================================================
// utils/update-notifier.js
// v1.1.0 — 2026-10-27: немедленный update() после регистрации,
//                      query-параметр против кэша GitHub Pages,
//                      лог controllerchange для диагностики
// ============================================================
//
// НАЗНАЧЕНИЕ
//   Показывает продавцу ненавязчивую плашку, когда Service Worker
//   обнаружил новую версию приложения. Обновление — по кнопке,
//   чтобы не потерять открытую корзину/форму.
//
// ЛОГИКА
//   1. Регистрирует SW (если ещё не зарегистрирован).
//   2. Сразу после регистрации вызывает registration.update() —
//      не ждёт 30 минут.
//   3. Слушает 'updatefound' и 'statechange' — если новый SW
//      перешёл в состояние 'installed', показывает плашку.
//   4. Слушает сообщения SW_UPDATED от уже активного воркера
//      (после activate с clients.claim).
//   5. При клике «Обновить»:
//      - отправляет SKIP_WAITING (если воркер ещё ждёт),
//      - перезагружает страницу.
//
// ИСПОЛЬЗУЕТСЯ
//   Все страницы приложения: index.html, pages/*.html
//   Вызов: initUpdateNotifier() — сразу в <head> как модуль.
//
// ИЗМЕНЕНИЯ
//   v1.1.0 — немедленный update() после register, query-параметр
//            ?v=Date.now() против кэша GitHub Pages, лог
//            controllerchange для диагностики.
//   v1.0.0 — первоначальная версия.
//
// ============================================================

const BANNER_ID = 'sw-update-banner';
const BANNER_STYLE_ID = 'sw-update-banner-styles';

let updateAvailable = false;
let waitingWorker = null;
let swRegistration = null;

/**
 * Показывает плашку. Идемпотентна.
 */
function showBanner() {
    if (document.getElementById(BANNER_ID)) return;

    // Стили — один раз
    if (!document.getElementById(BANNER_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = BANNER_STYLE_ID;
        style.textContent = `
            #${BANNER_ID} {
                position: fixed;
                left: 50%;
                bottom: 16px;
                transform: translateX(-50%);
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px 10px 16px;
                background: #1a3c2a;
                color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 13px;
                line-height: 1.3;
                max-width: calc(100vw - 24px);
                animation: sw-banner-in 0.2s ease-out;
            }
            #${BANNER_ID} .sw-banner-text {
                flex: 1;
                min-width: 0;
            }
            #${BANNER_ID} .sw-banner-btn {
                flex-shrink: 0;
                padding: 6px 14px;
                background: #ffffff;
                color: #1a3c2a;
                border: none;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                white-space: nowrap;
            }
            #${BANNER_ID} .sw-banner-btn:hover {
                background: #f0ede8;
            }
            #${BANNER_ID} .sw-banner-close {
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.6);
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                border-radius: 4px;
            }
            #${BANNER_ID} .sw-banner-close:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.1);
            }
            @keyframes sw-banner-in {
                from { opacity: 0; transform: translate(-50%, 8px); }
                to   { opacity: 1; transform: translate(-50%, 0); }
            }
            @media (max-width: 480px) {
                #${BANNER_ID} {
                    left: 8px;
                    right: 8px;
                    transform: none;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = `
        <span class="sw-banner-text">Доступна новая версия приложения</span>
        <button class="sw-banner-btn" type="button" id="sw-banner-update">Обновить</button>
        <button class="sw-banner-close" type="button" aria-label="Скрыть" id="sw-banner-close">&times;</button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('#sw-banner-update').addEventListener('click', () => {
        const btn = banner.querySelector('#sw-banner-update');
        btn.disabled = true;
        btn.textContent = 'Обновление...';

        // Если новый воркер ещё в состоянии waiting — просим его активироваться
        if (waitingWorker) {
            try {
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            } catch (e) { /* */ }
        }

        // Небольшая задержка, чтобы SW успел активироваться, потом reload
        setTimeout(() => window.location.reload(), 250);
    });

    banner.querySelector('#sw-banner-close').addEventListener('click', () => {
        banner.remove();
    });
}

/**
 * Слушает обновления SW и показывает плашку.
 * Идемпотентна — повторный вызов ничего не ломает.
 */
export function initUpdateNotifier() {
    if (!('serviceWorker' in navigator)) return;

    // Уже инициализированы — выходим
    if (window.__swUpdateNotifierInited) return;
    window.__swUpdateNotifierInited = true;

    // Слушаем сообщения от SW (в т.ч. от уже активного воркера)
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
            console.log('[update-notifier] SW_UPDATED:', event.data.version);
            showBanner();
        }
    });

    // Лог смены контроллера — помогает диагностике, когда плашка
    // не появляется, но воркер уже активировался
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[update-notifier] controller changed — new SW active');
    });

    // Регистрируем (или находим) SW.
    // Query-параметр ?v=Date.now() обходит агрессивный кэш GitHub Pages:
    // CDN отдаёт sw.js с большим max-age, и без query-параметра
    // браузер может месяцами видеть старую версию.
    const swUrl = `/Chulanchik/sw.js?v=${Date.now()}`;

    navigator.serviceWorker.register(swUrl, { scope: '/Chulanchik/' })
        .then(registration => {
            swRegistration = registration;

            // 1. Сразу запрашиваем обновление — не ждём 30 минут.
            //    Если на сервере уже лежит новый sw.js, браузер его увидит.
            registration.update().catch(() => { /* офлайн — не критично */ });

            // 2. Уже есть ожидающий воркер? Показываем плашку сразу.
            if (registration.waiting) {
                waitingWorker = registration.waiting;
                showBanner();
            }

            // 3. Новый воркер обнаружен при загрузке этой страницы
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Есть активный воркер + новый установлен → это обновление
                        waitingWorker = newWorker;
                        showBanner();
                    }
                });
            });

            // 4. Периодическая проверка обновлений (каждые 30 минут)
            //    На случай, если вкладка не закрывается днями.
            setInterval(() => {
                registration.update().catch(() => { /* офлайн */ });
            }, 30 * 60 * 1000);

            // 5. Проверка при возврате фокуса на вкладку (продавец вернулся
            //    с обеда — есть шанс, что вышел новый деплой)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update().catch(() => { /* */ });
                }
            });
        })
        .catch(err => {
            console.warn('[update-notifier] SW registration failed:', err);
        });
}

export default { initUpdateNotifier };