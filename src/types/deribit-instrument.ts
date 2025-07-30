/**
 * Deribit工具相关的类型定义
 * 基于Deribit API v2.1.1官方文档
 */

import { TickSizeStep } from './index';

// 通用工具详情接口 - 用于 /public/get_instrument API
export interface DeribitInstrumentDetail {
  instrument_name: string;           // 工具名称
  instrument_id: number;             // 工具ID
  kind: 'future' | 'option' | 'spot' | 'future_combo' | 'option_combo'; // 工具类型
  instrument_type?: 'reversed' | 'linear'; // 工具子类型
  
  // 价格相关
  tick_size: number;                 // 最小价格变动单位
  tick_size_steps: TickSizeStep[];   // 分级tick size规则
  
  // 交易相关
  min_trade_amount: number;          // 最小交易数量
  contract_size: number;             // 合约大小
  max_leverage?: number;             // 最大杠杆
  
  // 手续费
  maker_commission: number;          // 做市商手续费
  taker_commission: number;          // 吃单手续费
  max_liquidation_commission?: number; // 最大强平手续费
  
  // 大宗交易
  block_trade_commission?: number;   // 大宗交易手续费
  block_trade_min_trade_amount?: number; // 大宗交易最小数量
  block_trade_tick_size?: number;    // 大宗交易tick size
  
  // 货币
  base_currency: string;             // 基础货币
  counter_currency?: string;         // 对手货币
  quote_currency: string;            // 计价货币
  settlement_currency: string;       // 结算货币
  
  // 时间戳
  creation_timestamp: number;        // 创建时间戳
  expiration_timestamp?: number;     // 到期时间戳
  
  // 状态
  is_active: boolean;                // 是否活跃
  rfq: boolean;                      // 是否支持RFQ
  
  // 期货特有字段
  future_type?: 'reversed' | 'linear'; // 期货类型
  settlement_period?: string;        // 结算周期
  
  // 期权特有字段
  option_type?: 'call' | 'put';      // 期权类型
  strike?: number;                   // 行权价
  
  // 价格指数
  price_index?: string;              // 价格指数名称
}
