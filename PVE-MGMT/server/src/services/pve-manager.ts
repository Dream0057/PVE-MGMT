import { PVEApiClient } from './pve-api';
import { PVEConfig } from '../config/pve';
import { EventEmitter } from 'events';

export interface PVEConnection {
  id: string;
  name: string;
  config: PVEConfig;
  client: PVEApiClient;
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
  lastConnected?: Date;
}

export class PVEManager extends EventEmitter {
  private connections: Map<string, PVEConnection> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  async addConnection(id: string, name: string, config: PVEConfig): Promise<boolean> {
    try {
      const client = new PVEApiClient(config);
      
      // 测试连接
      const isConnected = await client.testConnection();
      
      const connection: PVEConnection = {
        id,
        name,
        config,
        client,
        status: isConnected ? 'connected' : 'error',
        lastConnected: isConnected ? new Date() : undefined,
        lastError: isConnected ? undefined : '连接测试失败'
      };

      this.connections.set(id, connection);
      
      this.emit('connection-added', { id, name, status: connection.status });
      
      return isConnected;
    } catch (error: any) {
      const connection: PVEConnection = {
        id,
        name,
        config,
        client: new PVEApiClient(config),
        status: 'error',
        lastError: error.message
      };

      this.connections.set(id, connection);
      this.emit('connection-error', { id, error: error.message });
      
      return false;
    }
  }

  removeConnection(id: string): boolean {
    const connection = this.connections.get(id);
    if (connection) {
      connection.client.disconnect();
      this.connections.delete(id);
      this.emit('connection-removed', { id });
      return true;
    }
    return false;
  }

  getConnection(id: string): PVEConnection | undefined {
    return this.connections.get(id);
  }

  getAllConnections(): PVEConnection[] {
    return Array.from(this.connections.values());
  }

  getConnectedClients(): PVEApiClient[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected')
      .map(conn => conn.client);
  }

  async testConnection(id: string): Promise<boolean> {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`连接 ${id} 不存在`);
    }

    try {
      const isConnected = await connection.client.testConnection();
      connection.status = isConnected ? 'connected' : 'error';
      connection.lastConnected = isConnected ? new Date() : connection.lastConnected;
      connection.lastError = isConnected ? undefined : '连接测试失败';
      
      this.emit('connection-status-changed', { 
        id, 
        status: connection.status,
        error: connection.lastError 
      });
      
      return isConnected;
    } catch (error: any) {
      connection.status = 'error';
      connection.lastError = error.message;
      
      this.emit('connection-error', { id, error: error.message });
      
      return false;
    }
  }

  async getAllVMs(): Promise<any[]> {
    const allVMs: any[] = [];
    
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        try {
          const vms = await connection.client.getVMs();
          allVMs.push(...vms.map(vm => ({
            ...vm,
            connectionId: connection.id,
            connectionName: connection.name
          })));
        } catch (error: any) {
          console.error(`获取连接 ${connection.id} 的虚拟机失败:`, error.message);
          connection.status = 'error';
          connection.lastError = error.message;
          this.emit('connection-error', { id: connection.id, error: error.message });
        }
      }
    }
    
    return allVMs;
  }

  async getAllNodes(): Promise<any[]> {
    const allNodes: any[] = [];
    
    for (const connection of this.connections.values()) {
      if (connection.status === 'connected') {
        try {
          const nodes = await connection.client.getNodes();
          allNodes.push(...nodes.map(node => ({
            ...node,
            connectionId: connection.id,
            connectionName: connection.name
          })));
        } catch (error: any) {
          console.error(`获取连接 ${connection.id} 的节点失败:`, error.message);
        }
      }
    }
    
    return allNodes;
  }

  async executeOnConnection<T>(
    connectionId: string, 
    operation: (client: PVEApiClient) => Promise<T>
  ): Promise<T> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`连接 ${connectionId} 不存在`);
    }

    if (connection.status !== 'connected') {
      // 尝试重新连接
      await this.testConnection(connectionId);
      const updatedConnection = this.connections.get(connectionId);
      if (!updatedConnection || updatedConnection.status !== 'connected') {
        throw new Error(`连接 ${connectionId} 不可用: ${connection.lastError}`);
      }
    }

    try {
      return await operation(connection.client);
    } catch (error: any) {
      connection.status = 'error';
      connection.lastError = error.message;
      this.emit('connection-error', { id: connectionId, error: error.message });
      throw error;
    }
  }

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      for (const [id, connection] of this.connections) {
        if (connection.status === 'connected') {
          try {
            await connection.client.getVersion();
            // 获取最新资源数据
            const nodes = await connection.client.getNodes();
            this.emit('resource-update', { 
              connectionId: id, 
              nodes,
              timestamp: new Date()
            });
          } catch (error: any) {
            connection.status = 'error';
            connection.lastError = error.message;
            this.emit('connection-error', { id, error: error.message });
          }
        }
      }
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  getConnectionStats(): any {
    const total = this.connections.size;
    const connected = Array.from(this.connections.values())
      .filter(conn => conn.status === 'connected').length;
    const disconnected = Array.from(this.connections.values())
      .filter(conn => conn.status === 'disconnected').length;
    const error = Array.from(this.connections.values())
      .filter(conn => conn.status === 'error').length;

    return {
      total,
      connected,
      disconnected,
      error,
      healthRatio: total > 0 ? connected / total : 0
    };
  }

  destroy(): void {
    this.stopMonitoring();
    for (const connection of this.connections.values()) {
      connection.client.disconnect();
    }
    this.connections.clear();
    this.removeAllListeners();
  }
}