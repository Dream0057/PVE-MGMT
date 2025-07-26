// 默认配置文件
module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 4001,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },

  // PVE 连接配置
  pve: {
    host: process.env.PVE_HOST || 'YOUR_PVE_IP',
    port: process.env.PVE_PORT || 8006,
    username: process.env.PVE_USERNAME || 'root@pam',
    password: process.env.PVE_PASSWORD || '',
    node: process.env.PVE_NODE || 'pve',
    timeout: parseInt(process.env.PVE_TIMEOUT) || 10000,
    retries: parseInt(process.env.PVE_RETRIES) || 3
  },

  // API配置
  api: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100 // 限制每IP 100请求
    },
    timeout: 30000 // 30秒超时
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/pve-sdn.log',
    console: process.env.LOG_CONSOLE === 'true'
  },

  // 安全配置
  security: {
    enableHttps: process.env.ENABLE_HTTPS === 'true',
    certPath: process.env.SSL_CERT_PATH,
    keyPath: process.env.SSL_KEY_PATH
  }
};