#!/bin/bash

# PVE Manager 启动脚本
echo "=== PVE Manager 启动脚本 ==="

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装，请先安装 Node.js 16+"
    exit 1
fi

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装，请先安装 npm"
    exit 1
fi

# 显示Node.js版本
echo "Node.js 版本: $(node --version)"
echo "npm 版本: $(npm --version)"

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装根项目依赖..."
    npm install
fi

if [ ! -d "server/node_modules" ]; then
    echo "正在安装服务器依赖..."
    cd server && npm install && cd ..
fi

if [ ! -d "client/node_modules" ]; then
    echo "正在安装客户端依赖..."
    cd client && npm install && cd ..
fi

echo "=== 依赖安装完成 ==="

# 构建TypeScript代码
echo "正在构建服务器代码..."
cd server && npm run build && cd ..

echo "=== 构建完成 ==="

# 记录启动日志
node dev-logger/simple-logger.js log "application_started"

# 启动开发模式
echo "正在启动 PVE Manager..."
echo "服务器地址: http://localhost:3000"
echo "前端地址: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止服务"

# 使用并发启动前后端
npm run dev