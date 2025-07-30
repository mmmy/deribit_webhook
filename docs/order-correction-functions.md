# 订单参数修正函数重构

## 概述

将原来的 `correctOrderParams` 函数分解成两个独立的函数：`correctOrderPrice` 和 `correctOrderAmount`，提高代码的模块化和可维护性。

## 重构前后对比

### 重构前
```typescript
private correctOrderParams(
  price: number,
  amount: number,
  instrumentDetail: DeribitOptionInstrument
) {
  // 价格和数量修正逻辑混合在一起
  // 返回组合结果
}
```

### 重构后
```typescript
// 1. 价格修正函数
private correctOrderPrice(
  price: number,
  instrumentDetail: DeribitOptionInstrument
): { correctedPrice: number; tickSize: number; priceSteps: string }

// 2. 数量修正函数  
private correctOrderAmount(
  amount: number,
  instrumentDetail: DeribitOptionInstrument
): { correctedAmount: number; minTradeAmount: number; amountSteps: string }

// 3. 组合函数（保持向后兼容）
private correctOrderParams(
  price: number,
  amount: number,
  instrumentDetail: DeribitOptionInstrument
)
```

## 函数详解

### 1. correctOrderPrice - 价格修正函数

#### 功能
- 根据工具的tick size规则修正价格
- 支持分级tick size（tick_size_steps）
- 使用Decimal.js确保精度

#### 参数
- `price: number` - 原始价格
- `instrumentDetail: DeribitOptionInstrument` - 工具详情

#### 返回值
```typescript
{
  correctedPrice: number;  // 修正后的价格
  tickSize: number;        // 使用的tick size
  priceSteps: string;      // 价格步数（用于调试）
}
```

#### 逻辑
1. 根据价格确定正确的tick size
2. 将价格修正到最接近的tick size倍数
3. 使用四舍五入规则

#### 示例
```typescript
const result = correctOrderPrice(0.00523, instrumentDetail);
// 输出: { correctedPrice: 0.005, tickSize: 0.0005, priceSteps: "10" }
```

### 2. correctOrderAmount - 数量修正函数

#### 功能
- 根据最小交易量修正数量
- 使用向上取整确保满足最小交易要求
- 使用Decimal.js确保精度

#### 参数
- `amount: number` - 原始数量
- `instrumentDetail: DeribitOptionInstrument` - 工具详情

#### 返回值
```typescript
{
  correctedAmount: number;   // 修正后的数量
  minTradeAmount: number;    // 最小交易量
  amountSteps: string;       // 数量步数（用于调试）
}
```

#### 逻辑
1. 获取最小交易量
2. 将数量修正到最小交易量的倍数
3. 使用向上取整确保不低于要求

#### 示例
```typescript
const result = correctOrderAmount(0.15, instrumentDetail);
// 输出: { correctedAmount: 0.2, minTradeAmount: 0.1, amountSteps: "2" }
```

### 3. correctOrderParams - 组合函数

#### 功能
- 调用价格和数量修正函数
- 提供统一的接口保持向后兼容
- 输出组合的日志信息

#### 参数
- `price: number` - 原始价格
- `amount: number` - 原始数量
- `instrumentDetail: DeribitOptionInstrument` - 工具详情

#### 返回值
```typescript
{
  correctedPrice: number;    // 修正后的价格
  correctedAmount: number;   // 修正后的数量
  tickSize: number;          // 使用的tick size
  minTradeAmount: number;    // 最小交易量
}
```

## 优势

### 1. 模块化设计
- **单一职责**：每个函数只负责一种类型的修正
- **独立测试**：可以单独测试价格或数量修正逻辑
- **代码复用**：可以在不同场景下单独使用

### 2. 更好的调试能力
- **详细日志**：每个函数提供专门的日志输出
- **步数信息**：返回计算步数便于调试
- **分离关注点**：问题定位更精确

### 3. 灵活性提升
- **按需调用**：可以只修正价格或只修正数量
- **扩展性**：易于添加新的修正规则
- **维护性**：修改一种逻辑不影响另一种

### 4. 向后兼容
- **保留原接口**：`correctOrderParams` 函数仍然可用
- **无破坏性变更**：现有代码无需修改
- **渐进式迁移**：可以逐步迁移到新函数

## 使用示例

### 独立使用价格修正
```typescript
// 只需要修正价格时
const priceResult = this.correctOrderPrice(0.00523, instrumentDetail);
console.log(`修正后价格: ${priceResult.correctedPrice}`);
```

### 独立使用数量修正
```typescript
// 只需要修正数量时
const amountResult = this.correctOrderAmount(0.15, instrumentDetail);
console.log(`修正后数量: ${amountResult.correctedAmount}`);
```

### 组合使用（原有方式）
```typescript
// 同时修正价格和数量
const result = this.correctOrderParams(0.00523, 0.15, instrumentDetail);
console.log(`价格: ${result.correctedPrice}, 数量: ${result.correctedAmount}`);
```

### 在渐进式策略中使用
```typescript
// 在价格调整过程中，只需要修正新价格
const newPriceResult = this.correctOrderPrice(newPrice, instrumentDetail);
await this.updateOrderPrice(orderLabel, instrumentName, newPriceResult.correctedPrice, accessToken);
```

## 测试结果

通过测试验证了各种场景：

1. **低价格测试** (0.00523 → 0.005)
   - 使用0.0005 tick size
   - 价格步数: 10

2. **中等价格测试** (0.0723 → 0.0725)
   - 使用0.0005 tick size
   - 价格步数: 145

3. **高价格测试** (0.1523 → 0.152)
   - 使用0.001 tick size（分级规则）
   - 价格步数: 152

4. **边界价格测试** (0.05 → 0.05)
   - 正好在tick size边界
   - 使用0.0001 tick size

5. **精确倍数测试** (0.052 → 0.052)
   - 已经是正确的倍数
   - 无需修正

## 注意事项

1. **精度处理**：使用Decimal.js避免浮点数精度问题
2. **取整规则**：价格使用四舍五入，数量使用向上取整
3. **边界情况**：正确处理tick size边界和分级规则
4. **日志输出**：提供详细的修正过程日志
5. **错误处理**：确保输入参数的有效性

这个重构提高了代码的可维护性和灵活性，同时保持了向后兼容性。
