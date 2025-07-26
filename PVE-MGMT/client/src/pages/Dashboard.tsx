import React from 'react';
import { Row, Col, Card, Progress, Table, Tag } from 'antd';
import {
  DesktopOutlined,
  CloudServerOutlined,
  ApiOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { usePVE } from '../contexts/PVEContext';

function Dashboard() {
  const { connections, vms, nodes } = usePVE();

  const stats = {
    totalConnections: connections.length,
    connectedConnections: connections.filter(conn => conn.status === 'connected').length,
    totalVMs: vms.length,
    runningVMs: vms.filter(vm => vm.status === 'running').length,
    totalNodes: nodes.length,
    onlineNodes: nodes.filter(node => node.status === 'online').length,
  };

  const connectionColumns = [
    {
      title: '连接名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '主机',
      dataIndex: 'host',
      key: 'host',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'connected' ? 'success' : status === 'error' ? 'error' : 'default';
        const text = status === 'connected' ? '已连接' : status === 'error' ? '错误' : '断开';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '最后连接',
      dataIndex: 'lastConnected',
      key: 'lastConnected',
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
  ];

  const vmColumns = [
    {
      title: 'VMID',
      dataIndex: 'vmid',
      key: 'vmid',
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => type.toUpperCase(),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'running' ? 'success' : status === 'stopped' ? 'default' : 'warning';
        const text = status === 'running' ? '运行中' : status === 'stopped' ? '已停止' : '挂起';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '节点',
      dataIndex: 'node',
      key: 'node',
    },
    {
      title: 'CPU使用率',
      key: 'cpuUsage',
      render: (record: any) => {
        const usage = record.maxcpu > 0 ? (record.cpu / record.maxcpu * 100) : 0;
        return <Progress percent={Math.round(usage)} size="small" />;
      },
    },
    {
      title: '内存使用率',
      key: 'memUsage',
      render: (record: any) => {
        const usage = record.maxmem > 0 ? (record.mem / record.maxmem * 100) : 0;
        return <Progress percent={Math.round(usage)} size="small" />;
      },
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
          <DesktopOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
          仪表板
        </h1>
        <p style={{ margin: '4px 0 0 32px', color: '#666', fontSize: '14px' }}>
          PVE环境总览和实时状态
        </p>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} md={6}>
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
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>PVE连接</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {stats.connectedConnections}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  总计 {stats.totalConnections} 个
                </div>
              </div>
              <ApiOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
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
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>在线节点</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {stats.onlineNodes}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  总计 {stats.totalNodes} 个
                </div>
              </div>
              <CloudServerOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
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
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>运行中VM</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
                  {stats.runningVMs}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  总计 {stats.totalVMs} 台
                </div>
              </div>
              <DesktopOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={6}>
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
                <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>系统状态</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                  正常
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                  运行良好
                </div>
              </div>
              <CheckCircleOutlined style={{ fontSize: '48px', opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 详情表格 */}
      <Row gutter={[24, 24]} style={{ marginTop: '32px' }}>
        <Col xs={24} lg={12}>
          <Card 
            style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                PVE连接状态
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                所有Proxmox连接的当前状态
              </p>
            </div>
            
            <Table
              columns={connectionColumns}
              dataSource={connections}
              rowKey="id"
              pagination={false}
              size="middle"
              style={{ background: 'transparent' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card 
            style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            styles={{ body: { padding: '24px' } }}
          >
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                虚拟机概览
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                最近活跃的虚拟机状态 (显示前5个)
              </p>
            </div>
            
            <Table
              columns={vmColumns}
              dataSource={vms.slice(0, 5)}
              rowKey={(record) => `${record.connectionId}-${record.vmid}`}
              pagination={false}
              size="middle"
              style={{ background: 'transparent' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;