import { AuthResponse, ApiKeyConfig } from '../types';

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
  async getInstruments(currency: string = 'BTC', kind: string = 'option'): Promise<any[]> {
    console.log(`[MOCK] Getting ${currency} ${kind} instruments`);
    
    const mockInstruments = [
      {
        instrument_name: 'BTC-25JUL25-50000-C',
        strike: 50000,
        expiration_timestamp: 1721923200000,
        option_type: 'call',
        currency: 'BTC',
        kind: 'option',
        tick_size: 0.0001,
        min_trade_amount: 0.1
      },
      {
        instrument_name: 'BTC-25JUL25-50000-P',
        strike: 50000,
        expiration_timestamp: 1721923200000,
        option_type: 'put',
        currency: 'BTC',
        kind: 'option',
        tick_size: 0.0001,
        min_trade_amount: 0.1
      },
      {
        instrument_name: 'BTC-25JUL25-60000-C',
        strike: 60000,
        expiration_timestamp: 1721923200000,
        option_type: 'call',
        currency: 'BTC',
        kind: 'option',
        tick_size: 0.0001,
        min_trade_amount: 0.1
      }
    ];

    await new Promise(resolve => setTimeout(resolve, 300));
    return mockInstruments;
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
  async getAccountSummary(currency: string = 'BTC'): Promise<any> {
    console.log(`[MOCK] Getting ${currency} account summary`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      balance: 1.5,
      available_funds: 1.2,
      maintenance_margin: 0.1,
      initial_margin: 0.2,
      margin_balance: 1.5,
      unrealized_pnl: 0.05,
      realized_pnl: 0.1,
      total_pl: 0.15,
      currency: currency,
      equity: 1.55
    };
  }
}