import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Tabs,
  Button,
  Space,
  DatePicker,
  Select,
  Row,
  Col,
  Alert,
  Tag,
  Tooltip,
  Typography,
  Spin,
} from 'antd';
import {
  ClockCircleOutlined,
  CalendarOutlined,
  ReloadOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  SwapOutlined,
  DatabaseOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrBefore);
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface VMTrafficRecord {
  id: string;
  vmKey: string;
  connectionId: string;
  connectionName: string;
  node: string;
  vmid: number;
  vmname: string;
  type: string;
  timestamp?: string;
  networkIn: number;
  networkOut: number;
  total: number;
  hour?: string;
  date?: string;
}

interface VMHourlyDisplay {
  id: string;
  vmKey: string;
  connectionId: string;
  connectionName: string;
  node: string;
  vmid: number;
  vmname: string;
  type: string;
  hourlyTraffic: { [hour: string]: { in: number; out: number; total: number } };
  totalTraffic: { in: number; out: number; total: number };
}

interface VMDailyDisplay {
  id: string;
  vmKey: string;
  connectionId: string;
  connectionName: string;
  node: string;
  vmid: number;
  vmname: string;
  type: string;
  dailyTraffic: { [date: string]: { in: number; out: number; total: number } };
  totalTraffic: { in: number; out: number; total: number };
}

