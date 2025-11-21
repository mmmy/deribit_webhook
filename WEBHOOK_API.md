# Webhook API 接口文档

## 概述

本接口用于接收 TradingView 策略信号，并将其转换为 Deribit 期权交易订单。

## 接口地址

```
POST /webhook/signal
```

## TypeScript 接口定义

### 请求 Payload

```typescript
interface WebhookSignalPayload {
  accountName: string; // 账户名，对应 apikeys 配置中的 name
  side: string; // 交易方向: buy/sell
  exchange: string; // 交易所名称
  period: string; // K线周期
  marketPosition: string; // 当前市场仓位: long/short/flat
  prevMarketPosition: string; // 之前的市场仓位
  symbol: string; // 交易对符号
  price: string; // 当前价格
  timestamp: string; // 时间戳
  size: string; // 订单数量/合约数
  positionSize: string; // 当前仓位大小
  id: string; // 策略订单ID
  alertMessage?: string; // 警报消息
  comment?: string; // 注释
  qtyType: "fixed" | "cash"; // 数量类型
}
```

### 响应格式

```typescript
interface WebhookResponse {
  success: boolean;
  message: string;
  data?: {
    orderId?: string;
    instrumentName?: string;
    executedQuantity?: number;
    executedPrice?: number;
  };
  error?: string;
  timestamp: string;
  requestId?: string;
}
```

## 请求示例

### TradingView Webhook 配置

在 TradingView 警报中使用以下 JSON 格式：

```json
{
  "accountName": "account_1",
  "side": "{{strategy.order.action}}",
  "exchange": "{{exchange}}",
  "period": "5",
  "marketPosition": "{{strategy.market_position}}",
  "prevMarketPosition": "{{strategy.prev_market_position}}",
  "symbol": "{{ticker}}",
  "price": "{{close}}",
  "timestamp": "{{timenow}}",
  "size": "{{strategy.order.contracts}}",
  "positionSize": "{{strategy.position_size}}",
  "id": "{{strategy.order.id}}",
  "alertMessage": "{{strategy.order.alert_message}}",
  "comment": "{{strategy.order.comment}}",
  "qtyType": "fixed"
}
```

### cURL 测试示例

```bash
curl -X POST http://localhost:3000/webhook/signal \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "account_1",
    "side": "buy",
    "exchange": "BINANCE",
    "period": "5",
    "marketPosition": "long",
    "prevMarketPosition": "flat",
    "symbol": "BTCUSDT",
    "price": "43250.50",
    "timestamp": "1642678920000",
    "size": "1",
    "positionSize": "1",
    "id": "test_order_123",
    "alertMessage": "BTC Long Signal",
    "comment": "Strategy triggered buy signal",
    "qtyType": "fixed"
  }'
```

## 响应示例

### 成功响应

```json
{
  "success": true,
  "message": "Successfully executed open buy order for 1 contracts",
  "data": {
    "orderId": "mock_order_1753075266352",
    "instrumentName": "BTC-25JUL25-50000-C",
    "executedQuantity": 1,
    "executedPrice": 43250.5
  },
  "timestamp": "2025-07-21T05:21:06.353Z",
  "requestId": "req_1753075266352_abc123def"
}
```

### 错误响应

```json
{
  "success": false,
  "message": "Account not found: invalid_account",
  "error": "Account not found: invalid_account",
  "timestamp": "2025-07-21T05:21:06.353Z",
  "requestId": "req_1753075266352_abc123def"
}
```

## 字段验证

### 必需字段

- `accountName` - 必须存在于配置文件中
- `side` - 交易方向
- `symbol` - 交易对符号
- `size` - 订单数量

### 可选字段

- 其他所有字段都是可选的，但建议提供完整信息以便策略分析

## 交易逻辑

### 仓位判断

服务会根据 `marketPosition` 和 `prevMarketPosition` 自动判断开仓/平仓：

- `flat` → `long/short`: 开仓
- `long/short` → `flat`: 平仓
- `long` → `short` 或 `short` → `long`: 先平仓再开仓

### 期权合约选择

当前实现为占位符函数，会自动生成模拟的期权合约名称：

- 格式: `{CURRENCY}-{EXPIRY}-{STRIKE}-{TYPE}`
- 示例: `BTC-25JUL25-50000-C`

## 错误码

| HTTP 状态码 | 错误类型   | 说明                   |
| ----------- | ---------- | ---------------------- |
| 200         | 成功       | 交易信号处理成功       |
| 400         | 请求错误   | 缺少必需字段或格式错误 |
| 404         | 账户不存在 | 指定的账户名未找到     |
| 500         | 服务器错误 | 认证失败或交易执行错误 |

### Delta 字段说明

Delta 管理系统中包含两种关键 Delta 值：

#### 目标Delta(2)
- **定义**: 期望达到的 Delta 值，用于策略规划
- **范围**: -1 到 1
- **用途**: 
  - 设置期权投资组合的风险敞口目标
  - 指导仓位调整的方向和幅度
  - 与 TradingView 策略信号集成

