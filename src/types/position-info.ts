/**
 * 仓位信息相关的类型定义
 * 用于渐进式限价单策略的返回值
 */

// 订单状态枚举
export type OrderState = 'open' | 'filled' | 'rejected' | 'cancelled' | 'untriggered' | 'triggered';

// 交易方向
export type TradeDirection = 'buy' | 'sell';

// 订单类型
export type OrderType = 'limit' | 'market' | 'stop_limit' | 'stop_market';

// 未平仓订单信息
export interface OpenOrderInfo {
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

// 仓位信息
export interface PositionInfo {
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

// 执行统计信息
export interface ExecutionStats {
  orderId: string;                     // 订单ID
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

// 完整的仓位信息结构
export interface DetailedPositionInfo {
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
