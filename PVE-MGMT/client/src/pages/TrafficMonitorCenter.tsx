import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Alert,
  Select,
  DatePicker,
  Switch,
  Tooltip,
  Badge,
  Timeline,
  List,
  Avatar,
  Tabs,
  Spin,
  Typography,
  Modal,
  Drawer,
  Divider,
  message,
  Segmented,
  Empty
} from 'antd';
import {
  MonitorOutlined,
  DashboardOutlined,
  LineChartOutlined,
  HeatMapOutlined,
  BarChartOutlined,
  ReloadOutlined,
  SettingOutlined,
  AlertOutlined,
  TrophyOutlined,
  ApiOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  EyeOutlined,
  SwapOutlined,
  FireOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  FallOutlined,
  RadarChartOutlined,
  EnvironmentOutlined
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import dayjs from 'dayjs';
import { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

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

interface TrendData {
  time: string;
  hour: string;
  netin: number;
  netout: number;
  total: number;
  netinFormatted: string;
  netoutFormatted: string;
  totalFormatted: string;
  netinRate: number;
  netoutRate: number;
}

interface AnalyticsData {
  period: string;
  timestamp: string;
  overview: {
    totalVMs: number;
    activeConnections: number;
    totalTraffic: number;
    avgTrafficPerVM: number;
    peakTraffic: number;
    peakTrafficTime: string;
  };
  distribution: {
    byConnection: Array<{
      id: string;
      name: string;
      vmCount: number;
      totalTraffic: number;
      avgTrafficPerVM: number;
    }>;
    byVMType: {
      qemu: number;
      lxc: number;
    };
    byTrafficLevel: {
      low: number;
      medium: number;
      high: number;
      extreme: number;
    };
  };
  topVMs: Array<{
    id: string;
    name: string;
    traffic: number;
    trafficFormatted: string;
  }>;
  recommendations: Array<{
    type: string;
    title: string;
    message: string;
    priority: string;
  }>;
}

// 格式化字节数
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 格式化速度
const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 获取流量等级颜色
const getTrafficColor = (bytes: number): string => {
  if (bytes === 0) return '#ccc';
  if (bytes < 1024 * 1024) return '#52c41a'; // < 1MB 绿色
  if (bytes < 10 * 1024 * 1024) return '#1890ff'; // < 10MB 蓝色
  if (bytes < 100 * 1024 * 1024) return '#faad14'; // < 100MB 黄色
  if (bytes < 1024 * 1024 * 1024) return '#fa8c16'; // < 1GB 橙色
  if (bytes < 10 * 1024 * 1024 * 1024) return '#f5222d'; // < 10GB 红色
  return '#722ed1'; // >= 10GB 紫色
};

// 获取状态颜色
const getStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    running: '#52c41a',
    stopped: '#d9d9d9',
    suspended: '#faad14',
    error: '#f5222d'
  };
  return statusColors[status] || '#d9d9d9';
};

