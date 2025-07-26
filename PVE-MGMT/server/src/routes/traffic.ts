import { Express, Request, Response } from 'express';
import { PVEManager } from '../services/pve-manager';

export function setupTrafficRoutes(app: Express, pveManager: PVEManager, getTrafficMonitor: () => any) {
  // 获取小时流量统计
  app.get('/api/pve/traffic/hourly', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const { hour } = req.query;
      const hourlyTraffic = await trafficMonitor.getAllHourlyTraffic(hour);
      res.json(hourlyTraffic);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取日流量统计
  app.get('/api/pve/traffic/daily', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const { day } = req.query;
      const dailyTraffic = await trafficMonitor.getAllDailyTraffic(day);
      res.json(dailyTraffic);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM流量历史
  app.get('/api/pve/connections/:id/vms/:vmid/traffic/history', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const { id, vmid } = req.params;
      const { node, hours = 24 } = req.query;
      
      if (!node) {
        return res.status(400).json({ error: '缺少必需参数: node' });
      }
      
      const history = await trafficMonitor.getVMTrafficHistory(id, node, parseInt(vmid as string), parseInt(hours as string));
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM当前流量
  app.get('/api/pve/connections/:id/vms/:vmid/traffic', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const { id, vmid } = req.params;
      const { node } = req.query;
      
      if (!node) {
        return res.status(400).json({ error: '缺少必需参数: node' });
      }
      
      const current = await trafficMonitor.getVMCurrentTraffic(id, node, parseInt(vmid as string));
      const hourly = await trafficMonitor.getVMHourlyTraffic(id, node, parseInt(vmid as string));
      const daily = await trafficMonitor.getVMDailyTraffic(id, node, parseInt(vmid as string));

      res.json({
        current: current || null,
        hourly: hourly || null,
        daily: daily || null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取流量统计摘要
  app.get('/api/pve/traffic/stats', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const stats = await trafficMonitor.getStatsSummary();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 清理无效数据
  app.post('/api/pve/traffic/cleanup', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      // 获取当前所有活跃的虚拟机
      const activeVMs: any[] = [];
      
      const connections = pveManager.getAllConnections();
      for (const connection of connections) {
        if (connection.status === 'connected') {
          try {
            const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
            vms.forEach((vm: any) => {
              activeVMs.push({
                vmKey: `${connection.id}-${vm.node}-${vm.vmid}`,
                connectionId: connection.id,
                node: vm.node,
                vmid: vm.vmid
              });
            });
          } catch (error: any) {
            console.error(`获取连接 ${connection.id} 的虚拟机失败:`, error.message);
          }
        }
      }
      
      const cleanupResult = await trafficMonitor.cleanupOrphanedData(activeVMs);
      res.json(cleanupResult);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 清理所有数据
  app.delete('/api/pve/traffic/data', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      const cleanupResult = await trafficMonitor.cleanupAllData();
      res.json(cleanupResult);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM小时记录
  app.get('/api/pve/traffic/vm-hourly', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      
      const { connectionId, startDate, endDate } = req.query;
      const vmHourlyRecords = await trafficMonitor.getVMHourlyRecords(connectionId, startDate, endDate);
      res.json(vmHourlyRecords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM日记录
  app.get('/api/pve/traffic/vm-daily', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      
      const { connectionId, startDate, endDate } = req.query;
      const vmDailyRecords = await trafficMonitor.getVMDailyRecords(connectionId, startDate, endDate);
      res.json(vmDailyRecords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 手动触发流量收集
  app.post('/api/pve/traffic/collect', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }
      let collectedCount = 0;
      const results: any[] = [];

      const connections = pveManager.getAllConnections();
      for (const connection of connections) {
        try {
          // 尝试获取虚拟机，如果成功说明连接可用
          const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
          for (const vm of vms) {
            try {
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
            } catch (vmError: any) {
              console.error(`收集VM ${vm.vmid} 流量失败:`, vmError.message);
            }
          }
        } catch (error: any) {
          console.error(`收集连接 ${connection.id} 的流量失败:`, error.message);
        }
      }

      res.json({
        success: true,
        collectedCount,
        results,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}