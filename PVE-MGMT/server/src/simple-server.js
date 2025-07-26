const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const https = require('https');
const TrafficMonitorDB = require('./traffic-monitor-db');
const database = require('./db/database');

const app = express();
const server = createServer(app);
// 动态构建允许的源列表
const CLIENT_PORT = process.env.CLIENT_PORT || '5173';
const allowedOrigins = [
  `http://localhost:${CLIENT_PORT}`,
  `http://127.0.0.1:${CLIENT_PORT}`,
];

// 添加环境变量中指定的客户端URL
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

// 如果配置了API_HOST，添加对应的客户端访问地址
if (process.env.API_HOST && process.env.API_HOST !== 'localhost') {
  allowedOrigins.push(`http://${process.env.API_HOST}:${CLIENT_PORT}`);
}

// 处理自定义的ALLOWED_ORIGINS
if (process.env.ALLOWED_ORIGINS) {
  const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  allowedOrigins.push(...customOrigins);
}

// 在开发环境下，允许任何本地网络的访问
if (process.env.NODE_ENV === 'development') {
  // 允许局域网内的所有IP访问
  allowedOrigins.push(new RegExp(`^http:\\/\\/192\\.168\\.\\d+\\.\\d+:${CLIENT_PORT}$`));
  allowedOrigins.push(new RegExp(`^http:\\/\\/10\\.\\d+\\.\\d+\\.\\d+:${CLIENT_PORT}$`));
  allowedOrigins.push(new RegExp(`^http:\\/\\/172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+:${CLIENT_PORT}$`));
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || '3000', 10);
const HOST = process.env.SERVER_HOST || '0.0.0.0';

// 内存存储
let connections = new Map();
let vms = [];
let nodes = [];

// 流量监控实例 - 延迟初始化
let trafficMonitor = null;

// 中间件
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// 从数据库加载连接
async function loadConnectionsFromDatabase() {
  try {
    const dbConnections = await database.query('SELECT * FROM pve_connections');
    console.log(`从数据库加载了 ${dbConnections.length} 个连接`);
    
    for (const dbConn of dbConnections) {
      const config = {
        host: dbConn.host,
        port: dbConn.port,
        username: dbConn.username,
        password: dbConn.password,
        realm: dbConn.realm,
        ssl: dbConn.ssl === 1
      };
      
      const client = new SimplePVEClient(config);
      
      const connection = {
        id: dbConn.id,
        name: dbConn.name,
        config,
        client,
        status: dbConn.status || 'disconnected',
        lastConnected: dbConn.last_connected,
        lastError: dbConn.last_error
      };
      
      connections.set(dbConn.id, connection);
      console.log(`已加载连接: ${dbConn.name} (${dbConn.id})`);
    }
  } catch (error) {
    console.error('从数据库加载连接失败:', error.message);
  }
}