#### 移仓Delta(1)
- **定义**: 在仓位调整过程中要达成的 Delta 值
- **范围**: -1 到 1
- **用途**:
  - 逐步调整仓位到目标 Delta
  - 控制每次调整的幅度
  - 管理调整过程中的风险暴露

#### Delta 值解释
- **正值 (0 到 1)**: 看涨敞口，价格上涨时盈利
- **负值 (-1 到 0)**: 看跌敞口，价格下跌时盈利
- **接近 0**: 中性策略，对价格变化不敏感
- **接近 1 或 -1**: 高杠杆方向性头寸

#### 应用示例
```json
{
  "target_delta": 0.5,      // 目标Delta(2): 中等看涨敞口
  "move_position_delta": 0.3, // 移仓Delta(1): 每次调整0.3
  "instrument_name": "BTC-25JUL25-50000-C", // BTC看涨期权
  "record_type": "position"  // 仓位记录类型
}
```

## 开发模式

设置环境变量 `USE_MOCK_MODE=true` 启用模拟模式：

- 跳过真实的 Deribit 认证
- 返回模拟的交易结果
- 适用于开发和测试环境

## Deribit API 参考文档

### 环境配置

- **测试环境**: `test.deribit.com`
- **生产环境**: `www.deribit.com`
- **API 版本**: v2

### 认证接口

#### OAuth 2.0 认证

- **`public/auth`** - 获取访问令牌
  - 支持 client_credentials、client_signature、refresh_token 方式
  - 返回 access_token、过期时间和 refresh_token

#### 连接测试

- **`public/get_time`** - 获取服务器时间
- **`public/test`** - 测试 API 连接状态

### 市场数据接口（公开，无需认证）

#### 基础市场信息

- **`public/get_instruments`** - 获取可交易工具列表
  - 参数: currency (BTC/ETH), kind (option/future), expired (是否包含过期)
- **`public/get_currencies`** - 获取支持的货币列表

#### 实时行情数据

- **`public/get_order_book`** - 获取订单簿
  - 参数: instrument_name, depth (订单簿深度)
- **`public/ticker`** - 获取实时价格信息
  - 参数: instrument_name
- **`public/get_last_trades`** - 获取最新交易记录
  - 参数: instrument_name, count, include_old

#### 指数和统计数据

- **`public/get_index`** - 获取指数价格
- **`public/get_historical_volatility`** - 获取历史波动率
- **`public/get_funding_chart_data`** - 获取资金费率图表数据

### 订单管理接口（私有，需要认证）

#### 下单接口

- **`private/buy`** - 买入期权
  - 参数: instrument_name, amount, type (limit/market), price, time_in_force
- **`private/sell`** - 卖出期权
  - 参数: instrument_name, amount, type (limit/market), price, time_in_force

#### 订单操作

- **`private/edit`** - 修改订单
  - 参数: order_id, amount, price
- **`private/cancel`** - 取消单个订单
  - 参数: order_id
- **`private/cancel_all`** - 取消所有订单
  - 参数: 可选 instrument_name, currency, kind
- **`private/cancel_all_by_currency`** - 按货币取消所有订单
- **`private/cancel_all_by_instrument`** - 按工具取消所有订单

### 账户管理接口（私有）

#### 账户信息

- **`private/get_account_summary`** - 获取账户摘要
  - 参数: currency, extended (是否包含扩展信息)
- **`private/get_position`** - 获取特定持仓
  - 参数: instrument_name
- **`private/get_positions`** - 获取所有持仓
  - 参数: currency, kind

#### 订单和交易历史

- **`private/get_open_orders`** - 获取未成交订单
  - 参数: currency, kind, type
- **`private/get_order_history`** - 获取订单历史
  - 参数: currency, instrument_name, count, offset
- **`private/get_user_trades_by_currency`** - 按货币获取交易历史
- **`private/get_user_trades_by_instrument`** - 按工具获取交易历史

#### 保证金和风险管理

- **`private/get_margins`** - 获取保证金信息
- **`private/set_portfolio_margining`** - 设置投资组合保证金

### WebSocket 订阅接口

#### 市场数据订阅

- **`book.{instrument}.{group}.{depth}`** - 订阅订单簿变化
  - 例: `book.BTC-25JUL25-50000-C.none.10`
- **`trades.{instrument}.{interval}`** - 订阅交易流
  - 例: `trades.BTC-25JUL25-50000-C.100ms`
- **`ticker.{instrument}`** - 订阅价格变动
  - 例: `ticker.BTC-25JUL25-50000-C`

#### 用户数据订阅

- **`user.portfolio.{currency}`** - 订阅投资组合变化
  - 例: `user.portfolio.BTC`
- **`user.orders.{instrument}`** - 订阅订单状态变化
- **`user.trades.{instrument}`** - 订阅用户交易
- **`user.changes.{instrument}`** - 订阅用户数据变化

### 期权特有参数

#### 期权工具命名规则

格式: `{CURRENCY}-{EXPIRY}-{STRIKE}-{TYPE}`

