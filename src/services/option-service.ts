import { ConfigLoader } from '../config';
import {
    DeribitOptionInstrument,
    OptionListParams,
    OptionListResult
} from '../types';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';

/**
 * 期权服务类 - 提供期权相关功能
 */
export class OptionService {
  private configLoader: ConfigLoader;
  private deribitAuth: DeribitAuth;
  private deribitClient: DeribitClient;

  constructor(
    configLoader?: ConfigLoader,
    deribitAuth?: DeribitAuth,
    deribitClient?: DeribitClient
  ) {
    // 支持依赖注入，但保持向后兼容
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.deribitAuth = deribitAuth || new DeribitAuth();
    this.deribitClient = deribitClient || new DeribitClient();
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

      // 使用真实API数据
      const realData = await this.deribitClient.getInstruments(params.underlying, 'option');
      instruments = realData as DeribitOptionInstrument[];
      
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
      // 使用重构后的DeribitClient调用API
      return await this.deribitClient.getOptionDetails(instrumentName);
    } catch (error) {
      console.error(`Failed to get details for ${instrumentName}:`, error);
      throw error;
    }
  }
}
