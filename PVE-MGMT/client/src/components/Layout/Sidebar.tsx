import React from 'react';
import { Layout, Menu } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  DesktopOutlined,
  ApiOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  RadarChartOutlined,
  MonitorOutlined,
  BellOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/vms',
      icon: <DesktopOutlined />,
      label: '虚拟机',
    },
    {
      key: '/connections',
      icon: <ApiOutlined />,
      label: 'PVE连接',
    },
    {
      key: '/monitoring',
      icon: <BarChartOutlined />,
      label: '节点监控',
    },
    {
      key: '/traffic-records',
      icon: <DatabaseOutlined />,
      label: 'VM流量记录',
    },
    {
      key: '/traffic-monitor',
      icon: <RadarChartOutlined />,
      label: '智能流量监控',
    },
    {
      key: '/traffic-monitor-pro',
      icon: <BarChartOutlined />,
      label: '专业流量监控',
    },
    {
      key: '/vm-resources',
      icon: <MonitorOutlined />,
      label: 'VM资源监控',
    },
    {
      key: '/alerts',
      icon: <BellOutlined />,
      label: '系统告警',
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Sider 
      width={240} 
      style={{
        background: 'white',
        borderRight: '1px solid #f0f0f0',
        boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
        position: 'fixed',
        left: 0,
        top: 64,
        bottom: 0,
        zIndex: 100
      }}
    >
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
        style={{ 
          height: '100%', 
          borderRight: 0,
          fontSize: '14px',
          fontWeight: 500
        }}
        theme="light"
      />
    </Sider>
  );
}

export default Sidebar;