import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  message,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { usePVE } from '../contexts/PVEContext';

function Connections() {
  const {
    connections,
    addConnection,
    removeConnection,
    testConnection,
    refreshConnections,
  } = usePVE();
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleAddConnection = async (values: any) => {
    setLoading(true);
    try {
      const success = await addConnection({
        id: `pve-${Date.now()}`,
        ...values,
      });
      
      if (success) {
        message.success('连接添加成功');
        setIsModalVisible(false);
        form.resetFields();
      }
    } catch (error: any) {
      message.error(`添加连接失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    setLoading(true);
    try {
      const success = await removeConnection(id);
      if (success) {
        message.success('连接删除成功');
      }
    } catch (error: any) {
      message.error(`删除连接失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async (id: string) => {
    setLoading(true);
    try {
      const success = await testConnection(id);
      if (success) {
        message.success('连接测试成功');
      } else {
        message.error('连接测试失败');
      }
    } catch (error: any) {
      message.error(`连接测试失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '连接名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '主机地址',
      dataIndex: 'host',
      key: 'host',
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const configs = {
          connected: { color: 'success', text: '已连接', icon: <CheckCircleOutlined /> },
          disconnected: { color: 'default', text: '断开连接', icon: <ExclamationCircleOutlined /> },
          error: { color: 'error', text: '连接错误', icon: <ExclamationCircleOutlined /> },
        };
        const config = configs[status as keyof typeof configs] || configs.disconnected;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
    },
    {
      title: '最后连接时间',
      dataIndex: 'lastConnected',
      key: 'lastConnected',
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: '错误信息',
      dataIndex: 'lastError',
      key: 'lastError',
      render: (error: string) => error ? (
        <span style={{ color: '#ff4d4f' }}>{error}</span>
      ) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: any) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            onClick={() => handleTestConnection(record.id)}
            loading={loading}
          >
            测试连接
          </Button>
          
          <Popconfirm
            title="确定要删除这个连接吗？"
            onConfirm={() => handleDeleteConnection(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={loading}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="PVE连接管理"
      extra={
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
          >
            添加连接
          </Button>
          
          <Button
            icon={<ReloadOutlined />}
            onClick={refreshConnections}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={connections}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
        }}
      />

      <Modal
        title="添加PVE连接"
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddConnection}
          initialValues={{
            port: 8006,
            realm: 'pam',
            ssl: true,
          }}
        >
          <Form.Item
            label="连接名称"
            name="name"
            rules={[{ required: true, message: '请输入连接名称' }]}
          >
            <Input placeholder="例如: 生产环境PVE" />
          </Form.Item>

          <Form.Item
            label="主机地址"
            name="host"
            rules={[{ required: true, message: '请输入主机地址' }]}
          >
            <Input placeholder="例如: YOUR_PVE_IP" />
          </Form.Item>

          <Form.Item
            label="端口"
            name="port"
            rules={[{ required: true, message: '请输入端口号' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={65535}
              placeholder="8006"
            />
          </Form.Item>

          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="例如: root" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item
            label="认证域"
            name="realm"
            rules={[{ required: true, message: '请输入认证域' }]}
          >
            <Input placeholder="pam" />
          </Form.Item>

          <Form.Item
            label="使用SSL"
            name="ssl"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                添加连接
              </Button>
              <Button
                onClick={() => {
                  setIsModalVisible(false);
                  form.resetFields();
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

export default Connections;