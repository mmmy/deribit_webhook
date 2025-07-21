export interface ApiKeyConfig {
  name: string;
  description: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  testMode: boolean;
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