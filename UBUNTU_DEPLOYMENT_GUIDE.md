# Ubuntu服务器部署指南

## 📋 概述

本文档详细说明如何将Deribit期权交易微服务部署到Ubuntu服务器上，包括环境配置、依赖安装、服务配置和监控设置。

## 🖥️ 系统要求

### 最低配置
- **操作系统**: Ubuntu 20.04 LTS 或更高版本
- **内存**: 2GB RAM (推荐4GB+)
- **存储**: 20GB 可用空间
- **网络**: 稳定的互联网连接
- **端口**: 3000 (可配置)

### 推荐配置
- **CPU**: 2核心或更多
- **内存**: 4GB RAM 或更多
- **存储**: SSD 50GB+
- **网络**: 低延迟连接

## 🚀 快速部署

### 1. 系统更新
```bash
# 更新系统包
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git vim htop
```

### 2. 安装Node.js
```bash
# 安装Node.js 18.x (推荐LTS版本)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应显示 v18.x.x
npm --version   # 应显示 9.x.x
```

### 3. 安装PM2 (进程管理器)
```bash
# 全局安装PM2
sudo npm install -g pm2

# 验证安装
pm2 --version
```

### 4. 创建应用用户
```bash
# 创建专用用户
sudo useradd -m -s /bin/bash deribit
sudo usermod -aG sudo deribit

# 切换到应用用户
sudo su - deribit
```

## 📦 应用部署

### 1. 克隆代码仓库
```bash
# 进入用户目录
cd /home/deribit

# 克隆仓库
git clone https://github.com/mmmy/deribit_webhook.git
cd deribit_webhook

# 检查分支
git branch -a
git checkout main
```

### 2. 安装依赖
```bash
# 安装项目依赖
npm install

# 如果遇到权限问题，使用
npm install --unsafe-perm
```

### 3. 配置环境
```bash
# 复制环境配置文件
cp .env.example .env

# 编辑环境配置
vim .env
```

**重要配置项**:
```bash
# 服务器配置
PORT=3000
NODE_ENV=production

# Deribit API配置
USE_TEST_ENVIRONMENT=false  # 生产环境设为false
USE_MOCK_MODE=false         # 生产环境设为false

# 日志配置
LOG_LEVEL=info

# API密钥文件路径
API_KEY_FILE=./config/apikeys.yml
```

### 4. 配置API密钥
```bash
# 复制API密钥配置文件
cp config/apikeys.example.yml config/apikeys.yml

# 编辑API密钥配置
vim config/apikeys.yml
```

**配置示例**:
```yaml
accounts:
  - name: production_account
    description: "生产环境交易账户"
    clientId: "your_production_client_id"
    clientSecret: "your_production_client_secret"
    enabled: true
    grantType: "client_credentials"
    scope: ""

settings:
  connectionTimeout: 30
  maxReconnectAttempts: 5
  rateLimitPerMinute: 60
```

### 5. 构建应用
```bash
# 构建TypeScript代码
npm run build

# 验证构建结果
ls -la dist/
```

## 🔧 PM2 配置

### 1. 创建PM2配置文件
```bash
# 创建PM2配置文件
vim ecosystem.config.js
```

**配置内容**:
```javascript
module.exports = {
  apps: [{
    name: 'deribit-webhook',
    script: 'dist/index.js',
    cwd: '/home/deribit/deribit_webhook',
    instances: 1,
    exec_mode: 'fork',
    
    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // 日志配置
    log_file: '/home/deribit/logs/combined.log',
    out_file: '/home/deribit/logs/out.log',
    error_file: '/home/deribit/logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // 重启配置
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    max_restarts: 10,
    min_uptime: '10s',
    
    // 内存限制
    max_memory_restart: '500M',
    
    // 自动重启
    autorestart: true,
    
    // 其他配置
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000
  }]
};
```

### 2. 创建日志目录
```bash
# 创建日志目录
mkdir -p /home/deribit/logs
```

### 3. 启动应用
```bash
# 使用PM2启动应用
pm2 start ecosystem.config.js

# 查看应用状态
pm2 status

# 查看日志
pm2 logs deribit-webhook

# 查看监控信息
pm2 monit
```

## 🔒 安全配置

