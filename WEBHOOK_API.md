# Webhook API 接口文档

## 概述
本接口用于接收TradingView策略信号，并将其转换为Deribit期权交易订单。

## 接口地址
```
POST /webhook/signal
```

## TypeScript 接口定义

### 请求 Payload
```typescript
interface WebhookSignalPayload {
  accountName: string;                    // 账户名，对应 apikeys 配置中的 name
  side: string;                          // 交易方向: buy/sell
  exchange: string;                      // 交易所名称
  period: string;                        // K线周期
  marketPosition: string;                // 当前市场仓位: long/short/flat
  prevMarketPosition: string;            // 之前的市场仓位
  symbol: string;                        // 交易对符号
  price: string;                         // 当前价格
  timestamp: string;                     // 时间戳
  size: string;                          // 订单数量/合约数
  positionSize: string;                  // 当前仓位大小
  id: string;                           // 策略订单ID
  alertMessage?: string;                 // 警报消息
  comment?: string;                      // 注释
  qtyType: 'fixed' | 'percent' | 'contracts'; // 数量类型
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
在TradingView警报中使用以下JSON格式：

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

| HTTP状态码 | 错误类型 | 说明 |
|------------|----------|------|
| 200 | 成功 | 交易信号处理成功 |
| 400 | 请求错误 | 缺少必需字段或格式错误 |
| 404 | 账户不存在 | 指定的账户名未找到 |
| 500 | 服务器错误 | 认证失败或交易执行错误 |

## 开发模式

设置环境变量 `USE_MOCK_MODE=true` 启用模拟模式：
- 跳过真实的Deribit认证
- 返回模拟的交易结果
- 适用于开发和测试环境

## 相关接口

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