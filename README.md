# Deribit Options Trading Microservice

一个基于Node.js + TypeScript的Deribit期权交易微服务，实现了完整的OAuth 2.0认证和期权交易功能。

## 📋 功能特性

- ✅ **OAuth 2.0认证** - 支持client_credentials授权模式
- ✅ **多账户管理** - 支持多个API密钥配置
- ✅ **测试/生产环境** - 自动切换测试和生产环境
- ✅ **令牌管理** - 自动令牌刷新和过期处理
- ✅ **期权交易API** - 完整的期权交易接口
- ✅ **Mock模式** - 开发测试模式，无需网络连接
- ✅ **错误处理** - 完善的错误处理和重试机制

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置API密钥
复制并编辑配置文件：
```bash
cp config/apikeys.example.yml config/apikeys.yml
```

编辑 `config/apikeys.yml`，填入你的Deribit API凭据：
```yaml
accounts:
  - name: account_1
    description: "Primary trading account"
    clientId: "your_client_id_here"
    clientSecret: "your_client_secret_here"
    enabled: true
    testMode: true
    grantType: "client_credentials"
```

### 3. 环境配置
编辑 `.env` 文件：
```env
PORT=3000
USE_MOCK_MODE=true  # 开发模式使用mock
USE_TEST_ENVIRONMENT=true
```

### 4. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 📡 API接口

### 核心接口
- **`POST /webhook/signal`** - TradingView webhook信号接收 (主要功能)
- **`GET /api/trading/status`** - 交易服务状态

### 系统接口
- **`GET /health`** - 健康检查
- **`GET /api/status`** - 服务状态
- **`GET /api/auth/test`** - 认证测试
- **`GET /api/instruments`** - 获取期权工具
- **`GET /api/account/:currency`** - 获取账户信息

详细的Webhook API文档请参考：`WEBHOOK_API.md`

## 🔧 开发模式

项目支持Mock模式，在网络受限环境下可以进行开发测试：

1. 设置 `USE_MOCK_MODE=true` 在 `.env` 文件中
2. Mock模式会模拟所有Deribit API响应
3. 支持完整的认证流程测试

## 📁 项目结构

```
src/
├── config/          # 配置加载器
├── services/        # 业务服务
│   ├── auth.ts      # 认证服务
│   ├── deribit-client.ts  # Deribit客户端
│   └── mock-deribit.ts    # Mock客户端
├── types/           # TypeScript类型定义
└── index.ts         # 主入口文件

config/
├── apikeys.yml      # API密钥配置
└── apikeys.example.yml  # 配置模板
```

## 🔐 安全说明

- API密钥文件 `config/apikeys.yml` 已加入 `.gitignore`
- 生产环境请设置 `testMode: false`
- 建议使用环境变量管理敏感信息

## 📚 Deribit API文档

详细的API接口文档请参考：`DERIBIT_API_ENDPOINTS.md`

## 🎯 已实现的核心功能

1. **OAuth 2.0认证流程** ✅
2. **Token自动刷新** ✅  
3. **多账户支持** ✅
4. **Webhook信号接收** ✅
5. **交易信号解析** ✅
6. **占位符交易执行** ✅
7. **错误处理和重试** ✅
8. **Mock模式开发** ✅
9. **配置文件管理** ✅

## 🚧 待实现功能

- [ ] 真实期权交易策略实现
- [ ] 期权合约自动选择算法
- [ ] WebSocket实时数据订阅
- [ ] 完整的订单管理系统
- [ ] 风险管理和仓位控制
- [ ] 日志系统和监控
- [ ] 单元测试覆盖

## 📄 License

MIT