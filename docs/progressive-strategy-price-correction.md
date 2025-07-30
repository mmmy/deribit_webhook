# 渐进式限价单策略价格修正功能

## 概述

在渐进式限价单策略中，每次价格调整都会使用 `correctOrderPrice` 函数来确保新价格符合Deribit的tick size要求，避免因价格精度问题导致的订单被拒绝。

## 功能实现

### 1. 函数签名更新

#### 修改前
```typescript
private async executeProgressiveLimitStrategy(params: {
  orderLabel: string;
  instrumentName: string;
  direction: 'buy' | 'sell';
  quantity: number;
  initialPrice: number;
  accountName: string;
  timeout?: number;
  maxStep?: number;
})
```

#### 修改后
```typescript
private async executeProgressiveLimitStrategy(params: {
  orderLabel: string;
  instrumentName: string;
  direction: 'buy' | 'sell';
  quantity: number;
  initialPrice: number;
  accountName: string;
  instrumentDetail: DeribitOptionInstrument; // 新增：工具详情
  timeout?: number;
  maxStep?: number;
})
```

### 2. 调用处更新

在 `placeOrder` 方法中传入工具详情：
```typescript
const strategyResult = await this.executeProgressiveLimitStrategy({
  orderLabel,
  instrumentName,
  direction: params.direction,
  quantity: finalQuantity,
  initialPrice: finalPrice,
  accountName: params.accountName,
  instrumentDetail: instrumentInfo, // 传入工具详情用于价格修正
  timeout: 5000,
  maxStep: 6
});
```

### 3. 渐进式价格修正

#### 修改前
```typescript
const newPrice = this.calculateProgressivePrice(
  params.direction,
  params.initialPrice,
  bestBidPrice,
  bestAskPrice,
  currentStep,
  maxStep
);

// 直接使用原始价格
await this.updateOrderPrice(params.orderLabel, params.instrumentName, newPrice, tokenInfo.accessToken);
```

#### 修改后
```typescript
const newPrice = this.calculateProgressivePrice(
  params.direction,
  params.initialPrice,
  bestBidPrice,
  bestAskPrice,
  currentStep,
  maxStep
);

// 使用correctOrderPrice函数修正新价格
const priceResult = this.correctOrderPrice(newPrice, params.instrumentDetail);
const correctedNewPrice = priceResult.correctedPrice;

console.log(`📈 Step ${currentStep}/${maxStep}: Moving price from current to ${correctedNewPrice} (original: ${newPrice}, bid: ${bestBidPrice}, ask: ${bestAskPrice})`);
console.log(`🔧 Price correction: ${newPrice} → ${correctedNewPrice} (tick size: ${priceResult.tickSize})`);

// 使用修正后的价格
await this.updateOrderPrice(params.orderLabel, params.instrumentName, correctedNewPrice, tokenInfo.accessToken);
```

### 4. 最终价格修正

#### 修改前
```typescript
const finalPrice = params.direction === 'buy'
  ? optionDetails.best_ask_price || params.initialPrice
  : optionDetails.best_bid_price || params.initialPrice;

console.log(`💥 Final price adjustment to ${finalPrice}`);
await this.updateOrderPrice(params.orderLabel, params.instrumentName, finalPrice, tokenInfo.accessToken);
```

#### 修改后
```typescript
const rawFinalPrice = params.direction === 'buy'
  ? optionDetails.best_ask_price || params.initialPrice
  : optionDetails.best_bid_price || params.initialPrice;

// 使用correctOrderPrice函数修正最终价格
const finalPriceResult = this.correctOrderPrice(rawFinalPrice, params.instrumentDetail);
const correctedFinalPrice = finalPriceResult.correctedPrice;

console.log(`💥 Final price adjustment: ${rawFinalPrice} → ${correctedFinalPrice} (tick size: ${finalPriceResult.tickSize})`);
await this.updateOrderPrice(params.orderLabel, params.instrumentName, correctedFinalPrice, tokenInfo.accessToken);
```

## 价格修正逻辑

### 1. Tick Size 规则

