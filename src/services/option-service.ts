import { ConfigLoader } from '../config';
import {
  DeribitOptionInstrument,
  OptionListParams,
  OptionListResult
} from '../types';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';

/**
 * 期权服务类 - 提供期权相关功能
 */
export class OptionService {
  private configLoader: ConfigLoader;
  private deribitAuth: DeribitAuth;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;
  private useMockMode: boolean;

  constructor(
    configLoader?: ConfigLoader,
    deribitAuth?: DeribitAuth,
    deribitClient?: DeribitClient,
    mockClient?: MockDeribitClient
  ) {
    // 支持依赖注入，但保持向后兼容
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.deribitAuth = deribitAuth || new DeribitAuth();
    this.deribitClient = deribitClient || new DeribitClient();
    this.mockClient = mockClient || new MockDeribitClient();
    this.useMockMode = process.env.USE_MOCK_MODE === 'true';
  }

  /**
   * 获取期权列表
   * @param params 期权列表查询参数
   * @param accountName 可选账户名称，用于认证
   * @returns 期权列表查询结果
   */
  public async getOptionsList(
    params: OptionListParams,
    accountName?: string
  ): Promise<OptionListResult> {
    try {
      console.log(`🔍 Getting options list for ${params.underlying}, direction: ${params.direction}`);
      
      // 1. 获取原始期权列表
      let instruments: DeribitOptionInstrument[] = [];
      
      if (this.useMockMode) {
        // 使用模拟数据
        const mockData = await this.mockClient.getInstruments(params.underlying, 'option');
        instruments = mockData as DeribitOptionInstrument[];
      } else {
        // 使用真实API数据
        const realData = await this.deribitClient.getInstruments(params.underlying, 'option');
        instruments = realData as DeribitOptionInstrument[];
      }
      
      if (!instruments || instruments.length === 0) {
        return {
          success: false,
          message: `No options found for ${params.underlying}`,
          error: 'Empty instruments list'
        };
      }
      
      // 2. 根据方向过滤期权类型 (long -> call, short -> put)
      // 注意：这是简化的逻辑，实际交易中long/short可以应用于call和put
      const optionType = params.direction === 'long' ? 'call' : 'put';
      let filteredInstruments = instruments.filter(
        instrument => instrument.option_type === optionType
      );
      
      // 3. 应用额外的过滤条件
      if (params.minStrike !== undefined) {
        filteredInstruments = filteredInstruments.filter(
          instrument => instrument.strike >= (params.minStrike || 0)
        );
      }
      
      if (params.maxStrike !== undefined) {
        const maxStrike = params.maxStrike;
        filteredInstruments = filteredInstruments.filter(
          instrument => instrument.strike <= maxStrike
        );
      }
      
      if (params.minExpiry !== undefined) {
        const minTimestamp = params.minExpiry.getTime();
        filteredInstruments = filteredInstruments.filter(
          instrument => instrument.expiration_timestamp >= minTimestamp
        );
      }
      
      if (params.maxExpiry !== undefined) {
        const maxTimestamp = params.maxExpiry.getTime();
        filteredInstruments = filteredInstruments.filter(
          instrument => instrument.expiration_timestamp <= maxTimestamp
        );
      }
      
      // 4. 按到期时间排序
      filteredInstruments.sort((a, b) => a.expiration_timestamp - b.expiration_timestamp);
      
      // 5. 返回结果
      return {
        success: true,
        message: `Successfully retrieved ${filteredInstruments.length} ${params.direction} options for ${params.underlying}`,
        data: {
          instruments: filteredInstruments,
          total: instruments.length,
          filtered: filteredInstruments.length,
          underlying: params.underlying,
          direction: params.direction
        }
      };
      
    } catch (error) {
      console.error('Error getting options list:', error);
      return {
        success: false,
        message: 'Failed to get options list',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 获取期权详细信息
   * @param instrumentName 期权合约名称
   * @returns 期权详细信息
   */
  public async getOptionDetails(instrumentName: string): Promise<any> {
    try {
      if (this.useMockMode) {
        // 返回模拟数据
        return this.generateMockOptionDetails(instrumentName);
      }
      
      // 使用重构后的DeribitClient调用API
      return await this.deribitClient.getOptionDetails(instrumentName);
    } catch (error) {
      console.error(`Failed to get details for ${instrumentName}:`, error);
      throw error;
    }
  }

  /**
   * 生成模拟的期权详细信息
   * @param instrumentName 期权合约名称
   * @returns 模拟的期权详细信息
   */
  private generateMockOptionDetails(instrumentName: string): any {
    // 解析合约名称
    const parts = instrumentName.split('-');
    const currency = parts[0];
    const optionType = parts[3] === 'C' ? 'call' : 'put';
    const strike = parseFloat(parts[2]);
    
    // 生成模拟数据
    return {
      instrument_name: instrumentName,
      underlying_index: `${currency}_USD`,
      underlying_price: currency === 'BTC' ? 50000 : 3000,
      timestamp: Date.now(),
      stats: {
        volume: Math.random() * 100,
        price_change: (Math.random() * 10) - 5,
        low: Math.random() * 0.1,
        high: Math.random() * 0.2
      },
      state: 'open',
      settlement_price: 0,
      open_interest: Math.floor(Math.random() * 1000),
      min_price: 0.0001,
      max_price: 0.5,
      mark_price: Math.random() * 0.1,
      mark_iv: 80 + (Math.random() * 20),
      last_price: Math.random() * 0.1,
      interest_rate: 0,
      instrument_type: 'option',
      index_price: currency === 'BTC' ? 50000 : 3000,
      greeks: {
        vega: Math.random() * 10,
        theta: -1 * Math.random() * 10,
        rho: Math.random() * 1,
        gamma: Math.random() * 0.001,
        delta: optionType === 'call' ? 0.5 + (Math.random() * 0.5) : -0.5 - (Math.random() * 0.5)
      },
      bid_iv: 75 + (Math.random() * 20),
      best_bid_price: Math.random() * 0.05,
      best_bid_amount: Math.random() * 10,
      best_ask_price: Math.random() * 0.15,
      best_ask_amount: Math.random() * 10,
      ask_iv: 85 + (Math.random() * 20)
    };
  }
}
