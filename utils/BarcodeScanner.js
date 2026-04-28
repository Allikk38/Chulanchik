// ============================================================
// utils/BarcodeScanner.js
// ============================================================

/**
 * Модуль сканирования штрихкодов с камеры.
 * 
 * Использует BarcodeDetector API (Chromium) с фолбэком на Quagga2 (Safari/iOS).
 * Чистая утилита, не зависит от контроллеров или сторов.
 * 
 * @module utils/BarcodeScanner
 */

// ============================================================
// Конфигурация
// ============================================================

const SCAN_INTERVAL_MS = 200;
const SCAN_TIMEOUT_MS = 30000;

// ============================================================
// Проверка поддержки BarcodeDetector API
// ============================================================

function isBarcodeDetectorSupported() {
    return typeof BarcodeDetector !== 'undefined';
}

// ============================================================
// BarcodeDetector API (Chromium)
// ============================================================

/**
 * Запускает сканирование через BarcodeDetector API.
 * 
 * @returns {Promise<string>} — строка штрихкода
 */
async function scanWithBarcodeDetector() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
    });

    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function stopTracks() {
            stream.getTracks().forEach(track => track.stop());
            video.pause();
            video.srcObject = null;
        }

        function tick() {
            if (Date.now() - startTime > SCAN_TIMEOUT_MS) {
                stopTracks();
                reject(new Error('Время сканирования истекло'));
                return;
            }

            if (video.readyState !== video.HAVE_ENOUGH_DATA) {
                requestAnimationFrame(tick);
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            detector.detect(canvas)
                .then((barcodes) => {
                    if (barcodes.length > 0) {
                        stopTracks();
                        resolve(barcodes[0].rawValue);
                    } else {
                        setTimeout(tick, SCAN_INTERVAL_MS);
                    }
                })
                .catch(() => {
                    setTimeout(tick, SCAN_INTERVAL_MS);
                });
        }

        tick();
    });
}

// ============================================================
// Фолбэк: Quagga2 (для Safari/iOS)
// ============================================================

/**
 * Динамически загружает Quagga2 с CDN.
 * 
 * @returns {Promise<void>}
 */
let quaggaLoadPromise = null;

function loadQuagga() {
    if (quaggaLoadPromise) return quaggaLoadPromise;

    quaggaLoadPromise = new Promise((resolve, reject) => {
        if (window.Quagga) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.8.4/dist/quagga.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Не удалось загрузить модуль сканера'));
        document.head.appendChild(script);
    });

    return quaggaLoadPromise;
}

/**
 * Запускает сканирование через Quagga2.
 * 
 * @returns {Promise<string>} — строка штрихкода
 */
async function scanWithQuagga() {
    await loadQuagga();

    const Quagga = window.Quagga;
    if (!Quagga) {
        throw new Error('Модуль сканера недоступен');
    }

    // Создаём контейнер для видео
    const container = document.createElement('div');
    container.id = 'quagga-scanner-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:#000;';
    document.body.appendChild(container);

    return new Promise((resolve, reject) => {
        Quagga.init({
            inputStream: {
                name: 'Live',
                type: 'LiveStream',
                target: container,
                constraints: {
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            },
            decoder: {
                readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader', 'code_39_reader']
            },
            locate: true,
            numOfWorkers: 2,
            frequency: 10
        }, (err) => {
            if (err) {
                container.remove();
                reject(err);
                return;
            }
            Quagga.start();
        });

        Quagga.onDetected((result) => {
            if (result && result.codeResult && result.codeResult.code) {
                Quagga.stop();
                container.remove();
                resolve(result.codeResult.code);
            }
        });

        // Таймаут
        setTimeout(() => {
            Quagga.stop();
            container.remove();
            reject(new Error('Время сканирования истекло'));
        }, SCAN_TIMEOUT_MS);
    });
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Начинает сканирование штрихкода с камеры.
 * 
 * Автоматически выбирает BarcodeDetector API если доступен,
 * иначе использует Quagga2.
 * 
 * @returns {Promise<string>} — распознанная строка штрихкода
 * @throws {Error} — если камера недоступна, время истекло или сканирование не удалось
 * 
 * @example
 * try {
 *     const barcode = await startBarcodeScan();
 *     document.getElementById('searchInput').value = barcode;
 * } catch (err) {
 *     showNotification(err.message, 'error');
 * }
 */
export async function startBarcodeScan() {
    try {
        if (isBarcodeDetectorSupported()) {
            return await scanWithBarcodeDetector();
        }
    } catch (e) {
        // BarcodeDetector не поддерживается — пробуем Quagga
    }

    return await scanWithQuagga();
}

/**
 * Проверяет, доступно ли сканирование в текущем браузере.
 * 
 * @returns {boolean}
 */
export function isScanSupported() {
    if (isBarcodeDetectorSupported()) return true;
    // Quagga2 работает везде где есть getUserMedia
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export default {
    startBarcodeScan,
    isScanSupported
};
