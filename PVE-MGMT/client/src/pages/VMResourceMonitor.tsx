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
  Statistic,
  Badge,
  Tooltip,
  Select,
  Input,
} from 'antd';
import {
  ReloadOutlined,
  DesktopOutlined,
  CloudServerOutlined,
  BarChartOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  InfoCircleOutlined,
  MonitorOutlined,
  HddOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

// 数据接口定义
interface VMResourceData {
  id: string;
  connectionId: string;
  connectionName: string;
  node: string;
  vmid: number;
  name: string;
  type: 'qemu' | 'lxc';
  status: 'running' | 'stopped' | 'suspended';
  cpu: number;
  maxcpu: number;
  cpuPercent: number;
  mem: number;
  maxmem: number;
  memPercent: number;
  disk: number;
  maxdisk: number;
  diskPercent: number;
  uptime: number;
  netin: number;
  netout: number;
  diskread: number;
  diskwrite: number;
  memFormatted: string;
  maxmemFormatted: string;
  diskFormatted: string;
  maxdiskFormatted: string;
  uptimeFormatted: string;
  lastUpdate: string;
  error?: string;
}

interface ResourceOverview {
  totalVMs: number;
  runningVMs: number;
  stoppedVMs: number;
  suspendedVMs: number;
  totalCPUs: number;
  usedCPUs: number;
  cpuUsagePercent: number;
  totalMemory: number;
  usedMemory: number;
  memoryUsagePercent: number;
  totalDisk: number;
  usedDisk: number;
  diskUsagePercent: number;
  totalMemoryFormatted: string;
  usedMemoryFormatted: string;
  totalDiskFormatted: string;
  usedDiskFormatted: string;
  timestamp: string;
}

interface DashboardData {
  overview: ResourceOverview;
  vmList: VMResourceData[];
}

// 获取状态颜色和图标
const getStatusDisplay = (status: string, type: string) => {
  const statusConfig = {
    running: { 
      color: '#52c41a', 
      text: '运行中', 
      icon: <PlayCircleOutlined />,
      badge: 'success'
    },
    stopped: { 
      color: '#8c8c8c', 
      text: '已停止', 
      icon: <PauseCircleOutlined />,
      badge: 'default'
    },
    suspended: { 
      color: '#faad14', 
      text: '已暂停', 
      icon: <PauseCircleOutlined />,
      badge: 'warning'
    }
  };
  
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.stopped;
  const typeIcon = type === 'qemu' ? <DesktopOutlined /> : <CloudServerOutlined />;
  
  return { ...config, typeIcon };
};

// 获取资源使用率颜色
const getUsageColor = (percent: number): string => {
  if (percent < 50) return '#52c41a';
  if (percent < 80) return '#faad14';
  return '#f5222d';
};

function VMResourceMonitor() {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  const [refreshInterval, setRefreshInterval] = useState<number>(10); // 10秒
  const [loadingTip, setLoadingTip] = useState<string>('正在加载数据...');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');

  // 缓存相关状态
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const CACHE_DURATION = 15000; // 15秒缓存

  // API调用函数
  const fetchResourceData = useCallback(async (forceRefresh = false) => {
    // 检查缓存，如果不是强制刷新且在缓存时间内，则跳过请求
    const now = Date.now();
    if (!forceRefresh && dashboardData && (now - lastFetchTime) < CACHE_DURATION) {
      console.debug('使用缓存数据，跳过API请求');
      return;
    }

    try {
      setLoading(true);
      setLoadingTip('正在获取VM资源数据...');
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时（给后端更多时间）
      
      const response = await fetch(`${apiUrl}/api/pve/vm-resources/overview`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
        setLastUpdateTime(new Date().toLocaleString());
        setLastFetchTime(Date.now()); // 更新缓存时间
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // 静默处理AbortError，避免在React Strict Mode下的错误提示
      if (error.name === 'AbortError') {
        console.debug('请求被中断（可能由于组件卸载或重新挂载）');
        // 不显示错误消息，但继续执行finally块
      } else {
        console.error('获取VM资源数据失败:', error);
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
    fetchResourceData();
    
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchResourceData();
    }, refreshInterval * 1000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchResourceData]);

  // 手动刷新（强制刷新，忽略缓存）
  const handleRefresh = useCallback(() => {
    fetchResourceData(true);
  }, [fetchResourceData]);

  // 过滤数据
  const filteredVMList = dashboardData?.vmList?.filter(vm => {
    const matchStatus = filterStatus === 'all' || vm.status === filterStatus;
    const matchType = filterType === 'all' || vm.type === filterType;
    const matchSearch = !searchText || 
      vm.name.toLowerCase().includes(searchText.toLowerCase()) ||
      vm.vmid.toString().includes(searchText) ||
      vm.node.toLowerCase().includes(searchText.toLowerCase());
    
    return matchStatus && matchType && matchSearch;
  }) || [];

  // 表格列定义
  const columns: ColumnsType<VMResourceData> = [
    {
      title: 'VM信息',
      key: 'vmInfo',
      width: 200,
      fixed: 'left',
      render: (_, record) => {
        const statusDisplay = getStatusDisplay(record.status, record.type);
        return (
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Badge status={statusDisplay.badge as any} />
              {statusDisplay.typeIcon}
              <Text strong style={{ fontSize: 13 }}>{record.name}</Text>
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              {record.type.toUpperCase()}-{record.vmid} @ {record.node}
            </div>
            <div style={{ fontSize: 10, color: '#999' }}>
              {record.connectionName}
            </div>
          </div>
        );
      }
    },
    {
      title: 'CPU使用率',
      key: 'cpu',
      width: 120,
      sorter: (a, b) => a.cpuPercent - b.cpuPercent,
      render: (_, record) => (
        <div>
          <Progress
            percent={record.cpuPercent}
            size="small"
            strokeColor={getUsageColor(record.cpuPercent)}
            format={() => `${record.cpuPercent.toFixed(1)}%`}
          />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {record.cpu.toFixed(2)} / {record.maxcpu} 核心
          </div>
        </div>
      )
    },
    {
      title: '内存使用率',
      key: 'memory',
      width: 140,
      sorter: (a, b) => a.memPercent - b.memPercent,
      render: (_, record) => (
        <div>
          <Progress
            percent={record.memPercent}
            size="small"
            strokeColor={getUsageColor(record.memPercent)}
            format={() => `${record.memPercent.toFixed(1)}%`}
          />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {record.memFormatted} / {record.maxmemFormatted}
          </div>
        </div>
      )
    },
    {
      title: '磁盘使用率',
      key: 'disk',
      width: 140,
      sorter: (a, b) => a.diskPercent - b.diskPercent,
      render: (_, record) => (
        <div>
          <Progress
            percent={record.diskPercent}
            size="small"
            strokeColor={getUsageColor(record.diskPercent)}
            format={() => `${record.diskPercent.toFixed(1)}%`}
          />
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {record.diskFormatted} / {record.maxdiskFormatted}
          </div>
        </div>
      )
    },
    {
      title: '运行时间',
      key: 'uptime',
      width: 120,
      sorter: (a, b) => a.uptime - b.uptime,
      render: (_, record) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: record.status === 'running' ? '#52c41a' : '#8c8c8c' }}>
            {record.uptimeFormatted}
          </div>
          <div style={{ fontSize: 10, color: '#666' }}>
            {record.status === 'running' ? '持续运行' : '已停止'}
          </div>
        </div>
      )
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      fixed: 'right',
      filters: [
        { text: '运行中', value: 'running' },
        { text: '已停止', value: 'stopped' },
        { text: '已暂停', value: 'suspended' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (_, record) => {
        const statusDisplay = getStatusDisplay(record.status, record.type);
        return (
          <Tag color={statusDisplay.color} icon={statusDisplay.icon}>
            {statusDisplay.text}
          </Tag>
        );
      }
    },
  ];

  return (
    <div style={{ 
      padding: 24, 
      background: '#f0f2f5', 
      minHeight: '100vh'
    }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <Space>
                <BarChartOutlined style={{ color: '#1890ff' }} />
                虚拟机资源监控
              </Space>
            </Title>
            <Text type="secondary" style={{ margin: '4px 0' }}>
              实时监控虚拟机CPU、内存、磁盘使用情况
            </Text>
          </Col>
          <Col>
            <Space>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  size="small"
                />
                <span style={{ fontSize: 12, color: '#666' }}>
                  自动刷新 {autoRefresh ? `(${refreshInterval}秒)` : ''}
                </span>
              </div>
              {lastUpdateTime && (
                <span style={{ fontSize: 11, color: '#999' }}>
                  上次更新: {lastUpdateTime}
                </span>
              )}
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
                size="small"
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 资源概览卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="虚拟机总数"
              value={dashboardData?.overview.totalVMs || 0}
              prefix={<DesktopOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              运行: {dashboardData?.overview.runningVMs || 0} | 
              停止: {dashboardData?.overview.stoppedVMs || 0}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="CPU使用率"
              value={dashboardData?.overview.cpuUsagePercent || 0}
              precision={1}
              suffix="%"
              prefix={<BarChartOutlined />}
              valueStyle={{ color: getUsageColor(dashboardData?.overview.cpuUsagePercent || 0) }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              {dashboardData?.overview.usedCPUs?.toFixed(2) || 0} 核心使用中 / {dashboardData?.overview.totalCPUs || 0} 核心总配额
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="内存使用率"
              value={dashboardData?.overview.memoryUsagePercent || 0}
              precision={1}
              suffix="%"
              prefix={<MonitorOutlined />}
              valueStyle={{ color: getUsageColor(dashboardData?.overview.memoryUsagePercent || 0) }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              {dashboardData?.overview.usedMemoryFormatted || '0 B'} / {dashboardData?.overview.totalMemoryFormatted || '0 B'}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="磁盘使用率"
              value={dashboardData?.overview.diskUsagePercent || 0}
              precision={1}
              suffix="%"
              prefix={<HddOutlined />}
              valueStyle={{ color: getUsageColor(dashboardData?.overview.diskUsagePercent || 0) }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              {dashboardData?.overview.usedDiskFormatted || '0 B'} / {dashboardData?.overview.totalDiskFormatted || '0 B'}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 过滤器和搜索 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <span style={{ fontSize: 12, color: '#666' }}>筛选:</span>
              <Select
                value={filterStatus}
                onChange={setFilterStatus}
                size="small"
                style={{ width: 100 }}
              >
                <Option value="all">所有状态</Option>
                <Option value="running">运行中</Option>
                <Option value="stopped">已停止</Option>
                <Option value="suspended">已暂停</Option>
              </Select>
              <Select
                value={filterType}
                onChange={setFilterType}
                size="small"
                style={{ width: 100 }}
              >
                <Option value="all">所有类型</Option>
                <Option value="qemu">QEMU</Option>
                <Option value="lxc">LXC</Option>
              </Select>
            </Space>
          </Col>
          <Col flex="auto">
            <div style={{ textAlign: 'right' }}>
              <Search
                placeholder="搜索VM名称、ID或节点"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 250 }}
                size="small"
                allowClear
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 主数据表格 */}
      <Card 
        size="small" 
        title={`虚拟机资源监控表 (${filteredVMList.length} 台)`}
        extra={
          <Space>
            <Tooltip title="表格显示所有虚拟机的实时资源使用情况">
              <InfoCircleOutlined style={{ color: '#1890ff' }} />
            </Tooltip>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredVMList}
          rowKey="id"
          size="small"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `显示 ${range[0]}-${range[1]} 条，共 ${total} 台虚拟机`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 1000, y: window.innerHeight - 400 }}
          loading={loading}
          bordered
          style={{ fontSize: 12 }}
          rowClassName={(record, index) => {
            const baseClass = index % 2 === 0 ? 'row-even' : 'row-odd';
            const statusClass = record.status === 'running' ? 'row-running' : 'row-stopped';
            return `${baseClass} ${statusClass}`;
          }}
          loading={{
            spinning: loading,
            tip: loadingTip,
            size: 'large'
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
            background-color: #f0f0f0 !important;
            font-weight: bold !important;
            font-size: 12px !important;
            padding: 8px 8px !important;
          }
          .ant-table-tbody > tr > td {
            padding: 8px 8px !important;
            font-size: 11px !important;
          }
        `}</style>
      </Card>
    </div>
  );
}

export default VMResourceMonitor;