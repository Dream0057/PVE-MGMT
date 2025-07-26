import { Express, Request, Response } from 'express';
import { PVEManager } from '../services/pve-manager';

export function setupAdvancedTrafficRoutes(app: Express, pveManager: PVEManager, getTrafficMonitor: () => any) {
  
  // 获取实时流量监控数据 - 用于仪表盘（优化版本）
  app.get('/api/pve/traffic/dashboard', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }

      const dashboardData: any = {
        overview: {
          totalVMs: 0,
          activeVMs: 0,
          totalTraffic: 0,
          totalNetin: 0,
          totalNetout: 0,
          timestamp: new Date().toISOString()
        },
        vmList: [],
        topTrafficVMs: [],
        trafficAlerts: []
      };

      // 优化1: 批量获取所有流量数据，避免N+1查询
      const [allHourlyTraffic, allCurrentTraffic] = await Promise.all([
        trafficMonitor.getAllHourlyTraffic(),
        trafficMonitor.getAllCurrentTraffic ? trafficMonitor.getAllCurrentTraffic() : []
      ]);

      // 创建流量数据映射表以便快速查找
      const hourlyTrafficMap = new Map();
      const currentTrafficMap = new Map();

      allHourlyTraffic.forEach((traffic: any) => {
        const key = `${traffic.connection_id}-${traffic.node}-${traffic.vmid}`;
        hourlyTrafficMap.set(key, traffic);
      });

      if (Array.isArray(allCurrentTraffic)) {
        allCurrentTraffic.forEach((traffic: any) => {
          const key = `${traffic.connection_id}-${traffic.node}-${traffic.vmid}`;
          currentTrafficMap.set(key, {
            netin: traffic.netin || 0,
            netout: traffic.netout || 0,
            total: traffic.total || 0,
            timestamp: traffic.timestamp
          });
        });
      }

      // 优化2: 并行处理所有连接
      const connections = pveManager.getAllConnections().filter(c => c.status === 'connected');
      const connectionPromises = connections.map(async (connection) => {
        try {
          const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
          return { connection, vms };
        } catch (error: any) {
          console.error(`获取连接 ${connection.id} 的VM列表失败:`, error.message);
          return { connection, vms: [] };
        }
      });

      const connectionResults = await Promise.all(connectionPromises);

      // 处理VM数据
      for (const { connection, vms } of connectionResults) {
        dashboardData.overview.totalVMs += vms.length;

        for (const vm of vms) {
          const vmKey = `${connection.id}-${vm.node}-${vm.vmid}`;
          const hourlyTraffic = hourlyTrafficMap.get(vmKey) || { netin: 0, netout: 0, total: 0 };
          const currentTraffic = currentTrafficMap.get(vmKey) || { netin: 0, netout: 0, total: 0 };

          const vmData = {
            id: vmKey,
            connectionId: connection.id,
            connectionName: connection.name,
            node: vm.node,
            vmid: vm.vmid,
            name: vm.name,
            type: vm.type,
            status: vm.status,
            current: currentTraffic,
            hourly: hourlyTraffic,
            // 计算实时流量速率 (基于5秒收集间隔估算)
            speed: {
              netin: currentTraffic.netin > 0 ? Math.round(currentTraffic.netin / 5) : Math.round(hourlyTraffic.netin / 720), // 720 = 3600/5秒采样数
              netout: currentTraffic.netout > 0 ? Math.round(currentTraffic.netout / 5) : Math.round(hourlyTraffic.netout / 720),
              total: currentTraffic.total > 0 ? Math.round(currentTraffic.total / 5) : Math.round(hourlyTraffic.total / 720)
            }
          };

          dashboardData.vmList.push(vmData);

          if (vm.status === 'running') {
            dashboardData.overview.activeVMs++;
          }

          // 累计总流量
          dashboardData.overview.totalTraffic += hourlyTraffic.total;
          dashboardData.overview.totalNetin += hourlyTraffic.netin;
          dashboardData.overview.totalNetout += hourlyTraffic.netout;

          // 检查流量告警
          if (hourlyTraffic.total > 1024 * 1024 * 1024) { // > 1GB
            dashboardData.trafficAlerts.push({
              id: vmData.id,
              type: 'high_traffic',
              level: hourlyTraffic.total > 10 * 1024 * 1024 * 1024 ? 'critical' : 'warning',
              message: `VM ${vm.name} 小时流量异常: ${(hourlyTraffic.total / (1024*1024*1024)).toFixed(2)}GB`,
              timestamp: new Date().toISOString(),
              vm: vmData
            });
          }
        }
      }

      // 按流量排序，获取Top 10
      dashboardData.topTrafficVMs = dashboardData.vmList
        .sort((a: any, b: any) => b.hourly.total - a.hourly.total)
        .slice(0, 10);

      res.json(dashboardData);
    } catch (error: any) {
      console.error('获取流量仪表盘数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM流量趋势数据 - 用于图表
  app.get('/api/pve/traffic/trends', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }

      const { connectionId, node, vmid, hours = '24', interval = 'hour' } = req.query;

      if (!connectionId || !node || !vmid) {
        return res.status(400).json({ error: '缺少必需参数: connectionId, node, vmid' });
      }

      const hoursNum = parseInt(hours as string);
      const trends = await trafficMonitor.getVMTrafficHistory(connectionId, node, parseInt(vmid as string), hoursNum);

      // 数据处理，生成图表所需格式
      const processedTrends = trends.map((item: any) => ({
        time: item.time,
        hour: item.hour,
        netin: item.netin,
        netout: item.netout,
        total: item.total,
        netinFormatted: item.netinFormatted,
        netoutFormatted: item.netoutFormatted,
        totalFormatted: item.totalFormatted,
        // 计算变化率
        netinRate: item.netin > 0 ? Math.log10(item.netin + 1) : 0,
        netoutRate: item.netout > 0 ? Math.log10(item.netout + 1) : 0,
      }));

      res.json({
        vmKey: `${connectionId}-${node}-${vmid}`,
        interval,
        hours: hoursNum,
        data: processedTrends,
        summary: {
          totalNetin: trends.reduce((sum: number, item: any) => sum + item.netin, 0),
          totalNetout: trends.reduce((sum: number, item: any) => sum + item.netout, 0),
          totalTraffic: trends.reduce((sum: number, item: any) => sum + item.total, 0),
          peakHour: trends.reduce((peak: any, item: any) => 
            item.total > (peak?.total || 0) ? item : peak, null),
          averagePerHour: trends.length > 0 ? 
            trends.reduce((sum: number, item: any) => sum + item.total, 0) / trends.length : 0
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取流量热力图数据
  app.get('/api/pve/traffic/heatmap', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }

      const { days = '7' } = req.query;
      const daysNum = parseInt(days as string);
      
      // 获取指定天数的每日流量数据
      const heatmapData: any = {
        days: daysNum,
        data: [],
        vmList: [],
        maxTraffic: 0,
        minTraffic: 0
      };

      const connections = pveManager.getAllConnections();
      const vmTrafficMap = new Map();

      // 生成日期列表
      const dateList = [];
      for (let i = daysNum - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dateList.push(date.toISOString().split('T')[0]);
      }

      for (const connection of connections) {
        if (connection.status === 'connected') {
          try {
            const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
            
            for (const vm of vms) {
              const vmKey = `${connection.id}-${vm.node}-${vm.vmid}`;
              
              if (!vmTrafficMap.has(vmKey)) {
                vmTrafficMap.set(vmKey, {
                  vmKey,
                  connectionName: connection.name,
                  vmName: vm.name,
                  node: vm.node,
                  vmid: vm.vmid,
                  dailyTraffic: {}
                });
                heatmapData.vmList.push(vmTrafficMap.get(vmKey));
              }

              const vmData = vmTrafficMap.get(vmKey);

              // 获取每天的流量数据
              for (const date of dateList) {
                const dailyTraffic = await trafficMonitor.getVMDailyTraffic(connection.id, vm.node, vm.vmid, date);
                const traffic = dailyTraffic ? dailyTraffic.total : 0;
                
                vmData.dailyTraffic[date] = traffic;
                
                // 更新最大最小值
                if (traffic > heatmapData.maxTraffic) {
                  heatmapData.maxTraffic = traffic;
                }
                if (traffic < heatmapData.minTraffic || heatmapData.minTraffic === 0) {
                  heatmapData.minTraffic = traffic;
                }

                // 生成热力图数据点
                heatmapData.data.push({
                  vm: vmKey,
                  vmName: vm.name,
                  date: date,
                  value: traffic,
                  formatted: trafficMonitor.formatBytes(traffic),
                  intensity: traffic > 0 ? Math.min(1, traffic / (1024 * 1024 * 1024)) : 0 // 归一化到0-1
                });
              }
            }
          } catch (error: any) {
            console.error(`获取连接 ${connection.id} 的热力图数据失败:`, error.message);
          }
        }
      }

      heatmapData.dateList = dateList;
      res.json(heatmapData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取流量统计分析（优化版本）
  app.get('/api/pve/traffic/analytics', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }

      const { period = 'today' } = req.query;
      
      let analyticsData: any = {
        period,
        timestamp: new Date().toISOString(),
        overview: {
          totalVMs: 0,
          activeConnections: 0,
          totalTraffic: 0,
          avgTrafficPerVM: 0,
          peakTraffic: 0,
          peakTrafficTime: null
        },
        distribution: {
          byConnection: [],
          byVMType: { qemu: 0, lxc: 0 },
          byTrafficLevel: {
            low: 0,    // < 100MB
            medium: 0, // 100MB - 1GB
            high: 0,   // 1GB - 10GB
            extreme: 0 // > 10GB
          }
        },
        trends: [],
        topVMs: [],
        recommendations: []
      };

      // 优化：批量获取流量数据
      const allTrafficData = period === 'today' 
        ? await trafficMonitor.getAllDailyTraffic()
        : await trafficMonitor.getAllHourlyTraffic();

      // 创建流量映射表
      const trafficMap = new Map();
      allTrafficData.forEach((traffic: any) => {
        const key = `${traffic.connection_id}-${traffic.node}-${traffic.vmid}`;
        trafficMap.set(key, traffic);
      });

      const connections = pveManager.getAllConnections().filter(c => c.status === 'connected');
      analyticsData.overview.activeConnections = connections.length;

      // 并行处理连接
      const connectionPromises = connections.map(async (connection) => {
        const connectionData = {
          id: connection.id,
          name: connection.name,
          vmCount: 0,
          totalTraffic: 0,
          avgTrafficPerVM: 0
        };

        try {
          const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
          connectionData.vmCount = vms.length;
          analyticsData.overview.totalVMs += vms.length;

          for (const vm of vms) {
            const vmKey = `${connection.id}-${vm.node}-${vm.vmid}`;
            const trafficData = trafficMap.get(vmKey);
            const vmTraffic = trafficData ? trafficData.total : 0;

            connectionData.totalTraffic += vmTraffic;
            analyticsData.overview.totalTraffic += vmTraffic;

            // 更新峰值
            if (vmTraffic > analyticsData.overview.peakTraffic) {
              analyticsData.overview.peakTraffic = vmTraffic;
              analyticsData.overview.peakTrafficTime = new Date().toISOString();
            }

            // VM类型统计
            if (vm.type === 'qemu') {
              analyticsData.distribution.byVMType.qemu += vmTraffic;
            } else {
              analyticsData.distribution.byVMType.lxc += vmTraffic;
            }

            // 流量等级分布
            const MB_100 = 100 * 1024 * 1024;
            const GB_1 = 1024 * 1024 * 1024;
            const GB_10 = 10 * 1024 * 1024 * 1024;

            if (vmTraffic < MB_100) {
              analyticsData.distribution.byTrafficLevel.low++;
            } else if (vmTraffic < GB_1) {
              analyticsData.distribution.byTrafficLevel.medium++;
            } else if (vmTraffic < GB_10) {
              analyticsData.distribution.byTrafficLevel.high++;
            } else {
              analyticsData.distribution.byTrafficLevel.extreme++;
            }

            // Top VMs
            analyticsData.topVMs.push({
              id: vmKey,
              name: vm.name,
              node: vm.node,
              vmid: vm.vmid,
              type: vm.type,
              connectionName: connection.name,
              traffic: vmTraffic,
              trafficFormatted: `${(vmTraffic / (1024*1024*1024)).toFixed(2)}GB`
            });
          }

          connectionData.avgTrafficPerVM = connectionData.vmCount > 0 ? 
            connectionData.totalTraffic / connectionData.vmCount : 0;
          
          return connectionData;
        } catch (error: any) {
          console.error(`分析连接 ${connection.id} 失败:`, error.message);
          return connectionData;
        }
      });

      analyticsData.distribution.byConnection = await Promise.all(connectionPromises);

      // 计算平均值
      analyticsData.overview.avgTrafficPerVM = analyticsData.overview.totalVMs > 0 ? 
        analyticsData.overview.totalTraffic / analyticsData.overview.totalVMs : 0;

      // 排序TopVMs
      analyticsData.topVMs.sort((a: any, b: any) => b.traffic - a.traffic);
      analyticsData.topVMs = analyticsData.topVMs.slice(0, 10);

      // 生成建议
      if (analyticsData.distribution.byTrafficLevel.extreme > 0) {
        analyticsData.recommendations.push({
          type: 'warning',
          title: '高流量告警',
          message: `发现 ${analyticsData.distribution.byTrafficLevel.extreme} 台VM流量超过10GB，建议检查是否正常`,
          priority: 'high'
        });
      }

      if (analyticsData.overview.avgTrafficPerVM > 1024 * 1024 * 1024) { // > 1GB
        analyticsData.recommendations.push({
          type: 'info',
          title: '流量优化建议',
          message: '平均VM流量较高，建议优化网络配置或考虑带宽升级',
          priority: 'medium'
        });
      }

      res.json(analyticsData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取VM流量对比数据
  app.get('/api/pve/traffic/compare', async (req: Request, res: Response) => {
    try {
      const trafficMonitor = getTrafficMonitor();
      if (!trafficMonitor) {
        return res.status(503).json({ error: '流量监控系统未就绪' });
      }

      const { vmIds, period = '24h' } = req.query;
      
      if (!vmIds) {
        return res.status(400).json({ error: '缺少VM ID参数' });
      }

      const vmIdList = Array.isArray(vmIds) ? vmIds : [vmIds];
      const compareData: any = {
        period,
        vms: [],
        comparison: {
          maxTraffic: 0,
          minTraffic: Number.MAX_SAFE_INTEGER,
          avgTraffic: 0,
          totalTraffic: 0
        },
        timeline: {}
      };

      for (const vmId of vmIdList) {
        const [connectionId, node, vmid] = (vmId as string).split('-');
        
        if (!connectionId || !node || !vmid) {
          continue;
        }

        const hours = period === '24h' ? 24 : period === '7d' ? 24 * 7 : 24;
        const history = await trafficMonitor.getVMTrafficHistory(connectionId, node, parseInt(vmid), hours);
        
        let totalTraffic = 0;
        history.forEach((item: any) => {
          totalTraffic += item.total;
          
          // 构建时间线数据
          if (!compareData.timeline[item.hour]) {
            compareData.timeline[item.hour] = {};
          }
          compareData.timeline[item.hour][vmId as string] = item.total;
        });

        // 获取VM信息
        try {
          const connections = pveManager.getAllConnections();
          const connection = connections.find(c => c.id === connectionId);
          if (connection && connection.status === 'connected') {
            const vms = await pveManager.executeOnConnection(connectionId, (client) => client.getVMs());
            const vmInfo = vms.find((v: any) => v.node === node && v.vmid === parseInt(vmid));
            
            if (vmInfo) {
              const vmData = {
                id: vmId,
                name: vmInfo.name,
                node: vmInfo.node,
                vmid: vmInfo.vmid,
                type: vmInfo.type,
                connectionName: connection.name,
                totalTraffic,
                trafficFormatted: trafficMonitor.formatBytes(totalTraffic),
                avgHourlyTraffic: totalTraffic / hours,
                history: history
              };

              compareData.vms.push(vmData);
              compareData.comparison.totalTraffic += totalTraffic;
              
              if (totalTraffic > compareData.comparison.maxTraffic) {
                compareData.comparison.maxTraffic = totalTraffic;
              }
              if (totalTraffic < compareData.comparison.minTraffic) {
                compareData.comparison.minTraffic = totalTraffic;
              }
            }
          }
        } catch (error: any) {
          console.error(`获取VM ${vmId} 信息失败:`, error.message);
        }
      }

      compareData.comparison.avgTraffic = compareData.vms.length > 0 ? 
        compareData.comparison.totalTraffic / compareData.vms.length : 0;

      res.json(compareData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}