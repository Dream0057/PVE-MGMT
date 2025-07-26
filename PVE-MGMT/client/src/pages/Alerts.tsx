import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Space,
  Button,
  Select,
  Row,
  Col,
  Tag,
  Tooltip,
  Typography,
  Badge,
  Modal,
  Divider,
  Statistic,
  Timeline,
} from 'antd';
import {
  AlertOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  BellOutlined,
  CloudServerOutlined,
  DesktopOutlined,
  GlobalOutlined,
  DashboardOutlined,
  EyeOutlined,
  CheckOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

// 告警等级
enum AlertLevel {
  CRITICAL = 'critical',
  WARNING = 'warning', 
  INFO = 'info'
}

// 告警类型
enum AlertType {
  PVE_SYSTEM = 'pve_system',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  SERVICE = 'service'
}

// 告警状态
enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved'
}

interface AlertItem {
  id: string;
  level: AlertLevel;
  type: AlertType;
  status: AlertStatus;
  title: string;
  description: string;
  source: string;
  connectionId?: string;
  connectionName?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
}

function Alerts() {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 获取告警数据
  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      const params = new URLSearchParams();
      if (selectedLevel !== 'all') params.append('level', selectedLevel);
      if (selectedType !== 'all') params.append('type', selectedType);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      
      const url = `${apiUrl}/api/alerts${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        setAlerts(Array.isArray(data) ? data : []);
      } else {
        console.error('API响应错误:', response.status);
        setAlerts([]);
      }
    } catch (error) {
      console.error('获取告警数据失败:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  // 确认告警
  const acknowledgeAlert = async (alertId: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy: 'current_user' })
      });
      
      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error('确认告警失败:', error);
    }
  };

  // 解决告警
  const resolveAlert = async (alertId: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/alerts/${alertId}/resolve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error('解决告警失败:', error);
    }
  };

  // 删除告警
  const deleteAlert = async (alertId: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/alerts/${alertId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error('删除告警失败:', error);
    }
  };

  // 获取告警等级标签
  const getLevelTag = (level: AlertLevel) => {
    switch (level) {
      case AlertLevel.CRITICAL:
        return <Tag color="red" icon={<CloseCircleOutlined />}>严重</Tag>;
      case AlertLevel.WARNING:
        return <Tag color="orange" icon={<ExclamationCircleOutlined />}>警告</Tag>;
      case AlertLevel.INFO:
        return <Tag color="blue" icon={<InfoCircleOutlined />}>信息</Tag>;
      default:
        return <Tag>未知</Tag>;
    }
  };

  // 获取告警类型标签
  const getTypeTag = (type: AlertType) => {
    switch (type) {
      case AlertType.PVE_SYSTEM:
        return <Tag color="purple" icon={<CloudServerOutlined />}>PVE系统</Tag>;
      case AlertType.PERFORMANCE:
        return <Tag color="gold" icon={<DashboardOutlined />}>性能</Tag>;
      case AlertType.NETWORK:
        return <Tag color="cyan" icon={<GlobalOutlined />}>网络</Tag>;
      case AlertType.SERVICE:
        return <Tag color="green" icon={<DesktopOutlined />}>服务</Tag>;
      default:
        return <Tag>未知</Tag>;
    }
  };

  // 获取状态标签
  const getStatusTag = (status: AlertStatus) => {
    switch (status) {
      case AlertStatus.ACTIVE:
        return <Tag color="red" icon={<AlertOutlined />}>活跃</Tag>;
      case AlertStatus.ACKNOWLEDGED:
        return <Tag color="orange" icon={<WarningOutlined />}>已确认</Tag>;
      case AlertStatus.RESOLVED:
        return <Tag color="green" icon={<CheckCircleOutlined />}>已解决</Tag>;
      default:
        return <Tag>未知</Tag>;
    }
  };

  // 表格列定义
  const columns: ColumnsType<AlertItem> = [
    {
      title: '等级',
      dataIndex: 'level',
      key: 'level',
      width: 80,
      render: (level: AlertLevel) => getLevelTag(level),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: AlertType) => getTypeTag(type),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: AlertStatus) => getStatusTag(status),
    },
    {
      title: '告警信息',
      key: 'info',
      render: (_, record) => (
        <div>
          <Text strong>{record.title}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.description}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: '11px' }}>
            来源: {record.source}
            {record.connectionName && ` | 连接: ${record.connectionName}`}
          </Text>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (time: string) => {
        if (!time) return '-';
        try {
          return (
            <Tooltip title={dayjs(time).format('YYYY-MM-DD HH:mm:ss')}>
              <Text style={{ fontSize: '12px' }}>
                {dayjs(time).format('MM-DD HH:mm')}
              </Text>
            </Tooltip>
          );
        } catch (error) {
          return <Text style={{ fontSize: '12px' }}>-</Text>;
        }
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedAlert(record);
                setDetailVisible(true);
              }}
            />
          </Tooltip>
          {record.status === AlertStatus.ACTIVE && (
            <Tooltip title="确认告警">
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => acknowledgeAlert(record.id)}
              />
            </Tooltip>
          )}
          {record.status !== AlertStatus.RESOLVED && (
            <Tooltip title="解决告警">
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => resolveAlert(record.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="删除告警">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => deleteAlert(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // 计算统计数据
  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.level === AlertLevel.CRITICAL).length,
    warning: alerts.filter(a => a.level === AlertLevel.WARNING).length,
    info: alerts.filter(a => a.level === AlertLevel.INFO).length,
    active: alerts.filter(a => a.status === AlertStatus.ACTIVE).length,
    acknowledged: alerts.filter(a => a.status === AlertStatus.ACKNOWLEDGED).length,
    resolved: alerts.filter(a => a.status === AlertStatus.RESOLVED).length,
  };

  useEffect(() => {
    // 延迟初始化，确保页面已加载
    const timer = setTimeout(() => {
      fetchAlerts();
    }, 100);
    
    // 定时刷新告警数据
    const interval = setInterval(fetchAlerts, 30000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [selectedLevel, selectedType, selectedStatus]);

  // 错误边界
  if (hasError) {
    return (
      <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <h2>页面加载出错</h2>
            <p>请刷新页面重试</p>
            <Button type="primary" onClick={() => {
              setHasError(false);
              fetchAlerts();
            }}>
              重新加载
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
              <BellOutlined style={{ marginRight: '8px', color: '#ff4d4f' }} />
              系统告警
            </h1>
            <p style={{ margin: '4px 0 0 32px', color: '#666', fontSize: '14px' }}>
              实时监控系统状态和告警信息
            </p>
          </div>
          <Button 
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchAlerts}
            loading={loading}
            size="large"
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={6}>
          <Card hoverable style={{ borderRadius: '12px', textAlign: 'center' }}>
            <Statistic
              title="总告警数"
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable style={{ borderRadius: '12px', textAlign: 'center' }}>
            <Statistic
              title="严重告警"
              value={stats.critical}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable style={{ borderRadius: '12px', textAlign: 'center' }}>
            <Statistic
              title="警告告警"
              value={stats.warning}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card hoverable style={{ borderRadius: '12px', textAlign: 'center' }}>
            <Statistic
              title="活跃告警"
              value={stats.active}
              valueStyle={{ color: stats.active > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选器 */}
      <Card style={{ marginBottom: '24px', borderRadius: '12px' }}>
        <Row gutter={16} align="middle">
          <Col span={4}>
            <Text strong>告警等级:</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedLevel}
              onChange={setSelectedLevel}
            >
              <Option value="all">全部</Option>
              <Option value={AlertLevel.CRITICAL}>严重</Option>
              <Option value={AlertLevel.WARNING}>警告</Option>
              <Option value={AlertLevel.INFO}>信息</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Text strong>告警类型:</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedType}
              onChange={setSelectedType}
            >
              <Option value="all">全部</Option>
              <Option value={AlertType.PVE_SYSTEM}>PVE系统</Option>
              <Option value={AlertType.PERFORMANCE}>性能</Option>
              <Option value={AlertType.NETWORK}>网络</Option>
              <Option value={AlertType.SERVICE}>服务</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Text strong>告警状态:</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="all">全部</Option>
              <Option value={AlertStatus.ACTIVE}>活跃</Option>
              <Option value={AlertStatus.ACKNOWLEDGED}>已确认</Option>
              <Option value={AlertStatus.RESOLVED}>已解决</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* 告警列表 */}
      <Card style={{ borderRadius: '12px' }}>
        <Table
          columns={columns}
          dataSource={alerts}
          rowKey="id"
          loading={loading}
          locale={{
            emptyText: loading ? '加载中...' : '暂无告警数据',
          }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条告警`,
          }}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* 告警详情Modal */}
      <Modal
        title={
          <Space>
            <AlertOutlined style={{ color: '#ff4d4f' }} />
            告警详情
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        }
        width={800}
      >
        {selectedAlert && (
          <div>
            <Row gutter={24}>
              <Col span={12}>
                <div style={{ marginBottom: '16px' }}>
                  <Text strong>告警等级:</Text>
                  <div style={{ marginTop: '8px' }}>
                    {getLevelTag(selectedAlert.level)}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: '16px' }}>
                  <Text strong>告警类型:</Text>
                  <div style={{ marginTop: '8px' }}>
                    {getTypeTag(selectedAlert.type)}
                  </div>
                </div>
              </Col>
            </Row>

            <div style={{ marginBottom: '16px' }}>
              <Text strong>告警状态:</Text>
              <div style={{ marginTop: '8px' }}>
                {getStatusTag(selectedAlert.status)}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong>告警标题:</Text>
              <div style={{ marginTop: '8px' }}>
                <Text>{selectedAlert.title}</Text>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong>详细描述:</Text>
              <div style={{ marginTop: '8px' }}>
                <Text>{selectedAlert.description}</Text>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text strong>告警源:</Text>
              <div style={{ marginTop: '8px' }}>
                <Text>{selectedAlert.source}</Text>
                {selectedAlert.connectionName && (
                  <Text type="secondary"> | 连接: {selectedAlert.connectionName}</Text>
                )}
              </div>
            </div>

            <Divider />

            <Timeline>
              <Timeline.Item 
                dot={<InfoCircleOutlined style={{ color: '#1890ff' }} />}
                color="blue"
              >
                <Text>告警创建</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {selectedAlert.createdAt ? dayjs(selectedAlert.createdAt).format('YYYY-MM-DD HH:mm:ss') : '未知时间'}
                </Text>
              </Timeline.Item>
              
              {selectedAlert.acknowledgedAt && (
                <Timeline.Item 
                  dot={<WarningOutlined style={{ color: '#fa8c16' }} />}
                  color="orange"
                >
                  <Text>告警确认</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {selectedAlert.acknowledgedAt ? dayjs(selectedAlert.acknowledgedAt).format('YYYY-MM-DD HH:mm:ss') : '未知时间'}
                    {selectedAlert.acknowledgedBy && ` | 确认人: ${selectedAlert.acknowledgedBy}`}
                  </Text>
                </Timeline.Item>
              )}
              
              {selectedAlert.resolvedAt && (
                <Timeline.Item 
                  dot={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  color="green"
                >
                  <Text>告警解决</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {selectedAlert.resolvedAt ? dayjs(selectedAlert.resolvedAt).format('YYYY-MM-DD HH:mm:ss') : '未知时间'}
                  </Text>
                </Timeline.Item>
              )}
            </Timeline>

            {selectedAlert.metadata && (
              <>
                <Divider />
                <div>
                  <Text strong>附加信息:</Text>
                  <div style={{ marginTop: '8px', background: '#f5f5f5', padding: '12px', borderRadius: '6px' }}>
                    <pre style={{ margin: 0, fontSize: '12px' }}>
                      {JSON.stringify(selectedAlert.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Alerts;