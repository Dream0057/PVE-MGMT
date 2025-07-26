export interface PVEConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  realm: string;
  ssl: boolean;
  timeout: number;
}

export const defaultPVEConfig: Partial<PVEConfig> = {
  port: 8006,
  realm: 'pam',
  ssl: true,
  timeout: 30000
};

export interface PVENode {
  node: string;
  status: 'online' | 'offline' | 'unknown';
  uptime: number;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  level: string;
}