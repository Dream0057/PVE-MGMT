# PVE Manager 部署说明

## 🚀 快速部署到本地环境

### 环境要求
- Node.js 16+
- npm 8+
- 能访问PVE服务器的网络环境
安装命令：
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

### 1. 启动应用
```bash
# 解压项目文件后进入目录
cd pve-manager

# 一键启动
chmod +x start.sh
./start.sh
```

### 2. 访问应用
- 前端界面: http://localhost:5173
- 后端API: http://localhost:3000

### 3. 配置PVE连接

在Web界面中添加连接：


### 4. 测试连接

点击"测试连接"按钮，应该显示连接成功。

## 🔧 故障排除


如有问题，请检查:
1. 浏览器控制台错误
2. 后端日志输出
3. 网络连接状态

## 🎯 功能特性

- ✅ 多PVE服务器管理
- ✅ 虚拟机控制(启动/停止/重启)
- ✅ 实时资源监控
- ✅ WebSocket实时更新
- ✅ 响应式Web界面