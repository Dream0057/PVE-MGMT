import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Typography,
  message,
  Switch,
  Divider,
} from 'antd';
import {
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// 数据接口定义
interface VMTrafficData {
  id: string;
  connectionId: string;
  connectionName: string;
  node: string;
  vmid: number;
  name: string;
  type: string;
  status: string;
  current: {
    netin: number;
    netout: number;
    total: number;
  };
  hourly: {
    netin: number;
    netout: number;
    total: number;
  };
  speed: {
    netin: number;
    netout: number;
    total: number;
  };
}

interface DashboardData {
  overview: {
    totalVMs: number;
    activeVMs: number;
    totalTraffic: number;
    totalNetin: number;
    totalNetout: number;
    timestamp: string;
  };
  vmList: VMTrafficData[];
  topTrafficVMs: VMTrafficData[];
  trafficAlerts: Array<{
    id: string;
    type: string;
    level: string;
    message: string;
    timestamp: string;
    vm: VMTrafficData;
  }>;
}

// 格式化字节数
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${value}${sizes[i]}`;
};

// 格式化速度
const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond === 0) return '0';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  const value = parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1));
  return `${value}${sizes[i]}`;
};

// 获取流量等级
const getTrafficLevel = (bytes: number): { level: string; color: string; bgColor: string } => {
  if (bytes === 0) return { level: 'IDLE', color: '#8c8c8c', bgColor: '#f5f5f5' };
  if (bytes < 1024 * 1024) return { level: 'LOW', color: '#52c41a', bgColor: '#f6ffed' };
  if (bytes < 100 * 1024 * 1024) return { level: 'MED', color: '#1890ff', bgColor: '#e6f7ff' };
  if (bytes < 1024 * 1024 * 1024) return { level: 'HIGH', color: '#fa8c16', bgColor: '#fff7e6' };
  if (bytes < 10 * 1024 * 1024 * 1024) return { level: 'CRIT', color: '#f5222d', bgColor: '#fff2f0' };
  return { level: 'EXTR', color: '#722ed1', bgColor: '#f9f0ff' };
};

function TrafficMonitorPro() {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(15); // 15秒

  // API调用函数（优化版本）
  const fetchDashboardData = useCallback(async (abortController?: AbortController) => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      // 使用传入的controller或创建新的
      const controller = abortController || new AbortController();
      let timeoutId: NodeJS.Timeout | undefined;
      
      // 只有在没有传入controller时才设置超时
      if (!abortController) {
        timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      }
      
      const response = await fetch(`${apiUrl}/api/pve/traffic/dashboard`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
        setLastUpdateTime(new Date().toLocaleString());
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // 静默处理AbortError，避免在React Strict Mode下的错误提示
      if (error.name === 'AbortError') {
        console.debug('请求被中断（可能由于组件卸载或重新挂载）');
        // 不显示错误消息，但继续执行finally块
      } else {
        console.error('获取数据失败:', error);
        if (error.message.includes('HTTP')) {
          message.error(`服务器错误: ${error.message}`);
        } else {
          message.error('网络错误，请检查连接');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 自动刷新
  useEffect(() => {
    const controller = new AbortController();
    
    // 初始加载
    fetchDashboardData(controller);
    
    let interval: NodeJS.Timeout | undefined;
    
    if (autoRefresh) {
      interval = setInterval(() => {
        // 为每次定时刷新创建新的controller
        fetchDashboardData();
      }, refreshInterval * 1000);
    }
    
    return () => {
      // 组件卸载时中断请求
      controller.abort();
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoRefresh, refreshInterval, fetchDashboardData]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // 表格列定义 - 超密集专业风格
  const columns: ColumnsType<VMTrafficData> = [
    {
      title: 'VM',
      key: 'vm',
      width: 140,
      fixed: 'left',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            marginBottom: 2
          }}>
            {record.status === 'running' ? (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            ) : (
              <PauseCircleOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            )}
            <Text strong style={{ fontSize: 12, color: '#262626' }}>
              {record.name}
            </Text>
          </div>
          <div style={{ fontSize: 10, color: '#8c8c8c' }}>
            {record.type.toUpperCase()}-{record.vmid}@{record.node}
          </div>
        </div>
      ),
    },
    {
      title: 'CONN',
      key: 'connection',
      width: 80,
      render: (_, record) => (
        <Text style={{ fontSize: 10, color: '#595959' }}>
          {record.connectionName.split('-')[0]}
        </Text>
      ),
    },
    {
      title: 'RX RATE',
      key: 'rxRate',
      width: 90,
      sorter: (a, b) => a.speed.netin - b.speed.netin,
      render: (_, record) => {
        const level = getTrafficLevel(record.speed.netin);
        return (
          <div style={{
            padding: '3px 6px',
            borderRadius: 3,
            backgroundColor: level.bgColor,
            border: `1px solid ${level.color}20`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: level.color }}>
              {formatSpeed(record.speed.netin)}
            </div>
          </div>
        );
      },
    },
    {
      title: 'TX RATE',
      key: 'txRate',
      width: 90,
      sorter: (a, b) => a.speed.netout - b.speed.netout,
      render: (_, record) => {
        const level = getTrafficLevel(record.speed.netout);
        return (
          <div style={{
            padding: '3px 6px',
            borderRadius: 3,
            backgroundColor: level.bgColor,
            border: `1px solid ${level.color}20`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: level.color }}>
              {formatSpeed(record.speed.netout)}
            </div>
          </div>
        );
      },
    },
    {
      title: 'RX/1H',
      key: 'rx1h',
      width: 100,
      sorter: (a, b) => a.hourly.netin - b.hourly.netin,
      render: (_, record) => {
        const level = getTrafficLevel(record.hourly.netin);
        return (
          <div style={{
            padding: '4px 8px',
            borderRadius: 4,
            backgroundColor: level.color,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: 'white' }}>
              {formatBytes(record.hourly.netin)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
              {level.level}
            </div>
          </div>
        );
      },
    },
    {
      title: 'TX/1H',
      key: 'tx1h',
      width: 100,
      sorter: (a, b) => a.hourly.netout - b.hourly.netout,
      render: (_, record) => {
        const level = getTrafficLevel(record.hourly.netout);
        return (
          <div style={{
            padding: '4px 8px',
            borderRadius: 4,
            backgroundColor: level.color,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: 'white' }}>
              {formatBytes(record.hourly.netout)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)' }}>
              {level.level}
            </div>
          </div>
        );
      },
    },
    {
      title: 'TOTAL/1H',
      key: 'total1h',
      width: 110,
      sorter: (a, b) => a.hourly.total - b.hourly.total,
      defaultSortOrder: 'descend',
      render: (_, record) => {
        const level = getTrafficLevel(record.hourly.total);
        const inPercent = record.hourly.total > 0 ? (record.hourly.netin / record.hourly.total * 100) : 0;
        return (
          <div>
            <div style={{
              padding: '4px 8px',
              borderRadius: 4,
              backgroundColor: level.color,
              textAlign: 'center',
              marginBottom: 2
            }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: 'white' }}>
                {formatBytes(record.hourly.total)}
              </div>
            </div>
            <div style={{ height: 3, backgroundColor: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${inPercent}%`,
                height: '100%',
                backgroundColor: '#1890ff',
                float: 'left'
              }} />
              <div style={{
                width: `${100 - inPercent}%`,
                height: '100%',
                backgroundColor: '#52c41a',
                float: 'left'
              }} />
            </div>
          </div>
        );
      },
    },
    {
      title: 'RATIO',
      key: 'ratio',
      width: 80,
      render: (_, record) => {
        const inPercent = record.hourly.total > 0 ? (record.hourly.netin / record.hourly.total * 100) : 0;
        const outPercent = 100 - inPercent;
        return (
          <div style={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2 }}>
            <div style={{ color: '#1890ff', fontWeight: 'bold' }}>
              ↓{inPercent.toFixed(0)}%
            </div>
            <div style={{ color: '#52c41a', fontWeight: 'bold' }}>
              ↑{outPercent.toFixed(0)}%
            </div>
          </div>
        );
      },
    },
    {
      title: 'STATUS',
      key: 'status',
      width: 70,
      fixed: 'right',
      render: (_, record) => {
        const isRunning = record.status === 'running';
        return (
          <div style={{
            padding: '2px 8px',
            borderRadius: 12,
            backgroundColor: isRunning ? '#52c41a' : '#8c8c8c',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>
              {isRunning ? 'RUN' : 'STOP'}
            </div>
          </div>
        );
      },
    },
  ];

  // 计算统计数据
  const stats = dashboardData ? {
    totalTraffic: dashboardData.overview.totalTraffic,
    totalNetin: dashboardData.overview.totalNetin,
    totalNetout: dashboardData.overview.totalNetout,
    avgTraffic: dashboardData.overview.totalTraffic / Math.max(dashboardData.overview.totalVMs, 1),
    runningVMs: dashboardData.overview.activeVMs,
    totalVMs: dashboardData.overview.totalVMs,
    inRatio: dashboardData.overview.totalTraffic > 0 ? 
      (dashboardData.overview.totalNetin / dashboardData.overview.totalTraffic * 100) : 0,
    alerts: dashboardData.trafficAlerts?.length || 0
  } : null;

  return (
    <div style={{ 
      padding: 16, 
      background: '#f0f2f5', 
      minHeight: '100vh',
      fontFamily: 'Monaco, Consolas, "Lucida Console", monospace'
    }}>
      {/* 专业监控头部 */}
      <div style={{
        background: 'linear-gradient(135deg, #001529 0%, #002140 100%)',
        borderRadius: 8,
        padding: '12px 20px',
        marginBottom: 16,
        color: 'white'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
              VM TRAFFIC MONITOR
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Professional Network Monitoring Dashboard
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, opacity: 0.6 }}>LAST UPDATE</div>
              <div style={{ fontSize: 11, fontWeight: 'bold' }}>{lastUpdateTime}</div>
            </div>
            <Divider type="vertical" style={{ borderColor: 'rgba(255,255,255,0.3)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch 
                checked={autoRefresh}
                onChange={setAutoRefresh}
                size="small"
              />
              <span style={{ fontSize: 11 }}>AUTO</span>
            </div>
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
              style={{ backgroundColor: '#722ed1', borderColor: '#722ed1' }}
            >
              REFRESH
            </Button>
          </div>
        </div>
      </div>

      {/* 核心指标仪表盘 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small" style={{ 
            background: 'linear-gradient(135deg, #1890ff 0%, #69c0ff 100%)',
            border: 'none',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>TOTAL VMS</div>
              <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                {stats?.totalVMs || 0}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>
                {stats?.runningVMs || 0} RUNNING
              </div>
            </div>
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ 
            background: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
            border: 'none',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>TOTAL TRAFFIC/1H</div>
              <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                {formatBytes(stats?.totalTraffic || 0)}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>
                AVG: {formatBytes(stats?.avgTraffic || 0)}/VM
              </div>
            </div>
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ 
            background: 'linear-gradient(135deg, #fa8c16 0%, #ffd666 100%)',
            border: 'none',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>DOWNLOAD/1H</div>
              <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                {formatBytes(stats?.totalNetin || 0)}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>
                {stats?.inRatio?.toFixed(1) || 0}% OF TOTAL
              </div>
            </div>
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ 
            background: 'linear-gradient(135deg, #722ed1 0%, #b37feb 100%)',
            border: 'none',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>UPLOAD/1H</div>
              <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                {formatBytes(stats?.totalNetout || 0)}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>
                {(100 - (stats?.inRatio || 0)).toFixed(1)}% OF TOTAL
              </div>
            </div>
          </Card>
        </Col>
        <Col span={5}>
          <Card size="small" style={{ 
            background: stats?.alerts ? 
              'linear-gradient(135deg, #f5222d 0%, #ff7875 100%)' : 
              'linear-gradient(135deg, #8c8c8c 0%, #bfbfbf 100%)',
            border: 'none',
            color: 'white'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4 }}>ALERTS</div>
              <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                {stats?.alerts || 0}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>
                {stats?.alerts ? 'ACTIVE' : 'CLEAR'}
              </div>
            </div>
          </Card>
        </Col>
        </Row>

      {/* 主数据表格 - 占满整个视窗 */}
      <Card 
        size="small" 
        style={{ 
          background: '#ffffff',
          border: '1px solid #d9d9d9',
          borderRadius: 8
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#262626' }}>
            VM TRAFFIC MONITORING TABLE
          </div>
          <div style={{ fontSize: 10, color: '#8c8c8c' }}>
            Showing {dashboardData?.vmList?.length || 0} virtual machines
          </div>
        </div>
        
        <Table
          columns={columns}
          dataSource={dashboardData?.vmList || []}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 900, y: 'calc(100vh - 300px)' }}
          loading={loading}
          bordered={false}
          style={{ 
            fontSize: 11,
            background: 'white'
          }}
          rowClassName={(record, index) => {
            const isRunning = record.status === 'running';
            const baseClass = index % 2 === 0 ? 'row-even' : 'row-odd';
            return `${baseClass} ${isRunning ? 'row-running' : 'row-stopped'}`;
          }}
        />
        
        <style>{`
          .row-even td {
            background-color: #fafafa !important;
          }
          .row-odd td {
            background-color: #ffffff !important;
          }
          .row-running:hover td {
            background-color: #e6f7ff !important;
          }
          .row-stopped:hover td {
            background-color: #fff2e8 !important;
          }
          .ant-table-thead > tr > th {
            background: linear-gradient(135deg, #001529 0%, #002140 100%) !important;
            color: white !important;
            font-weight: bold !important;
            font-size: 10px !important;
            padding: 8px 8px !important;
            border-bottom: 2px solid #722ed1 !important;
            text-align: center !important;
          }
          .ant-table-tbody > tr > td {
            padding: 6px 8px !important;
            font-size: 11px !important;
            border-bottom: 1px solid #f0f0f0 !important;
          }
          .ant-table-thead > tr > th.ant-table-column-sort {
            background: linear-gradient(135deg, #722ed1 0%, #9254de 100%) !important;
          }
        `}</style>
      </Card>
    </div>
  );
}

export default TrafficMonitorPro;