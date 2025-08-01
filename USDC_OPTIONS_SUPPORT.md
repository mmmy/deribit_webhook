# USDC期权支持文档

## 概述

系统现已支持USDC期权交易，特别是SOL-USDC期权。用户可以通过webhook信号发送USDC期权交易请求。

## 支持的USDC期权

### 主要货币对
- **SOL-USDC**: Solana USDC期权
- **BTC-USDC**: Bitcoin USDC期权  
- **ETH-USDC**: Ethereum USDC期权
- **其他**: 所有Deribit支持的USDC期权

### Deribit USDC期权特点
- **结算货币**: USDC
- **线性期权**: 使用USDC作为保证金和结算
- **乘数**: 不同货币有不同的合约乘数
  - SOL: 10倍乘数
  - 其他货币请参考Deribit文档

## 使用方法

### Webhook信号格式

#### SOL-USDC期权示例
```json
{
  "accountName": "account_1",
  "side": "buy",
  "symbol": "SOLUSDC",
  "size": "1000",
  "qtyType": "cash",
  "delta1": 0.7,
  "n": 2,
  "marketPosition": "long",
  "prevMarketPosition": "flat",
  "exchange": "DERIBIT",
  "period": "5",
  "price": "150.50",
  "timestamp": "1642678920000",
  "positionSize": "0",
  "id": "sol_usdc_signal_001",
  "tv_id": 12345
}
```

#### BTC-USDC期权示例
```json
{
  "accountName": "account_1", 
  "side": "sell",
  "symbol": "BTCUSDC",
  "size": "500",
  "qtyType": "cash",
  "delta1": -0.3,
  "n": 7,
  "marketPosition": "short",
  "prevMarketPosition": "flat",
  "exchange": "DERIBIT",
  "period": "15",
  "price": "65000.00",
  "timestamp": "1642678920000",
  "positionSize": "0",
  "id": "btc_usdc_signal_002",
  "tv_id": 12346
}
```

### 关键参数说明

| 参数 | 说明 | USDC期权示例 |
|------|------|-------------|
| `symbol` | 交易对符号 | `SOLUSDC`, `BTCUSDC`, `ETHUSDC` |
| `side` | 交易方向 | `buy` (开多), `sell` (开空) |
| `size` | 交易金额(USDC) | `1000` (1000 USDC) |
| `qtyType` | 数量类型 | `cash` (现金金额) |
| `delta1` | 目标Delta值 | `0.7` (70% Delta) |
| `n` | 最小到期天数 | `2` (至少2天到期) |

## 系统处理流程

### 1. Symbol解析
系统使用新的解析逻辑来正确处理USDC期权：

```typescript
// USDC期权解析
"SOLUSDC" → currency: "USDC", underlying: "SOL"
"BTCUSDC" → currency: "USDC", underlying: "BTC"
"ETHUSDC" → currency: "USDC", underlying: "ETH"

// 传统期权解析（向后兼容）
"BTCUSDT" → currency: "BTC", underlying: "BTC"
"ETHUSDT" → currency: "ETH", underlying: "ETH"
```

### 2. 期权选择
- 对于USDC期权：使用currency="USDC"查询Deribit API
- 期权合约名称格式：`SOL_USDC-expiry-strike-type`
- 使用Delta值筛选最优期权合约
- 考虑最小到期天数要求

### 3. 订单执行
- 计算合约数量（考虑USDC结算）
- 获取最优价格（买一+卖一)/2
- 执行限价单交易

## 测试方法

### 运行测试脚本
```bash
# 确保服务器运行在localhost:3000
node test-usdc-options.js
```

### 手动测试
```bash
# SOL-USDC期权测试
curl -X POST http://localhost:3000/webhook/signal \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "account_1",
    "side": "buy", 
    "symbol": "SOLUSDC",
    "size": "1000",
    "qtyType": "cash",
    "delta1": 0.7,
    "n": 2,
    "marketPosition": "long",
    "prevMarketPosition": "flat",
    "exchange": "DERIBIT",
    "period": "5",
    "price": "150.50",
    "timestamp": "1642678920000",
    "positionSize": "0",
    "id": "test_sol_usdc",
    "tv_id": 12345
  }'
```

## 注意事项

### 1. 账户配置
- 确保账户支持USDC期权交易
- 检查USDC余额是否充足
- 验证账户权限设置

### 2. 风险管理
- USDC期权使用USDC作为保证金
- 注意不同货币的合约乘数
- 监控Delta风险敞口

### 3. 市场时间
- 遵循Deribit交易时间
- 注意期权到期时间
- 考虑流动性因素

## 错误处理

### 常见错误
1. **货币不支持**: 检查Deribit是否支持该货币的USDC期权
2. **余额不足**: 确保USDC余额充足
3. **Delta超范围**: Delta值应在-1到1之间
4. **到期时间**: 确保有足够的到期时间选择

### 调试方法
1. 检查服务器日志中的货币解析结果
2. 验证Deribit API响应
3. 确认期权合约存在性

## 向后兼容性

系统完全向后兼容现有的USDT期权：
- `BTCUSDT` → `BTC`
- `ETHUSDT` → `ETH`
- `SOLUSDT` → `SOL`

新的USDC支持不会影响现有功能。

## 相关文档

- [Deribit USDC期权文档](https://support.deribit.com/hc/en-us/articles/25944750999581-Linear-USDC-Options)
- [Webhook API文档](WEBHOOK_API.md)
- [期权交易分析](WEBHOOK_SIGNAL_PROCESSING_ANALYSIS.md)
