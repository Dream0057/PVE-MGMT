require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/default');
const logger = require('./lib/logger');
const ConfigManager = require('./lib/config-manager');
const PVEClient = require('./lib/pve-client');

// 初始化应用
const app = express();
const configManager = new ConfigManager();
let pveClient = null;

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: false // 允许内联脚本，开发环境使用
}));

app.use(cors());

// 速率限制
const limiter = rateLimit(config.api.rateLimit);
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志中间件
app.use((req, res, next) => {
  logger.info('HTTP请求', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// 初始化PVE客户端
async function initPVEClient() {
  try {
    await configManager.loadConfig();
    const pveConfig = configManager.getPVEConfig();
    
    if (pveConfig.password) {
      pveClient = new PVEClient(pveConfig);
      logger.info('PVE客户端初始化完成');
    } else {
      logger.warn('PVE密码未配置，需要在配置页面设置');
    }
  } catch (error) {
    logger.error('初始化PVE客户端失败', { error: error.message });
  }
}

// 确保PVE客户端可用的中间件
function ensurePVEClient(req, res, next) {
  if (!pveClient) {
    return res.status(503).json({
      error: 'PVE客户端未配置',
      message: '请先在配置页面设置PVE连接参数',
      needsConfig: true
    });
  }
  next();
}

// 路由设置
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

// API路由 - 系统状态
app.get('/api/status', async (req, res) => {
  try {
    const systemConfig = configManager.getSystemConfig();
    const pveStatus = pveClient ? pveClient.getConnectionStatus() : null;
    
    res.json({
      system: {
        status: 'running',
        version: '2.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: systemConfig
      },
      pve: pveStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('获取系统状态失败', { error: error.message });
    res.status(500).json({ error: '获取系统状态失败', message: error.message });
  }
});

// API路由 - 获取配置
app.get('/api/config', async (req, res) => {
  try {
    const config = configManager.getCurrentConfig();
    
    // 不返回密码
    const safeConfig = {
      ...config,
      pve: {
        ...config.pve,
        password: config.pve.password ? '******' : ''
      }
    };
    
    res.json(safeConfig);
  } catch (error) {
    logger.error('获取配置失败', { error: error.message });
    res.status(500).json({ error: '获取配置失败', message: error.message });
  }
});

// API路由 - 更新PVE配置
app.post('/api/config/pve', async (req, res) => {
  try {
    const validation = configManager.validatePVEConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: '配置验证失败',
        errors: validation.errors
      });
    }
    
    const updatedConfig = await configManager.updatePVEConfig(req.body);
    
    // 重新初始化PVE客户端
    pveClient = new PVEClient(updatedConfig);
    
    logger.info('PVE配置更新成功，客户端已重新初始化');
    res.json({
      success: true,
      message: 'PVE配置更新成功',
      config: {
        ...updatedConfig,
        password: '******'
      }
    });
  } catch (error) {
    logger.error('更新PVE配置失败', { error: error.message });
    res.status(500).json({ error: '更新配置失败', message: error.message });
  }
});

// API路由 - 测试PVE连接
app.post('/api/config/test-connection', async (req, res) => {
  try {
    // 获取当前配置或使用现有客户端
    let testClient = pveClient;
    
    // 如果没有客户端，尝试使用当前配置创建临时客户端
    if (!testClient) {
      const currentConfig = configManager.getPVEConfig();
      if (currentConfig.password) {
        testClient = new PVEClient(currentConfig);
        logger.info('为测试连接创建临时PVE客户端');
      } else {
        return res.status(400).json({
          success: false,
          error: 'PVE配置不完整',
          message: '请先保存完整的PVE配置信息',
          needsConfig: true
        });
      }
    }
    
    logger.info('开始测试PVE连接', {
      host: testClient.config.host,
      port: testClient.config.port,
      username: testClient.config.username
    });
    
    const result = await testClient.testConnection();
    
    if (result.success) {
      logger.info('PVE连接测试成功', result);
      res.json({
        success: true,
        message: 'PVE连接测试成功',
        data: result
      });
    } else {
      logger.warn('PVE连接测试失败', result);
      res.json({
        success: false,
        message: 'PVE连接测试失败',
        error: result.error
      });
    }
  } catch (error) {
    logger.error('PVE连接测试异常', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'PVE连接测试异常',
      error: error.message
    });
  }
});

// API路由 - 获取集群节点
app.get('/api/nodes', ensurePVEClient, async (req, res) => {
  try {
    const nodes = await pveClient.getNodes();
    res.json({
      success: true,
      data: nodes,
      count: nodes.length
    });
  } catch (error) {
    logger.error('获取节点列表失败', { error: error.message });
    res.status(500).json({ 
      error: '获取节点列表失败', 
      message: error.message,
      needsConfig: error.message.includes('认证失败')
    });
  }
});

// API路由 - 获取指定节点的VM列表
app.get('/api/nodes/:node/vms', ensurePVEClient, async (req, res) => {
  try {
    const { node } = req.params;
    const vms = await pveClient.getVMs(node);
    res.json({
      success: true,
      data: vms,
      count: vms.length,
      node
    });
  } catch (error) {
    logger.error('获取VM列表失败', { 
      node: req.params.node,
      error: error.message 
    });
    res.status(500).json({ 
      error: '获取VM列表失败', 
      message: error.message 
    });
  }
});

// API路由 - 获取SDN网络列表
app.get('/api/sdn/networks', ensurePVEClient, async (req, res) => {
  try {
    const networks = await pveClient.getSDNNetworks();
    res.json({
      success: true,
      data: networks,
      count: networks.length
    });
  } catch (error) {
    logger.error('获取SDN网络列表失败', { error: error.message });
    res.status(500).json({ 
      error: '获取SDN网络列表失败', 
      message: error.message,
      hint: error.message.includes('not implemented') ? 'SDN功能未启用' : null
    });
  }
});

// API路由 - 创建SDN网络
app.post('/api/sdn/networks', ensurePVEClient, async (req, res) => {
  try {
    const result = await pveClient.createSDNNetwork(req.body);
    
    // 如果系统配置了自动应用，则应用配置
    const systemConfig = configManager.getSystemConfig();
    if (systemConfig.autoApply) {
      try {
        await pveClient.applySDNConfig();
        logger.info('SDN配置已自动应用');
      } catch (applyError) {
        logger.warn('自动应用SDN配置失败', { error: applyError.message });
      }
    }
    
    logger.info('SDN网络创建成功', { vnet: req.body.vnet });
    res.json({
      success: true,
      message: 'SDN网络创建成功',
      data: result
    });
  } catch (error) {
    logger.error('创建SDN网络失败', { error: error.message });
    
    // 处理SDN功能未启用的情况
    if (error.message.includes('SDN功能未启用') || error.message.includes('501')) {
      return res.status(400).json({
        success: false,
        error: 'SDN功能未启用',
        message: '当前PVE环境不支持SDN功能。请检查：\n1. PVE版本是否为7.0+\n2. 是否安装了libpve-network-perl包\n3. 是否启用了SDN功能',
        hint: 'SDN_NOT_SUPPORTED'
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: '创建SDN网络失败', 
      message: error.message 
    });
  }
});

// API路由 - 删除SDN网络
app.delete('/api/sdn/networks/:vnet', ensurePVEClient, async (req, res) => {
  try {
    const { vnet } = req.params;
    await pveClient.deleteSDNNetwork(vnet);
    
    // 自动应用配置
    const systemConfig = configManager.getSystemConfig();
    if (systemConfig.autoApply) {
      try {
        await pveClient.applySDNConfig();
      } catch (applyError) {
        logger.warn('自动应用SDN配置失败', { error: applyError.message });
      }
    }
    
    logger.info('SDN网络删除成功', { vnet });
    res.json({
      success: true,
      message: `SDN网络 ${vnet} 删除成功`
    });
  } catch (error) {
    logger.error('删除SDN网络失败', { 
      vnet: req.params.vnet,
      error: error.message 
    });
    res.status(500).json({ 
      error: '删除SDN网络失败', 
      message: error.message 
    });
  }
});

// API路由 - 更新SDN网络
app.put('/api/sdn/networks/:vnet', ensurePVEClient, async (req, res) => {
  try {
    const { vnet } = req.params;
    await pveClient.updateSDNNetwork(vnet, req.body);
    
    // 自动应用配置
    const systemConfig = configManager.getSystemConfig();
    if (systemConfig.autoApply) {
      try {
        await pveClient.applySDNConfig();
      } catch (applyError) {
        logger.warn('自动应用SDN配置失败', { error: applyError.message });
      }
    }
    
    logger.info('SDN网络更新成功', { vnet });
    res.json({
      success: true,
      message: `SDN网络 ${vnet} 更新成功`
    });
  } catch (error) {
    logger.error('更新SDN网络失败', { 
      vnet: req.params.vnet,
      error: error.message 
    });
    res.status(500).json({ 
      error: '更新SDN网络失败', 
      message: error.message 
    });
  }
});

// API路由 - 应用SDN配置
app.post('/api/sdn/apply', ensurePVEClient, async (req, res) => {
  try {
    await pveClient.applySDNConfig();
    logger.info('SDN配置应用成功');
    res.json({
      success: true,
      message: 'SDN配置应用成功'
    });
  } catch (error) {
    logger.error('应用SDN配置失败', { error: error.message });
    res.status(500).json({ 
      error: '应用SDN配置失败', 
      message: error.message 
    });
  }
});

// API路由 - VM网络管理
app.get('/api/nodes/:node/vms/:vmid/config', ensurePVEClient, async (req, res) => {
  try {
    const { node, vmid } = req.params;
    const config = await pveClient.getVMConfig(node, vmid);
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('获取VM配置失败', { 
      node: req.params.node,
      vmid: req.params.vmid,
      error: error.message 
    });
    res.status(500).json({ 
      error: '获取VM配置失败', 
      message: error.message 
    });
  }
});

app.post('/api/nodes/:node/vms/:vmid/join-sdn', ensurePVEClient, async (req, res) => {
  try {
    const { node, vmid } = req.params;
    const { vnet, netId = 'net0' } = req.body;
    
    // 构建网络配置
    const netConfig = {
      [netId]: `virtio,bridge=${vnet}`
    };
    
    await pveClient.updateVMConfig(node, vmid, netConfig);
    
    logger.info('VM加入SDN网络成功', { node, vmid, vnet, netId });
    res.json({
      success: true,
      message: `VM ${vmid} 已加入SDN网络 ${vnet}`
    });
  } catch (error) {
    logger.error('VM加入SDN网络失败', { 
      node: req.params.node,
      vmid: req.params.vmid,
      error: error.message 
    });
    res.status(500).json({ 
      error: 'VM加入SDN网络失败', 
      message: error.message 
    });
  }
});

app.post('/api/nodes/:node/vms/:vmid/leave-sdn', ensurePVEClient, async (req, res) => {
  try {
    const { node, vmid } = req.params;
    const { netId = 'net0' } = req.body;
    
    // 重置为默认桥接
    const netConfig = {
      [netId]: 'virtio,bridge=vmbr0'
    };
    
    await pveClient.updateVMConfig(node, vmid, netConfig);
    
    logger.info('VM离开SDN网络成功', { node, vmid, netId });
    res.json({
      success: true,
      message: `VM ${vmid} 已离开SDN网络`
    });
  } catch (error) {
    logger.error('VM离开SDN网络失败', { 
      node: req.params.node,
      vmid: req.params.vmid,
      error: error.message 
    });
    res.status(500).json({ 
      error: 'VM离开SDN网络失败', 
      message: error.message 
    });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('未处理的错误', {
    url: req.url,
    method: req.method,
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请联系管理员'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    error: '页面未找到',
    path: req.path
  });
});

// 启动服务器
async function startServer() {
  try {
    await initPVEClient();
    
    const server = app.listen(config.server.port, () => {
      logger.info('PVE SDN管理系统启动成功', {
        port: config.server.port,
        env: config.server.env,
        url: `http://localhost:${config.server.port}`
      });
      
      console.log(`\n🚀 PVE SDN管理系统 v2.0 已启动!`);
      console.log(`📊 管理界面: http://localhost:${config.server.port}`);
      console.log(`⚙️ 配置页面: http://localhost:${config.server.port}/config`);
      console.log(`📡 系统状态: http://localhost:${config.server.port}/api/status`);
      console.log(`📝 日志文件: ${config.logging.file}`);
    });
    
    // 优雅关闭
    process.on('SIGTERM', () => {
      logger.info('收到SIGTERM信号，开始优雅关闭...');
      server.close(() => {
        logger.info('服务器已关闭');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('启动服务器失败', { error: error.message });
    process.exit(1);
  }
}

startServer();