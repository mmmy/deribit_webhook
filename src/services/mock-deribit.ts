import type { DeltaFilterResult, DeribitOptionInstrument, OptionDetails } from '../types';
import { ApiKeyConfig, AuthResponse } from '../types';
import type { DeribitInstrumentDetail } from '../types/deribit-instrument';

export class MockDeribitClient {
  /**
   * Mock authentication for development/testing when network is unavailable
   */
  async authenticate(account: ApiKeyConfig): Promise<AuthResponse> {
    console.log(`[MOCK] Authenticating account: ${account.name}`);
    const useTestEnvironment = process.env.USE_TEST_ENVIRONMENT === 'true';
    console.log(`[MOCK] Using ${useTestEnvironment ? 'test' : 'production'} environment`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      jsonrpc: "2.0",
      result: {
        access_token: 'mock_access_token_' + Date.now(),
        expires_in: 3600,
        refresh_token: 'mock_refresh_token_' + Date.now(),
        scope: account.scope || 'read write',
        token_type: 'bearer',
        enabled_features: []
      },
      testnet: useTestEnvironment,
      usIn: Date.now() * 1000,
      usOut: Date.now() * 1000,
      usDiff: 0
    };
  }

  /**
   * Mock connectivity test
   */
  async testConnectivity(): Promise<boolean> {
    console.log('[MOCK] Testing connectivity...');
    await new Promise(resolve => setTimeout(resolve, 200));
    return true;
  }

  /**
   * Mock instruments data
   */
  async getInstruments(currency: string = 'BTC', kind: string = 'option'): Promise<DeribitOptionInstrument[]> {
    console.log(`[MOCK] Getting ${currency} ${kind} instruments`);

    // 生成更丰富的模拟数据
    const mockInstruments = this.generateMockInstruments(currency);

    await new Promise(resolve => setTimeout(resolve, 300));
    return mockInstruments;
  }

  /**
   * 生成模拟期权工具数据
   */
  private generateMockInstruments(currency: string): DeribitOptionInstrument[] {
    const instruments: DeribitOptionInstrument[] = [];

    // 确定基础价格和underlying asset
    let basePrice: number;
    let underlyingAsset: string;

    if (currency === 'USDC') {
      // USDC期权：生成多种underlying assets
      const usdcAssets = ['SOL', 'XRP', 'MATIC'];
      const allInstruments: DeribitOptionInstrument[] = [];

      for (const asset of usdcAssets) {
        const assetPrice = asset === 'SOL' ? 150 : asset === 'XRP' ? 0.6 : 0.8;
        const assetInstruments = this.generateInstrumentsForAsset(asset, 'USDC', assetPrice);
        allInstruments.push(...assetInstruments);
      }

      return allInstruments;
    } else {
      // 传统期权：BTC, ETH等
      basePrice = currency === 'BTC' ? 50000 : currency === 'ETH' ? 3000 : currency === 'SOL' ? 150 : 100;
      underlyingAsset = currency;
      return this.generateInstrumentsForAsset(underlyingAsset, currency, basePrice);
    }
  }

  /**
   * 为特定资产生成期权工具
   */
  private generateInstrumentsForAsset(asset: string, currency: string, basePrice: number): DeribitOptionInstrument[] {
    const instruments: DeribitOptionInstrument[] = [];

    // 生成不同到期日期
    const expiryDates = [
      { name: '25JUL25', timestamp: 1721923200000 },
      { name: '01AUG25', timestamp: 1722528000000 },
      { name: '08AUG25', timestamp: 1723132800000 },
      { name: '15AUG25', timestamp: 1723737600000 }
    ];

    // 生成不同行权价格
    const strikeMultipliers = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

    expiryDates.forEach(expiry => {
      strikeMultipliers.forEach(multiplier => {
        const strike = Math.round(basePrice * multiplier * 100) / 100; // 保留2位小数

        // 确定instrument name格式
        const instrumentPrefix = currency === 'USDC' ? `${asset}_USDC` : asset;

        // 看涨期权
        instruments.push({
          instrument_name: `${instrumentPrefix}-${expiry.name}-${strike}-C`,
          currency: currency,
          kind: 'option',
          option_type: 'call',
          strike: strike,
          expiration_timestamp: expiry.timestamp,
          tick_size: currency === 'USDC' ? 0.01 : 0.0001,
          min_trade_amount: 0.1,
          contract_size: currency === 'USDC' ? 10 : 1, // USDC期权有10倍乘数
          is_active: true,
          settlement_period: 'day',
          creation_timestamp: Date.now() - Math.random() * 86400000 * 30,
          base_currency: asset,
          quote_currency: currency === 'USDC' ? 'USDC' : 'USD'
        });

        // 看跌期权
        instruments.push({
          instrument_name: `${instrumentPrefix}-${expiry.name}-${strike}-P`,
          currency: currency,
          kind: 'option',
          option_type: 'put',
          strike: strike,
          expiration_timestamp: expiry.timestamp,
          tick_size: currency === 'USDC' ? 0.01 : 0.0001,
          min_trade_amount: 0.1,
          contract_size: currency === 'USDC' ? 10 : 1, // USDC期权有10倍乘数
          is_active: true,
          settlement_period: 'day',
          creation_timestamp: Date.now() - Math.random() * 86400000 * 30,
          base_currency: asset,
          quote_currency: currency === 'USDC' ? 'USDC' : 'USD'
        });
      });
    });

    return instruments;
  }