function TrafficRecords() {
  const [loading, setLoading] = useState(false);
  const [hourlyData, setHourlyData] = useState<VMTrafficRecord[]>([]);
  const [dailyData, setDailyData] = useState<VMTrafficRecord[]>([]);
  const [hourlyDisplayData, setHourlyDisplayData] = useState<VMHourlyDisplay[]>([]);
  const [dailyDisplayData, setDailyDisplayData] = useState<VMDailyDisplay[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 格式化流量数据
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 根据流量大小获取背景颜色
  const getTrafficColor = (bytes: number) => {
    if (bytes === 0) return '#f5f5f5';
    if (bytes < 1024 * 1024) return '#e6f7ff'; // < 1MB 浅蓝
    if (bytes < 10 * 1024 * 1024) return '#bae7ff'; // < 10MB 蓝
    if (bytes < 100 * 1024 * 1024) return '#87d068'; // < 100MB 绿
    if (bytes < 1024 * 1024 * 1024) return '#ffec3d'; // < 1GB 黄
    if (bytes < 10 * 1024 * 1024 * 1024) return '#ffa940'; // < 10GB 橙
    return '#ff4d4f'; // >= 10GB 红
  };

  // 获取下载流量颜色（基于流量等级，偏蓝色调）
  const getDownloadColor = (bytes: number) => {
    if (bytes === 0) return '#ccc';
    if (bytes < 1024 * 1024) return '#91d5ff';
    if (bytes < 10 * 1024 * 1024) return '#69c0ff';
    if (bytes < 100 * 1024 * 1024) return '#52c41a';
    if (bytes < 1024 * 1024 * 1024) return '#fadb14';
    if (bytes < 10 * 1024 * 1024 * 1024) return '#fa8c16';
    return '#f5222d';
  };

  // 获取上传流量颜色（基于流量等级，偏绿色调）
  const getUploadColor = (bytes: number) => {
    if (bytes === 0) return '#ccc';
    if (bytes < 1024 * 1024) return '#b7eb8f';
    if (bytes < 10 * 1024 * 1024) return '#95de64';
    if (bytes < 100 * 1024 * 1024) return '#73d13d';
    if (bytes < 1024 * 1024 * 1024) return '#fadb14';
    if (bytes < 10 * 1024 * 1024 * 1024) return '#fa8c16';
    return '#f5222d';
  };

  // 转换小时数据为24列显示格式
  const convertHourlyData = (data: VMTrafficRecord[]) => {
    const vmMap = new Map<string, VMHourlyDisplay>();
    
    data.forEach(record => {
      const vmKey = record.vmKey;
      
      if (!vmMap.has(vmKey)) {
        vmMap.set(vmKey, {
          id: vmKey,
          vmKey: record.vmKey,
          connectionId: record.connectionId,
          connectionName: record.connectionName,
          node: record.node,
          vmid: record.vmid,
          vmname: record.vmname,
          type: record.type,
          hourlyTraffic: {},
          totalTraffic: { in: 0, out: 0, total: 0 },
        });
      }
      
      const vm = vmMap.get(vmKey)!;
      if (record.hour) {
        const hourPart = record.hour.split('-')[3] || '00';
        vm.hourlyTraffic[hourPart] = {
          in: record.networkIn,
          out: record.networkOut,
          total: record.total
        };
        vm.totalTraffic.in += record.networkIn;
        vm.totalTraffic.out += record.networkOut;
        vm.totalTraffic.total += record.total;
      }
    });
    
    // 按总流量排序，有数据的在上面，没数据的在下面
    return Array.from(vmMap.values()).sort((a, b) => {
      // 先按是否有流量数据排序（有数据的在前）
      const aHasData = a.totalTraffic.total > 0;
      const bHasData = b.totalTraffic.total > 0;
      
      if (aHasData !== bHasData) {
        return bHasData ? 1 : -1; // 有数据的在前
      }
      
      // 如果都有数据或都没数据，则按总流量排序（降序）
      if (aHasData && bHasData) {
        return b.totalTraffic.total - a.totalTraffic.total;
      }
      
      // 如果都没数据，按虚拟机名称排序
      return a.vmname.localeCompare(b.vmname);
    });
  };

  // 转换日数据为日期列显示格式
  const convertDailyData = (data: VMTrafficRecord[]) => {
    const vmMap = new Map<string, VMDailyDisplay>();
    
    data.forEach(record => {
      const vmKey = record.vmKey;
      
      if (!vmMap.has(vmKey)) {
        vmMap.set(vmKey, {
          id: vmKey,
          vmKey: record.vmKey,
          connectionId: record.connectionId,
          connectionName: record.connectionName,
          node: record.node,
          vmid: record.vmid,
          vmname: record.vmname,
          type: record.type,
          dailyTraffic: {},
          totalTraffic: { in: 0, out: 0, total: 0 },
        });
      }
      
      const vm = vmMap.get(vmKey)!;
      if (record.date) {
        vm.dailyTraffic[record.date] = {
          in: record.networkIn,
          out: record.networkOut,
          total: record.total
        };
        vm.totalTraffic.in += record.networkIn;
        vm.totalTraffic.out += record.networkOut;
        vm.totalTraffic.total += record.total;
      }
    });
    
    return Array.from(vmMap.values()).sort((a, b) => a.vmname.localeCompare(b.vmname));
  };

  // 获取每小时流量数据
  const fetchHourlyData = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      let url = `${apiUrl}/api/pve/traffic/vm-hourly`;
      const params = new URLSearchParams();
      
      if (selectedConnection && selectedConnection !== 'all') {
        params.append('connectionId', selectedConnection);
      }
      
      if (dateRange) {
        params.append('startDate', dateRange[0].format('YYYY-MM-DD'));
        params.append('endDate', dateRange[1].format('YYYY-MM-DD'));
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHourlyData(data);
        setHourlyDisplayData(convertHourlyData(data));
      } else {
        console.error('获取每小时流量数据失败，HTTP状态:', response.status);
        setHourlyData([]);
        setHourlyDisplayData([]);
      }
    } catch (error) {
      console.error('获取每小时流量数据失败:', error);
      setHourlyData([]);
      setHourlyDisplayData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedConnection, dateRange]);

  // 获取每日流量数据
  const fetchDailyData = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      
      let url = `${apiUrl}/api/pve/traffic/vm-daily`;
      const params = new URLSearchParams();
      
      if (selectedConnection && selectedConnection !== 'all') {
        params.append('connectionId', selectedConnection);
      }
      
      if (dateRange) {
        params.append('startDate', dateRange[0].format('YYYY-MM-DD'));
        params.append('endDate', dateRange[1].format('YYYY-MM-DD'));
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDailyData(data);
        setDailyDisplayData(convertDailyData(data));
      } else {
        console.error('获取每日流量数据失败，HTTP状态:', response.status);
        setDailyData([]);
        setDailyDisplayData([]);
      }
    } catch (error) {
      console.error('获取每日流量数据失败:', error);
      setDailyData([]);
      setDailyDisplayData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedConnection, dateRange]);

  // 生成24小时列定义
  const generateHourlyColumns = (): ColumnsType<VMHourlyDisplay> => {
    const columns: ColumnsType<VMHourlyDisplay> = [
      {
        title: 'VM',
        key: 'vmInfo',
        width: 140,
        fixed: 'left',
        sorter: {
          multiple: 2,
          compare: (a: VMHourlyDisplay, b: VMHourlyDisplay) => {
            // 多级排序：先按虚拟机名称，再按VMID，最后按节点
            if (a.vmname !== b.vmname) {
              return a.vmname.localeCompare(b.vmname);
            }
            if (a.vmid !== b.vmid) {
              return a.vmid - b.vmid;
            }
            return a.node.localeCompare(b.node);
          },
        },
        showSorterTooltip: {
          title: '点击排序: 虚拟机名称 → VMID → 节点'
        },
        render: (_, record) => (
          <div style={{ lineHeight: '1.1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                backgroundColor: record.type === 'qemu' ? '#1890ff' : '#52c41a'
              }} />
              <Text strong style={{ fontSize: '11px' }}>{record.vmname}</Text>
            </div>
            <div style={{ fontSize: '9px', color: '#999' }}>
              {record.vmid}@{record.node}
            </div>
          </div>
        ),
      },
    ];

    // 添加24小时列
    for (let hour = 0; hour < 24; hour++) {
      const hourStr = hour.toString().padStart(2, '0');
      columns.push({
        title: (
          <div style={{ textAlign: 'center', lineHeight: '1.1' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{hourStr}</div>
          </div>
        ),
        key: `hour-${hourStr}`,
        width: 60,
        align: 'center',
        render: (_, record) => {
          const traffic = record.hourlyTraffic[hourStr] || { in: 0, out: 0, total: 0 };
          const hasData = traffic.total > 0;
          return (
            <Tooltip 
              title={
                <div>
                  <div>{hourStr}:00 流量详情</div>
                  <div>下载: {formatBytes(traffic.in)}</div>
                  <div>上传: {formatBytes(traffic.out)}</div>
                  <div>总计: {formatBytes(traffic.total)}</div>
                </div>
              }
            >
              <div style={{ padding: '1px', textAlign: 'center', cursor: 'pointer' }}>
                {hasData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <div style={{ 
                      background: getDownloadColor(traffic.in),
                      color: 'white',
                      padding: '1px 2px',
                      borderRadius: '2px',
                      fontSize: '8px',
                      fontWeight: 'bold',
                      textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                      minHeight: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatBytes(traffic.in).replace(' ', '')}
                    </div>
                    <div style={{ 
                      background: getUploadColor(traffic.out),
                      color: 'white',
                      padding: '1px 2px',
                      borderRadius: '2px',
                      fontSize: '8px',
                      fontWeight: 'bold',
                      textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                      minHeight: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatBytes(traffic.out).replace(' ', '')}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#ccc', fontSize: '10px' }}>-</div>
                )}
              </div>
            </Tooltip>
          );
        },
      });
    }

    // 添加总计列
    columns.push({
      title: (
        <div style={{ textAlign: 'center', lineHeight: '1.1' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11px' }}>总计</div>
        </div>
      ),
      key: 'totalTraffic',
      width: 80,
      fixed: 'right',
      align: 'center',
      sorter: {
        multiple: 1,
        compare: (a: VMHourlyDisplay, b: VMHourlyDisplay) => {
          // 按总流量排序（降序，流量大的在前）
          return b.totalTraffic.total - a.totalTraffic.total;
        },
      },
      showSorterTooltip: {
        title: '点击排序: 按总流量大小（默认降序）'
      },
      defaultSortOrder: 'descend',
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
          <div style={{ 
            background: getDownloadColor(record.totalTraffic.in),
            color: 'white',
            padding: '2px 4px',
            borderRadius: '2px',
            fontSize: '9px',
            fontWeight: 'bold',
            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            minHeight: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatBytes(record.totalTraffic.in).replace(' ', '')}
          </div>
          <div style={{ 
            background: getUploadColor(record.totalTraffic.out),
            color: 'white',
            padding: '2px 4px',
            borderRadius: '2px',
            fontSize: '9px',
            fontWeight: 'bold',
            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            minHeight: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatBytes(record.totalTraffic.out).replace(' ', '')}
          </div>
        </div>
      ),
    });

    return columns;
  };

  // 生成每日列定义
  const generateDailyColumns = (): ColumnsType<VMDailyDisplay> => {
    const columns: ColumnsType<VMDailyDisplay> = [
      {
        title: 'VM',
        key: 'vmInfo',
        width: 140,
        fixed: 'left',
        sorter: {
          multiple: 2,
          compare: (a: VMDailyDisplay, b: VMDailyDisplay) => {
            // 多级排序：先按虚拟机名称，再按VMID，最后按节点
            if (a.vmname !== b.vmname) {
              return a.vmname.localeCompare(b.vmname);
            }
            if (a.vmid !== b.vmid) {
              return a.vmid - b.vmid;
            }
            return a.node.localeCompare(b.node);
          },
        },
        showSorterTooltip: {
          title: '点击排序: 虚拟机名称 → VMID → 节点'
        },
        render: (_, record) => (
          <div style={{ lineHeight: '1.1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                backgroundColor: record.type === 'qemu' ? '#1890ff' : '#52c41a'
              }} />
              <Text strong style={{ fontSize: '11px' }}>{record.vmname}</Text>
            </div>
            <div style={{ fontSize: '9px', color: '#999' }}>
              {record.vmid}@{record.node}
            </div>
          </div>
        ),
      },
    ];

    // 获取日期范围内的所有日期
    if (dateRange) {
      const startDate = dateRange[0];
      const endDate = dateRange[1];
      let currentDate = dayjs(startDate);
      
      while (currentDate.isSameOrBefore(endDate)) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        columns.push({
          title: currentDate.format('MM-DD'),
          key: `date-${dateStr}`,
          width: 60,
          align: 'center',
          render: (_, record) => {
            const traffic = record.dailyTraffic[dateStr] || { in: 0, out: 0, total: 0 };
            const hasData = traffic.total > 0;
            return (
              <Tooltip 
                title={
                  <div>
                    <div>{dateStr} 流量详情</div>
                    <div>下载: {formatBytes(traffic.in)}</div>
                    <div>上传: {formatBytes(traffic.out)}</div>
                    <div>总计: {formatBytes(traffic.total)}</div>
                  </div>
                }
              >
                <div style={{ padding: '1px', textAlign: 'center', cursor: 'pointer' }}>
                  {hasData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <div style={{ 
                        background: getDownloadColor(traffic.in),
                        color: 'white',
                        padding: '1px 2px',
                        borderRadius: '2px',
                        fontSize: '8px',
                        fontWeight: 'bold',
                        textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                        minHeight: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatBytes(traffic.in).replace(' ', '')}
                      </div>
                      <div style={{ 
                        background: getUploadColor(traffic.out),
                        color: 'white',
                        padding: '1px 2px',
                        borderRadius: '2px',
                        fontSize: '8px',
                        fontWeight: 'bold',
                        textShadow: '0 1px 1px rgba(0,0,0,0.3)',
                        minHeight: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatBytes(traffic.out).replace(' ', '')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#ccc', fontSize: '10px' }}>-</div>
                  )}
                </div>
              </Tooltip>
            );
          },
        });
        currentDate = currentDate.add(1, 'day');
      }
    }

    // 添加总计列
    columns.push({
      title: (
        <div style={{ textAlign: 'center', lineHeight: '1.1' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11px' }}>总计</div>
        </div>
      ),
      key: 'totalTraffic',
      width: 80,
      fixed: 'right',
      align: 'center',
      sorter: {
        multiple: 1,
        compare: (a: VMDailyDisplay, b: VMDailyDisplay) => {
          // 按总流量排序（降序，流量大的在前）
          return b.totalTraffic.total - a.totalTraffic.total;
        },
      },
      showSorterTooltip: {
        title: '点击排序: 按总流量大小（默认降序）'
      },
      defaultSortOrder: 'descend',
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center' }}>
          <div style={{ 
            background: getDownloadColor(record.totalTraffic.in),
            color: 'white',
            padding: '2px 4px',
            borderRadius: '2px',
            fontSize: '9px',
            fontWeight: 'bold',
            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            minHeight: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatBytes(record.totalTraffic.in).replace(' ', '')}
          </div>
          <div style={{ 
            background: getUploadColor(record.totalTraffic.out),
            color: 'white',
            padding: '2px 4px',
            borderRadius: '2px',
            fontSize: '9px',
            fontWeight: 'bold',
            textShadow: '0 1px 1px rgba(0,0,0,0.3)',
            minHeight: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatBytes(record.totalTraffic.out).replace(' ', '')}
          </div>
        </div>
      ),
    });

    return columns;
  };

  // 刷新数据
  const handleRefresh = useCallback(() => {
    fetchHourlyData();
    fetchDailyData();
  }, [fetchHourlyData, fetchDailyData]);

  // 计算统计数据
  const calculateStats = () => {
    const hourlyStats = hourlyDisplayData.reduce(
      (acc, vm) => ({
        totalVMs: acc.totalVMs + 1,
        totalNetin: acc.totalNetin + vm.totalTraffic.in,
        totalNetout: acc.totalNetout + vm.totalTraffic.out,
        totalTraffic: acc.totalTraffic + vm.totalTraffic.total,
      }),
      { totalVMs: 0, totalNetin: 0, totalNetout: 0, totalTraffic: 0 }
    );

    const dailyStats = dailyDisplayData.reduce(
      (acc, vm) => ({
        totalVMs: acc.totalVMs + 1,
        totalNetin: acc.totalNetin + vm.totalTraffic.in,
        totalNetout: acc.totalNetout + vm.totalTraffic.out,
        totalTraffic: acc.totalTraffic + vm.totalTraffic.total,
      }),
      { totalVMs: 0, totalNetin: 0, totalNetout: 0, totalTraffic: 0 }
    );

    return { hourlyStats, dailyStats };
  };

  // 初始化默认日期范围
  useEffect(() => {
    // 默认设置最近3天的日期范围
    setDateRange([dayjs().subtract(2, 'day'), dayjs()]);
  }, []);

  // 当筛选条件变化时重新获取数据
  useEffect(() => {
    if (dateRange) {
      handleRefresh();
    }
  }, [selectedConnection, dateRange, handleRefresh]);

  const { hourlyStats, dailyStats } = calculateStats();

  return (
    <div style={{ padding: '16px', background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
              <DatabaseOutlined style={{ marginRight: '6px', color: '#1890ff' }} />
              VM流量记录
            </h1>
            <p style={{ margin: '2px 0 0 26px', color: '#666', fontSize: '12px' }}>
              详细查看虚拟机每小时和每日的流量使用记录
            </p>
          </div>
        </div>
      </div>

      {/* 统计卡片 - 缩小版本 */}
      <Row gutter={[8, 8]} style={{ marginBottom: '12px' }}>
        <Col xs={12} sm={6}>
          <Card 
            size="small"
            hoverable
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              color: 'white',
              minHeight: '70px'
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px' }}>
                  监控VM数
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', lineHeight: '1' }}>
                  {Math.max(hourlyStats.totalVMs, dailyStats.totalVMs)}
                </div>
              </div>
              <BarChartOutlined style={{ fontSize: '24px', opacity: 0.4 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={6}>
          <Card 
            size="small"
            hoverable
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              border: 'none',
              color: 'white',
              minHeight: '70px'
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px' }}>
                  总下载流量
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1' }}>
                  {formatBytes(Math.max(hourlyStats.totalNetin, dailyStats.totalNetin))}
                </div>
              </div>
              <CloudDownloadOutlined style={{ fontSize: '24px', opacity: 0.4 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={6}>
          <Card 
            size="small"
            hoverable
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              border: 'none',
              color: 'white',
              minHeight: '70px'
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px' }}>
                  总上传流量
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1' }}>
                  {formatBytes(Math.max(hourlyStats.totalNetout, dailyStats.totalNetout))}
                </div>
              </div>
              <CloudUploadOutlined style={{ fontSize: '24px', opacity: 0.4 }} />
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={6}>
          <Card 
            size="small"
            hoverable
            style={{ 
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
              border: 'none',
              color: '#333',
              minHeight: '70px'
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.9, marginBottom: '2px' }}>
                  总流量
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', lineHeight: '1' }}>
                  {formatBytes(Math.max(hourlyStats.totalTraffic, dailyStats.totalTraffic))}
                </div>
              </div>
              <SwapOutlined style={{ fontSize: '24px', opacity: 0.4 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* 筛选区域 */}
      <Card size="small" style={{ marginBottom: '12px' }}>
        <Row gutter={12} align="middle">
          <Col span={5}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: '12px' }}>连接:</Text>
              <Select
                style={{ flex: 1 }}
                size="small"
                value={selectedConnection}
                onChange={setSelectedConnection}
                placeholder="选择连接"
              >
                <Option value="all">所有连接</Option>
              </Select>
            </div>
          </Col>
          <Col span={7}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text strong style={{ fontSize: '12px' }}>日期:</Text>
              <RangePicker
                style={{ flex: 1 }}
                size="small"
                value={dateRange}
                onChange={(dates) => setDateRange(dates)}
                format="YYYY-MM-DD"
              />
            </div>
          </Col>
          <Col span={3}>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
              size="small"
            >
              刷新
            </Button>
          </Col>
          <Col span={9}>
            <Space wrap size={4}>
              <Text strong style={{ fontSize: '11px' }}>流量等级:</Text>
              <Tag size="small" style={{ backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', fontSize: '10px' }}>{'<1M'}</Tag>
              <Tag size="small" style={{ backgroundColor: '#bae7ff', border: '1px solid #69c0ff', fontSize: '10px' }}>{'<10M'}</Tag>
              <Tag size="small" style={{ backgroundColor: '#87d068', border: '1px solid #73d13d', fontSize: '10px' }}>{'<100M'}</Tag>
              <Tag size="small" style={{ backgroundColor: '#ffec3d', border: '1px solid #fadb14', fontSize: '10px' }}>{'<1G'}</Tag>
              <Tag size="small" style={{ backgroundColor: '#ffa940', border: '1px solid #fa8c16', fontSize: '10px' }}>{'<10G'}</Tag>
              <Tag size="small" style={{ backgroundColor: '#ff4d4f', border: '1px solid #ff4d4f', color: 'white', fontSize: '10px' }}>{'≥10G'}</Tag>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 数据展示区域 */}
      <Card
        style={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        styles={{ body: { padding: '24px' } }}
      >
        <Tabs 
          defaultActiveKey="hourly" 
          size="large"
          items={[
            {
              key: 'hourly',
              label: (
                <Space>
                  <ClockCircleOutlined />
                  每小时流量记录 (24小时列视图)
                </Space>
              ),
              children: (
                <Spin spinning={loading}>
                  <Table
                    columns={generateHourlyColumns()}
                    dataSource={hourlyDisplayData}
                    rowKey={(record) => `hourly-${record.vmKey}-${new Date().getTime()}-${Math.random()}`}
                    pagination={{
                      pageSize: 50,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total) => `共 ${total} 台虚拟机`,
                      pageSizeOptions: ['20', '50', '100', '200'],
                    }}
                    scroll={{ x: 1600, y: window.innerHeight - 320 }}
                    size="small"
                    bordered
                    showSorterTooltip={{ 
                      title: '支持多列排序：按住Shift键点击多个列标题'
                    }}
                  />
                </Spin>
              ),
            },
            {
              key: 'daily',
              label: (
                <Space>
                  <CalendarOutlined />
                  每日流量记录 (日期列视图)
                </Space>
              ),
              children: (
                <Spin spinning={loading}>
                  <Table
                    columns={generateDailyColumns()}
                    dataSource={dailyDisplayData}
                    rowKey={(record) => `daily-${record.vmKey}-${new Date().getTime()}-${Math.random()}`}
                    pagination={{
                      pageSize: 50,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total) => `共 ${total} 台虚拟机`,
                      pageSizeOptions: ['20', '50', '100', '200'],
                    }}
                    scroll={{ x: 1200, y: window.innerHeight - 320 }}
                    size="small"
                    bordered
                    showSorterTooltip={{ 
                      title: '支持多列排序：按住Shift键点击多个列标题'
                    }}
                  />
                </Spin>
              ),
            },
          ]}
        />
      </Card>
      
      {/* 添加自定义样式优化表格密度 */}
      <style>{`
        .ant-table-thead > tr > th {
          padding: 4px 8px !important;
          font-size: 11px !important;
          font-weight: bold !important;
          background-color: #f5f5f5 !important;
          border-bottom: 1px solid #d9d9d9 !important;
        }
        .ant-table-tbody > tr > td {
          padding: 2px 8px !important;
          font-size: 10px !important;
          border-bottom: 1px solid #f0f0f0 !important;
        }
        .ant-table-tbody > tr {
          height: 32px !important;
        }
        .ant-table-tbody > tr:hover > td {
          background-color: #e6f7ff !important;
        }
        .ant-table-container {
          border: 1px solid #d9d9d9 !important;
          border-radius: 6px !important;
        }
        .ant-table-content {
          scrollbar-width: thin !important;
          scrollbar-color: #ccc #f5f5f5 !important;
        }
        .ant-table-content::-webkit-scrollbar {
          width: 8px !important;
          height: 8px !important;
        }
        .ant-table-content::-webkit-scrollbar-track {
          background: #f5f5f5 !important;
        }
        .ant-table-content::-webkit-scrollbar-thumb {
          background: #ccc !important;
          border-radius: 4px !important;
        }
        .ant-table-content::-webkit-scrollbar-thumb:hover {
          background: #999 !important;
        }
        .ant-pagination {
          margin: 16px 0 0 0 !important;
        }
        .ant-pagination-options {
          margin-left: 16px !important;
        }
      `}</style>
    </div>
  );
}

export default TrafficRecords;