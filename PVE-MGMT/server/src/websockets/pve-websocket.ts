import { Server as SocketIOServer, Socket } from 'socket.io';
import { PVEManager } from '../services/pve-manager';

export function setupWebSocketHandlers(io: SocketIOServer, pveManager: PVEManager, trafficMonitor?: any) {
  io.on('connection', (socket: Socket) => {
    console.log(`WebSocket客户端连接: ${socket.id}`);

    // 发送连接统计
    socket.emit('connection-stats', pveManager.getConnectionStats());

    // 监听PVE事件并转发给客户端
    const forwardEvent = (eventName: string) => {
      pveManager.on(eventName, (data) => {
        socket.emit(eventName, data);
      });
    };

    // 注册事件监听
    forwardEvent('connection-added');
    forwardEvent('connection-removed');
    forwardEvent('connection-error');
    forwardEvent('connection-status-changed');
    forwardEvent('resource-update');

    // 处理客户端请求
    socket.on('get-connections', () => {
      const connections = pveManager.getAllConnections().map(conn => ({
        id: conn.id,
        name: conn.name,
        status: conn.status,
        lastConnected: conn.lastConnected,
        lastError: conn.lastError
      }));
      socket.emit('connections', connections);
    });

    socket.on('get-vms', async () => {
      try {
        const vms = await pveManager.getAllVMs();
        socket.emit('vms', vms);
      } catch (error: any) {
        socket.emit('error', { message: error.message, type: 'get-vms' });
      }
    });

    socket.on('get-nodes', async () => {
      try {
        const nodes = await pveManager.getAllNodes();
        socket.emit('nodes', nodes);
      } catch (error: any) {
        socket.emit('error', { message: error.message, type: 'get-nodes' });
      }
    });

    // VM操作
    socket.on('vm-action', async (data) => {
      try {
        const { connectionId, vmid, node, type, action } = data;
        
        let result;
        switch (action) {
          case 'start':
            result = await pveManager.executeOnConnection(connectionId, (client) =>
              client.startVM(node, vmid, type)
            );
            break;
          case 'stop':
            result = await pveManager.executeOnConnection(connectionId, (client) =>
              client.stopVM(node, vmid, type)
            );
            break;
          case 'shutdown':
            result = await pveManager.executeOnConnection(connectionId, (client) =>
              client.shutdownVM(node, vmid, type)
            );
            break;
          case 'suspend':
            if (type === 'qemu') {
              result = await pveManager.executeOnConnection(connectionId, (client) =>
                client.suspendVM(node, vmid)
              );
            } else {
              throw new Error('只有QEMU虚拟机支持挂起操作');
            }
            break;
          case 'resume':
            if (type === 'qemu') {
              result = await pveManager.executeOnConnection(connectionId, (client) =>
                client.resumeVM(node, vmid)
              );
            } else {
              throw new Error('只有QEMU虚拟机支持恢复操作');
            }
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
      } catch (error: any) {
        socket.emit('vm-action-result', {
          success: false,
          error: error.message,
          action: data.action,
          vmid: data.vmid
        });
      }
    });

    // 获取VM状态
    socket.on('get-vm-status', async (data) => {
      try {
        const { connectionId, vmid, node, type } = data;
        const status = await pveManager.executeOnConnection(connectionId, (client) =>
          client.getVMStatus(node, vmid, type)
        );
        socket.emit('vm-status', { vmid, status });
      } catch (error: any) {
        socket.emit('error', { 
          message: error.message, 
          type: 'get-vm-status',
          vmid: data.vmid 
        });
      }
    });

    // 获取任务状态
    socket.on('get-task-status', async (data) => {
      try {
        const { connectionId, node, upid } = data;
        const status = await pveManager.executeOnConnection(connectionId, (client) =>
          client.getTaskStatus(node, upid)
        );
        socket.emit('task-status', { upid, status });
      } catch (error: any) {
        socket.emit('error', { 
          message: error.message, 
          type: 'get-task-status',
          upid: data.upid 
        });
      }
    });

    // 订阅资源监控
    socket.on('subscribe-monitoring', (data) => {
      const { connectionIds = [], interval = 30000 } = data;
      
      // 为指定连接启动更频繁的监控
      const monitoringTimer = setInterval(async () => {
        for (const connectionId of connectionIds) {
          try {
            const connection = pveManager.getConnection(connectionId);
            if (connection && connection.status === 'connected') {
              const nodes = await connection.client.getNodes();
              const vms = await connection.client.getVMs();
              
              socket.emit('monitoring-data', {
                connectionId,
                timestamp: new Date(),
                nodes,
                vms
              });
            }
          } catch (error: any) {
            socket.emit('monitoring-error', {
              connectionId,
              error: error.message
            });
          }
        }
      }, interval);

      // 存储定时器引用以便清理
      socket.data.monitoringTimer = monitoringTimer;
    });

    // 取消监控订阅
    socket.on('unsubscribe-monitoring', () => {
      if (socket.data.monitoringTimer) {
        clearInterval(socket.data.monitoringTimer);
        socket.data.monitoringTimer = null;
      }
    });


    // 连接断开处理
    socket.on('disconnect', () => {
      console.log(`WebSocket客户端断开: ${socket.id}`);
      
      // 清理定时器
      if (socket.data.monitoringTimer) {
        clearInterval(socket.data.monitoringTimer);
      }
      
      // 移除事件监听器
      pveManager.removeAllListeners('connection-added');
      pveManager.removeAllListeners('connection-removed');
      pveManager.removeAllListeners('connection-error');
      pveManager.removeAllListeners('connection-status-changed');
      pveManager.removeAllListeners('resource-update');
    });

    // 错误处理
    socket.on('error', (error) => {
      console.error(`WebSocket错误 ${socket.id}:`, error);
    });
  });

  // 全局PVE事件监听 - 广播给所有连接的客户端
  pveManager.on('resource-update', (data) => {
    io.emit('global-resource-update', data);
  });

  pveManager.on('connection-status-changed', (data) => {
    io.emit('connection-status-changed', data);
  });

  console.log('WebSocket处理器设置完成');
}