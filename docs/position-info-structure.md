# PositionInfo 详细结构说明

## 概述

`positionInfo` 是渐进式限价单策略执行完成后返回的详细仓位信息，包含订单状态、仓位数据、执行统计和汇总信息。

**重要更新**: 从最新版本开始，`placeOrder` 方法使用 `await` 方式直接等待策略完成，调用者可以立即获取到最终的仓位信息，无需额外的 Promise 处理。

## 完整类型定义

```typescript
interface DetailedPositionInfo {
  // 订单相关信息
  relatedOrders: OpenOrderInfo[];      // 相关的未平仓订单
  totalOpenOrders: number;             // 总未平仓订单数
  
  // 仓位相关信息
  positions: PositionInfo[];           // 相关仓位
  totalPositions: number;              // 总仓位数
  
  // 执行统计信息
  executionStats: ExecutionStats;      // 执行统计
  
  // 汇总信息
  summary: {
    totalUnrealizedPnl: number;        // 总未实现盈亏
    totalRealizedPnl: number;          // 总已实现盈亏
    totalMaintenanceMargin: number;    // 总维持保证金
    totalInitialMargin: number;        // 总初始保证金
    netDelta?: number;                 // 净Delta值
    netGamma?: number;                 // 净Gamma值
    netTheta?: number;                 // 净Theta值
    netVega?: number;                  // 净Vega值
  };
  
  // 元数据
  metadata: {
    timestamp: number;                 // 获取时间戳
    accountName: string;               // 账户名称
    currency: string;                  // 主要货币
    dataSource: 'deribit_api' | 'mock'; // 数据来源
    apiVersion?: string;               // API版本
  };
  
  // 错误信息（如果有）
  error?: string;                      // 错误描述
  warnings?: string[];                 // 警告信息
}
```

## 子结构详解

### 1. OpenOrderInfo - 未平仓订单信息

```typescript
interface OpenOrderInfo {
  order_id: string;                    // 订单ID
  instrument_name: string;             // 工具名称
  amount: number;                      // 订单数量
  filled_amount?: number;              // 已成交数量
  price?: number;                      // 订单价格
  average_price?: number;              // 平均成交价格
  order_state: OrderState;             // 订单状态
  order_type: OrderType;               // 订单类型
  direction: TradeDirection;           // 交易方向
  label?: string;                      // 订单标签
  creation_timestamp: number;          // 创建时间戳
  last_update_timestamp: number;       // 最后更新时间戳
  time_in_force?: string;              // 订单有效期
  post_only?: boolean;                 // 是否只做maker
  reduce_only?: boolean;               // 是否只减仓
  commission?: number;                 // 手续费
  profit_loss?: number;                // 盈亏
}
```

### 2. PositionInfo - 仓位信息

```typescript
interface PositionInfo {
  instrument_name: string;             // 工具名称
  size: number;                        // 仓位大小（正数为多头，负数为空头）
  size_currency?: number;              // 以货币计价的仓位大小
  direction: 'buy' | 'sell' | 'zero'; // 仓位方向
  average_price: number;               // 平均开仓价格
  average_price_usd?: number;          // 以USD计价的平均开仓价格
  mark_price: number;                  // 标记价格
  index_price?: number;                // 指数价格
  estimated_liquidation_price?: number; // 预估强平价格
  unrealized_pnl: number;              // 未实现盈亏
  realized_pnl?: number;               // 已实现盈亏
  total_profit_loss: number;           // 总盈亏
  maintenance_margin: number;          // 维持保证金
  initial_margin: number;              // 初始保证金
  settlement_price?: number;           // 结算价格
  delta?: number;                      // Delta值（期权）
  gamma?: number;                      // Gamma值（期权）
  theta?: number;                      // Theta值（期权）
  vega?: number;                       // Vega值（期权）
  floating_profit_loss?: number;      // 浮动盈亏
  floating_profit_loss_usd?: number;  // 以USD计价的浮动盈亏
}
```

### 3. ExecutionStats - 执行统计信息

```typescript
interface ExecutionStats {
  orderLabel: string;                  // 订单标签
  instrumentName: string;              // 工具名称
  direction: TradeDirection;           // 交易方向
  requestedQuantity: number;           // 请求数量
  executedQuantity: number;            // 实际成交数量
  averagePrice: number;                // 平均成交价格
  initialPrice: number;                // 初始价格
  finalPrice?: number;                 // 最终价格
  totalSteps: number;                  // 总执行步数
  executionTime: number;               // 执行时间（毫秒）
  priceMovements: Array<{              // 价格移动历史
    step: number;
    timestamp: number;
    oldPrice: number;
    newPrice: number;
    bidPrice: number;
    askPrice: number;
  }>;
}
```

## 使用示例

### 获取仓位信息（新的 await 方式）

```typescript
// 直接等待策略完成并获取详细仓位信息
const result = await optionTradingService.placeOrder(params);
if (result.success && result.positionInfo) {
  const posInfo = result.positionInfo;
    
    // 访问订单信息
    console.log('相关订单数量:', posInfo.relatedOrders.length);
    console.log('总未平仓订单:', posInfo.totalOpenOrders);
    
    // 访问仓位信息
    console.log('相关仓位数量:', posInfo.positions.length);
    posInfo.positions.forEach(pos => {
      console.log(`仓位 ${pos.instrument_name}: 大小=${pos.size}, 未实现盈亏=${pos.unrealized_pnl}`);
    });
    
    // 访问执行统计
    const stats = posInfo.executionStats;
    console.log(`执行统计: ${stats.executedQuantity}/${stats.requestedQuantity} 已成交`);
    console.log(`平均价格: ${stats.averagePrice}, 执行时间: ${stats.executionTime}ms`);
    console.log(`价格移动次数: ${stats.priceMovements.length}`);
    
    // 访问汇总信息
    const summary = posInfo.summary;
    console.log(`总未实现盈亏: ${summary.totalUnrealizedPnl}`);
    console.log(`净Delta: ${summary.netDelta}`);
    
    // 访问元数据
    console.log(`数据获取时间: ${new Date(posInfo.metadata.timestamp)}`);
    console.log(`账户: ${posInfo.metadata.accountName}`);
  }
}
```

### 错误处理

```typescript
if (result.positionInfo?.error) {
  console.error('获取仓位信息时出错:', result.positionInfo.error);
}

if (result.positionInfo?.warnings?.length) {
  console.warn('警告信息:', result.positionInfo.warnings);
}

// 处理策略失败的情况
if (!result.success) {
  console.error('策略执行失败:', result.message);
  if (result.error) {
    console.error('详细错误:', result.error);
  }
}
```

## 注意事项

1. **数据实时性**: `positionInfo` 反映的是策略执行完成时的状态，可能与当前实时状态有差异
2. **可选字段**: 某些字段可能为空，特别是期权相关的希腊字母值
3. **货币单位**: 价格和盈亏通常以基础货币计价，部分字段可能提供USD计价
4. **时间戳**: 所有时间戳均为Unix毫秒时间戳
5. **错误处理**: 如果获取仓位信息失败，`error` 字段会包含错误描述
