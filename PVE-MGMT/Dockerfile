# 多阶段构建 Dockerfile - PVE Manager
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装python和构建工具（某些包需要）
RUN apk add --no-cache python3 make g++

# 复制package.json文件
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# 安装依赖
RUN npm ci --include=dev
RUN cd server && npm ci --include=dev
RUN cd client && npm ci --include=dev

# 复制源代码
COPY . .

# 构建项目
RUN npm run build

# 生产环境镜像
FROM node:22-alpine AS production

# 设置时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone && \
    apk del tzdata

# 安装必要工具
RUN apk add --no-cache bash curl sqlite

# 创建应用用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs server/package*.json ./server/

# 只安装生产依赖
RUN npm ci --omit=dev && npm cache clean --force
RUN cd server && npm ci --omit=dev && npm cache clean --force

# 复制源代码和构建结果（开发模式，不需要构建）
COPY --chown=nodejs:nodejs ./server/src ./server/src
COPY --chown=nodejs:nodejs ./client ./client
COPY --chown=nodejs:nodejs ./dev-logger ./dev-logger

# 复制配置文件
COPY --chown=nodejs:nodejs start.sh ./
COPY --chown=nodejs:nodejs README.md ./
COPY --chown=nodejs:nodejs .env.example ./.env

# 创建必要目录
RUN mkdir -p /app/server/data /app/logs && \
    chown -R nodejs:nodejs /app

# 设置权限
RUN chmod +x start.sh

# 切换到应用用户
USER nodejs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 启动命令
CMD ["node", "server/src/simple-server.js"]