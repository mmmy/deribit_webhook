# Webhook信号处理和期权开仓系统分析

## 🎯 系统概述

这个系统是一个自动化期权交易系统，接收来自TradingView的webhook信号，并根据信号参数自动在Deribit交易所执行期权交易。

## 📡 数据流程分析

### 1. 信号接收阶段 (`/webhook/signal`)

**入口**: `src/index.ts` 第169行
```typescript
app.post('/webhook/signal', async (req, res) => {
```

**处理步骤**:
1. **请求验证**: 验证请求体格式和必需字段
2. **账户验证**: 检查`accountName`是否在配置中存在
3. **信号处理**: 调用`OptionTradingService.processWebhookSignal()`

**必需字段**:
```typescript
const requiredFields = ['accountName', 'side', 'symbol', 'size'];
```

### 2. 信号解析阶段

**处理类**: `OptionTradingService`
**方法**: `processWebhookSignal(payload: WebhookSignalPayload)`

#### 2.1 账户验证和认证
```typescript
// 验证账户存在且启用
const account = this.configLoader.getAccountByName(payload.accountName);
if (!account || !account.enabled) {
  throw new Error(`Account not found or disabled: ${payload.accountName}`);
}

// 根据模式选择认证方式
const useMockMode = process.env.USE_MOCK_MODE === 'true';
if (!useMockMode) {
  await this.deribitAuth.authenticate(payload.accountName);
}
```

#### 2.2 信号解析 (`parseSignalToTradingParams`)
```typescript
// 确定交易方向
const direction = payload.side.toLowerCase() === 'buy' ? 'buy' : 'sell';

// 确定开仓/平仓动作
let action: 'open' | 'close' = 'open';
if (payload.marketPosition === 'flat' && payload.prevMarketPosition !== 'flat') {
  action = 'close'; // 平仓到无仓位
} else if (payload.marketPosition !== 'flat' && payload.prevMarketPosition === 'flat') {
  action = 'open';  // 从无仓位开仓
}
```

### 3. 期权选择阶段

#### 3.1 Delta筛选逻辑
当满足以下条件时，使用Delta筛选期权：
- `params.action === 'open'` (开仓操作)
- `payload.delta1 !== undefined` (提供了Delta目标值)
- `payload.n !== undefined` (提供了最小到期天数)

```typescript
if (params.action === 'open' && payload.delta1 !== undefined && payload.n !== undefined) {
  // 提取货币类型: BTCUSDT -> BTC, SOLUSDC -> SOL
  const currency = params.symbol.replace(/USD[TC]?/i, '').toUpperCase();
  
  // 确定期权类型: buy=call, sell=put
  const longSide = params.direction === 'buy';
  
  // 调用Delta筛选
  const deltaResult = await this.deribitClient.getInstrumentByDelta(
    currency, payload.n, payload.delta1, longSide
  );
}
```

#### 3.2 期权筛选算法 (`getInstrumentByDelta`)

**步骤1**: 获取所有期权合约
```typescript
const instruments = await this.getInstruments(currency, "option");
```

**步骤2**: 按到期时间分组
```typescript
// 筛选符合最小到期天数的期权
const validInstruments = instruments.filter(inst => {
  const daysToExpiry = (inst.expiration_timestamp - Date.now()) / (1000 * 60 * 60 * 24);
  return daysToExpiry >= minExpiredDays && inst.option_type === (longSide ? 'call' : 'put');
});
```

**步骤3**: 获取期权详情和Greeks
```typescript
for (const instrument of instrumentsForExpiry) {
  const details = await this.getOptionDetails(instrument.instrument_name);
  if (details?.greeks?.delta) {
    const deltaDistance = Math.abs(details.greeks.delta - delta);
    // 计算价差比率
    const spreadRatio = (details.best_ask_price - details.best_bid_price) / 
                       (details.best_ask_price + details.best_bid_price);
  }
}
```

**步骤4**: 选择最优期权
```typescript
// 选择Delta距离最小的前4个期权
const candidateOptions = optionsWithDelta
  .sort((a, b) => a.deltaDistance - b.deltaDistance)
  .slice(0, 4);

// 从中选择价差最小的
const bestOption = candidateOptions.reduce((best, current) =>
  current.spreadRatio < best.spreadRatio ? current : best
);
```

### 4. 订单执行阶段

#### 4.1 订单参数计算
```typescript
// 获取期权详情
const optionDetails = await this.deribitClient.getOptionDetails(instrumentName);

// 计算入场价格 (买一 + 卖一) / 2
const entryPrice = (optionDetails.best_bid_price + optionDetails.best_ask_price) / 2;

// 计算下单数量
let orderQuantity = params.quantity;
if (params.qtyType === 'cash') {
  // 将美元金额转换为合约数量
  orderQuantity = Math.floor(params.quantity / entryPrice);
}
```

