# 高ROI自动平仓功能

## 功能概述

系统现在支持对高ROI的卖出期权仓位进行自动平仓。当检测到期权仓位满足以下条件时，系统会自动执行平仓操作：

1. **仓位类型**: 期权 (`kind === 'option'`)
2. **交易方向**: 卖出 (`direction === 'sell'`)
3. **ROI阈值**: ROI > 85%

## ROI计算逻辑

### 基本公式
```typescript
// 基础ROI计算
const basicROI = ((mark_price - average_price) / average_price);

// 对于卖出仓位，ROI需要取负值（因为我们希望期权价格下跌来获利）
const roi = -basicROI;
```

### 业务逻辑说明

**卖出期权的盈利逻辑**：
- 卖出期权时，我们收取权利金
- 我们希望期权价格下跌，这样可以以更低价格买回平仓，或者期权到期归零
- 当 `mark_price < average_price` 时，我们获利
- ROI = `-(mark_price - average_price) / average_price`

**示例**：
- 平均价格: $100
- 当前标记价格: $15
- 基础ROI: (15 - 100) / 100 = -85%
- 卖出仓位ROI: -(-85%) = +85%

## 实现位置

### 主要文件
- `src/polling/position-poller.ts`

### 关键方法
1. `checkHighROISellPositions()` - 检查高ROI卖出仓位
2. `sendHighROICloseNotification()` - 发送平仓前通知
3. `sendHighROICloseResultNotification()` - 发送平仓结果通知

## 执行流程

### 1. 轮询检查
```typescript
// 在仓位轮询过程中执行检查
if (positionsData.success && positionsData.data) {
  // 分析Delta调整
  await this.analyzePositionsForAdjustment(positionsData.data, account.name, requestId);
  
  // 检查高ROI卖出仓位
  await this.checkHighROISellPositions(positionsData.data, account.name, requestId);
}
```

### 2. 条件检查
```typescript
// 检查是否为期权
if (pos.kind !== 'option') continue;

// 检查是否为卖出方向
if (pos.direction !== 'sell') continue;

// 验证价格数据
if (typeof pos.average_price !== 'number' || typeof pos.mark_price !== 'number' || pos.average_price === 0) {
  continue;
}

// 计算ROI
let roi = ((pos.mark_price - pos.average_price) / pos.average_price);
roi = -roi; // 卖出仓位ROI取负

// 检查是否超过阈值
if (roi > 0.85) {
  // 获取访问令牌并执行平仓
  const tokenInfo = this.deribitAuth.getTokenInfo(accountName);
  if (tokenInfo) {
    // 执行平仓
  }
}
```

### 3. 平仓执行
```typescript
const closeResult = await executePositionClose(
  {
    requestId: `${requestId}_high_roi_close`,
    accountName,
    currentPosition: pos,
    // deltaRecord 不传递 - 高ROI平仓不需要删除Delta记录
    accessToken: tokenInfo.accessToken,
    closeRatio: 1.0, // 全平仓位
    isMarketOrder: false // 使用限价单+渐进式策略
  },
  services
);
```

## 通知功能

### 平仓前通知
```markdown
🚨 **高ROI平仓通知**
👤 **账户**: main_account
🎯 **合约**: BTC-25DEC25-50000-P
📈 **仓位方向**: sell
📊 **仓位大小**: -10
💰 **平均价格**: 100
📊 **标记价格**: 15
📈 **ROI**: 85.00%
⚠️ **触发阈值**: 85%
🔄 **操作**: 即将执行平仓
```

### 平仓结果通知
```markdown
✅ **高ROI平仓结果**
👤 **账户**: main_account
🎯 **合约**: BTC-25DEC25-50000-P
📈 **ROI**: 85.00%
🔄 **平仓状态**: 成功
📝 **详情**: Position closed successfully
```

## 配置参数

### ROI阈值
```typescript
const ROI_THRESHOLD = 0.85; // 85% ROI阈值
```

