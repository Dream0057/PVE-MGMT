const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class ConfigManager {
  constructor() {
    this.configFile = path.join(__dirname, '../config/runtime.json');
    this.config = null;
  }

  // 加载配置
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      this.config = JSON.parse(data);
      logger.info('配置文件加载成功');
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('配置文件不存在，使用默认配置');
        this.config = this.getDefaultConfig();
        await this.saveConfig();
        return this.config;
      }
      logger.error('加载配置文件失败', { error: error.message });
      throw error;
    }
  }

  // 保存配置
  async saveConfig() {
    try {
      const configDir = path.dirname(this.configFile);
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
      logger.info('配置文件保存成功');
    } catch (error) {
      logger.error('保存配置文件失败', { error: error.message });
      throw error;
    }
  }

  // 获取默认配置
  getDefaultConfig() {
    return {
      pve: {
        host: 'YOUR_PVE_IP',
        port: 8006,
        username: 'root@pam',
        password: '',
        node: 'pve',
        timeout: 10000,
        retries: 3
      },
      system: {
        autoApply: true,
        logLevel: 'info',
        enableHttps: false
      },
      lastUpdated: new Date().toISOString()
    };
  }

  // 更新PVE配置
  async updatePVEConfig(pveConfig) {
    if (!this.config) {
      await this.loadConfig();
    }
    
    // 验证必填字段
    const required = ['host', 'username', 'password'];
    for (const field of required) {
      if (!pveConfig[field]) {
        throw new Error(`缺少必填字段: ${field}`);
      }
    }
    
    // 更新配置
    this.config.pve = {
      ...this.config.pve,
      ...pveConfig,
      port: parseInt(pveConfig.port) || 8006,
      timeout: parseInt(pveConfig.timeout) || 10000,
      retries: parseInt(pveConfig.retries) || 3
    };
    
    this.config.lastUpdated = new Date().toISOString();
    await this.saveConfig();
    
    logger.info('PVE配置更新成功', { 
      host: this.config.pve.host,
      username: this.config.pve.username
    });
    
    return this.config.pve;
  }

  // 更新系统配置
  async updateSystemConfig(systemConfig) {
    if (!this.config) {
      await this.loadConfig();
    }
    
    this.config.system = {
      ...this.config.system,
      ...systemConfig
    };
    
    this.config.lastUpdated = new Date().toISOString();
    await this.saveConfig();
    
    logger.info('系统配置更新成功');
    return this.config.system;
  }

  // 获取当前配置
  getCurrentConfig() {
    return this.config;
  }

  // 获取PVE配置
  getPVEConfig() {
    return this.config?.pve || this.getDefaultConfig().pve;
  }

  // 获取系统配置
  getSystemConfig() {
    return this.config?.system || this.getDefaultConfig().system;
  }

  // 验证PVE配置
  validatePVEConfig(config) {
    const errors = [];
    
    if (!config.host) {
      errors.push('PVE主机地址不能为空');
    }
    
    if (!config.username) {
      errors.push('用户名不能为空');
    }
    
    if (!config.password) {
      errors.push('密码不能为空');
    }
    
    const port = parseInt(config.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('端口必须是1-65535之间的数字');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  // 重置配置
  async resetConfig() {
    this.config = this.getDefaultConfig();
    await this.saveConfig();
    logger.info('配置已重置为默认值');
    return this.config;
  }
}

module.exports = ConfigManager;