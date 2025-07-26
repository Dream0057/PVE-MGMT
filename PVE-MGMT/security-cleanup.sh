#!/bin/bash
# PVE项目安全清理脚本 - 移除敏感信息

set -e

echo "🔐 开始PVE项目安全清理过程..."

# 定义敏感信息替换规则
declare -A REPLACEMENTS=(
    # 密码清理
    ["Xihuanni123!@#"]="YOUR_PVE_PASSWORD_HERE"
    ["admin123"]="YOUR_ADMIN_PASSWORD_HERE"
    
    # IP地址清理
    ["192.168.2.254"]="YOUR_PVE_SERVER_IP"
    ["192.168.2.13"]="YOUR_DEV_SERVER_IP"
    ["192.168.2.4"]="YOUR_CLIENT_IP"
    ["192.168.1.100"]="YOUR_PVE_IP"
    
    # 用户名清理（保留格式但移除实际信息）
    ["root@pam"]="pve_admin@pam"
    
    # 连接ID清理
    ["pve-1752984980902"]="pve-CONNECTION_ID"
)

# 定义需要完全排除的文件/目录
EXCLUDE_PATTERNS=(
    "node_modules"
    "*.db"
    "*.db-journal" 
    "*.log"
    "uploads"
    "dist"
    "backups"
)

# 定义需要特殊处理的敏感文件
SENSITIVE_FILES=(
    "pve-sdn-manager-v2/config/runtime.json"
    "server/data/pve_manager.db"
    "*.log"
)

# 创建排除模式参数
exclude_args=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    exclude_args="$exclude_args --exclude=$pattern"
done

# 函数：清理文件中的敏感信息
clean_file() {
    local file="$1"
    echo "  清理文件: $file"
    
    # 备份原文件
    cp "$file" "$file.backup"
    
    # 应用所有替换规则
    for search in "${!REPLACEMENTS[@]}"; do
        replacement="${REPLACEMENTS[$search]}"
        sed -i "s|$search|$replacement|g" "$file" 2>/dev/null || true
    done
    
    # 移除WebSocket连接ID（格式：20个字符的随机字符串）
    sed -i 's/[a-zA-Z0-9_-]\{20\}/WEBSOCKET_CONNECTION_ID/g' "$file" 2>/dev/null || true
    
    # 移除时间戳（ISO格式）
    sed -i 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}T[0-9]\{2\}:[0-9]\{2\}:[0-9]\{2\}[.][0-9]\{3\}Z/TIMESTAMP/g' "$file" 2>/dev/null || true
}

# 函数：创建示例配置文件
create_example_configs() {
    echo "📝 创建示例配置文件..."
    
    # 创建环境变量示例
    cat > .env.example << 'EOF'
# PVE管理系统环境配置
# 复制此文件为 .env 并填入实际值

# 服务器配置
PORT=3000
NODE_ENV=development

# PVE连接配置
PVE_HOST=YOUR_PVE_SERVER_IP
PVE_PORT=8006
PVE_USERNAME=YOUR_PVE_USERNAME
PVE_PASSWORD=YOUR_PVE_PASSWORD
PVE_REALM=pam

# 数据库配置
DB_PATH=./data/pve_manager.db

# 安全配置
JWT_SECRET=YOUR_JWT_SECRET_KEY_HERE
ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD_HERE

# 客户端配置
CLIENT_URL=http://localhost:5173
EOF

    # 创建PVE配置示例
    cat > server/src/config/pve.example.ts << 'EOF'
// PVE连接配置示例
// 复制此文件为 pve.ts 并填入实际配置

export const pveConfig = {
  host: process.env.PVE_HOST || 'YOUR_PVE_SERVER_IP',
  port: parseInt(process.env.PVE_PORT || '8006'),
  username: process.env.PVE_USERNAME || 'YOUR_PVE_USERNAME',
  password: process.env.PVE_PASSWORD || 'YOUR_PVE_PASSWORD',
  realm: process.env.PVE_REALM || 'pam',
  timeout: 10000,
  rejectUnauthorized: false
};
EOF

    # 创建安全的runtime.json示例
    cat > pve-sdn-manager-v2/config/runtime.example.json << 'EOF'
{
  "pve": {
    "host": "YOUR_PVE_SERVER_IP", 
    "port": 8006,
    "username": "YOUR_PVE_USERNAME",
    "password": "YOUR_PVE_PASSWORD",
    "realm": "pam"
  },
  "server": {
    "port": 3001,
    "logLevel": "info"
  }
}
EOF
}

echo "✅ 安全清理脚本已准备完成"