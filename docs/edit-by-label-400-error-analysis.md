# edit_by_label 400 错误分析

## 问题描述

调用 `editByLabel` 函数时返回 400 错误，使用的参数为：
```json
{
  "label": "progressive_1753876674931_lfn0j780f",
  "instrument_name": "ETH-15AUG25-4000-C",
  "price": 0.031
}
```

## 可能的错误原因

### 1. 订单状态问题 ⭐⭐⭐⭐⭐
**最可能的原因**

- **订单不存在**: 标签 `progressive_1753876674931_lfn0j780f` 对应的订单可能已经不存在
- **订单已成交**: 订单可能已经被完全成交
- **订单已取消**: 订单可能已经被手动取消或系统取消
- **订单已过期**: 如果是限时订单，可能已经过期

**验证方法**:
```typescript
// 检查订单状态
const orderStatus = await privateAPI.getOrderStateByLabel({
  label: "progressive_1753876674931_lfn0j780f",
  instrument_name: "ETH-15AUG25-4000-C"
});
console.log('Order state:', orderStatus.order_state);
```

### 2. 价格精度问题 ⭐⭐⭐⭐
**很可能的原因**

ETH 期权的价格必须符合特定的 tick size 要求。价格 `0.031` 可能不是有效的 tick size 倍数。

**验证方法**:
```typescript
// 获取工具的 tick size
const instrument = await publicAPI.getInstrument({
  instrument_name: "ETH-15AUG25-4000-C"
});

const tickSize = instrument.tick_size;
const priceSteps = 0.031 / tickSize;
const isValidPrice = Math.abs(priceSteps - Math.round(priceSteps)) < 1e-10;

console.log('Tick size:', tickSize);
console.log('Price steps:', priceSteps);
console.log('Is valid price:', isValidPrice);
console.log('Corrected price:', Math.round(priceSteps) * tickSize);
```

### 3. 工具有效性问题 ⭐⭐⭐
**可能的原因**

- **工具已过期**: `ETH-15AUG25-4000-C` 可能已经到期
- **工具不存在**: 工具名称可能有误
- **工具已停止交易**: 工具可能暂停交易

**验证方法**:
```typescript
// 检查工具状态
const instrument = await publicAPI.getInstrument({
  instrument_name: "ETH-15AUG25-4000-C"
});

console.log('Is active:', instrument.is_active);
console.log('Expiration:', instrument.expiration_timestamp);
console.log('Current time:', Date.now());
```

### 4. API 参数问题 ⭐⭐
**较少可能的原因**

- **缺少必需参数**: 虽然 `amount` 是可选的，但某些情况下可能需要
- **参数类型错误**: 参数类型不匹配

### 5. 权限问题 ⭐⭐
**较少可能的原因**

- **API 权限不足**: 访问令牌可能没有交易权限
- **账户限制**: 账户可能有交易限制

## 诊断步骤

### 步骤 1: 检查订单状态
```typescript
try {
  const orderStatus = await privateAPI.getOrderStateByLabel({
    label: "progressive_1753876674931_lfn0j780f",
    instrument_name: "ETH-15AUG25-4000-C"
  });
  
  console.log('Order found:', orderStatus);
  console.log('Order state:', orderStatus.order_state);
  console.log('Current price:', orderStatus.price);
  console.log('Amount:', orderStatus.amount);
  
  if (orderStatus.order_state !== 'open') {
    console.log('❌ Order is not open, cannot edit');
  }
} catch (error) {
  console.log('❌ Order not found or error:', error.message);
}
```

### 步骤 2: 检查工具详情
```typescript
try {
  const instrument = await publicAPI.getInstrument({
    instrument_name: "ETH-15AUG25-4000-C"
  });
  
  console.log('Instrument details:', {
    name: instrument.instrument_name,
    tick_size: instrument.tick_size,
    min_trade_amount: instrument.min_trade_amount,
    is_active: instrument.is_active,
    expiration: new Date(instrument.expiration_timestamp)
  });
} catch (error) {
  console.log('❌ Instrument not found or error:', error.message);
}
```

