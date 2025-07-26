const axios = require('axios');
const https = require('https');
const logger = require('./logger');

class PVEClient {
  constructor(config) {
    this.config = config;
    this.baseURL = `https://${config.host}:${config.port}/api2/json`;
    this.ticket = null;
    this.csrfToken = null;
    this.isConnected = false;
    this.lastError = null;
    
    // 创建axios实例
    this.axios = axios.create({
      timeout: config.timeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // 忽略自签名证书
      })
    });
    
    // 添加请求拦截器
    this.axios.interceptors.request.use(
      (config) => {
        logger.debug('PVE API请求', { url: config.url, method: config.method });
        return config;
      },
      (error) => {
        logger.error('PVE API请求错误', error);
        return Promise.reject(error);
      }
    );
    
    // 添加响应拦截器
    this.axios.interceptors.response.use(
      (response) => {
        logger.debug('PVE API响应', { 
          url: response.config.url, 
          status: response.status,
          dataLength: response.data ? JSON.stringify(response.data).length : 0
        });
        return response;
      },
      (error) => {
        logger.error('PVE API响应错误', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  // 认证方法
  async authenticate() {
    try {
      logger.info('开始PVE认证', { 
        host: this.config.host, 
        username: this.config.username 
      });
      
      const response = await this.axios.post(`${this.baseURL}/access/ticket`, {
        username: this.config.username,
        password: this.config.password
      });

      if (response.data?.data) {
        this.ticket = response.data.data.ticket;
        this.csrfToken = response.data.data.CSRFPreventionToken;
        this.isConnected = true;
        this.lastError = null;
        
        logger.info('PVE认证成功');
        return true;
      }
      
      throw new Error('认证响应格式错误');
    } catch (error) {
      this.isConnected = false;
      this.lastError = error.message;
      
      logger.error('PVE认证失败', { 
        host: this.config.host,
        error: error.message,
        status: error.response?.status
      });
      
      throw new Error(`PVE认证失败: ${error.message}`);
    }
  }

  // 通用API请求方法
  async request(method, endpoint, data = null, retries = null) {
    const maxRetries = retries !== null ? retries : this.config.retries;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 检查认证状态
        if (!this.ticket) {
          await this.authenticate();
        }

        const requestConfig = {
          method,
          url: `${this.baseURL}${endpoint}`,
          headers: {
            'Cookie': `PVEAuthCookie=${this.ticket}`,
            'CSRFPreventionToken': this.csrfToken
          }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
          requestConfig.data = data;
        }

        const response = await this.axios(requestConfig);
        return response.data;
        
      } catch (error) {
        // 如果是认证错误，清除ticket并重试
        if (error.response?.status === 401 && attempt < maxRetries) {
          logger.warn('PVE认证过期，重新认证', { attempt: attempt + 1 });
          this.ticket = null;
          this.csrfToken = null;
          this.isConnected = false;
          continue;
        }
        
        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          logger.error('PVE API请求最终失败', {
            method,
            endpoint,
            attempts: attempt + 1,
            error: error.message
          });
          throw error;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // 测试连接
  async testConnection() {
    try {
      const result = await this.request('GET', '/version');
      return {
        success: true,
        version: result.data?.version,
        release: result.data?.release
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 获取集群状态
  async getClusterStatus() {
    try {
      const result = await this.request('GET', '/cluster/status');
      return result.data || [];
    } catch (error) {
      logger.warn('获取集群状态失败，返回单节点模式');
      return [{
        id: this.config.node,
        name: this.config.node,
        type: 'node',
        online: 1
      }];
    }
  }

  // 获取节点列表
  async getNodes() {
    try {
      const result = await this.request('GET', '/nodes');
      return result.data || [];
    } catch (error) {
      // 如果获取节点列表失败，返回配置的默认节点
      logger.warn('获取节点列表失败，使用默认节点', { node: this.config.node });
      return [{
        node: this.config.node,
        status: 'unknown',
        type: 'node'
      }];
    }
  }

  // 获取指定节点的VM列表
  async getVMs(node) {
    const result = await this.request('GET', `/nodes/${node}/qemu`);
    return result.data || [];
  }

  // 获取VM配置
  async getVMConfig(node, vmid) {
    const result = await this.request('GET', `/nodes/${node}/qemu/${vmid}/config`);
    return result.data || {};
  }

  // 更新VM配置
  async updateVMConfig(node, vmid, config) {
    const result = await this.request('PUT', `/nodes/${node}/qemu/${vmid}/config`, config);
    return result;
  }

  // SDN网络管理
  async getSDNNetworks() {
    try {
      const result = await this.request('GET', '/cluster/sdn/vnets');
      return result.data || [];
    } catch (error) {
      if (error.response?.status === 501 || error.message.includes('not implemented')) {
        throw new Error('SDN功能未启用或不支持，请检查PVE版本(需要7.0+)和SDN配置');
      }
      throw error;
    }
  }

  async createSDNNetwork(vnetData) {
    const result = await this.request('POST', '/cluster/sdn/vnets', vnetData);
    return result;
  }

  async updateSDNNetwork(vnet, vnetData) {
    const result = await this.request('PUT', `/cluster/sdn/vnets/${vnet}`, vnetData);
    return result;
  }

  async deleteSDNNetwork(vnet) {
    const result = await this.request('DELETE', `/cluster/sdn/vnets/${vnet}`);
    return result;
  }

  async applySDNConfig() {
    try {
      const result = await this.request('PUT', '/cluster/sdn');
      return result;
    } catch (error) {
      logger.warn('应用SDN配置失败', { error: error.message });
      throw new Error('应用SDN配置失败，可能需要手动重载');
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      lastError: this.lastError,
      config: {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username
      }
    };
  }
}

module.exports = PVEClient;