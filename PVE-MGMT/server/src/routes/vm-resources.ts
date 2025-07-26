import { Express, Request, Response } from 'express';
import { PVEManager } from '../services/pve-manager';

// 并发控制函数
async function promiseAllWithLimit<T>(promises: Promise<T>[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < promises.length; i += limit) {
    const batch = promises.slice(i, i + limit);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  return results;
}

export function setupVMResourceRoutes(app: Express, pveManager: PVEManager) {
  
  // 获取所有VM的资源使用情况概览
  app.get('/api/pve/vm-resources/overview', async (req: Request, res: Response) => {
    try {
      const vmResources: any[] = [];
      const connections = pveManager.getAllConnections().filter(c => c.status === 'connected');
      
      // 并行处理所有连接
      const connectionPromises = connections.map(async (connection) => {
        try {
          const vms = await pveManager.executeOnConnection(connection.id, (client) => client.getVMs());
          
          // 批量获取每个VM的详细状态和资源信息（并行处理，限制并发数）
          const vmPromises = vms.map(async (vm: any) => {
            try {
              // 对于停止的VM，跳过状态查询以提高性能
              let status: any = {};
              if (vm.status === 'running') {
                status = await pveManager.executeOnConnection(connection.id, (client) => 
                  client.getVMStatus(vm.node, vm.vmid, vm.type)
                );
              }
              
              return {
                id: `${connection.id}-${vm.node}-${vm.vmid}`,
                connectionId: connection.id,
                connectionName: connection.name,
                node: vm.node,
                vmid: vm.vmid,
                name: vm.name,
                type: vm.type,
                status: vm.status,
                // 基础资源信息
                cpu: status.cpu || 0,
                maxcpu: status.maxcpu || vm.maxcpu || 1,
                cpuPercent: status.cpu ? (status.cpu * 100) : 0,
                mem: status.mem || 0,
                maxmem: status.maxmem || vm.maxmem || 0,
                memPercent: status.mem && status.maxmem ? (status.mem / status.maxmem * 100) : 0,
                disk: status.disk || vm.disk || 0,
                maxdisk: status.maxdisk || vm.maxdisk || 0,
                diskPercent: status.disk && status.maxdisk ? (status.disk / status.maxdisk * 100) : 0,
                uptime: status.uptime || 0,
                // 网络信息
                netin: status.netin || 0,
                netout: status.netout || 0,
                // 磁盘IO
                diskread: status.diskread || 0,
                diskwrite: status.diskwrite || 0,
                // 格式化显示
                memFormatted: formatBytes(status.mem || 0),
                maxmemFormatted: formatBytes(status.maxmem || vm.maxmem || 0),
                diskFormatted: formatBytes(status.disk || vm.disk || 0),
                maxdiskFormatted: formatBytes(status.maxdisk || vm.maxdisk || 0),
                uptimeFormatted: formatUptime(status.uptime || 0),
                lastUpdate: new Date().toISOString()
              };
            } catch (error: any) {
              console.error(`获取VM ${vm.vmid} 状态失败:`, error.message);
              return {
                id: `${connection.id}-${vm.node}-${vm.vmid}`,
                connectionId: connection.id,
                connectionName: connection.name,
                node: vm.node,
                vmid: vm.vmid,
                name: vm.name,
                type: vm.type,
                status: vm.status,
                cpu: 0,
                maxcpu: vm.maxcpu || 1,
                cpuPercent: 0,
                mem: 0,
                maxmem: vm.maxmem || 0,
                memPercent: 0,
                disk: vm.disk || 0,
                maxdisk: vm.maxdisk || 0,
                diskPercent: 0,
                uptime: 0,
                netin: 0,
                netout: 0,
                diskread: 0,
                diskwrite: 0,
                memFormatted: '0 B',
                maxmemFormatted: formatBytes(vm.maxmem || 0),
                diskFormatted: formatBytes(vm.disk || 0),
                maxdiskFormatted: formatBytes(vm.maxdisk || 0),
                uptimeFormatted: '0s',
                lastUpdate: new Date().toISOString(),
                error: error.message
              };
            }
          });
          
          // 限制并发数量为5，避免过多同时请求导致性能问题
          const vmResults = await promiseAllWithLimit(vmPromises, 5);
          return vmResults;
        } catch (error: any) {
          console.error(`获取连接 ${connection.id} 的VM列表失败:`, error.message);
          return [];
        }
      });
      
      const allVMResults = await Promise.all(connectionPromises);
      vmResources.push(...allVMResults.flat());
      
      // 计算汇总统计
      const totalVMs = vmResources.length;
      const runningVMs = vmResources.filter(vm => vm.status === 'running').length;
      const stoppedVMs = vmResources.filter(vm => vm.status === 'stopped').length;
      const suspendedVMs = vmResources.filter(vm => vm.status === 'suspended').length;
      
      // 分别统计所有VM的配额和运行中VM的实际使用量
      const runningVMsData = vmResources.filter(vm => vm.status === 'running');
      
      // 总配额统计（包括所有VM，不仅仅是运行中的）
      const totalCPUs = vmResources.reduce((sum, vm) => sum + (vm.maxcpu || 0), 0);
      const totalMemory = vmResources.reduce((sum, vm) => sum + (vm.maxmem || 0), 0);
      const totalDisk = vmResources.reduce((sum, vm) => sum + (vm.maxdisk || 0), 0);
      
      // 实际使用量统计（只统计运行中的VM）
      const usedCPUCores = runningVMsData.reduce((sum, vm) => sum + (vm.cpu || 0), 0);
      const usedMemory = runningVMsData.reduce((sum, vm) => sum + (vm.mem || 0), 0);
      const usedDisk = runningVMsData.reduce((sum, vm) => sum + (vm.disk || 0), 0);
      
      // 运行中VM的总配额（用于计算使用率）
      const runningTotalCPUs = runningVMsData.reduce((sum, vm) => sum + (vm.maxcpu || 0), 0);
      const runningTotalMemory = runningVMsData.reduce((sum, vm) => sum + (vm.maxmem || 0), 0);
      const runningTotalDisk = runningVMsData.reduce((sum, vm) => sum + (vm.maxdisk || 0), 0);
      
      const overview = {
        totalVMs,
        runningVMs,
        stoppedVMs,
        suspendedVMs,
        // 配额信息（所有VM的资源配额总和）
        totalCPUs,
        totalMemory,
        totalDisk,
        // 实际使用情况（只统计运行中VM的实际使用量）
        usedCPUs: Number(usedCPUCores.toFixed(2)),
        usedMemory,
        usedDisk,
        // 运行中VM的配额（用于计算使用率）
        runningTotalCPUs: runningTotalCPUs,
        runningTotalMemory: runningTotalMemory,
        runningTotalDisk: runningTotalDisk,
        // 使用率计算（实际使用量 / 运行中VM配额）
        cpuUsagePercent: Number((runningTotalCPUs > 0 ? (usedCPUCores / runningTotalCPUs * 100) : 0).toFixed(2)),
        memoryUsagePercent: Number((runningTotalMemory > 0 ? (usedMemory / runningTotalMemory * 100) : 0).toFixed(2)),
        diskUsagePercent: Number((runningTotalDisk > 0 ? (usedDisk / runningTotalDisk * 100) : 0).toFixed(2)),
        // 格式化显示
        totalMemoryFormatted: formatBytes(totalMemory),
        usedMemoryFormatted: formatBytes(usedMemory),
        totalDiskFormatted: formatBytes(totalDisk),
        usedDiskFormatted: formatBytes(usedDisk),
        runningTotalMemoryFormatted: formatBytes(runningTotalMemory),
        runningTotalDiskFormatted: formatBytes(runningTotalDisk),
        timestamp: new Date().toISOString()
      };
      
      res.json({
        overview,
        vmList: vmResources.sort((a, b) => {
          // 运行中的VM排在前面，然后按资源使用率排序
          if (a.status === 'running' && b.status !== 'running') return -1;
          if (a.status !== 'running' && b.status === 'running') return 1;
          return (b.cpuPercent + b.memPercent) - (a.cpuPercent + a.memPercent);
        })
      });
    } catch (error: any) {
      console.error('获取VM资源概览失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取单个VM的详细资源信息
  app.get('/api/pve/vm-resources/:connectionId/:node/:vmid', async (req: Request, res: Response) => {
    try {
      const { connectionId, node, vmid } = req.params;
      const { type } = req.query;
      
      if (!type || (type !== 'qemu' && type !== 'lxc')) {
        return res.status(400).json({ error: '缺少或无效的VM类型参数' });
      }
      
      const vmType = type as 'qemu' | 'lxc';
      
      // 获取VM基本信息和状态
      const [vmInfo, vmStatus] = await Promise.all([
        pveManager.executeOnConnection(connectionId, (client) => client.getVMs(node)),
        pveManager.executeOnConnection(connectionId, (client) => client.getVMStatus(node, parseInt(vmid), vmType))
      ]);
      
      const vm = vmInfo.find((v: any) => v.vmid === parseInt(vmid));
      if (!vm) {
        return res.status(404).json({ error: 'VM不存在' });
      }
      
      const connection = pveManager.getConnection(connectionId);
      
      const vmDetails = {
        id: `${connectionId}-${node}-${vmid}`,
        connectionId,
        connectionName: connection?.name || '未知连接',
        node,
        vmid: parseInt(vmid),
        name: vm.name,
        type: vmType,
        status: vmStatus.status || vm.status,
        
        // CPU信息
        cpu: vmStatus.cpu || 0,
        maxcpu: vmStatus.maxcpu || vm.maxcpu || 1,
        cpuPercent: vmStatus.cpu ? (vmStatus.cpu * 100) : 0,
        
        // 内存信息
        mem: vmStatus.mem || 0,
        maxmem: vmStatus.maxmem || vm.maxmem || 0,
        memPercent: vmStatus.mem && vmStatus.maxmem ? (vmStatus.mem / vmStatus.maxmem * 100) : 0,
        
        // 磁盘信息
        disk: vmStatus.disk || vm.disk || 0,
        maxdisk: vmStatus.maxdisk || vm.maxdisk || 0,
        diskPercent: vmStatus.disk && vmStatus.maxdisk ? (vmStatus.disk / vmStatus.maxdisk * 100) : 0,
        
        // 网络IO
        netin: vmStatus.netin || 0,
        netout: vmStatus.netout || 0,
        
        // 磁盘IO
        diskread: vmStatus.diskread || 0,
        diskwrite: vmStatus.diskwrite || 0,
        
        // 系统信息
        uptime: vmStatus.uptime || 0,
        pid: vmStatus.pid || null,
        
        // 配置信息
        ha: (vmStatus as any).ha || (vm as any).ha || 0,
        lock: (vmStatus as any).lock || (vm as any).lock || null,
        tags: (vmStatus as any).tags || (vm as any).tags || null,
        
        // 格式化显示
        memFormatted: formatBytes(vmStatus.mem || 0),
        maxmemFormatted: formatBytes(vmStatus.maxmem || vm.maxmem || 0),
        diskFormatted: formatBytes(vmStatus.disk || vm.disk || 0),
        maxdiskFormatted: formatBytes(vmStatus.maxdisk || vm.maxdisk || 0),
        netinFormatted: formatBytes(vmStatus.netin || 0),
        netoutFormatted: formatBytes(vmStatus.netout || 0),
        diskreadFormatted: formatBytes(vmStatus.diskread || 0),
        diskwriteFormatted: formatBytes(vmStatus.diskwrite || 0),
        uptimeFormatted: formatUptime(vmStatus.uptime || 0),
        
        lastUpdate: new Date().toISOString()
      };
      
      res.json(vmDetails);
    } catch (error: any) {
      console.error('获取VM详细信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取节点资源信息
  app.get('/api/pve/vm-resources/nodes', async (req: Request, res: Response) => {
    try {
      const nodeResources: any[] = [];
      const connections = pveManager.getAllConnections().filter(c => c.status === 'connected');
      
      for (const connection of connections) {
        try {
          const nodes = await pveManager.executeOnConnection(connection.id, (client) => client.getNodes());
          
          for (const node of nodes) {
            try {
              const nodeStatus = await pveManager.executeOnConnection(connection.id, (client) => 
                client.getNodeResources(node.node)
              );
              
              nodeResources.push({
                id: `${connection.id}-${node.node}`,
                connectionId: connection.id,
                connectionName: connection.name,
                node: node.node,
                status: nodeStatus.status || 'unknown',
                
                // CPU信息
                cpu: nodeStatus.cpu || 0,
                maxcpu: nodeStatus.maxcpu || 1,
                cpuPercent: nodeStatus.cpu && nodeStatus.maxcpu ? (nodeStatus.cpu * 100) : 0,
                
                // 内存信息  
                mem: nodeStatus.mem || 0,
                maxmem: nodeStatus.maxmem || 0,
                memPercent: nodeStatus.mem && nodeStatus.maxmem ? (nodeStatus.mem / nodeStatus.maxmem * 100) : 0,
                
                // 磁盘信息
                rootfs: nodeStatus.rootfs || {},
                
                // 负载信息
                loadavg: nodeStatus.loadavg || [],
                
                // 运行时间
                uptime: nodeStatus.uptime || 0,
                
                // 格式化显示
                memFormatted: formatBytes(nodeStatus.mem || 0),
                maxmemFormatted: formatBytes(nodeStatus.maxmem || 0),
                uptimeFormatted: formatUptime(nodeStatus.uptime || 0),
                
                lastUpdate: new Date().toISOString()
              });
            } catch (error: any) {
              console.error(`获取节点 ${node.node} 资源失败:`, error.message);
            }
          }
        } catch (error: any) {
          console.error(`获取连接 ${connection.id} 的节点列表失败:`, error.message);
        }
      }
      
      res.json(nodeResources);
    } catch (error: any) {
      console.error('获取节点资源信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// 工具函数：格式化字节数
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 工具函数：格式化运行时间
function formatUptime(seconds: number): string {
  if (seconds === 0) return '0s';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 && days === 0) parts.push(`${secs}秒`);
  
  return parts.join(' ') || '0s';
}