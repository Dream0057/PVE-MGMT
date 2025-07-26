#!/bin/bash

# PVE Manager Docker 构建脚本
# 使用说明: chmod +x build-docker.sh && ./build-docker.sh

set -e

echo "🐳 PVE Manager Docker 构建脚本"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查Docker
check_docker() {
    echo -e "${BLUE}📦 检查Docker环境...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker未安装${NC}"
        echo "请先安装Docker: https://docs.docker.com/engine/install/"
        echo "或运行: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker环境正常${NC}"
}

# 构建镜像
build_image() {
    echo -e "${BLUE}🔨 开始构建Docker镜像...${NC}"
    
    # 获取版本信息
    VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
    IMAGE_NAME="pve-manager"
    IMAGE_TAG="${IMAGE_NAME}:${VERSION}"
    LATEST_TAG="${IMAGE_NAME}:latest"
    
    echo "镜像名称: ${IMAGE_TAG}"
    echo "最新标签: ${LATEST_TAG}"
    
    # 构建镜像
    echo -e "${BLUE}正在构建镜像 ${IMAGE_TAG}...${NC}"
    docker build \
        --tag "${IMAGE_TAG}" \
        --tag "${LATEST_TAG}" \
        --build-arg BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
        .
    
    echo -e "${GREEN}✅ 镜像构建完成！${NC}"
}

# 显示镜像信息
show_image_info() {
    echo -e "${BLUE}📊 镜像信息:${NC}"
    docker images pve-manager --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    
    echo -e "\n${BLUE}🔍 镜像详情:${NC}"
    docker inspect pve-manager:latest --format='{{json .Config.Labels}}' | python3 -m json.tool 2>/dev/null || echo "镜像标签信息获取失败"
}

# 测试运行
test_container() {
    echo -e "${BLUE}🧪 测试容器运行...${NC}"
    
    # 检查端口占用
    if netstat -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo -e "${YELLOW}⚠️  端口3000已被占用，使用3001端口测试${NC}"
        TEST_PORT=3001
    else
        TEST_PORT=3000
    fi
    
    # 启动测试容器
    echo "启动测试容器..."
    CONTAINER_ID=$(docker run -d \
        --name pve-manager-test \
        -p ${TEST_PORT}:3000 \
        -e NODE_ENV=production \
        pve-manager:latest)
    
    echo "容器ID: ${CONTAINER_ID}"
    
    # 等待启动
    echo "等待服务启动..."
    sleep 10
    
    # 健康检查
    echo "执行健康检查..."
    if curl -f http://localhost:${TEST_PORT}/api/health &>/dev/null; then
        echo -e "${GREEN}✅ 容器运行正常！${NC}"
        echo "访问地址: http://localhost:${TEST_PORT}"
    else
        echo -e "${RED}❌ 健康检查失败${NC}"
        echo "容器日志:"
        docker logs pve-manager-test --tail 20
    fi
    
    # 清理测试容器
    read -p "是否保留测试容器运行？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "停止并删除测试容器..."
        docker stop pve-manager-test >/dev/null
        docker rm pve-manager-test >/dev/null
        echo -e "${GREEN}✅ 测试容器已清理${NC}"
    else
        echo -e "${GREEN}✅ 测试容器继续运行在端口 ${TEST_PORT}${NC}"
    fi
}

# 推送镜像 (可选)
push_image() {
    echo -e "${BLUE}📤 推送镜像选项${NC}"
    read -p "是否推送镜像到Docker Hub？需要先登录 (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "请输入Docker Hub用户名: " DOCKER_USERNAME
        if [ -n "$DOCKER_USERNAME" ]; then
            # 重新标记镜像
            docker tag pve-manager:latest ${DOCKER_USERNAME}/pve-manager:latest
            docker tag pve-manager:latest ${DOCKER_USERNAME}/pve-manager:${VERSION}
            
            echo "推送镜像 ${DOCKER_USERNAME}/pve-manager..."
            docker push ${DOCKER_USERNAME}/pve-manager:latest
            docker push ${DOCKER_USERNAME}/pve-manager:${VERSION}
            
            echo -e "${GREEN}✅ 镜像推送完成！${NC}"
            echo "其他人可以使用: docker pull ${DOCKER_USERNAME}/pve-manager:latest"
        fi
    fi
}

# 显示使用说明
show_usage() {
    echo -e "${GREEN}🎉 构建完成！使用说明:${NC}"
    echo "================================"
    echo -e "${BLUE}快速启动:${NC}"
    echo "  docker run -d -p 3000:3000 --name pve-manager pve-manager:latest"
    echo
    echo -e "${BLUE}使用Docker Compose:${NC}"
    echo "  docker-compose up -d"
    echo
    echo -e "${BLUE}查看日志:${NC}"
    echo "  docker logs pve-manager"
    echo
    echo -e "${BLUE}管理命令:${NC}"
    echo "  docker stop pve-manager    # 停止容器"
    echo "  docker start pve-manager   # 启动容器"
    echo "  docker restart pve-manager # 重启容器"
    echo "  docker rm pve-manager      # 删除容器"
}

# 主函数
main() {
    check_docker
    build_image
    show_image_info
    
    echo
    read -p "是否运行容器测试？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        test_container
    fi
    
    push_image
    show_usage
}

# 错误处理
trap 'echo -e "${RED}❌ 构建失败！请检查错误信息${NC}"' ERR

# 运行主函数
main "$@"