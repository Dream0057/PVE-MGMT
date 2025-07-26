// 基于数据库的流量监控服务
const database = require('./db/database');

class TrafficMonitorDB {
  constructor() {
    this.db = database;
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

  // 收集虚拟机流量数据 - 每5秒收集累计使用值
  async collectVMTraffic(connection, vm) {
    try {
      const vmKey = this.getVMKey(connection.id, vm.node, vm.vmid);
      const now = new Date();
      const hourKey = this.getHourKey(now);
      const dayKey = this.getDayKey(now);

      // 获取当前网络状态 - 这些是累计值
      const networkStats = await connection.client.getVMNetworkStats(vm.node, vm.vmid, vm.type);
      
      if (!networkStats) {
        console.warn(`VM ${vm.vmid} 网络统计数据为空`);
        return null;
      }

      // 计算网络接口累计流量
      let totalNetin = 0;
      let totalNetout = 0;

      // 遍历所有网络接口，获取累计值
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

      // 当前累计数据
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

      // 获取上次收集的累计数据来计算差值
      const lastData = await this.getVMCurrentTraffic(connection.id, vm.node, vm.vmid);
      let trafficDelta = {
        netin: 0,
        netout: 0,
        total: 0,
        duration: 0
      };

      if (lastData) {
        const timeDiff = (now - new Date(lastData.timestamp)) / 1000; // 秒
        // 计算5秒间隔内的增量（防止累计值重置导致的负数）
        trafficDelta = {
          netin: Math.max(0, totalNetin - lastData.netin),
          netout: Math.max(0, totalNetout - lastData.netout),
          total: Math.max(0, (totalNetin + totalNetout) - lastData.total),
          duration: timeDiff
        };
        
        // 日志记录每5秒的流量增量
        if (trafficDelta.total > 0) {
          console.log(`VM ${vm.vmid} (${vm.name}) 5秒流量增量: ${this.formatBytes(trafficDelta.total)} (入: ${this.formatBytes(trafficDelta.netin)}, 出: ${this.formatBytes(trafficDelta.netout)})`);
        }
      } else {
        console.log(`VM ${vm.vmid} (${vm.name}) 首次收集流量数据，累计值: ${this.formatBytes(currentData.total)}`);
      }

      // 保存当前累计数据到数据库
      await this.saveCurrentTraffic(currentData);

      // 更新小时统计（使用增量）
      const hourStats = await this.updateHourlyStats(currentData, trafficDelta, hourKey);

      // 更新日统计（使用增量）
      const dayStats = await this.updateDailyStats(currentData, trafficDelta, dayKey);

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

  // 保存当前流量数据
  async saveCurrentTraffic(data) {
    try {
      // 首先检查连接是否存在
      const connectionCheck = await this.db.get(
        'SELECT id FROM pve_connections WHERE id = ?', 
        [data.connectionId]
      );
      
      if (!connectionCheck) {
        console.warn(`连接 ${data.connectionId} 不存在于数据库中，跳过流量数据保存`);
        return;
      }

      const sql = `
        INSERT OR REPLACE INTO traffic_current 
        (vm_key, connection_id, connection_name, node, vmid, vmname, type, netin, netout, total, timestamp, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      await this.db.run(sql, [
        data.vmKey,
        data.connectionId,
        data.connectionName,
        data.node,
        data.vmid,
        data.vmname,
        data.type,
        data.netin,
        data.netout,
        data.total,
        data.timestamp
      ]);
    } catch (error) {
      console.error(`保存VM ${data.vmid} 流量数据失败:`, error.message);
      throw error;
    }
  }

  // 更新小时统计
  async updateHourlyStats(currentData, trafficDelta, hourKey) {
    try {
      // 检查连接是否存在
      const connectionCheck = await this.db.get(
        'SELECT id FROM pve_connections WHERE id = ?', 
        [currentData.connectionId]
      );
      
      if (!connectionCheck) {
        console.warn(`连接 ${currentData.connectionId} 不存在，跳过小时统计更新`);
        return null;
      }

      const sql = `
        INSERT INTO traffic_hourly 
        (vm_key, connection_id, connection_name, node, vmid, vmname, type, hour, netin, netout, total, collections, start_time, last_update)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(vm_key, hour) DO UPDATE SET
          netin = netin + ?,
          netout = netout + ?,
          total = total + ?,
          collections = collections + 1,
          last_update = ?
      `;

      const now = new Date().toISOString();
      await this.db.run(sql, [
        currentData.vmKey,
        currentData.connectionId,
        currentData.connectionName,
        currentData.node,
        currentData.vmid,
        currentData.vmname,
        currentData.type,
        hourKey,
        trafficDelta.netin,
        trafficDelta.netout,
        trafficDelta.total,
        now,
        now,
        trafficDelta.netin,
        trafficDelta.netout,
        trafficDelta.total,
        now
      ]);

      // 返回更新后的数据
      return await this.getVMHourlyTraffic(currentData.connectionId, currentData.node, currentData.vmid, hourKey);
    } catch (error) {
      console.error(`更新VM ${currentData.vmid} 小时统计失败:`, error.message);
      return null;
    }
  }

  // 更新日统计
  async updateDailyStats(currentData, trafficDelta, dayKey) {
    try {
      // 检查连接是否存在
      const connectionCheck = await this.db.get(
        'SELECT id FROM pve_connections WHERE id = ?', 
        [currentData.connectionId]
      );
      
      if (!connectionCheck) {
        console.warn(`连接 ${currentData.connectionId} 不存在，跳过日统计更新`);
        return null;
      }

      const sql = `
        INSERT INTO traffic_daily 
        (vm_key, connection_id, connection_name, node, vmid, vmname, type, day, netin, netout, total, collections, start_time, last_update)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(vm_key, day) DO UPDATE SET
          netin = netin + ?,
          netout = netout + ?,
          total = total + ?,
          collections = collections + 1,
          last_update = ?
      `;

      const now = new Date().toISOString();
      await this.db.run(sql, [
        currentData.vmKey,
        currentData.connectionId,
        currentData.connectionName,
        currentData.node,
        currentData.vmid,
        currentData.vmname,
        currentData.type,
        dayKey,
        trafficDelta.netin,
        trafficDelta.netout,
        trafficDelta.total,
        now,
        now,
        trafficDelta.netin,
        trafficDelta.netout,
        trafficDelta.total,
        now
      ]);

      // 返回更新后的数据
      return await this.getVMDailyTraffic(currentData.connectionId, currentData.node, currentData.vmid, dayKey);
    } catch (error) {
      console.error(`更新VM ${currentData.vmid} 日统计失败:`, error.message);
      return null;
    }
  }

  // 获取虚拟机当前流量统计
  async getVMCurrentTraffic(connectionId, node, vmid) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const sql = 'SELECT * FROM traffic_current WHERE vm_key = ?';
    return await this.db.get(sql, [vmKey]);
  }

  // 获取虚拟机小时流量统计
  async getVMHourlyTraffic(connectionId, node, vmid, hour = null) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const hourKey = hour || this.getHourKey();
    const sql = 'SELECT * FROM traffic_hourly WHERE vm_key = ? AND hour = ?';
    return await this.db.get(sql, [vmKey, hourKey]);
  }

  // 获取虚拟机日流量统计
  async getVMDailyTraffic(connectionId, node, vmid, day = null) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const dayKey = day || this.getDayKey();
    const sql = 'SELECT * FROM traffic_daily WHERE vm_key = ? AND day = ?';
    return await this.db.get(sql, [vmKey, dayKey]);
  }

  // 获取所有虚拟机的当前流量统计
  async getAllCurrentTraffic() {
    try {
      const sql = `
        SELECT vm_key, connection_id, node, vmid, vmname, type,
               netin, netout, total, timestamp
        FROM traffic_current 
        ORDER BY total DESC
      `;
      
      const results = await this.db.query(sql);
      
      return results.map(row => ({
        ...row,
        netinFormatted: this.formatBytes(row.netin),
        netoutFormatted: this.formatBytes(row.netout),
        totalFormatted: this.formatBytes(row.total)
      }));
    } catch (error) {
      console.warn('获取当前流量数据失败 (表可能不存在):', error.message);
      return [];
    }
  }

  // 获取所有虚拟机的小时流量统计
  async getAllHourlyTraffic(hour = null) {
    try {
      const hourKey = hour || this.getHourKey();
      const sql = `
        SELECT *, 
               netin as netin_raw,
               netout as netout_raw,
               total as total_raw
        FROM traffic_hourly 
        WHERE hour = ?
        ORDER BY total DESC
      `;
      
      const results = await this.db.query(sql, [hourKey]);
      
      return results.map(row => ({
        ...row,
        netinFormatted: this.formatBytes(row.netin),
        netoutFormatted: this.formatBytes(row.netout),
        totalFormatted: this.formatBytes(row.total)
      }));
    } catch (error) {
      console.warn('获取小时流量数据失败 (表可能不存在):', error.message);
      return [];
    }
  }

  // 获取所有虚拟机的日流量统计
  async getAllDailyTraffic(day = null) {
    try {
      const dayKey = day || this.getDayKey();
      const sql = `
        SELECT *, 
               netin as netin_raw,
               netout as netout_raw,
               total as total_raw
        FROM traffic_daily 
        WHERE day = ?
        ORDER BY total DESC
      `;
      
      const results = await this.db.query(sql, [dayKey]);
      
      return results.map(row => ({
        ...row,
        netinFormatted: this.formatBytes(row.netin),
        netoutFormatted: this.formatBytes(row.netout),
        totalFormatted: this.formatBytes(row.total)
      }));
    } catch (error) {
      console.warn('获取日流量数据失败 (表可能不存在):', error.message);
      return [];
    }
  }

  // 获取虚拟机历史流量趋势
  async getVMTrafficHistory(connectionId, node, vmid, hours = 24) {
    const vmKey = this.getVMKey(connectionId, node, vmid);
    const now = new Date();
    const results = [];

    for (let i = hours - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = this.getHourKey(time);
      
      const sql = 'SELECT * FROM traffic_hourly WHERE vm_key = ? AND hour = ?';
      const stats = await this.db.get(sql, [vmKey, hourKey]);
      
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

  // 清理旧数据
  async cleanupOldData(daysToKeep = 30) {
    return await this.db.cleanupOldData(daysToKeep);
  }

  // 获取统计摘要
  async getStatsSummary() {
    try {
      const [currentCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_current');
      const [hourlyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_hourly');
      const [dailyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_daily');

      return {
        totalVMs: currentCount.count,
        hourlyRecords: hourlyCount.count,
        dailyRecords: dailyCount.count,
        storage: 'database',
        database: {
          trafficData: currentCount.count,
          hourlyStats: hourlyCount.count,
          dailyStats: dailyCount.count
        }
      };
    } catch (error) {
      console.warn('获取流量统计失败 (表可能不存在):', error.message);
      return {
        totalVMs: 0,
        hourlyRecords: 0,
        dailyRecords: 0,
        storage: 'database',
        database: {
          trafficData: 0,
          hourlyStats: 0,
          dailyStats: 0
        }
      };
    }
  }

  // 清理指定连接的所有流量数据
  async cleanupConnectionData(connectionId) {
    try {
      const operations = [
        {
          sql: 'DELETE FROM traffic_current WHERE connection_id = ?',
          params: [connectionId]
        },
        {
          sql: 'DELETE FROM traffic_hourly WHERE connection_id = ?',
          params: [connectionId]
        },
        {
          sql: 'DELETE FROM traffic_daily WHERE connection_id = ?',
          params: [connectionId]
        }
      ];

      // 先统计要删除的记录数
      const [currentCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_current WHERE connection_id = ?', [connectionId]);
      const [hourlyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_hourly WHERE connection_id = ?', [connectionId]);
      const [dailyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_daily WHERE connection_id = ?', [connectionId]);

      const totalToDelete = currentCount.count + hourlyCount.count + dailyCount.count;

      // 执行删除操作
      await this.db.transaction(operations);

      console.log(`已清理连接 ${connectionId} 的流量数据: 当前${currentCount.count}条, 小时${hourlyCount.count}条, 日${dailyCount.count}条`);

      return {
        deleted: totalToDelete,
        current: currentCount.count,
        hourly: hourlyCount.count,
        daily: dailyCount.count
      };
    } catch (error) {
      console.error('清理连接流量数据失败:', error);
      throw error;
    }
  }

  // 获取虚拟机每小时流量详细记录
  async getVMHourlyRecords(connectionId = null, startDate = null, endDate = null) {
    try {
      let sql = `
        SELECT 
          vm_key as vmKey,
          connection_id as connectionId,
          connection_name as connectionName,
          node,
          vmid,
          vmname,
          type,
          hour,
          netin as networkIn,
          netout as networkOut,
          total,
          collections,
          start_time as startTime,
          last_update as lastUpdate
        FROM traffic_hourly
        WHERE 1=1
      `;
      
      const params = [];
      
      // 连接筛选
      if (connectionId && connectionId !== 'all') {
        sql += ' AND connection_id = ?';
        params.push(connectionId);
      }
      
      // 日期范围筛选
      if (startDate && endDate) {
        sql += ' AND hour >= ? AND hour <= ?';
        params.push(startDate + '-00');
        params.push(endDate + '-23');
      }
      
      sql += ' ORDER BY hour DESC, vmname ASC LIMIT 1000';
      
      const records = await this.db.query(sql, params);
      
      // 为每条记录添加唯一ID
      return records.map((record, index) => ({
        ...record,
        id: `hourly-${record.vmKey}-${record.hour}-${index}`
      }));
    } catch (error) {
      console.error('获取虚拟机每小时流量记录失败:', error);
      throw error;
    }
  }

  // 获取虚拟机每日流量详细记录
  async getVMDailyRecords(connectionId = null, startDate = null, endDate = null) {
    try {
      let sql = `
        SELECT 
          vm_key as vmKey,
          connection_id as connectionId,
          connection_name as connectionName,
          node,
          vmid,
          vmname,
          type,
          day as date,
          netin as networkIn,
          netout as networkOut,
          total,
          collections,
          start_time as startTime,
          last_update as lastUpdate
        FROM traffic_daily
        WHERE 1=1
      `;
      
      const params = [];
      
      // 连接筛选
      if (connectionId && connectionId !== 'all') {
        sql += ' AND connection_id = ?';
        params.push(connectionId);
      }
      
      // 日期范围筛选
      if (startDate && endDate) {
        sql += ' AND day >= ? AND day <= ?';
        params.push(startDate);
        params.push(endDate);
      }
      
      sql += ' ORDER BY day DESC, vmname ASC LIMIT 500';
      
      const records = await this.db.query(sql, params);
      
      // 为每条记录添加唯一ID
      return records.map((record, index) => ({
        ...record,
        id: `daily-${record.vmKey}-${record.date}-${index}`
      }));
    } catch (error) {
      console.error('获取虚拟机每日流量记录失败:', error);
      throw error;
    }
  }

  // 清理无效的流量数据（没有对应虚拟机的记录）
  async cleanupOrphanedData(activeVMs) {
    try {
      if (!activeVMs || activeVMs.length === 0) {
        // 如果没有活跃VM，清理所有数据
        const result = await this.cleanupAllData();
        return result;
      }

      // 构建活跃VM的key列表
      const activeVMKeys = activeVMs.map(vm => this.getVMKey(vm.connectionId, vm.node, vm.vmid));
      
      if (activeVMKeys.length === 0) {
        return { deleted: 0 };
      }

      // 构建SQL占位符
      const placeholders = activeVMKeys.map(() => '?').join(',');
      
      const operations = [
        {
          sql: `DELETE FROM traffic_current WHERE vm_key NOT IN (${placeholders})`,
          params: activeVMKeys
        },
        {
          sql: `DELETE FROM traffic_hourly WHERE vm_key NOT IN (${placeholders})`,
          params: activeVMKeys
        },
        {
          sql: `DELETE FROM traffic_daily WHERE vm_key NOT IN (${placeholders})`,
          params: activeVMKeys
        }
      ];

      // 先统计要删除的记录数
      const [currentCount] = await this.db.query(`SELECT COUNT(*) as count FROM traffic_current WHERE vm_key NOT IN (${placeholders})`, activeVMKeys);
      const [hourlyCount] = await this.db.query(`SELECT COUNT(*) as count FROM traffic_hourly WHERE vm_key NOT IN (${placeholders})`, activeVMKeys);
      const [dailyCount] = await this.db.query(`SELECT COUNT(*) as count FROM traffic_daily WHERE vm_key NOT IN (${placeholders})`, activeVMKeys);

      const totalToDelete = currentCount.count + hourlyCount.count + dailyCount.count;

      if (totalToDelete > 0) {
        await this.db.transaction(operations);
        console.log(`已清理无效流量数据: 当前${currentCount.count}条, 小时${hourlyCount.count}条, 日${dailyCount.count}条`);
      }

      return {
        deleted: totalToDelete,
        current: currentCount.count,
        hourly: hourlyCount.count,
        daily: dailyCount.count
      };
    } catch (error) {
      console.error('清理无效流量数据失败:', error);
      throw error;
    }
  }

  // 清理所有流量数据
  async cleanupAllData() {
    try {
      const operations = [
        { sql: 'DELETE FROM traffic_current', params: [] },
        { sql: 'DELETE FROM traffic_hourly', params: [] },
        { sql: 'DELETE FROM traffic_daily', params: [] }
      ];

      // 先统计记录数
      const [currentCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_current');
      const [hourlyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_hourly');
      const [dailyCount] = await this.db.query('SELECT COUNT(*) as count FROM traffic_daily');

      const totalToDelete = currentCount.count + hourlyCount.count + dailyCount.count;

      if (totalToDelete > 0) {
        await this.db.transaction(operations);
        console.log(`已清理所有流量数据: 当前${currentCount.count}条, 小时${hourlyCount.count}条, 日${dailyCount.count}条`);
      }

      return {
        deleted: totalToDelete,
        current: currentCount.count,
        hourly: hourlyCount.count,
        daily: dailyCount.count
      };
    } catch (error) {
      console.error('清理所有流量数据失败:', error);
      throw error;
    }
  }

}

module.exports = TrafficMonitorDB;