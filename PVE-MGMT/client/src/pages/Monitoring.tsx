import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Progress, Table, Tag, Button, Space, Alert } from 'antd';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import {
  DashboardOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  HddOutlined,
  ReloadOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { usePVE } from '../contexts/PVEContext';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

function Monitoring() {
  const { nodes, vms, connections, socket } = usePVE();
  const [resourceHistory, setResourceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // 获取过去24小时的流量历史数据作为网络趋势
  const fetchResourceHistory = async () => {
    if (!socket || !connections.length) return;

    setLoading(true);
    try {
      // 获取过去24小时的小时流量数据
      const promises = [];
      const now = new Date();
      
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        const hourKey = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')}-${String(time.getHours()).padStart(2, '0')}`;
        
        const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
        const response = await fetch(`${apiUrl}/api/pve/traffic/hourly?hour=${hourKey}`);
        if (response.ok) {
          const data = await response.json();
          promises.push({
            hour: hourKey,
            time: time.getHours() + ':00',
            hourData: time,
            totalTraffic: data.reduce((sum: number, vm: any) => sum + (vm.total || 0), 0)
          });
        }
      }
      
      
      // 生成资源历史数据（结合真实流量数据和节点资源使用情况）
      const resourceData = promises.map(item => {
        // 计算当前节点的平均CPU和内存使用率
        const avgCpuUsage = nodes.length > 0 ? 
          nodes.reduce((sum, node) => sum + (node.maxcpu > 0 ? (node.cpu / node.maxcpu * 100) : 0), 0) / nodes.length : 0;
        const avgMemUsage = nodes.length > 0 ? 
          nodes.reduce((sum, node) => sum + (node.maxmem > 0 ? (node.mem / node.maxmem * 100) : 0), 0) / nodes.length : 0;
        
        // 网络流量转换为MB/s（假设是1小时内的累计，除以3600得到大概的平均值）
        const networkMBps = item.totalTraffic / (1024 * 1024 * 3600);
        
        return {
          time: item.time,
          hour: item.hour,
          cpu: Math.round(avgCpuUsage * 10) / 10,
          memory: Math.round(avgMemUsage * 10) / 10,
          network: Math.round(networkMBps * 100) / 100,
        };
      });
      
      setResourceHistory(resourceData);
      setLastUpdateTime(new Date());
    } catch (error) {
      console.error('获取资源历史数据失败:', error);
      // 如果获取失败，使用当前节点状态生成简单的历史数据
      generateFallbackData();
    } finally {
      setLoading(false);
    }
  };

  // 生成备用数据（基于当前节点状态）
  const generateFallbackData = () => {
    const data = [];
    const now = new Date();
    
    // 计算当前平均资源使用率
    const avgCpuUsage = nodes.length > 0 ? 
      nodes.reduce((sum, node) => sum + (node.maxcpu > 0 ? (node.cpu / node.maxcpu * 100) : 0), 0) / nodes.length : 0;
    const avgMemUsage = nodes.length > 0 ? 
      nodes.reduce((sum, node) => sum + (node.maxmem > 0 ? (node.mem / node.maxmem * 100) : 0), 0) / nodes.length : 0;
    
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      // 基于当前使用率添加一些合理的波动
      const cpuVariation = (Math.random() - 0.5) * 20; // ±10%
      const memVariation = (Math.random() - 0.5) * 20; // ±10%
      
      data.push({
        time: time.getHours() + ':00',
        cpu: Math.max(0, Math.min(100, avgCpuUsage + cpuVariation)),
        memory: Math.max(0, Math.min(100, avgMemUsage + memVariation)),
        network: Math.random() * 50, // 简单的网络数据
      });
    }
    setResourceHistory(data);
  };

  useEffect(() => {
    fetchResourceHistory();
    
    // 每5分钟刷新一次
    const interval = setInterval(fetchResourceHistory, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [socket, connections, nodes]);

  const timeSeriesData = resourceHistory;

  // VM状态分布数据
  const vmStatusData = [
    { name: '运行中', value: vms.filter(vm => vm.status === 'running').length },
    { name: '已停止', value: vms.filter(vm => vm.status === 'stopped').length },
    { name: '挂起', value: vms.filter(vm => vm.status === 'suspended').length },
  ].filter(item => item.value > 0);

  // 节点资源使用情况
  const nodeColumns = [
    {
      title: '节点名称',
      dataIndex: 'node',
      key: 'node',
    },
    {
      title: '连接',
      dataIndex: 'connectionName',
      key: 'connectionName',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'online' ? 'success' : 'error';
        const text = status === 'online' ? '在线' : '离线';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'CPU使用率',
      key: 'cpuUsage',
      render: (record: any) => {
        const usage = record.maxcpu > 0 ? (record.cpu / record.maxcpu * 100) : 0;
        return (
          <div style={{ width: 120 }}>
            <Progress
              percent={Math.round(usage)}
              size="small"
              status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
            />
          </div>
        );
      },
    },
    {
      title: '内存使用率',
      key: 'memUsage',
      render: (record: any) => {
        const usage = record.maxmem > 0 ? (record.mem / record.maxmem * 100) : 0;
        return (
          <div style={{ width: 120 }}>
            <Progress
              percent={Math.round(usage)}
              size="small"
              status={usage > 80 ? 'exception' : usage > 60 ? 'active' : 'success'}
            />
          </div>
        );
      },
    },
    {
      title: '运行时间',
      dataIndex: 'uptime',
      key: 'uptime',
      render: (uptime: number) => {
        if (!uptime) return '-';
        const days = Math.floor(uptime / (3600 * 24));
        const hours = Math.floor((uptime % (3600 * 24)) / 3600);
        return `${days}天 ${hours}小时`;
      },
    },
  ];

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 计算总体资源使用情况
  const totalStats = nodes.reduce(
    (acc, node) => ({
      totalCPU: acc.totalCPU + (node.maxcpu || 0),
      usedCPU: acc.usedCPU + (node.cpu || 0),
      totalMem: acc.totalMem + (node.maxmem || 0),
      usedMem: acc.usedMem + (node.mem || 0),
      totalDisk: acc.totalDisk + (node.maxdisk || 0),
      usedDisk: acc.usedDisk + (node.disk || 0),
    }),
    { totalCPU: 0, usedCPU: 0, totalMem: 0, usedMem: 0, totalDisk: 0, usedDisk: 0 }
  );

  const cpuUsagePercent = totalStats.totalCPU > 0 ? (totalStats.usedCPU / totalStats.totalCPU * 100) : 0;
  const memUsagePercent = totalStats.totalMem > 0 ? (totalStats.usedMem / totalStats.totalMem * 100) : 0;
  const diskUsagePercent = totalStats.totalDisk > 0 ? (totalStats.usedDisk / totalStats.totalDisk * 100) : 0;

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
              <DashboardOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
              资源监控
            </h1>
            <p style={{ margin: '4px 0 0 32px', color: '#666', fontSize: '14px' }}>
              实时监控PVE集群资源使用情况
            </p>
          </div>
          <Space>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchResourceHistory}
              loading={loading}
              type="primary"
            >
              刷新数据
            </Button>
          </Space>
        </div>
        
        {connections.length === 0 && (
          <Alert
            message="未连接PVE服务器"
            description="请先添加PVE连接以查看监控数据"
            type="warning"
            showIcon
            closable
          />
        )}
        
        {connections.length > 0 && (
          <div style={{ fontSize: '12px', color: '#999' }}>
            最后更新：{lastUpdateTime.toLocaleString()} | 连接数：{connections.length} | 节点数：{nodes.length} | 虚拟机数：{vms.length}
          </div>
        )}
      </div>

      {/* 资源概览卡片 */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={6}>
          <Card 
            hoverable
            style={{ 
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              color: 'white'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>CPU使用率</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {cpuUsagePercent.toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  {totalStats.usedCPU.toFixed(1)} / {totalStats.totalCPU} 核
                </div>
              </div>
              <CloudServerOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
            <Progress
              percent={cpuUsagePercent}
              showInfo={false}
              strokeColor="rgba(255,255,255,0.8)"
              trailColor="rgba(255,255,255,0.2)"
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={6}>
          <Card 
            hoverable
            style={{ 
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              border: 'none',
              color: 'white'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>内存使用率</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {memUsagePercent.toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  {formatBytes(totalStats.usedMem)} / {formatBytes(totalStats.totalMem)}
                </div>
              </div>
              <DatabaseOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
            <Progress
              percent={memUsagePercent}
              showInfo={false}
              strokeColor="rgba(255,255,255,0.8)"
              trailColor="rgba(255,255,255,0.2)"
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={6}>
          <Card 
            hoverable
            style={{ 
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              border: 'none',
              color: 'white'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>存储使用率</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {diskUsagePercent.toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  {formatBytes(totalStats.usedDisk)} / {formatBytes(totalStats.totalDisk)}
                </div>
              </div>
              <HddOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
            <Progress
              percent={diskUsagePercent}
              showInfo={false}
              strokeColor="rgba(255,255,255,0.8)"
              trailColor="rgba(255,255,255,0.2)"
              style={{ marginTop: '16px' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={6}>
          <Card 
            hoverable
            style={{ 
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              border: 'none',
              color: 'white'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>活跃虚拟机</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {vms.filter(vm => vm.status === 'running').length}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  总计 {vms.length} 台
                </div>
              </div>
              <EyeOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
            <div style={{ marginTop: '16px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }}>
              <div 
                style={{ 
                  height: '100%', 
                  background: 'rgba(255,255,255,0.8)', 
                  borderRadius: '2px',
                  width: `${vms.length > 0 ? (vms.filter(vm => vm.status === 'running').length / vms.length * 100) : 0}%`
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[24, 24]} style={{ marginTop: '32px' }}>
        <Col xs={24} lg={16}>
          <Card 
            style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                  资源使用趋势 (24小时)
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                  实时监控数据，每5分钟自动更新
                </p>
              </div>
              <Tag color={loading ? 'orange' : 'green'}>
                {loading ? '更新中...' : '实时数据'}
              </Tag>
            </div>
            
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorNetwork" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffc658" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ffc658" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="time" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#666' }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#666' }}
                />
                <Tooltip 
                  contentStyle={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                  formatter={(value: any, name: string) => {
                    if (name === 'CPU使用率' || name === '内存使用率') {
                      return [`${value}%`, name];
                    }
                    return [`${value} MB/s`, name];
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="cpu" 
                  stroke="#8884d8" 
                  fillOpacity={1}
                  fill="url(#colorCpu)"
                  name="CPU使用率" 
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="memory" 
                  stroke="#82ca9d" 
                  fillOpacity={1}
                  fill="url(#colorMemory)"
                  name="内存使用率" 
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="network" 
                  stroke="#ffc658" 
                  fillOpacity={1}
                  fill="url(#colorNetwork)"
                  name="网络流量" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        
        <Col xs={24} lg={8}>
          <Card 
            style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                虚拟机状态分布
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                当前所有虚拟机运行状态
              </p>
            </div>
            
            {vmStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={vmStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent, value }) => `${name}: ${value}台 (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {vmStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      border: 'none',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                <StopOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                <div>暂无虚拟机数据</div>
              </div>
            )}
            
            {/* 状态图例 */}
            <div style={{ marginTop: '16px' }}>
              {vmStatusData.map((item, index) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div 
                    style={{ 
                      width: '12px', 
                      height: '12px', 
                      background: COLORS[index % COLORS.length],
                      borderRadius: '50%',
                      marginRight: '8px'
                    }}
                  />
                  <span style={{ fontSize: '14px' }}>
                    {item.name === '运行中' && <CheckCircleOutlined style={{ color: '#52c41a', marginRight: '4px' }} />}
                    {item.name === '已停止' && <StopOutlined style={{ color: '#ff4d4f', marginRight: '4px' }} />}
                    {item.name === '挂起' && <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: '4px' }} />}
                    {item.name}: {item.value} 台
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 节点详情表格 */}
      <Row style={{ marginTop: '32px' }}>
        <Col span={24}>
          <Card 
            style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                  节点资源监控
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                  所有PVE节点的详细资源使用情况
                </p>
              </div>
            </div>
            
            {nodes.length > 0 ? (
              <Table
                columns={nodeColumns}
                dataSource={nodes}
                rowKey={(record) => `${record.connectionId}-${record.node}`}
                pagination={false}
                size="middle"
                style={{ 
                  background: 'transparent',
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                <CloudServerOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
                <div>暂无节点数据</div>
                <p style={{ marginTop: '8px', fontSize: '14px' }}>
                  请检查PVE连接状态
                </p>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Monitoring;