### 1. 防火墙设置
```bash
# 启用UFW防火墙
sudo ufw enable

# 允许SSH
sudo ufw allow ssh

# 允许应用端口
sudo ufw allow 3000

# 查看防火墙状态
sudo ufw status
```

### 2. SSL证书 (可选)
```bash
# 安装Certbot
sudo apt install -y certbot

# 如果使用Nginx反向代理
sudo apt install -y python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com
```

### 3. 文件权限
```bash
# 设置正确的文件权限
chmod 600 config/apikeys.yml
chmod 644 .env
chmod -R 755 dist/
```

## 🔄 自动启动配置

### 1. PM2 开机自启
```bash
# 保存当前PM2进程列表
pm2 save

# 生成开机启动脚本
pm2 startup

# 按照提示执行生成的命令 (通常需要sudo权限)
```

### 2. 验证自动启动
```bash
# 重启服务器测试
sudo reboot

# 重启后检查服务状态
pm2 status
```

## 📊 监控和维护

### 1. 健康检查
```bash
# 检查应用状态
curl http://localhost:3000/health

# 检查API状态
curl http://localhost:3000/api/status
```

### 2. 日志管理
```bash
# 查看实时日志
pm2 logs deribit-webhook --lines 100

# 清理日志
pm2 flush

# 设置日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 3. 性能监控
```bash
# 查看系统资源使用
htop

# 查看PM2监控
pm2 monit

# 查看应用内存使用
pm2 show deribit-webhook
```

## 🔄 更新部署

### 1. 代码更新
```bash
# 进入项目目录
cd /home/deribit/deribit_webhook

# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重新构建
npm run build

# 重启应用
pm2 restart deribit-webhook
```

### 2. 零停机更新
```bash
# 使用PM2的reload功能
pm2 reload deribit-webhook

# 或者使用graceful restart
pm2 gracefulReload deribit-webhook
```

## 🚨 故障排除

### 1. 常见问题

**端口被占用**:
```bash
# 查看端口使用情况
sudo netstat -tlnp | grep :3000
sudo lsof -i :3000

# 杀死占用进程
sudo kill -9 <PID>
```

**权限问题**:
```bash
# 检查文件权限
ls -la config/apikeys.yml

# 修复权限
sudo chown deribit:deribit config/apikeys.yml
chmod 600 config/apikeys.yml
```

**内存不足**:
```bash
# 检查内存使用
free -h

# 增加swap空间
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 2. 日志分析
```bash
# 查看错误日志
pm2 logs deribit-webhook --err

# 查看系统日志
sudo journalctl -u pm2-deribit

# 查看应用特定错误
grep -i error /home/deribit/logs/error.log
```

## 📋 部署检查清单

- [ ] 系统更新完成
- [ ] Node.js 18+ 安装
- [ ] PM2 安装配置
- [ ] 代码克隆和构建
- [ ] 环境变量配置
- [ ] API密钥配置
- [ ] 防火墙配置
- [ ] 应用启动成功
- [ ] 健康检查通过
- [ ] 自动启动配置
- [ ] 日志轮转设置
- [ ] 监控配置完成

## 🎉 部署完成

部署完成后，您的Deribit期权交易微服务将在以下地址可用：

- **健康检查**: `http://your-server:3000/health`
- **API状态**: `http://your-server:3000/api/status`
- **Webhook端点**: `http://your-server:3000/webhook/signal`

记得定期备份配置文件和监控应用状态！

## 🔧 高级配置

### 1. Nginx反向代理 (推荐)

**安装Nginx**:
```bash
sudo apt install -y nginx
```

**配置文件** (`/etc/nginx/sites-available/deribit-webhook`):
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL配置
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # 代理配置
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

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 健康检查端点
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }

    # 日志配置
    access_log /var/log/nginx/deribit-webhook.access.log;
    error_log /var/log/nginx/deribit-webhook.error.log;
}
```

**启用配置**:
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/deribit-webhook /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 2. 数据库配置 (如需要)

**安装PostgreSQL**:
```bash
sudo apt install -y postgresql postgresql-contrib

# 创建数据库和用户
sudo -u postgres psql
CREATE DATABASE deribit_webhook;
CREATE USER deribit_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE deribit_webhook TO deribit_user;
\q
```

**Redis缓存** (可选):
```bash
sudo apt install -y redis-server

