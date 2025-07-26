// 虚拟机流量监控服务
class TrafficMonitor {
  constructor() {
    this.trafficData = new Map(); // 存储流量数据
    this.lastCollectionTime = new Map(); // 上次收集时间
    this.hourlyStats = new Map(); // 每小时统计
    this.dailyStats = new Map(); // 每日统计
  }

  // 格式化字节数
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 获取时间键(用于分组统计)
  getHourKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`;
  }

  getDayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  getVMKey(connectionId, node, vmid) {
    return `${connectionId}-${node}-${vmid}`;
  }

  // 收集虚拟机流量数据
  async collectVMTraffic(connection, vm) {
    try {
      const vmKey = this.getVMKey(connection.id, vm.node, vm.vmid);
      const now = new Date();
      const hourKey = this.getHourKey(now);
      const dayKey = this.getDayKey(now);

      // 获取当前网络状态
      const networkStats = await connection.client.getVMNetworkStats(vm.node, vm.vmid, vm.type);
      
      if (!networkStats) return null;

      // 计算网络接口流量
      let totalNetin = 0;
      let totalNetout = 0;

      // 遍历所有网络接口
      Object.keys(networkStats).forEach(key => {
        if (key.startsWith('netin') || key.startsWith('netout')) {
          const value = parseInt(networkStats[key]) || 0;
          if (key.startsWith('netin')) {
            totalNetin += value;
          } else if (key.startsWith('netout')) {
            totalNetout += value;
          }
        }
      });

      const currentData = {
        vmKey,
        connectionId: connection.id,
        connectionName: connection.name,
        node: vm.node,
        vmid: vm.vmid,
        vmname: vm.name,
        type: vm.type,
        timestamp: now.toISOString(),
        netin: totalNetin,
        netout: totalNetout,
        total: totalNetin + totalNetout
      };

      // 获取上次数据计算差值
      const lastData = this.trafficData.get(vmKey);
      let trafficDelta = {
        netin: 0,
        netout: 0,
        total: 0,
        duration: 0
      };

      if (lastData) {
        const timeDiff = (now - new Date(lastData.timestamp)) / 1000; // 秒
        trafficDelta = {
          netin: Math.max(0, totalNetin - lastData.netin),
          netout: Math.max(0, totalNetout - lastData.netout),
          total: Math.max(0, (totalNetin + totalNetout) - lastData.total),
          duration: timeDiff
        };
      }

      // 更新当前数据
      this.trafficData.set(vmKey, currentData);

      // 更新小时统计
      const hourStatsKey = `${vmKey}-${hourKey}`;
      const hourStats = this.hourlyStats.get(hourStatsKey) || {
        vmKey,
        connectionId: connection.id,
        connectionName: connection.name,
        node: vm.node,
        vmid: vm.vmid,
        vmname: vm.name,
        type: vm.type,
        hour: hourKey,
        netin: 0,
        netout: 0,
        total: 0,
        collections: 0,
        startTime: now.toISOString(),
        lastUpdate: now.toISOString()
      };

      hourStats.netin += trafficDelta.netin;
      hourStats.netout += trafficDelta.netout;
      hourStats.total += trafficDelta.total;
      hourStats.collections += 1;
      hourStats.lastUpdate = now.toISOString();

      this.hourlyStats.set(hourStatsKey, hourStats);

      // 更新日统计
      const dayStatsKey = `${vmKey}-${dayKey}`;
      const dayStats = this.dailyStats.get(dayStatsKey) || {
        vmKey,
        connectionId: connection.id,
        connectionName: connection.name,
        node: vm.node,
        vmid: vm.vmid,
        vmname: vm.name,
        type: vm.type,
        day: dayKey,
        netin: 0,
        netout: 0,
        total: 0,
        collections: 0,
        startTime: now.toISOString(),
        lastUpdate: now.toISOString()
      };

      dayStats.netin += trafficDelta.netin;
      dayStats.netout += trafficDelta.netout;
      dayStats.total += trafficDelta.total;
      dayStats.collections += 1;
      dayStats.lastUpdate = now.toISOString();

      this.dailyStats.set(dayStatsKey, dayStats);

      return {
        current: currentData,
        delta: trafficDelta,
        hourStats: hourStats,
        dayStats: dayStats
      };

    } catch (error) {
      console.error(`收集VM ${vm.vmid} 流量数据失败:`, error.message);
      return null;
    }
  }

  // 获取虚拟机当前流量统计
  getVMCurrentTraffic(connectionId, node, vmid) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    return this.trafficData.get(vmKey);
  }

  // 获取虚拟机小时流量统计
  getVMHourlyTraffic(connectionId, node, vmid, hour = null) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const hourKey = hour || this.getHourKey();
    const hourStatsKey = `${vmKey}-${hourKey}`;
    return this.hourlyStats.get(hourStatsKey);
  }

  // 获取虚拟机日流量统计
  getVMDailyTraffic(connectionId, node, vmid, day = null) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const dayKey = day || this.getDayKey();
    const dayStatsKey = `${vmKey}-${dayKey}`;
    return this.dailyStats.get(dayStatsKey);
  }

  // 获取所有虚拟机的小时流量统计
  getAllHourlyTraffic(hour = null) {
    const hourKey = hour || this.getHourKey();
    const results = [];
    
    for (const [key, stats] of this.hourlyStats) {
      if (key.endsWith(`-${hourKey}`)) {
        results.push({
          ...stats,
          netinFormatted: this.formatBytes(stats.netin),
          netoutFormatted: this.formatBytes(stats.netout),
          totalFormatted: this.formatBytes(stats.total)
        });
      }
    }
    
    return results.sort((a, b) => b.total - a.total);
  }

  // 获取所有虚拟机的日流量统计
  getAllDailyTraffic(day = null) {
    const dayKey = day || this.getDayKey();
    const results = [];
    
    for (const [key, stats] of this.dailyStats) {
      if (key.endsWith(`-${dayKey}`)) {
        results.push({
          ...stats,
          netinFormatted: this.formatBytes(stats.netin),
          netoutFormatted: this.formatBytes(stats.netout),
          totalFormatted: this.formatBytes(stats.total)
        });
      }
    }
    
    return results.sort((a, b) => b.total - a.total);
  }

  // 获取虚拟机历史流量趋势
  getVMTrafficHistory(connectionId, node, vmid, hours = 24) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const now = new Date();
    const results = [];

    for (let i = hours - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = this.getHourKey(time);
      const hourStatsKey = `${vmKey}-${hourKey}`;
      const stats = this.hourlyStats.get(hourStatsKey);
      
      results.push({
        hour: hourKey,
        time: time.toISOString(),
        netin: stats ? stats.netin : 0,
        netout: stats ? stats.netout : 0,
        total: stats ? stats.total : 0,
        netinFormatted: this.formatBytes(stats ? stats.netin : 0),
        netoutFormatted: this.formatBytes(stats ? stats.netout : 0),
        totalFormatted: this.formatBytes(stats ? stats.total : 0)
      });
    }

    return results;
  }

  // 清理旧数据(保留指定天数)
  cleanupOldData(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDayKey = this.getDayKey(cutoffDate);

    // 清理小时数据
    for (const [key, stats] of this.hourlyStats) {
      if (stats.hour < cutoffDayKey) {
        this.hourlyStats.delete(key);
      }
    }

    // 清理日数据
    for (const [key, stats] of this.dailyStats) {
      if (stats.day < cutoffDayKey) {
        this.dailyStats.delete(key);
      }
    }

    console.log(`清理了 ${cutoffDate.toISOString()} 之前的流量数据`);
  }

  // 获取统计摘要
  getStatsSummary() {
    return {
      totalVMs: this.trafficData.size,
      hourlyRecords: this.hourlyStats.size,
      dailyRecords: this.dailyStats.size,
      memoryUsage: {
        trafficData: this.trafficData.size,
        hourlyStats: this.hourlyStats.size,
        dailyStats: this.dailyStats.size
      }
    };
  }
}

module.exports = TrafficMonitor;