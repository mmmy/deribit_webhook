import Decimal from 'decimal.js';
import { ConfigLoader } from '../config';
import { DeltaManager } from '../database/delta-manager';
import { DeltaRecordType } from '../database/types';
import {
  DeribitPosition,
  OptionTradingParams,
  OptionTradingResult,
  WebhookSignalPayload
} from '../types';
import type { DeribitInstrumentDetail } from '../types/deribit-instrument';
import type { DetailedPositionInfo, ExecutionStats, OpenOrderInfo, PositionInfo } from '../types/position-info';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';

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
      qtyType: payload.qtyType || 'fixed',
      delta1: payload.delta1, // 传递期权选择Delta值，同时用于记录到move_position_delta
      delta2: payload.delta2, // 传递目标Delta值
      n: payload.n // 传递最小到期天数
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

        // 解析symbol以确定currency和underlying
        const { currency, underlying } = this.parseSymbolForOptions(params.symbol);
        console.log(`📊 Parsed symbol ${params.symbol} → currency: ${currency}, underlying: ${underlying}`);

        // 确定longSide (true=call, false=put)
        // 简化逻辑: buy方向选择call期权，sell方向选择put期权
        const longSide = params.direction === 'buy';

        // 调用getInstrumentByDelta
        let deltaResult;
        if (useMockMode) {
          deltaResult = await this.mockClient.getInstrumentByDelta(currency, payload.n, payload.delta1, longSide, underlying);
        } else {
          deltaResult = await this.deribitClient.getInstrumentByDelta(currency, payload.n, payload.delta1, longSide, underlying);
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
          return {
            success: false,
            message: `No suitable option found for delta=${payload.delta1}, minExpiredDays=${payload.n}`
          };
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
  private generateMockInstrumentName(symbol: string, direction: 'buy' | 'sell'): string {
    const { currency, underlying } = this.parseSymbolForOptions(symbol);
    const expiry = this.getNextFridayExpiry();
    const strike = this.estimateStrike(underlying);
    const optionType = direction === 'buy' ? 'C' : 'P'; // 简化逻辑：买入用看涨，卖出用看跌

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

  /**
   * 根据分级tick size规则计算正确的tick size
   */
  private getCorrectTickSize(price: number, baseTickSize: number, tickSizeSteps?: any[]): number {
    if (!tickSizeSteps || tickSizeSteps.length === 0) {
      return baseTickSize;
    }

    // 从高到低检查tick size steps
    for (const step of tickSizeSteps.sort((a, b) => b.above_price - a.above_price)) {
      if (price > step.above_price) {
        return step.tick_size;
      }
    }

    return baseTickSize;
  }

  /**
   * 修正期权订单价格以符合Deribit要求
   * 使用decimal.js解决浮点数精度问题
   */
  private correctOrderPrice(
    price: number,
    instrumentDetail: DeribitInstrumentDetail
  ): { correctedPrice: number; tickSize: number; priceSteps: string } {
    const {
      tick_size: baseTickSize,
      tick_size_steps: tickSizeSteps,
      instrument_name: instrumentName
    } = instrumentDetail;

    // 计算正确的tick size
    const correctTickSize = this.getCorrectTickSize(price, baseTickSize, tickSizeSteps);

    // 使用Decimal.js进行精确计算
    const priceDecimal = new Decimal(price);
    const tickSizeDecimal = new Decimal(correctTickSize);

    // 修正价格到最接近的tick size倍数
    const steps = priceDecimal.dividedBy(tickSizeDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const correctedPriceDecimal = steps.times(tickSizeDecimal);
    const correctedPrice = correctedPriceDecimal.toNumber();

    console.log(`🔧 Price correction for ${instrumentName}:`);
    console.log(`   Original price: ${price} → Corrected: ${correctedPrice}`);
    console.log(`   Base tick size: ${baseTickSize}, Used tick size: ${correctTickSize}`);
    console.log(`   Price steps: ${steps.toString()}`);

    if (tickSizeSteps && tickSizeSteps.length > 0) {
      console.log(`   Tick size steps applied: ${JSON.stringify(tickSizeSteps)}`);
    }

    return {
      correctedPrice,
      tickSize: correctTickSize,
      priceSteps: steps.toString()
    };
  }

  /**
   * 修正期权订单数量以符合Deribit要求
   * 使用decimal.js解决浮点数精度问题
   */
  private correctOrderAmount(
    amount: number,
    instrumentDetail: DeribitInstrumentDetail
  ): { correctedAmount: number; minTradeAmount: number; amountSteps: string } {
    const {
      min_trade_amount: minTradeAmount,
      instrument_name: instrumentName
    } = instrumentDetail;

    // 使用Decimal.js进行精确计算
    const amountDecimal = new Decimal(amount);
    const minTradeAmountDecimal = new Decimal(minTradeAmount);

    // 修正数量到最小交易量的倍数（向上取整）
    const amountSteps = amountDecimal.dividedBy(minTradeAmountDecimal).toDecimalPlaces(0, Decimal.ROUND_UP);
    const correctedAmountDecimal = amountSteps.times(minTradeAmountDecimal);
    const correctedAmount = correctedAmountDecimal.toNumber();

    console.log(`🔧 Amount correction for ${instrumentName}:`);
    console.log(`   Original amount: ${amount} → Corrected: ${correctedAmount}`);
    console.log(`   Min trade amount: ${minTradeAmount}`);
    console.log(`   Amount steps: ${amountSteps.toString()}`);

    return {
      correctedAmount,
      minTradeAmount,
      amountSteps: amountSteps.toString()
    };
  }

  /**
   * 修正期权订单参数以符合Deribit要求（组合函数）
   * 使用decimal.js解决浮点数精度问题
   * 通用函数，支持所有货币的期权
   */
  private correctOrderParams(
    price: number,
    amount: number,
    instrumentDetail: DeribitInstrumentDetail
  ) {
    // 分别修正价格和数量
    const priceResult = this.correctOrderPrice(price, instrumentDetail);
    const amountResult = this.correctOrderAmount(amount, instrumentDetail);

    console.log(`🔧 Combined parameter correction for ${instrumentDetail.instrument_name}:`);
    console.log(`   Price: ${price} → ${priceResult.correctedPrice} (steps: ${priceResult.priceSteps})`);
    console.log(`   Amount: ${amount} → ${amountResult.correctedAmount} (steps: ${amountResult.amountSteps})`);

    return {
      correctedPrice: priceResult.correctedPrice,
      correctedAmount: amountResult.correctedAmount,
      tickSize: priceResult.tickSize,
      minTradeAmount: amountResult.minTradeAmount
    };
  }

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
        }

        if (orderQuantity <= 0) {
          throw new Error(`Invalid order quantity: ${orderQuantity}`);
        }

        // 5. 修正订单参数以符合Deribit要求 - 使用期权工具信息
        const correctedParams = this.correctOrderParams(entryPrice, orderQuantity, instrumentInfo);
        console.log(`🔧 Parameter correction: price ${entryPrice} → ${correctedParams.correctedPrice}, amount ${orderQuantity} → ${correctedParams.correctedAmount}`);

        // 使用修正后的参数
        const finalPrice = correctedParams.correctedPrice;
        const finalQuantity = correctedParams.correctedAmount;
        
        // 6. 调用Deribit下单API - 使用修正后的参数
        console.log(`📋 Placing order: ${params.direction} ${finalQuantity} contracts of ${instrumentName} at price ${finalPrice}`);

        const spreadRatio  = Math.abs(optionDetails.best_ask_price - optionDetails.best_bid_price) / (optionDetails.best_bid_price + optionDetails.best_ask_price) * 2
        console.log('盘口价差:', spreadRatio);

        // 从环境变量读取价差比率阈值，默认0.15
        const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');
        if (spreadRatio > spreadRatioThreshold) {
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
          price = this.correctOrderPrice(price, instrumentInfo).correctedPrice;
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

          const strategyResult = await this.executeProgressiveLimitStrategy({
            orderId: orderResult.order.order_id,
            instrumentName,
            direction: params.direction,
            quantity: finalQuantity,
            initialPrice: finalPrice,
            accountName: params.accountName,
            instrumentDetail: instrumentInfo, // 传入工具详情用于价格修正
            timeout: 8000,  // 8秒
            maxStep: 3
          });

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
      console.log(`🔍 handleNonImmediateOrder called with delta1: ${params.delta1}, delta2: ${params.delta2}`);

      // 检查是否为开仓订单且有delta1或delta2参数
      const isOpeningOrder = params.action === 'open';
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
          tv_id: null, // 暂时设为null，后续可以从webhook payload中获取
          record_type: recordType
        };

        this.deltaManager.createRecord(deltaRecord);
        console.log(`✅ Delta record created as ${recordType} for ${orderResult.order?.order_id} with delta1=${params.delta1} (move_position_delta), delta2=${params.delta2} (target_delta)`);
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
        tv_id: null, // 暂时设为null，后续可以从webhook payload中获取
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

  /**
   * 执行渐进式限价单策略
   * 通过逐步移动价格来提高成交概率
   * @returns 返回最终成交后的仓位信息
   */
  private async executeProgressiveLimitStrategy(params: {
    orderId: string;
    instrumentName: string;
    direction: 'buy' | 'sell';
    quantity: number;
    initialPrice: number;
    accountName: string;
    instrumentDetail: DeribitInstrumentDetail; // 新增：工具详情，用于价格修正
    timeout?: number;
    maxStep?: number;
  }): Promise<{
    success: boolean;
    finalOrderState?: string;
    executedQuantity?: number;
    averagePrice?: number;
    positionInfo?: DetailedPositionInfo;
    message: string;
  }> {
    const timeout = params.timeout || 8000; // 默认5秒
    const maxStep = params.maxStep || 3;    // 默认最大6步

    console.log(`🎯 Starting progressive limit strategy for order ${params.orderId}, timeout: ${timeout}ms, maxStep: ${maxStep}`);

    let currentStep = 0;

    while (currentStep < maxStep) {
      // 等待指定时间
      await new Promise(resolve => setTimeout(resolve, timeout));
      currentStep++;

      try {
        // 重新认证以确保token有效（因为策略可能执行30秒以上）
        await this.deribitAuth.authenticate(params.accountName);
        const tokenInfo = this.deribitAuth.getTokenInfo(params.accountName);
        if (!tokenInfo) {
          console.error(`❌ Failed to refresh token for account: ${params.accountName}`);
          break;
        }

        // 检查订单状态
        const orderStatus = await this.checkOrderStatus(params.orderId, tokenInfo.accessToken);
        if (!orderStatus || orderStatus.order_state !== 'open') {
          console.log(`✅ Order ${params.orderId} is no longer open (state: ${orderStatus?.order_state}), stopping strategy`);
          break;
        }

        // 获取最新的盘口价格
        const optionDetails = await this.deribitClient.getOptionDetails(params.instrumentName);
        if (!optionDetails) {
          console.error(`❌ Failed to get option details for ${params.instrumentName}`);
          continue;
        }

        const bestBidPrice = optionDetails.best_bid_price || 0;
        const bestAskPrice = optionDetails.best_ask_price || 0;

        if (bestBidPrice <= 0 || bestAskPrice <= 0) {
          console.error(`❌ Invalid bid/ask prices: bid=${bestBidPrice}, ask=${bestAskPrice}`);
          continue;
        }

        // 计算新价格
        const newPrice = this.calculateProgressivePrice(
          params.direction,
          params.initialPrice,
          bestBidPrice,
          bestAskPrice,
          currentStep,
          maxStep
        );

        // 使用correctOrderPrice函数修正新价格
        const priceResult = this.correctOrderPrice(newPrice, params.instrumentDetail);
        const correctedNewPrice = priceResult.correctedPrice;

        console.log(`📈 Step ${currentStep}/${maxStep}: Moving price from current to ${correctedNewPrice} (original: ${newPrice}, bid: ${bestBidPrice}, ask: ${bestAskPrice})`);
        console.log(`🔧 Price correction: ${newPrice} → ${correctedNewPrice} (tick size: ${priceResult.tickSize})`);

        // 修改订单价格（只修改价格，不修改数量）
        await this.updateOrderPrice(params.orderId, correctedNewPrice, tokenInfo.accessToken);

      } catch (error) {
        console.error(`❌ Error in progressive strategy step ${currentStep}:`, error);
        // 继续下一步，不要因为单步失败而停止整个策略
      }
    }

    // 如果达到最大步数还没成交，使用对手价格
    if (currentStep >= maxStep) {
      try {
        console.log(`🚀 Reached max steps, using market price for final execution`);

        await this.deribitAuth.authenticate(params.accountName);
        const tokenInfo = this.deribitAuth.getTokenInfo(params.accountName);
        if (!tokenInfo) {
          console.error(`❌ Failed to refresh token for final execution`);
          return {
            success: false,
            message: 'Failed to refresh token for final execution'
          };
        }

        // 检查订单是否还存在
        const orderStatus = await this.checkOrderStatus(params.orderId, tokenInfo.accessToken);
        if (orderStatus && orderStatus.order_state === 'open') {
          const optionDetails = await this.deribitClient.getOptionDetails(params.instrumentName);
          if (optionDetails) {
            const rawFinalPrice = params.direction === 'buy'
              ? optionDetails.best_ask_price || params.initialPrice
              : optionDetails.best_bid_price || params.initialPrice;

            // 使用correctOrderPrice函数修正最终价格
            const finalPriceResult = this.correctOrderPrice(rawFinalPrice, params.instrumentDetail);
            const correctedFinalPrice = finalPriceResult.correctedPrice;

            console.log(`💥 Final price adjustment: ${rawFinalPrice} → ${correctedFinalPrice} (tick size: ${finalPriceResult.tickSize})`);
            await this.updateOrderPrice(params.orderId, correctedFinalPrice, tokenInfo.accessToken);
          }
        }
      } catch (error) {
        console.error(`❌ Error in final price adjustment:`, error);
      }
    }

    console.log(`🏁 Progressive limit strategy completed for order ${params.orderId}`);

    // 获取最终的订单状态和仓位信息
    try {
      await this.deribitAuth.authenticate(params.accountName);
      const tokenInfo = this.deribitAuth.getTokenInfo(params.accountName);
      if (!tokenInfo) {
        return {
          success: false,
          message: 'Failed to authenticate for final position check'
        };
      }

      // 检查最终订单状态
      const finalOrderStatus = await this.checkOrderStatus(params.orderId, tokenInfo.accessToken);

      let executedQuantity = 0;
      let averagePrice = 0;
      let finalOrderState = 'unknown';

      if (finalOrderStatus) {
        finalOrderState = finalOrderStatus.order_state;
        executedQuantity = finalOrderStatus.filled_amount || 0;
        averagePrice = finalOrderStatus.average_price || 0;
      }

      // 获取当前仓位信息
      let positionInfo: DetailedPositionInfo | null = null;
      try {
        const startTime = Date.now();

        // 获取相关的订单信息
        const openOrders = await this.deribitClient.getOpenOrders(tokenInfo.accessToken, {
          kind: 'option'
        });

        // 获取仓位信息（如果有的话）
        let positions: DeribitPosition[] = [];
        try {
          positions = await this.deribitClient.getPositions(tokenInfo.accessToken, {
            kind: 'option'
          });
        } catch (posError) {
          console.log(`ℹ️ Positions API not available or no positions found:`, posError);
        }

        // 过滤相关数据
        const relatedOrders = openOrders.filter((order: any) => order.instrument_name === params.instrumentName);
        const relatedPositions = positions.filter((pos: any) => pos.instrument_name === params.instrumentName);

        // 计算汇总信息
        const totalUnrealizedPnl = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.unrealized_pnl || 0), 0);
        const totalRealizedPnl = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.realized_pnl || 0), 0);
        const totalMaintenanceMargin = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.maintenance_margin || 0), 0);
        const totalInitialMargin = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.initial_margin || 0), 0);
        const netDelta = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.delta || 0), 0);

        // 构建详细的仓位信息
        positionInfo = {
          // 订单相关信息
          relatedOrders: relatedOrders as OpenOrderInfo[],
          totalOpenOrders: openOrders.length,

          // 仓位相关信息
          positions: relatedPositions as PositionInfo[],
          totalPositions: positions.length,

          // 执行统计信息
          executionStats: {
            orderId: params.orderId,
            instrumentName: params.instrumentName,
            direction: params.direction,
            requestedQuantity: params.quantity,
            executedQuantity: executedQuantity,
            averagePrice: averagePrice,
            initialPrice: params.initialPrice,
            finalPrice: averagePrice > 0 ? averagePrice : params.initialPrice,
            totalSteps: currentStep,
            executionTime: Date.now() - startTime,
            priceMovements: [] // 这里可以记录价格移动历史
          } as ExecutionStats,

          // 汇总信息
          summary: {
            totalUnrealizedPnl,
            totalRealizedPnl,
            totalMaintenanceMargin,
            totalInitialMargin,
            netDelta
          },

          // 元数据
          metadata: {
            timestamp: Date.now(),
            accountName: params.accountName,
            currency: params.instrumentName.split('-')[0], // 从工具名称提取货币
            dataSource: 'deribit_api' as const
          }
        };
      } catch (error) {
        console.error(`❌ Error getting position info:`, error);
        positionInfo = {
          relatedOrders: [],
          totalOpenOrders: 0,
          positions: [],
          totalPositions: 0,
          executionStats: {
            orderId: params.orderId,
            instrumentName: params.instrumentName,
            direction: params.direction,
            requestedQuantity: params.quantity,
            executedQuantity: executedQuantity,
            averagePrice: averagePrice,
            initialPrice: params.initialPrice,
            totalSteps: currentStep,
            executionTime: 0,
            priceMovements: []
          } as ExecutionStats,
          summary: {
            totalUnrealizedPnl: 0,
            totalRealizedPnl: 0,
            totalMaintenanceMargin: 0,
            totalInitialMargin: 0
          },
          metadata: {
            timestamp: Date.now(),
            accountName: params.accountName,
            currency: params.instrumentName.split('-')[0],
            dataSource: 'deribit_api' as const
          },
          error: `Failed to get position info: ${error}`
        };
      }

      const isFullyExecuted = finalOrderState === 'filled';
      const isPartiallyExecuted = executedQuantity > 0 && finalOrderState !== 'filled';

      return {
        success: true,
        finalOrderState,
        executedQuantity,
        averagePrice,
        positionInfo,
        message: isFullyExecuted
          ? `Order fully executed: ${executedQuantity} contracts at average price ${averagePrice}`
          : isPartiallyExecuted
          ? `Order partially executed: ${executedQuantity}/${params.quantity} contracts at average price ${averagePrice}`
          : `Order not executed, final state: ${finalOrderState}`
      };

    } catch (error) {
      console.error(`❌ Error getting final position info:`, error);
      return {
        success: false,
        message: `Strategy completed but failed to get final position info: ${error}`
      };
    }
  }

  /**
   * 检查订单状态
   */
  private async checkOrderStatus(orderId: string, accessToken: string): Promise<any> {
    try {
      // 通过订单ID获取订单状态
      const orderStatus = await this.deribitClient.getOrderState(accessToken, orderId);
      return orderStatus;
    } catch (error) {
      console.error(`❌ Error checking order status for ${orderId}:`, error);
      return null;
    }
  }

  /**
   * 计算渐进式价格
   */
  private calculateProgressivePrice(
    direction: 'buy' | 'sell',
    initialPrice: number,
    bestBidPrice: number,
    bestAskPrice: number,
    currentStep: number,
    maxStep: number
  ): number {
    // 计算移动比例：从0.5开始，每步增加0.5/maxStep
    // const moveRatio = 0.5 + (0.5 * currentStep / maxStep);
    const moveRatio = 0.33

    if (direction === 'buy') {
      // 买单：从中间价向ask价移动
      // 新价格 = best_bid_price + (best_ask_price - bestBidPrice) * moveRatio
      return bestBidPrice + (bestAskPrice - bestBidPrice) * moveRatio;
    } else {
      // 卖单：从中间价向bid价移动
      // 新价格 = best_ask_price - (bestAskPrice - best_bid_price) * moveRatio
      return bestAskPrice - (bestAskPrice - bestBidPrice) * moveRatio;
    }
  }

  /**
   * 更新订单价格（只修改价格，不修改数量）
   */
  private async updateOrderPrice(
    orderId: string,
    newPrice: number,
    accessToken: string
  ): Promise<void> {
    try {
      // 先获取当前订单状态以获取数量
      const orderStatus = await this.deribitClient.getOrderState(accessToken, orderId);
      if (!orderStatus) {
        throw new Error(`Order ${orderId} not found`);
      }

      // 使用edit接口修改订单价格（保持原有数量）
      const result = await this.deribitClient.editOrder(accessToken, {
        order_id: orderId,
        amount: orderStatus.amount,
        price: newPrice
      });

      console.log(`✅ Order ${orderId} price updated to ${newPrice}:`);
    } catch (error) {
      console.error(`❌ Error updating order price for ${orderId}:`, error);
      throw error;
    }
  }
}