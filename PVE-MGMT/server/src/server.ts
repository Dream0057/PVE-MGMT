import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { PVEManager } from './services/pve-manager';
import { setupPVERoutes } from './routes/pve';
import { setupTrafficRoutes } from './routes/traffic';
import { setupAdvancedTrafficRoutes } from './routes/traffic-advanced';
import { setupAlertRoutes, AlertGenerator } from './routes/alerts';
import { setupWebSocketHandlers } from './websockets/pve-websocket';
import { setupVMResourceRoutes } from './routes/vm-resources';

// 导入流量监控模块
const TrafficMonitorDB = require('./traffic-monitor-db');
const database = require('./db/database');

const app = express();
const server = createServer(app);
const allowedOrigins = [
  "http://localhost:5173",
  "http://YOUR_DEV_SERVER_IP:5173"
];
if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);

// 创建PVE管理器实例
const pveManager = new PVEManager();

// 从数据库加载PVE连接
const loadConnectionsFromDatabase = async () => {
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
        ssl: dbConn.ssl === 1,
        timeout: 30000
      };
      
      await pveManager.addConnection(dbConn.id, dbConn.name, config);
    }
  } catch (error: any) {
    console.error('从数据库加载连接失败:', error.message);
  }
};

// 流量监控实例 - 延迟初始化
let trafficMonitor: any = null;

// 中间件
app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    connections: pveManager.getConnectionStats()
  });
});

// 设置路由
setupPVERoutes(app, pveManager);

// 立即设置流量监控路由（使用延迟初始化的trafficMonitor）
setupTrafficRoutes(app, pveManager, () => trafficMonitor);

// 设置高级流量监控路由
setupAdvancedTrafficRoutes(app, pveManager, () => trafficMonitor);

// 设置告警路由
setupAlertRoutes(app, pveManager, () => database);

// 设置VM资源监控路由
setupVMResourceRoutes(app, pveManager);

// 初始化流量监控系统
const initializeTrafficMonitor = () => {
  try {
    trafficMonitor = new TrafficMonitorDB();
    console.log('流量监控系统已启动');
    return true;
  } catch (error: any) {
    console.error('流量监控系统启动失败:', error.message);
    return false;
  }
};

// 设置WebSocket处理器（稍后会传入trafficMonitor）
let websocketHandlersSetup = false;

// 定时任务引用
let trafficCollectionInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

// 启动定时流量收集任务
const startTrafficCollection = () => {
  if (!trafficMonitor) {
    console.error('流量监控系统未初始化，无法启动定时任务');
    return;
  }
  
  console.log('启动定时流量收集任务...');
  
  // 30秒间隔的流量收集
  trafficCollectionInterval = setInterval(async () => {
    try {
      let collectedCount = 0;
      const connections = pveManager.getAllConnections();
      
      for (const connection of connections) {
        try {
          // 尝试获取虚拟机，如果成功说明连接可用
          const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
          for (const vm of vms) {
            try {
              const trafficData = await trafficMonitor.collectVMTraffic(connection, vm);
              if (trafficData) {
                collectedCount++;
              }
            } catch (vmError: any) {
              console.error(`收集VM ${vm.vmid} 流量失败:`, vmError.message);
            }
          }
        } catch (error: any) {
          console.error(`收集连接 ${connection.id} 的流量失败:`, error.message);
        }
      }
      
      if (collectedCount > 0) {
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
    } catch (error: any) {
      console.error('定时流量收集失败:', error.message);
    }
  }, 5 * 1000); // 5秒
  
  // 24小时清理一次旧数据
  cleanupInterval = setInterval(async () => {
    try {
      if (trafficMonitor) {
        await trafficMonitor.cleanupOldData(30); // 保留30天
        console.log('定时清理旧流量数据完成');
      }
    } catch (error: any) {
      console.error('清理旧流量数据失败:', error.message);
    }
  }, 24 * 60 * 60 * 1000); // 24小时
};

// 初始化告警系统
let alertGenerator: AlertGenerator;
let alertMonitoringInterval: NodeJS.Timeout;

const initializeAlertSystem = () => {
  try {
    alertGenerator = new AlertGenerator(database, pveManager);
    console.log('告警系统已启动');
    
    // 启动告警监控定时任务
    startAlertMonitoring();
    return true;
  } catch (error: any) {
    console.error('告警系统启动失败:', error.message);
    return false;
  }
};

const startAlertMonitoring = () => {
  console.log('启动告警监控任务...');
  
  // 2分钟间隔检查告警
  alertMonitoringInterval = setInterval(async () => {
    try {
      // 检查PVE系统告警
      await alertGenerator.checkPVESystemAlerts();
      
      // 自动解决已恢复的告警
      await alertGenerator.autoResolveAlerts();
      
      console.log('告警检查完成');
    } catch (error: any) {
      console.error('告警检查失败:', error.message);
    }
  }, 2 * 60 * 1000); // 2分钟
  
  // 每天清理一次旧告警
  setInterval(async () => {
    try {
      const cleaned = await alertGenerator.cleanupOldAlerts(30);
      if (cleaned > 0) {
        console.log(`清理了 ${cleaned} 条旧告警记录`);
      }
    } catch (error: any) {
      console.error('清理旧告警失败:', error.message);
    }
  }, 24 * 60 * 60 * 1000); // 24小时
};

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
  console.log(`PVE Manager服务器启动成功，端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  
  // 启动PVE监控
  pveManager.startMonitoring(30000); // 30秒间隔
  
  // 初始化流量监控系统
  const initTrafficSystem = async () => {
    // 初始化流量监控（不依赖数据库状态检查）
    if (initializeTrafficMonitor()) {
      console.log('流量监控系统初始化成功');
      
      // 从数据库加载PVE连接
      await loadConnectionsFromDatabase();
      
      // 设置WebSocket处理器（包含流量监控）
      if (!websocketHandlersSetup) {
        setupWebSocketHandlers(io, pveManager, trafficMonitor);
        websocketHandlersSetup = true;
      }
      
      // 启动定时流量收集任务
      startTrafficCollection();
      
      // 初始化告警系统
      if (initializeAlertSystem()) {
        console.log('告警系统初始化成功');
      } else {
        console.error('告警系统初始化失败');
      }
    } else {
      console.error('流量监控系统初始化失败');
    }
  };
  
  // 等待数据库就绪后初始化整个流量系统
  if (database.isReady) {
    initTrafficSystem().catch(console.error);
  } else {
    database.once('ready', () => {
      console.log('数据库就绪，开始初始化流量监控系统');
      setTimeout(() => initTrafficSystem().catch(console.error), 500);
    });
  }
});

// 清理定时任务
const cleanupTimers = () => {
  if (trafficCollectionInterval) {
    clearInterval(trafficCollectionInterval);
    console.log('流量收集定时器已清理');
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    console.log('数据清理定时器已清理');
  }
  if (alertMonitoringInterval) {
    clearInterval(alertMonitoringInterval);
    console.log('告警监控定时器已清理');
  }
};

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，开始优雅关闭...');
  cleanupTimers();
  server.close(() => {
    console.log('HTTP服务器已关闭');
    pveManager.destroy();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，开始优雅关闭...');
  cleanupTimers();
  server.close(() => {
    console.log('HTTP服务器已关闭');
    pveManager.destroy();
    process.exit(0);
  });
});

export { app, server, io, pveManager };