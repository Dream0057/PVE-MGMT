import axios, { AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';
import { PVEConfig, PVENode } from '../config/pve';

export interface PVETicket {
  ticket: string;
  CSRFPreventionToken: string;
  username: string;
  cap: Record<string, number>;
}

export interface VMInfo {
  vmid: number;
  name: string;
  status: 'running' | 'stopped' | 'suspended';
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  node: string;
  type: 'qemu' | 'lxc';
}

export class PVEApiClient {
  private client: AxiosInstance;
  private ticket: PVETicket | null = null;
  private config: PVEConfig;

  constructor(config: PVEConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: `${config.ssl ? 'https' : 'http'}://${config.host}:${config.port}/api2/json`,
      timeout: config.timeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // 忽略自签名证书
      })
    });

    // 添加请求拦截器自动添加认证头
    this.client.interceptors.request.use((config) => {
      if (this.ticket) {
        config.headers['Cookie'] = `PVEAuthCookie=${this.ticket.ticket}`;
        config.headers['CSRFPreventionToken'] = this.ticket.CSRFPreventionToken;
      }
      return config;
    });

    // 添加响应拦截器处理认证失败
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.ticket) {
          // Token过期，重新认证
          await this.authenticate();
          // 重试原请求
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  async authenticate(): Promise<PVETicket> {
    try {
      const response: AxiosResponse<{ data: PVETicket }> = await this.client.post('/access/ticket', {
        username: `${this.config.username}@${this.config.realm}`,
        password: this.config.password
      });

      this.ticket = response.data.data;
      return this.ticket;
    } catch (error: any) {
      throw new Error(`PVE认证失败: ${error.message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      await this.getVersion();
      return true;
    } catch (error) {
      return false;
    }
  }

  async getVersion(): Promise<any> {
    const response = await this.client.get('/version');
    return response.data.data;
  }

  async getNodes(): Promise<PVENode[]> {
    const response = await this.client.get('/nodes');
    return response.data.data;
  }

  async getVMs(node?: string): Promise<VMInfo[]> {
    const vms: VMInfo[] = [];
    
    const nodes = node ? [{ node }] : await this.getNodes();
    
    for (const nodeInfo of nodes) {
      try {
        // 获取QEMU虚拟机
        const qemuResponse = await this.client.get(`/nodes/${nodeInfo.node}/qemu`);
        const qemuVMs = qemuResponse.data.data.map((vm: any) => ({
          ...vm,
          node: nodeInfo.node,
          type: 'qemu' as const
        }));
        
        // 获取LXC容器
        const lxcResponse = await this.client.get(`/nodes/${nodeInfo.node}/lxc`);
        const lxcVMs = lxcResponse.data.data.map((vm: any) => ({
          ...vm,
          node: nodeInfo.node,
          type: 'lxc' as const
        }));
        
        vms.push(...qemuVMs, ...lxcVMs);
      } catch (error) {
        console.error(`获取节点 ${nodeInfo.node} 的虚拟机失败:`, error);
      }
    }
    
    return vms;
  }

  async getVMStatus(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/status/current`);
    return response.data.data;
  }

  async getVMNetworkStats(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/${type}/${vmid}/status/current`);
    return response.data.data;
  }

  async startVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/start`);
    return response.data.data; // 返回任务ID
  }

  async stopVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/stop`);
    return response.data.data;
  }

  async shutdownVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/${type}/${vmid}/status/shutdown`);
    return response.data.data;
  }

  async suspendVM(node: string, vmid: number): Promise<string> {
    // 只有QEMU支持挂起
    const response = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/suspend`);
    return response.data.data;
  }

  async resumeVM(node: string, vmid: number): Promise<string> {
    // 只有QEMU支持恢复
    const response = await this.client.post(`/nodes/${node}/qemu/${vmid}/status/resume`);
    return response.data.data;
  }

  async deleteVM(node: string, vmid: number, type: 'qemu' | 'lxc'): Promise<string> {
    const response = await this.client.delete(`/nodes/${node}/${type}/${vmid}`);
    return response.data.data;
  }

  async getTaskStatus(node: string, upid: string): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/tasks/${upid}/status`);
    return response.data.data;
  }

  async getNodeResources(node: string): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/status`);
    return response.data.data;
  }

  async getClusterResources(): Promise<any[]> {
    const response = await this.client.get('/cluster/resources');
    return response.data.data;
  }

  async createQemuVM(node: string, vmConfig: any): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/qemu`, vmConfig);
    return response.data.data;
  }

  async createLxcContainer(node: string, containerConfig: any): Promise<string> {
    const response = await this.client.post(`/nodes/${node}/lxc`, containerConfig);
    return response.data.data;
  }

  async getStorages(node?: string): Promise<any[]> {
    const endpoint = node ? `/nodes/${node}/storage` : '/storage';
    const response = await this.client.get(endpoint);
    return response.data.data;
  }

  async getNetworks(node: string): Promise<any[]> {
    const response = await this.client.get(`/nodes/${node}/network`);
    return response.data.data;
  }

  // 获取实时统计数据
  async getRRDData(node: string, timeframe: string = 'hour'): Promise<any> {
    const response = await this.client.get(`/nodes/${node}/rrddata`, {
      params: { timeframe }
    });
    return response.data.data;
  }

  // 断开连接
  disconnect(): void {
    this.ticket = null;
  }
}