// ============================================================
// utils/escpos.js
// ============================================================

/**
 * Формирование ESC/POS-байтов для чековых принтеров.
 *
 * Чистый модуль: не знает ни о USB, ни о DOM.
 * Принимает данные чека → возвращает Uint8Array.
 *
 * Кодировка: CP866 (обязательна для кириллицы на ESC/POS).
 * QR-код: если передан qrText, пытается загрузить `qrcode` с CDN
 * и напечатать растр через GS v 0. При отсутствии сети —
 * печатает QR как текст-ссылку (или пропускает).
 *
 * @module utils/escpos
 */

// ============================================================
// Константы ESC/POS
// ============================================================

const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
    INIT:           [ESC, 0x40],                 // ESC @ — инициализация
    ALIGN_LEFT:     [ESC, 0x61, 0x00],
    ALIGN_CENTER:   [ESC, 0x61, 0x01],
    ALIGN_RIGHT:    [ESC, 0x61, 0x02],
    BOLD_ON:        [ESC, 0x45, 0x01],
    BOLD_OFF:       [ESC, 0x45, 0x00],
    DOUBLE_ON:      [ESC, 0x21, 0x30],           // двойная высота+ширина
    DOUBLE_OFF:     [ESC, 0x21, 0x00],
    CODEPAGE_CP866: [ESC, 0x74, 0x11],           // ESC t 17 — CP866 (зависит от модели)
    FEED_3:         [ESC, 0x64, 0x03],
    CUT:            [GS, 0x56, 0x42, 0x00],      // GS V B 0 — частичный разрез
    PAPER_WIDTH_58: 32,                          // 58 мм → 32 символа
    PAPER_WIDTH_80: 48                           // 80 мм → 48 символов
};

// ============================================================
// Таблица CP866: символ Unicode → байт
// ============================================================

/**
 * Полная карта CP866 для символов, которые реально используются
 * в чеке (кириллица + базовая латиница + спецсимволы).
 *
 * Ключ — код символа в Unicode, значение — байт CP866.
 */
