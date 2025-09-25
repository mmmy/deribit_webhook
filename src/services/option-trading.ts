import { ConfigLoader } from '../config';
import { DeltaManager } from '../database/delta-manager';
import { getUnifiedClient, isMockMode } from '../factory/client-factory';
import { accountValidationService } from '../middleware/account-validation';
import {
  OptionTradingAction,
  OptionTradingParams,
  OptionTradingResult,
  WebhookSignalPayload
} from '../types';
import { DeribitAuth } from './auth';
import { getAuthenticationService } from './authentication-service';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';
import { OrderSupportDependencies } from './order-support-functions';
import { placeOptionOrder as placeOptionOrderPure, PlaceOrderDependencies } from './place-option-order';
import { executePositionAdjustmentByTvId, executePositionCloseByTvId } from './position-adjustment';
import { wechatNotification } from './wechat-notification';


export class OptionTradingService {
  private deribitAuth: DeribitAuth;
  private configLoader: ConfigLoader;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;
  private deltaManager: DeltaManager;

  constructor(
    deribitAuth?: DeribitAuth,
    configLoader?: ConfigLoader,
    deribitClient?: DeribitClient,
    mockClient?: MockDeribitClient,
    deltaManager?: DeltaManager
  ) {
    // 支持依赖注入，但保持向后兼容
    this.deribitAuth = deribitAuth || new DeribitAuth();
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.deribitClient = deribitClient || new DeribitClient();
    this.mockClient = mockClient || new MockDeribitClient();
    this.deltaManager = deltaManager || DeltaManager.getInstance();
  }

  /**
   * 处理 TradingView webhook 信号
   */
  async processWebhookSignal(payload: WebhookSignalPayload): Promise<OptionTradingResult> {
    try {
      // 1. 验证账户 - 使用统一的账户验证服务
      const account = accountValidationService.validateAccount(payload.accountName);
      console.log(`✅ Account validation successful: ${account.name} (enabled: ${account.enabled})`);

      // 2. 统一认证处理 (自动处理Mock/Real模式)
      const authResult = await getAuthenticationService().authenticate(payload.accountName);
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      console.log(`✅ Authentication successful for account: ${payload.accountName} (Mock: ${authResult.isMock})`);

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
      payload.side,
      payload.comment,
    );

    // 解析数量
    const quantity = parseFloat(payload.size) || 1;
    
    // 解析价格 (如果提供)
    const price = payload.price ? parseFloat(payload.price) : undefined;

    return {
      accountName: payload.accountName,
      direction,
      action,
      symbol: payload.symbol.replace('.P', ''), // tv来的永续合约转换成现货
      quantity,
      price,
      orderType: price ? 'limit' : 'market',
      qtyType: payload.qtyType || 'fixed',
      delta1: payload.delta1, // 传递期权选择Delta值，同时用于记录到move_position_delta
      delta2: payload.delta2, // 传递目标Delta值
      n: payload.n, // 传递最小到期天数
      tv_id: payload.tv_id, // 传递TradingView信号ID
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
        // 根据 delta1 值决定期权类型：delta1 > 0 选择 call，否则选择 put
        const delta1 = payload.delta1 || 0;
        const isCall = delta1 > 0;

        // 根据期权类型和操作确定实际交易方向
        let actualDirection: 'buy' | 'sell';

        if (isCall) {
          // Call 期权：open_long = buy, 其他 = sell
          actualDirection = params.action === 'open_long' ? 'buy' : 'sell';
        } else {
          // Put 期权：open_short = buy, 其他 = sell
          actualDirection = params.action === 'open_short' ? 'buy' : 'sell';
        }

        console.log(`🎯 Option selection: delta1=${delta1} → ${isCall ? 'call' : 'put'} option, action=${params.action} → ${actualDirection}`);

        // 调用getInstrumentByDelta - 使用统一客户端
        const client = getUnifiedClient();
        const deltaResult = await client.getInstrumentByDelta(currency, payload.n, payload.delta1, isCall, underlying);
        
        if (deltaResult) {
          instrumentName = deltaResult.instrument.instrument_name;
          console.log(`✅ Selected option instrument: ${instrumentName}`);
          
          // 执行开仓交易，使用实际交易方向
          const modifiedParams = { ...params, direction: actualDirection };
          const orderResult = await this.placeOptionOrder(instrumentName!, modifiedParams, isMockMode());
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

          // 发送调仓开始通知到企业微信
          await this.sendPositionAdjustmentNotification(
            params.accountName,
            params.tv_id,
            'START',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction
            }
          );

          // 执行基于tv_id的仓位调整
          const adjustmentResult = await executePositionAdjustmentByTvId(
            params.accountName,
            params.tv_id,
            {
              configLoader: this.configLoader,
              deltaManager: this.deltaManager,
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient,
              mockClient: this.mockClient
            }
          );

          // 发送调仓结果通知到企业微信
          await this.sendPositionAdjustmentNotification(
            params.accountName,
            params.tv_id,
            adjustmentResult.success ? 'SUCCESS' : 'FAILED',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction,
              result: adjustmentResult
            }
          );

          return adjustmentResult;
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

          // 查询相关的合约名称用于通知
          const deltaRecords = this.deltaManager.getRecords({
            account_id: params.accountName,
            tv_id: params.tv_id
          });
          const instrumentNames = deltaRecords.map(record => record.instrument_name);

          // 发送盈利平仓开始通知到企业微信
          await this.sendProfitCloseNotification(
            params.accountName,
            params.tv_id,
            'START',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction,
              closeRatio: closeRatio,
              instrumentNames: instrumentNames
            }
          );