### 步骤 3: 验证价格
```typescript
const requestedPrice = 0.031;
const tickSize = instrument.tick_size; // 从步骤2获取

const priceSteps = requestedPrice / tickSize;
const isValidPrice = Math.abs(priceSteps - Math.round(priceSteps)) < 1e-10;
const correctedPrice = Math.round(priceSteps) * tickSize;

console.log('Price validation:', {
  requested_price: requestedPrice,
  tick_size: tickSize,
  price_steps: priceSteps,
  is_valid: isValidPrice,
  corrected_price: correctedPrice
});

if (!isValidPrice) {
  console.log(`⚠️ Price ${requestedPrice} should be ${correctedPrice}`);
}
```

## 解决方案

### 方案 1: 使用正确的价格 (推荐)
```typescript
// 获取正确的价格
const instrument = await publicAPI.getInstrument({
  instrument_name: "ETH-15AUG25-4000-C"
});

const tickSize = instrument.tick_size;
const correctedPrice = Math.round(0.031 / tickSize) * tickSize;

// 使用修正后的价格
const result = await privateAPI.editByLabel({
  label: "progressive_1753876674931_lfn0j780f",
  instrument_name: "ETH-15AUG25-4000-C",
  price: correctedPrice
});
```

### 方案 2: 添加 amount 参数
```typescript
// 如果只修改价格失败，尝试同时提供 amount
const result = await privateAPI.editByLabel({
  label: "progressive_1753876674931_lfn0j780f",
  instrument_name: "ETH-15AUG25-4000-C",
  price: 0.031,
  amount: currentOrderAmount // 从订单状态获取当前数量
});
```

### 方案 3: 检查并重新创建订单
```typescript
// 如果订单已经不存在，重新创建
try {
  const result = await privateAPI.editByLabel(params);
} catch (error) {
  if (error.message.includes('400')) {
    console.log('Order may not exist, consider creating a new order');
    // 创建新订单的逻辑
  }
}
```

## 预防措施

### 1. 价格验证函数
```typescript
function validatePrice(price: number, tickSize: number): number {
  const steps = Math.round(price / tickSize);
  return steps * tickSize;
}

// 使用前验证价格
const validPrice = validatePrice(0.031, instrument.tick_size);
```

### 2. 订单状态检查
```typescript
async function safeEditByLabel(params: EditParams) {
  // 先检查订单状态
  const orderStatus = await privateAPI.getOrderStateByLabel({
    label: params.label,
    instrument_name: params.instrument_name
  });
  
  if (orderStatus.order_state !== 'open') {
    throw new Error(`Cannot edit order: state is ${orderStatus.order_state}`);
  }
  
  // 验证价格
  if (params.price) {
    const instrument = await publicAPI.getInstrument({
      instrument_name: params.instrument_name
    });
    params.price = validatePrice(params.price, instrument.tick_size);
  }
  
  return await privateAPI.editByLabel(params);
}
```

### 3. 错误处理增强
```typescript
try {
  const result = await privateAPI.editByLabel(params);
} catch (error) {
  if (error.message.includes('400')) {
    // 运行诊断
    const diagnosis = await privateAPI.diagnoseEditByLabelIssue(params);
    console.log('Diagnosis:', diagnosis);
    
    // 根据诊断结果采取行动
    if (diagnosis.possibleIssues.length > 0) {
      console.log('Issues found:', diagnosis.possibleIssues);
    }
  }
  throw error;
}
```

## 总结

400 错误最可能的原因是：
1. **订单状态不是 'open'** (最可能)
2. **价格不符合 tick size 要求** (很可能)
3. **工具已过期或无效** (可能)

建议按照诊断步骤逐一检查，并使用提供的解决方案来修复问题。
