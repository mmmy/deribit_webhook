import axios, { AxiosInstance, AxiosResponse } from "axios";
import { ConfigLoader } from "../config";
import type {
  DeltaFilterResult,
  DeribitOptionInstrument,
  OptionDetails,
} from "../types";
import { ApiKeyConfig, AuthResponse } from "../types";

export class DeribitClient {
  private httpClient: AxiosInstance;
  private configLoader: ConfigLoader;

  constructor() {
    this.configLoader = ConfigLoader.getInstance();
    this.httpClient = axios.create({
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Deribit-Options-Microservice/1.0.0",
      },
    });
  }

  /**
   * Test basic connectivity to Deribit API
   */
  async testConnectivity(): Promise<boolean> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl();
      console.log(`Testing connectivity to: ${baseUrl}`);

      const response = await this.httpClient.get(`${baseUrl}/public/get_time`, {
        timeout: 10000,
      });

      console.log("Connectivity test successful:", response.data);
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
  async authenticate(account: ApiKeyConfig): Promise<AuthResponse | null> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl();
      console.log(`Authenticating with: ${baseUrl}/public/auth`);

      const params = {
        grant_type: account.grantType,
        client_id: account.clientId,
        client_secret: account.clientSecret,
      };

      console.log("Auth params:", { ...params, client_secret: "***" });

      const response: AxiosResponse<AuthResponse> = await this.httpClient.get(
        `${baseUrl}/public/auth`,
        { params, timeout: 10000 }
      );

      console.log("Authentication successful:", {
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        scope: response.data.scope,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("Auth error:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
        });
      } else {
        console.error("Auth error:", error);
      }
      return null;
    }
  }

  /**
   * Get available instruments (options)
   */
  /**
   * 获取可交易工具列表
   * @param currency 货币类型，如 'BTC', 'ETH'
   * @param kind 工具类型，如 'option', 'future'
   * @returns 工具列表
   */
  async getInstruments(
    currency: string = "BTC",
    kind: string = "option"
  ): Promise<DeribitOptionInstrument[]> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl();
      const response = await this.httpClient.get(
        `${baseUrl}/public/get_instruments`,
        {
          params: { currency, kind, expired: false },
        }
      );

      return response.data.result || [];
    } catch (error) {
      console.error("Failed to get instruments:", error);
      return [];
    }
  }

  /**
   * 获取期权详细信息 (包含希腊字母和价格信息)
   * @param instrumentName 期权合约名称
   * @returns 期权详细信息
   */
  async getOptionDetails(
    instrumentName: string
  ): Promise<OptionDetails | null> {
    try {
      const baseUrl = this.configLoader.getApiBaseUrl();
      const response = await this.httpClient.get(`${baseUrl}/public/ticker`, {
        params: { instrument_name: instrumentName },
      });

      return response.data.result || null;
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
   * @param currency 货币类型，如 'BTC', 'ETH'
   * @param minExpiredDays 最小到期天数
   * @param delta 目标Delta值
   * @param longSide 是否为多头方向 (true=call, false=put)
   * @returns 最优期权合约
   */
  async getInstrumentByDelta(
    currency: string,
    minExpiredDays: number,
    delta: number,
    longSide: boolean
  ): Promise<DeltaFilterResult | null> {
    try {
      console.log(
        `🔍 Finding option by delta: ${currency}, minExpiredDays: ${minExpiredDays}, delta: ${delta}, longSide: ${longSide}`
      );

      // 1. 使用getInstruments接口获取数据
      const instruments = await this.getInstruments(currency, "option");
      if (!instruments || instruments.length === 0) {
        console.log("❌ No instruments found");
        return null;
      }

      // 2. 过滤: longSide=true过滤call, 否则过滤put
      const optionType = longSide ? "call" : "put";
      let filteredInstruments = instruments.filter(
        (instrument) => instrument.option_type === optionType
      );
      console.log(
        `📊 Filtered by option type (${optionType}): ${filteredInstruments.length} instruments`
      );

      // 3. 重构筛选逻辑:
      // 3.1 从所有期权中找到最近的两个到期日
      const now = new Date();
      const minExpiryTime = new Date(
        now.getTime() + minExpiredDays * 24 * 60 * 60 * 1000
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

      // 3.2 每个到期日选择Delta最接近的2个期权
      const candidateOptions: DeltaFilterResult[] = [];

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

        // 按Delta距离排序，取前2个
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
            )}, Distance: ${option.deltaDistance.toFixed(3)})`
          );
        });

        candidateOptions.push(...top2ForExpiry);
      }

      if (candidateOptions.length === 0) {
        console.log("❌ No candidate options found with valid delta data");
        return null;
      }

      console.log(`🔍 Total candidate options: ${candidateOptions.length}`);

      // 3.3 从这4个(或更少)期权中选择盘口价差最小的
      const bestOption = candidateOptions.reduce((best, current) =>
        current.spreadRatio < best.spreadRatio ? current : best
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
      const baseUrl = this.configLoader.getApiBaseUrl();
      const endpoint = direction === 'buy' ? '/private/buy' : '/private/sell';
      
      const orderParams = {
        instrument_name: instrumentName,
        amount: amount,
        type: orderType,
        ...(orderType === 'limit' && price && { price })
      };

      const response = await this.httpClient.post(`${baseUrl}${endpoint}`, orderParams, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`Deribit API error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }
}
