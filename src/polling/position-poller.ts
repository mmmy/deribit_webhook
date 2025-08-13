import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { DeltaRecordType } from '../database/types';
import {
  ConfigLoader,
  DeltaManager,
  DeribitAuth,
  DeribitClient,
  MockDeribitClient
} from '../services';
import { executePositionAdjustment } from '../services/position-adjustment';
import { WeChatNotificationService } from '../services/wechat-notification';
import { DeribitOrder } from '../types';

export interface PollingResult {
  accountName: string;
  success: boolean;
  mockMode?: boolean;
  data?: any[];
  error?: string;
  timestamp: string;
}

/**
 * Position polling service - handles automated position monitoring and adjustment
 */
export class PositionPollingService {
  private configLoader: ConfigLoader;
  private deribitAuth: DeribitAuth;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;
  private deltaManager: DeltaManager;
  private wechatNotification: WeChatNotificationService;
  private useMockMode: boolean;

  constructor(
    configLoader?: ConfigLoader,
    deribitAuth?: DeribitAuth,
    deribitClient?: DeribitClient,
    mockClient?: MockDeribitClient,
    deltaManager?: DeltaManager
  ) {
    // 支持依赖注入，但保持向后兼容
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.deribitAuth = deribitAuth || new DeribitAuth();
    this.deribitClient = deribitClient || new DeribitClient();
    this.mockClient = mockClient || new MockDeribitClient();
    this.deltaManager = deltaManager || DeltaManager.getInstance();
    this.wechatNotification = new WeChatNotificationService(this.configLoader);
    this.useMockMode = process.env.USE_MOCK_MODE === 'true';
  }

