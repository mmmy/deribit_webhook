import { ConfigLoader } from '../config';
import { DeltaManager } from '../database/delta-manager';
import { DeltaRecordType } from '../database/types';
import {
  OptionTradingAction,
  OptionTradingParams,
  OptionTradingResult,
  WebhookSignalPayload
} from '../types';
import type { DetailedPositionInfo } from '../types/position-info';
import { correctOrderParameters, correctOrderPrice } from '../utils/price-correction';
import { calculateSpreadRatio, formatSpreadRatioAsPercentage, isSpreadTooWide } from '../utils/spread-calculation';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';
import { executePositionAdjustmentByTvId, executePositionCloseByTvId } from './position-adjustment';

export class OptionTradingService {
  private deribitAuth: DeribitAuth;
  private configLoader: ConfigLoader;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;
  private deltaManager: DeltaManager;

  constructor() {
    this.deribitAuth = new DeribitAuth();
    this.configLoader = ConfigLoader.getInstance();
    this.deribitClient = new DeribitClient();
    this.mockClient = new MockDeribitClient();
    this.deltaManager = new DeltaManager();
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
      // 解析tv_id并传递到交易参数中，最后触发交易存到Delta数据库
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
    
    // 确定详细的交易动作
    // 基于marketPosition和prevMarketPosition的状态变化来判断具体的交易动作
    let action: OptionTradingAction = this.determineDetailedAction(
      payload.marketPosition,
      payload.prevMarketPosition,
      payload.side
    );

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
      qtyType: payload.qtyType || 'fixed',
      delta1: payload.delta1, // 传递期权选择Delta值，同时用于记录到move_position_delta
      delta2: payload.delta2, // 传递目标Delta值
      n: payload.n, // 传递最小到期天数
      tv_id: payload.tv_id, // 传递TradingView信号ID
      seller: payload.seller  
    };
  }

  /**
   * 根据市场仓位变化确定详细的交易动作
   */
  private determineDetailedAction(
    marketPosition: string,
    prevMarketPosition: string,
    side: string,
    commentMsg?: string,
  ): OptionTradingAction {
    const currentPos = marketPosition.toLowerCase();
    const prevPos = prevMarketPosition.toLowerCase();
    const tradeSide = side.toLowerCase();

    console.log(`🎯 Determining action: ${prevPos} → ${currentPos}, side: ${tradeSide}`);

    // 情况1: 从无仓位开仓
    if (prevPos === 'flat' && currentPos !== 'flat') {
      if (currentPos === 'long') {
        console.log('📈 Action: open_long (从无仓位开多仓)');
        return 'open_long';
      } else if (currentPos === 'short') {
        console.log('📉 Action: open_short (从无仓位开空仓)');
        return 'open_short';
      }
    }

    // 情况2: 平仓到无仓位
    if (currentPos === 'flat' && prevPos !== 'flat') {
      if (prevPos === 'long') {
        console.log('📈 Action: close_long (平多仓到无仓位)');
        return commentMsg?.includes('止损') ? 'stop_long' : 'close_long';
      } else if (prevPos === 'short') {
        console.log('📉 Action: close_short (平空仓到无仓位)');
        return commentMsg?.includes('止损') ? 'stop_short' : 'close_short';
      }
    }

    // 情况3: 仓位方向改变 (long ↔ short)
    if (prevPos !== 'flat' && currentPos !== 'flat' && prevPos !== currentPos) {
      // 先平掉原有仓位，再开新仓位
      if (prevPos === 'long') {
        console.log('📈 Action: close_long (仓位方向改变，先平多仓)');
        return 'close_long';
      } else if (prevPos === 'short') {
        console.log('📉 Action: close_short (仓位方向改变，先平空仓)');
        return 'close_short';
      }
    }

    // 情况4: 同方向仓位调整 (简化处理)
    if (prevPos === currentPos && prevPos !== 'flat') {
      // 同方向仓位变化，根据交易方向判断是加仓还是减仓
      if (currentPos === 'long') {
        if (tradeSide === 'buy') {
          console.log('📈 Action: open_long (增加多仓)');
          return 'open_long';
        } else {
          console.log('� Action: reduce_long (减少多仓)');
          return 'reduce_long';
        }
      } else if (currentPos === 'short') {
        if (tradeSide === 'sell') {
          console.log('� Action: open_short (增加空仓)');
          return 'open_short';
        } else {
          console.log('📉 Action: reduce_short (减少空仓)');
          return 'reduce_short';
        }
      }
    }

    // 默认情况：根据交易方向判断
    if (tradeSide === 'buy') {
      console.log('📈 Action: open_long (默认买入开多)');
      return 'open_long';
    } else {
      console.log('📉 Action: open_short (默认卖出开空)');
      return 'open_short';
    }
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
      const isOpeningAction = ['open_long', 'open_short'].includes(params.action);
      const isReducingAction = ['reduce_long', 'reduce_short'].includes(params.action);
      const isCloseAction = ['close_long', 'close_short'].includes(params.action);
      const isStopAction = ['stop_long', 'stop_short'].includes(params.action);

      if (isOpeningAction && payload.delta1 !== undefined && payload.n !== undefined) {
        console.log(`🎯 Using delta-based option selection: delta=${payload.delta1}, minExpiredDays=${payload.n}`);

        // 解析symbol以确定currency和underlying
        const { currency, underlying } = this.parseSymbolForOptions(params.symbol);
        console.log(`📊 Parsed symbol ${params.symbol} → currency: ${currency}, underlying: ${underlying}`);

        // 确定期权类型和交易方向
        const isSeller = payload.seller || false;
        let isCall: boolean; // true=call, false=put
        let actualDirection: 'buy' | 'sell';

        if (isSeller) {
          // 期权卖方逻辑：
          // 开多 = sell put (看涨，卖出看跌期权)
          // 开空 = sell call (看跌，卖出看涨期权)
          isCall = params.action === 'open_short'; // 开空时选择call，开多时选择put
          actualDirection = 'sell'; // 卖方总是卖出
          console.log(`🎯 Option seller mode: ${params.action} → ${actualDirection} ${isCall ? 'call' : 'put'}`);
        } else {
          // 期权买方逻辑（原有逻辑）：
          // 开多 = buy call (看涨，买入看涨期权)
          // 开空 = buy put (看跌，买入看跌期权)
          isCall = params.action === 'open_long'; // 开多时选择call，开空时选择put
          actualDirection = 'buy'; // 使用原始方向
          console.log(`🎯 Option buyer mode: ${params.action} → ${actualDirection} ${isCall ? 'call' : 'put'}`);
        }
        // 调用getInstrumentByDelta
        let deltaResult;
        if (useMockMode) {
          deltaResult = await this.mockClient.getInstrumentByDelta(currency, payload.n, payload.delta1, isCall, underlying);
        } else {
          deltaResult = await this.deribitClient.getInstrumentByDelta(currency, payload.n, payload.delta1, isCall, underlying);
        }
        
        if (deltaResult) {
          instrumentName = deltaResult.instrument.instrument_name;
          console.log(`✅ Selected option instrument: ${instrumentName}`);
          
          // 执行开仓交易，使用实际交易方向
          const modifiedParams = { ...params, direction: actualDirection };
          const orderResult = await this.placeOptionOrder(instrumentName, modifiedParams, useMockMode);
          if (!orderResult.success) {
            return orderResult;
          }
        } else {
          return {
            success: false,
            message: `No suitable option found for delta=${payload.delta1}, minExpiredDays=${payload.n}`
          };
        }
      }

      if (isReducingAction) {
        if (params.tv_id) {
          console.log(`✅ Reduce action detected, executing position adjustment for tv_id=${params.tv_id}`);
          // 执行基于tv_id的仓位调整
          return await executePositionAdjustmentByTvId(
            params.accountName,
            params.tv_id,
            {
              configLoader: this.configLoader,
              deltaManager: this.deltaManager,
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient
            }
          );
        } else {
          console.error('❌ Reduce action detected, but no tv_id provided, skipping order placement');
          return {
            success: false,
            message: 'Reduce action detected, but no tv_id provided'
          };
        }
      }

      if (isCloseAction) {
        if (params.tv_id) {
          console.log(`✅ Close action detected, executing position close for tv_id=${params.tv_id}`);

          // 确定平仓比例，默认全平
          const closeRatio = params.closeRatio || 1.0;

          // 执行基于tv_id的仓位平仓
          return await executePositionCloseByTvId(
            params.accountName,
            params.tv_id,
            closeRatio,
            false,
            {
              configLoader: this.configLoader,
              deltaManager: this.deltaManager,
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient
            }
          );
        } else {
          console.error('❌ Close action detected, but no tv_id provided, skipping order placement');
          return {
            success: false,
            message: 'Close action detected, but no tv_id provided'
          };
        }
      }

      if (isStopAction) {
        if (params.tv_id) {
          console.log(`✅ Stop action detected, executing position stop for tv_id=${params.tv_id}`);
          return {
            success: false,
            message: 'Stop action detected, but not implemented yet'
          };
        } else {
          console.error('❌ Stop action detected, but no tv_id provided, skipping order placement');
          return {
            success: false,
            message: 'Stop action detected, but no tv_id provided'
          };
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
   * 解析symbol以确定currency和underlying
   * 支持USDT和USDC期权
   */
  private parseSymbolForOptions(symbol: string): { currency: string; underlying: string } {
    const upperSymbol = symbol.toUpperCase();

    // 检查是否为USDC期权
    if (upperSymbol.endsWith('USDC')) {
      const underlying = upperSymbol.replace(/USDC$/i, '');
      return {
        currency: 'USDC',
        underlying: underlying
      };
    }

    // 检查是否为USDT期权（向后兼容）
    if (upperSymbol.endsWith('USDT')) {
      const underlying = upperSymbol.replace(/USDT$/i, '');
      return {
        currency: underlying, // USDT期权使用underlying作为currency
        underlying: underlying
      };
    }

    // 检查是否为USD期权（向后兼容）
    if (upperSymbol.endsWith('USD')) {
      const underlying = upperSymbol.replace(/USD$/i, '');
      return {
        currency: underlying, // USD期权使用underlying作为currency
        underlying: underlying
      };
    }

    // 默认情况：假设整个symbol就是currency
    return {
      currency: upperSymbol,
      underlying: upperSymbol
    };
  }

  /**
   * 生成模拟的期权合约名称
   */
  private generateMockInstrumentName(symbol: string, action: OptionTradingAction, direction: 'buy' | 'sell'): string {
    const { currency, underlying } = this.parseSymbolForOptions(symbol);
    const expiry = this.getNextFridayExpiry();
    const strike = this.estimateStrike(underlying);

    // 根据详细的action类型确定期权类型
    let optionType: string;
    if (action === 'open_long' || action === 'reduce_short' || action === 'close_short') {
      optionType = 'C'; // Call期权
    } else if (action === 'open_short' || action === 'reduce_long' || action === 'close_long') {
      optionType = 'P'; // Put期权
    } else {
      // 向后兼容：对于通用的open/close动作，使用原有逻辑
      optionType = direction === 'buy' ? 'C' : 'P';
    }

    console.log(`🎯 Generated option type: ${optionType} for action: ${action}, direction: ${direction}`);

    // 根据currency类型生成不同格式的instrument name
    if (currency === 'USDC') {
      // USDC期权使用下划线格式: SOL_USDC-expiry-strike-type
      return `${underlying}_USDC-${expiry}-${strike}-${optionType}`;
    } else {
      // 传统期权使用连字符格式: BTC-expiry-strike-type
      return `${underlying}-${expiry}-${strike}-${optionType}`;
    }
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
      'SOL': 150
    };

    return strikes[currency as keyof typeof strikes] || 1000;
  }

  // getCorrectTickSize函数已迁移到 src/utils/price-correction.ts

  // correctOrderPrice函数已迁移到 src/utils/price-correction.ts

  // correctOrderAmount函数已迁移到 src/utils/price-correction.ts

  // correctOrderParams函数已迁移到 src/utils/price-correction.ts (使用correctOrderParameters)

  /**
   * 下单执行期权交易
   */
  public async placeOptionOrder(instrumentName: string, params: OptionTradingParams, useMockMode: boolean): Promise<OptionTradingResult> {
    console.log(`📋 Placing order for instrument: ${instrumentName}`);
    
    try {
      if (useMockMode) {
        // Mock模式：模拟下单
        console.log(`[MOCK] Placing ${params.direction} order for ${params.quantity} contracts of ${instrumentName}`);

        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 200));

        // 模拟订单结果（非立即成交）
        const mockOrderResult = {
          order: {
            order_id: `mock_order_${Date.now()}`,
            order_state: 'open', // 模拟非立即成交状态
            filled_amount: 0,
            average_price: 0
          }
        };

        // 检查是否为非立即成交的开仓订单，如果是则记录到delta数据库
        console.log(`🔍 Checking for delta2 parameter: ${params.delta2}`);
        await this.handleNonImmediateOrder(mockOrderResult, params, instrumentName, params.quantity, params.price || 0.05);

        return {
          success: true,
          orderId: mockOrderResult.order.order_id,
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
        
        // 2. 获取期权工具信息（包含tick_size等）和价格信息
        // 2.1 获取期权工具信息
        const instrumentInfo = await this.deribitClient.getInstrument(instrumentName);
        if (!instrumentInfo) {
          throw new Error(`Failed to get instrument info for ${instrumentName}`);
        }

        // 2.2 获取期权价格信息
        const optionDetails = await this.deribitClient.getOptionDetails(instrumentName);
        if (!optionDetails) {
          throw new Error(`Failed to get option details for ${instrumentName}`);
        }

        // 3. 计算入场价格 (买一 + 卖一) / 2
        const entryPrice = (optionDetails.best_bid_price + optionDetails.best_ask_price) / 2;
        console.log(`📊 Entry price calculated: ${entryPrice} (bid: ${optionDetails.best_bid_price}, ask: ${optionDetails.best_ask_price})`);
        console.log(`📊 Instrument info: tick_size=${instrumentInfo.tick_size}, min_trade_amount=${instrumentInfo.min_trade_amount}`);

        // 4. 计算下单数量
        let orderQuantity = params.quantity;

        // 如果qtyType是cash，将美元金额转换为合约数量
        if (params.qtyType === 'cash') {
          if (instrumentInfo.settlement_currency === 'USDC') {
            // USDC期权：qtyType=cash表示USDC价值，直接使用不需要换算
            orderQuantity = params.quantity;
            console.log(`💰 USDC Cash mode: using ${params.quantity} USDC directly as quantity`);
          } else {
            // 传统期权：需要根据期权价格和指数价格换算
            orderQuantity = params.quantity / (entryPrice * optionDetails.index_price);
            console.log(`💰 Cash mode: converting $${params.quantity} to ${orderQuantity} contracts at price ${entryPrice}`);
          }
        } else if (params.qtyType === 'fixed') { // fixed表示是合约数量
          console.log(`💰 Fixed mode: using ${params.quantity} contracts directly`);
          if (instrumentInfo.settlement_currency === 'USDC') {
            orderQuantity = params.quantity * (params.price || optionDetails.index_price);
          } else {
            orderQuantity = params.quantity / entryPrice;
          }
        }

        if (orderQuantity <= 0) {
          throw new Error(`Invalid order quantity: ${orderQuantity}`);
        }

        // 5. 修正订单参数以符合Deribit要求 - 使用期权工具信息
        const correctedParams = correctOrderParameters(entryPrice, orderQuantity, instrumentInfo);
        console.log(`🔧 Parameter correction: price ${entryPrice} → ${correctedParams.correctedPrice}, amount ${orderQuantity} → ${correctedParams.correctedAmount}`);

        // 使用修正后的参数
        const finalPrice = correctedParams.correctedPrice;
        const finalQuantity = correctedParams.correctedAmount;
        
        // 6. 调用Deribit下单API - 使用修正后的参数
        console.log(`📋 Placing order: ${params.direction} ${finalQuantity} contracts of ${instrumentName} at price ${finalPrice}`);

        // 使用统一的价差比率计算函数
        const spreadRatio = calculateSpreadRatio(optionDetails.best_bid_price, optionDetails.best_ask_price);
        console.log('盘口价差:', formatSpreadRatioAsPercentage(spreadRatio));

        // 从环境变量读取价差比率阈值，默认0.15
        const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');
        if (isSpreadTooWide(optionDetails.best_bid_price, optionDetails.best_ask_price, spreadRatioThreshold)) {
          const orderResult = await this.deribitClient.placeOrder(
            instrumentName,
            params.direction,
            finalQuantity,
            'limit', // 使用限价单以确保价格正确
            finalPrice, // 使用修正后的价格
            tokenInfo.accessToken
          );
          console.log(`✅ Order placed successfully:`, orderResult);
  
          // 检查是否为非立即成交的开仓订单，如果是则记录到delta数据库
          await this.handleNonImmediateOrder(orderResult, params, instrumentName, finalQuantity, finalPrice);
  
          return {
            success: true,
            orderId: orderResult.order?.order_id || `deribit_${Date.now()}`,
            message: `Successfully placed ${params.direction} order for ${finalQuantity} contracts`,
            instrumentName,
            executedQuantity: orderResult.order?.filled_amount || finalQuantity,
            executedPrice: orderResult.order?.average_price || finalPrice
          };
        } else {
          // 盘口价差小，启用移动limit成交价格来成交
          console.log(`📈 Spread is small, using progressive limit order strategy`);
          const r = 0.2
          const s = optionDetails.best_ask_price - optionDetails.best_bid_price
          let price = params.direction === 'buy' ? optionDetails.best_bid_price + s * r : (optionDetails.best_ask_price - s * r)
          price = correctOrderPrice(price, instrumentInfo).correctedPrice;
          // 使用普通限价单下单（不需要标签）
          const orderResult = await this.deribitClient.placeOrder(
            instrumentName,
            params.direction,
            finalQuantity,
            'limit',
            price,
            tokenInfo.accessToken
          );

          console.log(`📋 Initial order placed with order_id ${orderResult.order.order_id}:`, orderResult);

          // 执行移动价格策略并等待完成
          console.log(`🎯 Starting progressive limit strategy and waiting for completion...`);

          const { executeProgressiveLimitStrategy: executeProgressiveLimitStrategyPure } = await import('./progressive-limit-strategy');
          const strategyResult = await executeProgressiveLimitStrategyPure(
            {
              orderId: orderResult.order.order_id,
              instrumentName,
              direction: params.direction,
              quantity: finalQuantity,
              initialPrice: finalPrice,
              accountName: params.accountName,
              instrumentDetail: instrumentInfo, // 传入工具详情用于价格修正
              timeout: 8000,  // 8秒
              maxStep: 3
            },
            {
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient
            }
          );

          if (strategyResult.success) {
            console.log(`✅ Progressive strategy completed successfully:`, strategyResult);
            // 将返回的仓位信息记录到delta数据库中
            await this.recordPositionInfoToDatabase(strategyResult, params);
            return {
              success: true,
              orderId: orderResult.order.order_id,
              message: `Progressive ${params.direction} order completed: ${strategyResult.message}`,
              instrumentName,
              executedQuantity: strategyResult.executedQuantity || finalQuantity,
              executedPrice: strategyResult.averagePrice || finalPrice,
              finalOrderState: strategyResult.finalOrderState,
              positionInfo: strategyResult.positionInfo // 直接返回最终仓位信息
            };
          } else {
            console.error(`❌ Progressive strategy failed:`, strategyResult.message);

            return {
              success: false,
              orderId: orderResult.order.order_id,
              message: `Progressive strategy failed: ${strategyResult.message}`,
              instrumentName,
              executedQuantity: 0,
              executedPrice: finalPrice,
              error: strategyResult.message
            };
          }
        }
        
      }
    } catch (error) {
      console.error(`❌ Failed to place order for ${instrumentName}:`, error);

      // 详细错误日志
      if (error instanceof Error) {
        console.error(`Error message: ${error.message}`);
        if ((error as any).response) {
          console.error(`HTTP Status: ${(error as any).response.status}`);
          console.error(`Response data:`, JSON.stringify((error as any).response.data, null, 2));
        }
      }

      return {
        success: false,
        message: 'Failed to place option order',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 处理非立即成交的订单，将其记录到delta数据库
   */
  private async handleNonImmediateOrder(
    orderResult: any,
    params: OptionTradingParams,
    instrumentName: string,
    quantity: number,
    price: number
  ): Promise<void> {
    try {
      console.log(`🔍 handleNonImmediateOrder called with delta1: ${params.delta1}, delta2: ${params.delta2}, tv_id: ${params.tv_id}`);

      // 检查是否为开仓订单且有delta1或delta2参数
      const isOpeningOrder = ['open', 'open_long', 'open_short'].includes(params.action);
      const hasDelta1 = params.delta1 !== undefined;
      const hasDelta2 = params.delta2 !== undefined;
      const orderState = orderResult.order?.order_state;

      console.log(`📊 Order checks: opening=${isOpeningOrder}, hasDelta1=${hasDelta1}, hasDelta2=${hasDelta2}, orderState=${orderState}`);

      // 如果是开仓订单且有delta1或delta2参数，则记录到数据库
      // 无论订单是否立即成交，都要记录Delta值
      if (isOpeningOrder && (hasDelta1 || hasDelta2)) {
        console.log(`📝 Recording opening order to delta database (state: ${orderState})`);

        // 创建delta记录
        // 如果订单立即成交，记录为仓位；否则记录为订单
        const recordType = orderState === 'filled' ? DeltaRecordType.POSITION : DeltaRecordType.ORDER;
        const deltaRecord = {
          account_id: params.accountName,
          instrument_name: instrumentName,
          target_delta: params.delta2 || 0, // delta2记录到target_delta字段，如果没有则默认为0
          move_position_delta: params.delta1 || 0, // delta1记录到move_position_delta字段，如果没有则默认为0
          min_expire_days: params.n || null, // 使用n参数作为最小到期天数，如果没有则为null
          order_id: recordType === DeltaRecordType.ORDER ? (orderResult.order?.order_id || '') : null,
          tv_id: params.tv_id || null, // 从webhook payload中获取TradingView信号ID
          record_type: recordType
        };

        this.deltaManager.createRecord(deltaRecord);
        console.log(`✅ Delta record created as ${recordType} for ${orderResult.order?.order_id} with delta1=${params.delta1} (move_position_delta), delta2=${params.delta2} (target_delta), tv_id=${params.tv_id}`);
      }
    } catch (error) {
      console.error('❌ Failed to handle non-immediate order:', error);
      // 不抛出错误，避免影响主要的交易流程
    }
  }

  /**
   * 将仓位信息记录到delta数据库中
   * 如果已存在合约信息，则更新；否则新增记录
   */
  private async recordPositionInfoToDatabase(
    strategyResult: {
      success: boolean;
      finalOrderState?: string;
      executedQuantity?: number;
      averagePrice?: number;
      positionInfo?: DetailedPositionInfo;
      message: string;
    },
    params: OptionTradingParams
  ): Promise<void> {
    try {
      if (!strategyResult.success || !strategyResult.positionInfo) {
        console.log(`ℹ️ 跳过数据库记录：策略未成功或无仓位信息`);
        return;
      }

      const posInfo = strategyResult.positionInfo;
      const executionStats = posInfo.executionStats;

      // 检查是否有实际成交
      if (!executionStats.executedQuantity || executionStats.executedQuantity <= 0) {
        console.log(`ℹ️ 跳过数据库记录：无实际成交 (executedQuantity: ${executionStats.executedQuantity})`);
        return;
      }

      // 从仓位信息中提取Delta值
      let targetDelta = 0;
      let movePositionDelta = 0;

      // 优先使用原始参数中的delta值
      if (params.delta2 !== undefined) {
        targetDelta = params.delta2;
      }
      if (params.delta1 !== undefined) {
        movePositionDelta = params.delta1;
      }

      // 如果原始参数没有delta值，尝试从仓位信息中获取
      if (targetDelta === 0 && posInfo.positions.length > 0) {
        // 计算净Delta值作为target_delta
        targetDelta = posInfo.summary.netDelta || 0;
      }

      // 创建或更新delta记录
      const deltaRecord = {
        account_id: posInfo.metadata.accountName,
        instrument_name: executionStats.instrumentName,
        target_delta: Math.max(-1, Math.min(1, targetDelta)), // 确保在[-1, 1]范围内
        move_position_delta: Math.max(-1, Math.min(1, movePositionDelta)), // 确保在[-1, 1]范围内
        min_expire_days: params.n || null, // 使用n参数作为最小到期天数，如果没有则为null
        tv_id: params.tv_id || null, // 从webhook payload中获取TradingView信号ID
        record_type: DeltaRecordType.POSITION // 策略完成后记录为仓位
      };

      // 使用upsert操作：如果存在则更新，否则创建
      const record = this.deltaManager.upsertRecord(deltaRecord);

      console.log(`✅ 仓位信息已记录到delta数据库:`, {
        id: record.id,
        account_id: record.account_id,
        instrument_name: record.instrument_name,
        target_delta: record.target_delta,
        move_position_delta: record.move_position_delta,
        tv_id: record.tv_id,
        executed_quantity: executionStats.executedQuantity,
        average_price: executionStats.averagePrice
      });

    } catch (error) {
      console.error(`❌ 记录仓位信息到数据库失败:`, error);
      // 不抛出错误，避免影响主要的交易流程
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

  // executeProgressiveLimitStrategy函数已迁移到 src/services/progressive-limit-strategy.ts

  // checkOrderStatus函数已迁移到 src/services/progressive-limit-strategy.ts

  // calculateProgressivePrice函数已迁移到 src/services/progressive-limit-strategy.ts

  // updateOrderPrice函数已迁移到 src/services/progressive-limit-strategy.ts
}