  /**
   * Mock获取单个工具的详细信息
   */
  async getInstrument(instrumentName: string): Promise<DeribitInstrumentDetail | null> {
    console.log(`[MOCK] Getting instrument details for: ${instrumentName}`);

    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      // 解析instrument name来生成mock数据
      const parts = instrumentName.split('-');
      if (parts.length < 4) {
        console.log(`[MOCK] Invalid instrument name format: ${instrumentName}`);
        return null;
      }

      const [currency, expiry, strike, optionType] = parts;
      const isCall = optionType === 'C';
      const strikePrice = parseFloat(strike);

      // 生成mock instrument详情
      const mockInstrument: DeribitInstrumentDetail = {
        instrument_name: instrumentName,
        instrument_id: Math.floor(Math.random() * 1000000),
        kind: 'option' as const,
        instrument_type: 'linear' as const,

        // 价格相关
        tick_size: currency.includes('_USDC') ? 0.01 : 0.0001,
        tick_size_steps: [],

        // 交易相关
        min_trade_amount: 0.1,
        contract_size: currency.includes('_USDC') ? 10 : 1,
        max_leverage: 50,

        // 手续费
        maker_commission: 0.0003,
        taker_commission: 0.0003,
        max_liquidation_commission: 0.005,

        // 大宗交易
        block_trade_commission: 0.00025,
        block_trade_min_trade_amount: 10,
        block_trade_tick_size: currency.includes('_USDC') ? 0.005 : 0.0001,

        // 货币
        base_currency: currency.includes('_') ? currency.split('_')[0] : currency,
        counter_currency: currency.includes('_USDC') ? 'USDC' : 'USD',
        quote_currency: currency.includes('_USDC') ? 'USDC' : 'USD',
        settlement_currency: currency.includes('_USDC') ? 'USDC' : currency,

        // 时间戳
        creation_timestamp: Date.now() - Math.random() * 86400000 * 30,
        expiration_timestamp: Date.now() + Math.random() * 86400000 * 30,

        // 状态
        is_active: true,
        rfq: false,

        // 期权特有字段
        option_type: (isCall ? 'call' : 'put') as 'call' | 'put',
        strike: strikePrice,

        // 期货特有字段
        settlement_period: 'day',

        // 价格指数
        price_index: currency.includes('_USDC')
          ? `${currency.split('_')[0].toLowerCase()}_usdc`
          : `${currency.toLowerCase()}_usd`
      };

      console.log(`[MOCK] Generated instrument details for ${instrumentName}`);
      return mockInstrument;

    } catch (error) {
      console.error(`[MOCK] Error generating instrument details for ${instrumentName}:`, error);
      return null;
    }
  }

  /**
   * Mock order placement
   */
  async placeOrder(params: {
    instrument_name: string;
    amount: number;
    type: 'limit' | 'market';
    direction: 'buy' | 'sell';
    price?: number;
    reduce_only?: boolean;
  }): Promise<any> {
    console.log('[MOCK] Placing order:', params);

    await new Promise(resolve => setTimeout(resolve, 400));

    return {
      order: {
        order_id: 'mock_order_' + Date.now(),
        instrument_name: params.instrument_name,
        amount: params.amount,
        direction: params.direction,
        order_type: params.type,
        price: params.price || 0.05,
        order_state: 'open',
        creation_timestamp: Date.now(),
        average_price: 0,
        filled_amount: 0,
        reduce_only: params.reduce_only ?? false
      },
      trades: []
    };
  }

  /**
   * Mock account summary
   */
  async getAccountSummary(currency: string): Promise<any> {
    console.log(`[MOCK] Getting account summary for ${currency}`);

    await new Promise(resolve => setTimeout(resolve, 300));

    return {
      currency,
      balance: Math.random() * 10,
      available_funds: Math.random() * 8,
      maintenance_margin: Math.random() * 1,
      initial_margin: Math.random() * 2,
      margin_balance: Math.random() * 9,
      equity: Math.random() * 10,
      total_pl: (Math.random() - 0.5) * 2,
      session_rpl: (Math.random() - 0.5) * 0.5,
      session_upl: (Math.random() - 0.5) * 0.3,
      options_value: Math.random() * 1,
      options_pl: (Math.random() - 0.5) * 0.2,
      options_session_rpl: (Math.random() - 0.5) * 0.1,
      options_session_upl: (Math.random() - 0.5) * 0.1,
      options_delta: (Math.random() - 0.5) * 2,
      options_gamma: Math.random() * 0.001,
      options_theta: -Math.random() * 10,
      options_vega: Math.random() * 5
    };
  }

  /**
   * Mock获取期权详细信息 (包含希腊字母)
   */
  async getOptionDetails(instrumentName: string): Promise<OptionDetails | null> {
    console.log(`[MOCK] Getting option details for ${instrumentName}`);

    await new Promise(resolve => setTimeout(resolve, 200));

    // 解析合约名称
    const parts = instrumentName.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const currency = parts[0];
    const optionType = parts[3] === 'C' ? 'call' : 'put';
    const strike = parseFloat(parts[2]);

    // 生成模拟的希腊字母数据
    const basePrice = currency === 'BTC' ? 50000 : currency === 'ETH' ? 3000 : currency === 'SOL' ? 150 : 100;

    // 根据实值/虚值程度生成合理的Delta值
    let delta: number;
    if (optionType === 'call') {
      // Call期权: 深度实值接近1，深度虚值接近0
      delta = Math.max(0.05, Math.min(0.95, 0.5 + (basePrice - strike) / basePrice * 2));
    } else {
      // Put期权: 深度实值接近-1，深度虚值接近0
      delta = Math.min(-0.05, Math.max(-0.95, -0.5 + (strike - basePrice) / basePrice * 2));
    }

    return {
      instrument_name: instrumentName,
      underlying_index: `${currency}_USD`,
      underlying_price: basePrice,
      timestamp: Date.now(),
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
      index_price: basePrice,
      greeks: {
        delta: delta,
        gamma: Math.random() * 0.001,
        theta: -Math.random() * 10,
        vega: Math.random() * 10,
        rho: Math.random() * 1
      },
      bid_iv: 75 + (Math.random() * 20),
      best_bid_price: Math.random() * 0.05,
      best_bid_amount: Math.random() * 10,
      best_ask_price: Math.random() * 0.05 + 0.001, // 确保ask > bid
      best_ask_amount: Math.random() * 10,
      ask_iv: 85 + (Math.random() * 20)
    };
  }

  /**
   * Mock根据Delta值筛选最优期权 (重构版本)
   */
  async getInstrumentByDelta(currency: string, minExpiredDays: number, delta: number, longSide: boolean, underlyingAsset?: string): Promise<DeltaFilterResult | null> {
    console.log(`[MOCK] Finding option by delta: ${currency}, minExpiredDays: ${minExpiredDays}, delta: ${delta}, longSide: ${longSide}${underlyingAsset ? `, underlying: ${underlyingAsset}` : ''}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // 1. 获取模拟期权列表
      const instruments = await this.getInstruments(currency, 'option');

      // 1.5. 如果指定了underlyingAsset，过滤出匹配的期权
      let filteredByUnderlying = instruments;
      if (underlyingAsset && currency === 'USDC') {
        filteredByUnderlying = instruments.filter(instrument =>
          instrument.instrument_name.startsWith(`${underlyingAsset}_USDC-`)
        );
        console.log(
          `[MOCK] Filtered by underlying asset (${underlyingAsset}): ${filteredByUnderlying.length} instruments`
        );

        if (filteredByUnderlying.length === 0) {
          console.log(`[MOCK] No ${underlyingAsset}_USDC instruments found`);
          return null;
        }
      }

      // 2. 过滤期权类型
      const optionType = longSide ? 'call' : 'put';
      const filteredInstruments = filteredByUnderlying.filter(
        instrument => instrument.option_type === optionType
      );

      if (filteredInstruments.length === 0) {
        console.log('[MOCK] No instruments found for option type:', optionType);
        return null;
      }

      // 3. 重构筛选逻辑: 找到最近的两个到期日
      const now = new Date();
      const minExpiryTime = new Date(now.getTime() + minExpiredDays * 24 * 60 * 60 * 1000);

      // 过滤出符合最小到期天数要求的期权
      const validInstruments = filteredInstruments.filter(instrument => {
        const expiryDate = new Date(instrument.expiration_timestamp);
        return expiryDate >= minExpiryTime;
      });

      if (validInstruments.length === 0) {
        console.log('[MOCK] No instruments found after minimum expiry filtering');
        return null;
      }

      // 按到期时间分组
      const expiryGroups = new Map<number, typeof validInstruments>();
      validInstruments.forEach(instrument => {
        const expiryTimestamp = instrument.expiration_timestamp;
        if (!expiryGroups.has(expiryTimestamp)) {
          expiryGroups.set(expiryTimestamp, []);
        }
        expiryGroups.get(expiryTimestamp)!.push(instrument);
      });

      // 获取最近的两个到期日
      const sortedExpiryDates = Array.from(expiryGroups.keys()).sort((a, b) => a - b);
      const nearestTwoExpiries = sortedExpiryDates.slice(0, 2);
      console.log(`[MOCK] Found ${nearestTwoExpiries.length} nearest expiry dates`);

      if (nearestTwoExpiries.length === 0) {
        return null;
      }

      // 4. 每个到期日选择Delta最接近的2个期权
      const candidateOptions: any[] = [];

      for (const expiryTimestamp of nearestTwoExpiries) {
        const instrumentsForExpiry = expiryGroups.get(expiryTimestamp)!;
        const optionsWithDelta: any[] = [];

        // 获取该到期日所有期权的详细信息
        for (const instrument of instrumentsForExpiry) {
          const details = await this.getOptionDetails(instrument.instrument_name);
          if (details && details.greeks && typeof details.greeks.delta === 'number') {
            const deltaDistance = Math.abs(details.greeks.delta - delta);

            // 计算价差比率
            const spreadRatio = details.best_ask_price > 0 && details.best_bid_price > 0
              ? (details.best_ask_price - details.best_bid_price) / (details.best_ask_price + details.best_bid_price)
              : Math.random() * 0.1; // Mock随机价差

            optionsWithDelta.push({
              instrument,
              details,
              deltaDistance,
              spreadRatio
            });
          }
        }

        // 按Delta距离排序，取前2个
        optionsWithDelta.sort((a, b) => a.deltaDistance - b.deltaDistance);
        const top2ForExpiry = optionsWithDelta.slice(0, 2);

        console.log(`[MOCK] Selected ${top2ForExpiry.length} options for expiry ${new Date(expiryTimestamp).toLocaleDateString()}`);
        candidateOptions.push(...top2ForExpiry);
      }

      if (candidateOptions.length === 0) {
        console.log('[MOCK] No candidate options found');
        return null;
      }

      // 5. 从候选期权中选择盘口价差最小的
      const bestOption = candidateOptions.reduce((best, current) =>
        current.spreadRatio < best.spreadRatio ? current : best
      );

      console.log(`[MOCK] Selected optimal option: ${bestOption.instrument.instrument_name}`);
      console.log(`[MOCK] Delta: ${bestOption.details.greeks.delta.toFixed(3)} (target: ${delta})`);
      console.log(`[MOCK] Spread ratio: ${(bestOption.spreadRatio * 100).toFixed(2)}%`);

      return bestOption;

    } catch (error) {
      console.error('[MOCK] Error in getInstrumentByDelta:', error);
      return null;
    }
  }
}
