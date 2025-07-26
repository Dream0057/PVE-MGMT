// PVE连接配置示例
// 复制此文件为 pve.ts 并填入实际配置

export const pveConfig = {
  // PVE服务器地址
  host: process.env.PVE_HOST || 'YOUR_PVE_SERVER_IP',
  port: parseInt(process.env.PVE_PORT || '8006'),
  
  // PVE认证信息
  username: process.env.PVE_USERNAME || 'YOUR_PVE_USERNAME',
  password: process.env.PVE_PASSWORD || 'YOUR_PVE_PASSWORD', 
  realm: process.env.PVE_REALM || 'pam',
  
  // 连接配置
  timeout: 10000,
  rejectUnauthorized: false, // 开发环境可设为false，生产环境建议设为true
  
  // 重试配置
  retries: 3,
  retryDelay: 1000,
  
  // 缓存配置
  cacheTimeout: 30000,
  
  // 监控配置
  monitorInterval: 30000,
  alertCheckInterval: 120000
};

// 连接池配置
export const connectionPoolConfig = {
  min: 1,
  max: 5,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200,
};

// 默认节点配置
export const defaultNodeConfig = {
  name: 'pve',
  type: 'node',
  status: 'unknown'
};