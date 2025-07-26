# 🛡️ PVE管理系统 - 安全部署指南

## 🎯 部署前安全检查清单

在部署此PVE管理系统之前，请按照以下安全检查清单确保系统安全：

---

## 🔐 第一步：配置文件安全设置

### 1. 环境变量配置
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件 - 设置强密码
nano .env
```

**关键配置项**:
```bash
# 使用强密码（至少12位，包含大小写字母、数字、特殊字符）
PVE_PASSWORD=YourSecurePassword123!@#

# JWT密钥（至少32位随机字符）
JWT_SECRET=your-very-secure-jwt-secret-key-here-at-least-32-chars

# 管理员密码（强密码）
ADMIN_PASSWORD=YourAdminPassword456!@#
```

### 2. PVE连接配置
```bash
# 复制PVE配置模板
cp server/src/config/pve.example.ts server/src/config/pve.ts

# 编辑配置
nano server/src/config/pve.ts
```

### 3. SDN管理器配置（可选）
```bash
# 如果使用SDN功能
cp pve-sdn-manager-v2/config/runtime.example.json pve-sdn-manager-v2/config/runtime.json

# 配置实际PVE信息
nano pve-sdn-manager-v2/config/runtime.json
```

---

## 🔒 第二步：网络安全配置

### 1. 防火墙设置
```bash
# 只开放必需端口
sudo ufw allow 3000/tcp  # API服务端口
sudo ufw allow 5173/tcp  # 开发服务端口（生产环境不需要）

# 限制PVE管理端口访问（仅内网）
sudo ufw allow from 192.168.0.0/16 to any port 8006
```

### 2. HTTPS配置（生产环境必需）
```bash
# 使用Let's Encrypt获取SSL证书
sudo apt install certbot nginx
sudo certbot --nginx -d your-domain.com

# 或者使用自签名证书（仅测试）
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/pve-manager.key \
    -out /etc/ssl/certs/pve-manager.crt
```

### 3. 反向代理配置
创建Nginx配置文件 `/etc/nginx/sites-available/pve-manager`:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/pve-manager.crt;
    ssl_certificate_key /etc/ssl/private/pve-manager.key;

    # 安全头设置
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 👤 第三步：用户访问控制

### 1. 系统用户安全
```bash
# 创建专用用户运行服务
sudo useradd -r -s /bin/false pve-manager
sudo chown -R pve-manager:pve-manager /path/to/Clone-PVE-MGMT

# 设置文件权限
sudo chmod 750 /path/to/Clone-PVE-MGMT
sudo chmod 640 /path/to/Clone-PVE-MGMT/.env
```

### 2. PVE用户权限
在Proxmox VE中为此应用创建专用用户：
```bash
# 在PVE中执行
pveum user add pve-manager@pam --comment "PVE Manager Application"
pveum passwd pve-manager@pam

# 分配最小必要权限
pveum role add PVEManager -privs "VM.Audit,VM.Monitor,VM.PowerMgmt,Datastore.Audit,Sys.Audit"
pveum acl modify / -user pve-manager@pam -role PVEManager
```

---

## 🗄️ 第四步：数据库安全

### 1. 数据库文件权限
```bash
# 创建数据目录
sudo mkdir -p /var/lib/pve-manager/data
sudo chown pve-manager:pve-manager /var/lib/pve-manager/data
sudo chmod 750 /var/lib/pve-manager/data

# 更新配置文件中的数据库路径
DB_PATH=/var/lib/pve-manager/data/pve_manager.db
```

### 2. 定期备份
```bash
# 创建备份脚本
cat > /usr/local/bin/pve-manager-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/pve-manager"
DB_PATH="/var/lib/pve-manager/data/pve_manager.db"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR
sqlite3 $DB_PATH ".backup $BACKUP_DIR/pve_manager_$DATE.db"
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
EOF

sudo chmod +x /usr/local/bin/pve-manager-backup.sh

# 添加到crontab（每日备份）
echo "0 2 * * * /usr/local/bin/pve-manager-backup.sh" | sudo crontab -
```

---

## 📊 第五步：监控和日志

### 1. 日志配置
```bash
# 创建日志目录
sudo mkdir -p /var/log/pve-manager
sudo chown pve-manager:pve-manager /var/log/pve-manager

# 配置logrotate
cat > /etc/logrotate.d/pve-manager << 'EOF'
/var/log/pve-manager/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 pve-manager pve-manager
    postrotate
        systemctl reload pve-manager || true
    endscript
}
EOF
```

### 2. 系统服务配置
```bash
# 创建systemd服务文件
cat > /etc/systemd/system/pve-manager.service << 'EOF'
[Unit]
Description=PVE Manager Service
After=network.target