### 平仓参数
- **平仓比例**: 1.0 (全平)
- **订单类型**: 限价单 + 渐进式策略
- **市价单**: false (不使用市价单)

## 参数说明

### executePositionClose 函数参数
- `deltaRecord?`: **可选参数** - Delta记录，如果提供且为全平操作，会自动删除该记录
- 其他参数为必需参数

### 使用场景
1. **有Delta记录的平仓**: 传递`deltaRecord`参数，全平时会自动删除记录
2. **无Delta记录的平仓**: 不传递`deltaRecord`参数，仅执行平仓操作

## 安全机制

1. **期权类型检查**: 只检查`kind === 'option'`的仓位
2. **卖出方向检查**: 只检查`direction === 'sell'`的仓位
3. **ROI阈值检查**: 只有ROI > 85%的仓位才会被平仓
4. **认证检查**: 确保有有效的访问令牌才执行平仓
5. **错误处理**: 每个仓位的检查都有独立的错误处理，不会影响其他仓位
6. **通知机制**: 平仓前后都会发送企业微信通知
7. **独立平仓**: 不依赖Delta记录，直接基于仓位信息执行平仓

## 日志输出

### 检查日志
```
📊 [req_123] ROI Check - main_account:
   🎯 Instrument: BTC-25DEC25-50000-P
   📈 Direction: sell
   💰 Average Price: 100
   📊 Mark Price: 15
   📈 ROI: 85.00%
```

### 触发日志
```
🚨 [req_123] High ROI detected for BTC-25DEC25-50000-P: 85.00% > 85%
✅ [req_123] High ROI close executed for BTC-25DEC25-50000-P: SUCCESS
```

## 注意事项

1. **仅适用于期权**: 只检查 `kind === 'option'` 的仓位
2. **仅适用于卖出**: 只检查 `direction === 'sell'` 的仓位
3. **无需Delta记录**: 高ROI平仓不依赖Delta记录，直接基于仓位数据执行
4. **渐进式平仓**: 使用限价单+渐进式策略，确保更好的执行价格
5. **企业微信通知**: 需要配置企业微信机器人才能接收通知

## 安全机制

1. **期权类型检查**: 只检查 `kind === 'option'` 的仓位
2. **卖出方向检查**: 只检查 `direction === 'sell'` 的仓位
3. **ROI阈值验证**: 只有ROI > 85%的仓位才会触发平仓
4. **价格数据验证**: 确保平均价格和标记价格都是有效数字
5. **认证检查**: 确保有有效的访问令牌才执行平仓
6. **错误处理**: 每个仓位的检查都有独立的错误处理，不会影响其他仓位
7. **通知机制**: 平仓前后都会发送企业微信通知
8. **无Delta记录依赖**: 不需要数据库中的Delta记录，降低了依赖性

## 使用示例

### 带Delta记录的平仓
```typescript
// 有Delta记录的情况，全平时会自动删除记录
const closeResult = await executePositionClose(
  {
    requestId: 'close_001',
    accountName: 'main_account',
    currentPosition: position,
    deltaRecord: deltaRecord, // 提供Delta记录
    accessToken: 'token_123',
    closeRatio: 1.0,
    isMarketOrder: false
  },
  services
);
```

### 无Delta记录的平仓
```typescript
// 无Delta记录的情况，仅执行平仓操作
const closeResult = await executePositionClose(
  {
    requestId: 'close_002',
    accountName: 'main_account',
    currentPosition: position,
    // deltaRecord 参数省略
    accessToken: 'token_123',
    closeRatio: 0.5,
    isMarketOrder: false
  },
  services
);
```

## 测试建议

1. **模拟高ROI场景**: 在测试环境中创建高ROI的卖出期权仓位
2. **验证计算逻辑**: 确认ROI计算公式正确
3. **测试通知功能**: 验证企业微信通知是否正常发送
4. **测试平仓执行**: 确认平仓操作能够正确执行
5. **测试可选参数**: 验证有无Delta记录的两种情况都能正常工作
