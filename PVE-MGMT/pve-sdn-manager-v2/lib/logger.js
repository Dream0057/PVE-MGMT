const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/default');

// 创建日志目录
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 创建控制台格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ' ' + JSON.stringify(meta);
    }
    return msg;
  })
);

// 配置传输方式
const transports = [
  // 文件日志
  new winston.transports.File({
    filename: config.logging.file,
    level: config.logging.level,
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// 控制台日志
if (config.logging.console || config.server.env === 'development') {
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: consoleFormat
    })
  );
}

// 创建logger实例
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false
});

module.exports = logger;