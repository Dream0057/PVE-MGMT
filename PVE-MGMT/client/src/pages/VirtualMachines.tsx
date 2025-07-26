import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Modal,
  message,
  Tooltip,
  Select,
} from 'antd';
import {
  PlayCircleOutlined,
  PoweroffOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { usePVE } from '../contexts/PVEContext';

const { Option } = Select;

function VirtualMachines() {
  const { vms, connections, vmAction, refreshVMs } = usePVE();
  const [loading, setLoading] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');

  const filteredVMs = selectedConnection === 'all' 
    ? vms 
    : vms.filter(vm => vm.connectionId === selectedConnection);

  const handleVMAction = async (
    vm: any,
    action: string
  ) => {
    setLoading(true);
    try {
      await vmAction(vm.connectionId, vm.vmid, vm.node, vm.type, action);
      message.success(`${action}操作已发送`);
      // 延迟刷新以等待操作完成
      setTimeout(() => {
        refreshVMs();
      }, 2000);
    } catch (error: any) {
      message.error(`操作失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const showDeleteConfirm = (vm: any) => {
    Modal.confirm({
      title: '确认删除虚拟机',
      content: `确定要删除虚拟机 ${vm.name} (ID: ${vm.vmid}) 吗？此操作不可恢复！`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        handleVMAction(vm, 'delete');
      },
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return '-';
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}天 ${hours}小时`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  };

  const columns = [
    {
      title: 'VMID',
      dataIndex: 'vmid',
      key: 'vmid',
      width: 80,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => (
        <Tag color={type === 'qemu' ? 'blue' : 'green'}>
          {type.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const configs = {
          running: { color: 'success', text: '运行中' },
          stopped: { color: 'default', text: '已停止' },
          suspended: { color: 'warning', text: '挂起' },
        };
        const config = configs[status as keyof typeof configs] || configs.stopped;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '节点',
      dataIndex: 'node',
      key: 'node',
      width: 100,
    },
    {
      title: '连接',
      dataIndex: 'connectionName',
      key: 'connectionName',
      width: 120,
    },
    {
      title: 'CPU',
      key: 'cpu',
      width: 120,
      render: (record: any) => {
        const usage = record.maxcpu > 0 ? (record.cpu / record.maxcpu * 100) : 0;
        return (
          <div>
            <Progress percent={Math.round(usage)} size="small" />
            <small>{record.cpu} / {record.maxcpu} 核</small>
          </div>
        );
      },
    },
    {
      title: '内存',
      key: 'memory',
      width: 120,
      render: (record: any) => {
        const usage = record.maxmem > 0 ? (record.mem / record.maxmem * 100) : 0;
        return (
          <div>
            <Progress percent={Math.round(usage)} size="small" />
            <small>{formatBytes(record.mem)} / {formatBytes(record.maxmem)}</small>
          </div>
        );
      },
    },
    {
      title: '运行时间',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 120,
      render: (uptime: number) => formatUptime(uptime),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (record: any) => (
        <Space size="small">
          {record.status === 'stopped' && (
            <Tooltip title="启动">
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleVMAction(record, 'start')}
                loading={loading}
              />
            </Tooltip>
          )}
          
          {record.status === 'running' && (
            <>
              <Tooltip title="关闭">
                <Button
                  size="small"
                  icon={<PoweroffOutlined />}
                  onClick={() => handleVMAction(record, 'shutdown')}
                  loading={loading}
                />
              </Tooltip>
              
              <Tooltip title="强制停止">
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => handleVMAction(record, 'stop')}
                  loading={loading}
                />
              </Tooltip>
              
              {record.type === 'qemu' && (
                <Tooltip title="挂起">
                  <Button
                    size="small"
                    icon={<PauseCircleOutlined />}
                    onClick={() => handleVMAction(record, 'suspend')}
                    loading={loading}
                  />
                </Tooltip>
              )}
            </>
          )}
          
          {record.status === 'suspended' && record.type === 'qemu' && (
            <Tooltip title="恢复">
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleVMAction(record, 'resume')}
                loading={loading}
              />
            </Tooltip>
          )}
          
          {record.status === 'stopped' && (
            <Tooltip title="删除">
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => showDeleteConfirm(record)}
                loading={loading}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="虚拟机管理"
      extra={
        <Space>
          <Select
            style={{ width: 200 }}
            placeholder="选择连接"
            value={selectedConnection}
            onChange={setSelectedConnection}
          >
            <Option value="all">所有连接</Option>
            {connections.map(conn => (
              <Option key={conn.id} value={conn.id}>
                {conn.name}
              </Option>
            ))}
          </Select>
          
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={refreshVMs}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={filteredVMs}
        rowKey={(record) => `${record.connectionId}-${record.vmid}`}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
        }}
        scroll={{ x: 1200 }}
        size="small"
      />
    </Card>
  );
}

export default VirtualMachines;