- CURRENCY: BTC, ETH, SOL 等
- EXPIRY: 到期日期 (例: 25JUL25)
- STRIKE: 行权价格 (例: 50000)
- TYPE: C (看涨) 或 P (看跌)

示例: `BTC-25JUL25-50000-C` (BTC 2025 年 7 月 25 日到期，行权价 50000 的看涨期权)

#### 期权特有字段

- `greeks` - 希腊字母 (delta, gamma, theta, vega)
- `implied_volatility` - 隐含波动率
- `time_value` - 时间价值
- `intrinsic_value` - 内在价值

### Deribit API 错误处理

#### 常见错误代码

- `10001` - 认证失败
- `10009` - 订单被拒绝
- `10010` - 余额不足
- `11029` - 工具不存在
- `11044` - 价格超出限制

#### 限流规则

- API 调用频率限制
- 订单/成交量比率监控 (OTV)
- WebSocket 连接数限制

### 最佳实践

1. **使用 WebSocket**: 优先使用 WebSocket 获取实时数据，减少 API 轮询
2. **错误重试**: 实现指数退避重试机制
3. **限流管理**: 合理控制 API 调用频率
4. **测试环境**: 先在测试环境验证功能
5. **安全性**: 妥善保管 API 密钥，使用适当的权限范围

## 相关接口

### Delta 管理接口

Delta 管理系统用于期权交易的风险管理和仓位调整。

#### 获取 Delta 记录

```
GET /api/delta/:account
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 1,
        "account_name": "account_1",
        "instrument_name": "BTC-25JUL25-50000-C",
        "record_type": "position",
        "target_delta": 0.5,
        "move_position_delta": 0.3,
        "min_expire_days": 7,
        "tv_id": 12345,
        "created_at": "2025-06-20T10:00:00Z",
        "updated_at": "2025-06-20T10:00:00Z"
      }
    ],
    "summary": {
      "record_count": 5,
      "position_count": 3,
      "order_count": 2,
      "total_delta": 1.25
    }
  },
  "timestamp": "2025-06-20T12:00:00Z"
}
```

#### 创建 Delta 记录

```
POST /api/delta/:account
```

**请求体**:
```json
{
  "instrument_name": "BTC-25JUL25-50000-C",
  "target_delta": 0.5,
  "move_position_delta": 0.3,
  "min_expire_days": 7,
  "tv_id": 12345,
  "record_type": "position"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "Delta record created successfully",
  "data": {
    "id": 6,
    "account_name": "account_1",
    "instrument_name": "BTC-25JUL25-50000-C",
    "record_type": "position",
    "target_delta": 0.5,
    "move_position_delta": 0.3,
    "min_expire_days": 7,
    "tv_id": 12345,
    "created_at": "2025-06-20T12:00:00Z",
    "updated_at": "2025-06-20T12:00:00Z"
  },
  "timestamp": "2025-06-20T12:00:00Z"
}
```

#### 更新 Delta 记录

```
PUT /api/delta/:account/:id
```

**请求体**:
```json
{
  "target_delta": 0.6,
  "move_position_delta": 0.4,
  "min_expire_days": 10
}
```

#### 删除 Delta 记录

```
DELETE /api/delta/:account/:id
```

#### 获取实时数据

```
GET /api/delta/:account/live-data
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "positions": [
      {
        "instrument_name": "BTC-25JUL25-50000-C",
        "size": 2,
        "direction": "buy",
        "average_price": 0.1250,
        "mark_price": 0.1300,
        "delta": 1.2,
        "roi": 4.0
      }
    ],
    "openOrders": [
      {
        "order_id": "1234567890",
        "instrument_name": "BTC-25JUL25-49000-P",
        "direction": "sell",
        "amount": 1,
        "price": 0.0500,
        "order_type": "limit"
      }
    ]
  },
  "mockMode": false,
  "timestamp": "2025-06-20T12:00:00Z"
}
```

### 仓位管理接口

#### 获取仓位信息

```
GET /api/positions/:account/:currency
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "currency": "BTC",
    "positions": [
      {
        "instrument_name": "BTC-25JUL25-50000-C",
        "size": 2,
        "direction": "buy",
        "average_price": 0.1250,
        "mark_price": 0.1300,
        "delta": 1.2,
        "vega": 0.05,
        "theta": -0.02,
        "realized_pnl": 0.0150,
        "unrealized_pnl": 0.0100,
        "funding": 0.0010
      }
    ],
    "total_delta": 1.2,
    "total_value": 0.2600
  },
  "timestamp": "2025-06-20T12:00:00Z"
}
```

#### 调整仓位

```
POST /api/positions/:account/adjust
```

**请求体**:
```json
{
  "target_delta": 0.8,
  "adjustment_type": "hedge"
}
```

### 交易服务状态

```
GET /api/trading/status
```

查看期权交易服务的当前状态和配置信息。

### 认证测试

```
GET /api/auth/test?account=account_1
```

测试指定账户的认证状态。