function TrafficMonitorCenter() {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [selectedVMTrends, setSelectedVMTrends] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30秒
  const [selectedView, setSelectedView] = useState<string>('dashboard');
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [selectedVMsForCompare, setSelectedVMsForCompare] = useState<string[]>([]);
  const [trendDrawerVisible, setTrendDrawerVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedVM, setSelectedVM] = useState<VMTrafficData | null>(null);
  
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  // API调用函数
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/pve/traffic/dashboard`);
      
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        message.error('获取仪表盘数据失败');
      }
    } catch (error) {
      console.error('获取仪表盘数据失败:', error);
      message.error('网络错误，请检查连接');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/pve/traffic/analytics?period=today`);
      
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      console.error('获取分析数据失败:', error);
    }
  }, []);

  const fetchVMTrends = useCallback(async (vmId: string) => {
    try {
      const [connectionId, node, vmid] = vmId.split('-');
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(
        `${apiUrl}/api/pve/traffic/trends?connectionId=${connectionId}&node=${node}&vmid=${vmid}&hours=24`
      );
      
      if (response.ok) {
        const data = await response.json();
        setSelectedVMTrends(data);
      }
    } catch (error) {
      console.error('获取趋势数据失败:', error);
    }
  }, []);

  // 自动刷新设置
  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => {
        fetchDashboardData();
        if (selectedView === 'analytics') {
          fetchAnalyticsData();
        }
      }, refreshInterval);
    } else {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
    }

    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
      }
    };
  }, [autoRefresh, refreshInterval, selectedView, fetchDashboardData, fetchAnalyticsData]);

  // 初始化数据
  useEffect(() => {
    fetchDashboardData();
    fetchAnalyticsData();
  }, [fetchDashboardData, fetchAnalyticsData]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    fetchDashboardData();
    fetchAnalyticsData();
    message.success('数据已刷新');
  }, [fetchDashboardData, fetchAnalyticsData]);

  // 查看VM详情
  const handleViewVMDetail = useCallback((vm: VMTrafficData) => {
    setSelectedVM(vm);
    setDetailModalVisible(true);
    fetchVMTrends(vm.id);
  }, [fetchVMTrends]);

  // 查看VM趋势
  const handleViewTrends = useCallback((vm: VMTrafficData) => {
    setSelectedVM(vm);
    fetchVMTrends(vm.id);
    setTrendDrawerVisible(true);
  }, [fetchVMTrends]);

  // VM列表表格列定义
  const vmColumns: ColumnsType<VMTrafficData> = [
    {
      title: 'VM信息',
      key: 'vmInfo',
      width: 250,
      fixed: 'left',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Space>
            <Badge 
              color={getStatusColor(record.status)} 
              title={`状态: ${record.status}`} 
            />
            <Tag color={record.type === 'qemu' ? 'blue' : 'green'}>{record.type.toUpperCase()}</Tag>
            <Text strong>{record.name}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            ID: {record.vmid} | 节点: {record.node}
          </Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            连接: {record.connectionName}
          </Text>
        </Space>
      ),
    },
    {
      title: '实时速度',
      key: 'speed',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CloudDownloadOutlined style={{ color: '#1890ff' }} />
            <Text style={{ fontSize: '12px' }}>{formatSpeed(record.speed.netin)}</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CloudUploadOutlined style={{ color: '#52c41a' }} />
            <Text style={{ fontSize: '12px' }}>{formatSpeed(record.speed.netout)}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '小时流量',
      key: 'hourlyTraffic',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Progress
            percent={Math.min(100, (record.hourly.total / (1024 * 1024 * 1024)) * 100)}
            size="small"
            strokeColor={getTrafficColor(record.hourly.total)}
            format={() => formatBytes(record.hourly.total)}
          />
          <Space split={<Text type="secondary">|</Text>} size="small">
            <Text style={{ fontSize: '12px', color: '#1890ff' }}>
              ↓ {formatBytes(record.hourly.netin)}
            </Text>
            <Text style={{ fontSize: '12px', color: '#52c41a' }}>
              ↑ {formatBytes(record.hourly.netout)}
            </Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewVMDetail(record)}
            />
          </Tooltip>
          <Tooltip title="查看趋势">
            <Button
              type="text"
              size="small"
              icon={<LineChartOutlined />}
              onClick={() => handleViewTrends(record)}
            />
          </Tooltip>
          <Tooltip title="添加到对比">
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => {
                if (!selectedVMsForCompare.includes(record.id)) {
                  setSelectedVMsForCompare([...selectedVMsForCompare, record.id]);
                  message.success(`已添加 ${record.name} 到对比列表`);
                } else {
                  message.info(`${record.name} 已在对比列表中`);
                }
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 告警列表组件
  const AlertsList = () => (
    <List
      dataSource={dashboardData?.trafficAlerts || []}
      renderItem={item => (
        <List.Item>
          <List.Item.Meta
            avatar={
              <Avatar
                icon={<AlertOutlined />}
                style={{ 
                  backgroundColor: item.level === 'critical' ? '#f5222d' : '#faad14' 
                }}
              />
            }
            title={
              <Space>
                <Badge color={item.level === 'critical' ? 'red' : 'orange'} />
                {item.message}
              </Space>
            }
            description={
              <Space>
                <Text type="secondary">{dayjs(item.timestamp).format('YYYY-MM-DD HH:mm:ss')}</Text>
                <Tag color={item.vm.type === 'qemu' ? 'blue' : 'green'}>{item.vm.type.toUpperCase()}</Tag>
              </Space>
            }
          />
          <Button 
            type="link" 
            onClick={() => handleViewVMDetail(item.vm)}
          >
            查看详情
          </Button>
        </List.Item>
      )}
      locale={{ emptyText: '暂无告警' }}
    />
  );

  // 流量排行榜组件
  const TrafficRanking = () => (
    <List
      dataSource={dashboardData?.topTrafficVMs || []}
      renderItem={(item, index) => (
        <List.Item>
          <List.Item.Meta
            avatar={
              <Avatar
                style={{
                  backgroundColor: index < 3 ? '#faad14' : '#d9d9d9',
                  color: index < 3 ? '#fff' : '#666'
                }}
              >
                {index === 0 ? <TrophyOutlined /> : index + 1}
              </Avatar>
            }
            title={
              <Space>
                <Text strong>{item.name}</Text>
                <Tag color={item.type === 'qemu' ? 'blue' : 'green'}>{item.type.toUpperCase()}</Tag>
              </Space>
            }
            description={
              <Space>
                <Text type="secondary">{item.node} | ID: {item.vmid}</Text>
                <Text style={{ color: getTrafficColor(item.hourly.total) }}>
                  {formatBytes(item.hourly.total)}
                </Text>
              </Space>
            }
          />
          <Button 
            type="link" 
            onClick={() => handleViewVMDetail(item)}
          >
            查看
          </Button>
        </List.Item>
      )}
      locale={{ emptyText: '暂无数据' }}
    />
  );

  // 统计卡片
  const renderStatisticCards = () => (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={12} lg={6}>
        <Card hoverable>
          <Statistic
            title={
              <Space>
                <MonitorOutlined style={{ color: '#1890ff' }} />
                监控虚拟机
              </Space>
            }
            value={dashboardData?.overview.totalVMs || 0}
            suffix="台"
            valueStyle={{ color: '#1890ff' }}
          />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">
              运行中: {dashboardData?.overview.activeVMs || 0} 台
            </Text>
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card hoverable>
          <Statistic
            title={
              <Space>
                <ApiOutlined style={{ color: '#52c41a' }} />
                总流量
              </Space>
            }
            value={formatBytes(dashboardData?.overview.totalTraffic || 0)}
            valueStyle={{ color: '#52c41a' }}
          />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">
              最近一小时累计
            </Text>
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card hoverable>
          <Statistic
            title={
              <Space>
                <CloudDownloadOutlined style={{ color: '#1890ff' }} />
                总下载
              </Space>
            }
            value={formatBytes(dashboardData?.overview.totalNetin || 0)}
            valueStyle={{ color: '#1890ff' }}
          />
          <div style={{ marginTop: 8 }}>
            <Progress
              percent={dashboardData?.overview.totalNetin && dashboardData?.overview.totalTraffic ? 
                (dashboardData.overview.totalNetin / dashboardData.overview.totalTraffic) * 100 : 0}
              size="small"
              strokeColor="#1890ff"
              showInfo={false}
            />
          </div>
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card hoverable>
          <Statistic
            title={
              <Space>
                <CloudUploadOutlined style={{ color: '#52c41a' }} />
                总上传
              </Space>
            }
            value={formatBytes(dashboardData?.overview.totalNetout || 0)}
            valueStyle={{ color: '#52c41a' }}
          />
          <div style={{ marginTop: 8 }}>
            <Progress
              percent={dashboardData?.overview.totalNetout && dashboardData?.overview.totalTraffic ? 
                (dashboardData.overview.totalNetout / dashboardData.overview.totalTraffic) * 100 : 0}
              size="small"
              strokeColor="#52c41a"
              showInfo={false}
            />
          </div>
        </Card>
      </Col>
    </Row>
  );

  // 仪表盘视图
  const renderDashboard = () => (
    <div>
      {renderStatisticCards()}
      
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card 
            title={
              <Space>
                <DashboardOutlined />
                虚拟机流量监控
              </Space>
            }
            extra={
              <Space>
                <Button 
                  type="primary" 
                  size="small"
                  onClick={() => setCompareModalVisible(true)}
                  disabled={selectedVMsForCompare.length < 2}
                >
                  对比选中 ({selectedVMsForCompare.length})
                </Button>
                <Button size="small" onClick={handleRefresh} loading={loading}>
                  刷新
                </Button>
              </Space>
            }
          >
            <Table
              columns={vmColumns}
              dataSource={dashboardData?.vmList || []}
              rowKey="id"
              size="small"
              scroll={{ x: 800, y: 400 }}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 台虚拟机`,
              }}
              loading={loading}
            />
          </Card>
        </Col>
        
        <Col xs={24} lg={8}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Card 
              title={
                <Space>
                  <TrophyOutlined />
                  流量排行榜
                </Space>
              }
              size="small"
            >
              <TrafficRanking />
            </Card>
            
            <Card 
              title={
                <Space>
                  <AlertOutlined />
                  流量告警
                </Space>
              }
              size="small"
            >
              <AlertsList />
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );

  // 分析视图
  const renderAnalytics = () => {
    if (!analyticsData) return <Spin size="large" />;

    const trafficLevelData = [
      { name: '低流量 (<100MB)', value: analyticsData.distribution.byTrafficLevel.low, color: '#52c41a' },
      { name: '中等流量 (100MB-1GB)', value: analyticsData.distribution.byTrafficLevel.medium, color: '#1890ff' },
      { name: '高流量 (1GB-10GB)', value: analyticsData.distribution.byTrafficLevel.high, color: '#faad14' },
      { name: '极高流量 (>10GB)', value: analyticsData.distribution.byTrafficLevel.extreme, color: '#f5222d' },
    ];

    const vmTypeData = [
      { name: 'QEMU', value: analyticsData.distribution.byVMType.qemu, color: '#1890ff' },
      { name: 'LXC', value: analyticsData.distribution.byVMType.lxc, color: '#52c41a' },
    ];

    return (
      <div>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="活跃连接"
                value={analyticsData.overview.activeConnections}
                prefix={<EnvironmentOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="平均VM流量"
                value={formatBytes(analyticsData.overview.avgTrafficPerVM)}
                prefix={<BarChartOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="峰值流量"
                value={formatBytes(analyticsData.overview.peakTraffic)}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="总流量"
                value={formatBytes(analyticsData.overview.totalTraffic)}
                prefix={<ApiOutlined />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
          <Col xs={24} lg={12}>
            <Card title="流量等级分布">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={trafficLevelData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {trafficLevelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card title="VM类型流量分布">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vmTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={formatBytes} />
                  <RechartsTooltip formatter={(value) => formatBytes(value as number)} />
                  <Bar dataKey="value" fill="#1890ff" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>

        <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
          <Col xs={24} lg={16}>
            <Card title="连接流量分布">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analyticsData.distribution.byConnection}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={formatBytes} />
                  <RechartsTooltip formatter={(value) => formatBytes(value as number)} />
                  <Bar dataKey="totalTraffic" fill="#52c41a" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          
          <Col xs={24} lg={8}>
            <Card title="Top 流量 VMs">
              <List
                dataSource={analyticsData.topVMs}
                renderItem={(item, index) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar>{index + 1}</Avatar>}
                      title={item.name}
                      description={item.trafficFormatted}
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>

        {analyticsData.recommendations.length > 0 && (
          <Row style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card title="优化建议">
                <Space direction="vertical" style={{ width: '100%' }}>
                  {analyticsData.recommendations.map((rec, index) => (
                    <Alert
                      key={index}
                      message={rec.title}
                      description={rec.message}
                      type={rec.type as any}
                      showIcon
                    />
                  ))}
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <Space>
                <RadarChartOutlined style={{ color: '#1890ff' }} />
                智能流量监控中心
              </Space>
            </Title>
            <Paragraph type="secondary" style={{ margin: '4px 0' }}>
              实时监控虚拟机流量使用情况，智能分析流量趋势
            </Paragraph>
          </Col>
          <Col>
            <Space>
              <Switch
                checkedChildren="自动刷新"
                unCheckedChildren="手动刷新"
                checked={autoRefresh}
                onChange={setAutoRefresh}
              />
              <Select
                value={refreshInterval}
                style={{ width: 120 }}
                onChange={setRefreshInterval}
                disabled={!autoRefresh}
              >
                <Option value={10000}>10秒</Option>
                <Option value={30000}>30秒</Option>
                <Option value={60000}>1分钟</Option>
                <Option value={300000}>5分钟</Option>
              </Select>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
              >
                刷新数据
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 主要内容区域 */}
      <Card>
        <Segmented
          value={selectedView}
          onChange={setSelectedView}
          options={[
            {
              label: (
                <Space>
                  <DashboardOutlined />
                  实时监控
                </Space>
              ),
              value: 'dashboard',
            },
            {
              label: (
                <Space>
                  <BarChartOutlined />
                  流量分析
                </Space>
              ),
              value: 'analytics',
            },
          ]}
          style={{ marginBottom: 24 }}
        />

        {selectedView === 'dashboard' && renderDashboard()}
        {selectedView === 'analytics' && renderAnalytics()}
      </Card>

      {/* VM详情模态框 */}
      <Modal
        title={selectedVM ? `VM详情 - ${selectedVM.name}` : 'VM详情'}
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={800}
        footer={null}
      >
        {selectedVM && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Card size="small" title="基本信息">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div><Text strong>名称:</Text> {selectedVM.name}</div>
                    <div><Text strong>ID:</Text> {selectedVM.vmid}</div>
                    <div><Text strong>类型:</Text> 
                      <Tag color={selectedVM.type === 'qemu' ? 'blue' : 'green'}>
                        {selectedVM.type.toUpperCase()}
                      </Tag>
                    </div>
                    <div><Text strong>状态:</Text> 
                      <Badge color={getStatusColor(selectedVM.status)} text={selectedVM.status} />
                    </div>
                    <div><Text strong>节点:</Text> {selectedVM.node}</div>
                    <div><Text strong>连接:</Text> {selectedVM.connectionName}</div>
                  </Space>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="流量统计">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text strong>小时总流量:</Text> {formatBytes(selectedVM.hourly.total)}
                    </div>
                    <div>
                      <Text strong>下载:</Text> {formatBytes(selectedVM.hourly.netin)}
                    </div>
                    <div>
                      <Text strong>上传:</Text> {formatBytes(selectedVM.hourly.netout)}
                    </div>
                    <Divider />
                    <div>
                      <Text strong>当前下载速度:</Text> {formatSpeed(selectedVM.speed.netin)}
                    </div>
                    <div>
                      <Text strong>当前上传速度:</Text> {formatSpeed(selectedVM.speed.netout)}
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
            
            {selectedVMTrends && (
              <Card size="small" title="24小时流量趋势" style={{ marginTop: 16 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={selectedVMTrends.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="hour" 
                      tickFormatter={(value) => value.split('-')[3] + ':00'}
                    />
                    <YAxis tickFormatter={formatBytes} />
                    <RechartsTooltip 
                      labelFormatter={(value) => `时间: ${value.split('-')[3]}:00`}
                      formatter={(value, name) => [formatBytes(value as number), name === 'netin' ? '下载' : name === 'netout' ? '上传' : '总计']}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="netin" stroke="#1890ff" name="下载" />
                    <Line type="monotone" dataKey="netout" stroke="#52c41a" name="上传" />
                    <Line type="monotone" dataKey="total" stroke="#722ed1" name="总计" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* 趋势抽屉 */}
      <Drawer
        title={selectedVM ? `${selectedVM.name} - 流量趋势` : '流量趋势'}
        placement="right"
        width={720}
        open={trendDrawerVisible}
        onClose={() => setTrendDrawerVisible(false)}
      >
        {selectedVMTrends && (
          <div>
            <Card size="small" title="趋势摘要" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="总流量"
                    value={formatBytes(selectedVMTrends.summary.totalTraffic)}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="平均每小时"
                    value={formatBytes(selectedVMTrends.summary.averagePerHour)}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="峰值小时"
                    value={selectedVMTrends.summary.peakHour ? 
                      formatBytes(selectedVMTrends.summary.peakHour.total) : '0 B'}
                    valueStyle={{ fontSize: '16px' }}
                  />
                </Col>
              </Row>
            </Card>
            
            <Card size="small" title="24小时详细趋势">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={selectedVMTrends.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={(value) => value.split('-')[3] + ':00'}
                  />
                  <YAxis tickFormatter={formatBytes} />
                  <RechartsTooltip 
                    labelFormatter={(value) => `时间: ${value.split('-')[3]}:00`}
                    formatter={(value, name) => [formatBytes(value as number), name === 'netin' ? '下载' : name === 'netout' ? '上传' : '总计']}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="netin" stackId="1" stroke="#1890ff" fill="#1890ff" fillOpacity={0.6} name="下载" />
                  <Area type="monotone" dataKey="netout" stackId="1" stroke="#52c41a" fill="#52c41a" fillOpacity={0.6} name="上传" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default TrafficMonitorCenter;