// 简化的PVE API客户端
class SimplePVEClient {
  constructor(config) {
    this.config = config;
    this.ticket = null;
    this.client = axios.create({
      baseURL: `${config.ssl ? 'https' : 'http'}://${config.host}:${config.port}/api2/json`,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  async authenticate() {
    try {
      const response = await this.client.post('/access/ticket', {
        username: `${this.config.username}@${this.config.realm}`,
        password: this.config.password
      });
      this.ticket = response.data.data;
      return this.ticket;
    } catch (error) {
      throw new Error(`PVE认证失败: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      await this.authenticate();
      await this.client.get('/version', {
        headers: {
          'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
          'CSRFPreventionToken': this.ticket.CSRFPreventionToken
        }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getNodes() {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.get('/nodes', {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  async getVMs() {
    if (!this.ticket) await this.authenticate();
    const nodeList = await this.getNodes();
    const allVMs = [];
    
    for (const node of nodeList) {
      try {
        // 获取QEMU虚拟机
        const qemuResponse = await this.client.get(`/nodes/${node.node}/qemu`, {
          headers: {
            'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
            'CSRFPreventionToken': this.ticket.CSRFPreventionToken
          }
        });
        const qemuVMs = qemuResponse.data.data.map(vm => ({
          ...vm,
          node: node.node,
          type: 'qemu'
        }));
        
        // 获取LXC容器
        const lxcResponse = await this.client.get(`/nodes/${node.node}/lxc`, {
          headers: {
            'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
            'CSRFPreventionToken': this.ticket.CSRFPreventionToken
          }
        });
        const lxcVMs = lxcResponse.data.data.map(vm => ({
          ...vm,
          node: node.node,
          type: 'lxc'
        }));
        
        allVMs.push(...qemuVMs, ...lxcVMs);
      } catch (error) {
        console.error(`获取节点 ${node.node} 的虚拟机失败:`, error.message);
      }
    }
    
    return allVMs;
  }

  async startVM(node, vmid, type) {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/start`, {}, {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  async stopVM(node, vmid, type) {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/stop`, {}, {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  async shutdownVM(node, vmid, type) {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/shutdown`, {}, {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  // 获取虚拟机网络统计数据
  async getVMNetworkStats(node, vmid, type) {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/status/current`, {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  // 获取虚拟机RRD数据(包含历史网络流量)
  async getVMRRDData(node, vmid, type, timeframe = 'hour') {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/rrddata`, {
      params: { timeframe },
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }

  // 获取虚拟机配置信息
  async getVMConfig(node, vmid, type) {
    if (!this.ticket) await this.authenticate();
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/config`, {
      headers: {
        'Cookie': `PVEAuthCookie=${this.ticket.ticket}`,
        'CSRFPreventionToken': this.ticket.CSRFPreventionToken
      }
    });
    return response.data.data;
  }
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: {
      total: connections.size,
      connected: Array.from(connections.values()).filter(conn => conn.status === 'connected').length
    }
  });
});

// 获取所有连接
app.get('/api/pve/connections', (req, res) => {
  const connectionList = Array.from(connections.values()).map(conn => ({
    id: conn.id,
    name: conn.name,
    status: conn.status,
    lastConnected: conn.lastConnected,
    lastError: conn.lastError,
    host: conn.config.host,
    port: conn.config.port
  }));
  res.json(connectionList);
});

// 添加PVE连接
app.post('/api/pve/connections', async (req, res) => {
  try {
    const { id, name, host, port, username, password, realm, ssl } = req.body;
    
    if (!id || !name || !host || !username || !password) {
      return res.status(400).json({ 
        error: '缺少必需参数: id, name, host, username, password' 
      });
    }

    const config = {
      host,
      port: port || 8006,
      username,
      password,
      realm: realm || 'pam',
      ssl: ssl !== undefined ? ssl : true
    };

    const client = new SimplePVEClient(config);
    const isConnected = await client.testConnection();
    
    const connection = {
      id,
      name,
      config,
      client,
      status: isConnected ? 'connected' : 'error',
      lastConnected: isConnected ? new Date().toISOString() : undefined,
      lastError: isConnected ? undefined : '连接测试失败'
    };

    connections.set(id, connection);
    
    // 同时保存到数据库
    try {
      await database.run(`
        INSERT OR REPLACE INTO pve_connections 
        (id, name, host, port, username, password, realm, ssl, status, last_connected, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        id,
        name,
        config.host,
        config.port,
        config.username,
        config.password,
        config.realm,
        config.ssl ? 1 : 0,
        connection.status,
        connection.lastConnected,
        connection.lastError
      ]);
      console.log(`连接 ${name} (${id}) 已保存到数据库`);
    } catch (dbError) {
      console.error(`保存连接到数据库失败:`, dbError.message);
      // 不影响主要流程，只记录错误
    }
    
    res.json({ 
      success: true, 
      message: `连接 ${name} 添加成功`,
      id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除PVE连接
app.delete('/api/pve/connections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = connections.delete(id);
    
    if (success) {
      // 从数据库删除连接 (CASCADE会自动删除相关流量数据)
      try {
        await database.run('DELETE FROM pve_connections WHERE id = ?', [id]);
        console.log(`连接 ${id} 已从数据库删除`);
      } catch (dbError) {
        console.error(`从数据库删除连接失败:`, dbError.message);
      }
      
      // 清理相关的流量监控数据
      if (trafficMonitor) {
        try {
          const cleanupResult = await trafficMonitor.cleanupConnectionData(id);
          console.log(`清理连接 ${id} 的流量数据: ${cleanupResult.deleted} 条记录`);
        } catch (cleanupError) {
          console.error(`清理连接 ${id} 的流量数据失败:`, cleanupError.message);
        }
      }
      
      // 广播连接删除事件，让前端刷新所有相关数据
      io.emit('connection-deleted', { connectionId: id });
      
      // 立即刷新并广播更新的虚拟机和节点列表
      try {
        // 获取更新后的虚拟机列表
        const allVMs = [];
        for (const [connectionId, connection] of connections) {
          if (connection.status === 'connected') {
            try {
              const vms = await connection.client.getVMs();
              allVMs.push(...vms.map(vm => ({
                ...vm,
                connectionId,
                connectionName: connection.name
              })));
            } catch (error) {
              console.error(`获取连接 ${connectionId} 的虚拟机失败:`, error.message);
            }
          }
        }
        io.emit('vms', allVMs);
        
        // 获取更新后的节点列表
        const allNodes = [];
        for (const [connectionId, connection] of connections) {
          if (connection.status === 'connected') {
            try {
              const nodes = await connection.client.getNodes();
              allNodes.push(...nodes.map(node => ({
                ...node,
                connectionId,
                connectionName: connection.name
              })));
            } catch (error) {
              console.error(`获取连接 ${connectionId} 的节点失败:`, error.message);
            }
          }
        }
        io.emit('nodes', allNodes);
        
        // 广播更新的流量数据
        if (trafficMonitor) {
          const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic();
          const dailyTraffic = await trafficMonitor.getAllDailyTraffic();
          io.emit('traffic-update', {
            hourly: hourlyTraffic,
            daily: dailyTraffic,
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (error) {
        console.error('广播删除连接后的数据更新失败:', error.message);
      }
      
      res.json({ success: true, message: `连接 ${id} 删除成功，相关数据已清理` });
    } else {
      res.status(404).json({ error: `连接 ${id} 不存在` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 测试PVE连接
app.post('/api/pve/connections/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = connections.get(id);
    
    if (!connection) {
      return res.status(404).json({ error: `连接 ${id} 不存在` });
    }

    const success = await connection.client.testConnection();
    connection.status = success ? 'connected' : 'error';
    connection.lastConnected = success ? new Date().toISOString() : connection.lastConnected;
    connection.lastError = success ? undefined : '连接测试失败';
    
    res.json({ 
      success, 
      message: success ? '连接测试成功' : '连接测试失败' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有虚拟机
app.get('/api/pve/vms', async (req, res) => {
  try {
    const allVMs = [];
    
    for (const [connectionId, connection] of connections) {
      if (connection.status === 'connected') {
        try {
          const vms = await connection.client.getVMs();
          allVMs.push(...vms.map(vm => ({
            ...vm,
            connectionId: connectionId,
            connectionName: connection.name
          })));
        } catch (error) {
          console.error(`获取连接 ${connectionId} 的虚拟机失败:`, error.message);
        }
      }
    }
    
    res.json(allVMs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有节点
app.get('/api/pve/nodes', async (req, res) => {
  try {
    const allNodes = [];
    
    for (const [connectionId, connection] of connections) {
      if (connection.status === 'connected') {
        try {
          const nodes = await connection.client.getNodes();
          allNodes.push(...nodes.map(node => ({
            ...node,
            connectionId: connectionId,
            connectionName: connection.name
          })));
        } catch (error) {
          console.error(`获取连接 ${connectionId} 的节点失败:`, error.message);
        }
      }
    }
    
    res.json(allNodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// VM操作
app.post('/api/pve/connections/:id/vms/:vmid/:action', async (req, res) => {
  try {
    const { id, vmid, action } = req.params;
    const { node, type } = req.body;
    
    if (!node || !type) {
      return res.status(400).json({ error: '缺少参数: node, type' });
    }

    const connection = connections.get(id);
    if (!connection) {
      return res.status(404).json({ error: `连接 ${id} 不存在` });
    }

    let taskId;
    switch (action) {
      case 'start':
        taskId = await connection.client.startVM(node, parseInt(vmid), type);
        break;
      case 'stop':
        taskId = await connection.client.stopVM(node, parseInt(vmid), type);
        break;
      case 'shutdown':
        taskId = await connection.client.shutdownVM(node, parseInt(vmid), type);
        break;
      default:
        return res.status(400).json({ error: `不支持的操作: ${action}` });
    }
    
    res.json({ taskId, message: `${action}命令已发送` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 流量监控API
// 获取所有虚拟机当前小时流量统计
app.get('/api/pve/traffic/hourly', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const { hour } = req.query;
    const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic(hour);
    res.json(hourlyTraffic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有虚拟机当前日流量统计
app.get('/api/pve/traffic/daily', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const { day } = req.query;
    const dailyTraffic = await trafficMonitor.getAllDailyTraffic(day);
    res.json(dailyTraffic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取指定虚拟机的流量历史
app.get('/api/pve/connections/:id/vms/:vmid/traffic/history', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const { id, vmid } = req.params;
    const { node, hours = 24 } = req.query;
    
    if (!node) {
      return res.status(400).json({ error: '缺少参数: node' });
    }

    const history = await trafficMonitor.getVMTrafficHistory(id, node, parseInt(vmid), parseInt(hours));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取指定虚拟机的当前流量统计
app.get('/api/pve/connections/:id/vms/:vmid/traffic/current', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const { id, vmid } = req.params;
    const { node } = req.query;
    
    if (!node) {
      return res.status(400).json({ error: '缺少参数: node' });
    }

    const current = await trafficMonitor.getVMCurrentTraffic(id, node, parseInt(vmid));
    const hourly = await trafficMonitor.getVMHourlyTraffic(id, node, parseInt(vmid));
    const daily = await trafficMonitor.getVMDailyTraffic(id, node, parseInt(vmid));

    res.json({
      current: current || null,
      hourly: hourly || null,
      daily: daily || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取流量监控统计摘要
app.get('/api/pve/traffic/stats', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const stats = await trafficMonitor.getStatsSummary();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 清理无效的流量数据
app.post('/api/pve/traffic/cleanup', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    // 获取当前所有活跃的虚拟机
    const activeVMs = [];
    
    for (const [connectionId, connection] of connections) {
      if (connection.status === 'connected') {
        try {
          const nodes = await connection.client.getNodes();
          for (const node of nodes) {
            const vms = await connection.client.getVMs(node.node);
            for (const vm of vms) {
              activeVMs.push({
                connectionId,
                node: node.node,
                vmid: vm.vmid
              });
            }
          }
        } catch (error) {
          console.error(`获取连接 ${connectionId} 的虚拟机失败:`, error.message);
        }
      }
    }

    const cleanupResult = await trafficMonitor.cleanupOrphanedData(activeVMs);
    
    // 广播流量数据更新
    const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic();
    const dailyTraffic = await trafficMonitor.getAllDailyTraffic();
    io.emit('traffic-update', {
      hourly: hourlyTraffic,
      daily: dailyTraffic,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: '无效数据清理完成',
      activeVMs: activeVMs.length,
      ...cleanupResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 清理所有流量数据
app.post('/api/pve/traffic/cleanup-all', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    const cleanupResult = await trafficMonitor.cleanupAllData();
    
    // 广播流量数据更新
    const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic();
    const dailyTraffic = await trafficMonitor.getAllDailyTraffic();
    io.emit('traffic-update', {
      hourly: hourlyTraffic,
      daily: dailyTraffic,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: '所有流量数据已清理',
      ...cleanupResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 测试API：获取当前数据状态
app.get('/api/pve/debug/status', async (req, res) => {
  try {
    const stats = {
      connections: Array.from(connections.entries()).map(([id, conn]) => ({
        id,
        name: conn.name,
        status: conn.status
      })),
      trafficStats: trafficMonitor ? await trafficMonitor.getStatsSummary() : null
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 获取虚拟机每小时流量详细记录
app.get('/api/pve/traffic/vm-hourly', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    
    const { connectionId, startDate, endDate } = req.query;
    const vmHourlyRecords = await trafficMonitor.getVMHourlyRecords(connectionId, startDate, endDate);
    res.json(vmHourlyRecords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取虚拟机每日流量详细记录  
app.get('/api/pve/traffic/vm-daily', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    
    const { connectionId, startDate, endDate } = req.query;
    const vmDailyRecords = await trafficMonitor.getVMDailyRecords(connectionId, startDate, endDate);
    res.json(vmDailyRecords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 手动触发流量收集
app.post('/api/pve/traffic/collect', async (req, res) => {
  try {
    if (!trafficMonitor) {
      return res.status(503).json({ error: '流量监控系统未就绪' });
    }
    let collectedCount = 0;
    const results = [];

    for (const [connectionId, connection] of connections) {
      if (connection.status === 'connected') {
        try {
          const vms = await connection.client.getVMs();
          for (const vm of vms) {
            if (vm.status === 'running') {
              const trafficData = await trafficMonitor.collectVMTraffic(connection, vm);
              if (trafficData) {
                results.push({
                  vmid: vm.vmid,
                  name: vm.name,
                  node: vm.node,
                  hourlyTotal: trafficData.hourStats ? trafficMonitor.formatBytes(trafficData.hourStats.total || 0) : '0 B',
                  dailyTotal: trafficData.dayStats ? trafficMonitor.formatBytes(trafficData.dayStats.total || 0) : '0 B'
                });
                collectedCount++;
              }
            }
          }
        } catch (error) {
          console.error(`收集连接 ${connectionId} 流量数据失败:`, error.message);
        }
      }
    }

    res.json({
      success: true,
      message: `成功收集 ${collectedCount} 台虚拟机的流量数据`,
      collectedCount,
      results: results.slice(0, 10) // 只返回前10个结果作为示例
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket处理
io.on('connection', (socket) => {
  console.log(`WebSocket客户端连接: ${socket.id}`);

  socket.emit('connection-stats', {
    total: connections.size,
    connected: Array.from(connections.values()).filter(conn => conn.status === 'connected').length
  });

  socket.on('get-connections', () => {
    const connectionList = Array.from(connections.values()).map(conn => ({
      id: conn.id,
      name: conn.name,
      status: conn.status,
      lastConnected: conn.lastConnected,
      lastError: conn.lastError
    }));
    socket.emit('connections', connectionList);
  });

  socket.on('get-vms', async () => {
    try {
      const allVMs = [];
      for (const [connectionId, connection] of connections) {
        if (connection.status === 'connected') {
          try {
            const vms = await connection.client.getVMs();
            allVMs.push(...vms.map(vm => ({
              ...vm,
              connectionId: connectionId,
              connectionName: connection.name
            })));
          } catch (error) {
            console.error(`获取连接 ${connectionId} 的虚拟机失败:`, error.message);
          }
        }
      }
      socket.emit('vms', allVMs);
    } catch (error) {
      socket.emit('error', { message: error.message, type: 'get-vms' });
    }
  });

  socket.on('get-nodes', async () => {
    try {
      const allNodes = [];
      for (const [connectionId, connection] of connections) {
        if (connection.status === 'connected') {
          try {
            const nodes = await connection.client.getNodes();
            allNodes.push(...nodes.map(node => ({
              ...node,
              connectionId: connectionId,
              connectionName: connection.name
            })));
          } catch (error) {
            console.error(`获取连接 ${connectionId} 的节点失败:`, error.message);
          }
        }
      }
      socket.emit('nodes', allNodes);
    } catch (error) {
      socket.emit('error', { message: error.message, type: 'get-nodes' });
    }
  });

  socket.on('vm-action', async (data) => {
    try {
      const { connectionId, vmid, node, type, action } = data;
      const connection = connections.get(connectionId);
      
      if (!connection) {
        throw new Error(`连接 ${connectionId} 不存在`);
      }

      let result;
      switch (action) {
        case 'start':
          result = await connection.client.startVM(node, vmid, type);
          break;
        case 'stop':
          result = await connection.client.stopVM(node, vmid, type);
          break;
        case 'shutdown':
          result = await connection.client.shutdownVM(node, vmid, type);
          break;
        default:
          throw new Error(`不支持的操作: ${action}`);
      }

      socket.emit('vm-action-result', {
        success: true,
        taskId: result,
        action,
        vmid,
        message: `${action}命令已发送`
      });
    } catch (error) {
      socket.emit('vm-action-result', {
        success: false,
        error: error.message,
        action: data.action,
        vmid: data.vmid
      });
    }
  });

  // 流量监控事件
  socket.on('get-traffic-hourly', async (data) => {
    try {
      if (!trafficMonitor) {
        return socket.emit('error', { message: '流量监控系统未就绪', type: 'get-traffic-hourly' });
      }
      const { hour } = data || {};
      const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic(hour);
      socket.emit('traffic-hourly', hourlyTraffic);
    } catch (error) {
      socket.emit('error', { message: error.message, type: 'get-traffic-hourly' });
    }
  });

  socket.on('get-traffic-daily', async (data) => {
    try {
      if (!trafficMonitor) {
        return socket.emit('error', { message: '流量监控系统未就绪', type: 'get-traffic-daily' });
      }
      const { day } = data || {};
      const dailyTraffic = await trafficMonitor.getAllDailyTraffic(day);
      socket.emit('traffic-daily', dailyTraffic);
    } catch (error) {
      socket.emit('error', { message: error.message, type: 'get-traffic-daily' });
    }
  });

  socket.on('get-vm-traffic', async (data) => {
    try {
      if (!trafficMonitor) {
        return socket.emit('error', { message: '流量监控系统未就绪', type: 'get-vm-traffic' });
      }
      const { connectionId, node, vmid, hours = 24 } = data;
      
      const current = await trafficMonitor.getVMCurrentTraffic(connectionId, node, vmid);
      const hourly = await trafficMonitor.getVMHourlyTraffic(connectionId, node, vmid);
      const daily = await trafficMonitor.getVMDailyTraffic(connectionId, node, vmid);
      const history = await trafficMonitor.getVMTrafficHistory(connectionId, node, vmid, hours);

      socket.emit('vm-traffic', {
        vmid,
        current: current || null,
        hourly: hourly || null,
        daily: daily || null,
        history
      });
    } catch (error) {
      socket.emit('error', { message: error.message, type: 'get-vm-traffic' });
    }
  });

  socket.on('collect-traffic', async () => {
    try {
      if (!trafficMonitor) {
        return socket.emit('error', { message: '流量监控系统未就绪', type: 'collect-traffic' });
      }
      let collectedCount = 0;
      for (const [connectionId, connection] of connections) {
        if (connection.status === 'connected') {
          try {
            const vms = await connection.client.getVMs();
            for (const vm of vms) {
              if (vm.status === 'running') {
                const trafficData = await trafficMonitor.collectVMTraffic(connection, vm);
                if (trafficData) {
                  collectedCount++;
                }
              }
            }
          } catch (error) {
            console.error(`收集连接 ${connectionId} 流量数据失败:`, error.message);
          }
        }
      }

      socket.emit('traffic-collected', {
        success: true,
        collectedCount,
        timestamp: new Date().toISOString()
      });

      // 广播更新的流量数据
      if (trafficMonitor) {
        const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic();
        const dailyTraffic = await trafficMonitor.getAllDailyTraffic();
        
        io.emit('traffic-update', {
          hourly: hourlyTraffic,
          daily: dailyTraffic,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      socket.emit('error', { message: error.message, type: 'collect-traffic' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`WebSocket客户端断开: ${socket.id}`);
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// 启动服务器
server.listen(PORT, HOST, async () => {
  console.log(`PVE Manager服务器启动成功`);
  console.log(`监听地址: ${HOST}:${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.API_HOST) {
    console.log(`外部访问地址: http://${process.env.API_HOST}:${PORT}`);
  }
  
  // 等待数据库就绪后初始化流量监控
  if (database.isReady) {
    try {
      trafficMonitor = new TrafficMonitorDB();
      console.log('流量监控系统已启动');
    } catch (error) {
      console.error('流量监控系统启动失败:', error.message);
    }
  } else {
    database.once('ready', () => {
      setTimeout(async () => {
        try {
          trafficMonitor = new TrafficMonitorDB();
          console.log('流量监控系统已启动');
          
          // 从数据库加载现有连接
          await loadConnectionsFromDatabase();
        } catch (error) {
          console.error('流量监控系统启动失败:', error.message);
        }
      }, 1000); // 增加延迟确保表完全创建
    });
  }
  
  // 启动定时流量收集任务 (每30秒收集一次确保数据实时性)
  const trafficCollectionInterval = setInterval(async () => {
    try {
      if (!trafficMonitor) {
        return; // 流量监控未就绪，跳过此次收集
      }
      
      let collectedCount = 0;
      console.log('开始定时流量收集...');
      
      // 首先收集当前活跃的虚拟机列表
      const activeVMs = [];
      
      for (const [connectionId, connection] of connections) {
        if (connection.status === 'connected') {
          try {
            const vms = await connection.client.getVMs();
            for (const vm of vms) {
              if (vm.status === 'running') {
                const trafficData = await trafficMonitor.collectVMTraffic(connection, vm);
                if (trafficData) {
                  collectedCount++;
                }
                
                // 记录活跃的VM
                activeVMs.push({
                  connectionId,
                  node: vm.node,
                  vmid: vm.vmid
                });
              }
            }
          } catch (error) {
            console.error(`收集连接 ${connectionId} 流量数据失败:`, error.message);
          }
        }
      }
      
      // 每小时清理一次无效数据（当分钟数为0时）
      const now = new Date();
      if (now.getMinutes() === 0 && trafficMonitor) {
        try {
          const cleanupResult = await trafficMonitor.cleanupOrphanedData(activeVMs);
          if (cleanupResult.deleted > 0) {
            console.log(`清理了 ${cleanupResult.deleted} 条无效流量记录`);
          }
        } catch (error) {
          console.error('清理无效流量数据失败:', error.message);
        }
      }
      
      if (collectedCount > 0 && trafficMonitor) {
        console.log(`定时流量收集完成，收集了 ${collectedCount} 台虚拟机的数据`);
        
        // 广播流量更新
        const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic();
        const dailyTraffic = await trafficMonitor.getAllDailyTraffic();
        
        io.emit('traffic-update', {
          hourly: hourlyTraffic,
          daily: dailyTraffic,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('定时流量收集失败:', error.message);
    }
  }, 30 * 1000); // 30秒

  // 每天清理一次旧数据 (保留30天)
  const cleanupInterval = setInterval(async () => {
    try {
      if (trafficMonitor) {
        await trafficMonitor.cleanupOldData(30);
      }
    } catch (error) {
      console.error('清理旧流量数据失败:', error.message);
    }
  }, 24 * 60 * 60 * 1000); // 24小时

  // 保存定时器引用，便于优雅关闭时清理
  global.trafficCollectionInterval = trafficCollectionInterval;
  global.cleanupInterval = cleanupInterval;
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，开始优雅关闭...');
  
  // 清理定时器
  if (global.trafficCollectionInterval) {
    clearInterval(global.trafficCollectionInterval);
    console.log('流量收集定时器已清理');
  }
  if (global.cleanupInterval) {
    clearInterval(global.cleanupInterval);
    console.log('数据清理定时器已清理');
  }
  
  server.close(() => {
    console.log('HTTP服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，开始优雅关闭...');
  
  // 清理定时器
  if (global.trafficCollectionInterval) {
    clearInterval(global.trafficCollectionInterval);
    console.log('流量收集定时器已清理');
  }
  if (global.cleanupInterval) {
    clearInterval(global.cleanupInterval);
    console.log('数据清理定时器已清理');
  }
  
  server.close(() => {
    console.log('HTTP服务器已关闭');
    process.exit(0);
  });
});