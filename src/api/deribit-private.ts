/**
 * Deribit私有API接口模块 - 需要认证
 * 基于Deribit API v2.1.1官方文档
 */

import axios, { AxiosInstance } from 'axios';

// 配置接口
interface DeribitConfig {
  baseUrl: string;
  timeout?: number;
}

// 认证信息
interface AuthInfo {
  accessToken: string;
  tokenType: string;
}

/**
 * Deribit私有API客户端类
 * 避免每次调用都传入config和auth参数
 */
export class DeribitPrivateAPI {
  private httpClient: AxiosInstance;

  constructor(config: DeribitConfig, auth: AuthInfo) {
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 15000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `${auth.tokenType} ${auth.accessToken}`,
        'User-Agent': 'Deribit-Options-Microservice/1.0.0'
      }
    });
  }

  /**
   * 更新认证信息
   */
  updateAuth(auth: AuthInfo) {
    this.httpClient.defaults.headers['Authorization'] = `${auth.tokenType} ${auth.accessToken}`;
  }

  /**
   * 获取账户摘要信息
   * GET /private/get_account_summary
   */
  async getAccountSummary(params: {
    currency: string;          // BTC, ETH
    extended?: boolean;        // 是否返回扩展信息
  }) {
    const response = await this.httpClient.get('/private/get_account_summary', { params });
    return response.data.result;
  }

  /**
   * 获取持仓列表
   * GET /private/get_positions
   */
  async getPositions(params: {
    currency: string;          // BTC, ETH
    kind?: string;             // option, future, spot
  }) {
    const response = await this.httpClient.get('/private/get_positions', { params });
    return response.data.result;
  }

  /**
   * 获取未平仓订单
   * GET /private/get_open_orders
   */
  async getOpenOrders(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    type?: string;             // all, limit, stop_all, stop_limit, stop_market
  }) {
    const response = await this.httpClient.get('/private/get_open_orders', { params });
    return response.data.result;
  }

  /**
   * 获取订单历史
   * GET /private/get_order_history
   */
  async getOrderHistory(params: {
    currency: string;          // BTC, ETH
    kind?: string;             // option, future, spot
    count?: number;            // 返回数量，默认20
    offset?: number;           // 偏移量
    include_old?: boolean;     // 是否包含旧订单
    include_unfilled?: boolean;// 是否包含未成交订单
  }) {
    const response = await this.httpClient.get('/private/get_order_history', { params });
    return response.data.result;
  }

  /**
   * 获取交易历史
   * GET /private/get_user_trades
   */
  async getUserTrades(params: {
    currency: string;          // BTC, ETH
    kind?: string;             // option, future, spot
    start_timestamp?: number;  // 开始时间戳
    end_timestamp?: number;    // 结束时间戳
    count?: number;            // 返回数量，默认10
    include_old?: boolean;     // 是否包含旧交易
    sorting?: 'asc' | 'desc';  // 排序方式
  }) {
    const response = await this.httpClient.get('/private/get_user_trades', { params });
    return response.data.result;
  }

  /**
   * 买入下单
   * POST /private/buy
   */
  async buy(params: {
    instrument_name: string;   // 期权合约名称
    amount: number;            // 数量
    type?: 'limit' | 'market' | 'stop_limit' | 'stop_market';  // 订单类型
    label?: string;            // 用户标签
    price?: number;            // 价格（限价单需要）
    time_in_force?: 'good_til_cancelled' | 'fill_or_kill' | 'immediate_or_cancel';
    max_show?: number;         // 最大显示数量
    post_only?: boolean;       // 只做maker
    reduce_only?: boolean;     // 只减仓
    stop_price?: number;       // 止损价格
    trigger?: 'index_price' | 'mark_price' | 'last_price';  // 触发价格类型
    advanced?: string;         // 高级选项
  }) {
    const response = await this.httpClient.post('/private/buy', params);
    return response.data.result;
  }

  /**
   * 卖出下单
   * POST /private/sell
   */
  async sell(params: {
    instrument_name: string;   // 期权合约名称
    amount: number;            // 数量
    type?: 'limit' | 'market' | 'stop_limit' | 'stop_market';  // 订单类型
    label?: string;            // 用户标签
    price?: number;            // 价格（限价单需要）
    time_in_force?: 'good_til_cancelled' | 'fill_or_kill' | 'immediate_or_cancel';
    max_show?: number;         // 最大显示数量
    post_only?: boolean;       // 只做maker
    reduce_only?: boolean;     // 只减仓
    stop_price?: number;       // 止损价格
    trigger?: 'index_price' | 'mark_price' | 'last_price';  // 触发价格类型
    advanced?: string;         // 高级选项
  }) {
    const response = await this.httpClient.post('/private/sell', params);
    return response.data.result;
  }

  /**
   * 取消订单
   * POST /private/cancel
   */
  async cancel(params: {
    order_id: string;          // 订单ID
  }) {
    const response = await this.httpClient.post('/private/cancel', params);
    return response.data.result;
  }

  /**
   * 取消所有订单
   * POST /private/cancel_all
   */
  async cancelAll(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    type?: string;             // all, limit, stop_all, stop_limit, stop_market
  }) {
    const response = await this.httpClient.post('/private/cancel_all', params);
    return response.data.result;
  }

  /**
   * 修改订单
   * POST /private/edit
   */
  async edit(params: {
    order_id: string;          // 订单ID
    amount: number;            // 新数量
    price?: number;            // 新价格
    post_only?: boolean;       // 只做maker
    advanced?: string;         // 高级选项
  }) {
    const response = await this.httpClient.post('/private/edit', params);
    return response.data.result;
  }

  /**
   * 获取订单状态
   * GET /private/get_order_state
   */
  async getOrderState(params: {
    order_id: string;          // 订单ID
  }) {
    const response = await this.httpClient.get('/private/get_order_state', { params });
    return response.data.result;
  }

  /**
   * 获取子账户列表
   * GET /private/get_subaccounts
   */
  async getSubaccounts(params?: {
    with_portfolio?: boolean;  // 是否包含组合信息
  }) {
    const response = await this.httpClient.get('/private/get_subaccounts', { params });
    return response.data.result;
  }

  /**
   * 获取保证金信息
   * GET /private/get_margins
   */
  async getMargins(params: {
    instrument_name: string;   // 期权合约名称
    amount: number;            // 数量
    price: number;             // 价格
  }) {
    const response = await this.httpClient.get('/private/get_margins', { params });
    return response.data.result;
  }

  /**
   * 获取存款地址
   * GET /private/get_current_deposit_address
   */
  async getCurrentDepositAddress(params: {
    currency: string;          // BTC, ETH
  }) {
    const response = await this.httpClient.get('/private/get_current_deposit_address', { params });
    return response.data.result;
  }

  /**
   * 提取资金
   * POST /private/withdraw
   */
  async withdraw(params: {
    currency: string;          // BTC, ETH
    address: string;           // 提取地址
    amount: number;            // 提取金额
    priority?: 'insane' | 'extreme_high' | 'very_high' | 'high' | 'mid' | 'low' | 'very_low';
    tfa?: string;              // 2FA代码
  }) {
    const response = await this.httpClient.post('/private/withdraw', params);
    return response.data.result;
  }

  /**
   * 获取提取历史
   * GET /private/get_withdrawals
   */
  async getWithdrawals(params: {
    currency: string;          // BTC, ETH
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
  }) {
    const response = await this.httpClient.get('/private/get_withdrawals', { params });
    return response.data.result;
  }

  /**
   * 获取存款历史
   * GET /private/get_deposits
   */
  async getDeposits(params: {
    currency: string;          // BTC, ETH
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
  }) {
    const response = await this.httpClient.get('/private/get_deposits', { params });
    return response.data.result;
  }
}

// 导出接口供外部使用
export { DeribitConfig, AuthInfo };

// 工厂函数，创建API实例
export const createDeribitPrivateAPI = (config: DeribitConfig, auth: AuthInfo) => {
  return new DeribitPrivateAPI(config, auth);
};