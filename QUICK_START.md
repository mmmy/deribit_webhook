# 🚀 快速部署指南

## 一键部署 (推荐)

### 1. 下载并运行部署脚本

```bash
# 下载部署脚本
wget https://raw.githubusercontent.com/mmmy/deribit_webhook/main/deploy.sh

# 添加执行权限
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

### 2. 配置 API 密钥

```bash
# 编辑API密钥配置
vim ~/deribit_webhook/config/apikeys.yml

# 配置示例
accounts:
  - name: your_account
    clientId: "your_client_id"
    clientSecret: "your_client_secret"
    enabled: true
```

### 3. 配置环境变量

```bash
# 编辑环境配置
vim ~/deribit_webhook/.env

# 重要配置
NODE_ENV=production
USE_MOCK_MODE=false
USE_TEST_ENVIRONMENT=false
```

### 4. 重启应用

```bash
pm2 restart deribit-webhook
```

## 手动部署

### 1. 系统准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git vim
```

### 2. 安装 Node.js

```bash
# 安装Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PM2
sudo npm install -g pm2
```

### 3. 部署应用

```bash
# 克隆代码
git clone https://github.com/mmmy/deribit_webhook.git
cd deribit_webhook

# 安装依赖
npm install

# 构建应用
npm run build

# 配置文件
cp .env.example .env
cp config/apikeys.example.yml config/apikeys.yml

# 启动应用
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 验证部署

### 检查服务状态

```bash
# 查看PM2状态
pm2 status

# 查看应用日志
pm2 logs deribit-webhook

# 健康检查
curl http://localhost:3000/health
```

### 预期响应

```json
{
  "status": "healthy",
  "timestamp": "2025-08-01T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

## 常用命令

### PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs deribit-webhook

# 重启应用
pm2 restart deribit-webhook

# 停止应用
pm2 stop deribit-webhook

# 删除应用
pm2 delete deribit-webhook
```

### 应用管理

```bash
# 更新代码
cd ~/deribit_webhook
git pull origin main
npm install
npm run build
pm2 restart deribit-webhook

# 查看配置
cat ~/deribit_webhook/.env
cat ~/deribit_webhook/config/apikeys.yml
```

## 测试部署

### 1. 发送测试请求

```bash
curl -X POST http://localhost:3000/webhook/signal \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "your_account",
    "side": "buy",
    "symbol": "BTCUSDT",
    "size": "100",
    "qtyType": "cash",
    "marketPosition": "long",
    "prevMarketPosition": "flat"
  }'
```

### 2. 检查响应

预期返回成功响应或明确的错误信息。

## 故障排除

### 常见问题

**1. 端口被占用**

```bash
# 查看端口使用
sudo lsof -i :3000

# 杀死进程
sudo kill -9 <PID>
```

**2. 权限问题**

```bash
# 修复文件权限
chmod 600 ~/deribit_webhook/config/apikeys.yml
chmod 600 ~/deribit_webhook/.env
```

**3. 应用无法启动**

```bash
# 查看详细日志
pm2 logs deribit-webhook --lines 50

# 检查配置文件
pm2 show deribit-webhook
```

**4. API 连接失败**

- 检查 API 密钥配置
- 确认网络连接
- 验证 Deribit API 状态

### 日志位置

- **应用日志**: `~/deribit_webhook/logs/`
- **PM2 日志**: `~/.pm2/logs/`
- **系统日志**: `/var/log/`

## 安全建议

### 1. 防火墙配置

```bash
# 启用防火墙
sudo ufw enable

# 允许必要端口
sudo ufw allow ssh
sudo ufw allow 3000
```

### 2. 文件权限

```bash
# 保护敏感文件
chmod 600 ~/deribit_webhook/config/apikeys.yml
chmod 600 ~/deribit_webhook/.env
```

### 3. 定期更新

```bash
# 定期更新系统
sudo apt update && sudo apt upgrade

# 定期更新应用
cd ~/deribit_webhook
git pull origin main
npm install
npm run build
pm2 restart deribit-webhook
```

## 监控建议

### 1. 设置监控

```bash
# 安装监控工具
sudo apt install -y htop iotop

# 查看系统资源
htop

# 查看PM2监控
pm2 monit
```

### 2. 日志轮转

```bash
# 安装PM2日志轮转
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 生产环境建议

### 1. 使用 Nginx 反向代理

```bash
# 安装Nginx
sudo apt install -y nginx

# 配置SSL证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 2. 设置备份

```bash
# 创建备份脚本
cat > ~/backup.sh << 'EOF'
#!/bin/bash
tar -czf ~/backup_$(date +%Y%m%d).tar.gz \
  ~/deribit_webhook/config/ \
  ~/deribit_webhook/.env
EOF

# 设置定时备份
chmod +x ~/backup.sh
crontab -e
# 添加: 0 2 * * * ~/backup.sh
```

## 支持

如果遇到问题：

1. 检查应用日志：`pm2 logs deribit-webhook`
2. 验证配置文件：确保 API 密钥正确
3. 检查网络连接：确保能访问 Deribit API
4. 查看 `AGENTS.md` 了解项目架构

部署成功后，您的服务将在 `http://your-server:3000` 可用！
