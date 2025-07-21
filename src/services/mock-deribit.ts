import type { DeribitOptionInstrument } from '../types';
import { ApiKeyConfig, AuthResponse } from '../types';

export class MockDeribitClient {
  /**
   * Mock authentication for development/testing when network is unavailable
   */
  async authenticate(account: ApiKeyConfig): Promise<AuthResponse> {
    console.log(`[MOCK] Authenticating account: ${account.name}`);
    console.log(`[MOCK] Using ${account.testMode ? 'test' : 'production'} environment`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      access_token: 'mock_access_token_' + Date.now(),
      expires_in: 3600,
      refresh_token: 'mock_refresh_token_' + Date.now(),
      scope: account.scope || 'read write',
      token_type: 'bearer'
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
    const basePrice = currency === 'BTC' ? 50000 : currency === 'ETH' ? 3000 : 100;

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
        const strike = Math.round(basePrice * multiplier);

        // 看涨期权
        instruments.push({
          instrument_name: `${currency}-${expiry.name}-${strike}-C`,
          currency: currency,
          kind: 'option',
          option_type: 'call',
          strike: strike,
          expiration_timestamp: expiry.timestamp,
          tick_size: 0.0001,
          min_trade_amount: 0.1,
          contract_size: 1,
          is_active: true,
          settlement_period: 'day',
          creation_timestamp: Date.now() - Math.random() * 86400000 * 30,
          base_currency: currency,
          quote_currency: 'USD'
        });

        // 看跌期权
        instruments.push({
          instrument_name: `${currency}-${expiry.name}-${strike}-P`,
          currency: currency,
          kind: 'option',
          option_type: 'put',
          strike: strike,
          expiration_timestamp: expiry.timestamp,
          tick_size: 0.0001,
          min_trade_amount: 0.1,
          contract_size: 1,
          is_active: true,
          settlement_period: 'day',
          creation_timestamp: Date.now() - Math.random() * 86400000 * 30,
          base_currency: currency,
          quote_currency: 'USD'
        });
      });
    });

    return instruments;
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
        filled_amount: 0
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


}