[Service]
Type=simple
User=pve-manager
Group=pve-manager
WorkingDirectory=/path/to/Clone-PVE-MGMT
ExecStart=/usr/bin/node server/dist/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# 安全设置
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/pve-manager /var/log/pve-manager

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pve-manager
```

---

## 🚨 第六步：安全监控和告警

### 1. 失败登录监控
```bash
# 安装fail2ban
sudo apt install fail2ban

# 创建PVE管理器过滤规则
cat > /etc/fail2ban/filter.d/pve-manager.conf << 'EOF'
[Definition]
failregex = ^.*Authentication failed for.*<HOST>.*$
            ^.*Invalid credentials from.*<HOST>.*$
            ^.*Unauthorized access attempt from.*<HOST>.*$
ignoreregex =
EOF

# 创建jail配置
cat > /etc/fail2ban/jail.d/pve-manager.conf << 'EOF'
[pve-manager]
enabled = true
port = 3000
filter = pve-manager
logpath = /var/log/pve-manager/auth.log
maxretry = 3
bantime = 3600
findtime = 600
EOF

sudo systemctl restart fail2ban
```

### 2. 系统监控
```bash
# 安装监控工具
sudo apt install htop iotop nethogs

# 创建监控脚本
cat > /usr/local/bin/pve-manager-monitor.sh << 'EOF'
#!/bin/bash
# 检查服务状态
if ! systemctl is-active --quiet pve-manager; then
    echo "WARNING: PVE Manager service is not running" | mail -s "PVE Manager Alert" admin@yourdomain.com
fi

# 检查磁盘空间
DISK_USAGE=$(df /var/lib/pve-manager | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "WARNING: Disk usage is ${DISK_USAGE}%" | mail -s "PVE Manager Disk Alert" admin@yourdomain.com
fi
EOF

sudo chmod +x /usr/local/bin/pve-manager-monitor.sh

# 每5分钟检查一次
echo "*/5 * * * * /usr/local/bin/pve-manager-monitor.sh" | sudo crontab -
```

---

## 🔍 第七步：安全审计

### 1. 定期安全检查
```bash
# 创建安全审计脚本
cat > /usr/local/bin/pve-manager-security-audit.sh << 'EOF'
#!/bin/bash
echo "=== PVE Manager Security Audit Report ===="
echo "Date: $(date)"
echo

echo "1. File Permissions Check:"
ls -la /path/to/Clone-PVE-MGMT/.env
ls -la /var/lib/pve-manager/data/

echo "2. Service Status:"
systemctl status pve-manager --no-pager -l

echo "3. Recent Login Attempts:"
tail -n 20 /var/log/pve-manager/auth.log

echo "4. Disk Usage:"
df -h /var/lib/pve-manager

echo "5. Network Connections:"
ss -tulpn | grep :3000

echo "6. Fail2ban Status:"
sudo fail2ban-client status pve-manager
EOF

sudo chmod +x /usr/local/bin/pve-manager-security-audit.sh

# 每周生成审计报告
echo "0 0 * * 0 /usr/local/bin/pve-manager-security-audit.sh | mail -s 'PVE Manager Security Audit' admin@yourdomain.com" | sudo crontab -
```

### 2. 漏洞扫描
```bash
# 定期更新系统
sudo apt update && sudo apt upgrade -y

# 安装并运行安全扫描
sudo apt install lynis
sudo lynis audit system
```

---

## ⚠️ 安全警告和最佳实践

### 🚫 严禁事项
- **不要**在生产环境中使用默认密码
- **不要**将配置文件提交到版本控制系统
- **不要**在日志中记录敏感信息
- **不要**使用HTTP协议（生产环境必须HTTPS）
- **不要**以root用户运行服务

### ✅ 推荐做法
- **定期**更换密码和密钥
- **使用**强密码和双因素认证
- **启用**所有安全日志记录
- **设置**自动备份和恢复
- **监控**系统性能和安全事件
- **定期**进行安全审计和漏洞扫描

### 🔄 维护周期
- **每日**: 检查系统日志和监控告警
- **每周**: 运行安全审计报告
- **每月**: 更新系统和依赖包
- **每季度**: 更换密码和证书
- **每年**: 全面安全审计和渗透测试

---

## 📞 安全事件响应

如发现安全问题：

1. **立即断开网络连接**
2. **保留系统日志和现场**
3. **通知相关管理员**
4. **分析事件原因**
5. **修复安全漏洞**
6. **恢复系统服务**
7. **更新安全策略**

---

## 🎓 总结

遵循此安全部署指南，您的PVE管理系统将具备：

- 🔐 **强密码和加密通信**
- 🛡️ **最小权限访问控制**
- 📊 **完整的日志监控**
- 🚨 **实时安全告警**
- 🔄 **定期安全审计**

**记住：安全是一个持续的过程，而不是一次性的设置！** 🔒