  /**
   * Poll positions for all enabled accounts
   */
  async pollAllAccountsPositions(): Promise<PollingResult[]> {
    const requestId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      console.log(`🔄 [${requestId}] Starting positions polling for all enabled accounts`);

      const accounts = this.configLoader.getEnabledAccounts();
      if (accounts.length === 0) {
        console.log(`⚠️ [${requestId}] No enabled accounts found for polling`);
        return [];
      }

      const results: PollingResult[] = [];

      for (const account of accounts) {
        try {
          console.log(`📊 [${requestId}] Polling account: ${account.name}`);

          if (this.useMockMode) {
            // Mock mode: generate simulated data
            const mockPositions = this.generateMockPositions();
            
            results.push({
              accountName: account.name,
              success: true,
              mockMode: true,
              data: mockPositions,
              timestamp: new Date().toISOString()
            });

            console.log(`✅ [${requestId}] Mock data generated for ${account.name}: ${mockPositions.length} positions`);
          } else {
            // Real mode: call Deribit API
            const positionsData = await this.fetchRealPositions(account.name, requestId);
            
            if (positionsData.success && positionsData.data) {
              // Analyze positions for delta adjustments
              await this.analyzePositionsForAdjustment(positionsData.data, account.name, requestId);
            }

            results.push(positionsData);
          }

        } catch (accountError) {
          console.error(`❌ [${requestId}] Failed to poll account ${account.name}:`, accountError);
          results.push({
            accountName: account.name,
            success: false,
            error: accountError instanceof Error ? accountError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Summary results
      const successCount = results.filter(r => r.success).length;
      const totalPositions = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.data?.length || 0), 0);

      console.log(`📊 [${requestId}] Polling completed: ${successCount}/${accounts.length} accounts successful, ${totalPositions} total positions`);

      return results;

    } catch (error) {
      console.error(`💥 [${requestId}] Polling error:`, error);
      throw error;
    }
  }

  /**
   * 轮询所有账户的未成交限价订单并执行渐进式策略
   */
  async pollAllAccountsPendingOrders(): Promise<PollingResult[]> {
    const requestId = `order_poll_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      console.log(`🔄 [${requestId}] Starting pending orders polling for all enabled accounts`);

      const accounts = this.configLoader.getEnabledAccounts();
      if (accounts.length === 0) {
        console.log(`⚠️ [${requestId}] No enabled accounts found for pending orders polling`);
        return [];
      }

      const results: PollingResult[] = [];

      for (const account of accounts) {
        try {
          console.log(`📋 [${requestId}] Polling pending orders for account: ${account.name}`);

          if (this.useMockMode) {
            // Mock mode: skip pending orders processing
            results.push({
              accountName: account.name,
              success: true,
              mockMode: true,
              data: [],
              timestamp: new Date().toISOString()
            });
            console.log(`✅ [${requestId}] Mock mode: skipped pending orders for ${account.name}`);
          } else {
            // Real mode: process pending orders
            const orderResult = await this.processPendingOrdersForAccount(account.name, requestId);
            results.push(orderResult);

            // 发送企业微信通知（无论成功还是失败）
            try {
              if (orderResult.data?.length) {
                await this.wechatNotification.sendPendingOrdersNotification(
                  account.name,
                  orderResult.data || [],
                  requestId,
                  orderResult.success,
                  orderResult.error
                );
              }
            } catch (notificationError) {
              console.error(`❌ [${requestId}] Failed to send WeChat notification for account ${account.name}:`, notificationError);
            }
          }

        } catch (accountError) {
          console.error(`❌ [${requestId}] Failed to process pending orders for account ${account.name}:`, accountError);
          const errorMessage = accountError instanceof Error ? accountError.message : 'Unknown error';

          results.push({
            accountName: account.name,
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
          });

          // 发送失败通知
          try {
            await this.wechatNotification.sendPendingOrdersNotification(
              account.name,
              [],
              requestId,
              false,
              errorMessage
            );
          } catch (notificationError) {
            console.error(`❌ [${requestId}] Failed to send failure WeChat notification for account ${account.name}:`, notificationError);
          }
        }
      }

      // Summary results
      const successCount = results.filter(r => r.success).length;
      const totalProcessed = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.data?.length || 0), 0);

      console.log(`📋 [${requestId}] Pending orders polling completed: ${successCount}/${accounts.length} accounts successful, ${totalProcessed} orders processed`);

      return results;

    } catch (error) {
      console.error(`💥 [${requestId}] Pending orders polling error:`, error);
      throw error;
    }
  }

  /**
   * 处理单个账户的未成交限价订单
   */
  private async processPendingOrdersForAccount(accountName: string, requestId: string): Promise<PollingResult> {
    try {
      console.log(`📋 [${requestId}] Processing pending orders for account: ${accountName}`);

      // 1. 查询Delta数据库中的未成交订单记录
      const pendingOrderRecords = this.deltaManager.getRecords({
        account_id: accountName,
        record_type: DeltaRecordType.ORDER
      });

      if (pendingOrderRecords.length === 0) {
        console.log(`📋 [${requestId}] No pending order records found for account: ${accountName}`);
        return {
          accountName,
          success: true,
          data: [],
          timestamp: new Date().toISOString()
        };
      }

      console.log(`📋 [${requestId}] Found ${pendingOrderRecords.length} pending order records for account: ${accountName}`);

      // 2. 获取访问令牌
      await this.deribitAuth.authenticate(accountName);
      const tokenInfo = this.deribitAuth.getTokenInfo(accountName);
      if (!tokenInfo) {
        throw new Error(`Authentication failed for ${accountName}`);
      }

      const processedOrders = [];
      const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');

      // 3. 获取真实的未成交订单
      const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
      const apiConfig = getConfigByEnvironment(isTestEnv);
      const authInfo = createAuthInfo(tokenInfo.accessToken);
      const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

      // 获取所有未成交的限价订单
      const openOrders: DeribitOrder[] = await privateAPI.getOpenOrders({kind: 'option'});
      const limitOrders = openOrders.filter(order => order.order_type === 'limit' && order.order_state === 'open');

      console.log(`📋 [${requestId}] Found ${limitOrders.length} open limit orders for account: ${accountName}`);

      // 4. 处理每个真实的未成交订单
      for (const realOrder of limitOrders) {
        try {
          console.log(`📋 [${requestId}] Processing real order: ${realOrder.instrument_name} (order_id: ${realOrder.order_id})`);

          // 4.1 查找对应的数据库记录
          const orderRecord = pendingOrderRecords.find(record => record.order_id === realOrder.order_id);
          if (!orderRecord) {
            console.log(`⚠️ [${requestId}] No database record found for order ${realOrder.order_id}, skipping`);
            continue;
          }

          // 4.2 获取合约的盘口价差信息
          const optionDetails = await this.deribitClient.getOptionDetails(realOrder.instrument_name);
          if (!optionDetails) {
            console.log(`⚠️ [${requestId}] Failed to get option details for ${realOrder.instrument_name}, skipping`);
            continue;
          }

          // 4.3 计算价差比率
          const { calculateSpreadRatio } = await import('../utils/spread-calculation');
          const spreadRatio = calculateSpreadRatio(optionDetails.best_bid_price, optionDetails.best_ask_price);

          console.log(`📊 [${requestId}] Spread ratio for ${realOrder.instrument_name}: ${(spreadRatio * 100).toFixed(2)}% (threshold: ${(spreadRatioThreshold * 100).toFixed(2)}%)`);

          // 4.4 如果价差在阈值内，执行渐进式策略
          if (spreadRatio <= spreadRatioThreshold) {
            const progressResult = await this.executeProgressiveStrategyForOrder(orderRecord, realOrder, tokenInfo.accessToken, requestId);
            if (progressResult.success) {
              processedOrders.push({
                instrument_name: realOrder.instrument_name,
                order_id: realOrder.order_id,
                action: 'progressive_strategy_executed',
                result: progressResult
              });
            }
          } else {
            console.log(`📊 [${requestId}] Spread too wide for ${realOrder.instrument_name}, skipping progressive strategy`);
          }

        } catch (orderError) {
          console.error(`❌ [${requestId}] Failed to process order ${realOrder.instrument_name}:`, orderError);
        }
      }

      console.log(`✅ [${requestId}] Processed ${processedOrders.length} orders for account: ${accountName}`);

      return {
        accountName,
        success: true,
        data: processedOrders,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [${requestId}] Failed to process pending orders for account ${accountName}:`, error);
      return {
        accountName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 为未成交订单执行渐进式策略
   */
  private async executeProgressiveStrategyForOrder(
    orderRecord: any,
    realOrder: DeribitOrder,
    accessToken: string,
    requestId: string
  ): Promise<{ success: boolean; message?: string; positionInfo?: any }> {
    try {
      console.log(`🎯 [${requestId}] Starting progressive strategy for order: ${realOrder.order_id}`);

      // 1. 获取工具详情
      const instrumentInfo = await this.deribitClient.getInstrument(realOrder.instrument_name);
      if (!instrumentInfo) {
        throw new Error(`Failed to get instrument info for ${realOrder.instrument_name}`);
      }

      // 2. 使用真实订单的方向和数量
      const direction = realOrder.direction; // 'buy' 或 'sell'
      const quantity = realOrder.amount; // 订单数量

      // 3. 执行渐进式限价策略
      const { executeProgressiveLimitStrategy } = await import('../services/progressive-limit-strategy');
      const strategyResult = await executeProgressiveLimitStrategy(
        {
          orderId: realOrder.order_id,
          instrumentName: realOrder.instrument_name,
          direction: direction,
          quantity: quantity,
          initialPrice: realOrder.price, // 使用当前订单价格
          accountName: orderRecord.account_id, // 从数据库记录获取账户名
          instrumentDetail: instrumentInfo,
          timeout: 8000,  // 8秒
          maxStep: 3
        },
        {
          deribitAuth: this.deribitAuth,
          deribitClient: this.deribitClient
        }
      );

      if (strategyResult.success) {
        console.log(`✅ [${requestId}] Progressive strategy completed for order: ${realOrder.order_id}`);

        // 4. 成功后，移除原订单记录
        const deleted = this.deltaManager.deleteRecord(orderRecord.id!);
        console.log(`🗑️ [${requestId}] Deleted order record: ${deleted ? 'success' : 'failed'} (ID: ${orderRecord.id})`);

        // 5. 添加新的仓位记录
        if (strategyResult.positionInfo) {
          const positionRecord = {
            account_id: orderRecord.account_id,
            instrument_name: realOrder.instrument_name,
            target_delta: orderRecord.target_delta,
            move_position_delta: orderRecord.move_position_delta,
            min_expire_days: orderRecord.min_expire_days,
            tv_id: orderRecord.tv_id,
            action: orderRecord.action,
            record_type: DeltaRecordType.POSITION
          };

          const newRecord = this.deltaManager.createRecord(positionRecord);
          console.log(`✅ [${requestId}] Created position record: ID ${newRecord.id} for ${realOrder.instrument_name}`);
        }

        return {
          success: true,
          message: strategyResult.message,
          positionInfo: strategyResult.positionInfo
        };
      } else {
        console.log(`❌ [${requestId}] Progressive strategy failed for order: ${realOrder.order_id} - ${strategyResult.message}`);
        return {
          success: false,
          message: strategyResult.message
        };
      }

    } catch (error) {
      console.error(`❌ [${requestId}] Error executing progressive strategy for order ${realOrder.order_id}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate mock position data for testing
   */
  private generateMockPositions(): any[] {
    const currencies = ['BTC', 'ETH', 'SOL'];
    return currencies.map(currency => ({
      instrument_name: `${currency}-8AUG25-${currency === 'BTC' ? '113000' : currency === 'ETH' ? '3500' : '200'}-C`,
      size: Math.random() * 20 - 10, // -10 to 10
      direction: Math.random() > 0.5 ? 'buy' : 'sell',
      average_price: Math.random() * 0.05,
      mark_price: Math.random() * 0.05,
      unrealized_pnl: (Math.random() - 0.5) * 2,
      delta: (Math.random() - 0.5) * 2
    })).filter(pos => pos.size !== 0); // Only keep non-zero positions
  }

  /**
   * Fetch real position data from Deribit API
   */
  private async fetchRealPositions(accountName: string, requestId: string): Promise<PollingResult> {
    try {
      await this.deribitAuth.authenticate(accountName);
      const tokenInfo = this.deribitAuth.getTokenInfo(accountName);

      if (!tokenInfo) {
        throw new Error(`Authentication failed for ${accountName}`);
      }

      const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
      const apiConfig = getConfigByEnvironment(isTestEnv);
      const authInfo = createAuthInfo(tokenInfo.accessToken);
      const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

      // Get all option positions (not specifying currency returns all currencies' options)
      const allPositions = await privateAPI.getPositions({
        kind: 'option'
      });

      // Only keep positions with size != 0
      const activePositions = allPositions.filter(pos => pos.size !== 0);

      console.log(`✅ [${requestId}] Real data fetched for ${accountName}: ${activePositions.length} active positions`);

      return {
        accountName,
        success: true,
        mockMode: false,
        data: activePositions,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [${requestId}] Failed to fetch positions for ${accountName}:`, error);
      return {
        accountName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze positions for delta adjustments
   */
  private async analyzePositionsForAdjustment(positions: any[], accountName: string, requestId: string): Promise<void> {
    for (const pos of positions) {
      try {
        // Calculate position delta per unit = pos.delta / pos.size
        const positionDelta = pos.delta && pos.size !== 0 ? pos.delta / pos.size : 0;

        // Query Delta database records for this position
        const deltaRecords = this.deltaManager.getRecords({
          account_id: accountName,
          instrument_name: pos.instrument_name
        });

        if (deltaRecords.length > 0) {
          // Find the latest record
          const latestRecord = deltaRecords.sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeB - timeA;
          })[0];

          if (latestRecord.min_expire_days != null && latestRecord.move_position_delta !== undefined) {
            const targetDeltaAbs = Math.abs(latestRecord.target_delta || 0);
            const positionDeltaAbs = Math.abs(positionDelta);

            // If |move_position_delta| < |position delta|, trigger adjustment
            if (targetDeltaAbs < positionDeltaAbs) {
              console.log(`📊 [${requestId}] Position Delta Analysis - ${accountName}:`);
              console.log(`   🎯 Instrument: ${pos.instrument_name}`);
              console.log(`   📈 Position Size: ${pos.size}`);
              console.log(`   🔢 Position Delta: ${pos.delta?.toFixed(4) || 'N/A'}`);
              console.log(`   📐 Delta per Unit: ${positionDelta.toFixed(4)}`);
              console.log(`   🎯 Target Delta: ${latestRecord.target_delta}`);
              console.log(`   📊 Move Position Delta: ${latestRecord.move_position_delta || 0}`);
              console.log(`   ⚖️ Condition: |${latestRecord.move_position_delta || 0}| < |${positionDelta.toFixed(4)}| = ${targetDeltaAbs < positionDeltaAbs ? 'TRUE' : 'FALSE'}`);

              // Send notification to WeChat
              await this.sendAdjustmentNotification(accountName, pos, latestRecord, requestId);

              // Trigger position adjustment
              const tokenInfo = this.deribitAuth.getTokenInfo(accountName);
              if (tokenInfo) {
                const adjustmentResult = await executePositionAdjustment(
                  {
                    requestId,
                    accountName,
                    currentPosition: pos,
                    deltaRecord: latestRecord,
                    accessToken: tokenInfo.accessToken
                  },
                  {
                    deribitClient: this.deribitClient,
                    deltaManager: this.deltaManager,
                    deribitAuth: this.deribitAuth,
                    mockClient: this.mockClient,
                    configLoader: this.configLoader
                  }
                );

                // Send result notifications
                await this.sendAdjustmentResultNotification(accountName, adjustmentResult, requestId);
              }
            }
          }
        }

      } catch (posError) {
        console.warn(`⚠️ [${requestId}] Failed to analyze position ${pos.instrument_name}:`, posError);
      }
    }
  }

  /**
   * Send adjustment start notification to WeChat
   */
  private async sendAdjustmentNotification(accountName: string, position: any, record: any, requestId: string): Promise<void> {
    try {
      const bot = this.configLoader.getAccountWeChatBot(accountName);
      if (bot) {
        const positionDelta = position.delta && position.size !== 0 ? position.delta / position.size : 0;
        
        const notificationContent = `🔄 **Delta 仓位调整开始**
👤 **账户**: ${accountName}
🎯 **合约**: ${position.instrument_name}
📈 **仓位大小**: ${position.size}
🔢 **仓位Delta**: ${position.delta?.toFixed(4) || 'N/A'}
📐 **单位Delta**: ${positionDelta.toFixed(4)}
🎯 **目标Delta**: ${Math.abs(record.target_delta || 0)}
📊 **移动仓位Delta**: ${record.move_position_delta || 0}
📅 **记录创建时间**: ${record.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : '未知'}
🆔 **记录ID**: ${record.id}
🔄 **请求ID**: ${requestId}
⏰ **开始时间**: ${new Date().toLocaleString('zh-CN')}`;

        await bot.sendMarkdown(notificationContent);
        console.log(`📱 [${requestId}] WeChat notification sent for account: ${accountName}`);
      }
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to send WeChat notification for account ${accountName}:`, error);
    }
  }

  /**
   * Send adjustment result notification to WeChat
   */
  private async sendAdjustmentResultNotification(accountName: string, result: any, requestId: string): Promise<void> {
    try {
      const bot = this.configLoader.getAccountWeChatBot(accountName);
      if (!bot) return;

      if (result.success) {
        // Success notification
        const successContent = `✅ **Delta 仓位调整成功**

👤 **账户**: ${accountName}
📊 **调整详情**: ${result.oldInstrument} → ${result.newInstrument}
📈 **仓位变化**: ${result.adjustmentSummary?.oldSize} → ${result.adjustmentSummary?.newDirection} ${result.adjustmentSummary?.newQuantity}
🎯 **目标Delta**: ${result.adjustmentSummary?.targetDelta}
🔄 **请求ID**: ${requestId}
⏰ **完成时间**: ${new Date().toLocaleString('zh-CN')}

🎉 **调整已成功完成！**`;

        await bot.sendMarkdown(successContent);
        console.log(`📱 [${requestId}] Success notification sent for account: ${accountName}`);
      } else {
        // Error notification
        const errorContent = `❌ **Delta 仓位调整失败**

👤 **账户**: ${accountName}
💬 **失败原因**: ${result.reason}
${result.error ? `📋 **错误详情**: ${result.error}` : ''}
🔄 **请求ID**: ${requestId}
⏰ **失败时间**: ${new Date().toLocaleString('zh-CN')}

⚠️ **请检查系统状态并手动处理**`;

        await bot.sendMarkdown(errorContent);
        console.log(`📱 [${requestId}] Error notification sent for account: ${accountName}`);
      }
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to send result notification for account ${accountName}:`, error);
    }
  }
}