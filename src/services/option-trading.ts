import { ConfigLoader } from '../config';
import { OptionTradingParams, OptionTradingResult, WebhookSignalPayload } from '../types';
import { DeribitAuth } from './auth';

export class OptionTradingService {
  private deribitAuth: DeribitAuth;
  private configLoader: ConfigLoader;

  constructor() {
    this.deribitAuth = new DeribitAuth();
    this.configLoader = ConfigLoader.getInstance();
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
      const result = await this.executeOptionTrade(tradingParams);
      
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
      orderType: price ? 'limit' : 'market'
    };
  }

  /**
   * 执行期权交易 (占位符函数)
   * TODO: 实现真实的期权交易逻辑
   */
  private async executeOptionTrade(params: OptionTradingParams): Promise<OptionTradingResult> {
    console.log('🚀 Executing option trade (PLACEHOLDER):', params);
    
    // 模拟交易延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 生成模拟的期权合约名称
    const instrumentName = this.generateMockInstrumentName(params.symbol, params.direction);

    // 返回模拟交易结果
    return {
      success: true,
      orderId: `mock_order_${Date.now()}`,
      message: `Successfully executed ${params.action} ${params.direction} order for ${params.quantity} contracts`,
      instrumentName,
      executedQuantity: params.quantity,
      executedPrice: params.price || 0.05 // 模拟执行价格
    };
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