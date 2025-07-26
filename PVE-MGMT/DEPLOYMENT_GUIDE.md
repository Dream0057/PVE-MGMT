# 🚀 部署指导手册

本文档详细说明如何在不同场景下部署 PVE Manager 系统。

## 📋 部署场景

### 场景1: 同机器部署
服务器和前端Web界面运行在同一台机器上，用户通过该机器的浏览器访问。

### 场景2: 跨机器部署 ⭐ (推荐)
服务器运行在一台机器上，用户从其他机器的浏览器访问Web界面。这是最常见的生产部署场景。

### 场景3: Docker部署
使用Docker容器部署整个系统。

## 🔧 跨机器部署详细步骤

### 步骤1: 服务器端配置

1. **确保服务器可以被外部访问**
   ```bash
   # 检查防火墙设置，确保3000和5173端口开放
   sudo ufw allow 3000
   sudo ufw allow 5173
   
   # 或者使用iptables
   sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
   sudo iptables -A INPUT -p tcp --dport 5173 -j ACCEPT
   ```

2. **获取服务器IP地址**
   ```bash
   # 查看服务器IP地址
   ip addr show
   # 或者
   hostname -I
   ```

### 步骤2: 前端配置

1. **创建前端环境配置文件**
   ```bash
   cd client
   cp .env.example .env
   ```

2. **编辑配置文件**
   ```bash
   # 编辑 client/.env 文件
   vim .env
   ```
   
   内容设置为：
   ```bash
   # 替换 192.168.1.100 为你的实际服务器IP
   VITE_API_BASE_URL=http://192.168.1.100:3000
   VITE_WS_URL=ws://192.168.1.100:3000
   VITE_ENV=production
   ```

### 步骤3: 启动服务

1. **启动后端服务器**
   ```bash
   cd server
   npm run dev
   # 或生产模式
   npm run build && npm start
   ```

2. **启动前端服务器**
   ```bash
   cd client
   npm run dev
   # 或构建生产版本
   npm run build && npm run preview
   ```

### 步骤4: 访问系统

从任何机器的浏览器访问：`http://服务器IP:5173`

例如：`http://192.168.1.100:5173`

## 🐳 Docker部署

### 方式1: 使用docker-compose（推荐）

1. **配置环境变量**
   ```bash
   # 编辑 docker-compose.yml 中的环境变量
   # 或创建 .env 文件
   echo "SERVER_IP=192.168.1.100" > .env
   ```

2. **启动服务**
   ```bash
   docker-compose up -d
   ```

### 方式2: 手动Docker部署

1. **构建镜像**
   ```bash
   docker build -t pve-manager .
   ```

2. **运行容器**
   ```bash
   docker run -d \\
     -p 3000:3000 \\
     -p 5173:5173 \\
     -e VITE_API_BASE_URL=http://你的服务器IP:3000 \\
     -e VITE_WS_URL=ws://你的服务器IP:3000 \\
     pve-manager
   ```

## 🔍 常见问题排查

### 问题1: 前端无法连接到后端API

**症状**: 前端页面加载正常，但无法获取数据，浏览器控制台显示连接错误。

**解决方案**:
1. 检查 `client/.env` 文件中的IP地址是否正确
2. 确认后端服务器在端口3000上正常运行：`curl http://服务器IP:3000/api/health`
3. 检查防火墙设置是否阻止了3000端口
4. 验证CORS配置是否正确

### 问题2: WebSocket连接失败

**症状**: 实时数据更新不工作，浏览器控制台显示WebSocket连接错误。

**解决方案**:
1. 检查 `VITE_WS_URL` 配置是否正确
2. 确认防火墙允许3000端口的WebSocket连接
3. 在开发环境中，确认 `NODE_ENV=development` 已设置

### 问题3: 跨域请求被阻止

**症状**: 浏览器控制台显示CORS错误。

**解决方案**:
1. 在生产环境中设置 `CLIENT_URL` 环境变量：
   ```bash
   export CLIENT_URL=http://客户端IP:5173
   ```
2. 重启后端服务器

### 问题4: 前端访问不到

**症状**: 浏览器无法访问 `http://服务器IP:5173`

**解决方案**:
1. 确认Vite开发服务器以 `--host 0.0.0.0` 启动
2. 检查5173端口是否被防火墙阻止
3. 验证前端服务器是否正常启动

## 🔐 安全注意事项

1. **生产环境部署**:
   - 使用HTTPS和WSS协议
   - 配置适当的防火墙规则
   - 使用反向代理（如Nginx）

2. **网络安全**:
   - 限制API访问的IP范围
   - 使用强密码和安全的PVE认证

3. **环境变量管理**:
   - 不要在代码中硬编码敏感信息
   - 使用环境变量管理配置

## 📞 获取帮助

如果遇到部署问题：

1. 检查服务器和客户端的日志输出
2. 使用浏览器开发者工具检查网络请求
3. 参考项目的 `README.md` 文件
4. 在项目的GitHub页面提交Issue