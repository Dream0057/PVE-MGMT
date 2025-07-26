import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import Dashboard from './pages/Dashboard';
import VirtualMachines from './pages/VirtualMachines';
import Connections from './pages/Connections';
import Monitoring from './pages/Monitoring';
import TrafficRecords from './pages/TrafficRecords';
import TrafficMonitorSimple from './pages/TrafficMonitorSimple';
import TrafficMonitorPro from './pages/TrafficMonitorPro';
import VMResourceMonitor from './pages/VMResourceMonitor';
import Alerts from './pages/Alerts';
import { PVEProvider } from './contexts/PVEContext';

const { Content } = Layout;

function App() {
  return (
    <PVEProvider>
      <Layout style={{ 
        minHeight: '100vh',
        background: '#f5f5f5'
      }}>
        <Header />
        <Layout style={{ 
          background: '#f5f5f5',
          marginTop: 64
        }}>
          <Sidebar />
          <Layout style={{ 
            background: '#f5f5f5',
            marginLeft: 240
          }}>
            <Content style={{ 
              margin: 0,
              padding: 0,
              background: '#f5f5f5',
              overflow: 'auto'
            }}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/vms" element={<VirtualMachines />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/monitoring" element={<Monitoring />} />
                <Route path="/traffic-records" element={<TrafficRecords />} />
                <Route path="/traffic-monitor" element={<TrafficMonitorSimple />} />
                <Route path="/traffic-monitor-pro" element={<TrafficMonitorPro />} />
                <Route path="/vm-resources" element={<VMResourceMonitor />} />
                <Route path="/alerts" element={<Alerts />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </PVEProvider>
  );
}

export default App;