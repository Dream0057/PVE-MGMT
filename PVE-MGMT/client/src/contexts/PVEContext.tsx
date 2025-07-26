import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export interface PVEConnection {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastConnected?: string;
  lastError?: string;
  host: string;
  port: number;
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
  connectionId: string;
  connectionName: string;
}

export interface NodeInfo {
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
  connectionId: string;
  connectionName: string;
}

interface PVEState {
  connections: PVEConnection[];
  vms: VMInfo[];
  nodes: NodeInfo[];
  socket: Socket | null;
  loading: boolean;
  error: string | null;
}

type PVEAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTIONS'; payload: PVEConnection[] }
  | { type: 'SET_VMS'; payload: VMInfo[] }
  | { type: 'SET_NODES'; payload: NodeInfo[] }
  | { type: 'UPDATE_CONNECTION'; payload: PVEConnection }
  | { type: 'UPDATE_VM'; payload: VMInfo }
  | { type: 'SET_SOCKET'; payload: Socket | null };

const initialState: PVEState = {
  connections: [],
  vms: [],
  nodes: [],
  socket: null,
  loading: false,
  error: null,
};

function pveReducer(state: PVEState, action: PVEAction): PVEState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_CONNECTIONS':
      return { ...state, connections: action.payload };
    case 'SET_VMS':
      return { ...state, vms: action.payload };
    case 'SET_NODES':
      return { ...state, nodes: action.payload };
    case 'UPDATE_CONNECTION':
      return {
        ...state,
        connections: state.connections.map(conn =>
          conn.id === action.payload.id ? action.payload : conn
        ),
      };
    case 'UPDATE_VM':
      return {
        ...state,
        vms: state.vms.map(vm =>
          vm.vmid === action.payload.vmid && vm.connectionId === action.payload.connectionId
            ? action.payload
            : vm
        ),
      };
    case 'SET_SOCKET':
      return { ...state, socket: action.payload };
    default:
      return state;
  }
}

interface PVEContextType extends PVEState {
  dispatch: React.Dispatch<PVEAction>;
  refreshConnections: () => Promise<void>;
  refreshVMs: () => Promise<void>;
  refreshNodes: () => Promise<void>;
  addConnection: (connection: Omit<PVEConnection, 'status'>) => Promise<boolean>;
  removeConnection: (id: string) => Promise<boolean>;
  testConnection: (id: string) => Promise<boolean>;
  vmAction: (connectionId: string, vmid: number, node: string, type: 'qemu' | 'lxc', action: string) => Promise<void>;
}

const PVEContext = createContext<PVEContextType | undefined>(undefined);

export function PVEProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(pveReducer, initialState);

  useEffect(() => {
    // 初始化WebSocket连接
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const socket = io(wsUrl);
    dispatch({ type: 'SET_SOCKET', payload: socket });

    socket.on('connect', () => {
      console.log('WebSocket连接成功');
      // 请求初始数据
      socket.emit('get-connections');
      socket.emit('get-vms');
      socket.emit('get-nodes');
    });

    socket.on('connections', (connections: PVEConnection[]) => {
      dispatch({ type: 'SET_CONNECTIONS', payload: connections });
    });

    socket.on('vms', (vms: VMInfo[]) => {
      dispatch({ type: 'SET_VMS', payload: vms });
    });

    socket.on('nodes', (nodes: NodeInfo[]) => {
      dispatch({ type: 'SET_NODES', payload: nodes });
    });

    socket.on('connection-status-changed', (data: any) => {
      dispatch({
        type: 'UPDATE_CONNECTION',
        payload: {
          ...data,
          status: data.status,
          lastError: data.error,
        },
      });
    });

    socket.on('vm-action-result', (data: any) => {
      if (data.success) {
        console.log(`VM操作成功: ${data.message}`);
        // 刷新VM列表
        socket.emit('get-vms');
      } else {
        console.error(`VM操作失败: ${data.error}`);
      }
    });

    socket.on('connection-deleted', (data: any) => {
      console.log(`连接已删除: ${data.connectionId}`);
      // 连接删除后，后端已经自动广播了更新的数据
      // 这里我们只需要记录日志，数据会通过其他事件自动更新
    });

    socket.on('error', (error: any) => {
      console.error('WebSocket错误:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message });
    });

    socket.on('connect_error', (error: any) => {
      console.error('WebSocket连接失败:', error);
      dispatch({ type: 'SET_ERROR', payload: `连接失败: ${error.message}` });
    });

    socket.on('disconnect', (reason: string) => {
      console.log('WebSocket连接断开:', reason);
      if (reason === 'io server disconnect') {
        // 服务器断开连接，尝试重连
        socket.connect();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const refreshConnections = async () => {
    if (state.socket) {
      state.socket.emit('get-connections');
    }
  };

  const refreshVMs = async () => {
    if (state.socket) {
      state.socket.emit('get-vms');
    }
  };

  const refreshNodes = async () => {
    if (state.socket) {
      state.socket.emit('get-nodes');
    }
  };

  const addConnection = async (connection: Omit<PVEConnection, 'status'>): Promise<boolean> => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiUrl}/api/pve/connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(connection),
      });

      if (response.ok) {
        await refreshConnections();
        return true;
      } else {
        const error = await response.json();
        dispatch({ type: 'SET_ERROR', payload: error.error });
        return false;
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      return false;
    }
  };

  const removeConnection = async (id: string): Promise<boolean> => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiUrl}/api/pve/connections/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // 刷新所有相关数据
        await refreshConnections();
        await refreshVMs();
        await refreshNodes();
        return true;
      } else {
        const error = await response.json();
        dispatch({ type: 'SET_ERROR', payload: error.error });
        return false;
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      return false;
    }
  };

  const testConnection = async (id: string): Promise<boolean> => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${apiUrl}/api/pve/connections/${id}/test`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        await refreshConnections();
        return result.success;
      } else {
        const error = await response.json();
        dispatch({ type: 'SET_ERROR', payload: error.error });
        return false;
      }
    } catch (error: any) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      return false;
    }
  };

  const vmAction = async (
    connectionId: string,
    vmid: number,
    node: string,
    type: 'qemu' | 'lxc',
    action: string
  ): Promise<void> => {
    if (state.socket) {
      state.socket.emit('vm-action', {
        connectionId,
        vmid,
        node,
        type,
        action,
      });
    }
  };

  const contextValue: PVEContextType = {
    ...state,
    dispatch,
    refreshConnections,
    refreshVMs,
    refreshNodes,
    addConnection,
    removeConnection,
    testConnection,
    vmAction,
  };

  return <PVEContext.Provider value={contextValue}>{children}</PVEContext.Provider>;
}

export function usePVE() {
  const context = useContext(PVEContext);
  if (context === undefined) {
    throw new Error('usePVE must be used within a PVEProvider');
  }
  return context;
}