/**
 * Deribit私有API接口模块 - 需要认证
 * 基于Deribit API v2.1.1官方文档
 */

import axios, { AxiosInstance } from 'axios';
import type { DeribitOrder, DeribitPosition } from '../types';

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
    // Deribit JSON-RPC endpoint
    const jsonRpcUrl = config.baseUrl.endsWith('/api/v2') ? config.baseUrl : `${config.baseUrl}/api/v2`;

    this.httpClient = axios.create({
      baseURL: jsonRpcUrl,
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
   * JSON-RPC: private/get_account_summary
   */
  async getAccountSummary(params: {
    currency: string;          // BTC, ETH
    extended?: boolean;        // 是否返回扩展信息
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_account_summary",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取持仓列表
   * JSON-RPC: private/get_positions
   * @returns 过滤掉size=0的有效仓位列表
   */
  async getPositions(params: {
    currency?: string;          // BTC, ETH
    kind?: string;             // option, future, spot
  }): Promise<DeribitPosition[]> {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_positions",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    const allPositions: DeribitPosition[] = response.data.result || [];

    // 过滤掉size=0的仓位，只返回有实际持仓的记录
    const activePositions = allPositions.filter(position => +position.size !== 0);

    console.log(`📊 Positions filtered: ${allPositions.length} total → ${activePositions.length} active (size ≠ 0)`);

    return activePositions;
  }

  /**
   * 获取未平仓订单
   * JSON-RPC: private/get_open_orders
   */
  async getOpenOrders(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    type?: string;             // all, limit, stop_all, stop_limit, stop_market
  }): Promise<DeribitOrder[]> {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_open_orders",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取订单历史
   * JSON-RPC: private/get_order_history
   */
  async getOrderHistory(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
    include_old?: boolean;     // 是否包含旧订单
    include_unfilled?: boolean;// 是否包含未成交订单
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_order_history",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取用户交易历史
   * JSON-RPC: private/get_user_trades
   */
  async getUserTrades(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
    include_old?: boolean;     // 是否包含旧交易
    sorting?: 'asc' | 'desc';  // 排序方式
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_user_trades",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 买入下单
   * JSON-RPC: private/buy
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
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/buy",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 卖出下单
   * JSON-RPC: private/sell
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
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/sell",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 平仓指定工具的所有仓位
   * JSON-RPC: private/close_position
   */
  async closePosition(params: {
    instrument_name: string;   // 期权合约名称
    type?: 'limit' | 'market'; // 订单类型，默认market
    price?: number;            // 价格（限价单必需）
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/close_position",
      params: {
        instrument_name: params.instrument_name,
        type: params.type || 'market',
        ...params.price && { price: params.price }
      }
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 取消订单
   * JSON-RPC: private/cancel
   */
  async cancel(params: {
    order_id: string;          // 订单ID
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/cancel",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 取消所有订单
   * JSON-RPC: private/cancel_all
   */
  async cancelAll(params?: {
    currency?: string;         // BTC, ETH
    kind?: string;             // option, future, spot
    type?: string;             // all, limit, stop_all, stop_limit, stop_market
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/cancel_all",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

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
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/edit",
      params: params
    };

    try {
      const response = await this.httpClient.post('', jsonRpcRequest);

      if (response.data.error) {
        console.error('Deribit API error details:', response.data.error);
        throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
      }

      return response.data.result;
    } catch (error) {
      // 如果是HTTP错误，尝试解析响应中的错误信息
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response && axiosError.response.data) {
          console.error('Full response data:', axiosError.response.data);
          if (axiosError.response.data.error) {
            console.error('Deribit API error details:', axiosError.response.data.error);
            throw new Error(`Deribit API error: ${axiosError.response.data.error.message} (code: ${axiosError.response.data.error.code})`);
          }
        }
      }
      throw error;
    }
  }

  /**
   * 通过标签修改订单
   * JSON-RPC: private/edit_by_label
   */
  async editByLabel(params: {
    label: string;             // 订单标签
    instrument_name: string;   // 工具名称
    amount?: number;           // 新数量（可选，如果不传则只修改价格）
    price?: number;            // 新价格
    post_only?: boolean;       // 只做maker
    advanced?: string;         // 高级选项
  }) {
    // 验证必需参数
    if (!params.label || !params.instrument_name) {
      throw new Error('label and instrument_name are required parameters');
    }

    // 验证至少有一个修改参数
    if (params.amount === undefined && params.price === undefined) {
      throw new Error('At least one of amount or price must be provided');
    }

    console.log(`🔧 Editing order by label:`, {
      label: params.label,
      instrument_name: params.instrument_name,
      amount: params.amount,
      price: params.price,
      post_only: params.post_only
    });

    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/edit_by_label",
      params: params
    };

    try {
      const response = await this.httpClient.post('', jsonRpcRequest);

      if (response.data.error) {
        console.error(`❌ Deribit API error for edit_by_label:`, {
          error: response.data.error,
          request_params: params
        });
        throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
      }

      console.log(`✅ Order edited successfully:`, response.data.result);
      return response.data.result;
    } catch (error) {
      console.error(`❌ HTTP request failed for edit_by_label:`, {
        error: error instanceof Error ? error.message : String(error),
        request_params: params
      });
      throw error;
    }
  }

  /**
   * 获取订单状态
   * JSON-RPC: private/get_order_state
   */
  async getOrderState(params: {
    order_id: string;          // 订单ID
  }): Promise<DeribitOrder> {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_order_state",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 通过标签获取订单状态
   * JSON-RPC: private/get_order_state_by_label
   */
  async getOrderStateByLabel(params: {
    label: string;             // 订单标签
    instrument_name: string;   // 工具名称
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_order_state_by_label",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取子账户列表
   * JSON-RPC: private/get_subaccounts
   */
  async getSubaccounts(params?: {
    with_portfolio?: boolean;  // 是否包含组合信息
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_subaccounts",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取保证金信息
   * JSON-RPC: private/get_margins
   */
  async getMargins(params: {
    instrument_name: string;   // 期权合约名称
    amount: number;            // 数量
    price: number;             // 价格
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_margins",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取存款地址
   * JSON-RPC: private/get_current_deposit_address
   */
  async getCurrentDepositAddress(params: {
    currency: string;          // BTC, ETH
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_current_deposit_address",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 提取资金
   * JSON-RPC: private/withdraw
   */
  async withdraw(params: {
    currency: string;          // BTC, ETH
    address: string;           // 提取地址
    amount: number;            // 提取金额
    priority?: 'insane' | 'extreme_high' | 'very_high' | 'high' | 'mid' | 'low' | 'very_low';
    tfa?: string;              // 2FA代码
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/withdraw",
      params: params
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取提取历史
   * JSON-RPC: private/get_withdrawals
   */
  async getWithdrawals(params: {
    currency: string;          // BTC, ETH
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_withdrawals",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }

  /**
   * 获取存款历史
   * JSON-RPC: private/get_deposits
   */
  async getDeposits(params: {
    currency: string;          // BTC, ETH
    count?: number;            // 返回数量
    offset?: number;           // 偏移量
  }) {
    const jsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "private/get_deposits",
      params: params || {}
    };

    const response = await this.httpClient.post('', jsonRpcRequest);

    if (response.data.error) {
      throw new Error(`Deribit API error: ${response.data.error.message} (code: ${response.data.error.code})`);
    }

    return response.data.result;
  }
}

// 导出接口供外部使用
export { AuthInfo, DeribitConfig };

// 工厂函数，创建API实例
export const createDeribitPrivateAPI = (config: DeribitConfig, auth: AuthInfo) => {
  return new DeribitPrivateAPI(config, auth);
};