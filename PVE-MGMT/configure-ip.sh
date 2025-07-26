#!/bin/bash

# PVE Manager IP配置脚本
# 自动配置前端API服务器地址

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取当前机器的IP地址
get_local_ip() {
    # 尝试多种方式获取本机IP
    if command -v ip >/dev/null 2>&1; then
        # 使用ip命令获取主要网络接口的IP
        ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K[^ ]+' | head -1
    elif command -v hostname >/dev/null 2>&1; then
        # 使用hostname命令
        hostname -I 2>/dev/null | awk '{print $1}'
    else
        # 使用ifconfig作为备选
        ifconfig 2>/dev/null | grep -E 'inet.*broadcast' | grep -v '127.0.0.1' | awk '{print $2}' | head -1
    fi
}

# 验证IP地址格式
validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        return 0
    else
        return 1
    fi
}

# 显示帮助信息
show_help() {
    echo "PVE Manager IP配置脚本"
    echo ""
    echo "用法:"
    echo "  $0                    # 交互式配置"
    echo "  $0 [IP地址]           # 直接设置指定IP"
    echo "  $0 --auto             # 自动检测并使用本机IP"
    echo "  $0 --localhost        # 设置为localhost（本地开发）"
    echo "  $0 --help             # 显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 192.168.1.100      # 设置API服务器IP为192.168.1.100"
    echo "  $0 --auto             # 自动检测本机IP并配置"
    echo ""
}

# 备份现有配置
backup_config() {
    local env_file="$1"
    if [[ -f "$env_file" ]]; then
        local backup_file="${env_file}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$env_file" "$backup_file"
        print_info "已备份现有配置到: $backup_file"
    fi
}

# 创建配置文件
create_config() {
    local ip="$1"
    local env_file="client/.env"
    
    # 确保client目录存在
    if [[ ! -d "client" ]]; then
        print_error "找不到client目录，请确保在项目根目录运行此脚本"
        exit 1
    fi
    
    # 备份现有配置
    backup_config "$env_file"
    
    # 创建新的配置文件
    cat > "$env_file" << EOF
# API Configuration - 由configure-ip.sh脚本自动生成
# Generated automatically by configure-ip.sh script
VITE_API_BASE_URL=http://${ip}:3000
VITE_WS_URL=ws://${ip}:3000

# Development Configuration
VITE_ENV=development

# 配置时间: $(date)
# Configuration time: $(date)
EOF
    
    print_success "配置文件已创建: $env_file"
    print_info "API服务器地址: http://${ip}:3000"
    print_info "WebSocket地址: ws://${ip}:3000"
}

# 显示当前配置
show_current_config() {
    local env_file="client/.env"
    if [[ -f "$env_file" ]]; then
        print_info "当前配置:"
        echo "----------------------------------------"
        grep -E "^VITE_API_BASE_URL|^VITE_WS_URL" "$env_file" || echo "未找到API配置"
        echo "----------------------------------------"
    else
        print_warning "配置文件不存在: $env_file"
    fi
}

# 交互式配置
interactive_config() {
    echo "========================================"
    echo "    PVE Manager IP 配置向导"
    echo "========================================"
    echo ""
    
    show_current_config
    echo ""
    
    # 获取本机IP作为建议
    local suggested_ip
    suggested_ip=$(get_local_ip)
    
    echo "请选择配置方式:"
    echo "1) 手动输入IP地址"
    echo "2) 使用本机IP地址${suggested_ip:+ ($suggested_ip)}"
    echo "3) 使用localhost（本地开发）"
    echo "4) 退出"
    echo ""
    
    read -p "请选择 [1-4]: " choice
    
    case $choice in
        1)
            read -p "请输入服务器IP地址: " user_ip
            if validate_ip "$user_ip"; then
                create_config "$user_ip"
            else
                print_error "无效的IP地址格式: $user_ip"
                exit 1
            fi
            ;;
        2)
            if [[ -n "$suggested_ip" ]] && validate_ip "$suggested_ip"; then
                create_config "$suggested_ip"
            else
                print_error "无法自动检测到有效的IP地址"
                exit 1
            fi
            ;;
        3)
            create_config "localhost"
            ;;
        4)
            print_info "已取消配置"
            exit 0
            ;;
        *)
            print_error "无效的选择"
            exit 1
            ;;
    esac
}

# 主函数
main() {
    # 检查是否在项目根目录
    if [[ ! -f "package.json" ]] || [[ ! -d "client" ]] || [[ ! -d "server" ]]; then
        print_error "请在PVE Manager项目根目录下运行此脚本"
        exit 1
    fi
    
    # 处理命令行参数
    case "${1:-}" in
        --help|-h)
            show_help
            exit 0
            ;;
        --auto)
            local auto_ip
            auto_ip=$(get_local_ip)
            if [[ -n "$auto_ip" ]] && validate_ip "$auto_ip"; then
                print_info "自动检测到IP地址: $auto_ip"
                create_config "$auto_ip"
            else
                print_error "无法自动检测到有效的IP地址"
                exit 1
            fi
            ;;
        --localhost)
            create_config "localhost"
            ;;
        "")
            # 无参数，进入交互模式
            interactive_config
            ;;
        *)
            # 检查是否为IP地址
            if validate_ip "$1"; then
                create_config "$1"
            else
                print_error "无效的IP地址或参数: $1"
                echo ""
                show_help
                exit 1
            fi
            ;;
    esac
    
    echo ""
    print_success "配置完成！"
    print_info "提示："
    echo "  - 确保服务器在端口3000上运行后端服务"
    echo "  - 确保防火墙允许3000和5173端口的访问"
    echo "  - 重启前端开发服务器以应用新配置"
    echo ""
    print_info "启动命令："
    echo "  后端: cd server && npm run dev"
    echo "  前端: cd client && npm run dev"
}

# 运行主函数
main "$@"