#### 4.2 Deribit API调用
```typescript
const orderResult = await this.deribitClient.placeOrder(
  instrumentName,
  params.direction,      // 'buy' | 'sell'
  orderQuantity,         // 合约数量
  params.orderType,      // 'market' | 'limit'
  entryPrice,           // 价格 (限价单)
  tokenInfo.accessToken // 认证令牌
);
```

#### 4.3 Delta记录逻辑
开仓后自动记录Delta值到数据库：
```typescript
// delta1 -> move_position_delta 字段
// delta2 -> target_delta 字段
const deltaRecord = {
  account_id: params.accountName,
  instrument_name: instrumentName,
  target_delta: params.delta2 || 0,        // delta2记录到target_delta
  move_position_delta: params.delta1 || 0, // delta1记录到move_position_delta
  order_id: recordType === DeltaRecordType.ORDER ? orderResult.order?.order_id : null,
  record_type: orderState === 'filled' ? 'position' : 'order'
};
```

### 4.4 HTTP请求格式
```typescript
// Deribit API调用
const endpoint = direction === 'buy' ? '/private/buy' : '/private/sell';
const orderParams = {
  instrument_name: instrumentName,
  amount: amount,
  type: orderType,
  ...(orderType === 'limit' && price && { price })
};

const response = await this.httpClient.post(`${baseUrl}${endpoint}`, orderParams, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
```

## 🔧 关键配置参数

### Webhook Payload示例

**仅使用delta1 (记录到move_position_delta)**:
```json
{
  "accountName": "yqtest",
  "side": "buy",
  "symbol": "BTCUSDT",
  "size": "5000",
  "qtyType": "cash",
  "delta1": 0.7,
  "n": 2,
  "marketPosition": "long",
  "prevMarketPosition": "flat"
}
```

**同时使用delta1和delta2**:
```json
{
  "accountName": "yqtest",
  "side": "buy",
  "symbol": "BTCUSDT",
  "size": "5000",
  "qtyType": "cash",
  "delta1": 0.7,
  "delta2": 0.25,
  "n": 2,
  "marketPosition": "long",
  "prevMarketPosition": "flat"
}
```

### 环境变量控制
```bash
USE_MOCK_MODE=false          # 是否使用Mock模式
USE_TEST_ENVIRONMENT=false   # 是否使用测试环境
```

## 📊 开仓逻辑详解

### 针对您的需求: 开多$5000 BTC期权, n=2, delta1=0.7

**Webhook Payload**:
```json
{
  "accountName": "yqtest",
  "side": "buy",
  "symbol": "BTCUSDT", 
  "size": "5000",
  "qtyType": "cash",
  "delta1": 0.7,
  "n": 2,
  "marketPosition": "long",
  "prevMarketPosition": "flat"
}
```

**处理流程**:
1. **解析参数**: 
   - `direction = 'buy'` (开多)
   - `action = 'open'` (开仓)
   - `currency = 'BTC'`
   - `longSide = true` (选择call期权)

2. **期权筛选**:
   - 查找BTC call期权
   - 最小到期天数 >= 2天
   - Delta值接近0.7
   - 选择价差最小的期权

3. **数量计算**:
   - `qtyType = 'cash'` 表示$5000是美元金额
   - `orderQuantity = Math.floor(5000 / entryPrice)`
   - 例如: 期权价格0.05 BTC，则数量 = 5000/0.05 = 100,000合约

4. **Delta记录**:
   - `delta1 = 0.7` 记录到数据库的 `move_position_delta` 字段
   - `delta2 = 0.25` 记录到数据库的 `target_delta` 字段
   - 如果订单立即成交，记录类型为 `position`
   - 如果订单未立即成交，记录类型为 `order`

4. **下单执行**:
   - 调用Deribit `/private/buy` API
   - 市价单或限价单
   - 返回订单ID和执行结果

## 🚨 风险控制

### 1. 参数验证
- 必需字段检查
- 账户存在性验证
- 数量合理性检查

### 2. 错误处理
- 网络异常重试
- API错误响应处理
- 订单失败回滚

### 3. 日志记录
- 完整的请求响应日志
- 错误详情记录
- 性能监控数据

## 🔄 Mock模式 vs 真实模式

### Mock模式 (`USE_MOCK_MODE=true`)
- 跳过真实认证
- 使用模拟期权数据
- 模拟订单执行
- 适用于开发测试

### 真实模式 (`USE_MOCK_MODE=false`)
- 真实Deribit认证
- 查询真实期权数据
- 执行真实订单
- 适用于生产环境

---

**总结**: 系统通过webhook接收TradingView信号，解析交易参数，使用Delta筛选算法选择最优期权合约，然后通过Deribit API执行真实的期权交易。整个流程高度自动化，支持多种交易模式和风险控制机制。