          // 执行基于tv_id的仓位平仓
          const closeResult = await executePositionCloseByTvId(
            params.accountName,
            params.tv_id,
            closeRatio,
            false, // 使用限价单+渐进式策略
            {
              configLoader: this.configLoader,
              deltaManager: this.deltaManager,
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient
            }
          );

          // 发送盈利平仓结果通知到企业微信
          await this.sendProfitCloseNotification(
            params.accountName,
            params.tv_id,
            closeResult.success ? 'SUCCESS' : 'FAILED',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction,
              closeRatio: closeRatio,
              result: closeResult,
              instrumentNames: closeResult.closedInstruments
            }
          );

          return closeResult;
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

          // 发送止损开始通知到企业微信
          await this.sendStopLossNotification(
            params.accountName,
            params.tv_id,
            'START',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction
            }
          );

          // 执行止损逻辑：使用executePositionCloseByTvId进行限价单平仓50%
          const stopResult = await executePositionCloseByTvId(
            params.accountName,
            params.tv_id,
            0.5, // 平仓50%
            false, // 使用限价单+渐进式策略进行止损
            {
              configLoader: this.configLoader,
              deltaManager: this.deltaManager,
              deribitAuth: this.deribitAuth,
              deribitClient: this.deribitClient
            }
          );

          // 发送止损结果通知到企业微信
          await this.sendStopLossNotification(
            params.accountName,
            params.tv_id,
            stopResult.success ? 'SUCCESS' : 'FAILED',
            {
              symbol: params.symbol,
              action: params.action,
              direction: params.direction,
              result: stopResult
            }
          );

          return stopResult;
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
        orderId: `${isMockMode() ? 'mock' : 'real'}_order_${Date.now()}`,
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
   * 下单执行期权交易 - 使用纯函数实现
   */
  public async placeOptionOrder(instrumentName: string, params: OptionTradingParams, useMockMode: boolean): Promise<OptionTradingResult> {
    // 构建订单支持依赖
    const orderSupportDependencies: OrderSupportDependencies = {
      deltaManager: this.deltaManager,
      configLoader: this.configLoader
    };

    // 构建依赖注入对象
    const dependencies: PlaceOrderDependencies = {
      deribitAuth: this.deribitAuth,
      deribitClient: this.deribitClient,
      mockClient: this.mockClient,
      configLoader: this.configLoader,
      orderSupportDependencies: orderSupportDependencies
    };

    // 调用纯函数
    return await placeOptionOrderPure(instrumentName, params, useMockMode, dependencies);
  }

  /**
   * 发送仓位调整通知到企业微信
   * @param accountName 账户名称
   * @param tvId TV信号ID
   * @param status 状态：START, SUCCESS, FAILED
   * @param details 详细信息
   */
  private async sendPositionAdjustmentNotification(
    accountName: string,
    tvId: number,
    status: 'START' | 'SUCCESS' | 'FAILED',
    details: {
      symbol: string;
      action: OptionTradingAction;
      direction: 'buy' | 'sell';
      result?: any;
    }
  ): Promise<void> {
    try {
      // 检查企业微信通知服务是否可用
      if (!wechatNotification.isAvailable()) {
        console.log('📱 WeChat notification not available, skipping position adjustment notification');
        return;
      }

      const statusEmoji = {
        START: '🔄',
        SUCCESS: '✅',
        FAILED: '❌'
      };

      const actionText: Record<OptionTradingAction, string> = {
        open_long: '开多仓',
        open_short: '开空仓',
        close_long: '平多仓',
        close_short: '平空仓',
        reduce_long: '减多仓',
        reduce_short: '减空仓',
        stop_long: '止损多仓',
        stop_short: '止损空仓'
      };

      const directionEmoji = details.direction === 'buy' ? '📈' : '📉';

      let content = `${statusEmoji[status]} **仓位调整通知**

${directionEmoji} **操作**: ${actionText[details.action] || details.action}
📊 **交易对**: ${details.symbol}
🔢 **TV信号ID**: ${tvId}
👤 **账户**: ${accountName}
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

      if (status === 'START') {
        content += `\n📋 **状态**: 开始执行调仓操作`;
      } else if (status === 'SUCCESS') {
        content += `\n📋 **状态**: 调仓操作成功完成`;
        if (details.result?.executedQuantity) {
          content += `\n📦 **执行数量**: ${details.result.executedQuantity}`;
        }
        if (details.result?.message) {
          content += `\n💬 **详情**: ${details.result.message}`;
        }
      } else if (status === 'FAILED') {
        content += `\n📋 **状态**: 调仓操作失败`;
        if (details.result?.message) {
          content += `\n❗ **错误**: ${details.result.message}`;
        }
      }

      // 发送Markdown格式的通知
      await wechatNotification.sendCustomMessage(content, false, accountName);

      console.log(`📱 Position adjustment notification sent to WeChat for account: ${accountName}, status: ${status}`);

    } catch (error) {
      console.error('❌ Failed to send position adjustment notification to WeChat:', error);
      // 通知发送失败不应该影响主要的交易流程，所以这里只记录错误
    }
  }

  /**
   * 发送盈利平仓通知到企业微信
   * @param accountName 账户名称
   * @param tvId TV信号ID
   * @param status 状态：START, SUCCESS, FAILED
   * @param details 详细信息
   */
  private async sendProfitCloseNotification(
    accountName: string,
    tvId: number,
    status: 'START' | 'SUCCESS' | 'FAILED',
    details: {
      symbol: string;
      action: OptionTradingAction;
      direction: 'buy' | 'sell';
      closeRatio: number;
      result?: any;
      instrumentNames?: string[];
    }
  ): Promise<void> {
    try {
      // 检查企业微信通知服务是否可用
      if (!wechatNotification.isAvailable()) {
        console.log('📱 WeChat notification not available, skipping profit close notification');
        return;
      }

      const statusEmoji = {
        START: '💰',
        SUCCESS: '✅',
        FAILED: '❌'
      };

      const actionText: Record<OptionTradingAction, string> = {
        open_long: '开多仓',
        open_short: '开空仓',
        close_long: '平多仓',
        close_short: '平空仓',
        reduce_long: '减多仓',
        reduce_short: '减空仓',
        stop_long: '止损多仓',
        stop_short: '止损空仓'
      };

      const directionEmoji = details.direction === 'buy' ? '📈' : '📉';
      const closeRatioText = details.closeRatio === 1.0 ? '全平' : `${(details.closeRatio * 100).toFixed(1)}%`;

      let content = `${statusEmoji[status]} **盈利平仓通知**

${directionEmoji} **操作**: ${actionText[details.action] || details.action}
📊 **交易对**: ${details.symbol}
📦 **平仓比例**: ${closeRatioText}
🔢 **TV信号ID**: ${tvId}
👤 **账户**: ${accountName}
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

      // 添加合约名称信息
      if (details.instrumentNames && details.instrumentNames.length > 0) {
        content += `\n🎯 **合约名称**: ${details.instrumentNames.join(', ')}`;
      }

      if (status === 'START') {
        content += `\n📋 **状态**: 开始执行盈利平仓操作`;
      } else if (status === 'SUCCESS') {
        content += `\n📋 **状态**: 盈利平仓操作成功完成`;
        if (details.result?.executedQuantity) {
          content += `\n📦 **执行数量**: ${details.result.executedQuantity}`;
        }
        if (details.result?.closeRatio) {
          content += `\n📊 **实际平仓比例**: ${(details.result.closeRatio * 100).toFixed(1)}%`;
        }
        if (details.result?.message) {
          content += `\n💬 **详情**: ${details.result.message}`;
        }
      } else if (status === 'FAILED') {
        content += `\n📋 **状态**: 盈利平仓操作失败`;
        if (details.result?.message) {
          content += `\n❗ **错误**: ${details.result.message}`;
        }
      }

      // 发送Markdown格式的通知
      await wechatNotification.sendCustomMessage(content, false, accountName);

      console.log(`📱 Profit close notification sent to WeChat for account: ${accountName}, status: ${status}`);

    } catch (error) {
      console.error('❌ Failed to send profit close notification to WeChat:', error);
      // 通知发送失败不应该影响主要的交易流程，所以这里只记录错误
    }
  }





  /**
   * 发送止损通知到企业微信
   * @param accountName 账户名称
   * @param tvId TV信号ID
   * @param status 状态：START, SUCCESS, FAILED
   * @param details 详细信息
   */
  private async sendStopLossNotification(
    accountName: string,
    tvId: number,
    status: 'START' | 'SUCCESS' | 'FAILED',
    details: {
      symbol: string;
      action: OptionTradingAction;
      direction: 'buy' | 'sell';
      result?: any;
    }
  ): Promise<void> {
    try {
      // 检查企业微信通知服务是否可用
      if (!wechatNotification.isAvailable()) {
        console.log('📱 WeChat notification not available, skipping stop loss notification');
        return;
      }

      const statusEmoji = {
        START: '🛑',
        SUCCESS: '✅',
        FAILED: '❌'
      };

      const actionText: Record<OptionTradingAction, string> = {
        open_long: '开多仓',
        open_short: '开空仓',
        close_long: '平多仓',
        close_short: '平空仓',
        reduce_long: '减多仓',
        reduce_short: '减空仓',
        stop_long: '止损多仓',
        stop_short: '止损空仓'
      };

      const directionEmoji = details.direction === 'buy' ? '📈' : '📉';

      let content = `${statusEmoji[status]} **止损通知**

${directionEmoji} **操作**: ${actionText[details.action] || details.action}
📊 **交易对**: ${details.symbol}
📦 **止损比例**: 50%
🔢 **TV信号ID**: ${tvId}
👤 **账户**: ${accountName}
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

      if (status === 'START') {
        content += `\n📋 **状态**: 开始执行止损操作`;
      } else if (status === 'SUCCESS') {
        content += `\n📋 **状态**: 止损操作成功完成`;
        if (details.result?.executedQuantity) {
          content += `\n📦 **执行数量**: ${details.result.executedQuantity}`;
        }
        if (details.result?.message) {
          content += `\n💬 **详情**: ${details.result.message}`;
        }
      } else if (status === 'FAILED') {
        content += `\n📋 **状态**: 止损操作失败`;
        if (details.result?.message) {
          content += `\n❗ **错误**: ${details.result.message}`;
        }
      }

      // 发送Markdown格式的通知
      await wechatNotification.sendCustomMessage(content, false, accountName);

      console.log(`📱 Stop loss notification sent to WeChat for account: ${accountName}, status: ${status}`);

    } catch (error) {
      console.error('❌ Failed to send stop loss notification to WeChat:', error);
      // 通知发送失败不应该影响主要的交易流程，所以这里只记录错误
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