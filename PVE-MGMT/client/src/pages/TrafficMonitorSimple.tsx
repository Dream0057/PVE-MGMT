import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Space,
  Tag,
  Alert,
  Spin,
  Typography,
  message,
  Segmented,
  Switch,
} from 'antd';
import {
  MonitorOutlined,
  DashboardOutlined,
  BarChartOutlined,
  ReloadOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  RadarChartOutlined,
} from '@ant-design/icons';
import { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

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

function TrafficMonitorSimple() {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [selectedView, setSelectedView] = useState<string>('dashboard');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');

  // API调用函数（优化版本）
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      // 优化：设置超时和错误处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      
      const response = await fetch(`${apiUrl}/api/pve/traffic/dashboard`, {
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
        setLastUpdateTime(new Date().toLocaleTimeString());
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      // 静默处理AbortError，避免在React Strict Mode下的错误提示
      if (error.name === 'AbortError') {
        console.debug('请求被中断（可能由于组件卸载或重新挂载）');
        // 不显示错误消息，但继续执行finally块
      } else {
        console.error('获取仪表盘数据失败:', error);
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

  // 初始化数据
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000); // 30秒刷新一次
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboardData]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    fetchDashboardData();
    message.success('数据已刷新');
  }, [fetchDashboardData]);

  // VM列表表格列定义
  const vmColumns: ColumnsType<VMTrafficData> = [
    {
      title: '虚拟机',
      key: 'vmInfo',
      width: 160,
      fixed: 'left',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: getStatusColor(record.status)
            }} />
            <Text strong style={{ fontSize: '13px' }}>{record.name}</Text>
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            {record.type.toUpperCase()}-{record.vmid} @ {record.node}
          </div>
        </div>
      ),
    },
    {
      title: '连接',
      key: 'connection',
      width: 120,
      render: (_, record) => (
        <Text style={{ fontSize: '12px' }}>{record.connectionName}</Text>
      ),
    },
    {
      title: '实时下载',
      key: 'speedIn',
      width: 100,
      sorter: (a, b) => a.speed.netin - b.speed.netin,
      render: (_, record) => (
        <div style={{
          padding: '2px 6px',
          borderRadius: '3px',
          backgroundColor: record.speed.netin > 0 ? '#e6f7ff' : '#f5f5f5',
          fontSize: '11px',
          textAlign: 'center',
          color: record.speed.netin > 0 ? '#1890ff' : '#999'
        }}>
          {formatSpeed(record.speed.netin)}
        </div>
      ),
    },
    {
      title: '实时上传',
      key: 'speedOut',
      width: 100,
      sorter: (a, b) => a.speed.netout - b.speed.netout,
      render: (_, record) => (
        <div style={{
          padding: '2px 6px',
          borderRadius: '3px',
          backgroundColor: record.speed.netout > 0 ? '#f6ffed' : '#f5f5f5',
          fontSize: '11px',
          textAlign: 'center',
          color: record.speed.netout > 0 ? '#52c41a' : '#999'
        }}>
          {formatSpeed(record.speed.netout)}
        </div>
      ),
    },
    {
      title: '小时下载',
      key: 'hourlyIn',
      width: 120,
      sorter: (a, b) => a.hourly.netin - b.hourly.netin,
      render: (_, record) => (
        <div style={{
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: getTrafficColor(record.hourly.netin),
          color: 'white',
          fontSize: '11px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          {formatBytes(record.hourly.netin)}
        </div>
      ),
    },
    {
      title: '小时上传',
      key: 'hourlyOut',
      width: 120,
      sorter: (a, b) => a.hourly.netout - b.hourly.netout,
      render: (_, record) => (
        <div style={{
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: getTrafficColor(record.hourly.netout),
          color: 'white',
          fontSize: '11px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          {formatBytes(record.hourly.netout)}
        </div>
      ),
    },
    {
      title: '小时总计',
      key: 'hourlyTotal',
      width: 120,
      sorter: (a, b) => a.hourly.total - b.hourly.total,
      defaultSortOrder: 'descend',
      render: (_, record) => (
        <div style={{
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: getTrafficColor(record.hourly.total),
          color: 'white',
          fontSize: '12px',
          textAlign: 'center',
          fontWeight: 'bold',
          border: '2px solid rgba(255,255,255,0.3)'
        }}>
          {formatBytes(record.hourly.total)}
        </div>
      ),
    },
    {
      title: '流量比例',
      key: 'ratio',
      width: 100,
      render: (_, record) => {
        const inPercent = record.hourly.total > 0 ? (record.hourly.netin / record.hourly.total * 100) : 0;
        const outPercent = 100 - inPercent;
        return (
          <div style={{ fontSize: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div style={{
                width: `${Math.max(inPercent, 5)}%`,
                height: 4,
                backgroundColor: '#1890ff',
                borderRadius: 2
              }} />
              <span style={{ color: '#1890ff' }}>{inPercent.toFixed(0)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: `${Math.max(outPercent, 5)}%`,
                height: 4,
                backgroundColor: '#52c41a',
                borderRadius: 2
              }} />
              <span style={{ color: '#52c41a' }}>{outPercent.toFixed(0)}%</span>
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <div style={{
          padding: '2px 6px',
          borderRadius: '10px',
          backgroundColor: getStatusColor(record.status),
          color: 'white',
          fontSize: '10px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          {record.status}
        </div>
      ),
    },
  ];

  // 统计卡片
  const renderStatisticCards = () => {
    const totalTraffic = dashboardData?.overview.totalTraffic || 0;
    const totalNetin = dashboardData?.overview.totalNetin || 0;
    const totalNetout = dashboardData?.overview.totalNetout || 0;
    const inPercent = totalTraffic > 0 ? (totalNetin / totalTraffic * 100) : 0;
    const outPercent = totalTraffic > 0 ? (totalNetout / totalTraffic * 100) : 0;
    const avgTrafficPerVM = totalTraffic > 0 ? totalTraffic / (dashboardData?.overview.totalVMs || 1) : 0;
    
    // 获取Top流量VM
    const topVM = dashboardData?.vmList?.reduce((max, vm) => 
      vm.hourly.total > (max?.hourly.total || 0) ? vm : max, null);
    
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" style={{ height: '120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>虚拟机概览</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff', marginBottom: 4 }}>
                  {dashboardData?.overview.totalVMs || 0}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  运行: {dashboardData?.overview.activeVMs || 0} | 
                  停止: {(dashboardData?.overview.totalVMs || 0) - (dashboardData?.overview.activeVMs || 0)}
                </div>
              </div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1890ff 0%, #69c0ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                VM
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: '10px', color: '#999' }}>
              平均流量: {formatBytes(avgTrafficPerVM)}
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" style={{ height: '120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>总流量 (1小时)</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a', marginBottom: 4 }}>
                  {formatBytes(totalTraffic)}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: '10px' }}>
                  <span style={{ color: '#1890ff' }}>
                    ↓ {formatBytes(totalNetin)} ({inPercent.toFixed(1)}%)
                  </span>
                  <span style={{ color: '#fa8c16' }}>
                    ↑ {formatBytes(totalNetout)} ({outPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                NET
              </div>
            </div>
            <div style={{ 
              marginTop: 6,
              height: 4,
              borderRadius: 2,
              background: '#f0f0f0',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${inPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #1890ff, #69c0ff)',
                float: 'left'
              }} />
              <div style={{
                width: `${outPercent}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #fa8c16, #ffd666)',
                float: 'left'
              }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" style={{ height: '120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>流量王者</div>
                {topVM ? (
                  <>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fa541c', marginBottom: 2 }}>
                      {topVM.name}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#722ed1', marginBottom: 2 }}>
                      {formatBytes(topVM.hourly.total)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      {topVM.type.toUpperCase()}-{topVM.vmid} @ {topVM.node}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '14px', color: '#999' }}>暂无数据</div>
                )}
              </div>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #fa541c 0%, #ff9c6e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                👑
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  // 仪表盘视图
  const renderDashboard = () => (
    <div>
      {renderStatisticCards()}
      
      <Row gutter={[24, 24]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card 
            title={
              <Space>
                <DashboardOutlined />
                虚拟机流量监控
              </Space>
            }
            extra={
              <Button size="small" onClick={handleRefresh} loading={loading}>
                刷新
              </Button>
            }
          >
            <Table
              columns={vmColumns}
              dataSource={dashboardData?.vmList || []}
              rowKey="id"
              size="small"
              scroll={{ x: 1200, y: 500 }}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `显示 ${range[0]}-${range[1]} 条，共 ${total} 台虚拟机`,
                pageSizeOptions: ['10', '20', '50', '100'],
              }}
              loading={loading}
              bordered
              style={{
                fontSize: '12px'
              }}
              rowClassName={(record, index) => 
                index % 2 === 0 ? 'table-row-light' : 'table-row-dark'
              }
            />
            <style>{`
              .table-row-light td {
                background-color: #fafafa !important;
              }
              .table-row-dark td {
                background-color: #ffffff !important;
              }
              .ant-table-thead > tr > th {
                background-color: #f0f0f0 !important;
                font-weight: bold !important;
                font-size: 12px !important;
                padding: 8px 6px !important;
              }
              .ant-table-tbody > tr > td {
                padding: 6px 6px !important;
                font-size: 11px !important;
              }
              .ant-table-tbody > tr:hover > td {
                background-color: #e6f7ff !important;
              }
            `}</style>
          </Card>
        </Col>
      </Row>
      
      {/* 快速统计面板 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Top 5 流量VM */}
        <Col xs={24} md={12}>
          <Card title="流量排行榜 TOP 5" size="small" style={{ height: '280px' }}>
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {dashboardData?.vmList
                ?.sort((a, b) => b.hourly.total - a.hourly.total)
                .slice(0, 5)
                .map((vm, index) => (
                  <div key={vm.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: index < 4 ? '1px solid #f0f0f0' : 'none'
                  }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: index === 0 ? '#faad14' : index === 1 ? '#bfbfbf' : index === 2 ? '#d48806' : '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      marginRight: 12
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: 2 }}>
                        {vm.name}
                      </div>
                      <div style={{ fontSize: '10px', color: '#666' }}>
                        {vm.type.toUpperCase()}-{vm.vmid} @ {vm.node}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: getTrafficColor(vm.hourly.total)
                      }}>
                        {formatBytes(vm.hourly.total)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#999' }}>
                        ↓{formatBytes(vm.hourly.netin)} ↑{formatBytes(vm.hourly.netout)}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </Col>

        {/* 实时状态统计 */}
        <Col xs={24} md={12}>
          <Card title="实时状态统计" size="small" style={{ height: '280px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: '220px' }}>
              {/* 运行状态分布 */}
              <div style={{ 
                padding: 12, 
                background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)',
                borderRadius: 8,
                border: '1px solid #b7eb8f'
              }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: 6 }}>运行状态</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#52c41a' }}>
                  {dashboardData?.overview.activeVMs || 0}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>运行中</div>
              </div>

              {/* 停止状态分布 */}
              <div style={{ 
                padding: 12, 
                background: 'linear-gradient(135deg, #fff2e8 0%, #ffd8bf 100%)',
                borderRadius: 8,
                border: '1px solid #ffbb96'
              }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: 6 }}>停止状态</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fa8c16' }}>
                  {(dashboardData?.overview.totalVMs || 0) - (dashboardData?.overview.activeVMs || 0)}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>已停止</div>
              </div>

              {/* 平均流量 */}
              <div style={{ 
                padding: 12, 
                background: 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)',
                borderRadius: 8,
                border: '1px solid #91d5ff'
              }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: 6 }}>平均流量</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1890ff' }}>
                  {formatBytes((dashboardData?.overview.totalTraffic || 0) / Math.max(dashboardData?.overview.totalVMs || 1, 1))}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>每VM</div>
              </div>

              {/* 流量告警数 */}
              <div style={{ 
                padding: 12, 
                background: 'linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)',
                borderRadius: 8,
                border: '1px solid #ffa39e'
              }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: 6 }}>流量告警</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f5222d' }}>
                  {dashboardData?.trafficAlerts?.length || 0}
                </div>
                <div style={{ fontSize: '10px', color: '#666' }}>活跃告警</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 告警信息 */}
      {dashboardData?.trafficAlerts && dashboardData.trafficAlerts.length > 0 && (
        <Row style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card title="流量告警" size="small">
              <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                {dashboardData.trafficAlerts.map((alert, index) => (
                  <Alert
                    key={index}
                    message={alert.message}
                    type={alert.level === 'critical' ? 'error' : 'warning'}
                    showIcon
                    closable
                    style={{ marginBottom: 8, fontSize: '12px' }}
                  />
                ))}
              </div>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );

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
            <Text type="secondary" style={{ margin: '4px 0' }}>
              实时监控虚拟机流量使用情况，智能分析流量趋势
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
                <span style={{ fontSize: '12px', color: '#666' }}>
                  自动刷新 {autoRefresh ? '(30秒)' : ''}
                </span>
              </div>
              {lastUpdateTime && (
                <span style={{ fontSize: '11px', color: '#999' }}>
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
          ]}
          style={{ marginBottom: 24 }}
        />

        {loading && !dashboardData ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
          </div>
        ) : (
          renderDashboard()
        )}
      </Card>
    </div>
  );
}

export default TrafficMonitorSimple;