根据价格范围使用不同的tick size：
```typescript
tick_size_steps: [
  { above_price: 0.1, tick_size: 0.001 },   // 价格 > 0.1 时使用 0.001
  { above_price: 0.05, tick_size: 0.0005 }, // 价格 > 0.05 时使用 0.0005
  { above_price: 0.01, tick_size: 0.0001 }  // 价格 > 0.01 时使用 0.0001
]
```

### 2. 修正算法

1. **确定正确的tick size**：根据价格范围选择合适的tick size
2. **计算价格步数**：`steps = price / tickSize`（四舍五入）
3. **重新计算价格**：`correctedPrice = steps * tickSize`

### 3. 精度处理

使用 `Decimal.js` 库避免浮点数精度问题：
```typescript
const priceDecimal = new Decimal(price);
const tickSizeDecimal = new Decimal(correctTickSize);
const steps = priceDecimal.dividedBy(tickSizeDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const correctedPriceDecimal = steps.times(tickSizeDecimal);
```

## 测试结果

### 1. 渐进式价格调整测试

**买单示例**（初始价格: 0.045, 目标: 0.048）：
```
步骤 1/5: 0.045600 → 0.0456 (tick: 0.0001)
步骤 2/5: 0.046200 → 0.0462 (tick: 0.0001)
步骤 3/5: 0.046800 → 0.0468 (tick: 0.0001)
步骤 4/5: 0.047400 → 0.0474 (tick: 0.0001)
步骤 5/5: 0.048000 → 0.048 (tick: 0.0001)
```

**卖单示例**（初始价格: 0.047, 目标: 0.044）：
```
步骤 1/5: 0.046400 → 0.0464 (tick: 0.0001)
步骤 2/5: 0.045800 → 0.0458 (tick: 0.0001)
步骤 3/5: 0.045200 → 0.0452 (tick: 0.0001)
步骤 4/5: 0.044600 → 0.0446 (tick: 0.0001)
步骤 5/5: 0.044000 → 0.044 (tick: 0.0001)
```

### 2. 分级Tick Size测试

**高价格测试**（价格 > 0.1）：
```
原始价格: 0.09575 → 修正价格: 0.096 (tick: 0.0005)
原始价格: 0.1523 → 修正价格: 0.152 (tick: 0.001)
```

### 3. 边界情况测试

```
正好在边界: 0.05 → 0.05 (tick: 0.0001)
需要修正: 0.05023 → 0.05 (tick: 0.0005)
极小价格: 0.00001 → 0 (tick: 0.0005)
```

## 日志输出

### 渐进式价格调整日志
```
📈 Step 1/5: Moving price from current to 0.0456 (original: 0.0456, bid: 0.044, ask: 0.048)
🔧 Price correction: 0.0456 → 0.0456 (tick size: 0.0001)
```

### 最终价格调整日志
```
💥 Final price adjustment: 0.048 → 0.048 (tick size: 0.0001)
```

### 价格修正详细日志
```
🔧 Price correction for BTC-25MAR23-50000-C:
   Original price: 0.0456 → Corrected: 0.0456
   Base tick size: 0.0005, Used tick size: 0.0001
   Price steps: 456
```

## 优势

### 1. **确保订单有效性**
- 所有价格都符合Deribit的tick size要求
- 避免因价格精度问题导致的订单被拒绝
- 提高策略执行的成功率

### 2. **精确的价格控制**
- 使用Decimal.js避免浮点数精度问题
- 支持分级tick size规则
- 四舍五入确保价格合理性

### 3. **详细的调试信息**
- 每次价格修正都有详细日志
- 显示原始价格、修正后价格和使用的tick size
- 便于问题排查和策略优化

### 4. **向后兼容**
- 保持原有的策略逻辑不变
- 只在价格修正环节增强功能
- 不影响其他部分的代码

## 注意事项

1. **工具详情依赖**：策略执行需要完整的工具详情信息
2. **价格精度**：极小价格可能被修正为0，需要注意边界情况
3. **性能影响**：每次价格调整都会进行修正计算，但影响微乎其微
4. **日志量增加**：价格修正会产生额外的日志输出

这个功能确保了渐进式限价单策略中的每个价格调整都符合交易所要求，大大提高了策略的可靠性和成功率。
