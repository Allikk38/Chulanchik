// ============================================================
// utils/usbPrinter.js
// ============================================================

/**
 * Работа с ESC/POS-принтером через WebUSB.
 *
 * Прямая реализация (без внешних библиотек):
 *   navigator.usb.requestDevice → device.open → selectConfiguration
 *   → claimInterface → find endpoint OUT → transferOut(bytes).
 *
 * Стратегия подключения:
 *   - При загрузке страницы: tryReconnect() через navigator.usb.getDevices()
 *     (работает только если пользователь ранее дал разрешение).
 *   - Кнопка «Подключить принтер» → connect() → requestDevice.
 *
 * Состояние статуса отдаётся наружу через onStatusChange.
 *
 * @module utils/usbPrinter
 */

import { buildReceipt, PAPER_WIDTH_58, PAPER_WIDTH_80 } from './escpos.js';

// ============================================================
// Состояние
// ============================================================

const state = {
    device: null,
    endpoint: null,
    interfaceNumber: null,
    status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
    error: null
};

const statusListeners = new Set();

// ============================================================
// Проверка поддержки
// ============================================================

/**
 * Доступен ли WebUSB в текущем браузере.
 * @returns {boolean}
 */
export function isWebUsbSupported() {
    return typeof navigator !== 'undefined' && !!navigator.usb;
}

/**
 * Доступен ли WebSerial (фолбэк для Windows, если WebUSB не работает).
 * @returns {boolean}
 */
export function isWebSerialSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
}

/**
 * Хоть какой-то транспорт доступен.
 * @returns {boolean}
 */
export function isSupported() {
    return isWebUsbSupported() || isWebSerialSupported();
}

// ============================================================
// Уведомления о статусе
// ============================================================

/**
 * Подписка на изменение статуса.
 * @param {Function} cb — получает (status, error)
 * @returns {Function} unsubscribe
 */
export function onStatusChange(cb) {
    statusListeners.add(cb);
    cb(state.status, state.error);
    return () => statusListeners.delete(cb);
}

function setStatus(status, error = null) {
    state.status = status;
    state.error = error;
    statusListeners.forEach(cb => {
        try { cb(status, error); } catch (e) { /* ignore */ }
    });
}

/**
 * Текущий статус.
 * @returns {{status: string, error: string|null, deviceName: string|null}}
 */
export function getStatus() {
    return {
        status: state.status,
        error: state.error,
        deviceName: state.device?.productName || null
    };
}

// ============================================================
// WebUSB — низкий уровень
// ============================================================

/**
 * Находит bulk OUT endpoint в текущей конфигурации.
 *
 * @param {USBDevice} device
 * @returns {{interfaceNumber: number, endpointNumber: number}|null}
 */
function findOutEndpoint(device) {
    const config = device.configuration;
    if (!config) return null;

    for (const iface of config.interfaces) {
        for (const alt of iface.alternates) {
            for (const ep of alt.endpoints) {
                // direction: 'out' — принтер принимает данные
                if (ep.direction === 'out' && ep.type === 'bulk') {
                    return {
                        interfaceNumber: iface.interfaceNumber,
                        endpointNumber: ep.endpointNumber
                    };
                }
            }
        }
    }
    return null;
}

/**
 * Открывает устройство и подготавливает endpoint.
 *
 * @param {USBDevice} device
 */
async function openDevice(device) {
    if (device.opened) {
        await device.close();
    }

    await device.open();

    if (device.configuration === null) {
        await device.selectConfiguration(1);
    }

    const ep = findOutEndpoint(device);
    if (!ep) {
        throw new Error('Не найден bulk OUT endpoint — это не ESC/POS-принтер?');
    }

    await device.claimInterface(ep.interfaceNumber);

    state.device = device;
    state.interfaceNumber = ep.interfaceNumber;
    state.endpoint = ep.endpointNumber;
}

/**
 * Закрывает устройство.
 */
async function closeDevice() {
    if (state.device) {
        try {
            if (state.interfaceNumber !== null) {
                await state.device.releaseInterface(state.interfaceNumber);
            }
            await state.device.close();
        } catch (e) {
            console.warn('[usbPrinter] close error:', e);
        }
    }
    state.device = null;
    state.endpoint = null;
    state.interfaceNumber = null;
}

// ============================================================
// Публичное подключение
// ============================================================

