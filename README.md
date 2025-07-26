# 🚀 PVE Manager - Proxmox VE 管理与监控平台

<div align="center">

![PVE Manager Logo](https://img.shields.io/badge/PVE-Manager-blue?style=for-the-badge&logo=proxmox)

一个现代化的 **Proxmox VE** 管理和监控平台，提供美观的 Web 界面来管理多个 PVE 集群。

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://docker.com)
[![TypeScript](https://img.shields.io/badge/typescript-ready-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/react-18.3-blue.svg)](https://reactjs.org/)

[🚀 快速开始](#快速开始) • [📖 功能特性](#功能特性) • [🐳 Docker部署](#docker部署) • [🤝 贡献](#贡献)

</div>

## 功能特性

### ✅ 已实现功能
- **多PVE连接管理**: 支持同时管理多个 Proxmox VE 集群
- **虚拟机管理**: 启动、停止、重启、挂起、删除虚拟机和容器
- **实时监控**: CPU、内存、存储使用率监控
- **资源统计**: 图表展示资源使用趋势
- **WebSocket实时通信**: 实时状态更新
- **开发记录系统**: 自动记录开发进度和上下文
- **🆕 告警系统**: 完整的告警管理和监控系统
  - 实时告警监控和生成
  - 多级别告警 (严重/警告/信息)
  - 多类型告警 (PVE系统/性能/网络/服务)
  - 告警状态管理 (活跃/已确认/已解决)
  - 自动告警解决机制
  - 用户友好的告警管理界面

### 🚧 开发中功能
- **用户权限管理**: 多用户访问控制
- **备份管理**: 虚拟机备份和恢复
- **模板管理**: VM模板创建和部署
<img width="1096" height="613" alt="PVE-MGMT1" src="https://github.com/user-attachments/assets/a58155a3-9484-4345-9be0-8916f4007ca9" />

## 技术栈

### 后端
- **Node.js** + **Express** + **TypeScript**
- **Socket.IO** (实时通信)
- **Axios** (HTTP客户端)
- **Winston** (日志)
- **🆕 SQLite** (告警数据存储)

### 前端
- **React** + **TypeScript** + **Vite**
- **Ant Design** (UI组件库)
- **Recharts** (图表库)
- **Socket.IO Client** (实时通信)
- **🆕 Day.js** (时间处理)

### 开发工具
- **开发记录系统**: 自动记录开发进度
- **ESLint** + **TypeScript** (代码质量)

## 项目结构

```
/pve-manager/
├── server/              # 后端服务
│   ├── src/
│   │   ├── config/      # 配置文件
│   │   ├── services/    # 业务逻辑
│   │   ├── routes/      # API路由
│   │   │   ├── pve.ts   # PVE管理API
│   │   │   ├── traffic.ts # 流量监控API
│   │   │   └── alerts.ts  # 🆕 告警系统API
│   │   ├── websockets/  # WebSocket处理
│   │   ├── db/          # 数据库相关
│   │   │   └── database.js # SQLite数据库
│   │   └── server.ts    # 服务器入口
│   ├── data/            # 数据存储
│   │   └── pve_manager.db # SQLite数据库文件
│   ├── check-alerts-db.js # 🆕 告警数据库检查脚本
│   ├── test-alerts-api.js # 🆕 告警API测试脚本
│   └── package.json
├── client/              # 前端应用
│   ├── src/
│   │   ├── components/  # React组件
│   │   │   └── Layout/  # 布局组件
│   │   ├── pages/       # 页面组件
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Connections.tsx
│   │   │   ├── VirtualMachines.tsx
│   │   │   ├── Monitoring.tsx
│   │   │   └── Alerts.tsx # 🆕 告警管理页面
│   │   ├── contexts/    # React Context
│   │   └── main.tsx     # 应用入口
│   └── package.json
├── dev-logger/          # 开发记录系统
│   ├── simple-logger.js # 日志记录脚本
│   ├── development-log.json # 开发日志
│   └── context.md       # 开发上下文
└── package.json         # 根项目配置
```

## 快速开始

### 🎯 超简单启动（推荐新用户）

```bash
# 克隆项目后，只需要一个命令！
./start.sh
```

首次运行会自动：
1. 检查系统环境
2. 引导你配置网络参数
3. 安装所有依赖 
4. 构建和启动项目

### 环境要求
- Node.js 16+ 
- npm 8+
- 一个或多个 Proxmox VE 服务器

### 手动安装依赖（可选）

```bash
# 安装根项目依赖
npm install

# 安装服务器依赖
cd server && npm install

# 安装客户端依赖
cd ../client && npm install
```

### 🚀 快速启动（推荐）

**新的一键启动方式** - 包含项目初始化和配置：

```bash
# 一键启动（首次运行会自动进入配置向导）
./start.sh

# 重新配置项目参数
./start.sh --init

# 重置所有配置
./start.sh --reset
```

启动脚本会自动：
- 检查系统依赖
- 初始化项目配置（首次运行）
- 安装所需依赖
- 构建项目
- 启动前后端服务

### 传统启动方式

#### 配置API服务器地址

如果使用传统方式启动，需要先配置API地址：

```bash
# 使用自动配置脚本
./configure-ip.sh                    # 交互式配置
./configure-ip.sh 192.168.1.100      # 直接设置服务器IP
./configure-ip.sh --auto             # 自动检测本机IP
```

#### 开发模式启动

```bash
# 在项目根目录运行，会同时启动前后端
npm run dev
```

或者分别启动：

```bash
# 启动后端服务 (端口3000)
npm run dev:server

# 启动前端开发服务器 (端口5173)
npm run dev:client
```

### 生产模式部署

```bash
# 构建项目
npm run build

# 启动生产服务器
npm start
```

## 使用说明

### 1. 添加PVE连接

**重要**: 根据你的部署方式访问相应的地址：
- 同机器部署: `http://localhost:5173`
- 跨机器部署: `http://服务器IP:5173` (例如: `http://192.168.1.100:5173`)

1. 访问前端页面
2. 点击侧边栏"PVE连接"
3. 点击"添加连接"按钮
4. 填写PVE服务器信息：
   - 连接名称: 自定义名称
   - 主机地址: PVE服务器IP
   - 端口: 默认8006
   - 用户名: root 或其他管理员用户
   - 密码: PVE登录密码
   - 认证域: 默认pam
   - 使用SSL: 建议开启

### 2. 管理虚拟机
1. 点击侧边栏"虚拟机"
2. 查看所有连接的虚拟机列表
3. 使用操作按钮管理VM：
   - ▶️ 启动VM
   - ⏸️ 关闭VM
   - ⏹️ 强制停止
   - ⏸️ 挂起 (仅QEMU)
   - 🗑️ 删除 (仅停止状态)

### 3. 查看监控数据
1. 点击侧边栏"监控"
2. 查看资源使用统计
3. 观察实时使用趋势图表

### 4. 🆕 告警系统管理
1. 点击侧边栏"系统告警"
2. 查看告警统计概览：
   - 总告警数、严重告警、警告告警、活跃告警
3. 使用筛选器过滤告警：
   - 按等级筛选: 全部/严重/警告/信息
   - 按类型筛选: 全部/PVE系统/性能/网络/服务
   - 按状态筛选: 全部/活跃/已确认/已解决
4. 告警操作：
   - 👁️ 查看详情: 查看告警完整信息和时间线
   - ✅ 确认告警: 标记告警为已确认状态
   - ✅ 解决告警: 标记告警为已解决状态
   - 🗑️ 删除告警: 永久删除告警记录

#### 自动告警监控
系统每2分钟自动检查以下项目并生成告警：
- **PVE连接状态**: 连接断开时生成严重告警
- **节点状态**: 节点离线时生成严重告警
- **磁盘使用率**: 
  - 超过90%生成严重告警
  - 超过80%生成警告告警
- **内存使用率**:
  - 超过95%生成严重告警
  - 超过85%生成警告告警
- **CPU使用率**: 超过90%生成警告告警
- **VM状态异常**: VM处于异常状态时生成警告告警

#### 自动告警解决
当监控到问题恢复时，系统会自动将相关告警标记为已解决：
- PVE连接恢复
- 节点重新上线
- 资源使用率降低到安全范围

## API 接口

### PVE连接管理
- `GET /api/pve/connections` - 获取所有连接
- `POST /api/pve/connections` - 添加新连接
- `DELETE /api/pve/connections/:id` - 删除连接
- `POST /api/pve/connections/:id/test` - 测试连接

### 虚拟机管理
- `GET /api/pve/vms` - 获取所有虚拟机
- `POST /api/pve/connections/:id/vms/:vmid/start` - 启动VM
- `POST /api/pve/connections/:id/vms/:vmid/stop` - 停止VM
- `POST /api/pve/connections/:id/vms/:vmid/shutdown` - 关闭VM
- `DELETE /api/pve/connections/:id/vms/:vmid` - 删除VM

### 监控数据
- `GET /api/pve/nodes` - 获取所有节点
- `GET /api/pve/connections/:id/resources` - 获取集群资源

### 🆕 告警系统
- `GET /api/alerts` - 获取告警列表 (支持过滤: level, type, status)
- `POST /api/alerts` - 创建新告警
- `POST /api/alerts/:id/acknowledge` - 确认告警
- `POST /api/alerts/:id/resolve` - 解决告警
- `DELETE /api/alerts/:id` - 删除告警
- `GET /api/alerts/stats` - 获取告警统计信息
- `POST /api/alerts/batch` - 批量操作告警 (acknowledge, resolve, delete)

## WebSocket 事件

### 客户端发送
- `get-connections` - 请求连接列表
- `get-vms` - 请求虚拟机列表
- `vm-action` - 执行VM操作

### 服务器发送
- `connections` - 连接列表更新
- `vms` - 虚拟机列表更新
- `connection-status-changed` - 连接状态变更
- `vm-action-result` - VM操作结果

## 开发记录系统

项目包含自动开发记录系统，用于保存开发进度：

```bash
# 查看开发进度
node dev-logger/simple-logger.js progress

# 生成开发报告
node dev-logger/simple-logger.js report

# 手动记录活动
node dev-logger/simple-logger.js log "activity_name"
```

## 配置说明

### 环境变量

#### 后端配置
- `PORT`: 后端服务端口 (默认: 3000)
- `CLIENT_URL`: 前端地址 (默认: http://localhost:5173)
- `NODE_ENV`: 运行环境 (development/production)

#### 前端配置

**重要提示**: 根据你的部署场景选择相应的配置方式

##### 场景1: 同一台机器部署（服务器和前端在同一台机器）
创建 `client/.env` 文件：
```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_ENV=development
```

##### 场景2: 跨机器部署（服务器和客户端在不同机器）⭐
这是最常见的生产部署场景。

**方式1: 使用自动配置脚本（推荐）**
```bash
# Linux/macOS
./configure-ip.sh                    # 交互式配置
./configure-ip.sh 192.168.1.100      # 直接设置IP
./configure-ip.sh --auto             # 自动检测本机IP

# Windows
configure-ip.bat                     # 交互式配置  
configure-ip.bat 192.168.1.100      # 直接设置IP
configure-ip.bat --auto             # 自动检测本机IP
```

**方式2: 手动创建配置文件**
创建 `client/.env` 文件：
```bash
# 将 YOUR_SERVER_IP 替换为实际的服务器IP地址
VITE_API_BASE_URL=http://YOUR_SERVER_IP:3000
VITE_WS_URL=ws://YOUR_SERVER_IP:3000
VITE_ENV=production

# 示例：如果服务器IP是 192.168.1.100
# VITE_API_BASE_URL=http://192.168.1.100:3000
# VITE_WS_URL=ws://192.168.1.100:3000
```

##### 场景3: 使用域名部署
```bash
VITE_API_BASE_URL=https://your-domain.com
VITE_WS_URL=wss://your-domain.com
VITE_ENV=production
```

**后端CORS配置**: 
- 开发环境：自动支持局域网内所有IP的5173端口访问
- 生产环境：可通过 `CLIENT_URL` 环境变量指定允许的前端地址

> 💡 **提示**: 可以参考 `client/.env.example` 文件查看详细配置说明。

### PVE服务器要求
- Proxmox VE 6.0+
- 启用Web API
- 有效的管理员账户

## 故障排除

### 连接失败
1. 检查PVE服务器网络连通性
2. 确认PVE Web界面可访问
3. 验证用户名密码正确
4. 检查防火墙设置

### 性能问题
1. 减少监控频率
2. 限制显示的VM数量
3. 检查网络延迟

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 创建 Pull Request

## 许可证

MIT License

## 📋 更新日志

### v1.0.1 (2025-07-23)

**🔧 问题修复**:
- 修复 Antd Card 组件 `bodyStyle` 废弃警告
- 修复 Antd Tabs 组件 `TabPane` 废弃警告  
- 修复 React Router v7 未来标志警告
- 修复 TrafficRecords 组件无限更新循环问题
- 优化网络请求错误处理
- 添加 WebSocket 连接错误处理和重连机制

**📚 文档更新**:
- 新增 [问题修复报告](BUGFIX_REPORT_2025-07-23.md)
- 新增 [技术解决方案参考](TECHNICAL_SOLUTIONS.md)

**🚀 改进**:
- 使用 `useCallback` 优化组件性能
- 改进错误边界处理
- 提升代码质量和可维护性  

详细修复信息请查看 [BUGFIX_REPORT_2025-07-23.md](BUGFIX_REPORT_2025-07-23.md)

### v1.0.0 (2025-07-22)
- 初始版本发布
- 基础 PVE 管理功能
- 虚拟机监控和流量统计
- 告警系统

## 🔧 故障排除

如遇到问题，请参考：
1. [技术解决方案参考](TECHNICAL_SOLUTIONS.md) - 常见问题解决方案
2. [问题修复报告](BUGFIX_REPORT_2025-07-23.md) - 已知问题及修复记录

### 常见问题

**Q: 页面无法访问，提示连接被拒绝？**  
A: 检查服务是否启动：
```bash
# 检查端口占用
ss -tlnp | grep :3000  # 后端
ss -tlnp | grep :5173  # 前端

# 启动服务
npm run dev
```

**Q: 控制台出现 Antd 组件废弃警告？**  
A: 项目已在 v1.0.1 版本中修复，请查看 [技术解决方案参考](TECHNICAL_SOLUTIONS.md)

**Q: 组件出现无限更新循环？**  
A: 检查 useEffect 依赖数组设置，参考 [TECHNICAL_SOLUTIONS.md](TECHNICAL_SOLUTIONS.md) 中的最佳实践

## 联系信息

如有问题或建议，请创建 Issue。
