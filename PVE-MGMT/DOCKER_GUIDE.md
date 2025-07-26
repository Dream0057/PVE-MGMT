# 🐳 Docker 部署完整指南

## 📋 概述

本指南将详细介绍如何使用Docker部署PVE Manager项目，包括：
- 环境准备
- Docker镜像构建
- 容器运行
- 故障排除

---

## 📦 数据库说明

### ✅ 已集成数据库
- **类型**: SQLite (默认) / PostgreSQL (可选)
- **位置**: `server/data/pve_manager.db`
- **表结构**: 自动创建（连接、虚拟机、流量数据）
- **数据持久化**: ✅ 已配置Docker volume

### 📊 数据库表
```sql
- pve_connections      # PVE连接配置
- virtual_machines     # 虚拟机信息
- traffic_current      # 当前流量数据
- traffic_hourly       # 小时流量统计
- traffic_daily        # 日流量统计
```

---

## 🛠️ 环境准备

### 1. 安装Docker

**Debian/Ubuntu:**
```bash
# 更新包管理器
sudo apt update

# 安装依赖
sudo apt install -y ca-certificates curl gnupg lsb-release

# 添加Docker官方GPG密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 添加Docker仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

**CentOS/RHEL:**
```bash
# 安装依赖
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
```

### 2. 验证安装
```bash
docker --version
docker-compose --version
```

---

## 🔧 项目配置

### 1. 环境变量设置
```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件
nano .env
```

### 2. 关键配置项
```env
# 基础配置
NODE_ENV=production
PORT=3000
TZ=Asia/Shanghai

# PVE连接 (可选，也可在Web界面配置)
PVE_HOST=YOUR_PVE_IP
PVE_PORT=8006
PVE_USERNAME=root
PVE_PASSWORD=your-password
PVE_REALM=pam
PVE_SSL=true

# 监控配置
TRAFFIC_COLLECTION_INTERVAL=30
DATA_RETENTION_DAYS=30
```

---

## 🚀 部署方式

### 方式1: 一键部署脚本 (推荐)

```bash
# 给脚本执行权限
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

### 方式2: Docker Compose (完整版)

```bash
# 启动基础服务
docker-compose up -d

# 启动完整版 (包含Nginx + PostgreSQL)
docker-compose --profile with-nginx --profile with-postgres up -d

# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f pve-manager
```

### 方式3: Docker Compose (简化版)

```bash
# 使用简化配置
docker-compose -f docker-compose.simple.yml up -d
```

### 方式4: 纯Docker命令

```bash
# 构建镜像
docker build -t pve-manager:latest .

# 创建数据卷
docker volume create pve_data
docker volume create pve_logs

# 运行容器
docker run -d \
  --name pve-manager \
  -p 3000:3000 \
  -v pve_data:/app/server/data \
  -v pve_logs:/app/logs \
  -e NODE_ENV=production \
  -e TZ=Asia/Shanghai \
  --restart unless-stopped \
  pve-manager:latest
```

---

## 📋 Dockerfile 详解

### 当前Dockerfile结构
```dockerfile
# 第一阶段：构建环境
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++  # 编译native模块
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

# 第二阶段：生产环境
FROM node:22-alpine AS production
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata bash curl sqlite
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
WORKDIR /app
COPY --chown=nodejs:nodejs package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=nodejs:nodejs ./server/src ./server/src
COPY --chown=nodejs:nodejs ./client ./client
RUN mkdir -p /app/server/data /app/logs
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["node", "server/src/simple-server.js"]
```

### 关键特性
- ✅ **多阶段构建** - 减小镜像体积
- ✅ **非root用户** - 提高安全性
- ✅ **时区设置** - 支持中国时区
- ✅ **健康检查** - 容器状态监控
- ✅ **数据持久化** - Volume映射

---

## 🔍 验证部署

### 1. 检查容器状态
```bash
# 查看运行状态
docker ps

# 查看容器日志
docker logs pve-manager

# 进入容器调试
docker exec -it pve-manager /bin/bash
```

### 2. 功能测试
```bash
# 健康检查
curl http://localhost:3000/api/health

# 获取连接列表
curl http://localhost:3000/api/pve/connections

# 查看流量统计
curl http://localhost:3000/api/pve/traffic/stats
```

### 3. Web界面测试
- 访问: http://localhost:3000
- 添加PVE连接
- 查看虚拟机列表
- 监控流量数据

---

## 🛡️ 安全配置

### 1. 防火墙设置
```bash
# 只允许特定IP访问
sudo ufw allow from 192.168.1.0/24 to any port 3000

# 或使用nginx反向代理 + SSL
docker-compose --profile with-nginx up -d
```

### 2. 数据库备份
```bash
# 备份数据卷
docker run --rm \
  -v pve_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/pve_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 恢复数据
docker run --rm \
  -v pve_data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/pve_backup_*.tar.gz"
```

---

## 🔧 故障排除

### 常见问题

**1. 容器启动失败**
```bash
# 查看详细日志
docker logs pve-manager --details

# 检查端口占用
netstat -tlnp | grep 3000

# 重新构建镜像
docker-compose build --no-cache
```

**2. PVE连接失败**
```bash
# 进入容器测试连接
docker exec -it pve-manager /bin/bash
curl -k https://your-pve-server:8006

# 检查网络连通性
docker exec -it pve-manager ping your-pve-server
```

**3. 数据丢失**
```bash
# 检查数据卷
docker volume ls
docker volume inspect pve_data

# 检查文件权限
docker exec -it pve-manager ls -la /app/server/data
```

**4. 性能问题**
```bash
# 查看资源使用
docker stats pve-manager

# 调整资源限制
docker run --memory="512m" --cpus="1.0" ...
```

### 日志调试
```bash
# 实时查看日志
docker-compose logs -f pve-manager

# 查看特定时间日志
docker logs pve-manager --since="2024-01-01T00:00:00" --until="2024-01-02T00:00:00"

# 保存日志到文件
docker logs pve-manager > pve-manager.log 2>&1
```

---

## 📈 监控和维护

### 1. 容器监控
```bash
# 安装Portainer (可选)
docker run -d -p 9000:9000 --name portainer \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce
```

### 2. 定期维护
```bash
# 清理未使用的镜像
docker system prune -a

# 更新容器
docker-compose pull
docker-compose up -d

# 数据库维护
docker exec -it pve-manager sqlite3 /app/server/data/pve_manager.db "VACUUM;"
```

---

## 🎯 生产环境建议

### 1. 使用外部数据库
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: pvemanager
      POSTGRES_USER: pveuser
      POSTGRES_PASSWORD: secure_password
```

### 2. 启用HTTPS
```yaml
# nginx配置
nginx:
  image: nginx:alpine
  ports:
    - "443:443"
  volumes:
    - ./ssl:/etc/nginx/ssl:ro
```

### 3. 集群部署
```yaml
# 多实例负载均衡
deploy:
  replicas: 3
  restart_policy:
    condition: on-failure
```

---

## 📞 技术支持

- 🐛 **问题反馈**: [GitHub Issues]
- 💬 **讨论交流**: [GitHub Discussions]
- 📖 **文档更新**: 欢迎提交PR改进文档

---

**🎉 部署完成后，访问 http://localhost:3000 开始使用PVE Manager！**