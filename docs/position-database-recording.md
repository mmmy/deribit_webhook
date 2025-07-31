# 仓位信息数据库记录功能

## 概述

渐进式限价单策略完成后，系统会自动将最终的仓位信息记录到delta数据库中，用于跟踪和管理期权仓位的Delta值。

## 功能特性

### 1. 自动记录
- 策略成功完成且有实际成交时自动触发
- 无需手动调用，完全集成在交易流程中
- 支持创建新记录和更新现有记录

### 2. 智能Upsert操作
- **存在记录时**：更新现有的仓位记录
- **不存在记录时**：创建新的仓位记录
- 确保每个账户的每个合约只有一条仓位记录

### 3. Delta值提取策略
```typescript
// 优先级顺序：
1. 原始参数中的delta值 (params.delta1, params.delta2)
2. 仓位信息中的净Delta值 (positionInfo.summary.netDelta)
3. 默认值 0
```

## 数据库结构

### Delta记录表 (delta_records)
```sql
CREATE TABLE delta_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,              -- 账户ID
  instrument_name TEXT NOT NULL,         -- 合约名称
  order_id TEXT,                         -- 订单ID (仓位记录为null)
  target_delta REAL NOT NULL,            -- 目标Delta值 (-1 到 1)
  move_position_delta REAL NOT NULL,     -- 移仓Delta值 (-1 到 1)
  min_expire_days INTEGER CHECK (min_expire_days IS NULL OR min_expire_days > 0), -- 最小到期天数 (大于0的整数，可为null)
  tv_id INTEGER,                         -- TradingView信号ID
  record_type TEXT NOT NULL,             -- 记录类型 ('position' | 'order')
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 唯一约束
- 每个账户的每个合约只能有一条仓位记录
- 每个订单ID只能有一条记录

## 记录逻辑

### 触发条件
1. ✅ 策略执行成功 (`strategyResult.success === true`)
2. ✅ 存在仓位信息 (`strategyResult.positionInfo` 不为空)
3. ✅ 有实际成交 (`executedQuantity > 0`)

### 数据映射

#### 账户ID提取
```typescript
// 从订单标签中提取账户名
const accountId = executionStats.orderLabel.includes('_') 
  ? executionStats.orderLabel.split('_')[0]  // 从 "main_account_progressive_..." 提取 "main"
  : posInfo.metadata.accountName;           // 备用方案
```

#### Delta值映射
```typescript
// target_delta: 目标Delta值
const targetDelta = params.delta2 || posInfo.summary.netDelta || 0;

// move_position_delta: 移仓Delta值  
const movePositionDelta = params.delta1 || 0;
```

#### 数值范围限制
```typescript
// 确保Delta值在有效范围内
target_delta: Math.max(-1, Math.min(1, targetDelta))
move_position_delta: Math.max(-1, Math.min(1, movePositionDelta))
```

## 使用示例

### 自动记录过程
```typescript
// 1. 执行渐进式限价单策略
const result = await optionTradingService.placeOrder({
  accountName: 'main_account',
  instrumentName: 'BTC-25MAR23-50000-C',
  direction: 'buy',
  quantity: 10,
  delta1: 0.65,  // 移仓Delta值
  delta2: 0.70   // 目标Delta值
});

// 2. 策略完成后自动记录到数据库
if (result.success) {
  // 数据库中会自动创建/更新记录：
  // {
  //   account_id: 'main_account',
  //   instrument_name: 'BTC-25MAR23-50000-C',
  //   target_delta: 0.70,
  //   move_position_delta: 0.65,
  //   record_type: 'position'
  // }
}
```

### 查询记录
```typescript
import { DeltaManager, DeltaRecordType } from './src/database';

const deltaManager = DeltaManager.getInstance();

// 查询特定账户的仓位记录
const positions = deltaManager.getRecords({
  account_id: 'main_account',
  record_type: DeltaRecordType.POSITION
});

// 查询特定合约的记录
const contractRecords = deltaManager.getRecords({
  instrument_name: 'BTC-25MAR23-50000-C'
});

// 获取账户Delta汇总
const summary = deltaManager.getAccountDeltaSummary('main_account');
```

## 日志输出

### 成功记录
```
✅ 仓位信息已记录到delta数据库: {
  id: 1,
  account_id: 'main_account',
  instrument_name: 'BTC-25MAR23-50000-C',
  target_delta: 0.70,
  move_position_delta: 0.65,
  executed_quantity: 10,
  average_price: 0.052
}
```

### 更新现有记录
```
🔄 更新仓位Delta: main_account/BTC-25MAR23-50000-C = 0.75
```

### 跳过记录的情况
```
ℹ️ 跳过数据库记录：策略未成功或无仓位信息
ℹ️ 跳过数据库记录：无实际成交 (executedQuantity: 0)
```

### 错误处理
```
❌ 记录仓位信息到数据库失败: [错误详情]
```

## 错误处理

### 容错设计
- 数据库记录失败不会影响主要的交易流程
- 所有异常都会被捕获并记录日志
- 提供详细的错误信息用于调试

### 常见错误场景
1. **数据库连接失败**：记录错误日志，继续交易流程
2. **数据格式错误**：自动修正Delta值范围，记录警告
3. **唯一约束冲突**：使用upsert操作自动处理

## 最佳实践

### 1. 监控数据库记录
```typescript
// 定期检查数据库统计
const stats = deltaManager.getStats();
console.log('数据库统计:', stats);
```

### 2. 清理过期数据
```typescript
// 清理7天前的订单记录
const cleanedCount = deltaManager.cleanupExpiredOrders(7);
```

### 3. 备份重要数据
```typescript
// 导出数据备份
const exportData = deltaManager.exportData({
  account_id: 'main_account'
});
fs.writeFileSync('backup.json', exportData);
```

## 注意事项

1. **数据一致性**：确保Delta值在[-1, 1]范围内
2. **性能考虑**：大量交易时注意数据库性能
3. **存储空间**：定期清理过期的订单记录
4. **备份策略**：重要仓位数据应定期备份
5. **监控告警**：建议对数据库记录失败设置告警

这个功能为期权交易系统提供了完整的仓位跟踪能力，支持风险管理和投资组合分析。
