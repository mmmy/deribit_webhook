import { createAuthInfo, DeribitPrivateAPI, DeribitPublicAPI, getConfigByEnvironment } from "../api";
import { ConfigLoader } from "../config";
import type {
  DeltaFilterResult,
  DeribitOptionInstrument,
  DeribitPosition,
  OptionDetails,
} from "../types";
import type { DeribitInstrumentDetail } from "../types/deribit-instrument";

export class DeribitClient {
  private configLoader: ConfigLoader;
  private publicAPI: DeribitPublicAPI;
  private privateAPI: DeribitPrivateAPI | null = null;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    
    // 创建公共API实例
    const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
    const apiConfig = getConfigByEnvironment(isTestEnv);
    this.publicAPI = new DeribitPublicAPI(apiConfig);
  }

  /**
   * 初始化私有API（需要认证token）
   */
  private initPrivateAPI(accessToken: string) {
    const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
    const apiConfig = getConfigByEnvironment(isTestEnv);
    const authInfo = createAuthInfo(accessToken);
    this.privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);
  }

  /**
   * Test basic connectivity to Deribit API
   */
  async testConnectivity(): Promise<boolean> {
    try {
      console.log(`Testing connectivity to: ${this.publicAPI}`);
      
      const result = await this.publicAPI.getTime();
      console.log("Connectivity test successful:", result);
      return true;
    } catch (error) {
      console.error(
        "Connectivity test failed:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }

  /**
   * Authenticate with Deribit using client credentials
   */
  async authenticate(account: any): Promise<any | null> {
    // 注意：认证功能已迁移到DeribitAuth类
    // 这里保留接口兼容性，但建议直接使用DeribitAuth
    console.warn("DeribitClient.authenticate is deprecated, use DeribitAuth instead");
    return null;
  }

  /**
   * 获取期权/期货工具列表
   * @param currency 货币类型
   * @param kind 工具类型，如 'option', 'future'
   * @returns 工具列表
   */
  async getInstruments(
    currency: string = "BTC",
    kind: string = "option"
  ): Promise<DeribitOptionInstrument[]> {
    try {
      const result = await this.publicAPI.getInstruments({
        currency,
        kind,
        expired: false
      });
      return result || [];
    } catch (error) {
      console.error("Failed to get instruments:", error);
      return [];
    }
  }

  /**
   * 获取单个工具的详细信息
   * @param instrumentName 工具名称，如 BTC-PERPETUAL, BTC-25MAR23-50000-C
   * @returns 工具详细信息
   */
  async getInstrument(instrumentName: string): Promise<DeribitInstrumentDetail | null> {
    try {
      const result = await this.publicAPI.getInstrument({
        instrument_name: instrumentName
      });
      return result || null;
    } catch (error) {
      console.error(`Failed to get instrument ${instrumentName}:`, error);
      return null;
    }
  }

  /**
   * 获取期权详细信息
   * @param instrumentName 期权合约名称
   * @returns 期权详细信息
   */
  async getOptionDetails(
    instrumentName: string
  ): Promise<OptionDetails | null> {
    try {
      const result = await this.publicAPI.getTicker({
        instrument_name: instrumentName
      });
      return result || null;
    } catch (error) {
      console.error(
        `Failed to get option details for ${instrumentName}:`,
        error
      );
      return null;
    }
  }

  /**
   * 根据Delta值筛选最优期权
   * @param currency 货币类型
   * @param minExpiredDays 最小到期天数
   * @param delta 目标Delta值
   * @param longSide 是否为多头方向 (true=call, false=put)
   * @param underlyingAsset 可选的标的资产，用于USDC期权筛选
   * @returns 最优期权合约
   */
  async getInstrumentByDelta(
    currency: string,
    minExpiredDays: number,
    delta: number,
    longSide: boolean,
    underlyingAsset?: string
  ): Promise<DeltaFilterResult | null> {
    try {
      console.log(
        `🔍 Finding option by delta: ${currency}, minExpiredDays: ${minExpiredDays}, delta: ${delta}, longSide: ${longSide}${underlyingAsset ? `, underlying: ${underlyingAsset}` : ''}`
      );

      // 1. 使用getInstruments接口获取数据
      const instruments = await this.getInstruments(currency, "option");
      if (!instruments || instruments.length === 0) {
        console.log("❌ No instruments found");
        return null;
      }

      // 1.5. 如果指定了underlyingAsset，过滤出匹配的期权
      let filteredByUnderlying = instruments;
      if (underlyingAsset && currency === 'USDC') {
        filteredByUnderlying = instruments.filter(instrument =>
          instrument.instrument_name.startsWith(`${underlyingAsset}_USDC-`)
        );
        console.log(
          `📊 Filtered by underlying asset (${underlyingAsset}): ${filteredByUnderlying.length} instruments`
        );

        if (filteredByUnderlying.length === 0) {
          console.log(`❌ No ${underlyingAsset}_USDC instruments found`);
          return null;
        }
      }

      // 2. 过滤: longSide=true过滤call, 否则过滤put
      const optionType = longSide ? "call" : "put";
      let filteredInstruments = filteredByUnderlying.filter(
        (instrument) => instrument.option_type === optionType
      );
      console.log(
        `📊 Filtered by option type (${optionType}): ${filteredInstruments.length} instruments`
      );

      // 3. 重构筛选逻辑:
      // 3.1 从所有期权中找到最近的两个到期日
      const now = new Date();
      const minExpiryTime = new Date(
        now.getTime() + (minExpiredDays - 1) * 24 * 60 * 60 * 1000
      );

      // 过滤出符合最小到期天数要求的期权
      const validInstruments = filteredInstruments.filter((instrument) => {
        const expiryDate = new Date(instrument.expiration_timestamp);
        return expiryDate >= minExpiryTime;
      });

      if (validInstruments.length === 0) {
        console.log("❌ No instruments found after minimum expiry filtering");
        return null;
      }

      // 按到期时间分组
      const expiryGroups = new Map<number, typeof validInstruments>();
      validInstruments.forEach((instrument) => {
        const expiryTimestamp = instrument.expiration_timestamp;
        if (!expiryGroups.has(expiryTimestamp)) {
          expiryGroups.set(expiryTimestamp, []);
        }
        expiryGroups.get(expiryTimestamp)!.push(instrument);
      });

      // 获取最近的两个到期日
      const sortedExpiryDates = Array.from(expiryGroups.keys()).sort(
        (a, b) => a - b
      );
      const nearestTwoExpiries = sortedExpiryDates.slice(0, 2);
      console.log(`📅 Found ${nearestTwoExpiries.length} nearest expiry dates`);

      if (nearestTwoExpiries.length === 0) {
        console.log("❌ No valid expiry dates found");
        return null;
      }

      // 4. 遍历最近的两个到期日，每个到期日选择2个最接近目标Delta的期权
      let candidateOptions: DeltaFilterResult[] = [];

      for (const expiryTimestamp of nearestTwoExpiries) {
        const instrumentsForExpiry = expiryGroups.get(expiryTimestamp)!;
        console.log(
          `📊 Processing ${
            instrumentsForExpiry.length
          } instruments for expiry ${new Date(
            expiryTimestamp
          ).toLocaleDateString()}`
        );

        const optionsWithDelta: DeltaFilterResult[] = [];

        // 获取该到期日所有期权的详细信息
        for (const instrument of instrumentsForExpiry) {
          try {
            const details = await this.getOptionDetails(
              instrument.instrument_name
            );
            if (
              details &&
              details.greeks &&
              typeof details.greeks.delta === "number"
            ) {
              const deltaDistance = Math.abs(details.greeks.delta - delta);

              // 计算价差比率: (卖1价 - 买1价)/(买1价 + 卖1价)
              const spreadRatio =
                details.best_ask_price > 0 && details.best_bid_price > 0
                  ? (details.best_ask_price - details.best_bid_price) /
                    (details.best_ask_price + details.best_bid_price)
                  : 1; // 如果没有价格数据，设置为最大价差

              optionsWithDelta.push({
                instrument,
                details,
                deltaDistance,
                spreadRatio,
              });
            }
          } catch (error) {
            console.warn(
              `⚠️ Failed to get details for ${instrument.instrument_name}:`,
              error
            );
          }
        }

        // 排序并选择前2个
        optionsWithDelta.sort((a, b) => a.deltaDistance - b.deltaDistance);
        const top2ForExpiry = optionsWithDelta.slice(0, 2);

        console.log(
          `🎯 Selected ${top2ForExpiry.length} options for expiry ${new Date(
            expiryTimestamp
          ).toLocaleDateString()}`
        );
        top2ForExpiry.forEach((option) => {
          console.log(
            `   - ${
              option.instrument.instrument_name
            } (Delta: ${option.details.greeks.delta.toFixed(
              3
            )}, Distance: ${option.deltaDistance.toFixed(3)}), 盘口价差比例: ${(
              option.spreadRatio * 100
            ).toFixed(2)}%`
          );
        });

        candidateOptions.push(...top2ForExpiry);
      }

      candidateOptions = candidateOptions.filter(op => op.spreadRatio < 1 && op.spreadRatio > 0)

      if (candidateOptions.length === 0) {
        console.log("❌ No candidate options found with valid delta data");
        return null;
      }

      // 5. 从所有候选期权中选择最优的一个
      // 首先按Delta距离排序，然后按价差比率排序
      const bestOption = candidateOptions.reduce((best, current) =>
        current.deltaDistance < best.deltaDistance ||
        (current.deltaDistance === best.deltaDistance &&
          current.spreadRatio < best.spreadRatio)
          ? current
          : best.spreadRatio < current.spreadRatio
          ? best
          : current.spreadRatio < best.spreadRatio
          ? current
          : best
      );

      console.log(
        `✅ Selected option: ${bestOption.instrument.instrument_name}`
      );
      console.log(
        `📊 Delta: ${bestOption.details.greeks.delta} (target: ${delta}, distance: ${bestOption.deltaDistance})`
      );
      console.log(
        `💰 Spread ratio: ${(bestOption.spreadRatio * 100).toFixed(2)}%`
      );

      return bestOption;
    } catch (error) {
      console.error("❌ Error in getInstrumentByDelta:", error);
      return null;
    }
  }

  /**
   * 下期权订单
   */
  async placeOrder(
    instrumentName: string,
    direction: 'buy' | 'sell',
    amount: number,
    orderType: 'market' | 'limit' = 'market',
    price?: number,
    accessToken?: string
  ): Promise<any> {
    try {
      if (!accessToken) {
        throw new Error('Access token required for private API calls');
      }

      // 初始化私有API
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      const orderParams: any = {
        instrument_name: instrumentName,
        amount: amount,
        type: orderType,
      };

      if (orderType === 'limit' && price) {
        orderParams.price = price;
      }

      if (direction === 'buy') {
        return await this.privateAPI.buy(orderParams);
      } else {
        return await this.privateAPI.sell(orderParams);
      }
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  /**
   * 下带标签的期权订单
   */
  async placeOrderWithLabel(
    instrumentName: string,
    direction: 'buy' | 'sell',
    amount: number,
    orderType: 'market' | 'limit' = 'market',
    price?: number,
    accessToken?: string,
    label?: string
  ): Promise<any> {
    try {
      if (!accessToken) {
        throw new Error('Access token required for private API calls');
      }

      // 初始化私有API
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      const orderParams: any = {
        instrument_name: instrumentName,
        amount: amount,
        type: orderType,
      };

      if (orderType === 'limit' && price) {
        orderParams.price = price;
      }

      if (label) {
        orderParams.label = label;
      }

      if (direction === 'buy') {
        return await this.privateAPI.buy(orderParams);
      } else {
        return await this.privateAPI.sell(orderParams);
      }
    } catch (error) {
      console.error('Failed to place order with label:', error);
      throw error;
    }
  }

  /**
   * 获取未平仓订单
   */
  async getOpenOrders(accessToken: string, params?: {
    currency?: string;
    kind?: string;
    type?: string;
  }): Promise<any[]> {
    try {
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      return await this.privateAPI.getOpenOrders(params);
    } catch (error) {
      console.error('Failed to get open orders:', error);
      throw error;
    }
  }

  /**
   * 通过标签修改订单
   */
  async editOrderByLabel(
    accessToken: string,
    params: {
      label: string;
      instrument_name: string;
      amount?: number;  // 可选参数，如果不传则只修改价格
      price?: number;
      post_only?: boolean;
      advanced?: string;
    }
  ): Promise<any> {
    try {
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      return await this.privateAPI.editByLabel(params);
    } catch (error) {
      console.error('Failed to edit order by label:', error);
      throw error;
    }
  }

  /**
   * 获取订单状态
   */
  async getOrderState(accessToken: string, orderId: string) {
    try {
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      return await this.privateAPI.getOrderState({ order_id: orderId });
    } catch (error) {
      console.error('Failed to get order state:', error);
      throw error;
    }
  }

  /**
   * 编辑订单
   */
  async editOrder(accessToken: string, params: {
    order_id: string;
    amount: number;
    price?: number;
  }) {
    try {
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      return await this.privateAPI.edit(params);
    } catch (error) {
      console.error('Failed to edit order:', error);
      throw error;
    }
  }

  /**
   * 获取仓位信息
   * @returns 过滤掉size=0的有效仓位列表
   */
  async getPositions(accessToken: string, params?: {
    currency?: string;
    kind?: string;
  }): Promise<DeribitPosition[]> {
    try {
      this.initPrivateAPI(accessToken);

      if (!this.privateAPI) {
        throw new Error('Failed to initialize private API');
      }

      // 默认参数
      const requestParams = {
        currency: params?.currency,
        kind: params?.kind
      };

      // 调用实际的API获取仓位信息
      const positions = await this.privateAPI.getPositions(requestParams);

      console.log(`📊 Retrieved ${positions.length} active positions (size ≠ 0) for ${requestParams.currency}${requestParams.kind ? ` (${requestParams.kind})` : ''}`);

      return positions;
    } catch (error) {
      console.error('Failed to get positions:', error);
      throw error;
    }
  }
}