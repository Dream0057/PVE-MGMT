import { Express, Request, Response } from 'express';
import { PVEManager } from '../services/pve-manager';
import { PVEConfig, defaultPVEConfig } from '../config/pve';

const database = require('../db/database');

export function setupPVERoutes(app: Express, pveManager: PVEManager) {
  // 获取所有连接
  app.get('/api/pve/connections', (req, res) => {
    try {
      const connections = pveManager.getAllConnections().map(conn => ({
        id: conn.id,
        name: conn.name,
        status: conn.status,
        lastConnected: conn.lastConnected,
        lastError: conn.lastError,
        host: conn.config.host,
        port: conn.config.port
      }));
      res.json(connections);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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

      const config: PVEConfig = {
        host,
        port: port || defaultPVEConfig.port!,
        username,
        password,
        realm: realm || defaultPVEConfig.realm!,
        ssl: ssl !== undefined ? ssl : defaultPVEConfig.ssl!,
        timeout: defaultPVEConfig.timeout!
      };

      const success = await pveManager.addConnection(id, name, config);
      
      if (success) {
        // 保存连接到数据库
        try {
          await database.run(`
            INSERT OR REPLACE INTO pve_connections 
            (id, name, host, port, username, password, realm, ssl, status, last_connected, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [id, name, host, port, username, password, realm, ssl ? 1 : 0]);
          console.log(`连接 ${name} (${id}) 已保存到数据库`);
        } catch (dbError: any) {
          console.error(`保存连接到数据库失败:`, dbError.message);
        }
        
        res.json({ 
          success: true, 
          message: `连接 ${name} 添加成功`,
          id 
        });
      } else {
        res.status(400).json({ 
          error: `连接 ${name} 添加失败，请检查配置` 
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 删除PVE连接
  app.delete('/api/pve/connections/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const success = pveManager.removeConnection(id);
      
      if (success) {
        // 从数据库中删除连接记录
        try {
          await database.run('DELETE FROM pve_connections WHERE id = ?', [id]);
          console.log(`连接 ${id} 已从数据库删除`);
        } catch (dbError: any) {
          console.error(`从数据库删除连接失败:`, dbError.message);
        }
        
        res.json({ success: true, message: `连接 ${id} 删除成功` });
      } else {
        res.status(404).json({ error: `连接 ${id} 不存在` });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 测试PVE连接
  app.post('/api/pve/connections/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const success = await pveManager.testConnection(id);
      
      res.json({ 
        success, 
        message: success ? '连接测试成功' : '连接测试失败' 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取所有节点
  app.get('/api/pve/nodes', async (req, res) => {
    try {
      const nodes = await pveManager.getAllNodes();
      res.json(nodes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取所有虚拟机
  app.get('/api/pve/vms', async (req, res) => {
    try {
      const vms = await pveManager.getAllVMs();
      res.json(vms);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取特定连接的虚拟机
  app.get('/api/pve/connections/:id/vms', async (req, res) => {
    try {
      const { id } = req.params;
      const vms = await pveManager.executeOnConnection(id, (client) => client.getVMs());
      res.json(vms);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取虚拟机状态
  app.get('/api/pve/connections/:id/vms/:vmid/status', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.query;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }

      const status = await pveManager.executeOnConnection(id, (client) => 
        client.getVMStatus(node as string, parseInt(vmid), type as 'qemu' | 'lxc')
      );
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 启动虚拟机
  app.post('/api/pve/connections/:id/vms/:vmid/start', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.body;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.startVM(node, parseInt(vmid), type)
      );
      res.json({ taskId, message: '启动命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 停止虚拟机
  app.post('/api/pve/connections/:id/vms/:vmid/stop', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.body;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.stopVM(node, parseInt(vmid), type)
      );
      res.json({ taskId, message: '停止命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 关闭虚拟机
  app.post('/api/pve/connections/:id/vms/:vmid/shutdown', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.body;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.shutdownVM(node, parseInt(vmid), type)
      );
      res.json({ taskId, message: '关闭命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 挂起虚拟机 (仅QEMU)
  app.post('/api/pve/connections/:id/vms/:vmid/suspend', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node } = req.body;
      
      if (!node) {
        return res.status(400).json({ error: '缺少参数: node' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.suspendVM(node, parseInt(vmid))
      );
      res.json({ taskId, message: '挂起命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 恢复虚拟机 (仅QEMU)
  app.post('/api/pve/connections/:id/vms/:vmid/resume', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node } = req.body;
      
      if (!node) {
        return res.status(400).json({ error: '缺少参数: node' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.resumeVM(node, parseInt(vmid))
      );
      res.json({ taskId, message: '恢复命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 删除虚拟机
  app.delete('/api/pve/connections/:id/vms/:vmid', async (req, res) => {
    try {
      const { id, vmid } = req.params;
      const { node, type } = req.query;
      
      if (!node || !type) {
        return res.status(400).json({ error: '缺少参数: node, type' });
      }

      const taskId = await pveManager.executeOnConnection(id, (client) => 
        client.deleteVM(node as string, parseInt(vmid), type as 'qemu' | 'lxc')
      );
      res.json({ taskId, message: '删除命令已发送' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取任务状态
  app.get('/api/pve/connections/:id/tasks/:upid/status', async (req, res) => {
    try {
      const { id, upid } = req.params;
      const { node } = req.query;
      
      if (!node) {
        return res.status(400).json({ error: '缺少参数: node' });
      }

      const status = await pveManager.executeOnConnection(id, (client) => 
        client.getTaskStatus(node as string, upid)
      );
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取集群资源
  app.get('/api/pve/connections/:id/resources', async (req, res) => {
    try {
      const { id } = req.params;
      const resources = await pveManager.executeOnConnection(id, (client) => 
        client.getClusterResources()
      );
      res.json(resources);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取存储信息
  app.get('/api/pve/connections/:id/storages', async (req, res) => {
    try {
      const { id } = req.params;
      const { node } = req.query;
      
      const storages = await pveManager.executeOnConnection(id, (client) => 
        client.getStorages(node as string)
      );
      res.json(storages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}