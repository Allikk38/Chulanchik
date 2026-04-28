// ========================================
// ФАЙЛ: utils/logger.js
// ========================================

/**
 * Logger — централизованное логирование
 * 
 * Уровни: DEBUG, INFO, WARN, ERROR.
 * В production DEBUG отключен.
 * 
 * @module utils/logger
 * @version 1.1.0
 */

const ENV = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('.local')) {
        return 'development';
    }
    return 'production';
})();

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
const MIN_LEVEL = ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

const logBuffer = [];
const MAX_BUFFER_SIZE = 50;

function formatTimestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

function getSymbol(level) {
    switch (level) {
        case LOG_LEVELS.DEBUG: return '🔍';
        case LOG_LEVELS.INFO: return 'ℹ️';
        case LOG_LEVELS.WARN: return '⚠️';
        case LOG_LEVELS.ERROR: return '❌';
        default: return '📝';
    }
}

function bufferLog(namespace, level, args) {
    if (level < LOG_LEVELS.WARN) return;
    logBuffer.push({
        timestamp: new Date().toISOString(),
        namespace,
        message: args.map(a => a instanceof Error ? a.message : String(a))
    });
    if (logBuffer.length > MAX_BUFFER_SIZE) logBuffer.shift();
}

export function createLogger(namespace) {
    if (!namespace) throw new Error('Logger: namespace is required');

    return {
        debug(...args) {
            if (MIN_LEVEL <= LOG_LEVELS.DEBUG) {
                console.debug(`[${formatTimestamp()}] ${getSymbol(LOG_LEVELS.DEBUG)} [${namespace}]`, ...args);
            }
        },
        info(...args) {
            if (MIN_LEVEL <= LOG_LEVELS.INFO) {
                console.info(`[${formatTimestamp()}] ${getSymbol(LOG_LEVELS.INFO)} [${namespace}]`, ...args);
            }
        },
        warn(...args) {
            if (MIN_LEVEL <= LOG_LEVELS.WARN) {
                console.warn(`[${formatTimestamp()}] ${getSymbol(LOG_LEVELS.WARN)} [${namespace}]`, ...args);
                bufferLog(namespace, LOG_LEVELS.WARN, args);
            }
        },
        error(...args) {
            if (MIN_LEVEL <= LOG_LEVELS.ERROR) {
                console.error(`[${formatTimestamp()}] ${getSymbol(LOG_LEVELS.ERROR)} [${namespace}]`, ...args);
                bufferLog(namespace, LOG_LEVELS.ERROR, args);
            }
        },
        time(label) {
            if (MIN_LEVEL <= LOG_LEVELS.DEBUG && console.time) {
                console.time(`[${namespace}] ${label}`);
            }
        },
        timeEnd(label) {
            if (MIN_LEVEL <= LOG_LEVELS.DEBUG && console.timeEnd) {
                console.timeEnd(`[${namespace}] ${label}`);
            }
        }
    };
}

export const logger = createLogger('Chulanchik');

export default logger;

console.log('[Logger] Module loaded');
