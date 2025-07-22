export interface ApiKeyConfig {
  name: string;
  description: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  grantType: 'client_credentials' | 'client_signature' | 'refresh_token';
  scope?: string;
}

export interface GlobalSettings {
  connectionTimeout: number;
  maxReconnectAttempts: number;
  rateLimitPerMinute: number;
}

export interface DeribitConfig {
  accounts: ApiKeyConfig[];
  settings: GlobalSettings;
}

export interface AuthResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface DeribitError {
  error: {
    message: string;
    code: number;
    data?: any;
  };
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

// TradingView Webhook Signal Payload
export interface WebhookSignalPayload {
  accountName: string;                    // 账户名，对应 apikeys 配置中的 name
  side: string;                          // 交易方向: buy/sell
  exchange: string;                      // 交易所名称
  period: string;                        // K线周期
  marketPosition: string;                // 当前市场仓位: long/short/flat
  prevMarketPosition: string;            // 之前的市场仓位
  symbol: string;                        // 交易对符号
  price: string;                         // 当前价格
  timestamp: string;                     // 时间戳
  size: string;                          // 订单数量/合约数
  positionSize: string;                  // 当前仓位大小
  id: string;                           // 策略订单ID
  alertMessage?: string;                 // 警报消息
  comment?: string;                      // 注释
  qtyType: 'fixed' | 'percent' | 'contracts'; // 数量类型
  delta1?: number;                       // 期权Delta值，用于开仓时选择期权
  n?: number;                           // 最小到期天数，用于开仓时选择期权
}

// Webhook响应接口
export interface WebhookResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  timestamp: string;
  requestId?: string;
}

// 期权交易参数接口
export interface OptionTradingParams {
  accountName: string;
  direction: 'buy' | 'sell';             // 交易方向
  action: 'open' | 'close';              // 开仓/平仓
  symbol: string;                        // 原始交易对
  quantity: number;                      // 交易数量
  price?: number;                        // 限价 (可选)
  orderType: 'market' | 'limit';         // 订单类型
  instrumentName?: string;               // Deribit期权合约名称
  qtyType?: 'fixed' | 'percent' | 'cash' | 'contracts'; // 数量类型
}

// 期权交易结果接口
export interface OptionTradingResult {
  success: boolean;
  orderId?: string;
  message: string;
  instrumentName?: string;
  executedQuantity?: number;
  executedPrice?: number;
  error?: string;
}

// 期权列表查询参数接口
export interface OptionListParams {
  underlying: string;                    // 期权标的 (如 'BTC', 'ETH')
  direction: 'long' | 'short';          // 方向: long(看涨) 或 short(看跌)
  expired?: boolean;                     // 是否包含已过期期权，默认false
  minStrike?: number;                    // 最小行权价
  maxStrike?: number;                    // 最大行权价
  minExpiry?: Date;                      // 最小到期时间
  maxExpiry?: Date;                      // 最大到期时间
}

// Deribit期权工具信息接口
export interface DeribitOptionInstrument {
  instrument_name: string;               // 期权合约名称 (如 'BTC-25JUL25-50000-C')
  currency: string;                      // 标的货币 (如 'BTC')
  kind: string;                          // 工具类型 ('option')
  option_type: 'call' | 'put';          // 期权类型: call(看涨) 或 put(看跌)
  strike: number;                        // 行权价格
  expiration_timestamp: number;          // 到期时间戳 (毫秒)
  tick_size: number;                     // 最小价格变动单位
  min_trade_amount: number;              // 最小交易数量
  contract_size: number;                 // 合约大小
  is_active: boolean;                    // 是否活跃
  settlement_period: string;             // 结算周期
  creation_timestamp: number;            // 创建时间戳
  base_currency: string;                 // 基础货币
  quote_currency: string;                // 计价货币
}

// 期权列表查询结果接口
export interface OptionListResult {
  success: boolean;
  message: string;
  data?: {
    instruments: DeribitOptionInstrument[];
    total: number;
    filtered: number;
    underlying: string;
    direction: 'long' | 'short';
  };
  error?: string;
}

// 希腊字母接口
export interface OptionGreeks {
  delta: number;                         // Delta值
  gamma: number;                         // Gamma值
  theta: number;                         // Theta值
  vega: number;                          // Vega值
  rho?: number;                          // Rho值 (可选)
}

// 期权详细信息接口 (包含希腊字母和价格信息)
export interface OptionDetails {
  instrument_name: string;               // 期权合约名称
  underlying_index: string;              // 标的指数
  underlying_price: number;              // 标的价格
  timestamp: number;                     // 时间戳
  state: string;                         // 状态
  settlement_price: number;              // 结算价格
  open_interest: number;                 // 持仓量
  min_price: number;                     // 最小价格
  max_price: number;                     // 最大价格
  mark_price: number;                    // 标记价格
  mark_iv: number;                       // 标记隐含波动率
  last_price: number;                    // 最新价格
  interest_rate: number;                 // 利率
  instrument_type: string;               // 工具类型
  index_price: number;                   // 指数价格
  greeks: OptionGreeks;                  // 希腊字母
  bid_iv: number;                        // 买入隐含波动率
  best_bid_price: number;                // 最佳买入价
  best_bid_amount: number;               // 最佳买入数量
  best_ask_price: number;                // 最佳卖出价
  best_ask_amount: number;               // 最佳卖出数量
  ask_iv: number;                        // 卖出隐含波动率
}

// Delta筛选结果接口
export interface DeltaFilterResult {
  instrument: DeribitOptionInstrument;   // 期权工具信息
  details: OptionDetails;                // 期权详细信息
  deltaDistance: number;                 // Delta距离目标值的差距
  spreadRatio: number;                   // 价差比率
}