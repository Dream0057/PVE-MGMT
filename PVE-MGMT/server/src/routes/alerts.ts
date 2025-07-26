import { Express, Request, Response } from 'express';
import { PVEManager } from '../services/pve-manager';

// 告警等级
export enum AlertLevel {
  CRITICAL = 'critical',
  WARNING = 'warning', 
  INFO = 'info'
}

// 告警类型
export enum AlertType {
  PVE_SYSTEM = 'pve_system',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  SERVICE = 'service'
}

// 告警状态
export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved'
}

interface AlertItem {
  id: string;
  level: AlertLevel;
  type: AlertType;
  status: AlertStatus;
  title: string;
  description: string;
  source: string;
  connectionId?: string;
  connectionName?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

export function setupAlertRoutes(app: Express, pveManager: PVEManager, getDatabase: () => any) {
  
  // 获取告警列表
  app.get('/api/alerts', async (req: Request, res: Response) => {
    try {
      const { level, type, status, limit = 100 } = req.query;
      const database = getDatabase();
      
      let query = 'SELECT * FROM alerts WHERE 1=1';
      const params: any[] = [];
      
      if (level && level !== 'all') {
        query += ' AND level = ?';
        params.push(level);
      }
      
      if (type && type !== 'all') {
        query += ' AND type = ?';
        params.push(type);
      }
      
      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit as string));
      
      const alerts = await database.query(query, params);
      
      // 转换数据格式
      const formattedAlerts = alerts.map((alert: any) => ({
        ...alert,
        metadata: alert.metadata ? JSON.parse(alert.metadata) : null,
        createdAt: alert.created_at,
        updatedAt: alert.updated_at,
        acknowledgedAt: alert.acknowledged_at,
        acknowledgedBy: alert.acknowledged_by,
        resolvedAt: alert.resolved_at,
      }));
      
      res.json(formattedAlerts);
    } catch (error: any) {
      console.error('获取告警列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 创建告警
  app.post('/api/alerts', async (req: Request, res: Response) => {
    try {
      const {
        level,
        type,
        title,
        description,
        source,
        connectionId,
        connectionName,
        metadata
      } = req.body;
      
      const database = getDatabase();
      const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await database.run(`
        INSERT INTO alerts (
          id, level, type, status, title, description, source,
          connection_id, connection_name, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        id, level, type, AlertStatus.ACTIVE, title, description, source,
        connectionId, connectionName, metadata ? JSON.stringify(metadata) : null
      ]);
      
      res.json({ success: true, id, insertId: result.id });
    } catch (error: any) {
      console.error('创建告警失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 确认告警
  app.post('/api/alerts/:id/acknowledge', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { acknowledgedBy = 'system' } = req.body;
      const database = getDatabase();
      
      await database.run(`
        UPDATE alerts 
        SET status = ?, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [AlertStatus.ACKNOWLEDGED, acknowledgedBy, id]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('确认告警失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 解决告警
  app.post('/api/alerts/:id/resolve', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const database = getDatabase();
      
      await database.run(`
        UPDATE alerts 
        SET status = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [AlertStatus.RESOLVED, id]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('解决告警失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 删除告警
  app.delete('/api/alerts/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const database = getDatabase();
      
      await database.run('DELETE FROM alerts WHERE id = ?', [id]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('删除告警失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 获取告警统计
  app.get('/api/alerts/stats', async (req: Request, res: Response) => {
    try {
      const database = getDatabase();
      
      const stats = await database.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warning,
          SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) as acknowledged,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
        FROM alerts
      `);
      
      res.json(stats[0] || {});
    } catch (error: any) {
      console.error('获取告警统计失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 批量操作告警
  app.post('/api/alerts/batch', async (req: Request, res: Response) => {
    try {
      const { action, ids } = req.body;
      const database = getDatabase();
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '无效的告警ID列表' });
      }
      
      const placeholders = ids.map(() => '?').join(',');
      
      switch (action) {
        case 'acknowledge':
          await database.run(`
            UPDATE alerts 
            SET status = ?, acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
          `, [AlertStatus.ACKNOWLEDGED, ...ids]);
          break;
          
        case 'resolve':
          await database.run(`
            UPDATE alerts 
            SET status = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
          `, [AlertStatus.RESOLVED, ...ids]);
          break;
          
        case 'delete':
          await database.run(`DELETE FROM alerts WHERE id IN (${placeholders})`, ids);
          break;
          
        default:
          return res.status(400).json({ error: '不支持的操作类型' });
      }
      
      res.json({ success: true, affected: ids.length });
    } catch (error: any) {
      console.error('批量操作告警失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// 告警生成器类
export class AlertGenerator {
  private database: any;
  private pveManager: PVEManager;
  
  constructor(database: any, pveManager: PVEManager) {
    this.database = database;
    this.pveManager = pveManager;
  }

  // 创建告警
  async createAlert(
    level: AlertLevel,
    type: AlertType,
    title: string,
    description: string,
    source: string,
    connectionId?: string,
    connectionName?: string,
    metadata?: any
  ): Promise<string> {
    const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await this.database.run(`
        INSERT INTO alerts (
          id, level, type, status, title, description, source,
          connection_id, connection_name, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        id, level, type, AlertStatus.ACTIVE, title, description, source,
        connectionId, connectionName, metadata ? JSON.stringify(metadata) : null
      ]);
      
      console.log(`创建告警: ${title} | ${description}`);
      return id;
    } catch (error) {
      console.error('创建告警失败:', error);
      throw error;
    }
  }

  // 检查PVE系统告警
  async checkPVESystemAlerts() {
    const connections = this.pveManager.getAllConnections();
    
    for (const connection of connections) {
      try {
        // 检查连接状态
        if (connection.status !== 'connected') {
          await this.createAlert(
            AlertLevel.CRITICAL,
            AlertType.PVE_SYSTEM,
            'PVE连接断开',
            `PVE连接 "${connection.name}" 无法连接`,
            connection.name,
            connection.id,
            connection.name,
            {
              host: (connection as any).host || 'unknown',
              port: (connection as any).port || 8006,
              lastError: connection.lastError
            }
          );
          continue;
        }
        
        // 检查节点状态
        const nodes = await this.pveManager.executeOnConnection(connection.id, 
          (client) => client.getNodes()
        );
        
        for (const node of nodes) {
          if (node.status !== 'online') {
            await this.createAlert(
              AlertLevel.CRITICAL,
              AlertType.PVE_SYSTEM,
              '节点离线',
              `节点 "${node.node}" 处于 ${node.status} 状态`,
              node.node,
              connection.id,
              connection.name,
              {
                nodeStatus: node.status,
                uptime: node.uptime,
                load: (node as any).load
              }
            );
          }
          
          // 检查磁盘使用率
          if (node.disk && node.maxdisk) {
            const diskUsage = (node.disk / node.maxdisk) * 100;
            if (diskUsage > 90) {
              await this.createAlert(
                AlertLevel.CRITICAL,
                AlertType.PERFORMANCE,
                '磁盘空间不足',
                `节点 "${node.node}" 磁盘使用率 ${diskUsage.toFixed(1)}%`,
                node.node,
                connection.id,
                connection.name,
                {
                  diskUsage: diskUsage.toFixed(1),
                  diskUsed: this.formatBytes(node.disk),
                  diskTotal: this.formatBytes(node.maxdisk)
                }
              );
            } else if (diskUsage > 80) {
              await this.createAlert(
                AlertLevel.WARNING,
                AlertType.PERFORMANCE,
                '磁盘空间警告',
                `节点 "${node.node}" 磁盘使用率 ${diskUsage.toFixed(1)}%`,
                node.node,
                connection.id,
                connection.name,
                {
                  diskUsage: diskUsage.toFixed(1),
                  diskUsed: this.formatBytes(node.disk),
                  diskTotal: this.formatBytes(node.maxdisk)
                }
              );
            }
          }
          
          // 检查内存使用率
          if (node.mem && node.maxmem) {
            const memUsage = (node.mem / node.maxmem) * 100;
            if (memUsage > 95) {
              await this.createAlert(
                AlertLevel.CRITICAL,
                AlertType.PERFORMANCE,
                '内存使用率过高',
                `节点 "${node.node}" 内存使用率 ${memUsage.toFixed(1)}%`,
                node.node,
                connection.id,
                connection.name,
                {
                  memUsage: memUsage.toFixed(1),
                  memUsed: this.formatBytes(node.mem),
                  memTotal: this.formatBytes(node.maxmem)
                }
              );
            } else if (memUsage > 85) {
              await this.createAlert(
                AlertLevel.WARNING,
                AlertType.PERFORMANCE,
                '内存使用率警告',
                `节点 "${node.node}" 内存使用率 ${memUsage.toFixed(1)}%`,
                node.node,
                connection.id,
                connection.name,
                {
                  memUsage: memUsage.toFixed(1),
                  memUsed: this.formatBytes(node.mem),
                  memTotal: this.formatBytes(node.maxmem)
                }
              );
            }
          }
          
          // 检查CPU使用率
          if (node.cpu !== undefined) {
            const cpuUsage = node.cpu * 100;
            if (cpuUsage > 90) {
              await this.createAlert(
                AlertLevel.WARNING,
                AlertType.PERFORMANCE,
                'CPU使用率过高',
                `节点 "${node.node}" CPU使用率 ${cpuUsage.toFixed(1)}%`,
                node.node,
                connection.id,
                connection.name,
                {
                  cpuUsage: cpuUsage.toFixed(1),
                  load: (node as any).load
                }
              );
            }
          }
        }
        
        // 检查VM状态
        const vms = await this.pveManager.executeOnConnection(connection.id,
          (client) => client.getVMs()
        );
        
        for (const vm of vms) {
          // 检查VM异常状态
          if (!(vm as any).template && vm.status && !['running', 'stopped'].includes(vm.status)) {
            await this.createAlert(
              AlertLevel.WARNING,
              AlertType.PVE_SYSTEM,
              'VM状态异常',
              `虚拟机 "${vm.name}" (${vm.vmid}) 状态: ${vm.status}`,
              `${vm.name} (${vm.vmid})`,
              connection.id,
              connection.name,
              {
                vmid: vm.vmid,
                vmname: vm.name,
                vmtype: vm.type,
                vmstatus: vm.status,
                node: vm.node
              }
            );
          }
        }
        
      } catch (error: any) {
        console.error(`检查连接 ${connection.id} 的告警失败:`, error.message);
        
        // 为连接错误创建告警
        await this.createAlert(
          AlertLevel.CRITICAL,
          AlertType.SERVICE,
          'PVE连接错误',
          `检查连接 "${connection.name}" 时发生错误: ${error.message}`,
          connection.name,
          connection.id,
          connection.name,
          {
            error: error.message,
            timestamp: new Date().toISOString()
          }
        );
      }
    }
  }

  // 自动解决已恢复的告警
  async autoResolveAlerts() {
    try {
      // 检查连接恢复的告警
      const connections = this.pveManager.getAllConnections();
      const connectedIds = connections
        .filter(conn => conn.status === 'connected')
        .map(conn => conn.id);
      
      if (connectedIds.length > 0) {
        const placeholders = connectedIds.map(() => '?').join(',');
        await this.database.run(`
          UPDATE alerts 
          SET status = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE type = ? AND title IN ('PVE连接断开', 'PVE连接错误') 
          AND connection_id IN (${placeholders}) AND status = ?
        `, [AlertStatus.RESOLVED, AlertType.PVE_SYSTEM, ...connectedIds, AlertStatus.ACTIVE]);
      }
      
      // 检查节点恢复的告警
      for (const connection of connections) {
        if (connection.status === 'connected') {
          try {
            const nodes = await this.pveManager.executeOnConnection(connection.id, 
              (client) => client.getNodes()
            );
            
            const onlineNodes = nodes.filter(node => node.status === 'online').map(node => node.node);
            if (onlineNodes.length > 0) {
              const placeholders = onlineNodes.map(() => '?').join(',');
              await this.database.run(`
                UPDATE alerts 
                SET status = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE type = ? AND title = '节点离线' 
                AND connection_id = ? AND source IN (${placeholders}) AND status = ?
              `, [AlertStatus.RESOLVED, AlertType.PVE_SYSTEM, connection.id, ...onlineNodes, AlertStatus.ACTIVE]);
            }
          } catch (error) {
            // 忽略检查错误
          }
        }
      }
      
    } catch (error) {
      console.error('自动解决告警失败:', error);
    }
  }

  // 清理旧告警
  async cleanupOldAlerts(daysToKeep: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await this.database.run(`
        DELETE FROM alerts 
        WHERE status = ? AND created_at < ?
      `, [AlertStatus.RESOLVED, cutoffDate.toISOString()]);
      
      console.log(`清理了 ${result.changes} 条已解决的告警记录`);
      return result.changes;
    } catch (error) {
      console.error('清理旧告警失败:', error);
      throw error;
    }
  }

  // 格式化字节数
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}