import { ConfigLoader } from '../config';
import { OptionTradingParams, OptionTradingResult, WebhookSignalPayload } from '../types';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';

export class OptionTradingService {
  private deribitAuth: DeribitAuth;
  private configLoader: ConfigLoader;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;

  constructor() {
    this.deribitAuth = new DeribitAuth();
    this.configLoader = ConfigLoader.getInstance();
    this.deribitClient = new DeribitClient();
    this.mockClient = new MockDeribitClient();
  }

  /**
   * 处理 TradingView webhook 信号
   */
  async processWebhookSignal(payload: WebhookSignalPayload): Promise<OptionTradingResult> {
    try {
      // 1. 验证账户
      const account = this.configLoader.getAccountByName(payload.accountName);
      if (!account) {
        throw new Error(`Account not found: ${payload.accountName}`);
      }

      if (!account.enabled) {
        throw new Error(`Account is disabled: ${payload.accountName}`);
      }

      // 2. 验证认证 (在Mock模式下跳过真实认证)
      const useMockMode = process.env.USE_MOCK_MODE === 'true';
      if (!useMockMode) {
        await this.deribitAuth.authenticate(payload.accountName);
        console.log(`✅ Authentication successful for account: ${payload.accountName}`);
      } else {
        // 🔴 DEBUG BREAKPOINT: 在这里设置断点 - Mock认证跳过
        console.log(`✅ Mock mode - skipping authentication for account: ${payload.accountName}`);
      }

      // 3. 解析交易信号
      const tradingParams = this.parseSignalToTradingParams(payload);
      // 🔴 DEBUG BREAKPOINT: 在这里设置断点 - 交易参数解析
      console.log('📊 Parsed trading parameters:', tradingParams);

      // 4. 执行期权交易 (当前为占位符函数)
      const result = await this.executeOptionTrade(tradingParams, payload);
      
      return result;

    } catch (error) {
      console.error('❌ Failed to process webhook signal:', error);
      return {
        success: false,
        message: 'Failed to process trading signal',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 将 webhook 信号转换为期权交易参数
   */
  private parseSignalToTradingParams(payload: WebhookSignalPayload): OptionTradingParams {
    // 确定交易方向
    const direction = payload.side.toLowerCase() === 'buy' ? 'buy' : 'sell';
    
    // 确定开仓/平仓动作
    let action: 'open' | 'close' = 'open';
    
    // 根据市场仓位变化判断开仓还是平仓
    if (payload.marketPosition === 'flat' && payload.prevMarketPosition !== 'flat') {
      action = 'close'; // 平仓到无仓位
    } else if (payload.marketPosition !== 'flat' && payload.prevMarketPosition === 'flat') {
      action = 'open';  // 从无仓位开仓
    } else if (payload.marketPosition !== payload.prevMarketPosition) {
      action = 'close'; // 仓位方向改变，先平仓
    }

    // 解析数量
    const quantity = parseFloat(payload.size) || 1;
    
    // 解析价格 (如果提供)
    const price = payload.price ? parseFloat(payload.price) : undefined;

    return {
      accountName: payload.accountName,
      direction,
      action,
      symbol: payload.symbol,
      quantity,
      price,
      orderType: price ? 'limit' : 'market',
      qtyType: payload.qtyType || 'contracts'
    };
  }

  /**
   * 执行期权交易 (使用delta1和n字段选择期权)
   */
  private async executeOptionTrade(params: OptionTradingParams, payload: WebhookSignalPayload): Promise<OptionTradingResult> {
    console.log('🚀 Executing option trade:', params);
    
    const useMockMode = process.env.USE_MOCK_MODE === 'true';
    
    try {
      let instrumentName: string | undefined;
      
      // 如果是开仓操作且提供了delta1和n参数，使用getInstrumentByDelta选择期权
      if (params.action === 'open' && payload.delta1 !== undefined && payload.n !== undefined) {
        console.log(`🎯 Using delta-based option selection: delta=${payload.delta1}, minExpiredDays=${payload.n}`);
        
        // 提取货币类型
        const currency = params.symbol.replace(/USDT?/i, '').toUpperCase();
        
        // 确定longSide (true=call, false=put)
        // 简化逻辑: buy方向选择call期权，sell方向选择put期权
        const longSide = params.direction === 'buy';
        
        // 调用getInstrumentByDelta
        let deltaResult;
        if (useMockMode) {
          deltaResult = await this.mockClient.getInstrumentByDelta(currency, payload.n, payload.delta1, longSide);
        } else {
          deltaResult = await this.deribitClient.getInstrumentByDelta(currency, payload.n, payload.delta1, longSide);
        }
        
        if (deltaResult) {
          instrumentName = deltaResult.instrument.instrument_name;
          console.log(`✅ Selected option instrument: ${instrumentName}`);
          
          // 执行开仓交易
          const orderResult = await this.placeOptionOrder(instrumentName, params, useMockMode);
          if (!orderResult.success) {
            return orderResult;
          }
        } else {
          console.warn(`⚠️ No suitable option found for delta=${payload.delta1}, using fallback`);
          instrumentName = this.generateMockInstrumentName(params.symbol, params.direction);
          
          // 使用fallback合约执行开仓交易
          const orderResult = await this.placeOptionOrder(instrumentName, params, useMockMode);
          if (!orderResult.success) {
            return orderResult;
          }
        }
      } else {
        // 平仓操作或未提供delta参数时，使用原有逻辑
        instrumentName = this.generateMockInstrumentName(params.symbol, params.direction);
        
        // 执行平仓或无delta参数的交易
        const orderResult = await this.placeOptionOrder(instrumentName, params, useMockMode);
        if (!orderResult.success) {
          return orderResult;
        }
      }

      // 返回交易结果
      return {
        success: true,
        orderId: `${useMockMode ? 'mock' : 'real'}_order_${Date.now()}`,
        message: `Successfully executed ${params.action} ${params.direction} order for ${params.quantity} contracts`,
        instrumentName,
        executedQuantity: params.quantity,
        executedPrice: params.price || 0.05 // 模拟执行价格
      };
      
    } catch (error) {
      console.error('❌ Error executing option trade:', error);
      return {
        success: false,
        message: 'Failed to execute option trade',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 生成模拟的期权合约名称
   */
  private generateMockInstrumentName(symbol: string, direction: 'buy' | 'sell'): string {
    const currency = symbol.replace(/USDT?/i, '').toUpperCase();
    const expiry = this.getNextFridayExpiry();
    const strike = this.estimateStrike(currency);
    const optionType = direction === 'buy' ? 'C' : 'P'; // 简化逻辑：买入用看涨，卖出用看跌
    
    return `${currency}-${expiry}-${strike}-${optionType}`;
  }

  /**
   * 获取下一个周五到期日期 (DDMMMYY格式)
   */
  private getNextFridayExpiry(): string {
    const now = new Date();
    const daysUntilFriday = (5 - now.getDay()) % 7 || 7;
    const nextFriday = new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
    
    const day = nextFriday.getDate().toString().padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                   'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[nextFriday.getMonth()];
    const year = nextFriday.getFullYear().toString().slice(-2);
    
    return `${day}${month}${year}`;
  }

  /**
   * 估算行权价格 (简化逻辑)
   */
  private estimateStrike(currency: string): number {
    // 简化的行权价格估算
    const strikes = {
      'BTC': 50000,
      'ETH': 3000,
      'SOL': 100
    };
    
    return strikes[currency as keyof typeof strikes] || 1000;
  }

  /**
   * 下单执行期权交易
   */
  private async placeOptionOrder(instrumentName: string, params: OptionTradingParams, useMockMode: boolean): Promise<OptionTradingResult> {
    console.log(`📋 Placing order for instrument: ${instrumentName}`);
    
    try {
      if (useMockMode) {
        // Mock模式：模拟下单
        console.log(`[MOCK] Placing ${params.direction} order for ${params.quantity} contracts of ${instrumentName}`);
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 200));
        
        return {
          success: true,
          orderId: `mock_order_${Date.now()}`,
          message: `Successfully placed ${params.action} ${params.direction} order`,
          instrumentName,
          executedQuantity: params.quantity,
          executedPrice: params.price || 0.05
        };
      } else {
        // 真实模式：调用Deribit API下单
        console.log(`[REAL] Placing ${params.direction} order for ${params.quantity} contracts of ${instrumentName}`);
        
        // 1. 获取账户信息和认证
        const account = this.configLoader.getAccountByName(params.accountName);
        if (!account) {
          throw new Error(`Account not found: ${params.accountName}`);
        }
        
        await this.deribitAuth.authenticate(params.accountName);
        const tokenInfo = this.deribitAuth.getTokenInfo(params.accountName);
        if (!tokenInfo) {
          throw new Error(`Authentication failed for account: ${params.accountName}`);
        }
        
        // 2. 获取期权详情以计算价格和数量
        const optionDetails = await this.deribitClient.getOptionDetails(instrumentName);
        if (!optionDetails) {
          throw new Error(`Failed to get option details for ${instrumentName}`);
        }
        
        // 3. 计算入场价格 (买一 + 卖一) / 2
        const entryPrice = (optionDetails.best_bid_price + optionDetails.best_ask_price) / 2;
        console.log(`📊 Entry price calculated: ${entryPrice} (bid: ${optionDetails.best_bid_price}, ask: ${optionDetails.best_ask_price})`);
        
        // 4. 计算下单数量
        let orderQuantity = params.quantity;
        
        // 如果qtyType是cash，将美元金额转换为合约数量
        if (params.qtyType === 'cash') {
          // 开仓大小 = (size / 期权价格) * 合约乘数
          // Deribit期权合约乘数通常是1
          orderQuantity = Math.floor(params.quantity / entryPrice);
          console.log(`💰 Cash mode: converting $${params.quantity} to ${orderQuantity} contracts at price ${entryPrice}`);
        }
        
        if (orderQuantity <= 0) {
          throw new Error(`Invalid order quantity: ${orderQuantity}`);
        }
        
        // 5. 调用Deribit下单API
        console.log(`📋 Placing order: ${params.direction} ${orderQuantity} contracts of ${instrumentName} at price ${entryPrice}`);
        
        const orderResult = await this.deribitClient.placeOrder(
          instrumentName,
          params.direction,
          orderQuantity,
          params.orderType || 'market',
          params.orderType === 'limit' ? entryPrice : undefined,
          tokenInfo.accessToken
        );
        
        console.log(`✅ Order placed successfully:`, orderResult);
        
        return {
          success: true,
          orderId: orderResult.order?.order_id || `deribit_${Date.now()}`,
          message: `Successfully placed ${params.direction} order for ${orderQuantity} contracts`,
          instrumentName,
          executedQuantity: orderResult.order?.filled_amount || orderQuantity,
          executedPrice: orderResult.order?.average_price || entryPrice
        };
      }
    } catch (error) {
      console.error(`❌ Failed to place order for ${instrumentName}:`, error);
      return {
        success: false,
        message: 'Failed to place option order',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 获取交易状态
   */
  async getTradingStatus(): Promise<any> {
    return {
      service: 'Option Trading Service',
      status: 'active',
      enabledAccounts: this.configLoader.getEnabledAccounts().length,
      timestamp: new Date().toISOString()
    };
  }
}