# 配置Redis
sudo vim /etc/redis/redis.conf
# 设置密码: requirepass your_redis_password

sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

### 3. 备份策略

**创建备份脚本** (`/home/deribit/backup.sh`):
```bash
#!/bin/bash

BACKUP_DIR="/home/deribit/backups"
DATE=$(date +%Y%m%d_%H%M%S)
APP_DIR="/home/deribit/deribit_webhook"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份配置文件
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    "$APP_DIR/config/" \
    "$APP_DIR/.env" \
    "$APP_DIR/ecosystem.config.js"

# 备份日志
tar -czf "$BACKUP_DIR/logs_$DATE.tar.gz" \
    "/home/deribit/logs/"

# 清理30天前的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

**设置定时备份**:
```bash
# 添加执行权限
chmod +x /home/deribit/backup.sh

# 设置crontab
crontab -e
# 添加以下行 (每天凌晨2点备份)
0 2 * * * /home/deribit/backup.sh >> /home/deribit/logs/backup.log 2>&1
```

### 4. 监控告警

**安装监控工具**:
```bash
# 安装htop和iotop
sudo apt install -y htop iotop

# 安装系统监控
sudo apt install -y sysstat
```

**创建监控脚本** (`/home/deribit/monitor.sh`):
```bash
#!/bin/bash

# 检查应用状态
if ! pm2 describe deribit-webhook > /dev/null 2>&1; then
    echo "$(date): Application is down, restarting..." >> /home/deribit/logs/monitor.log
    pm2 restart deribit-webhook
fi

# 检查内存使用
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.2f", $3/$2 * 100.0)}')
if (( $(echo "$MEMORY_USAGE > 90" | bc -l) )); then
    echo "$(date): High memory usage: $MEMORY_USAGE%" >> /home/deribit/logs/monitor.log
fi

# 检查磁盘空间
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 85 ]; then
    echo "$(date): High disk usage: $DISK_USAGE%" >> /home/deribit/logs/monitor.log
fi
```

**设置监控定时任务**:
```bash
# 每5分钟检查一次
crontab -e
# 添加以下行
*/5 * * * * /home/deribit/monitor.sh
```

## 🔐 安全最佳实践

### 1. 系统安全
```bash
# 禁用root登录
sudo vim /etc/ssh/sshd_config
# 设置: PermitRootLogin no

# 更改SSH端口 (可选)
# 设置: Port 2222

# 重启SSH服务
sudo systemctl restart sshd

# 安装fail2ban防止暴力破解
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

### 2. 应用安全
```bash
# 设置环境变量权限
chmod 600 .env
chmod 600 config/apikeys.yml

# 限制日志文件权限
chmod 640 /home/deribit/logs/*.log
```

### 3. 网络安全
```bash
# 配置更严格的防火墙规则
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 📈 性能优化

### 1. Node.js优化
```bash
# 在ecosystem.config.js中添加Node.js优化参数
node_args: [
  '--max-old-space-size=512',
  '--optimize-for-size'
]
```

### 2. 系统优化
```bash
# 优化文件描述符限制
echo "deribit soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "deribit hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# 优化网络参数
echo "net.core.somaxconn = 65535" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## 🚀 生产环境清单

### 部署前检查
- [ ] 服务器资源充足
- [ ] 域名DNS配置正确
- [ ] SSL证书配置
- [ ] API密钥配置正确
- [ ] 环境变量设置为生产模式
- [ ] 防火墙规则配置
- [ ] 备份策略设置
- [ ] 监控告警配置

### 部署后验证
- [ ] 应用正常启动
- [ ] 健康检查通过
- [ ] API端点响应正常
- [ ] 日志记录正常
- [ ] 自动重启功能正常
- [ ] 备份脚本运行正常
- [ ] 监控告警正常

## 📞 技术支持

如果在部署过程中遇到问题，请检查：

1. **日志文件**: `/home/deribit/logs/`
2. **PM2状态**: `pm2 status`
3. **系统资源**: `htop`
4. **网络连接**: `curl http://localhost:3000/health`
5. **防火墙状态**: `sudo ufw status`

部署完成后，您的Deribit期权交易微服务将具备生产级别的稳定性和安全性！