const CP866_MAP = {
    // ASCII (0x20–0x7E) — идентичны
    0x20: 0x20, 0x21: 0x21, 0x22: 0x22, 0x23: 0x23, 0x24: 0x24,
    0x25: 0x25, 0x26: 0x26, 0x27: 0x27, 0x28: 0x28, 0x29: 0x29,
    0x2A: 0x2A, 0x2B: 0x2B, 0x2C: 0x2C, 0x2D: 0x2D, 0x2E: 0x2E,
    0x2F: 0x2F, 0x30: 0x30, 0x31: 0x31, 0x32: 0x32, 0x33: 0x33,
    0x34: 0x34, 0x35: 0x35, 0x36: 0x36, 0x37: 0x37, 0x38: 0x38,
    0x39: 0x39, 0x3A: 0x3A, 0x3B: 0x3B, 0x3C: 0x3C, 0x3D: 0x3D,
    0x3E: 0x3E, 0x3F: 0x3F, 0x40: 0x40,
    0x41: 0x41, 0x42: 0x42, 0x43: 0x43, 0x44: 0x44, 0x45: 0x45,
    0x46: 0x46, 0x47: 0x47, 0x48: 0x48, 0x49: 0x49, 0x4A: 0x4A,
    0x4B: 0x4B, 0x4C: 0x4C, 0x4D: 0x4D, 0x4E: 0x4E, 0x4F: 0x4F,
    0x50: 0x50, 0x51: 0x51, 0x52: 0x52, 0x53: 0x53, 0x54: 0x54,
    0x55: 0x55, 0x56: 0x56, 0x57: 0x57, 0x58: 0x58, 0x59: 0x59,
    0x5A: 0x5A, 0x5B: 0x5B, 0x5C: 0x5C, 0x5D: 0x5D, 0x5E: 0x5E,
    0x5F: 0x5F, 0x60: 0x60,
    0x61: 0x61, 0x62: 0x62, 0x63: 0x63, 0x64: 0x64, 0x65: 0x65,
    0x66: 0x66, 0x67: 0x67, 0x68: 0x68, 0x69: 0x69, 0x6A: 0x6A,
    0x6B: 0x6B, 0x6C: 0x6C, 0x6D: 0x6D, 0x6E: 0x6E, 0x6F: 0x6F,
    0x70: 0x70, 0x71: 0x71, 0x72: 0x72, 0x73: 0x73, 0x74: 0x74,
    0x75: 0x75, 0x76: 0x76, 0x77: 0x77, 0x78: 0x78, 0x79: 0x79,
    0x7A: 0x7A, 0x7B: 0x7B, 0x7C: 0x7C, 0x7D: 0x7D, 0x7E: 0x7E,
    // Спецсимволы, часто нужные в чеке
    0x2116: 0xFC, // №
    0x00AB: 0xAE, // «
    0x00BB: 0xAF, // »
    0x00A0: 0x20, // NBSP → пробел

    // --- Заглавные кириллические (А–Я) → 0x80–0x9F, 0xA0–0xAF ---
    0x0410: 0x80, 0x0411: 0x81, 0x0412: 0x82, 0x0413: 0x83,
    0x0414: 0x84, 0x0415: 0x85, 0x0401: 0xF0, 0x0416: 0x86,
    0x0417: 0x87, 0x0418: 0x88, 0x0419: 0x89, 0x041A: 0x8A,
    0x041B: 0x8B, 0x041C: 0x8C, 0x041D: 0x8D, 0x041E: 0x8E,
    0x041F: 0x8F, 0x0420: 0x90, 0x0421: 0x91, 0x0422: 0x92,
    0x0423: 0x93, 0x0424: 0x94, 0x0425: 0x95, 0x0426: 0x96,
    0x0427: 0x97, 0x0428: 0x98, 0x0429: 0x99, 0x042A: 0x9A,
    0x042B: 0x9B, 0x042C: 0x9C, 0x042D: 0x9D, 0x042E: 0x9E,
    0x042F: 0x9F,

    // --- Строчные кириллические (а–я) → 0xA0–0xAF, 0xE0–0xEF ---
    0x0430: 0xA0, 0x0431: 0xA1, 0x0432: 0xA2, 0x0433: 0xA3,
    0x0434: 0xA4, 0x0435: 0xA5, 0x0451: 0xF1, 0x0436: 0xA6,
    0x0437: 0xA7, 0x0438: 0xA8, 0x0439: 0xA9, 0x043A: 0xAA,
    0x043B: 0xAB, 0x043C: 0xAC, 0x043D: 0xAD, 0x043E: 0xAE,
    0x043F: 0xAF, 0x0440: 0xE0, 0x0441: 0xE1, 0x0442: 0xE2,
    0x0443: 0xE3, 0x0444: 0xE4, 0x0445: 0xE5, 0x0446: 0xE6,
    0x0447: 0xE7, 0x0448: 0xE8, 0x0449: 0xE9, 0x044A: 0xEA,
    0x044B: 0xEB, 0x044C: 0xEC, 0x044D: 0xED, 0x044E: 0xEE,
    0x044F: 0xEF
};

/**
 * Кодирует строку в массив байтов CP866.
 * Неизвестные символы → '?' (0x3F).
 *
 * @param {string} str
 * @returns {number[]}
 */
export function encodeCp866(str) {
    const bytes = [];
    if (!str) return bytes;

    for (const ch of String(str)) {
        const code = ch.codePointAt(0);
        const mapped = CP866_MAP[code];
        bytes.push(mapped !== undefined ? mapped : 0x3F);
    }
    return bytes;
}

// ============================================================
// Примитивы
// ============================================================

/**
 * Возвращает массив байтов: CP866-строка + LF.
 * @param {string} text
 * @returns {number[]}
 */
function line(text) {
    return [...encodeCp866(text), LF];
}

/**
 * Выравнивает две части в одну строку заданной ширины.
 * Левая — слева, правая — справа, между ними пробелы.
 *
 * @param {string} left
 * @param {string} right
 * @param {number} width — общая ширина в символах
 * @returns {string}
 */
function padBetween(left, right, width) {
    const l = String(left || '');
    const r = String(right || '');
    const space = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(space) + r;
}

