/**
 * Logger utility para MUGateway
 * Usa winston se disponível, senão console nativo
 */

const fs = require('fs');
const path = require('path');

let winston = null;
try {
    winston = require('winston');
} catch (e) {
    // winston não disponível, usa logger nativo
}

const loggers = new Map();

function createLogger(label, config = {}) {
    const cacheKey = label + JSON.stringify(config);
    
    if (loggers.has(cacheKey)) {
        return loggers.get(cacheKey);
    }
    
    const logDir = config.directory || path.join(__dirname, '..', 'logs');
    const logLevel = config.level || 'info';
    const packetLogDir = config.packetLogDirectory || path.join(logDir, 'packets');
    
    // Garante que diretórios existam
    [logDir, packetLogDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    let logger;
    
    if (winston) {
        const transports = [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        let msg = `${timestamp} [${label}] ${level}: ${message}`;
                        if (Object.keys(meta).length > 0) {
                            msg += ' ' + JSON.stringify(meta);
                        }
                        return msg;
                    })
                )
            })
        ];
        
        if (config.file !== false) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(logDir, `${label.toLowerCase()}.log`),
                    maxsize: parseSize(config.maxSize || '10m'),
                    maxFiles: config.maxFiles || 30,
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    )
                })
            );
        }
        
        logger = winston.createLogger({
            level: logLevel,
            transports,
            defaultMeta: { service: label }
        });
        
        // Logger separado para pacotes
        if (config.packetLog) {
            logger.packetLogger = winston.createLogger({
                level: 'debug',
                transports: [
                    new winston.transports.File({
                        filename: path.join(packetLogDir, `${label.toLowerCase()}-packets.log`),
                        maxsize: parseSize(config.maxSize || '10m'),
                        maxFiles: config.maxFiles || 30,
                        format: winston.format.combine(
                            winston.format.timestamp(),
                            winston.format.json()
                        )
                    })
                ]
            });
        }
    } else {
        // Logger nativo simples
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const currentLevel = levels[logLevel] || 2;
        
        const log = (level, message, meta) => {
            if (levels[level] <= currentLevel) {
                const timestamp = new Date().toISOString();
                const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
                console.log(`${timestamp} [${label}] ${level.toUpperCase()}: ${message}${metaStr}`);
            }
        };
        
        logger = {
            error: (msg, meta) => log('error', msg, meta),
            warn: (msg, meta) => log('warn', msg, meta),
            info: (msg, meta) => log('info', msg, meta),
            debug: (msg, meta) => log('debug', msg, meta),
            log: (level, msg, meta) => log(level, msg, meta)
        };
    }
    
    loggers.set(cacheKey, logger);
    return logger;
}

function parseSize(size) {
    if (typeof size === 'number') return size;
    const match = size.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 10 * 1024 * 1024;
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
        case 'k': return num * 1024;
        case 'm': return num * 1024 * 1024;
        case 'g': return num * 1024 * 1024 * 1024;
        default: return num;
    }
}

module.exports = { createLogger };