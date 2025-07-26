#!/bin/bash

# PVE Manager 一键部署脚本
# Author: PVE Manager Team
# Usage: chmod +x deploy.sh && ./deploy.sh

set -e

echo "🚀 PVE Manager 一键部署脚本"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查Docker是否安装
check_docker() {
    echo -e "${BLUE}📦 检查Docker环境...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker未安装，请先安装Docker${NC}"
        echo "安装指令: https://docs.docker.com/engine/install/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose未安装，请先安装Docker Compose${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Docker环境检查通过${NC}"
}

# 创建配置文件
create_config() {
    echo -e "${BLUE}📝 创建配置文件...${NC}"
    
    if [ ! -f ".env" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  请编辑 .env 文件，配置你的PVE服务器信息${NC}"
        echo "配置文件位置: $(pwd)/.env"
        
        read -p "是否现在编辑配置文件？(y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ${EDITOR:-nano} .env
        fi
    else
        echo -e "${GREEN}✅ 配置文件已存在${NC}"
    fi
}

# 创建必要目录
create_directories() {
    echo -e "${BLUE}📁 创建必要目录...${NC}"
    mkdir -p data logs config
    echo -e "${GREEN}✅ 目录创建完成${NC}"
}

# 构建和启动服务
deploy_service() {
    echo -e "${BLUE}🔨 构建和启动PVE Manager...${NC}"
    
    # 选择部署方式
    echo "请选择部署方式："
    echo "1) 基础部署 (仅PVE Manager)"
    echo "2) 完整部署 (包含Nginx + PostgreSQL)"
    read -p "选择 [1-2]: " choice
    
    case $choice in
        1)
            docker-compose up -d
            ;;
        2)
            docker-compose --profile with-nginx --profile with-postgres up -d
            ;;
        *)
            echo -e "${RED}无效选择，使用基础部署${NC}"
            docker-compose up -d
            ;;
    esac
    
    echo -e "${GREEN}✅ 服务启动完成${NC}"
}

# 显示访问信息
show_access_info() {
    echo -e "${GREEN}🎉 PVE Manager 部署完成！${NC}"
    echo "================================"
    echo -e "${BLUE}访问地址:${NC}"
    echo "  HTTP:  http://localhost:3000"
    echo "  HTTPS: https://localhost:443 (如启用Nginx)"
    echo
    echo -e "${BLUE}管理命令:${NC}"
    echo "  查看日志: docker-compose logs -f"
    echo "  停止服务: docker-compose down"
    echo "  重启服务: docker-compose restart"
    echo
    echo -e "${BLUE}首次使用:${NC}"
    echo "  1. 访问Web界面"
    echo "  2. 添加PVE连接"
    echo "  3. 开始监控！"
    echo
    echo -e "${YELLOW}⚠️  请确保在 .env 文件中正确配置了PVE服务器信息${NC}"
}

# 主函数
main() {
    check_docker
    create_config
    create_directories
    deploy_service
    show_access_info
}

# 错误处理
trap 'echo -e "${RED}❌ 部署失败！请检查错误信息${NC}"' ERR

# 运行主函数
main "$@"