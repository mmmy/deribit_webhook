/**
 * Deribit公共API接口模块 - 不需要认证
 * 基于Deribit API v2.1.1官方文档
 */

import axios, { AxiosInstance } from 'axios';
import { DeribitInstrumentDetail } from '../types/deribit-instrument';

// 配置接口
interface DeribitConfig {
  baseUrl: string;
  timeout?: number;
}

/**
 * Deribit公共API客户端类
 * 避免每次调用都传入config参数
 */
export class DeribitPublicAPI {
  private httpClient: AxiosInstance;

  constructor(config: DeribitConfig) {
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Deribit-Options-Microservice/1.0.0'
      }
    });
  }

  /**
   * 获取服务器时间
   * GET /public/get_time
   */
  async getTime() {
    const response = await this.httpClient.get('/public/get_time');
    return response.data.result;
  }

  /**
   * 获取期权/期货工具列表
   * GET /public/get_instruments
   */
  async getInstruments(params: {
    currency: string;          // BTC, ETH, etc.
    kind?: string;             // option, future, spot
    expired?: boolean;         // 是否包含已过期
  }) {
    const response = await this.httpClient.get('/public/get_instruments', { params });
    return response.data.result;
  }

  /**
   * 获取期权/期货的ticker信息
   * GET /public/ticker
   */
  async getTicker(params: {
    instrument_name: string;   // 期权合约名称
  }) {
    const response = await this.httpClient.get('/public/ticker', { params });
    return response.data.result;
  }

  /**
   * 获取订单簿
   * GET /public/get_order_book
   */
  async getOrderBook(params: {
    instrument_name: string;   // 期权合约名称
    depth?: number;            // 深度，默认5
  }) {
    const response = await this.httpClient.get('/public/get_order_book', { params });
    return response.data.result;
  }

  /**
   * 获取指数价格
   * GET /public/get_index_price
   */
  async getIndexPrice(params: {
    index_name: string;        // btc_usd, eth_usd
  }) {
    const response = await this.httpClient.get('/public/get_index_price', { params });
    return response.data.result;
  }

  /**
   * 获取最新交易
   * GET /public/get_last_trades_by_instrument
   */
  async getLastTradesByInstrument(params: {
    instrument_name: string;   // 期权合约名称
    start_seq?: number;        // 起始序列号
    end_seq?: number;          // 结束序列号
    count?: number;            // 返回数量，默认10
    include_old?: boolean;     // 是否包含旧数据
    sorting?: 'asc' | 'desc';  // 排序方式
  }) {
    const response = await this.httpClient.get('/public/get_last_trades_by_instrument', { params });
    return response.data.result;
  }

  /**
   * 获取历史波动率
   * GET /public/get_historical_volatility
   */
  async getHistoricalVolatility(params: {
    currency: string;          // BTC, ETH
  }) {
    const response = await this.httpClient.get('/public/get_historical_volatility', { params });
    return response.data.result;
  }

  /**
   * 获取资金费率历史
   * GET /public/get_funding_rate_history
   */
  async getFundingRateHistory(params: {
    instrument_name: string;   // 期权合约名称
    start_timestamp?: number;  // 开始时间戳
    end_timestamp?: number;    // 结束时间戳
  }) {
    const response = await this.httpClient.get('/public/get_funding_rate_history', { params });
    return response.data.result;
  }

  /**
   * 获取公告
   * GET /public/get_announcements
   */
  async getAnnouncements() {
    const response = await this.httpClient.get('/public/get_announcements');
    return response.data.result;
  }

  /**
   * 测试连接
   * GET /public/test
   */
  async testConnection(params?: {
    expected_result?: string;  // 期望的测试结果
  }) {
    const response = await this.httpClient.get('/public/test', { params });
    return response.data.result;
  }

  /**
   * 获取所有货币列表
   * GET /public/get_currencies
   */
  async getCurrencies() {
    const response = await this.httpClient.get('/public/get_currencies');
    return response.data.result;
  }

  /**
   * 获取交易量统计
   * GET /public/get_book_summary_by_currency
   */
  async getBookSummaryByCurrency(params: {
    currency: string;          // BTC, ETH
    kind?: string;             // option, future
  }) {
    const response = await this.httpClient.get('/public/get_book_summary_by_currency', { params });
    return response.data.result;
  }

  /**
   * 获取合约规格
   * GET /public/get_book_summary_by_instrument
   */
  async getBookSummaryByInstrument(params: {
    instrument_name: string;   // 期权合约名称
  }) {
    const response = await this.httpClient.get('/public/get_book_summary_by_instrument', { params });
    return response.data.result;
  }

  /**
   * 获取单个工具的详细信息
   * GET /public/get_instrument
   */
  async getInstrument(params: {
    instrument_name: string;   // 工具名称，如 BTC-PERPETUAL, BTC-25MAR23-50000-C
  }): Promise<DeribitInstrumentDetail> {
    const response = await this.httpClient.get('/public/get_instrument', { params });
    return response.data.result;
  }
}

// 导出配置接口供外部使用
export { DeribitConfig };

// 重新导出类型定义供外部使用
  export { DeribitInstrumentDetail } from '../types/deribit-instrument';

// 工厂函数，创建API实例
export const createDeribitPublicAPI = (config: DeribitConfig) => {
  return new DeribitPublicAPI(config);
};