/**
 * Пытается восстановить подключение к ранее разрешённому устройству.
 * Не показывает диалог.
 *
 * @returns {Promise<boolean>}
 */
export async function tryReconnect() {
    if (!isWebUsbSupported()) {
        console.log('[usbPrinter] WebUSB not supported — skip reconnect');
        return false;
    }

    try {
        const devices = await navigator.usb.getDevices();
        if (!devices || devices.length === 0) {
            console.log('[usbPrinter] no previously authorized devices');
            setStatus('disconnected');
            return false;
        }

        // Берём первое — предполагаем, что пользователь разрешил один принтер.
        const device = devices[0];
        setStatus('connecting');
        await openDevice(device);
        setStatus('connected');
        console.log('[usbPrinter] reconnected to:', device.productName || 'unknown');
        return true;

    } catch (err) {
        console.warn('[usbPrinter] tryReconnect failed:', err);
        setStatus('error', err.message);
        return false;
    }
}

/**
 * Показывает диалог выбора устройства и подключается.
 * Должно вызываться из обработчика клика (требование браузера).
 *
 * @returns {Promise<boolean>}
 */
export async function connect() {
    if (!isWebUsbSupported()) {
        const msg = 'WebUSB не поддерживается в этом браузере. Используйте Chrome/Edge на десктопе.';
        setStatus('error', msg);
        return false;
    }

    setStatus('connecting');

    try {
        const device = await navigator.usb.requestDevice({
            filters: [
                // Класс 7 — принтеры. Покрывает Xprinter, Rongta, Epson и др.
                { classCode: 7 }
            ]
        });

        await openDevice(device);
        setStatus('connected');
        console.log('[usbPrinter] connected:', device.productName || 'unknown');
        return true;

    } catch (err) {
        if (err && err.name === 'NotFoundError') {
            // Пользователь закрыл диалог
            console.log('[usbPrinter] user cancelled device selection');
            setStatus('disconnected');
        } else {
            console.error('[usbPrinter] connect failed:', err);
            setStatus('error', err.message || String(err));
        }
        return false;
    }
}

/**
 * Отключает принтер (закрывает устройство).
 * Разрешение пользователя в браузере остаётся — при следующем tryReconnect
 * можно будет переподключиться без диалога.
 */
export async function disconnect() {
    await closeDevice();
    setStatus('disconnected');
}

// ============================================================
// Печать
// ============================================================

/**
 * Отправляет сырые байты на принтер.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<void>}
 */
async function write(bytes) {
    if (!state.device || state.endpoint === null) {
        throw new Error('Принтер не подключён');
    }

    // Разбиваем на чанки по 64 байта (типичный размер пакета WebUSB)
    const CHUNK = 4096; // крупные чанки обычно быстрее, но некоторые принтеры любят 64
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.slice(i, i + CHUNK);
        await state.device.transferOut(state.endpoint, chunk);
    }
}

/**
 * Печатает чек. Не бросает исключений наружу — возвращает
 * {success, error}, чтобы вызывающий код мог решить, что делать.
 *
 * @param {Object} receiptData — см. buildReceipt
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function printReceipt(receiptData) {
    if (!state.device) {
        // Пробуем восстановить соединение
        const ok = await tryReconnect();
        if (!ok) {
            return { success: false, error: 'Принтер не подключён' };
        }
    }

    try {
        const bytes = await buildReceipt({
            ...receiptData,
            paperWidth: receiptData.paperWidth || PAPER_WIDTH_58
        });
        await write(bytes);
        console.log('[usbPrinter] receipt printed, bytes:', bytes.length);
        return { success: true };

    } catch (err) {
        console.error('[usbPrinter] print failed:', err);

        // Потеря соединения?
        if (err.name === 'NetworkError' || err.name === 'NotFoundError') {
            await closeDevice();
            setStatus('error', 'Принтер отключён во время печати');
        }
        return { success: false, error: err.message || String(err) };
    }
}

// ============================================================
// Экспорт по умолчанию
// ============================================================

export default {
    isSupported,
    isWebUsbSupported,
    isWebSerialSupported,
    onStatusChange,
    getStatus,
    tryReconnect,
    connect,
    disconnect,
    printReceipt,
    PAPER_WIDTH_58,
    PAPER_WIDTH_80
};