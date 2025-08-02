#!/bin/bash

# Deribit Webhook 自动部署脚本
# 适用于 Ubuntu 20.04+ 服务器

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "请不要使用root用户运行此脚本"
        exit 1
    fi
}

# 检查系统版本
check_system() {
    log_info "检查系统版本..."
    
    if [[ ! -f /etc/os-release ]]; then
        log_error "无法检测系统版本"
        exit 1
    fi
    
    . /etc/os-release
    
    if [[ "$ID" != "ubuntu" ]]; then
        log_error "此脚本仅支持Ubuntu系统"
        exit 1
    fi
    
    if [[ "${VERSION_ID}" < "20.04" ]]; then
        log_error "需要Ubuntu 20.04或更高版本"
        exit 1
    fi
    
    log_success "系统检查通过: Ubuntu ${VERSION_ID}"
}

# 更新系统
update_system() {
    log_info "更新系统包..."
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y curl wget git vim htop build-essential
    log_success "系统更新完成"
}

# 安装Node.js
install_nodejs() {
    log_info "安装Node.js 18.x..."
    
    # 检查是否已安装
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_warning "Node.js已安装: $NODE_VERSION"
        return
    fi
    
    # 安装Node.js
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # 验证安装
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    log_success "Node.js安装完成: $NODE_VERSION, npm: $NPM_VERSION"
}

# 安装PM2
install_pm2() {
    log_info "安装PM2进程管理器..."
    
    if command -v pm2 &> /dev/null; then
        PM2_VERSION=$(pm2 --version)
        log_warning "PM2已安装: $PM2_VERSION"
        return
    fi
    
    sudo npm install -g pm2
    PM2_VERSION=$(pm2 --version)
    log_success "PM2安装完成: $PM2_VERSION"
}

# 克隆代码
clone_repository() {
    log_info "克隆代码仓库..."
    
    APP_DIR="$HOME/deribit_webhook"
    
    if [[ -d "$APP_DIR" ]]; then
        log_warning "目录已存在，更新代码..."
        cd "$APP_DIR"
        git pull origin main
    else
        log_info "克隆新仓库..."
        cd "$HOME"
        git clone https://github.com/mmmy/deribit_webhook.git
        cd "$APP_DIR"
    fi
    
    log_success "代码准备完成"
}

# 安装依赖
install_dependencies() {
    log_info "安装项目依赖..."
    
    cd "$HOME/deribit_webhook"
    npm install
    
    log_success "依赖安装完成"
}

# 配置环境
setup_environment() {
    log_info "配置环境文件..."
    
    cd "$HOME/deribit_webhook"
    
    # 复制环境配置文件
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            log_info "已创建.env文件，请编辑配置"
        else
            log_warning "未找到.env.example文件"
        fi
    else
        log_warning ".env文件已存在"
    fi
    
    # 复制API密钥配置文件
    if [[ ! -f config/apikeys.yml ]]; then
        if [[ -f config/apikeys.example.yml ]]; then
            cp config/apikeys.example.yml config/apikeys.yml
            log_info "已创建apikeys.yml文件，请编辑配置"
        else
            log_warning "未找到apikeys.example.yml文件"
        fi
    else
        log_warning "apikeys.yml文件已存在"
    fi
    
    # 设置文件权限
    chmod 600 .env 2>/dev/null || true
    chmod 600 config/apikeys.yml 2>/dev/null || true
    
    log_success "环境配置完成"
}

# 构建应用
build_application() {
    log_info "构建应用..."
    
    cd "$HOME/deribit_webhook"
    npm run build
    
    if [[ ! -d "dist" ]]; then
        log_error "构建失败，未找到dist目录"
        exit 1
    fi
    
    log_success "应用构建完成"
}

# 创建PM2配置
create_pm2_config() {
    log_info "创建PM2配置文件..."
    
    cd "$HOME/deribit_webhook"
    
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'deribit-webhook',
    script: 'dist/index.js',
    cwd: process.cwd(),
    instances: 1,
    exec_mode: 'fork',
    
    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
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
EOF
    
    log_success "PM2配置文件创建完成"
}

# 创建日志目录
create_log_directory() {
    log_info "创建日志目录..."
    
    mkdir -p "$HOME/logs"
    mkdir -p "$HOME/deribit_webhook/logs"
    
    log_success "日志目录创建完成"
}

# 启动应用
start_application() {
    log_info "启动应用..."
    
    cd "$HOME/deribit_webhook"
    
    # 停止现有进程
    pm2 delete deribit-webhook 2>/dev/null || true
    
    # 启动新进程
    pm2 start ecosystem.config.js
    
    # 保存PM2配置
    pm2 save
    
    # 设置开机自启
    pm2 startup | grep -E '^sudo' | bash || true
    
    log_success "应用启动完成"
}

# 验证部署
verify_deployment() {
    log_info "验证部署..."
    
    # 等待应用启动
    sleep 5
    
    # 检查PM2状态
    if pm2 describe deribit-webhook > /dev/null 2>&1; then
        log_success "PM2进程运行正常"
    else
        log_error "PM2进程启动失败"
        return 1
    fi
    
    # 检查健康端点
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_success "健康检查通过"
    else
        log_warning "健康检查失败，请检查应用配置"
    fi
    
    log_success "部署验证完成"
}

# 显示部署信息
show_deployment_info() {
    log_info "部署信息:"
    echo "=================================="
    echo "应用目录: $HOME/deribit_webhook"
    echo "日志目录: $HOME/logs"
    echo "配置文件: $HOME/deribit_webhook/.env"
    echo "API密钥: $HOME/deribit_webhook/config/apikeys.yml"
    echo "健康检查: http://localhost:3000/health"
    echo "Webhook端点: http://localhost:3000/webhook/signal"
    echo "=================================="
    echo ""
    echo "常用命令:"
    echo "查看状态: pm2 status"
    echo "查看日志: pm2 logs deribit-webhook"
    echo "重启应用: pm2 restart deribit-webhook"
    echo "停止应用: pm2 stop deribit-webhook"
    echo ""
    log_warning "请记得编辑配置文件并重启应用!"
}

# 主函数
main() {
    log_info "开始部署Deribit Webhook服务..."
    
    check_root
    check_system
    update_system
    install_nodejs
    install_pm2
    clone_repository
    install_dependencies
    setup_environment
    build_application
    create_pm2_config
    create_log_directory
    start_application
    verify_deployment
    show_deployment_info
    
    log_success "部署完成!"
}

# 运行主函数
main "$@"