/**
 * Обрезает строку до maxLength, добавляя «…», если не влезла.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(str, maxLength) {
    const s = String(str || '');
    if (s.length <= maxLength) return s;
    return s.slice(0, Math.max(0, maxLength - 1)) + '…';
}

/**
 * Разбивает длинную строку на несколько по словам (word-wrap).
 *
 * @param {string} text
 * @param {number} width
 * @returns {string[]}
 */
function wrap(text, width) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        if ((current + ' ' + word).trim().length <= width) {
            current = (current + ' ' + word).trim();
        } else {
            if (current) lines.push(current);
            current = word.length > width ? word.slice(0, width) : word;
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

// ============================================================
// QR-код (опционально)
// ============================================================

let qrLibPromise = null;

/**
 * Ленивая загрузка библиотеки qrcode с CDN.
 * Возвращает Promise<QRCodeLib|null>.
 */
function loadQrLib() {
    if (qrLibPromise) return qrLibPromise;

    qrLibPromise = new Promise((resolve) => {
        if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
            resolve(window.QRCode);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
        script.onload = () => resolve(window.QRCode || null);
        script.onerror = () => {
            console.warn('[escpos] qrcode library not loaded — QR will be skipped');
            resolve(null);
        };
        document.head.appendChild(script);
    });

    return qrLibPromise;
}

/**
 * Генерирует QR в виде монохромного растра (Uint8Array, 1 бит/пиксель, MSB first)
 * через canvas.
 *
 * @param {string} text
 * @param {number} moduleSize — размер одного модуля в точках (рекомендуется 4–8)
 * @returns {Promise<{data: Uint8Array, width: number, height: number}|null>}
 */
async function generateQrRaster(text, moduleSize = 6) {
    const QRCode = await loadQrLib();
    if (!QRCode) return null;

    const canvas = document.createElement('canvas');
    try {
        await QRCode.toCanvas(canvas, text, { margin: 1, width: 200 });
    } catch (e) {
        console.warn('[escpos] QR generation failed:', e);
        return null;
    }

    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;

    // Масштабируем: каждый пиксель QR → moduleSize × moduleSize точек.
    const srcW = canvas.width;
    const srcH = canvas.height;
    const outW = Math.ceil(srcW * moduleSize / 8) * 8;
    const outH = srcH * moduleSize;

    const bytesPerRow = outW / 8;
    const data = new Uint8Array(bytesPerRow * outH);

    for (let y = 0; y < outH; y++) {
        const sy = Math.floor(y / moduleSize);
        for (let x = 0; x < outW; x++) {
            const sx = Math.floor(x / moduleSize);
            const idx = (sy * srcW + sx) * 4;
            const r = px[idx];
            const g = px[idx + 1];
            const b = px[idx + 2];
            const isBlack = (r + g + b) / 3 < 128;

            if (isBlack) {
                const byteIdx = y * bytesPerRow + (x >> 3);
                data[byteIdx] |= 0x80 >> (x & 7);
            }
        }
    }

    return { data, width: outW, height: outH };
}

/**
 * Формирует ESC/POS-команды для печати QR-растра.
 * GS v 0 m xL xH yL yH d1...dk
 *
 * @param {{data: Uint8Array, width: number, height: number}} raster
 * @returns {number[]}
 */
function qrRasterToEscPos(raster) {
    const { data, width, height } = raster;
    const bytesPerRow = width / 8;

    return [
        ...CMD.ALIGN_CENTER,
        GS, 0x76, 0x30, 0x00,
        bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
        height & 0xFF, (height >> 8) & 0xFF,
        ...data
    ];
}

// ============================================================
// Публичный API — построение чека
// ============================================================

/**
 * Собирает полный ESC/POS-чек в Uint8Array.
 *
 * @param {Object} receipt
 * @param {string} [receipt.shopName='Чуланчик']
 * @param {Date|string} [receipt.date]
 * @param {string} [receipt.sellerName]
 * @param {string} [receipt.shiftId] — короткий ID смены (для отображения)
 * @param {string} [receipt.saleId]
 * @param {Array<{name:string, quantity:number, price:number, discount?:number}>} receipt.items
 * @param {number} receipt.total
 * @param {number} [receipt.discount=0] — общая скидка в рублях (для отображения)
 * @param {string} [receipt.paymentMethod='cash']
 * @param {string} [receipt.qrText] — если передан, попытается напечатать QR
 * @param {number} [receipt.paperWidth=32] — 32 (58мм) или 48 (80мм)
 * @returns {Promise<Uint8Array>}
 */
export async function buildReceipt(receipt) {
    const {
        shopName = 'Чуланчик',
        date = new Date(),
        sellerName = '',
        shiftId = '',
        saleId = '',
        items = [],
        total = 0,
        discount = 0,
        paymentMethod = 'cash',
        qrText = '',
        paperWidth = CMD.PAPER_WIDTH_58
    } = receipt;

    const W = paperWidth;
    const out = [];

    // --- Инициализация ---
    out.push(...CMD.INIT);
    out.push(...CMD.CODEPAGE_CP866); // ESC t 17 — CP866 (у большинства Xprinter/GP-серии)

    // --- Шапка ---
    out.push(...CMD.ALIGN_CENTER);
    out.push(...CMD.DOUBLE_ON);
    out.push(...line(shopName));
    out.push(...CMD.DOUBLE_OFF);
    out.push(...line('Комиссионный магазин'));
    out.push(...CMD.ALIGN_LEFT);
    out.push(...line(''.padEnd(W, '-')));

    // --- Мета ---
    const d = date instanceof Date ? date : new Date(date);
    const dateStr = d.toLocaleDateString('ru-RU');
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    out.push(...line(padBetween('Дата:', `${dateStr} ${timeStr}`, W)));
    if (sellerName) {
        out.push(...line(truncate(`Продавец: ${sellerName}`, W)));
    }
    if (shiftId) {
        out.push(...line(`Смена: ${shiftId.slice(0, 8)}`));
    }
    if (saleId) {
        out.push(...line(`Чек: ${saleId.slice(0, 8)}`));
    }
    out.push(...line(''.padEnd(W, '-')));

    // --- Товары ---
    for (const item of items) {
        const nameLines = wrap(item.name || 'Товар', W);
        for (const nl of nameLines) {
            out.push(...line(nl));
        }
        const qty = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const itemDisc = Number(item.discount) || 0;
        const lineTotal = Math.round(price * (1 - itemDisc / 100) * qty);

        const left = `  ${qty} x ${price}${itemDisc ? ` (-${itemDisc}%)` : ''}`;
        out.push(...line(padBetween(left, `${lineTotal}`, W)));
    }

    out.push(...line(''.padEnd(W, '-')));

    // --- Итоги ---
    if (discount > 0) {
        out.push(...line(padBetween('Скидка:', `-${discount}`, W)));
    }

    out.push(...CMD.BOLD_ON);
    out.push(...line(padBetween('ИТОГО:', `${Math.round(total)}`, W)));
    out.push(...CMD.BOLD_OFF);

    const payName = {
        cash: 'Наличные',
        card: 'Карта',
        transfer: 'Перевод',
        qr: 'QR-код'
    }[paymentMethod] || paymentMethod;
    out.push(...line(padBetween('Оплата:', payName, W)));

    out.push(...line(''.padEnd(W, '-')));

    // --- Подвал ---
    out.push(...CMD.ALIGN_CENTER);
    out.push(...line('Спасибо за покупку!'));
    out.push(LF);

    // --- QR ---
    if (qrText) {
        try {
            const raster = await generateQrRaster(qrText, 6);
            if (raster) {
                out.push(...qrRasterToEscPos(raster));
                out.push(LF);
            } else {
                // Фолбэк — печатаем ссылку текстом
                const qrLines = wrap(qrText, W);
                for (const ql of qrLines) out.push(...line(ql));
            }
        } catch (e) {
            console.warn('[escpos] QR build error:', e);
        }
    }

    // --- Завершение ---
    out.push(LF);
    out.push(LF);
    out.push(...CMD.FEED_3);
    out.push(...CMD.CUT);

    return new Uint8Array(out);
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    encodeCp866,
    buildReceipt,
    PAPER_WIDTH_58: CMD.PAPER_WIDTH_58,
    PAPER_WIDTH_80: CMD.PAPER_WIDTH_80
};