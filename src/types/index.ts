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

// Deribit认证响应数据
export interface DeribitAuthResult {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
  enabled_features: string[];
  sid?: string;
}

// Deribit API标准响应格式
export interface AuthResponse {
  jsonrpc: string;
  result: DeribitAuthResult;
  testnet: boolean;
  usIn: number;
  usOut: number;
  usDiff: number;
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
  tv_id: number;                        // TradingView信号ID
  alertMessage?: string;                 // 警报消息
  comment?: string;                      // 注释
  qtyType: 'fixed' | 'cash'; // 数量类型
  delta1?: number;                       // 期权Delta值，用于开仓时选择期权
  n?: number;                           // 最小到期天数，用于开仓时选择期权
  delta2?: number;                       // 目标Delta值，用于将非立即成交的开仓订单记录到delta数据库
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
  qtyType?: 'fixed' | 'cash'; // 数量类型
  delta1?: number;                       // 期权Delta值，用于开仓时选择期权，同时记录到move_position_delta字段
  delta2?: number;                       // 目标Delta值，用于将非立即成交的开仓订单记录到delta数据库
}

// 期权交易结果接口
export interface OptionTradingResult {
  success: boolean;
  orderId?: string;
  message: string;
  instrumentName?: string;
  executedQuantity?: number;
  executedPrice?: number;
  orderLabel?: string;                   // 订单标签
  finalOrderState?: string;              // 最终订单状态
  positionInfo?: DetailedPositionInfo;   // 详细仓位信息
  error?: string;
}

// Deribit仓位信息接口
export interface DeribitPosition {
  instrument_name: string;           // 工具名称
  size: number;                      // 仓位大小（正数为多头，负数为空头）
  size_currency?: number;            // 以货币计价的仓位大小
  direction: 'buy' | 'sell' | 'zero'; // 仓位方向
  average_price: number;             // 平均开仓价格
  average_price_usd?: number;        // 以USD计价的平均开仓价格
  mark_price: number;                // 标记价格
  index_price?: number;              // 指数价格
  estimated_liquidation_price?: number; // 预估强平价格
  unrealized_pnl: number;            // 未实现盈亏
  realized_pnl?: number;             // 已实现盈亏
  total_profit_loss: number;         // 总盈亏
  maintenance_margin: number;        // 维持保证金
  initial_margin: number;            // 初始保证金
  settlement_price?: number;         // 结算价格
  delta?: number;                    // Delta值（期权）
  gamma?: number;                    // Gamma值（期权）
  theta?: number;                    // Theta值（期权）
  vega?: number;                     // Vega值（期权）
  floating_profit_loss?: number;    // 浮动盈亏
  floating_profit_loss_usd?: number; // 以USD计价的浮动盈亏
  kind: 'option' | 'future' | 'spot'; // 工具类型
  leverage?: number;                 // 杠杆倍数
  open_orders_margin?: number;       // 未平仓订单保证金
  interest_value?: number;           // 利息价值
}

// 前向声明，避免循环依赖
export interface DetailedPositionInfo {
  relatedOrders: any[];
  totalOpenOrders: number;
  positions: any[];
  totalPositions: number;
  executionStats: any;
  summary: any;
  metadata: any;
  error?: string;
  warnings?: string[];
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

// Tick Size步骤接口 - 用于分级tick size规则
export interface TickSizeStep {
  above_price: number;                   // 价格阈值
  tick_size: number;                     // 对应的tick size
}

// Deribit期权工具信息接口
export interface DeribitOptionInstrument {
  instrument_name: string;               // 期权合约名称 (如 'BTC-25JUL25-50000-C')
  currency: string;                      // 标的货币 (如 'BTC')
  kind: string;                          // 工具类型 ('option')
  option_type: 'call' | 'put';          // 期权类型: call(看涨) 或 put(看跌)
  strike: number;                        // 行权价格
  expiration_timestamp: number;          // 到期时间戳 (毫秒)
  tick_size: number;                     // 基础最小价格变动单位
  tick_size_steps?: TickSizeStep[];      // 分级tick size规则 (可选)
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

// Deribit认证授权类型
export type DeribitGrantType =
  | 'client_credentials'                 // 客户端凭证授权
  | 'client_signature'                   // 客户端签名授权
  | 'refresh_token';                     // 刷新令牌授权

// Deribit访问范围
export type DeribitScope =
  | 'mainaccount'                        // 主账户访问
  | 'connection'                         // 连接级访问
  | `session:${string}`                  // 会话级访问 (session:name)
  | 'account:read'                       // 账户只读访问
  | 'account:read_write'                 // 账户读写访问
  | 'trade:read'                         // 交易只读访问
  | 'trade:read_write'                   // 交易读写访问
  | 'wallet:read'                        // 钱包只读访问
  | 'wallet:read_write'                  // 钱包读写访问
  | 'wallet:none'                        // 禁止钱包访问
  | 'account:none'                       // 禁止账户访问
  | 'trade:none'                         // 禁止交易访问
  | `expires:${number}`                  // 过期时间 (expires:NUMBER)
  | `ip:${string}`                       // IP限制 (ip:ADDR)
  | 'block_trade:read'                   // 大宗交易只读
  | 'block_trade:read_write'             // 大宗交易读写
  | 'block_rfq:read'                     // 大宗RFQ只读
  | 'block_rfq:read_write';              // 大宗RFQ读写

// 基础认证参数接口
export interface DeribitBaseAuthParams {
  grant_type: DeribitGrantType;          // 授权类型
  scope?: string;                        // 访问范围 (多个scope用空格分隔)
}

// 客户端凭证认证参数
export interface DeribitClientCredentialsParams extends DeribitBaseAuthParams {
  grant_type: 'client_credentials';
  client_id: string;                     // 客户端ID
  client_secret: string;                 // 客户端密钥
}

// 客户端签名认证参数
export interface DeribitClientSignatureParams extends DeribitBaseAuthParams {
  grant_type: 'client_signature';
  client_id: string;                     // 客户端ID
  timestamp: number;                     // 时间戳 (毫秒)
  signature: string;                     // HMAC-SHA256签名
  nonce: string;                         // 随机字符串
  data?: string;                         // 可选的用户数据
}

// 刷新令牌认证参数
export interface DeribitRefreshTokenParams extends DeribitBaseAuthParams {
  grant_type: 'refresh_token';
  refresh_token: string;                 // 刷新令牌
}

// 联合认证参数类型
export type DeribitAuthParams =
  | DeribitClientCredentialsParams
  | DeribitClientSignatureParams
  | DeribitRefreshTokenParams;

// 认证请求的完整参数接口
export interface DeribitAuthRequestParams {
  // 基础参数
  grant_type: DeribitGrantType;
  scope?: string;

  // 客户端凭证参数
  client_id: string;
  client_secret: string;

  // 客户端签名参数
  timestamp?: number;
  signature?: string;
  nonce?: string;
  data?: string;

  // 刷新令牌参数
  refresh_token?: string;

  // 安全密钥授权参数 (可选)
  authorization_data?: string;           // TFA代码或其他授权数据
  challenge?: string;                    // 服务器挑战字符串
}